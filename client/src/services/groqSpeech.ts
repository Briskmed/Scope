// Using default import for socket.io-client
import io from 'socket.io-client';
import { AudioPreprocessor, floatTo16BitPCM } from '../utils/audioPreprocessor';

type Socket = ReturnType<typeof io>;

// Type for connection status
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'paused' | 'disconnected' | 'error';

// Interface for the speech configuration
interface GroqSpeechConfig {
  serverUrl: string;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  sampleRate?: number;
  bufferSize?: number;
}

// Audio chunk interface
interface AudioChunk {
  data: Int16Array;
  timestamp: number;
}

// WebSocket message types
type SocketMessage =
  | { type: 'audio'; data: Int16Array }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'error'; error: string };

export interface SpeechRecognitionOptions {
  // Server configuration
  serverUrl?: string;
  
  // Audio configuration
  sampleRate?: number;
  bufferSize?: number;
  language?: string;
  model?: string;
  
  // Recognition behavior
  interimResults?: boolean;
  continuous?: boolean;
  maxAlternatives?: number;
  autoStart?: boolean;
  debug?: boolean;
  
  // Event handlers
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResult?: (text: string, isFinal: boolean) => void; // Alias for onTranscript
  onError?: (error: Error) => void;
  onAudioLevel?: (level: number) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onSessionId?: (id: string) => void;
  onDebugInfo?: (info: Record<string, any>) => void;
  
  // Audio processing
  preEmphasis?: number;
  silenceThreshold?: number;
  speechThreshold?: number;
  silenceDuration?: number;
  maxChunkDuration?: number;
}

export class GroqSpeechService {
  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isRecording = false;
  private sessionId: string | null = null;
  private status: ConnectionStatus = 'disconnected';
  private options: SpeechRecognitionOptions;
  private audioPreprocessor: AudioPreprocessor | null = null;
  private audioQueue: AudioChunk[] = [];
  private processInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private lastAudioTime = 0;
  private silenceThreshold = 0.01; // Threshold for voice activity detection
  private silenceDuration = 0;
  private readonly SILENCE_TIMEOUT = 1000; // ms of silence before stopping
  private readonly CHUNK_DURATION = 3000; // ms
  private currentChunk: Int16Array[] = [];
  private chunkStartTime = 0;

  constructor(options: SpeechRecognitionOptions = {}) {
    this.options = {
      sampleRate: 16000,
      bufferSize: 4096,
      language: 'en-US',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      ...options
    };
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    if (this.options.onStatusChange) {
      this.options.onStatusChange(status);
    }
  }

  private handleError(error: Error): void {
    console.error('GroqSpeech Error:', error);
    this.options.onError?.(error);
    this.setStatus('error');
  }

  async startRecognition(): Promise<void> {
    try {
      this.setStatus('connecting');

      // Get user media stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.options.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      // Initialize audio preprocessor
      this.audioPreprocessor = new AudioPreprocessor(
        this.options.sampleRate,
        this.options.bufferSize
      );

      await this.startAudioProcessing(this.stream);

      // Set up WebSocket connection
      await this.initializeSocket();

    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async startAudioProcessing(stream: MediaStream): Promise<void> {
    try {
      console.log('Starting audio processing with sample rate:', this.options.sampleRate);
      
      // Create audio preprocessor
      this.audioPreprocessor = new AudioPreprocessor(this.options.sampleRate, this.options.bufferSize);
      
      // Set up audio processing callback
      this.audioPreprocessor.setProcessCallback((audioData: Float32Array) => {
        // Log the first few samples for debugging
        if (this.options.debug) {
          console.debug('Processing audio chunk:', audioData.slice(0, 5), '...');
        }
        this.processAudioChunk(audioData);
      });

      // Initialize and start the audio preprocessor
      await this.audioPreprocessor.initialize();
      console.log('Audio preprocessor initialized');
      
      await this.audioPreprocessor.start(stream);
      console.log('Audio processing started');
      
      this.isRecording = true;
      this.setStatus('connected');
      
      // Start processing the audio queue
      this.startProcessingQueue();
      console.log('Audio queue processing started');
      
    } catch (error) {
      console.error('Error starting audio processing:', error);
      this.handleError(new Error('Failed to start audio processing'));
      throw error;
    }
  }

  private processAudioChunk(audioData: Float32Array): void {
    if (!this.isRecording) return;
    
    // Convert float32 to int16
    const int16Data = floatTo16BitPCM(audioData);
    
    // Add to current chunk
    this.currentChunk.push(int16Data);
    
    // Check if we've reached the chunk duration or max size
    const currentTime = Date.now();
    const chunkDuration = currentTime - (this.chunkStartTime || currentTime);
    const chunkSize = this.currentChunk.reduce((acc, chunk) => acc + chunk.length, 0);
    
    if (chunkDuration >= this.CHUNK_DURATION || chunkSize >= 1024 * 50) { // 50KB or chunk duration
      this.processFullChunk();
      this.chunkStartTime = currentTime;
    } else if (!this.chunkStartTime) {
      this.chunkStartTime = currentTime;
    }
    this.lastAudioTime = currentTime;
  }
  
  private async processFullChunk(): Promise<void> {
    if (this.currentChunk.length === 0) return;
    
    if (this.options.debug) {
      console.log('Processing full audio chunk, number of chunks:', this.currentChunk.length);
    }
    
    try {
      // Concatenate all chunks
      const totalLength = this.currentChunk.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Int16Array(totalLength);
      let offset = 0;
      
      for (const chunk of this.currentChunk) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Create WAV data with proper headers
      const wavData = this.createWavBuffer(combined, this.options.sampleRate || 16000);
      
      // Add to audio queue if we're still recording
      if (this.isRecording) {
        this.audioQueue.push({
          data: new Int16Array(wavData), // Convert ArrayBuffer to Int16Array
          timestamp: Date.now()
        });
      }
      
      // Clear current chunk
      this.currentChunk = [];
    } catch (error) {
      console.error('Error processing full chunk:', error);
      if (this.isRecording) {
        this.handleError(new Error('Failed to process audio chunk'));
      }
    }
  }
  
  private async stopAudioProcessing(): Promise<void> {
    // Process any remaining audio data
    if (this.currentChunk.length > 0) {
      this.processFullChunk();
    }
    
    // Clean up audio preprocessor
    if (this.audioPreprocessor) {
      this.audioPreprocessor.cleanup();
      this.audioPreprocessor = null;
    }
    
    // Stop the processing interval
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    // Send stop message to server
    if (this.socket?.connected) {
      this.socket.emit('stop');
    }
  }

  /**
   * Pause audio recording and processing
   */
  public async pauseRecognition(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    // Pause audio processing
    this.isRecording = false;
    this.setStatus('paused');

    // Pause audio tracks if available
    if (this.stream) {
      this.stream.getTracks().forEach(track => (track.enabled = false));
    }

    // Notify server about pause
    if (this.socket && this.socket.connected) {
      this.socket.emit('pause');
    }
  }

  /**
   * Resume audio recording and processing after a pause
   */
  public async resumeRecognition(): Promise<void> {
    if (this.isRecording || !this.socket) {
      return;
    }

    // Resume audio tracks if available
    if (this.stream) {
      this.stream.getTracks().forEach(track => (track.enabled = true));
    }

    // Resume processing
    this.isRecording = true;
    this.setStatus('connected');

    // Notify server about resume
    if (this.socket.connected) {
      this.socket.emit('resume');
    }
  }

  private async setupAudioProcessing(): Promise<void> {
    if (!this.audioContext || !this.socket) return;

    try {
      // Add the worklet module
      await this.audioContext.audioWorklet.addModule('/audioWorkletProcessors.js');
      
      // Create an audio worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          sampleRate: this.options.sampleRate,
          bufferSize: this.options.bufferSize
        }
      });

      // Handle messages from the worklet
      this.workletNode.port.onmessage = (event) => {
        const { type, level, error } = event.data;
        
        switch (type) {
          case 'audioLevel':
            if (this.options.onAudioLevel && level !== undefined) {
              this.options.onAudioLevel(level);
            }
            break;
            
          case 'error':
            this.handleError(new Error(error || 'Unknown error in audio worklet'));
            break;
            
          default:
            if (this.options.debug) {
              console.log('Audio worklet message:', event.data);
            }
        }
      };

      // Connect the audio processing graph
      const source = this.audioContext.createMediaStreamSource(this.stream!);
      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      
      // Set up audio data handling
      this.workletNode.port.postMessage({
        type: 'start',
        sampleRate: this.options.sampleRate,
        bufferSize: this.options.bufferSize
      });
      
    } catch (error) {
      console.error('Error setting up audio worklet:', error);
      this.handleError(error as Error);
      throw error;
    }
  }

  private async initializeSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        console.log('WebSocket already connected');
        resolve();
        return;
      }

      try {
        const wsUrl = process.env.REACT_APP_WS_URL || 'http://localhost:3001';
        console.log(`Connecting to WebSocket server at: ${wsUrl}/speech`);
        
        // Initialize WebSocket connection with proper typing
        this.socket = io(`${wsUrl}/speech`, {
          path: '/socket.io',
          transports: ['websocket'],
          withCredentials: true,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          timeout: 15000,
          autoConnect: true,
          forceNew: true,
          query: {
            sampleRate: this.options.sampleRate,
            language: this.options.language || 'en-US',
            clientType: 'web',
            version: '1.0.0'
          }
        });

        // Log connection state changes
        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected, transport:', this.socket?.io.engine.transport.name);
        });

        this.socket.io.on('reconnect_attempt', (attempt: number) => {
          console.log(`Attempting to reconnect (${attempt})...`);
        });

        this.socket.io.on('reconnect_failed', () => {
          console.error('Failed to reconnect WebSocket');
          reject(new Error('Failed to establish WebSocket connection'));
        });

        // Connection established
        this.socket.on('connect', () => {
          console.log('✅ Connected to speech recognition service');
          this.setStatus('connected');
          
          // Send initialization message with acknowledgment callback
          this.socket?.emit('init', 
            {
              sampleRate: this.options.sampleRate,
              language: this.options.language,
              sessionId: this.sessionId,
              timestamp: Date.now()
            },
            (response: { success: boolean; sessionId?: string; message?: string }) => {
              // This is the acknowledgment callback
              if (response?.success) {
                if (response.sessionId) {
                  this.sessionId = response.sessionId;
                  this.options.onSessionId?.(response.sessionId);
                }
                console.log('Server initialized via callback:', response.message || 'Success');
                resolve();
              } else {
                reject(new Error(response?.message || 'Failed to initialize server session'));
              }
            }
          );
          
          // Also listen for the event-based acknowledgment
          const ackHandler = (data: { success: boolean; sessionId?: string; message?: string }) => {
            if (data.success) {
              console.log('Server initialized via event:', data.message || 'Success');
              // Don't resolve here as we're using the callback
            }
          };
          
          this.socket?.on('init_ack', ackHandler);
          
          // Clean up the event listener if the promise is settled
          const cleanup = () => this.socket?.off('init_ack', ackHandler);
          resolve();
        });

        // Handle transcript messages
        this.socket.on('transcript', (data: { text: string; isFinal: boolean; sessionId?: string }) => {
          try {
            if (data.sessionId && !this.sessionId) {
              this.sessionId = data.sessionId;
              this.options.onSessionId?.(data.sessionId);
              console.log('Session ID received:', data.sessionId);
            }
            
            if (this.options.debug) {
              console.log('📝 Received transcript:', data);
            }
            
            // Notify both onResult and onTranscript for backward compatibility
            this.options.onResult?.(data.text, data.isFinal);
            this.options.onTranscript?.(data.text, data.isFinal);
            
          } catch (error) {
            console.error('Error in transcript handler:', error);
            this.handleError(error as Error);
          }
        });

        // Debug logging for all socket events
        const debugEvents = [
          'connect', 'disconnect', 'connect_error', 'error', 
          'message', 'audio', 'transcript', 'status', 'init', 'session'
        ] as const;
        
        debugEvents.forEach(event => {
          this.socket?.on(event, (...args: unknown[]) => {
            if (this.options.debug) {
              console.debug(`[WebSocket ${event}]`, ...args);
            }
          });
        });

        // Handle disconnection
        this.socket.on('disconnect', (reason: string) => {
          console.log(`❌ Disconnected from speech recognition service: ${reason}`);
          this.setStatus('disconnected');
          
          // Attempt to reconnect if we were recording
          if (this.isRecording) {
            console.log('Attempting to reconnect in 2 seconds...');
            setTimeout(() => {
              console.log('Attempting to reconnect...');
              this.initializeSocket().catch(console.error);
            }, 2000);
          }
        });

        // Handle connection errors
        this.socket.on('connect_error', (error: Error) => {
          console.error('❌ WebSocket connection error:', error);
          this.setStatus('error');
          this.handleError(error);
          reject(error);
        });

        this.socket.on('error', (error: Error) => {
          console.error('WebSocket error:', error);
          this.handleError(error);
          reject(error);
        });
      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  private detectVoiceActivity(audioData: Float32Array): boolean {
    if (!audioData || !audioData.length) return false;
    
    // Simple energy-based VAD
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const energy = sum / audioData.length;
    return energy > this.silenceThreshold;
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.debug('[AudioQueue] Already processing, skipping');
      return;
    }
    
    if (!this.audioQueue.length) {
      console.debug('[AudioQueue] Queue is empty, nothing to process');
      return;
    }
    
    this.isProcessing = true;
    const chunk = this.audioQueue.shift();
    
    if (!chunk) {
      console.debug('[AudioQueue] No chunk available after shift');
      this.isProcessing = false;
      return;
    }
    
    console.log(`[AudioQueue] Processing chunk: timestamp=${chunk.timestamp}, size=${chunk.data.length} samples`);
    
    // Ensure socket is connected and initialized
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Socket not connected, requeuing chunk');
      this.audioQueue.unshift(chunk);
      this.isProcessing = false;
      return;
    }
    
    if (!this.sessionId) {
      console.warn('[WebSocket] No session ID, requeuing chunk');
      this.audioQueue.unshift(chunk);
      this.isProcessing = false;
      return;
    }

    try {
      console.log(`[WAV] Creating WAV buffer from ${chunk.data.length} PCM samples`);
      const wavBuffer = this.createWavBuffer(chunk.data, this.options.sampleRate || 16000);
      console.log(`[WAV] Created WAV buffer: ${wavBuffer.byteLength} bytes`);
      
      // Log first few bytes of WAV header for verification
      const headerView = new DataView(wavBuffer, 0, Math.min(16, wavBuffer.byteLength));
      const headerBytes = Array.from({length: 16}, (_, i) => 
        headerView.getUint8(i).toString(16).padStart(2, '0')
      ).join(' ');
      console.log(`[WAV] Header bytes: ${headerBytes}`);
      
      // Convert ArrayBuffer to base64 string for reliable transmission
      console.log('[Base64] Converting to base64...');
      const base64Data = this.arrayBufferToBase64(wavBuffer);
      console.log(`[Base64] Converted to ${base64Data.length} characters`);
      
      // Prepare audio data to send
      const audioData = {
        data: base64Data,
        timestamp: chunk.timestamp,
        sampleRate: this.options.sampleRate,
        format: 'wav',
        chunkSize: chunk.data.length,
        wavSize: wavBuffer.byteLength,
        base64Size: base64Data.length
      };
      
      console.log('[WebSocket] Sending audio data:', {
        timestamp: audioData.timestamp,
        sampleRate: audioData.sampleRate,
        chunkSize: audioData.chunkSize,
        wavSize: audioData.wavSize,
        base64Size: audioData.base64Size
      });
      
      // Send WAV data to server as base64 string
      this.socket.emit('audio', audioData);
      
      console.log(`[WebSocket] Sent WAV audio chunk: ${base64Data.length} base64 chars`);
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      // Requeue the chunk if there was an error
      this.audioQueue.unshift(chunk);
    } finally {
      this.isProcessing = false;
    }
  }

  private startProcessingQueue(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }
    // Process audio queue every 100ms
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 100);
  }

  async stopRecognition(): Promise<void> {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    
    try {
      // Stop audio processing
      await this.stopAudioProcessing();
      
      // Stop audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }
      
      // Close WebSocket
      if (this.socket) {
        try {
          this.socket.off(); // Remove all event listeners
          this.socket.disconnect();
        } catch (error: unknown) {
          console.warn('Error disconnecting socket:', error);
        } finally {
          this.socket = null;
        }
      }
      
      // Clear processing queue and chunks
      this.audioQueue = [];
      this.currentChunk = [];
      this.chunkStartTime = 0;
      
      // Reset state
      this.silenceDuration = 0;
      this.lastAudioTime = 0;
      
      this.setStatus('disconnected');
    } catch (error: unknown) {
      console.error('Error during stopRecognition:', error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Helper function to write strings to the buffer
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
  
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private createWavBuffer(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1; // Mono
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    
    // Create buffer with WAV header (44 bytes) + audio data
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // Write WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    
    // fmt subchunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    
    // data subchunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write PCM data
    const pcmView = new Int16Array(buffer, 44);
    pcmView.set(pcmData);
    
    return buffer;
  }
}

export default GroqSpeechService;
