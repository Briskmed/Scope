/**
 * Configuration for audio processing and speech recognition
 */

/**
 * Audio processing configuration
 */
export const AUDIO_CONFIG = {
  // Sample rate in Hz (samples per second)
  SAMPLE_RATE: 16000,
  
  // Number of audio channels (1 = mono, 2 = stereo)
  CHANNELS: 1,
  
  // Audio buffer size in samples
  BUFFER_SIZE: 4096,
  
  // Pre-emphasis coefficient (applied to boost high frequencies)
  PRE_EMPHASIS: 0.97,
  
  // Target peak amplitude for normalization (0.0 to 1.0)
  TARGET_PEAK: 0.9,
  
  // Silence detection threshold (0.0 to 1.0)
  SILENCE_THRESHOLD: 0.01,
  
  // Minimum energy level to be considered as speech (0.0 to 1.0)
  SPEECH_THRESHOLD: 0.03,
  
  // Duration of silence (in ms) before considering speech has ended
  SILENCE_DURATION: 1000,
  
  // Maximum duration of a single audio chunk (in ms)
  MAX_CHUNK_DURATION: 3000,
  
  // Maximum audio file size in bytes (25MB)
  MAX_AUDIO_SIZE: 25 * 1024 * 1024,
  
  // Audio format settings
  FORMAT: {
    // Number of bits per sample (16-bit is standard for WAV)
    BITS_PER_SAMPLE: 16,
    
    // Audio format (1 = PCM, 3 = IEEE float)
    AUDIO_FORMAT: 1,
    
    // MIME type for WAV audio
    MIME_TYPE: 'audio/wav',
    
    // File extension
    EXTENSION: 'wav',
  },
  
  // WebSocket configuration
  WEBSOCKET: {
    // Reconnection delay in milliseconds
    RECONNECT_DELAY: 1000,
    
    // Maximum number of reconnection attempts
    MAX_RECONNECT_ATTEMPTS: 5,
    
    // Timeout for WebSocket operations in milliseconds
    TIMEOUT: 10000,
  },
} as const;

/**
 * Speech recognition configuration
 */
export const SPEECH_RECOGNITION_CONFIG = {
  // Language code (BCP-47 format)
  LANGUAGE: 'en-US',
  
  // Enable interim results
  INTERIM_RESULTS: true,
  
  // Enable continuous recognition
  CONTINUOUS: true,
  
  // Maximum alternatives to return
  MAX_ALTERNATIVES: 1,
  
  // Enable automatic punctuation
  ENABLE_AUTOMATIC_PUNCTUATION: true,
  
  // Enable speaker diarization
  ENABLE_SPEAKER_DIARIZATION: false,
  
  // Enable word time offsets
  ENABLE_WORD_TIME_OFFSETS: true,
  
  // Enable word confidence
  ENABLE_WORD_CONFIDENCE: true,
  
  // Enable profanity filter
  FILTER_PROFANITY: false,
  
  // Speech model to use
  MODEL: 'whisper-large-v3',
  
  // Temperature for sampling (0.0 to 1.0)
  TEMPERATURE: 0.1,
  
  // Prompt to guide the model
  PROMPT: 'Transcribe the following audio accurately.',
} as const;

/**
 * Audio visualization configuration
 */
export const VISUALIZATION_CONFIG = {
  // Enable/disable visualization
  ENABLED: true,
  
  // Number of frequency bars to display
  BAR_COUNT: 64,
  
  // FFT size (must be a power of 2)
  FFT_SIZE: 2048,
  
  // Smoothing time constant (0.0 to 1.0)
  SMOOTHING_TIME_CONSTANT: 0.8,
  
  // Minimum decibel value for the analyzer
  MIN_DECIBELS: -100,
  
  // Maximum decibel value for the analyzer
  MAX_DECIBELS: -30,
  
  // Colors for the visualization
  COLORS: {
    BACKGROUND: 'rgba(0, 0, 0, 0.1)',
    WAVE: '#4a90e2',
    SPECTRUM: ['#ff0000', '#ffff00', '#00ff00'],
  },
} as const;

export type AudioConfig = typeof AUDIO_CONFIG;
export type SpeechRecognitionConfig = typeof SPEECH_RECOGNITION_CONFIG;
export type VisualizationConfig = typeof VISUALIZATION_CONFIG;
