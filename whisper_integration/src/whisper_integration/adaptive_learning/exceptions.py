"""
Exceptions for the adaptive learning module.
"""

class AdaptiveLearningError(Exception):
    """Base exception for adaptive learning errors."""
    pass

class ProfileError(AdaptiveLearningError):
    """Raised when there's an error with user profiles."""
    pass

class AdaptationError(AdaptiveLearningError):
    """Raised when there's an error during model adaptation."""
    pass

class TerminologyError(AdaptiveLearningError):
    """Raised when there's an error with terminology processing."""
    pass

class VoiceProfileError(AdaptiveLearningError):
    """Raised when there's an error with voice profiles."""
    pass

class InvalidAudioFeaturesError(AdaptiveLearningError):
    """Raised when audio features are invalid."""
    pass

class InsufficientDataError(AdaptiveLearningError):
    """Raised when there's not enough data for an operation."""
    pass
