import io, { type Socket } from 'socket.io-client';

export class SpeechService {
  private socket: Socket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private onTranscript: ((text: string) => void) | null = null;
  private isRecording = false;

  constructor(private readonly serverUrl: string = 'http://localhost:3001') {}

  async startRecognition(onTranscript: (text: string) => void): Promise<void> {
    this.onTranscript = onTranscript;

    try {
      console.log(`Connecting to speech recognition service at ${this.serverUrl}`);
      
      // Initialize WebSocket connection with reconnection and timeout
      // Connect to the speech namespace
      this.socket = io(`${this.serverUrl}/speech`, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 5000
      });
      
      // Connection established
      this.socket.on('connect', () => {
        console.log('Connected to speech recognition service');
      });
      
      // Handle connection errors
      this.socket.on('connect_error', (error: Error) => {
        console.error('Connection to speech service failed:', error);
        this.cleanup();
        throw new Error('Could not connect to speech recognition service');
      });
      
      // Handle transcriptions
      this.socket.on('transcript', (data: { text: string }) => {
        console.log('Received transcript:', data.text);
        if (this.onTranscript) {
          this.onTranscript(data.text);
        }
      });
      
      // Handle disconnections
      this.socket.on('disconnect', (reason: string) => {
        console.warn('Disconnected from speech service:', reason);
        if (reason === 'io server disconnect') {
          // The server explicitly closed the connection
          this.cleanup();
        }
      });

      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Set up audio processing
      const source = this.audioContext.createMediaStreamSource(this.stream);
      const destination = this.audioContext.createMediaStreamDestination();
      source.connect(destination);

      // Create media recorder
      this.mediaRecorder = new MediaRecorder(destination.stream);
      
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.socket?.connected) {
          // Convert the audio data to the format expected by Moshi
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await event.data.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to 24kHz mono (Moshi's expected format)
          const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 24000, 24000);
          const source = offlineCtx.createBufferSource();
          source.buffer = audioBuffer;
          
          // Create a mono channel
          const monoScriptNode = offlineCtx.createScriptProcessor(4096, 1, 1);
          monoScriptNode.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < input.length; i++) {
              output[i] = input[i];
            }
          };
          
          source.connect(monoScriptNode);
          monoScriptNode.connect(offlineCtx.destination);
          
          // Start processing
          source.start();
          const renderedBuffer = await offlineCtx.startRendering();
          
          // Convert to 16-bit PCM
          const pcmData = new Int16Array(renderedBuffer.length);
          for (let i = 0; i < renderedBuffer.length; i++) {
            const s = Math.max(-1, Math.min(1, renderedBuffer.getChannelData(0)[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Send the PCM data to the server
          this.socket.emit('audio', pcmData.buffer);
        }
      };

      // Start recording
      this.mediaRecorder.start(300); // Send data every 300ms
      this.isRecording = true;
      
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.cleanup();
      throw error;
    }
  }

  stopRecognition(): void {
    this.cleanup();
  }

  private cleanup(): void {
    console.log('Cleaning up speech recognition resources');
    
    // Stop media recorder if active
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.ondataavailable = null;
      } catch (error) {
        console.error('Error stopping media recorder:', error);
      }
    }
    
    // Stop all media tracks
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => {
          track.stop();
          this.stream?.removeTrack(track);
        });
      } catch (error) {
        console.error('Error stopping media tracks:', error);
      }
    }
    
    // Close socket connection
    if (this.socket) {
      try {
        this.socket.off('connect');
        this.socket.off('connect_error');
        this.socket.off('disconnect');
        this.socket.off('transcript');
        this.socket.disconnect();
      } catch (error) {
        console.error('Error disconnecting socket:', error);
      }
    }
    
    // Clean up audio context
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(console.error);
      }
    }
    
    // Reset state
    this.isRecording = false;
    this.mediaRecorder = null;
    this.stream = null;
    this.socket = null;
    this.audioContext = null;
    
    console.log('Speech recognition cleanup complete');
  }

  isRecordingActive(): boolean {
    return this.isRecording;
  }
}
