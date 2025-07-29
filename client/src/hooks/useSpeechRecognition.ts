import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GroqSpeechService, SpeechRecognitionOptions, ConnectionStatus } from '../services/groqSpeech';

interface UseSpeechRecognitionOptions extends Omit<SpeechRecognitionOptions, 'onTranscript' | 'onError' | 'onStatusChange' | 'onAudioLevel' | 'onSessionId' | 'onDebugInfo'> {
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  autoStart?: boolean;
}

interface SpeechRecognitionState {
  isListening: boolean;
  isConnecting: boolean;
  isError: boolean;
  status: ConnectionStatus;
  transcript: string;
  error: Error | null;
}

export const useSpeechRecognition = (options: UseSpeechRecognitionOptions = {}) => {
  const {
    serverUrl = 'http://localhost:3001',
    autoStart = false,
    continuous = true,
    interimResults = true,
    sampleRate = 16000,
    bufferSize = 4096,
  } = options;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    isConnecting: false,
    isError: false,
    status: 'idle',
    transcript: '',
    error: null,
  });

  const speechServiceRef = useRef<GroqSpeechService | null>(null);
  const isMounted = useRef(true);
  const transcriptRef = useRef('');

  // Update state with type safety
  const updateState = useCallback((updates: Partial<SpeechRecognitionState>) => {
    if (!isMounted.current) return;
    
    setState(prev => {
      const newState = { ...prev, ...updates };
      
      // Derived state
      newState.isListening = newState.status === 'connected';
      newState.isConnecting = newState.status === 'connecting';
      newState.isError = newState.status === 'error';
      
      return newState;
    });
  }, []);

  // Initialize speech service
  useEffect(() => {
    isMounted.current = true;
    
    const service = new GroqSpeechService({
      serverUrl,
      sampleRate,
      bufferSize,
      continuous,
      interimResults,
      onTranscript: (text: string, isFinal: boolean) => {
        if (!isMounted.current) return;
        
        if (isFinal || interimResults) {
          transcriptRef.current = isFinal ? text : `${transcriptRef.current} ${text}`.trim();
          updateState({ transcript: transcriptRef.current });
          
          if (options.onTranscript) {
            options.onTranscript(transcriptRef.current, isFinal);
          }
        }
      },
      onError: (error: Error) => {
        if (!isMounted.current) return;
        
        console.error('Speech recognition error:', error);
        updateState({ 
          status: 'error',
          error: error
        });
        
        if (options.onError) {
          options.onError(error);
        }
      },
      onStatusChange: (status: ConnectionStatus) => {
        if (!isMounted.current) return;
        
        updateState({ status });
        
        if (options.onStatusChange) {
          options.onStatusChange(status);
        }
      },
      // Add missing required handlers with no-op functions
      onAudioLevel: () => {},
      onSessionId: () => {},
      onDebugInfo: () => {}
    });
    
    speechServiceRef.current = service;

    // Auto-start if requested
    if (autoStart) {
      startListening().catch(console.error);
    }

    return () => {
      isMounted.current = false;
      service.stopRecognition();
      transcriptRef.current = '';
    };
  }, [serverUrl, sampleRate, bufferSize, autoStart, interimResults]);

  const startListening = useCallback(async (): Promise<void> => {
    if (!speechServiceRef.current) {
      throw new Error('Speech service not initialized');
    }
    
    try {
      updateState({ status: 'connecting' });
      await speechServiceRef.current.startRecognition();
      updateState({ 
        status: 'connected',
        error: null 
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start speech recognition');
      updateState({ 
        status: 'error',
        error: err 
      });
      
      if (options.onError) {
        options.onError(err);
      }
      
      throw err;
    }
  }, [options.onError]);

  const stopListening = useCallback((): void => {
    speechServiceRef.current?.stopRecognition();
    updateState({ status: 'disconnected' });
  }, []);

  const resetTranscript = useCallback((): void => {
    transcriptRef.current = '';
    updateState({ transcript: '' });
  }, []);

  // Return memoized state and methods
  return useMemo(() => ({
    ...state,
    startListening,
    stopListening,
    resetTranscript,
  }), [state, startListening, stopListening, resetTranscript]);
};

export default useSpeechRecognition;
