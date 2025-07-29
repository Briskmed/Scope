import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechRecognition } from '../contexts/SpeechRecognitionContext';
import { AUDIO_CONFIG } from '../config/audioConfig';
import styled from 'styled-components';

interface SpeechRecognitionUIProps {
  /**
   * Callback when the transcript changes
   */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  
  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;
  
  /**
   * Whether to show the audio visualizer
   * @default true
   */
  showVisualizer?: boolean;
  
  /**
   * Visualizer type
   * @default 'bars'
   */
  visualizerType?: 'bars' | 'waveform' | 'circle' | 'none';
  
  /**
   * Callback when the listening state changes
   */
  onListeningChange?: (isListening: boolean) => void;
  
  /**
   * Custom styles for the container
   */
  style?: React.CSSProperties;
  
  /**
   * Custom class name for the container
   */
  className?: string;
  
  /**
   * Whether to auto-start listening when the component mounts
   * @default false
   */
  autoStart?: boolean;
  
  /**
   * Whether to show the controls (start/stop buttons)
   * @default true
   */
  showControls?: boolean;
  
  /**
   * Whether to show the transcript text
   * @default true
   */
  showTranscript?: boolean;
  
  /**
   * Whether to show the status indicator
   * @default true
   */
  showStatus?: boolean;
  
  /**
   * Whether to show the error message
   * @default true
   */
  showError?: boolean;
  
  /**
   * Custom render function for the start button
   */
  renderStartButton?: (props: {
    onClick: () => void;
    isListening: boolean;
  }) => React.ReactNode;
  
  /**
   * Custom render function for the stop button
   */
  renderStopButton?: (props: {
    onClick: () => void;
    isListening: boolean;
  }) => React.ReactNode;
  
  /**
   * Custom render function for the transcript
   */
  renderTranscript?: (props: {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
  }) => React.ReactNode;
  
  /**
   * Custom render function for the status indicator
   */
  renderStatus?: (props: {
    status: string;
    isListening: boolean;
    isConnecting: boolean;
    isError: boolean;
  }) => React.ReactNode;
  
  /**
   * Custom render function for the error message
   */
  renderError?: (props: {
    error: Error | null;
    onDismiss: () => void;
  }) => React.ReactNode;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  border-radius: 12px;
  background-color: #ffffff;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

// Button component with transient props
const Button = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  
  ${({ $variant = 'primary' }) => 
    $variant === 'primary' 
      ? `
          background-color: #4f46e5;
          color: white;
          
          &:hover {
            background-color: #4338ca;
          }
          
          &:disabled {
            background-color: #c7d2fe;
            cursor: not-allowed;
          }
        `
      : `
          background-color: #fef2f2;
          color: #b91c1c;
          
          &:hover {
            background-color: #fee2e2;
          }
          
          &:disabled {
            background-color: #fecaca;
            cursor: not-allowed;
          }
        `}
`;

const TranscriptContainer = styled.div`
  width: 100%;
  min-height: 100px;
  padding: 1rem;
  border-radius: 8px;
  background-color: #f9fafb;
  font-size: 1rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-y: auto;
  max-height: 300px;
`;

// StatusIndicator component with transient props
const StatusIndicator = styled.div<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  background-color: ${({ $status }) => {
    switch ($status) {
      case 'connected':
        return '#dcfce7';
      case 'connecting':
        return '#fef9c3';
      case 'error':
        return '#fee2e2';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'connected':
        return '#166534';
      case 'connecting':
        return '#854d0e';
      case 'error':
        return '#991b1b';
      default:
        return '#4b5563';
    }
  }};
`;

// StatusDot component with transient props
const StatusDot = styled.span<{ $status: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $status }) => {
    switch ($status) {
      case 'connected':
        return '#22c55e';
      case 'connecting':
        return '#eab308';
      case 'error':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  }};
  animation: ${({ $status }) => $status === 'connecting' ? 'pulse 1.5s infinite' : 'none'};
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
`;

const ErrorMessage = styled.div`
  padding: 1rem;
  border-radius: 6px;
  background-color: #fef2f2;
  color: #b91c1c;
  font-size: 0.875rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
`;

const DismissButton = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.25rem;
  margin: -0.25rem -0.25rem -0.25rem 0;
  border-radius: 4px;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
`;

/**
 * SpeechRecognitionUI component that provides a complete UI for speech recognition
 */
const SpeechRecognitionUI: React.FC<SpeechRecognitionUIProps> = ({
  onTranscript,
  onError,
  onListeningChange,
  showVisualizer = true,
  visualizerType = 'bars',
  showControls = true,
  showTranscript = true,
  showStatus = true,
  showError = true,
  autoStart = false,
  renderStartButton,
  renderStopButton,
  renderTranscript,
  renderStatus,
  renderError,
  style,
  className = '',
}) => {
  const {
    isListening,
    isConnecting,
    isError,
    status,
    transcript,
    interimTranscript,
    finalTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
    audioLevel,
  } = useSpeechRecognition();
  
  const [localError, setLocalError] = useState<Error | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize audio context and get microphone access
  const initializeAudio = useCallback(async () => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext({ sampleRate: AUDIO_CONFIG.SAMPLE_RATE });
      }
      
      // Resume the audio context if it's suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Get microphone access if we don't have a stream yet
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        
        streamRef.current = stream;
      }
      
      // Create audio source from the stream
      if (streamRef.current && audioContextRef.current) {
        if (audioSourceRef.current) {
          audioSourceRef.current.disconnect();
        }
        
        const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
        audioSourceRef.current = source;
        
        return { audioContext: audioContextRef.current, audioSource: source };
      }
      
      return { audioContext: audioContextRef.current, audioSource: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error initializing audio:', error);
      setLocalError(error);
      onError?.(error);
      return { audioContext: null, audioSource: null };
    }
  }, [onError]);

  // Stop listening handler (defined first to avoid circular dependency)
  const handleStopListening = useCallback(() => {
    try {
      stopListening();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error stopping speech recognition:', error);
      setLocalError(error);
      onError?.(error);
    }
  }, [stopListening, onError]);

  // Start listening handler
  const handleStartListening = useCallback(async () => {
    try {
      setLocalError(null);
      
      // Initialize audio if needed
      if (showVisualizer && visualizerType !== 'none') {
        await initializeAudio();
      }
      
      await startListening();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error starting speech recognition:', error);
      setLocalError(error);
      onError?.(error);
    }
  }, [showVisualizer, visualizerType, initializeAudio, startListening, onError]);

  // Handle auto-start
  useEffect(() => {
    if (autoStart && !isListening && !isConnecting && !isError) {
      handleStartListening().catch(console.error);
    }
    
    return () => {
      if (autoStart) {
        handleStopListening();
      }
    };
  }, [autoStart, isListening, isConnecting, isError, handleStartListening, handleStopListening]);
  
  // Notify when listening state changes
  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);
  
  // Handle transcript updates
  useEffect(() => {
    if (onTranscript) {
      onTranscript(transcript, false);
    }
  }, [transcript, onTranscript]);
  
  // Handle errors
  useEffect(() => {
    if (error) {
      setLocalError(error);
      onError?.(error);
    }
  }, [error, onError]);
  
  // Clean up audio resources
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);
  

  
  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      handleStopListening();
    } else {
      handleStartListening().catch(console.error);
    }
  }, [isListening, handleStartListening, handleStopListening]);
  
  // Dismiss error
  const dismissError = useCallback(() => {
    setLocalError(null);
  }, []);
  
  // Render the start button
  const renderStartBtn = () => {
    if (renderStartButton) {
      return renderStartButton({
        onClick: handleStartListening,
        isListening,
      });
    }
    
    return (
      <Button
        onClick={handleStartListening}
        disabled={isListening || isConnecting}
        aria-label="Start listening"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C10.9391 2 9.92172 2.42143 9.17157 3.17157C8.42143 3.92172 8 4.93913 8 6V12C8 13.0609 8.42143 14.0783 9.17157 14.8284C9.92172 15.5786 10.9391 16 12 16C13.0609 16 14.0783 15.5786 14.8284 14.8284C15.5786 14.0783 16 13.0609 16 12V6C16 4.93913 15.5786 3.92172 14.8284 3.17157C14.0783 2.42143 13.0609 2 12 2Z" fill="currentColor" />
          <path d="M19 11C19.34 11 19.68 11.04 20 11.1V12C20 15.53 17.39 18.44 14 18.93V22H10V18.93C6.61 18.44 4 15.53 4 12V10C4 9.45 4.45 9 5 9C5.55 9 6 9.45 6 10V12C6 14.76 8.24 17 11 17C13.76 17 16 14.76 16 12V6C16 5.45 16.45 5 17 5C17.55 5 18 5.45 18 6V11.1C18.32 11.04 18.66 11 19 11Z" fill="currentColor" />
        </svg>
        Start Listening
      </Button>
    );
  };
  
  // Render the stop button
  const renderStopBtn = () => {
    if (renderStopButton) {
      return renderStopButton({
        onClick: handleStopListening,
        isListening,
      });
    }
    
    return (
      <Button 
        $variant="danger" 
        onClick={handleStopListening}
        disabled={!isListening}
        aria-label="Stop listening"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.53 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM15.59 7L12 10.59L8.41 7L7 8.41L10.59 12L7 15.59L8.41 17L12 13.41L15.59 17L17 15.59L13.41 12L17 8.41L15.59 7Z" fill="currentColor" />
        </svg>
        Stop Listening
      </Button>
    );
  };
  
  // Render the status indicator
  const renderStatusIndicator = () => {
    if (renderStatus) {
      return renderStatus({
        status,
        isListening,
        isConnecting,
        isError,
      });
    }
    
    const statusText = {
      connected: 'Listening...',
      connecting: 'Connecting...',
      disconnected: 'Ready',
      error: 'Error',
      idle: 'Idle',
      paused: 'Paused',
    }[status] || status;
    
    return (
      <StatusIndicator $status={status}>
        <StatusDot $status={status} />
        {statusText}
      </StatusIndicator>
    );
  };
  
  // Render the error message
  const renderErrorMsg = () => {
    const errorToShow = localError || error;
    if (!errorToShow || !showError) return null;
    
    if (renderError) {
      return renderError({
        error: errorToShow,
        onDismiss: dismissError,
      });
    }
    
    return (
      <ErrorMessage>
        <div>{errorToShow.message || 'An error occurred'}</div>
        <DismissButton onClick={dismissError} aria-label="Dismiss error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor" />
          </svg>
        </DismissButton>
      </ErrorMessage>
    );
  };
  
  // Render the transcript
  const renderTranscriptContent = () => {
    if (renderTranscript) {
      return renderTranscript({
        transcript,
        interimTranscript,
        finalTranscript,
      });
    }
    
    return (
      <div>
        {finalTranscript && <div>{finalTranscript}</div>}
        {interimTranscript && (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
            {interimTranscript}
          </div>
        )}
        {!finalTranscript && !interimTranscript && (
          <div style={{ color: '#9ca3af' }}>
            {isListening ? 'Listening...' : 'Click the button to start speaking...'}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <Container style={style} className={`speech-recognition-ui ${className}`}>
      {showStatus && renderStatusIndicator()}
      
      {showControls && (
        <Controls>
          {!isListening ? renderStartBtn() : renderStopBtn()}
        </Controls>
      )}
      
      {showTranscript && (
        <TranscriptContainer>
          {renderTranscriptContent()}
        </TranscriptContainer>
      )}
      
      {renderErrorMsg()}
    </Container>
  );
};

export default SpeechRecognitionUI;
