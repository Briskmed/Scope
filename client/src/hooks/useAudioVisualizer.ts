import { useCallback, useEffect, useRef, useState } from 'react';
import { VISUALIZATION_CONFIG } from '../config/audioConfig';

export interface AudioVisualizerProps {
  /**
   * The audio context to use for analysis
   */
  audioContext?: AudioContext;
  
  /**
   * The audio node to analyze (e.g., from a microphone or audio element)
   */
  audioSource?: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null;
  
  /**
   * Callback that receives the frequency data
   * @param frequencies - Normalized frequency data (0-1)
   * @param timeDomain - Raw time domain data (0-255)
   */
  onAudioProcess?: (frequencies: Uint8Array, timeDomain: Uint8Array) => void;
  
  /**
   * Callback that receives the current volume level (0-1)
   */
  onVolumeChange?: (volume: number) => void;
  
  /**
   * Whether the visualizer is enabled
   */
  enabled?: boolean;
  
  /**
   * FFT size (must be a power of 2)
   */
  fftSize?: number;
  
  /**
   * Number of frequency bars to display
   */
  barCount?: number;
  
  /**
   * Smoothing time constant (0.0 to 1.0)
   */
  smoothingTimeConstant?: number;
  
  /**
   * Minimum decibel value for the analyzer
   */
  minDecibels?: number;
  
  /**
   * Maximum decibel value for the analyzer
   */
  maxDecibels?: number;
}

/**
 * Hook for audio visualization using the Web Audio API
 */
export const useAudioVisualizer = ({
  audioContext,
  audioSource,
  onAudioProcess,
  onVolumeChange,
  enabled = true,
  fftSize = VISUALIZATION_CONFIG.FFT_SIZE,
  barCount = VISUALIZATION_CONFIG.BAR_COUNT,
  smoothingTimeConstant = VISUALIZATION_CONFIG.SMOOTHING_TIME_CONSTANT,
  minDecibels = VISUALIZATION_CONFIG.MIN_DECIBELS,
  maxDecibels = VISUALIZATION_CONFIG.MAX_DECIBELS,
}: AudioVisualizerProps) => {
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const [frequencies, setFrequencies] = useState<Uint8Array>(new Uint8Array(barCount));
  const [timeDomain, setTimeDomain] = useState<Uint8Array>(new Uint8Array(fftSize));
  const [volume, setVolume] = useState(0);
  
  // Initialize analyzer
  useEffect(() => {
    if (!enabled || !audioContext || !audioSource) {
      return () => {};
    }
    
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = fftSize;
    analyzer.smoothingTimeConstant = smoothingTimeConstant;
    analyzer.minDecibels = minDecibels;
    analyzer.maxDecibels = maxDecibels;
    
    // Connect the audio source to the analyzer
    audioSource.connect(analyzer);
    
    // Store the analyzer in the ref
    analyzerRef.current = analyzer;
    
    // Start the visualization loop
    const analyze = () => {
      if (!analyzerRef.current) return;
      
      // Get frequency data
      const frequencyData = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(frequencyData);
      
      // Get time domain data
      const timeDomainData = new Uint8Array(analyzerRef.current.fftSize);
      analyzerRef.current.getByteTimeDomainData(timeDomainData);
      
      // Calculate volume (RMS of time domain data)
      let sum = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const value = (timeDomainData[i] - 128) / 128; // Convert to -1 to 1
        sum += value * value;
      }
      const rms = Math.sqrt(sum / timeDomainData.length);
      const normalizedVolume = Math.min(1, Math.max(0, rms * 2)); // Scale to 0-1 range
      
      // Update state
      setFrequencies(frequencyData);
      setTimeDomain(timeDomainData);
      setVolume(normalizedVolume);
      
      // Notify listeners
      if (onAudioProcess) {
        onAudioProcess(frequencyData, timeDomainData);
      }
      
      if (onVolumeChange) {
        onVolumeChange(normalizedVolume);
      }
      
      // Continue the animation loop
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    
    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(analyze);
    
    // Cleanup function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (analyzer) {
        analyzer.disconnect();
      }
      
      analyzerRef.current = null;
    };
  }, [
    audioContext,
    audioSource,
    enabled,
    fftSize,
    smoothingTimeConstant,
    minDecibels,
    maxDecibels,
    onAudioProcess,
    onVolumeChange,
  ]);
  
  // Get frequency data for the specified number of bars
  const getBarData = useCallback(() => {
    if (!analyzerRef.current || frequencies.length === 0) {
      return new Uint8Array(barCount);
    }
    
    const data = new Uint8Array(barCount);
    const groupSize = Math.floor(frequencies.length / barCount);
    
    for (let i = 0; i < barCount; i++) {
      const start = i * groupSize;
      const end = Math.min(start + groupSize, frequencies.length);
      let sum = 0;
      
      for (let j = start; j < end; j++) {
        sum += frequencies[j];
      }
      
      data[i] = sum / (end - start);
    }
    
    return data;
  }, [frequencies, barCount]);
  
  return {
    frequencies,
    timeDomain,
    volume,
    getBarData,
    analyzer: analyzerRef.current,
  };
};

export default useAudioVisualizer;
