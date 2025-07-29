import React, { useState, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import './SpeechRecognition.css';

interface SpeechRecognitionProps {
  onTranscriptChange?: (transcript: string) => void;
  serverUrl?: string;
  className?: string;
  onError?: (error: Error) => void;
  onStatusChange?: (status: string) => void;
}

const SpeechRecognition: React.FC<SpeechRecognitionProps> = ({
  onTranscriptChange,
  serverUrl,
  className = '',
  onError,
  onStatusChange,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('disconnected');

  const handleError = useCallback((error: Error) => {
    console.error('Speech recognition error:', error);
    setErrorMessage(error.message);
    onError?.(error);
  }, [onError]);

  const handleStatusChange = useCallback((newStatus: string) => {
    console.log('Speech recognition status:', newStatus);
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    serverUrl,
    onError: handleError,
    onStatusChange: handleStatusChange,
  });

  // Handle errors from the hook
  useEffect(() => {
    if (error) {
      handleError(error);
    }
  }, [error, handleError]);

  // Notify parent component about transcript changes
  useEffect(() => {
    onTranscriptChange?.(transcript);
  }, [transcript, onTranscriptChange]);

  const toggleListening = useCallback(async () => {
    try {
      if (isListening) {
        stopListening();
      } else {
        setErrorMessage(null);
        await startListening();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to toggle speech recognition');
      handleError(error);
    }
  }, [isListening, startListening, stopListening, handleError]);

  const handleClear = useCallback(() => {
    setErrorMessage(null);
    resetTranscript();
  }, [resetTranscript]);

  const getStatusMessage = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting to speech service...';
      case 'connected':
        return isListening ? 'Listening... Speak now.' : 'Ready to listen';
      case 'disconnected':
        return 'Disconnected from speech service';
      case 'error':
        return 'Error: Could not connect to speech service';
      default:
        return 'Click the Speak button to start voice recognition.';
    }
  };

  if (isMinimized) {
    return (
      <div className={`speech-recognition minimized ${className}`}>
        <button
          className="minimize-button"
          onClick={() => setIsMinimized(false)}
          title="Show transcript"
        >
          <i className="icon-mic" />
        </button>
      </div>
    );
  }

  return (
    <div className={`speech-recognition ${className}`}>
      <div className="header">
        <h4>Live Transcription</h4>
        <div className="controls">
          <button
            className="minimize-button"
            onClick={() => setIsMinimized(true)}
            title="Minimize"
          >
            <i className="icon-minimize" />
          </button>
          <button
            className={`toggle-button ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            disabled={status === 'error'}
            title={isListening ? 'Stop Listening' : 'Start Listening'}
          >
            {isListening ? 'Stop' : 'Speak'}
          </button>
          <button
            className="clear-button"
            onClick={handleClear}
            disabled={!transcript && !errorMessage}
            title="Clear transcript"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="transcript-container">
        {errorMessage ? (
          <p className="error-message">
            <i className="icon-error" /> {errorMessage}
            <button className="retry-button" onClick={toggleListening}>
              Retry
            </button>
          </p>
        ) : transcript ? (
          <p className="transcript">{transcript}</p>
        ) : (
          <p className={`placeholder ${status}`}>
            {getStatusMessage()}
          </p>
        )}
      </div>
    </div>
  );
};

export default SpeechRecognition;
