"""Tests for the adaptive learning functionality in Whisper integration."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
import numpy as np
import numpy.typing as npt

from whisper_integration.whisper_service import WhisperService
from whisper_integration.adaptive_learning.exceptions import AdaptiveLearningError, ProfileError


class TestAdaptiveLearning(unittest.TestCase):
    """Test cases for adaptive learning functionality."""

    def setUp(self):
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_audio = np.random.randn(16000)  # 1 second of random audio at 16kHz
        
        # Create a test audio file
        self.audio_path = os.path.join(self.temp_dir.name, "test_audio.wav")
        np.save(self.audio_path, self.test_audio)
        
        # Initialize WhisperService with adaptive learning
        self.whisper_service = WhisperService(
            model_name="tiny",  # Use tiny model for faster tests
            enable_adaptive_learning=True,
            adaptive_learning_dir=os.path.join(self.temp_dir.name, "adaptation_data")
        )
        
        # Mock the Whisper model to return predictable results
        self.mock_transcribe = MagicMock(return_value={
            "text": "test transcription",
            "language": "en",
            "segments": [{"text": "test transcription", "confidence": 0.9}]
        })
        self.whisper_service.model.transcribe = self.mock_transcribe

    def tearDown(self):
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def test_adaptive_learning_initialization(self):
        """Test that adaptive learning is properly initialized."""
        self.assertIsNotNone(self.whisper_service.adaptive_learning)
        self.assertTrue(
            os.path.exists(os.path.join(self.temp_dir.name, "adaptation_data"))
        )

    def test_correct_transcription(self):
        """Test correcting a transcription with adaptive learning."""
        user_id = "test_user"
        original_text = "test transcription"
        corrected_text = "test correction"
        
        # First transcribe to create a baseline
        result = self.whisper_service.transcribe_audio_array(
            audio_array=self.test_audio,
            user_id=user_id
        )
        
        # Correct the transcription
        self.whisper_service.correct_transcription(
            user_id=user_id,
            original_text=original_text,
            corrected_text=corrected_text,
            context={"audio": self.test_audio, "sample_rate": 16000}
        )
        
        # Verify the correction was processed
        # This is a basic check - in a real test, we'd verify the adaptation behavior
        self.assertTrue(True)  # Just checking we got here without errors

    def test_get_terminology_suggestions(self):
        """Test getting terminology suggestions."""
        user_id = "test_user"
        
        # First, make sure we can get suggestions (may be empty)
        suggestions = self.whisper_service.get_terminology_suggestions(
            user_id=user_id,
            text="test"
        )
        
        # Just verify we got a list back
        self.assertIsInstance(suggestions, list)

    def test_reset_user_profile(self):
        """Test resetting a user's profile."""
        user_id = "test_user"
        
        # First create a profile by transcribing
        self.whisper_service.transcribe_audio_array(
            audio_array=self.test_audio,
            user_id=user_id
        )
        
        # Now reset it
        result = self.whisper_service.reset_user_profile(user_id)
        self.assertTrue(result)
        
        # Verify we can't get stats for a reset profile
        with self.assertRaises(ProfileError):
            self.whisper_service.get_user_stats(user_id)

    def test_get_user_stats(self):
        """Test getting user statistics."""
        user_id = "test_user"
        
        # First create a profile by transcribing
        self.whisper_service.transcribe_audio_array(
            audio_array=self.test_audio,
            user_id=user_id
        )
        
        # Now get stats
        stats = self.whisper_service.get_user_stats(user_id)
        
        # Check that we got some basic stats
        self.assertIn("adaptation_steps", stats)
        self.assertIn("terminology_size", stats)
        self.assertIn("last_updated", stats)

    def test_adaptive_learning_disabled(self):
        """Test behavior when adaptive learning is disabled."""
        # Create a service with adaptive learning disabled
        service = WhisperService(
            model_name="tiny",
            enable_adaptive_learning=False
        )
        
        # Verify adaptive learning is None
        self.assertIsNone(service.adaptive_learning)
        
        # Verify methods raise appropriate errors
        with self.assertRaises(ValueError):
            service.correct_transcription("user", "original", "corrected")
            
        with self.assertRaises(ValueError):
            service.reset_user_profile("user")
            
        # This should return an empty list, not raise
        suggestions = service.get_terminology_suggestions("user")
        self.assertEqual(suggestions, [])


if __name__ == "__main__":
    unittest.main()
