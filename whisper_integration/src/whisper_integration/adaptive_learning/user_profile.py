"""User profile management for adaptive learning in Whisper integration."""

from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Any
import json
from pathlib import Path
import hashlib
import logging
import numpy as np
import numpy.typing as npt

logger = logging.getLogger(__name__)

@dataclass
class UserTerminology:
    """Stores user-specific terminology and corrections."""
    custom_terms: Dict[str, str] = field(default_factory=dict)  # term -> preferred_correction
    term_frequencies: Dict[str, int] = field(default_factory=dict)  # term -> frequency
    blacklisted_terms: Set[str] = field(default_factory=set)  # Terms to never suggest

@dataclass
class UserVoiceProfile:
    """Stores voice characteristics and adaptation data."""
    voice_embeddings: List[npt.NDArray[np.float32]] = field(default_factory=list)
    adaptation_steps: int = 0
    last_adapted: Optional[float] = None

@dataclass
class UserProfile:
    """User profile for adaptive learning."""
    user_id: str
    terminology: UserTerminology = field(default_factory=UserTerminology)
    voice_profile: UserVoiceProfile = field(default_factory=UserVoiceProfile)
    preferences: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        # Ensure voice_embeddings is a list of numpy arrays
        if not hasattr(self.voice_profile, 'voice_embeddings'):
            self.voice_profile.voice_embeddings = []
        
        # Convert any list elements to numpy arrays if they aren't already
        self.voice_profile.voice_embeddings = [
            np.array(embedding, dtype=np.float32) 
            if not isinstance(embedding, np.ndarray) 
            else embedding.astype(np.float32)
            for embedding in self.voice_profile.voice_embeddings
        ]
    
    def save(self, directory: Path) -> None:
        """Save profile to disk."""
        try:
            profile_path = directory / f"{self.user_id}.json"
            
            # Convert numpy arrays to lists for JSON serialization
            voice_embeddings = [
                embedding.tolist() 
                for embedding in self.voice_profile.voice_embeddings
            ]
            
            data = {
                "user_id": self.user_id,
                "terminology": {
                    "custom_terms": self.terminology.custom_terms,
                    "term_frequencies": self.terminology.term_frequencies,
                    "blacklisted_terms": list(self.terminology.blacklisted_terms)
                },
                "voice_profile": {
                    "voice_embeddings": voice_embeddings,
                    "adaptation_steps": self.voice_profile.adaptation_steps,
                    "last_adapted": self.voice_profile.last_adapted
                },
                "preferences": self.preferences
            }
            
            # Ensure directory exists
            directory.mkdir(parents=True, exist_ok=True)
            
            # Write to file atomically
            temp_path = profile_path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # Rename temp file to actual file (atomic on most filesystems)
            temp_path.replace(profile_path)
            
            logger.debug(f"Saved profile for user {self.user_id}")
            
        except Exception as e:
            logger.error(f"Error saving profile for user {self.user_id}: {e}")
            raise
    
    @classmethod
    def load(cls, user_id: str, directory: Path) -> 'UserProfile':
        """Load profile from disk."""
        profile_path = directory / f"{user_id}.json"
        if not profile_path.exists():
            logger.debug(f"No existing profile found for user {user_id}, creating new one")
            return cls(user_id=user_id)
            
        try:
            with open(profile_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Create profile with basic data
            profile = cls(user_id=user_id)
            
            # Load terminology
            if "terminology" in data:
                profile.terminology.custom_terms = data["terminology"].get("custom_terms", {})
                profile.terminology.term_frequencies = data["terminology"].get("term_frequencies", {})
                profile.terminology.blacklisted_terms = set(data["terminology"].get("blacklisted_terms", []))
            
            # Load voice profile
            if "voice_profile" in data:
                voice_data = data["voice_profile"]
                profile.voice_profile.voice_embeddings = [
                    np.array(embedding, dtype=np.float32) 
                    for embedding in voice_data.get("voice_embeddings", [])
                ]
                profile.voice_profile.adaptation_steps = voice_data.get("adaptation_steps", 0)
                profile.voice_profile.last_adapted = voice_data.get("last_adapted")
            
            # Load preferences
            profile.preferences = data.get("preferences", {})
            
            logger.debug(f"Loaded profile for user {user_id}")
            return profile
            
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding profile for user {user_id}: {e}")
            # Return a new profile if the file is corrupted
            return cls(user_id=user_id)
        except Exception as e:
            logger.error(f"Error loading profile for user {user_id}: {e}")
            return cls(user_id=user_id)


class UserProfileManager:
    """Manages loading and saving user profiles."""
    
    def __init__(self, storage_dir: Path):
        """Initialize with storage directory for profiles."""
        self.storage_dir = Path(storage_dir)
        self.profiles: Dict[str, UserProfile] = {}
        
        # Ensure storage directory exists
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
    def get_profile(self, user_id: str) -> UserProfile:
        """Get or create a user profile."""
        if not user_id:
            raise ValueError("User ID cannot be empty")
            
        if user_id not in self.profiles:
            self.profiles[user_id] = UserProfile.load(user_id, self.storage_dir)
        return self.profiles[user_id]
    
    def save_all(self) -> None:
        """Save all profiles to disk."""
        for user_id, profile in self.profiles.items():
            try:
                profile.save(self.storage_dir)
            except Exception as e:
                logger.error(f"Error saving profile for user {user_id}: {e}")
        logger.info(f"Saved {len(self.profiles)} user profiles")
    
    def get_or_create_voice_id(self, audio_features: np.ndarray, threshold: float = 0.9) -> str:
        """
        Get or create a voice ID based on audio features.
        
        Args:
            audio_features: Extracted audio features
            threshold: Similarity threshold for matching existing voices
            
        Returns:
            Voice ID string
        """
        if not hasattr(audio_features, 'shape') or len(audio_features.shape) != 1:
            raise ValueError("audio_features must be a 1D numpy array")
            
        # Simple implementation - in production, use a proper voice fingerprinting algorithm
        # This is a placeholder that just hashes the features
        voice_hash = hashlib.sha256(audio_features.tobytes()).hexdigest()
        return f"voice_{voice_hash[:16]}"
    
    def get_all_user_ids(self) -> List[str]:
        """Get a list of all user IDs with saved profiles."""
        try:
            return [f.stem for f in self.storage_dir.glob("*.json") if f.is_file()]
        except Exception as e:
            logger.error(f"Error listing user profiles: {e}")
            return []
