// Audio worklet processor for handling audio processing in a separate thread
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      // Handle messages from the main thread if needed
      console.log('AudioProcessor received message:', event.data);
    };
  }

  process(inputs, outputs, parameters) {
    try {
      // Get the first input (we only handle mono audio)
      const input = inputs[0];
      if (!input || input.length === 0) return true;
      
      // Get the input data
      const inputData = input[0];
      
      // Send the audio data back to the main thread
      this.port.postMessage({
        type: 'audioData',
        data: inputData.buffer
      }, [inputData.buffer]);
      
      return true;
    } catch (error) {
      console.error('Error in AudioProcessor:', error);
      return false;
    }
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
