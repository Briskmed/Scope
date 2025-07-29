import { Server, Socket } from 'socket.io';
import { Groq } from 'groq-sdk';
import { Readable } from 'stream';

interface GroqConfig {
  apiKey: string;
  model?: string;
  language?: string;
}

export class GroqHandler {
  private io: Server;
  private groq: Groq;
  private config: GroqConfig;
  private activeSessions: Map<string, boolean> = new Map();
  private audioBuffers: Map<string, Buffer[]> = new Map();
  private readonly CHUNK_DURATION_MS = 3000; // Process every 3 seconds

  constructor(io: Server, config: GroqConfig) {
    this.io = io;
    this.groq = new Groq({
      apiKey: config.apiKey,
    });
    this.config = {
      model: 'whisper-large-v3',
      language: 'en',
      ...config
    };
  }

  public initialize(): void {
    const namespace = this.io.of('/groq-speech');

    namespace.on('connection', (socket: Socket) => {
      const sessionId = socket.id;
      console.log(`New Groq speech connection: ${sessionId}`);
      this.activeSessions.set(sessionId, true);
      this.audioBuffers.set(sessionId, []);

      // Process audio chunks periodically
      const processInterval = setInterval(async () => {
        const buffers = this.audioBuffers.get(sessionId) || [];
        if (buffers.length === 0) return;

        // Clear buffers for new chunks
        this.audioBuffers.set(sessionId, []);
        
        try {
          const combinedBuffer = Buffer.concat(buffers);
          const transcript = await this.transcribeAudio(combinedBuffer, 'wav');
          
          if (transcript) {
            socket.emit('transcript', { 
              text: transcript,
              isFinal: true
            });
          }
        } catch (error) {
          console.error('Error processing audio with Groq:', error);
          socket.emit('error', { message: 'Error processing audio' });
        }
      }, this.CHUNK_DURATION_MS);

      socket.on('audio', (data: { audio: string; isFinal?: boolean }) => {
        if (!this.activeSessions.get(sessionId)) return;
        
        try {
          const audioBuffer = Buffer.from(data.audio, 'base64');
          const buffers = this.audioBuffers.get(sessionId) || [];
          buffers.push(audioBuffer);
          this.audioBuffers.set(sessionId, buffers);
          
          // Send interim empty result to keep the connection alive
          socket.emit('transcript', { 
            text: '', 
            isFinal: false 
          });
        } catch (error) {
          console.error('Error buffering audio:', error);
        }
      });

      socket.on('disconnect', () => {
        console.log(`Groq speech connection closed: ${sessionId}`);
        this.activeSessions.delete(sessionId);
        this.audioBuffers.delete(sessionId);
        clearInterval(processInterval);
      });
    });
  }

  private async transcribeAudio(audioBuffer: Buffer, format: string): Promise<string | null> {
    try {
      const base64Audio = audioBuffer.toString('base64');
      
      const response = await this.groq.audio.transcriptions.create({
        file: {
          name: `audio.${format}`,
          data: base64Audio,
          type: `audio/${format}`
        },
        model: this.config.model!,
        language: this.config.language,
        response_format: 'json',
        temperature: 0,
      });

      return response.text || '';
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  public close(): void {
    this.activeSessions.clear();
    this.audioBuffers.clear();
  }
}

// Helper to handle FormData in Node.js
class FormData {
  private boundary: string;
  private chunks: Buffer[] = [];

  constructor() {
    this.boundary = `----WebKitFormBoundary${Math.random().toString(16).substring(2)}`;
  }

  append(name: string, value: any, filename?: string): void {
    let header = `--${this.boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"`;
    
    if (filename) {
      header += `; filename="${filename}"`;
    }
    
    header += '\r\n';
    
    if (value instanceof Blob) {
      header += `Content-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`;
      this.chunks.push(Buffer.from(header));
      this.chunks.push(Buffer.from(value as any));
    } else {
      header += '\r\n';
      this.chunks.push(Buffer.from(header));
      this.chunks.push(Buffer.from(String(value)));
    }
    
    this.chunks.push(Buffer.from('\r\n'));
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': `multipart/form-data; boundary=${this.boundary}`,
    };
  }

  getBody(): Buffer {
    const end = `--${this.boundary}--\r\n`;
    return Buffer.concat([...this.chunks, Buffer.from(end)]);
  }
}

export default GroqHandler;
