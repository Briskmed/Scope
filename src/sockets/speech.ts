import { Server } from 'socket.io';
import { GroqHandler } from './groqHandler';

// This is a placeholder for the Groq API key
// In production, this should come from environment variables
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your-groq-api-key-here';

let groqHandler: GroqHandler | null = null;

export function initSpeechHandlers(io: Server) {
  // Initialize Groq handler if not already initialized
  if (!groqHandler) {
    groqHandler = new GroqHandler(io, {
      apiKey: GROQ_API_KEY,
      model: 'whisper-large-v3', // You can change this to other supported models
      language: 'en', // Default language
    });
    groqHandler.initialize();
  }

  // For backward compatibility, we'll keep the /speech namespace
  // but it will use Groq under the hood
  const speechNsp = io.of('/speech');
  
  speechNsp.on('connection', (socket) => {
    console.log(`New speech recognition connection (Groq): ${socket.id}`);
    
    // Forward to the Groq namespace
    socket.on('audio', (data) => {
      // Broadcast to all clients in the groq-speech namespace
      // The GroqHandler will filter the messages as needed
      io.of('/groq-speech').emit('audio', {
        ...data,
        clientId: socket.id  // Include client ID for filtering
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Speech recognition client disconnected: ${socket.id}`);
    });
  });
}

export default initSpeechHandlers;
