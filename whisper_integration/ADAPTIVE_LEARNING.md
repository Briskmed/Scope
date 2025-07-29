# Adaptive Learning for Whisper Integration

This document describes the adaptive learning capabilities added to the Whisper integration, allowing the system to learn from user corrections and adapt to individual speech patterns and terminology preferences.

## Features

- **User-Specific Adaptation**: Learn from user corrections to improve future transcriptions
- **Terminology Customization**: Adapt to user-specific terms and phrases
- **Voice Profile Learning**: Optional voice adaptation for better recognition of individual speakers
- **Context-Aware Suggestions**: Provide terminology suggestions based on context
- **Privacy-Focused**: All user data is stored locally by default

## Getting Started

### Prerequisites

- Python 3.8+
- whisper-integration package
- (Optional) librosa for advanced audio feature extraction

### Installation

```bash
# Install with adaptive learning dependencies
pip install whisper-integration[adaptive]

# Or install required packages separately
pip install numpy librosa
```

## Usage

### Basic Usage

```python
from whisper_integration import WhisperService

# Initialize with adaptive learning
whisper = WhisperService(
    model_name="base",
    enable_adaptive_learning=True,
    adaptive_learning_dir="./user_profiles"
)

# Transcribe with user ID to enable adaptation
result = whisper.transcribe_audio_file(
    "audio.wav",
    user_id="user123"
)

# When a correction is made
whisper.correct_transcription(
    user_id="user123",
    original_text=result.text,
    corrected_text="The correct transcription",
    context={"domain": "medical"}
)
```

### Advanced Usage

#### Getting Terminology Suggestions

```python
# Get terminology suggestions
suggestions = whisper.get_terminology_suggestions(
    user_id="user123",
    text="patient with",
    context={"domain": "medical"},
    top_n=3
)
```

#### Managing User Profiles

```python
# Reset a user's profile
whisper.reset_user_profile("user123")

# Get user statistics
stats = whisper.get_user_stats("user123")
```

## How It Works

### Terminology Adaptation

The system maintains a user-specific terminology database that maps commonly misrecognized phrases to their preferred transcriptions. When a user makes a correction, the system updates this database and uses it to influence future transcriptions.

### Voice Adaptation (Optional)

When audio features are provided with corrections, the system can build a voice profile for the user. This helps with recognizing the user's speech patterns and accent over time.

### Context Awareness

The system can use contextual information (like domain or application context) to provide more relevant adaptations and suggestions.

## Customization

### Configuration Options

- `enable_adaptive_learning`: Enable/disable adaptive learning (default: `True`)
- `adaptive_learning_dir`: Directory to store user profiles (default: `~/.whisper_adaptive_learning`)
- `min_adaptation_samples`: Minimum number of samples before applying adaptations (default: `3`)

### Custom Terminology

You can provide a custom medical terminology file during initialization:

```python
whisper = WhisperService(
    model_name="base",
    adaptive_learning_config={
        "medical_terminology_path": "path/to/medical_terms.json"
    }
)
```

## Best Practices

1. **Provide Context**: Always provide as much context as possible when making corrections
2. **Be Consistent**: Use consistent terminology in your corrections
3. **Monitor Performance**: Regularly check user statistics to ensure the system is learning effectively
4. **Respect Privacy**: Be transparent about what data is being stored and how it's used

## Troubleshooting

### Common Issues

- **No Adaptation Happening**: Ensure `user_id` is consistent across calls
- **Poor Quality Suggestions**: The system needs multiple corrections to learn effectively
- **Performance Issues**: For large user bases, consider implementing a database backend

### Logging

Enable debug logging for more detailed information:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- OpenAI Whisper for the base transcription model
- The open-source community for contributions and feedback
