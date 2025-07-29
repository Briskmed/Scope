# Whisper Integration for DawaAssist

This module provides speech-to-text transcription capabilities using OpenAI's Whisper model, designed for integration with the DawaAssist application.

## Features

- High-quality speech recognition with support for multiple languages
- Configurable model sizes (tiny, base, small, medium, large)
- Audio preprocessing utilities (resampling, normalization, silence trimming)
- Flexible configuration via YAML files or environment variables
- Support for both file and in-memory audio processing

## Installation

1. Install the required dependencies:

```bash
pip install -r requirements.txt
```

2. (Optional) Install FFmpeg for audio file support:

```bash
# On Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# On macOS
brew install ffmpeg
```

## Usage

### Basic Usage

```python
from whisper_integration.src.whisper_service import WhisperService

# Initialize the service
whisper = WhisperService(model_name="medium")

# Transcribe an audio file
result = whisper.transcribe_audio_file("path/to/audio.wav")
print(f"Transcription: {result.text}")
print(f"Detected language: {result.language}")
print(f"Confidence: {result.confidence:.2f}")

# Transcribe from a numpy array
import soundfile as sf
audio, sr = sf.read("path/to/audio.wav")
result = whisper.transcribe_audio_array(audio, sample_rate=sr)
```

### Configuration

The module can be configured using a YAML file or environment variables.

#### YAML Configuration

Create a `config.yaml` file:

```yaml
model:
  name: "medium"
  device: "cuda"  # or "cpu"
  compute_type: "float16"

audio:
  target_sample_rate: 16000
  normalize_db: -20.0
  trim_silence: true

transcription:
  language: "en"  # or None for auto-detect
  word_timestamps: false
  temperature: 0.0
```

#### Environment Variables

```bash
# Model settings
export WHISPER_MODEL=medium
export WHISPER_DEVICE=cuda
export WHISPER_DOWNLOAD_ROOT=./models

# Audio settings
export AUDIO_SAMPLE_RATE=16000
export AUDIO_NORMALIZE_DB=-20.0
export AUDIO_TRIM_SILENCE=true

# Transcription settings
export TRANSCRIPTION_LANGUAGE=en
export TRANSCRIPTION_WORD_TIMESTAMPS=false
```

## API Reference

### `WhisperService`

Main class for speech-to-text transcription.

#### Methods

- `transcribe_audio_file(audio_path, language=None, word_timestamps=False, **kwargs)`
  - Transcribe an audio file
  - Returns: `TranscriptionResult` object

- `transcribe_audio_array(audio_array, sample_rate=16000, language=None, **kwargs)`
  - Transcribe a numpy array of audio data
  - Returns: `TranscriptionResult` object

### `TranscriptionResult`

Dataclass containing transcription results.

#### Attributes

- `text`: The transcribed text
- `language`: Detected language code
- `duration`: Audio duration in seconds
- `confidence`: Average confidence score (0-1)
- `segments`: List of transcription segments with timestamps
- `word_timestamps`: List of word-level timestamps (if enabled)

## Development

### Running Tests

```bash
pytest tests/
```

### Code Style

The project uses Black for code formatting:

```bash
black .
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
