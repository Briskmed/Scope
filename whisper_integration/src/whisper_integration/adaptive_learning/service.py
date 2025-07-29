"""Adaptive learning service for Whisper integration."""

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Union, Set
import numpy as np
import numpy.typing as npt
import difflib

from .user_profile import UserProfile, UserProfileManager
from ..exceptions import AdaptiveLearningError

logger = logging.getLogger(__name__)

class AdaptiveLearningService:
    """Service for adaptive learning capabilities in Whisper integration."""
    
    def __init__(
        self, 
        storage_dir: Union[str, Path], 
        min_adaptation_samples: int = 3,
        medical_terminology_path: Optional[Union[str, Path]] = None
    ):
        """
        Initialize the adaptive learning service.
        
        Args:
            storage_dir: Directory to store user profiles
            min_adaptation_samples: Minimum samples before applying adaptation
            medical_terminology_path: Path to medical terminology JSON file
        """
        self.storage_dir = Path(storage_dir)
        self.min_adaptation_samples = min_adaptation_samples
        self.profile_manager = UserProfileManager(self.storage_dir)
        self.medical_terminology = self._load_medical_terminology(medical_terminology_path)
        
        # Create storage directory if it doesn't exist
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized AdaptiveLearningService with storage at {self.storage_dir}")
    
    def _load_medical_terminology(self, path: Optional[Union[str, Path]] = None) -> Dict[str, List[str]]:
        """Load medical terminology from file or use defaults."""
        if path and Path(path).exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load medical terminology from {path}: {e}")
        
        # Default medical terminology (can be extended)
        return {
            # Common medical terms and their common misspellings
            "ibuprofen": ["ibuprofen", "ibuprufen", "ibuporfen", "ibupofen"],
            "acetaminophen": ["acetaminophen", "acitaminophen", "acetamenophen", "paracetamol"],
            "amoxicillin": ["amoxicillin", "amoxacillin", "amoxycillin"],
            "hypertension": ["hypertension", "hipertension", "hypertention"],
            "diabetes": ["diabetes", "diabetis", "diabete"],
            "asthma": ["asthma", "azma", "asthme"],
            "antibiotics": ["antibiotics", "antibioitcs", "antibotics"],
            "allergy": ["allergy", "alergy", "allergie"],
            "prescription": ["prescription", "perscription", "precription"],
            "symptom": ["symptom", "sympton", "simptom"]
        }
    
    def adapt_to_correction(
        self,
        user_id: str,
        original_text: str,
        corrected_text: str,
        audio_features: Optional[npt.NDArray[np.float32]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Adapt the model based on user correction.
        
        Args:
            user_id: ID of the user
            original_text: The original transcription
            corrected_text: The user-corrected version
            audio_features: Optional audio features for voice adaptation
            context: Additional context about the correction
        """
        if not user_id or not original_text or not corrected_text:
            raise ValueError("user_id, original_text, and corrected_text are required")
            
        if original_text == corrected_text:
            logger.debug("No changes detected in correction, skipping adaptation")
            return
            
        logger.info(f"Adapting to correction for user {user_id}")
        
        try:
            # Get or create user profile
            profile = self.profile_manager.get_profile(user_id)
            
            # Update terminology based on correction
            self._update_terminology(profile, original_text, corrected_text, context)
            
            # If audio features are provided, update voice profile
            if audio_features is not None:
                self._update_voice_profile(profile, audio_features)
            
            # Save the updated profile
            profile.save(self.storage_dir)
            logger.info(f"Successfully adapted to correction for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error in adapt_to_correction: {e}")
            raise AdaptiveLearningError(f"Failed to adapt to correction: {e}") from e
    
    def _update_terminology(
        self,
        profile: UserProfile,
        original: str,
        corrected: str,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update user terminology based on correction."""
        try:
            # Simple word-level comparison - could be enhanced with more sophisticated diffing
            original_terms = set(original.lower().split())
            corrected_terms = set(corrected.lower().split())
            
            # Find terms that were added or changed
            added_terms = corrected_terms - original_terms
            removed_terms = original_terms - corrected_terms
            
            # Update custom terms and frequencies
            for term in added_terms:
                # If this term was previously blacklisted, remove it
                if term in profile.terminology.blacklisted_terms:
                    profile.terminology.blacklisted_terms.remove(term)
                    
                # Update frequency
                profile.terminology.term_frequencies[term] = (
                    profile.terminology.term_frequencies.get(term, 0) + 1
                )
                
            # If we have a one-to-one correction, record it
            if len(added_terms) == 1 and len(removed_terms) == 1:
                original_term = removed_terms.pop()
                corrected_term = added_terms.pop()
                
                # Don't record very short terms to avoid noise
                if len(original_term) > 2 and len(corrected_term) > 2:
                    profile.terminology.custom_terms[original_term] = corrected_term
                    logger.debug(f"Recorded terminology mapping: {original_term} -> {corrected_term}")
                    
            # Update context-specific terms if context is provided
            if context:
                specialty = context.get("specialty")
                if specialty:
                    # Store specialty-specific terms
                    if "specialty_terms" not in profile.preferences:
                        profile.preferences["specialty_terms"] = {}
                    if specialty not in profile.preferences["specialty_terms"]:
                        profile.preferences["specialty_terms"][specialty] = set()
                    
                    # Add new terms to specialty
                    for term in added_terms:
                        if len(term) > 3:  # Only add meaningful terms
                            profile.preferences["specialty_terms"][specialty].add(term)
                            
        except Exception as e:
            logger.error(f"Error in _update_terminology: {e}")
            raise
    
    def _update_voice_profile(
        self,
        profile: UserProfile,
        audio_features: npt.NDArray[np.float32]
    ) -> None:
        """Update user's voice profile with new audio features."""
        try:
            # Simple adaptation - just store the features
            # In a real implementation, we'd update a voice embedding model
            profile.voice_profile.voice_embeddings.append(audio_features)
            profile.voice_profile.adaptation_steps += 1
            profile.voice_profile.last_adapted = time.time()
            
            # Keep only the most recent N embeddings to manage memory
            max_embeddings = 100  # Configurable
            if len(profile.voice_profile.voice_embeddings) > max_embeddings:
                profile.voice_profile.voice_embeddings = profile.voice_profile.voice_embeddings[-max_embeddings:]
                
        except Exception as e:
            logger.error(f"Error in _update_voice_profile: {e}")
            raise
    
    def get_terminology_suggestions(
        self,
        user_id: str,
        text: str,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Tuple[str, float]]:
        """
        Get terminology suggestions for the given text.
        
        Args:
            user_id: ID of the user
            text: Text to get suggestions for
            context: Additional context (e.g., medical specialty, document type)
            
        Returns:
            List of (suggestion, confidence) tuples, sorted by confidence (descending)
        """
        if not text or not text.strip():
            return []
            
        profile = self.profile_manager.get_profile(user_id)
        suggestions = []
        
        # Normalize text for comparison
        text_lower = text.lower()
        words = text_lower.split()
        
        # Check for custom terms first (user corrections)
        for original, corrected in profile.terminology.custom_terms.items():
            if original in text_lower and original != corrected:
                # Higher confidence if this is a frequent correction
                freq = profile.terminology.term_frequencies.get(corrected, 0)
                confidence = 0.8 + min(0.19, freq * 0.05)  # Cap at 0.99
                suggestions.append((corrected, confidence))
        
        # Check medical terminology
        for correct_term, variants in self.medical_terminology.items():
            for variant in variants:
                if variant in text_lower and variant != correct_term:
                    # Higher confidence if the term is in the user's frequent terms
                    freq = profile.terminology.term_frequencies.get(correct_term, 0)
                    base_confidence = 0.7 if variant in self.medical_terminology[correct_term][:3] else 0.5
                    confidence = min(0.9, base_confidence + (0.2 * min(1, freq / 5)))
                    suggestions.append((corrected, confidence))
        
        # Check for context-specific terms
        if context:
            specialty = context.get("specialty")
            if specialty and "specialty_terms" in profile.preferences:
                specialty_terms = profile.preferences["specialty_terms"].get(specialty, set())
                for term in specialty_terms:
                    if term in text_lower and term not in [s[0] for s in suggestions]:
                        suggestions.append((term, 0.6))  # Medium confidence for specialty terms
        
        # Sort by confidence (descending) and remove duplicates
        seen = set()
        unique_suggestions = []
        for suggestion, confidence in sorted(suggestions, key=lambda x: x[1], reverse=True):
            if suggestion not in seen:
                seen.add(suggestion)
                unique_suggestions.append((suggestion, confidence))
        
        return unique_suggestions
    
    def get_user_voice_id(
        self,
        audio_features: npt.NDArray[np.float32],
        create_if_new: bool = True
    ) -> Optional[str]:
        """
        Get or create a voice ID for the given audio features.
        
        Args:
            audio_features: Audio features to identify the speaker
            create_if_new: Whether to create a new ID if no match is found
            
        Returns:
            Voice ID string or None if no match found and create_if_new is False
        """
        try:
            return self.profile_manager.get_or_create_voice_id(audio_features)
        except Exception as e:
            logger.error(f"Error getting voice ID: {e}")
            if create_if_new:
                return "unknown_voice"
            return None
    
    def save_all_profiles(self) -> None:
        """Save all user profiles to disk."""
        self.profile_manager.save_all()
    
    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get statistics about a user's adaptation.
        
        Args:
            user_id: ID of the user
            
        Returns:
            Dictionary with adaptation statistics
        """
        profile = self.profile_manager.get_profile(user_id)
        return {
            "user_id": user_id,
            "adaptation_steps": profile.voice_profile.adaptation_steps,
            "last_adapted": profile.voice_profile.last_adapted,
            "custom_terms_count": len(profile.terminology.custom_terms),
            "total_corrections": sum(profile.terminology.term_frequencies.values()),
            "blacklisted_terms_count": len(profile.terminology.blacklisted_terms)
        }
    
    def reset_user_profile(self, user_id: str) -> bool:
        """
        Reset a user's profile.
        
        Args:
            user_id: ID of the user
            
        Returns:
            True if successful, False otherwise
        """
        try:
            profile_path = self.storage_dir / f"{user_id}.json"
            if profile_path.exists():
                profile_path.unlink()
            if user_id in self.profile_manager.profiles:
                del self.profile_manager.profiles[user_id]
            return True
        except Exception as e:
            logger.error(f"Error resetting profile for user {user_id}: {e}")
            return False
