// AudioPreprocessor - Handles audio processing using AudioWorklet with ScriptProcessor fallback

// Utility functions
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

export function convertToWav(buffer: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * bytesPerSample;
  
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  
  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  
  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // Data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write the PCM samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  return arrayBuffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// AudioPreprocessor - Handles audio processing using AudioWorklet with ScriptProcessor fallback
export class AudioPreprocessor {
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sampleRate: number;
  private bufferSize: number;
  private isInitialized = false;
  private processCallback: ((audioData: Float32Array) => void) | null = null;
  private workletPath = '/audio-processor.js';
  private useWorklet: boolean = true;

  constructor(sampleRate = 16000, bufferSize = 4096) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Create audio context with proper type handling
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API is not supported in this browser');
      }
      
      this.context = new AudioContext({
        sampleRate: this.sampleRate,
        latencyHint: 'interactive'
      });

      // Try to use AudioWorklet if available
      if (this.context.audioWorklet && this.useWorklet) {
        try {
          await this.initializeAudioWorklet();
        } catch (error) {
          console.warn('Failed to initialize AudioWorklet, falling back to ScriptProcessorNode:', error);
          await this.initializeScriptProcessor();
        }
      } else {
        await this.initializeScriptProcessor();
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize AudioPreprocessor:', error);
      this.cleanup();
      throw error;
    }
  }

  private async initializeAudioWorklet(): Promise<void> {
    if (!this.context) return;
    
    // Add the worklet module
    await this.context.audioWorklet.addModule(this.workletPath);
    
    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.context, 'audio-processor', {
      processorOptions: {
        sampleRate: this.sampleRate,
        bufferSize: this.bufferSize
      }
    });

    // Set up message handler
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'audioData' && this.processCallback) {
        const audioData = new Float32Array(event.data.data);
        this.processCallback(audioData);
      }
    };
  }

  private async initializeScriptProcessor(): Promise<void> {
    if (!this.context) return;
    
    console.warn('Using deprecated ScriptProcessorNode. Consider using a modern browser that supports AudioWorklet.');
    
    // Create script processor with fallback for older browsers
    const processor = this.context.createScriptProcessor
      ? this.context.createScriptProcessor(this.bufferSize, 1, 1)
      : (this.context as any).createJavaScriptNode
      ? (this.context as any).createJavaScriptNode(this.bufferSize, 1, 1)
      : null;

    if (!processor) {
      throw new Error('Failed to create audio processor: No compatible method found');
    }
    
    // Set up audio processing callback
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (this.processCallback && e.inputBuffer) {
        const inputData = e.inputBuffer.getChannelData(0);
        this.processCallback(inputData);
      }
    };
    
    this.workletNode = processor as unknown as AudioWorkletNode;
  }

  async start(stream: MediaStream): Promise<void> {
    if (!this.isInitialized || !this.context || !this.workletNode) {
      throw new Error('AudioPreprocessor is not properly initialized');
    }

    try {
      // Create a media stream source
      this.source = this.context.createMediaStreamSource(stream);
      
      // Connect the source to the worklet node
      this.source.connect(this.workletNode);
      
      // Connect the worklet node to the destination (required for ScriptProcessorNode)
      this.workletNode.connect(this.context.destination);
      
      // Resume the audio context if it's suspended
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
    } catch (error) {
      console.error('Error starting audio processing:', error);
      this.cleanup();
      throw error;
    }
  }

  stop(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
    
    if (this.context && this.context.state !== 'closed') {
      this.context.suspend().catch(console.error);
    }
  }

  setProcessCallback(callback: (audioData: Float32Array) => void): void {
    this.processCallback = callback;
  }

  cleanup(): void {
    this.stop();
    
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(console.error);
      this.context = null;
    }
    
    this.workletNode = null;
    this.processCallback = null;
    this.isInitialized = false;
  }

  // Audio processing helper methods
  private preprocessAudio(input: Float32Array): Float32Array {
    // Apply any necessary audio preprocessing here
    // For now, just return a copy of the input
    return new Float32Array(input);
  }

  private applyPreEmphasis(buffer: Float32Array, coefficient: number = 0.97): Float32Array {
    const result = new Float32Array(buffer.length);
    result[0] = buffer[0];
    
    for (let i = 1; i < buffer.length; i++) {
      result[i] = buffer[i] - coefficient * buffer[i - 1];
    }
    
    return result;
  }

  private normalizeAudio(buffer: Float32Array): Float32Array {
    const max = Math.max(...Array.from(buffer.map(Math.abs)));
    if (max === 0) return buffer;
    
    const factor = 0.99 / max;
    return buffer.map(sample => sample * factor);
  }
}
