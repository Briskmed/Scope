import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { GroqSpeechService, SpeechRecognitionOptions, ConnectionStatus } from '../services/groqSpeech';
import { AUDIO_CONFIG, SPEECH_RECOGNITION_CONFIG } from '../config/audioConfig';

interface SpeechRecognitionContextType {
  // State
  isListening: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  isError: boolean;
  status: ConnectionStatus;
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  error: Error | null;
  
  // Methods
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  resetTranscript: () => void;
  updateOptions: (options: Partial<SpeechRecognitionOptions>) => void;
  
  // Audio level
  audioLevel: number;
  
  // Session info
  sessionId: string | null;
  
  // Debug info
  debugInfo: Record<string, any>;
}

const SpeechRecognitionContext = createContext<SpeechRecognitionContextType | undefined>(undefined);

interface SpeechRecognitionProviderProps {
  children: React.ReactNode;
  options?: Partial<SpeechRecognitionOptions>;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onError?: (error: Error) => void;
  debug?: boolean;
}

export const SpeechRecognitionProvider: React.FC<SpeechRecognitionProviderProps> = ({
  children,
  options: propOptions = {},
  onTranscript: propOnTranscript,
  onStatusChange: propOnStatusChange,
  onError: propOnError,
  debug = false,
}) => {
  // Merge default options with provided options
  const defaultOptions: SpeechRecognitionOptions = {
    serverUrl: 'http://localhost:3001',
    sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
    bufferSize: AUDIO_CONFIG.BUFFER_SIZE,
    preEmphasis: AUDIO_CONFIG.PRE_EMPHASIS,
    silenceThreshold: AUDIO_CONFIG.SILENCE_THRESHOLD,
    speechThreshold: AUDIO_CONFIG.SPEECH_THRESHOLD,
    silenceDuration: AUDIO_CONFIG.SILENCE_DURATION,
    maxChunkDuration: AUDIO_CONFIG.MAX_CHUNK_DURATION,
    language: SPEECH_RECOGNITION_CONFIG.LANGUAGE,
    model: SPEECH_RECOGNITION_CONFIG.MODEL,
    continuous: SPEECH_RECOGNITION_CONFIG.CONTINUOUS,
    interimResults: SPEECH_RECOGNITION_CONFIG.INTERIM_RESULTS,
    debug,
    // Add missing required properties
    onTranscript: (text: string, isFinal: boolean) => {
      if (!isMounted.current) return;
      
      if (isFinal) {
        finalTranscriptRef.current = text;
        setFinalTranscript(text);
        
        // If we have interim results, append to the final transcript
        if (transcriptRef.current) {
          transcriptRef.current = '';
          setInterimTranscript('');
        }
      } else {
        transcriptRef.current = text;
        setInterimTranscript(text);
      }
    },
    onError: (error: Error) => {
      if (!isMounted.current) return;
      console.error('Speech recognition error:', error);
      setError(error);
      updateStatus('error');
    },
    onStatusChange: (status: ConnectionStatus) => {
      if (!isMounted.current) return;
      updateStatus(status);
    },
    onAudioLevel: (level: number) => {
      if (!isMounted.current) return;
      setAudioLevel(level);
    },
    onSessionId: (id: string) => {
      if (!isMounted.current) return;
      setSessionId(id);
    },
    onDebugInfo: (info: Record<string, any>) => {
      if (!isMounted.current) return;
      setDebugInfo(prev => ({ ...prev, ...info }));
    },
  };

  const [options, setOptions] = useState<SpeechRecognitionOptions>({
    ...defaultOptions,
    ...propOptions,
  });
  
  // State
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({});
  
  // Refs
  const isMounted = useRef(true);
  const transcriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const speechServiceRef = useRef<GroqSpeechService | null>(null);
  const isStoppingRef = useRef(false);
  
  // Initialize speech service
  useEffect(() => {
    isMounted.current = true;
    
    const initializeService = async () => {
      try {
        // Lazy load the GroqSpeechService to avoid SSR issues
        const { GroqSpeechService } = await import('../services/groqSpeech');
        
        const service = new GroqSpeechService({
          ...options,
          onTranscript: (text, isFinal) => {
            if (!isMounted.current) return;
            
            if (isFinal) {
              finalTranscriptRef.current = text;
              setFinalTranscript(text);
              
              // If we have interim results, append to the final transcript
              if (transcriptRef.current) {
                transcriptRef.current = '';
                setInterimTranscript('');
              }
            } else {
              transcriptRef.current = text;
              setInterimTranscript(text);
            }
            
            // Combine final and interim transcripts
            const fullTranscript = [
              finalTranscriptRef.current,
              transcriptRef.current
            ].filter(Boolean).join(' ').trim();
            
            setTranscript(fullTranscript);
            
            // Call the onTranscript prop if provided
            if (propOnTranscript) {
              propOnTranscript(fullTranscript, isFinal);
            }
          },
          onError: (err) => {
            if (!isMounted.current) return;
            
            const error = err instanceof Error ? err : new Error(String(err));
            console.error('Speech recognition error:', error);
            
            setError(error);
            
            if (propOnError) {
              propOnError(error);
            }
            
            updateStatus('error');
          },
          onStatusChange: (newStatus) => {
            if (!isMounted.current) return;
            
            updateStatus(newStatus);
            
            if (propOnStatusChange) {
              propOnStatusChange(newStatus);
            }
          },
          onAudioLevel: (level) => {
            if (!isMounted.current) return;
            setAudioLevel(level);
          },
          onSessionId: (id) => {
            if (!isMounted.current) return;
            setSessionId(id);
          },
          onDebugInfo: (info) => {
            if (!isMounted.current) return;
            setDebugInfo(prev => ({ ...prev, ...info }));
          },
        });
        
        speechServiceRef.current = service;
        
        // Auto-start if configured
        if (options.autoStart) {
          service.startRecognition().catch((err) => {
            console.error('Failed to start speech recognition:', err);
          });
        }
        
        return () => {
          service.stopRecognition();
          speechServiceRef.current = null;
        };
      } catch (err) {
        console.error('Failed to initialize speech recognition:', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        updateStatus('error');
      }
    };
    
    initializeService();
    
    return () => {
      isMounted.current = false;
      speechServiceRef.current?.stopRecognition();
    };
  }, [
    options.serverUrl,
    options.sampleRate,
    options.bufferSize,
    options.language,
    options.model,
    options.autoStart,
    options.continuous,
    options.interimResults,
    options.debug,
  ]);
  
  // Update status and derived state
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    if (!isMounted.current) return;
    
    setStatus(prevStatus => {
      // Don't update if status hasn't changed
      if (prevStatus === newStatus) return prevStatus;
      
      if (debug) {
        console.log(`Speech recognition status: ${prevStatus} -> ${newStatus}`);
      }
      
      return newStatus;
    });
  }, [debug]);
  
  // Start listening
  const startListening = useCallback(async (): Promise<void> => {
    if (!speechServiceRef.current) {
      throw new Error('Speech recognition service not initialized');
    }
    
    try {
      await speechServiceRef.current.startRecognition();
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (propOnError) {
        propOnError(error);
      }
      
      throw error;
    }
  }, [propOnError]);
  
  // Stop listening
  const stopListening = useCallback(async (): Promise<void> => {
    if (!speechServiceRef.current) {
      throw new Error('Speech recognition service not initialized');
    }
    
    try {
      await speechServiceRef.current.stopRecognition();
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (propOnError) {
        propOnError(error);
      }
      
      throw error;
    }
  }, [propOnError]);
  
  // Pause recording
  const pauseRecording = useCallback(async (): Promise<void> => {
    if (!speechServiceRef.current) {
      throw new Error('Speech recognition service not initialized');
    }
    
    try {
      await speechServiceRef.current.pauseRecognition();
      setIsPaused(true);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (propOnError) {
        propOnError(error);
      }
      
      throw error;
    }
  }, [propOnError]);
  
  // Resume recording
  const resumeRecording = useCallback(async (): Promise<void> => {
    if (!speechServiceRef.current) {
      throw new Error('Speech recognition service not initialized');
    }
    
    try {
      await speechServiceRef.current.resumeRecognition();
      setIsPaused(false);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (propOnError) {
        propOnError(error);
      }
      
      throw error;
    }
  }, [propOnError]);
  
  // Reset transcript
  const resetTranscript = useCallback((): void => {
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setFinalTranscript('');
  }, []);
  
  // Update options
  const updateOptions = useCallback((newOptions: Partial<SpeechRecognitionOptions>): void => {
    setOptions(prev => ({
      ...prev,
      ...newOptions,
    }));
  }, []);
  
  // Derived state
  const isListening = status === 'connected';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';
  
  // Context value
  const contextValue: SpeechRecognitionContextType = {
    // State
    isListening,
    isPaused,
    isConnecting,
    isError,
    status,
    transcript,
    interimTranscript,
    finalTranscript,
    error,
    audioLevel,
    sessionId,
    debugInfo,
    
    // Methods
    startListening,
    stopListening,
    pauseRecording,
    resumeRecording,
    resetTranscript,
    updateOptions,
  };
  
  return (
    <SpeechRecognitionContext.Provider value={contextValue}>
      {children}
    </SpeechRecognitionContext.Provider>
  );
};

export const useSpeechRecognition = (): SpeechRecognitionContextType => {
  const context = useContext(SpeechRecognitionContext);
  
  if (context === undefined) {
    throw new Error(
      'useSpeechRecognition must be used within a SpeechRecognitionProvider'
    );
  }
  
  return context;
};

export default SpeechRecognitionContext;
