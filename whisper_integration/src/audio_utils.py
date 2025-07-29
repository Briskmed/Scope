"""
Audio processing utilities for the Whisper integration.
"""
import numpy as np
import wave
import io
from typing import Union, Tuple, Optional
from pathlib import Path

def read_audio_file(file_path: Union[str, Path]) -> Tuple[np.ndarray, int]:
    """
    Read an audio file and return the audio data and sample rate.
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        Tuple of (audio_data, sample_rate)
    """
    try:
        import soundfile as sf
        audio, sample_rate = sf.read(file_path)
        return audio, sample_rate
    except ImportError:
        # Fallback to wave for WAV files if soundfile is not available
        if str(file_path).lower().endswith('.wav'):
            with wave.open(str(file_path), 'rb') as wav_file:
                sample_rate = wav_file.getframerate()
                n_frames = wav_file.getnframes()
                audio_data = wav_file.readframes(n_frames)
                audio = np.frombuffer(audio_data, dtype=np.int16)
                return audio, sample_rate
        else:
            raise ImportError("soundfile is required for non-WAV files. Install with: pip install soundfile")

def resample_audio(
    audio: np.ndarray,
    original_rate: int,
    target_rate: int = 16000
) -> np.ndarray:
    """
    Resample audio to the target sample rate.
    
    Args:
        audio: Input audio data
        original_rate: Original sample rate
        target_rate: Target sample rate (default: 16000 for Whisper)
        
    Returns:
        Resampled audio data
    """
    if original_rate == target_rate:
        return audio
        
    import librosa
    return librosa.resample(
        audio.astype(np.float32),
        orig_sr=original_rate,
        target_sr=target_rate
    )

def normalize_audio(
    audio: np.ndarray,
    target_dbfs: float = -20.0
) -> np.ndarray:
    """
    Normalize audio to a target dBFS level.
    
    Args:
        audio: Input audio data
        target_dbfs: Target dBFS level
        
    Returns:
        Normalized audio data
    """
    import librosa
    rms = np.sqrt(np.mean(audio ** 2))
    target_rms = 10 ** (target_dbfs / 20.0)
    return audio * (target_rms / (rms + 1e-6))

def convert_to_mono(audio: np.ndarray) -> np.ndarray:
    """
    Convert multi-channel audio to mono by averaging channels.
    
    Args:
        audio: Input audio data (shape: [samples] or [channels, samples])
        
    Returns:
        Mono audio data (shape: [samples])
    """
    if len(audio.shape) == 1:
        return audio
    return np.mean(audio, axis=0)

def trim_silence(
    audio: np.ndarray,
    sample_rate: int,
    top_db: float = 30.0,
    frame_length: int = 2048,
    hop_length: int = 512
) -> np.ndarray:
    """
    Trim leading and trailing silence from audio.
    
    Args:
        audio: Input audio data
        sample_rate: Sample rate of the audio
        top_db: Silence threshold in dB
        frame_length: Length of the analysis frame
        hop_length: Number of samples between frames
        
    Returns:
        Trimmed audio data
    """
    import librosa
    trimmed, _ = librosa.effects.trim(
        audio,
        top_db=top_db,
        frame_length=frame_length,
        hop_length=hop_length
    )
    return trimmed

def preprocess_audio(
    audio: Union[str, Path, np.ndarray],
    sample_rate: Optional[int] = None,
    target_sample_rate: int = 16000
) -> Tuple[np.ndarray, int]:
    """
    Preprocess audio for Whisper.
    
    Args:
        audio: Input audio (file path or numpy array)
        sample_rate: Sample rate of input audio (required if audio is numpy array)
        target_sample_rate: Target sample rate (default: 16000 for Whisper)
        
    Returns:
        Tuple of (preprocessed_audio, sample_rate)
    """
    # Load audio if file path is provided
    if isinstance(audio, (str, Path)):
        audio, sample_rate = read_audio_file(audio)
    elif sample_rate is None:
        raise ValueError("sample_rate must be provided when audio is a numpy array")
    
    # Convert to mono
    audio = convert_to_mono(audio)
    
    # Resample if needed
    if sample_rate != target_sample_rate:
        audio = resample_audio(audio, sample_rate, target_sample_rate)
        sample_rate = target_sample_rate
    
    # Normalize
    audio = normalize_audio(audio)
    
    return audio, sample_rate
