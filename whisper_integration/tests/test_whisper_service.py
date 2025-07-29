import os
import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add the parent directory to the Python path
import sys
sys.path.append(str(Path(__file__).parent.parent))

from whisper_integration.src.whisper_service import WhisperService, TranscriptionResult
from whisper_integration.src.exceptions import TranscriptionError

# Test data directory
TEST_DATA_DIR = Path(__file__).parent / "test_data"
os.makedirs(TEST_DATA_DIR, exist_ok=True)

def create_test_audio(filename: str, duration: float = 5.0, sample_rate: int = 16000) -> str:
    """Create a test audio file with a sine wave."""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio = 0.5 * np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
    audio_path = str(TEST_DATA_DIR / filename)
    sf.write(audio_path, audio, sample_rate)
    return audio_path

# Fixtures
@pytest.fixture
def test_audio_file():
    """Create a test audio file and return its path."""
    return create_test_audio("test_audio.wav")

@pytest.fixture
def mock_transcription_result():
    """Return a mock transcription result."""
    return {
        "text": "This is a test transcription.",
        "segments": [{"text": "This is a test transcription.", "start": 0, "end": 2.5}],
        "language": "en"
    }

@pytest.fixture
def mock_translation_result():
    """Return a mock translation result (non-English source)."""
    return {
        "text": "This is a translated text.",
        "segments": [{"text": "This is a translated text.", "start": 0, "end": 2.5}],
        "language": "es"
    }

@pytest.fixture
def whisper_service(mock_transcription_result):
    """Create a WhisperService instance for testing."""
    with patch('whisper.load_model') as mock_load_model:
        mock_model = MagicMock()
        mock_load_model.return_value = mock_model
        mock_model.transcribe.return_value = mock_transcription_result
        service = WhisperService(model_name="tiny")
        service.model = mock_model
        yield service

# Tests
def test_transcribe_audio_file(whisper_service, test_audio_file):
    """Test transcribing an audio file."""
    result = whisper_service.transcribe_audio_file(test_audio_file)
    
    assert isinstance(result, TranscriptionResult)
    assert result.text == "This is a test transcription."
    assert result.language == "en"
    assert result.duration > 0
    assert 0 <= result.confidence <= 1
    assert len(result.segments) > 0

def test_transcribe_audio_array(whisper_service):
    """Test transcribing a numpy array."""
    sample_rate = 16000
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    audio = 0.5 * np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
    
    result = whisper_service.transcribe_audio_array(audio, sample_rate=sample_rate)
    
    assert isinstance(result, TranscriptionResult)
    assert result.text == "This is a test transcription."
    assert result.language == "en"
    assert result.duration == duration

def test_transcription_error_handling(whisper_service, test_audio_file):
    """Test error handling during transcription."""
    whisper_service.model.transcribe.side_effect = Exception("Transcription failed")
    
    with pytest.raises(TranscriptionError):
        whisper_service.transcribe_audio_file(test_audio_file)

def test_unsupported_model():
    """Test initialization with an unsupported model."""
    with pytest.raises(ValueError):
        WhisperService(model_name="unsupported_model")

def test_supported_languages(whisper_service):
    """Test getting supported languages."""
    languages = whisper_service.get_supported_languages()
    assert isinstance(languages, list)
    assert len(languages) > 0
    assert "en" in languages

def test_available_models(whisper_service):
    """Test getting available models."""
    models = whisper_service.get_available_models()
    assert isinstance(models, list)
    assert len(models) > 0
    assert "tiny" in models
    assert "base" in models
    assert "small" in models
    assert "medium" in models
    assert "large" in models

def test_translate_audio_file(whisper_service, test_audio_file, mock_translation_result):
    """Test translating an audio file to English."""
    # Configure the mock to return a translation result
    whisper_service.model.transcribe.return_value = mock_translation_result
    
    # Call the translate_audio_file method
    result = whisper_service.translate_audio_file(
        audio_path=test_audio_file,
        source_language="es",
        target_language="en"
    )
    
    # Check that the model was called with the correct parameters
    whisper_service.model.transcribe.assert_called_once()
    call_args = whisper_service.model.transcribe.call_args[1]
    assert call_args.get("task") == "translate"
    assert call_args.get("language") == "es"
    
    # Check the result
    assert isinstance(result, TranscriptionResult)
    assert result.text == "This is a translated text."
    assert result.language == "es"
    assert result.translated_text == "This is a translated text."
    assert result.translation_language == "en"

def test_translate_non_english_warning(whisper_service, test_audio_file, caplog):
    """Test that a warning is logged when translating to non-English."""
    # Call translate_audio_file with a non-English target language
    result = whisper_service.translate_audio_file(
        audio_path=test_audio_file,
        source_language="es",
        target_language="fr"  # Non-English target
    )
    
    # Check that a warning was logged
    assert "primarily supports translation to English" in caplog.text
    
    # The call should still proceed with translation to English
    call_args = whisper_service.model.transcribe.call_args[1]
    assert call_args.get("task") == "translate"

def test_transcribe_with_translation(whisper_service, test_audio_file, mock_translation_result):
    """Test transcribing with translation enabled."""
    # Configure the mock to return a translation result
    whisper_service.model.transcribe.return_value = mock_translation_result
    
    # Call transcribe_audio_file with translate=True
    result = whisper_service.transcribe_audio_file(
        audio_path=test_audio_file,
        language="es",
        translate=True
    )
    
    # Check that the model was called with the correct parameters
    call_args = whisper_service.model.transcribe.call_args[1]
    assert call_args.get("task") == "translate"
    assert call_args.get("language") == "es"
    
    # Check the result
    assert result.translated_text == "This is a translated text."
    assert result.translation_language == "en"
