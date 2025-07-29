"""
Custom exceptions for the Whisper integration.
"""

class WhisperError(Exception):
    """Base exception for all Whisper integration errors."""
    pass

class ModelLoadError(WhisperError):
    """Raised when there's an error loading the Whisper model."""
    pass

class TranscriptionError(WhisperError):
    """Raised when there's an error during transcription."""
    pass

class UnsupportedLanguageError(WhisperError):
    """Raised when an unsupported language is requested."""
    pass

class AudioProcessingError(WhisperError):
    """Raised when there's an error processing audio data."""
    pass

class ModelInitializationError(WhisperError):
    """Raised when there's an error initializing the Whisper model."""
    pass
