import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

interface WhisperTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  confidence: number;
}

export class WhisperFallbackService {
  private pythonPath: string;
  private scriptPath: string;
  private tempDir: string;

  constructor() {
    // Path to Python executable (use 'python3' on Unix-like systems)
    this.pythonPath = process.platform === 'win32' ? 'python' : 'python3';
    
    // Path to the whisper_integration script
    this.scriptPath = path.join(
      __dirname,
      '..',
      '..',
      'whisper_integration',
      'src',
      'whisper_service.py'
    );

    // Create temp directory if it doesn't exist
    this.tempDir = path.join(__dirname, '..', '..', 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Transcribe audio using the local Whisper model
   * @param audioData Audio data buffer
   * @param sampleRate Sample rate of the audio
   * @returns Promise with transcription result
   */
  public async transcribe(audioData: Buffer, sampleRate: number = 16000): Promise<WhisperTranscriptionResult> {
    // Generate a unique filename for the temporary audio file
    const tempAudioPath = path.join(this.tempDir, `${uuidv4()}.wav`);
    
    try {
      // Save audio buffer to a temporary file
      await writeFile(tempAudioPath, audioData);

      // Prepare the command to run the Python script
      const args = [
        this.scriptPath,
        '--audio', tempAudioPath,
        '--sample-rate', sampleRate.toString(),
        '--model', 'base', // Using base model for faster inference
        '--language', 'en', // Default to English, can be made configurable
      ];

      // Execute the Python script
      const result = await this.executeCommand(this.pythonPath, args);
      
      // Parse the result
      return this.parseTranscriptionResult(result);
    } catch (error) {
      console.error('Whisper fallback transcription failed:', error);
      throw new Error('Whisper fallback transcription failed');
    } finally {
      // Clean up the temporary file
      try {
        await unlink(tempAudioPath);
      } catch (error) {
        console.error('Error cleaning up temporary file:', error);
      }
    }
  }

  /**
   * Execute a command and return its output
   */
  private executeCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse the transcription result from the Python script
   */
  private parseTranscriptionResult(output: string): WhisperTranscriptionResult {
    try {
      // The Python script should return a JSON string
      const result = JSON.parse(output);
      
      // Map the result to our expected format
      return {
        text: result.text || '',
        language: result.language || 'en',
        duration: result.duration || 0,
        confidence: result.confidence || 0,
      };
    } catch (error) {
      console.error('Failed to parse transcription result:', error);
      throw new Error('Failed to parse transcription result');
    }
  }
}

export const whisperFallbackService = new WhisperFallbackService();
