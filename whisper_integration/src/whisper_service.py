import logging
import os
import torch
import whisper
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union, Dict, Any, List, Tuple
import numpy as np
import numpy.typing as npt
from datetime import datetime

# Import adaptive learning components
from whisper_integration.adaptive_learning.service import AdaptiveLearningService
from whisper_integration.adaptive_learning.exceptions import AdaptiveLearningError

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class TranscriptionResult:
    """Container for transcription results with metadata.
    
    Attributes:
        text: The transcribed text in the original language
        language: Detected language code of the source audio
        duration: Duration of the audio in seconds
        confidence: Average confidence score (0-1) of the transcription
        segments: List of transcription segments with timestamps
        word_timestamps: List of word-level timestamps if enabled
        translated_text: Translated text if translation was performed
        translation_language: Target language code of the translation (e.g., 'en')
    """
    text: str
    language: str
    duration: float
    confidence: float
    segments: Optional[list] = None
    word_timestamps: Optional[list] = None
    translated_text: Optional[str] = None
    translation_language: Optional[str] = None

class WhisperService:
    """A service for handling speech-to-text transcription using OpenAI's Whisper model."""
    
    SUPPORTED_MODELS = ["tiny", "base", "small", "medium", "large"]
    SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "hi", "sw", "rw", "lg", "yo"]
    
    def __init__(
        self,
        model_name: str = "medium",
        device: Optional[str] = None,
        compute_type: str = "float16",
        download_root: Optional[Union[str, Path]] = None,
        enable_adaptive_learning: bool = True,
        adaptive_learning_dir: Optional[Union[str, Path]] = None
    ):
        """Initialize the Whisper ASR service with optional adaptive learning.
        
        Args:
            model_name: Name of the Whisper model to use (tiny, base, small, medium, large)
            device: Device to run the model on (cuda, cpu, mps)
            compute_type: Precision for computation (float16, float32, int8)
            download_root: Directory to download models to
            enable_adaptive_learning: Whether to enable adaptive learning features
            adaptive_learning_dir: Directory to store adaptive learning data
        """
        if model_name not in self.SUPPORTED_MODELS:
            raise ValueError(f"Unsupported model: {model_name}. Choose from: {', '.join(self.SUPPORTED_MODELS)}")
        
        # Set up device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        
        # Initialize adaptive learning if enabled
        self.adaptive_learning = None
        if enable_adaptive_learning:
            try:
                if adaptive_learning_dir is None:
                    adaptive_learning_dir = Path.home() / ".whisper_adaptive_learning"
                else:
                    adaptive_learning_dir = Path(adaptive_learning_dir)
                
                self.adaptive_learning = AdaptiveLearningService(
                    storage_dir=adaptive_learning_dir,
                    min_adaptation_samples=3
                )
                logger.info(f"Adaptive learning enabled, data stored in: {adaptive_learning_dir}")
            except Exception as e:
                logger.error(f"Failed to initialize adaptive learning: {e}")
                logger.warning("Continuing without adaptive learning features")
        
        # Load the model
        try:
            logger.info(f"Loading Whisper model: {model_name} on {device}")
            self.model = whisper.load_model(model_name, device=device, download_root=download_root)
            logger.info(f"Successfully loaded model: {model_name}")
            
            # Set model parameters
            self.model.eval()
            if hasattr(self.model, 'encoder') and hasattr(self.model.encoder, 'to'):
                self.model.encoder.to(device)
            if hasattr(self.model, 'decoder') and hasattr(self.model.decoder, 'to'):
                self.model.decoder.to(device)
                
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {str(e)}")
            raise RuntimeError(f"Could not load Whisper model: {str(e)}")
    
    def _extract_audio_features(
        self,
        audio: Union[np.ndarray, str, Path],
        sample_rate: int = 16000,
        n_mfcc: int = 13,
        n_fft: int = 2048,
        hop_length: int = 512,
        n_mels: int = 80
    ) -> np.ndarray:
        """Extract audio features for adaptive learning.
        
        This method extracts basic audio features that can be used for voice identification
        and adaptation. The current implementation uses a simple approach that can be
        enhanced with more sophisticated feature extraction if needed.
        
        Args:
            audio: Input audio as a numpy array or path to audio file
            sample_rate: Sample rate of the audio (default: 16000)
            n_mfcc: Number of MFCC coefficients to extract
            n_fft: Number of FFT points
            hop_length: Number of samples between frames
            n_mels: Number of Mel bands to generate
            
        Returns:
            numpy.ndarray: Extracted audio features as a 1D array
            
        Note:
            This is a simplified implementation. For production use, consider using
            more sophisticated feature extraction like wav2vec2 or similar models.
        """
        try:
            import librosa
            
            # Load audio if a file path is provided
            if isinstance(audio, (str, Path)):
                audio, _ = librosa.load(audio, sr=sample_rate)
            
            # Ensure audio is mono
            if len(audio.shape) > 1:
                audio = np.mean(audio, axis=0)
            
            # Extract MFCCs (Mel-frequency cepstral coefficients)
            mfccs = librosa.feature.mfcc(
                y=audio,
                sr=sample_rate,
                n_mfcc=n_mfcc,
                n_fft=n_fft,
                hop_length=hop_length,
                n_mels=n_mels
            )
            
            # Calculate statistics over time (mean and std of each MFCC coefficient)
            mfccs_mean = np.mean(mfccs, axis=1)
            mfccs_std = np.std(mfccs, axis=1)
            
            # Combine features into a single vector
            features = np.concatenate([mfccs_mean, mfccs_std])
            
            # Add basic audio statistics
            features = np.append(features, [
                np.mean(np.abs(audio)),  # Average amplitude
                np.max(np.abs(audio)),    # Peak amplitude
                np.var(audio),            # Variance
                np.median(np.abs(audio))  # Median amplitude
            ])
            
            return features.astype(np.float32)
            
        except ImportError:
            logger.warning("librosa not available, using simple audio features")
            # Fallback to simple feature extraction if librosa is not available
            if isinstance(audio, (str, Path)):
                # If it's a file path, load it using whisper's loader
                audio = whisper.load_audio(audio)
            
            # Basic features: mean, max, min, std, energy
            return np.array([
                np.mean(audio),
                np.max(audio),
                np.min(audio),
                np.std(audio),
                np.mean(np.square(audio))  # Energy
            ], dtype=np.float32)
    
    def transcribe_audio_file(
        self,
        audio_path: Union[str, Path],
        language: Optional[str] = None,
        word_timestamps: bool = False,
        translate: bool = False,
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> TranscriptionResult:
        """Transcribe an audio file using Whisper, with optional translation to English.
        
        Args:
            audio_path: Path to the audio file to transcribe
            language: Language code (e.g., 'en', 'es'). If None, auto-detects language.
            word_timestamps: Whether to include word-level timestamps
            translate: If True, translates non-English speech to English
            **kwargs: Additional arguments to pass to Whisper's transcribe function
            
        Returns:
            TranscriptionResult containing the transcription and metadata
            
        Note:
            When translate=True, the model will translate non-English speech to English.
            The original text remains available in the result.
        """
        try:
            audio_path = str(audio_path)
            logger.info(f"Transcribing audio file: {audio_path}")
            
            # Load and preprocess audio
            audio = whisper.load_audio(audio_path)
            audio_duration = len(audio) / 16000  # Sample rate is 16kHz for Whisper
            
            # Extract audio features for adaptive learning if enabled
            audio_features = None
            if self.adaptive_learning and user_id:
                try:
                    audio_features = self._extract_audio_features(audio)
                    
                    # Get terminology suggestions from adaptive learning
                    if context is None:
                        context = {}
                    
                    # Add any existing text context if available
                    if 'text_context' in kwargs:
                        context['text_context'] = kwargs['text_context']
                    
                    # Get terminology suggestions
                    suggestions = self.adaptive_learning.get_terminology_suggestions(
                        user_id=user_id,
                        text="",  # We'll apply suggestions after transcription
                        context=context
                    )
                    
                    # Apply any terminology preferences to the transcription
                    if suggestions and 'initial_prompt' not in kwargs:
                        # Create a prompt with preferred terms
                        preferred_terms = ", ".join([s[0] for s in suggestions[:5]])  # Use top 5 terms
                        kwargs['initial_prompt'] = f"Preferred terms: {preferred_terms}"
                        logger.debug(f"Applied terminology preferences: {preferred_terms}")
                        
                except Exception as e:
                    logger.warning(f"Error in adaptive learning preprocessing: {e}")
            
            # Set up transcription options
            task = "translate" if translate else "transcribe"
            
            # Transcribe
            result = self.model.transcribe(
                audio_path,
                language=language,
                word_timestamps=word_timestamps,
                task=task,
                **kwargs
            )
            
            # Check if this was a translation
            was_translated = translate and result.get("language", "en") != "en"
            
            # Calculate average confidence
            segments = result.get("segments", [])
            avg_confidence = np.mean([seg.get("confidence", 0.0) for seg in segments]) if segments else 0.0
            
            # Create result object
            transcription_result = TranscriptionResult(
                text=result["text"].strip(),
                language=result.get("language", "en"),
                duration=audio_duration,
                confidence=avg_confidence,
                segments=segments,
                word_timestamps=word_timestamps,
                translated_text=result["text"].strip() if was_translated else None,
                translation_language="en" if was_translated else None
            )
            
            # Update adaptive learning with this transcription
            if self.adaptive_learning and user_id and audio_features is not None:
                try:
                    self.adaptive_learning.adapt_to_correction(
                        user_id=user_id,
                        original_text=transcription_result.text,
                        corrected_text=transcription_result.text,  # No correction yet
                        audio_features=audio_features,
                        context=context
                    )
                    logger.debug(f"Updated adaptive learning for user {user_id}")
                except Exception as e:
                    logger.warning(f"Error updating adaptive learning: {e}")
            
            return transcription_result
            
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise RuntimeError(f"Transcription failed: {str(e)}")
    
    def transcribe_audio_array(
        self,
        audio_array: np.ndarray,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        translate: bool = False,
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> TranscriptionResult:
        """Transcribe a numpy array of audio data, with optional translation to English.
        
        Args:
            audio_array: Numpy array of audio data (shape: [samples] or [channels, samples])
            sample_rate: Sample rate of the audio data
            language: Language code (e.g., 'en', 'es'). If None, auto-detects language.
            translate: If True, translates non-English speech to English
            **kwargs: Additional arguments to pass to Whisper's transcribe function
            
        Returns:
            TranscriptionResult containing the transcription and metadata
            
        Note:
            When translate=True, the model will translate non-English speech to English.
            The original text remains available in the result.
        """
        try:
            logger.info(f"Starting transcription of audio array (shape: {audio_array.shape}, sr: {sample_rate})")
            
            # Convert to mono if needed
            if len(audio_array.shape) > 1:
                audio_array = np.mean(audio_array, axis=0)
                
            # Calculate duration
            duration = len(audio_array) / sample_rate
            
            # Extract audio features for adaptive learning if enabled
            audio_features = None
            if self.adaptive_learning and user_id:
                try:
                    audio_features = self._extract_audio_features(audio_array, sample_rate)
                    
                    # Get terminology suggestions from adaptive learning
                    if context is None:
                        context = {}
                    
                    # Add any existing text context if available
                    if 'text_context' in kwargs:
                        context['text_context'] = kwargs['text_context']
                    
                    # Get terminology suggestions
                    suggestions = self.adaptive_learning.get_terminology_suggestions(
                        user_id=user_id,
                        text="",  # We'll apply suggestions after transcription
                        context=context
                    )
                    
                    # Apply any terminology preferences to the transcription
                    if suggestions and 'initial_prompt' not in kwargs:
                        # Create a prompt with preferred terms
                        preferred_terms = ", ".join([s[0] for s in suggestions[:5]])  # Use top 5 terms
                        kwargs['initial_prompt'] = f"Preferred terms: {preferred_terms}"
                        logger.debug(f"Applied terminology preferences: {preferred_terms}")
                        
                except Exception as e:
                    logger.warning(f"Error in adaptive learning preprocessing: {e}")
            
            # Set up transcription options
            task = "translate" if translate else "transcribe"
            
            # Transcribe
            result = self.model.transcribe(
                audio_array,
                sample_rate=sample_rate,
                task=task,
                **kwargs
            )
            
            # Check if this was a translation
            was_translated = translate and result.get("language", "en") != "en"
            
            # Calculate average confidence
            segments = result.get("segments", [])
            avg_confidence = np.mean([seg.get("confidence", 0.0) for seg in segments]) if segments else 0.0
            
            # Create result object
            transcription_result = TranscriptionResult(
                text=result["text"].strip(),
                language=result.get("language", "en"),
                duration=duration,
                confidence=avg_confidence,
                segments=segments,
                translated_text=result["text"].strip() if was_translated else None,
                translation_language="en" if was_translated else None
            )
            
            # Update adaptive learning with this transcription
            if self.adaptive_learning and user_id and audio_features is not None:
                try:
                    self.adaptive_learning.adapt_to_correction(
                        user_id=user_id,
                        original_text=transcription_result.text,
                        corrected_text=transcription_result.text,  # No correction yet
                        audio_features=audio_features,
                        context=context
                    )
                    logger.debug(f"Updated adaptive learning for user {user_id}")
                except Exception as e:
                    logger.warning(f"Error updating adaptive learning: {e}")
            
            return transcription_result
            
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}")
            raise RuntimeError(f"Transcription failed: {str(e)}")
    
    def get_supported_languages(self) -> list:
        """Get a list of supported language codes."""
        return self.SUPPORTED_LANGUAGES
    
    def get_available_models(self) -> list:
        """Get a list of available model sizes."""
        return self.SUPPORTED_MODELS
        
    def translate_audio_file(
        self,
        audio_path: Union[str, Path],
        source_language: Optional[str] = None,
        target_language: str = "en",
        word_timestamps: bool = False,
        **kwargs
    ) -> TranscriptionResult:
        """Translate speech from an audio file to the target language.
        
        Args:
            audio_path: Path to the audio file to translate
            source_language: Source language code (e.g., 'es', 'fr'). If None, auto-detects.
            target_language: Target language code (currently only 'en' is fully supported by Whisper)
            word_timestamps: Whether to include word-level timestamps
            **kwargs: Additional arguments to pass to the transcription function
            
        Returns:
            TranscriptionResult containing the translation and metadata
            
        Note:
            Whisper's translation feature primarily supports translation to English.
            For other target languages, the results may be less accurate.
        """
        if target_language.lower() != "en":
            logger.warning(
                "Whisper's translation feature primarily supports translation to English. "
                f"Requested target language: {target_language}. "
                "Proceeding with translation to English instead."
            )
        
        # For translation, we set translate=True which tells Whisper to translate to English
        return self.transcribe_audio_file(
            audio_path=audio_path,
            language=source_language,
            word_timestamps=word_timestamps,
            translate=True,  # This enables translation to English
            **kwargs
        )
    
    def correct_transcription(
        self,
        user_id: str,
        original_text: str,
        corrected_text: str,
        audio_features: Optional[np.ndarray] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update the adaptive learning model with a user correction.
        
        This method should be called when a user corrects a transcription.
        The adaptive learning system will use this feedback to improve future transcriptions.
        
        Args:
            user_id: Unique identifier for the user
            original_text: The original transcription text
            corrected_text: The user-corrected text
            audio_features: Optional audio features for voice adaptation
            context: Optional context for the correction (e.g., domain, application)
            
        Raises:
            ValueError: If adaptive learning is not enabled
            AdaptiveLearningError: If there's an error processing the correction
        """
        if not self.adaptive_learning:
            raise ValueError("Adaptive learning is not enabled. Set enable_adaptive_learning=True when initializing WhisperService.")
            
        try:
            # If no audio features provided but we have an adaptive learning service,
            # try to extract features from the audio if it's provided in the context
            if audio_features is None and context is not None and 'audio' in context:
                audio = context['audio']
                sample_rate = context.get('sample_rate', 16000)
                audio_features = self._extract_audio_features(audio, sample_rate)
            
            # Update the adaptive learning model
            self.adaptive_learning.adapt_to_correction(
                user_id=user_id,
                original_text=original_text,
                corrected_text=corrected_text,
                audio_features=audio_features,
                context=context
            )
            logger.info(f"Updated adaptive learning for user {user_id} with correction")
            
        except Exception as e:
            logger.error(f"Failed to process correction: {str(e)}")
            raise AdaptiveLearningError(f"Failed to process correction: {str(e)}")
    
    def get_terminology_suggestions(
        self,
        user_id: str,
        text: str = "",
        context: Optional[Dict[str, Any]] = None,
        top_n: int = 5
    ) -> List[Tuple[str, float]]:
        """Get terminology suggestions for a user.
        
        Args:
            user_id: Unique identifier for the user
            text: Optional text to get suggestions for
            context: Optional context for the suggestions
            top_n: Maximum number of suggestions to return
            
        Returns:
            List of (term, score) tuples, ordered by relevance
            
        Note:
            Returns an empty list if adaptive learning is not enabled
        """
        if not self.adaptive_learning:
            return []
            
        return self.adaptive_learning.get_terminology_suggestions(
            user_id=user_id,
            text=text,
            context=context,
            top_n=top_n
        )
    
    def reset_user_profile(self, user_id: str) -> bool:
        """Reset the adaptive learning profile for a user.
        
        Args:
            user_id: Unique identifier for the user
            
        Returns:
            bool: True if the profile was reset, False if it didn't exist
            
        Raises:
            ValueError: If adaptive learning is not enabled
        """
        if not self.adaptive_learning:
            raise ValueError("Adaptive learning is not enabled. Set enable_adaptive_learning=True when initializing WhisperService.")
            
        return self.adaptive_learning.reset_user_profile(user_id)
    
    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get statistics about a user's adaptive learning profile.
        
        Args:
            user_id: Unique identifier for the user
            
        Returns:
            Dictionary with statistics about the user's profile
            
        Raises:
            ValueError: If adaptive learning is not enabled
            ProfileError: If the user profile doesn't exist
        """
        if not self.adaptive_learning:
            raise ValueError("Adaptive learning is not enabled. Set enable_adaptive_learning=True when initializing WhisperService.")
            
        return self.adaptive_learning.get_user_stats(user_id)
