// Type definitions for AudioWorklet

interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare const sampleRate: number;

declare function registerProcessor(
  name: string,
  processorCtor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

// Our custom processor options
interface AudioWorkletProcessorOptions {
  sampleRate: number;
  bufferSize: number;
  onAudioLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}
