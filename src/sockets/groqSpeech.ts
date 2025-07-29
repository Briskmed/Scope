import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { Server as HttpsServer } from 'https';
import type { IncomingMessage } from 'http';
import { createWriteStream, unlink, statSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { promisify } from 'util';
import { pipeline, Writable } from 'stream';
import { createGunzip } from 'zlib';
import fetch, { type Response, type RequestInit } from 'node-fetch';
import FormData, { type Headers as FormDataHeaders } from 'form-data';
import { whisperFallbackService } from '../services/whisperFallbackService';

declare module 'form-data' {
  interface FormData {
    getHeaders(): Record<string, string>;
  }
}

// Remove file-type dependency and use a simpler approach
const AUDIO_MIME_TYPE = 'audio/wav'; // Default to WAV format

const streamPipeline = promisify(pipeline);

// Define types for the Groq API response
interface GroqTranscriptionResponse {
  text: string;
  x_groq?: {
    id: string;
    [key: string]: unknown;
  };
  // Add any additional fields that might be present in the response
  [key: string]: unknown;
}

interface GroqErrorResponse {
  error?: {
    message: string;
  };
}

// Import config
import { config } from '../config';

// Get Groq API key from config
const GROQ_API_KEY = config.groqApiKey;
if (!GROQ_API_KEY) {
  console.warn('GROQ_API_KEY is not set. Speech recognition will be disabled.');
}

// Groq API configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Configuration
const CHUNK_DURATION_MS = 3000; // Process every 3 seconds
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB max audio size
const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB max buffer size before processing
const TEMP_DIR = join(__dirname, '../../temp');
const MAX_RETRIES = 3; // Maximum number of retry attempts for API calls
const RETRY_DELAY_MS = 1000; // Initial retry delay in milliseconds

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

// Track active sessions and their audio data
interface SessionData {
  audioChunks: Buffer[];
  lastProcessed: number;
  tempFile?: string;
  sampleFile?: string; // Field for streaming file
  sampleRate: number;
  writeStream?: Writable;
  isPaused: boolean; // Track if recording is paused
  pendingFinalize: boolean; // Track if we need to finalize processing
  pendingChunks: Buffer[]; // Store chunks while paused
}

const sessions = new Map<string, SessionData>();

// Clean up old sessions
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastProcessed > timeout) {
      cleanupSession(sessionId, session);
    }
  }
}, 60 * 1000); // Check every minute

// Helper function to stream audio data to disk
async function streamToDisk(session: SessionData, audioData: Buffer): Promise<string> {
  if (!session.tempFile) {
    session.tempFile = join(TEMP_DIR, `${uuidv4()}.wav`);
    // Initialize WAV header for the first chunk
    const header = createWavHeader({
      sampleRate: session.sampleRate,
      channels: 1,
      bitDepth: 16,
      format: 1 // PCM
    });
    await fs.writeFile(session.tempFile, header);
    session.writeStream = createWriteStream(session.tempFile, { flags: 'a' });
  }

  return new Promise((resolve, reject) => {
    if (!session.writeStream) {
      return reject(new Error('Write stream not initialized'));
    }

    session.writeStream.write(audioData, (error) => {
      if (error) {
        console.error('Error writing audio chunk:', error);
        reject(error);
      } else {
        resolve(session.tempFile!);
      }
    });
  });
}

// Helper to create WAV header
function createWavHeader(options: {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: number;
}): Buffer {
  const { sampleRate, channels, bitDepth, format } = options;
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = 0; // Will be updated later

  const buffer = Buffer.alloc(44);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // File size - 8
  buffer.write('WAVE', 8);
  
  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(format, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  
  // data subchunk header
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40); // Data size (will be updated)
  
  return buffer;
}

// Update file size in WAV header
async function updateWavHeader(filePath: string, dataSize: number): Promise<void> {
  const fd = await fs.open(filePath, 'r+');
  try {
    // Update file size in RIFF header (bytes 4-7)
    const fileSize = 36 + dataSize;
    const fileSizeBuffer = Buffer.alloc(4);
    fileSizeBuffer.writeUInt32LE(fileSize - 8, 0);
    await fd.write(fileSizeBuffer, 0, 4, 4);
    
    // Update data size in data subchunk (bytes 40-43)
    const dataSizeBuffer = Buffer.alloc(4);
    dataSizeBuffer.writeUInt32LE(dataSize, 0);
    await fd.write(dataSizeBuffer, 0, 4, 40);
  } finally {
    await fd.close();
  }
}

async function cleanupSession(sessionId: string, session: SessionData) {
  try {
    // Close the write stream if it's open
    if (session.writeStream) {
      await new Promise<void>((resolve) => {
        session.writeStream?.end(() => resolve());
      });
    }
    
    // Delete the temp file if it exists
    if (session.tempFile) {
      await fs.unlink(session.tempFile).catch(console.error);
    }
  } catch (error) {
    console.error('Error cleaning up session:', error);
  } finally {
    sessions.delete(sessionId);
  }
}

export function initSpeechHandlers(io: Server) {
  // Create namespace with CORS configuration
  const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
      ? false // No CORS in production by default (should be behind same-origin)
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  };
  
  // Create namespace with CORS configuration
  const speechNsp = io.of('/speech');
  
  // Configure CORS for the namespace
  speechNsp.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    const allowedOrigins = corsOptions.origin;
    
    if (allowedOrigins === false) {
      return next();
    }
    
    if (Array.isArray(allowedOrigins) && origin && allowedOrigins.includes(origin)) {
      return next();
    }
    
    if (typeof allowedOrigins === 'string' && allowedOrigins === origin) {
      return next();
    }
    
    return next(new Error('Not allowed by CORS'));
  });
  
  // Type augmentation for Socket with transport property
  interface CustomSocket extends Socket {
    transport?: {
      name: string;
      on(event: string, callback: () => void): void;
    };
  }

  // Configure CORS for development
  if (process.env.NODE_ENV !== 'production') {
    const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    
    // Type augmentation for Socket.IO engine
    interface Engine {
      on(event: 'connection', callback: (socket: any) => void): void;
    }
    
    interface CustomServer extends Server {
      engine: Engine;
    }
    
    // Add CORS headers for WebSocket connections
    (io as unknown as CustomServer).engine.on('connection', (socket) => {
      const req = socket.request as IncomingMessage;
      const origin = req.headers.origin;
      
      if (origin && allowedOrigins.includes(origin)) {
        const headers = [
          'Access-Control-Allow-Origin',
          origin,
          'Access-Control-Allow-Credentials',
          'true'
        ];
        
        // Use writeHead to set headers if response is available
        const res = (socket as any).res;
        if (res && res.setHeader) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
    });
  }
  
  speechNsp.on('connection', (socket: CustomSocket) => {
    const sessionId = socket.id;
    console.log(`New speech recognition connection: ${sessionId}`);
    
    // Initialize session data with default values
    const sessionData: SessionData = {
      audioChunks: [],
      lastProcessed: Date.now(),
      sampleRate: SAMPLE_RATE,
      tempFile: undefined,
      sampleFile: undefined,
      writeStream: undefined,
      isPaused: false,
      pendingFinalize: false,
      pendingChunks: []
    };
    sessions.set(sessionId, sessionData);
    
    // Log connection details
    console.log(`Client connected: ${socket.id}`);
    
    // Log transport information
    if (socket.transport) {
      console.log(`Transport: ${socket.transport.name}`);
      
      socket.transport.on('upgrade', () => {
        console.log(`Transport upgraded to: ${socket.transport?.name || 'unknown'}`);
      });
    }

    // Handle initialization
    socket.on('init', (data: { sampleRate?: number; language?: string; sessionId?: string }, callback) => {
      try {
        console.log('Received init data:', data);
        
        // Update session data with initialization parameters
        if (data.sampleRate) {
          sessionData.sampleRate = data.sampleRate;
        }
        
        // Prepare response data
        const response = { 
          success: true, 
          sessionId,
          sampleRate: sessionData.sampleRate,
          message: 'Session initialized successfully',
          timestamp: Date.now()
        };
        
        // Acknowledge initialization with callback for reliability
        if (typeof callback === 'function') {
          callback(response);
        }
        
        // Also emit an event for good measure
        socket.emit('init_ack', response);
        
        console.log(`Session ${sessionId} initialized with sample rate: ${sessionData.sampleRate}Hz`);
      } catch (error) {
        console.error('Error during initialization:', error);
        socket.emit('error', { message: 'Failed to initialize session' });
      }
    });

    // Handle incoming audio data (WAV format) in real-time
    socket.on('audio', async (data: any, ack: (response: any) => void) => {
      const logPrefix = `[RT][${sessionId}]`;
      console.log(`${logPrefix} Received audio data event`);
      
      try {
        const session = sessions.get(sessionId);
        if (!session) {
          console.error(`${logPrefix} No session found`);
          return;
        }
        
        // If recording is paused, store the chunks for later processing
        if (session.isPaused) {
          console.log(`${logPrefix} Recording is paused, buffering chunk`);
          if (typeof data.data === 'string' && data.format === 'wav') {
            session.pendingChunks.push(Buffer.from(data.data, 'base64'));
          } else if (Array.isArray(data.data)) {
            session.pendingChunks.push(Buffer.from(data.data));
          }
          
          if (typeof ack === 'function') {
            ack({ status: 'buffered', size: data.data?.length || 0 });
          }
          return;
        }
        
        // Update last processed timestamp
        session.lastProcessed = Date.now();
        
        // Log minimal info to reduce noise
        if (data.sampleRate) {
          console.log(`${logPrefix} Sample rate: ${data.sampleRate}Hz`);
          session.sampleRate = data.sampleRate;
        }
        
        let audioData: Buffer;
        
        try {
          // Decode the audio data
          if (typeof data.data === 'string' && data.format === 'wav') {
            audioData = Buffer.from(data.data, 'base64');
            console.log(`${logPrefix} Decoded ${audioData.length} bytes of WAV data`);
          } else if (Array.isArray(data.data)) {
            audioData = Buffer.from(data.data);
            console.log(`${logPrefix} Converted ${data.data.length} elements to buffer`);
          } else {
            throw new Error(`Invalid audio data format: ${typeof data.data}`);
          }
          
          // Quick validation of WAV header
          const isWav = audioData.length > 12 && 
                       audioData.toString('ascii', 0, 4) === 'RIFF' && 
                       audioData.toString('ascii', 8, 12) === 'WAVE';
          
          if (!isWav) {
            throw new Error('Invalid WAV data: Missing RIFF/WAVE headers');
          }
          
          // Stream to disk
          await streamToDisk(session, audioData);
          
          // Acknowledge receipt immediately to reduce latency
          if (typeof ack === 'function') {
            ack({ status: 'received', size: audioData.length });
          }
          
          // Process the chunk if we have enough data
          const shouldProcess = shouldProcessChunk(session, audioData);
          
          if (shouldProcess && session.tempFile) {
            // Don't await this to allow processing to happen in the background
            // while we continue receiving more audio data
            processAudioChunk(socket, sessionId, session).catch(error => {
              console.error(`${logPrefix} Error in background processing:`, error);
              socket.emit('error', {
                message: 'Background processing error',
                details: error instanceof Error ? error.message : String(error)
              });
            });
          }
          
          // Handle final chunk if this is the last one
          if (session.pendingFinalize) {
            console.log(`${logPrefix} Processing final audio chunk`);
            await processAudioChunk(socket, sessionId, session);
            session.pendingFinalize = false;
          }
          
        } catch (error) {
          console.error(`${logPrefix} Error processing audio data:`, error);
          socket.emit('error', { 
            message: 'Error processing audio data',
            details: error instanceof Error ? error.message : String(error)
          });
        }
        
      } catch (error) {
        console.error(`${logPrefix} Error in audio handler:`, error);
        socket.emit('error', {
          message: 'Error in audio handler',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Handle explicit processing request
    socket.on('process-audio', async () => {
      const session = sessions.get(sessionId);
      if (session && session.audioChunks.length > 0) {
        await processAudioChunk(socket, sessionId, session);
      }
    });

    // Handle pause recording
    socket.on('pause-recording', async (callback: (response: { success: boolean; message: string }) => void) => {
      const sessionId = (socket as any).sessionId;
      if (!sessionId) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'No session ID found' });
        }
        return;
      }
      
      console.log(`[Server][${sessionId}] Pause recording requested`);
      const session = sessions.get(sessionId);
      if (session) {
        session.isPaused = true;
        console.log(`[Server][${sessionId}] Recording paused`);
        if (typeof callback === 'function') {
          callback({ success: true, message: 'Recording paused' });
        }
      } else if (typeof callback === 'function') {
        callback({ success: false, message: 'Session not found' });
      }
    });

    // Handle resume recording
    socket.on('resume-recording', async (callback: (response: { success: boolean; message: string }) => void) => {
      const sessionId = (socket as any).sessionId;
      if (!sessionId) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'No session ID found' });
        }
        return;
      }
      
      console.log(`[Server][${sessionId}] Resume recording requested`);
      const session = sessions.get(sessionId);
      if (session) {
        session.isPaused = false;
        console.log(`[Server][${sessionId}] Recording resumed`);
        
        // Process any buffered chunks from when we were paused
        if (session.pendingChunks.length > 0) {
          console.log(`[Server][${sessionId}] Processing ${session.pendingChunks.length} buffered chunks`);
          for (const chunk of session.pendingChunks) {
            try {
              await streamToDisk(session, chunk);
              console.log(`[Server][${sessionId}] Processed buffered chunk (${chunk.length} bytes)`);
            } catch (error) {
              console.error(`[Server][${sessionId}] Error processing buffered chunk:`, error);
            }
          }
          session.pendingChunks = [];
        }
        
        if (typeof callback === 'function') {
          callback({ success: true, message: 'Recording resumed' });
        }
      } else if (typeof callback === 'function') {
        callback({ success: false, message: 'Session not found' });
      }
    });

    // Handle stop recording (process final chunk but keep connection)
    socket.on('stop-recording', async (options: Record<string, any> = {}, callback?: (response: { 
      success: boolean; 
      message: string; 
      tempFile?: string;
      error?: string;
    }) => void) => {
      const sessionId = (socket as any).sessionId;
      if (!sessionId) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'No session ID found' });
        }
        return;
      }
      
      console.log(`[Server][${sessionId}] Stop recording requested`);
      const session = sessions.get(sessionId);
      
      if (!session) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Session not found' });
        }
        return;
      }
      
      try {
        // Mark that we want to finalize the current chunk
        session.pendingFinalize = true;
        
        // If we have a temp file, process it
        if (session.tempFile) {
          console.log(`[Server][${sessionId}] Processing final audio chunk`);
          await processAudioChunk(socket, sessionId, session);
        }
        
        // Reset for next recording
        session.pendingFinalize = false;
        
        if (typeof callback === 'function') {
          callback({ 
            success: true, 
            message: 'Recording stopped and final chunk processed',
            tempFile: session.tempFile
          });
        }
      } catch (error) {
        console.error(`[Server][${sessionId}] Error stopping recording:`, error);
        if (typeof callback === 'function') {
          callback({ 
            success: false, 
            message: 'Error stopping recording',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });

    // Handle disconnection with cleanup
    socket.on('disconnect', async () => {
      const sessionId = (socket as any).sessionId;
      if (!sessionId) {
        console.log('[Server] Client disconnecting (no session ID)');
        return;
      }
      
      console.log(`[Server][${sessionId}] Client disconnecting`);
      const session = sessions.get(sessionId);
      
      if (session) {
        try {
          // Process any remaining audio before cleaning up
          if (session.tempFile && !session.isPaused) {
            console.log(`[Server][${sessionId}] Processing final audio before disconnect`);
            try {
              await processAudioChunk(socket, sessionId, session);
            } catch (error) {
              console.error(`[Server][${sessionId}] Error processing final audio:`, error);
            }
          }
          
          // Clean up the session
          cleanupSession(sessionId, session);
          console.log(`[Server][${sessionId}] Session cleaned up`);
          
        } catch (error) {
          console.error(`[Server][${sessionId}] Error during disconnect cleanup:`, error);
          // Ensure we still clean up even if there's an error
          if (session) {
            cleanupSession(sessionId, session);
          }
        }
      }
      
      console.log(`[Server][${sessionId}] Client disconnected`);
    });
  });
}

/**
 * Process a complete audio chunk and transcribe it
 * @param socket - The socket connection
 * @param sessionId - The session ID
 * @param session - The session data
 * @throws {Error} If processing fails and should trigger fallback
 */
async function processAudioChunk(socket: Socket, sessionId: string, session: SessionData): Promise<void> {
  console.log(`[${sessionId}] Starting to process audio chunk`);
  
  if (!session.tempFile) {
    const error = new Error('No temporary file to process');
    console.error(`[${sessionId}] ${error.message}`);
    throw error;
  }

  const tempFileToCleanup = session.tempFile;
  
  try {
    // Verify file exists and get stats
    console.log(`[${sessionId}] Checking file: ${tempFileToCleanup}`);
    const stats = await fs.stat(tempFileToCleanup);
    
    if (stats.size < 44) { // Minimum size for a valid WAV header
      const error = new Error(`Audio file is too small (${stats.size} bytes)`);
      console.error(`[${sessionId}] ${error.message}`);
      throw error;
    }
    
    const dataSize = stats.size - 44; // Subtract WAV header size
    console.log(`[${sessionId}] File size: ${stats.size} bytes, data size: ${dataSize} bytes`);
    
    // Update the WAV header with the correct file size
    console.log(`[${sessionId}] Updating WAV header...`);
    await updateWavHeader(tempFileToCleanup, dataSize);
    
    // Log processing start
    console.log(`[${sessionId}] Starting transcription for ${Math.round(stats.size / 1024)} KB audio`);
    
    // Transcribe with retry logic
    const startTime = Date.now();
    let transcript: string | null = null;
    
    try {
      transcript = await transcribeWithRetry(tempFileToCleanup);
    } catch (error) {
      console.error(`[${sessionId}] Transcription failed:`, error instanceof Error ? error.message : 'Unknown error');
      throw error; // Re-throw to trigger fallback
    }
    
    const processingTime = Date.now() - startTime;
    
    if (transcript) {
      console.log(`[${sessionId}] Transcription completed in ${processingTime}ms`);
      console.log(`[${sessionId}] Transcript (first 100 chars): ${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}`);
      
      socket.emit('transcript', { 
        text: transcript,
        isFinal: true,
        source: 'groq',
        processingTime,
        timestamp: new Date().toISOString()
      });
    } else {
      const error = new Error('Received empty transcription result');
      console.warn(`[${sessionId}] ${error.message}`);
      throw error;
    }
    
    // Update last processed time
    session.lastProcessed = Date.now();
    console.log(`[${sessionId}] Audio processing completed successfully`);
  } catch (error) {
    console.error('Error processing audio:', error);
    socket.emit('error', 'Failed to process audio');
  }
}

// Check if we should process the current audio chunk
function shouldProcessChunk(session: SessionData, audioData: Buffer): boolean {
  // Always process if we don't have a temp file yet
  if (!session.tempFile) {
    console.log('[RT] No temp file, processing chunk');
    return true;
  }
  
  try {
    const stats = statSync(session.tempFile);
    const currentSize = stats.size + audioData.length;
    const timeSinceLastProcess = Date.now() - (session.lastProcessed || 0);
    
    // For real-time processing, we want to process chunks more frequently
    // Calculate the minimum audio duration we need before processing (e.g., 500ms of audio)
    const bytesPerSecond = session.sampleRate * 2; // 16-bit = 2 bytes per sample
    const minAudioBytes = (bytesPerSecond * 0.5); // 500ms of audio
    
    // Log the decision factors
    console.log(`[RT] Chunk processing check:`);
    console.log(`[RT] - Current file size: ${stats.size} bytes (${(stats.size/bytesPerSecond).toFixed(2)}s)`);
    console.log(`[RT] - New chunk size: ${audioData.length} bytes`);
    console.log(`[RT] - Time since last process: ${timeSinceLastProcess}ms`);
    
    // Process if we have enough audio data or if this is the first chunk with data
    const shouldProcess = (
      stats.size >= minAudioBytes || // We have enough audio data
      (session.lastProcessed === 0 && stats.size > 0) || // First chunk with data
      session.pendingFinalize // Final chunk needs processing
    );
    
    if (shouldProcess) {
      console.log(`[RT] Processing chunk: ${stats.size} bytes (${(stats.size/bytesPerSecond).toFixed(2)}s of audio)`);
    }
    
    return shouldProcess;
    
  } catch (error) {
    console.error('[RT] Error checking chunk processing:', error);
    // Default to processing if there's an error to prevent hanging
    return true;
  }
}

// Transcribe audio with retry logic
async function transcribeWithRetry(audioPath: string, maxRetries = MAX_RETRIES): Promise<string | null> {
  let lastError: Error | null = null;
  
  // Don't retry if maxRetries is 0 or negative
  if (maxRetries <= 0) {
    maxRetries = 1;
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await transcribeAudio(audioPath);
      if (attempt > 1) {
        console.log(`Successfully transcribed after ${attempt} attempts`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on these errors
      const nonRetryableErrors = [
        'API key not configured',
        'Invalid response format',
        'invalid file format',
        'file not found'
      ];
      
      if (nonRetryableErrors.some(msg => error.message.includes(msg))) {
        console.warn(`Non-retryable error: ${error.message}`);
        break;
      }
      
      // Exponential backoff with jitter
      if (attempt < maxRetries) {
        const baseDelay = Math.min(
          RETRY_DELAY_MS * Math.pow(2, attempt - 1),
          30000 // Max 30 seconds
        );
        
        // Add jitter (80-120% of base delay)
        const jitter = 0.8 + Math.random() * 0.4;
        const delay = Math.round(baseDelay * jitter);
        
        console.warn(`Attempt ${attempt}/${maxRetries} failed (${error.message}). Retrying in ${delay}ms...`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (timeoutError) {
          console.warn('Retry delay was interrupted:', timeoutError);
          // Continue with the next attempt
        }
      }
    }
  }
  
  // If we get here, all retries failed
  const errorMessage = lastError?.message || 'Unknown error';
  console.error(`Transcription failed after ${maxRetries} attempts. Last error: ${errorMessage}`);
  const finalError = lastError || new Error('Transcription failed after multiple attempts');
  throw finalError;
}

// Core transcription function with fallback to local Whisper
async function transcribeAudio(audioPath: string): Promise<string | null> {
  if (!GROQ_API_KEY) {
    console.warn('Groq API key not configured, using fallback');
    throw new Error('Groq API key not configured');
  }

  try {
    const fs = await import('fs/promises');
    const formData = new FormData();
    
    // Check if file exists and is readable
    try {
      await fs.access(audioPath, fs.constants.R_OK);
    } catch (error) {
      console.error(`Audio file not found or not readable: ${audioPath}`);
      throw new Error('File not found or not readable');
    }
    
    // Get file stats to check size
    const stats = await fs.stat(audioPath);
    if (stats.size > MAX_AUDIO_SIZE) {
      throw new Error(`Audio file too large (${stats.size} > ${MAX_AUDIO_SIZE} bytes)`);
    }
    
    // Read the file content as a buffer
    const audioBuffer = await fs.readFile(audioPath);
    
    // Set up form data for the API request
    formData.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType: 'audio/wav',
      knownLength: audioBuffer.length
    });
    formData.append('model', 'whisper-large-v3');
    
    // Log the request
    console.log(`[Groq] Sending audio for transcription (${(stats.size / 1024).toFixed(2)} KB)`);
    
    // Make the API request with proper type casting for FormData
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData as unknown as URLSearchParams | string
    });
    
    // Check if the request was successful
    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json() as GroqErrorResponse | { message?: string };
        errorMessage = (errorData as GroqErrorResponse).error?.message || 
                     (errorData as { message?: string }).message || 
                     errorMessage;
      } catch (e) {
        // Ignore JSON parsing errors, use default error message
      }
      throw new Error(errorMessage);
    }
    
    // Parse the response
    const data = await response.json() as GroqTranscriptionResponse;
    
    if (!data || typeof data.text !== 'string') {
      throw new Error('Invalid response format from Groq API');
    }
    
    console.log(`[Groq] Transcription successful (${data.text.length} chars)`);
    return data.text;
    
  } catch (error: any) {
    console.error('Error in Groq transcription:', error);
    
    // Fall back to local Whisper if available
    try {
      if (whisperFallbackService) {
        console.log('Falling back to local Whisper service...');
        // Read the audio file as a buffer for the fallback service
        const audioBuffer = await fs.readFile(audioPath);
        const result = await whisperFallbackService.transcribe(audioBuffer, 16000);
        if (result && result.text) {
          console.log('Local Whisper transcription successful');
          return result.text;
        }
      }
    } catch (fallbackError) {
      console.error('Local Whisper fallback failed:', fallbackError);
      // Continue to throw the original error
    }
    
    // Re-throw the original error if fallback fails
    throw error;
  }
}

export default initSpeechHandlers;
