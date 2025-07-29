/**
 * Audio utility functions for handling audio data and format conversion
 */

/**
 * Converts an AudioBuffer to a WAV file blob
 * @param audioBuffer - The AudioBuffer to convert
 * @returns A Blob containing the WAV file data
 */
export function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 3; // Float32 format
  const bitDepth = 32;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  // Get the maximum length of all channels
  const maxLength = Math.max(...Array(numChannels).fill(0).map((_, i) => audioBuffer.getChannelData(i).length));
  const data = new Float32Array(maxLength * numChannels);
  
  // Interleave the audio data
  for (let i = 0; i < maxLength; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      data[i * numChannels + channel] = i < channelData.length ? channelData[i] : 0;
    }
  }
  
  const buffer = new ArrayBuffer(44 + data.length * bytesPerSample);
  const view = new DataView(buffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + data.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  
  // Write format chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, format, true); // Format (3 = float)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // Write data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, data.length * bytesPerSample, true);
  
  // Write the audio data
  const offset = 44;
  if (format === 3) {
    // 32-bit float
    for (let i = 0; i < data.length; i++) {
      view.setFloat32(offset + i * 4, data[i], true);
    }
  } else {
    // 16-bit PCM
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Writes a string to a DataView
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts an AudioBuffer to a base64-encoded WAV string
 */
export async function audioBufferToBase64Wav(audioBuffer: AudioBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const wavBlob = audioBufferToWav(audioBuffer);
      const reader = new FileReader();
      
      reader.onload = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve(base64data);
      };
      
      reader.onerror = reject;
      reader.readAsDataURL(wavBlob);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Resamples an AudioBuffer to the target sample rate
 */
export async function resampleAudioBuffer(
  audioBuffer: AudioBuffer,
  targetSampleRate: number
): Promise<AudioBuffer> {
  const { sampleRate } = audioBuffer;
  
  // No resampling needed
  if (sampleRate === targetSampleRate) {
    return audioBuffer;
  }
  
  // Calculate the resampling ratio
  const ratio = targetSampleRate / sampleRate;
  const length = Math.ceil(audioBuffer.length * ratio);
  
  // Create offline audio context for resampling
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    targetSampleRate
  );
  
  // Create a buffer source
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  
  // Connect to destination
  source.connect(offlineCtx.destination);
  
  // Start rendering
  source.start(0);
  
  // Return the rendered buffer
  return offlineCtx.startRendering();
}

/**
 * Converts an ArrayBuffer to an AudioBuffer
 */
export async function arrayBufferToAudioBuffer(
  arrayBuffer: ArrayBuffer,
  sampleRate: number
): Promise<AudioBuffer> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate
  });
  
  return audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Converts a Blob to an AudioBuffer
 */
export async function blobToAudioBuffer(blob: Blob, sampleRate: number): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return arrayBufferToAudioBuffer(arrayBuffer, sampleRate);
}

/**
 * Creates an AudioBuffer from raw float32 data
 */
export function createAudioBufferFromFloat32Array(
  data: Float32Array,
  sampleRate: number,
  numChannels: number = 1
): AudioBuffer {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate
  });
  
  const audioBuffer = audioCtx.createBuffer(
    numChannels,
    data.length / numChannels,
    sampleRate
  );
  
  // Deinterleave the data if multi-channel
  if (numChannels > 1) {
    const samplesPerChannel = data.length / numChannels;
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < samplesPerChannel; i++) {
        channelData[i] = data[i * numChannels + channel];
      }
    }
  } else {
    audioBuffer.getChannelData(0).set(data);
  }
  
  return audioBuffer;
}

/**
 * Normalizes audio data to a target peak amplitude
 */
export function normalizeAudio(
  audioData: Float32Array,
  targetPeak: number = 0.9
): Float32Array {
  // Find the maximum absolute value in the audio data
  let max = 0;
  for (let i = 0; i < audioData.length; i++) {
    const absVal = Math.abs(audioData[i]);
    if (absVal > max) {
      max = absVal;
    }
  }
  
  // If the maximum is 0, return the original data to avoid division by zero
  if (max === 0) {
    return audioData;
  }
  
  // Calculate the scaling factor
  const scalingFactor = targetPeak / max;
  
  // Apply the scaling factor
  const normalized = new Float32Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    normalized[i] = audioData[i] * scalingFactor;
  }
  
  return normalized;
}

/**
 * Applies a pre-emphasis filter to the audio data
 * This boosts high frequencies to improve speech recognition
 */
export function applyPreEmphasis(audioData: Float32Array, preEmphasis: number = 0.97): Float32Array {
  const result = new Float32Array(audioData.length);
  
  // First sample remains the same
  result[0] = audioData[0];
  
  // Apply pre-emphasis filter: y[n] = x[n] - a * x[n-1]
  for (let i = 1; i < audioData.length; i++) {
    result[i] = audioData[i] - preEmphasis * audioData[i - 1];
  }
  
  return result;
}
