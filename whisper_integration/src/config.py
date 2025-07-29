"""
Configuration management for the Whisper integration.
"""
import os
from typing import Optional, Dict, Any
from pathlib import Path
import yaml

DEFAULT_CONFIG = {
    "model": {
        "name": "medium",
        "device": None,  # Auto-detect
        "compute_type": "float16",
        "download_root": None,
    },
    "audio": {
        "target_sample_rate": 16000,
        "normalize_db": -20.0,
        "trim_silence": True,
        "silence_threshold_db": 30.0,
    },
    "transcription": {
        "language": None,  # Auto-detect
        "word_timestamps": False,
        "initial_prompt": None,
        "temperature": 0.0,
    },
}

class Config:
    """
    Configuration manager for Whisper integration.
    """
    _instance = None
    
    def __new__(cls, config_path: Optional[str] = None):
        if cls._instance is None:
            cls._instance = super(Config, cls).__new__(cls)
            cls._instance._load_config(config_path)
        return cls._instance
    
    def _load_config(self, config_path: Optional[str] = None) -> None:
        """Load configuration from file or use defaults."""
        self._config = DEFAULT_CONFIG.copy()
        
        # Load from file if provided
        if config_path and os.path.exists(config_path):
            with open(config_path, 'r') as f:
                file_config = yaml.safe_load(f) or {}
                self._deep_update(self._config, file_config)
        
        # Override with environment variables
        self._load_from_env()
    
    def _load_from_env(self) -> None:
        """Update configuration from environment variables."""
        # Model settings
        if os.getenv('WHISPER_MODEL'):
            self._config['model']['name'] = os.getenv('WHISPER_MODEL')
        if os.getenv('WHISPER_DEVICE'):
            self._config['model']['device'] = os.getenv('WHISPER_DEVICE')
        if os.getenv('WHISPER_DOWNLOAD_ROOT'):
            self._config['model']['download_root'] = os.getenv('WHISPER_DOWNLOAD_ROOT')
        
        # Audio settings
        if os.getenv('AUDIO_SAMPLE_RATE'):
            self._config['audio']['target_sample_rate'] = int(os.getenv('AUDIO_SAMPLE_RATE'))
        if os.getenv('AUDIO_NORMALIZE_DB'):
            self._config['audio']['normalize_db'] = float(os.getenv('AUDIO_NORMALIZE_DB'))
        if os.getenv('AUDIO_TRIM_SILENCE'):
            self._config['audio']['trim_silence'] = os.getenv('AUDIO_TRIM_SILENCE').lower() == 'true'
        
        # Transcription settings
        if os.getenv('TRANSCRIPTION_LANGUAGE'):
            self._config['transcription']['language'] = os.getenv('TRANSCRIPTION_LANGUAGE')
        if os.getenv('TRANSCRIPTION_WORD_TIMESTAMPS'):
            self._config['transcription']['word_timestamps'] = os.getenv('TRANSCRIPTION_WORD_TIMESTAMPS').lower() == 'true'
    
    def _deep_update(self, original: Dict, update: Dict) -> Dict:
        """Recursively update a dictionary."""
        for key, value in update.items():
            if isinstance(value, dict) and key in original and isinstance(original[key], dict):
                self._deep_update(original[key], value)
            else:
                original[key] = value
        return original
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a configuration value using dot notation."""
        keys = key.split('.')
        value = self._config
        try:
            for k in keys:
                value = value[k]
            return value
        except (KeyError, TypeError):
            return default
    
    def to_dict(self) -> Dict:
        """Return the configuration as a dictionary."""
        return self._config.copy()
    
    def update(self, new_config: Dict) -> None:
        """Update the configuration with new values."""
        self._deep_update(self._config, new_config)
    
    def save(self, config_path: str) -> None:
        """Save the current configuration to a file."""
        os.makedirs(os.path.dirname(os.path.abspath(config_path)), exist_ok=True)
        with open(config_path, 'w') as f:
            yaml.safe_dump(self._config, f, default_flow_style=False)

# Global configuration instance
config = Config()
