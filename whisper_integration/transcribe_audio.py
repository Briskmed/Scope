#!/usr/bin/env python3
"""
A simple script to transcribe audio using the whisper_integration package.
This is called from the Node.js service when the Groq API is unavailable.
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Add the whisper_integration directory to the Python path
sys.path.append(str(Path(__file__).parent.absolute()))

from whisper_integration.whisper_service import WhisperService

def main():
    # Set up argument parsing
    parser = argparse.ArgumentParser(description='Transcribe audio using Whisper')
    parser.add_argument('--audio', type=str, required=True, help='Path to the audio file to transcribe')
    parser.add_argument('--model', type=str, default='base', help='Whisper model to use (tiny, base, small, medium, large)')
    parser.add_argument('--language', type=str, default=None, help='Language code (e.g., en, es, fr). If not provided, will be auto-detected')
    parser.add_argument('--sample-rate', type=int, default=16000, help='Sample rate of the audio file')
    
    args = parser.parse_args()
    
    try:
        # Initialize the Whisper service
        whisper_service = WhisperService(
            model_name=args.model,
            device='cuda' if torch.cuda.is_available() else 'cpu',
            compute_type='float16' if torch.cuda.is_available() else 'float32'
        )
        
        # Transcribe the audio file
        result = whisper_service.transcribe_audio(
            audio_path=args.audio,
            language=args.language,
            word_timestamps=False
        )
        
        # Convert the result to a JSON-serializable format
        output = {
            'text': result.text,
            'language': result.language,
            'duration': result.duration,
            'confidence': result.confidence,
            'success': True
        }
        
        # Print the result as JSON
        print(json.dumps(output))
        
    except Exception as e:
        # Return error information as JSON
        error_output = {
            'success': False,
            'error': str(e),
            'type': type(e).__name__
        }
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == '__main__':
    main()
