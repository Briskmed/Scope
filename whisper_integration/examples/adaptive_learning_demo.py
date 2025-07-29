"""
Example demonstrating how to use the adaptive learning features of WhisperService.

This script shows how to:
1. Initialize WhisperService with adaptive learning
2. Transcribe audio with user-specific adaptation
3. Correct transcriptions and see the system learn
4. View terminology suggestions
"""

import os
import numpy as np
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    # Configuration
    user_id = "demo_user"
    audio_dir = Path("path/to/your/audio/files")
    
    # Initialize WhisperService with adaptive learning
    print("Initializing WhisperService with adaptive learning...")
    whisper_service = WhisperService(
        model_name="base",  # Use a larger model for better accuracy
        enable_adaptive_learning=True,
        adaptive_learning_dir="./adaptive_learning_data"
    )
    
    # Example 1: Basic transcription with adaptation
    print("\n--- Example 1: Basic Transcription with Adaptation ---")
    try:
        # Simulate an audio file (in practice, load a real audio file)
        sample_rate = 16000
        audio_data = np.random.randn(sample_rate * 5)  # 5 seconds of random audio
        
        # Transcribe with user ID to enable adaptation
        print("Transcribing audio...")
        result = whisper_service.transcribe_audio_array(
            audio_array=audio_data,
            sample_rate=sample_rate,
            user_id=user_id,
            context={"domain": "medical"}  # Optional context
        )
        
        print(f"Original transcription: {result.text}")
        
        # Simulate a correction
        corrected_text = "This is a corrected transcription with medical terms"
        print(f"Correcting to: {corrected_text}")
        
        # Update the model with the correction
        whisper_service.correct_transcription(
            user_id=user_id,
            original_text=result.text,
            corrected_text=corrected_text,
            context={
                "audio": audio_data,
                "sample_rate": sample_rate,
                "domain": "medical"
            }
        )
        
        print("Correction applied. The model will adapt to this feedback.")
        
    except Exception as e:
        logger.error(f"Error in Example 1: {e}")
    
    # Example 2: Get terminology suggestions
    print("\n--- Example 2: Getting Terminology Suggestions ---")
    try:
        # Get suggestions based on the user's history
        suggestions = whisper_service.get_terminology_suggestions(
            user_id=user_id,
            text="patient with",
            context={"domain": "medical"},
            top_n=3
        )
        
        if suggestions:
            print("Suggested terms to complete 'patient with':")
            for term, score in suggestions:
                print(f"  - {term} (confidence: {score:.2f})")
        else:
            print("No terminology suggestions available yet. Make more corrections to see suggestions.")
            
    except Exception as e:
        logger.error(f"Error in Example 2: {e}")
    
    # Example 3: View user statistics
    print("\n--- Example 3: User Statistics ---")
    try:
        stats = whisper_service.get_user_stats(user_id)
        print(f"Adaptation statistics for user '{user_id}':")
        print(f"- Number of adaptations: {stats.get('adaptation_steps', 0)}")
        print(f"- Custom terms learned: {stats.get('terminology_size', 0)}")
        print(f"- Last updated: {stats.get('last_updated', 'Never')}")
        
    except ProfileError:
        print(f"No profile found for user '{user_id}'. Make a correction first.")
    except Exception as e:
        logger.error(f"Error in Example 3: {e}")
    
    print("\nDemo complete!")

if __name__ == "__main__":
    # Add the parent directory to the path so we can import whisper_integration
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    
    from whisper_integration.whisper_service import WhisperService
    from whisper_integration.adaptive_learning.exceptions import ProfileError
    
    main()
