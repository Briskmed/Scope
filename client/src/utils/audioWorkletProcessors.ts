// Type declaration for the AudioWorkletProcessor constructor
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  constructor(options?: AudioWorkletNodeOptions);
}

// Type declaration for the registerProcessor function
declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

// Audio worklet processor for handling audio processing in a separate thread
class AudioProcessor extends AudioWorkletProcessor {
  // Remove the port declaration since it's already defined in the parent class
  
  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    // The port is already initialized by the parent class
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    try {
      // Get the first input (we only handle mono audio)
      const input = inputs[0];
      if (!input || input.length === 0) return true;
      
      // Process the input (this is where you'd add any audio processing logic)
      const inputData = input[0];
      const output = outputs[0];
      
      // Simply copy input to output for now
      if (inputData && output && output.length > 0) {
        const outputData = output[0];
        for (let i = 0; i < inputData.length; i++) {
          outputData[i] = inputData[i];
        }
        
        // Calculate audio level (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        // Send audio level to main thread
        this.port.postMessage({
          type: 'audioLevel',
          level: rms
        });
      }
      
      return true;
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error in audio worklet'
      });
      return false;
    }
  }
}

// Register the processor
// @ts-ignore - registerProcessor is available in the AudioWorklet global scope
try {
  // @ts-ignore
  registerProcessor('audio-processor', AudioProcessor);
} catch (error) {
  console.warn('Failed to register audio worklet processor:', error);
}

// Export TypeScript types
export interface AudioWorkletMessageEvent extends MessageEvent {
  data: {
    type: 'audioLevel' | 'error' | 'debug';
    level?: number;
    error?: string;
    message?: string;
  };
}

export interface AudioWorkletProcessorOptions {
  sampleRate: number;
  bufferSize: number;
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}
