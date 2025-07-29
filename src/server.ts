import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { WebRTCService } from './services/WebRTCService';
import { errorHandler } from './middleware/error';
import { initSocketHandlers } from './sockets';
import initSpeechHandlers from './sockets/groqSpeech';
import { config } from './config';

// Create Express application
const app = express();

// Create HTTP server
const httpServer = http.createServer(app);

// Configure CORS for HTTP requests
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // Check if the origin is allowed in production
    if (Array.isArray(config.allowedOrigins) && origin && config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow if wildcard is set
    if (config.allowedOrigins === '*') {
      return callback(null, true);
    }
    
    // Origin not allowed
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Apply CORS to all routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'mediview-video-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// Initialize WebRTC service
const webRTCService = new WebRTCService();

// Initialize Socket.IO with CORS
const io = new (SocketIOServer as any)(httpServer, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow all origins in development
      if (config.nodeEnv === 'development') {
        return callback(null, true);
      }
      
      // Check allowed origins in production
      if (Array.isArray(config.allowedOrigins) && origin && config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow if wildcard is set
      if (config.allowedOrigins === '*') {
        return callback(null, true);
      }
      
      // Origin not allowed
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  // Socket.IO configuration
  path: '/socket.io/',
  serveClient: false, // Don't serve the client file
  // Force WebSocket transport and disable polling
  transports: ['websocket'],
  // Disable HTTP long-polling fallback
  allowUpgrades: false,
  // Connection settings
  pingTimeout: 30000, // 30 seconds
  pingInterval: 25000, // 25 seconds
  // Security settings
  cookie: false, // Disable cookies for WebSocket connections
  // Performance optimizations
  maxHttpBufferSize: 1e8, // 100MB max payload size
  // Disable HTTP long-polling
  httpCompression: false,
  // Disable per-message deflate
  perMessageDeflate: false
});

// Authentication middleware for socket connections
// Define a custom error class for authentication errors
class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  try {
    // Implement your authentication logic here
    // For production, use JWT verification
    // Example:
    // const token = socket.handshake.auth.token;
    // verifyToken(token);
    next();
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new AuthenticationError('Authentication failed');
    return next(err);
  }
};

// Apply the authentication middleware
(io as any).use(authMiddleware);

// Initialize socket handlers
initSocketHandlers(io, webRTCService);
initSpeechHandlers(io);

// Error handling middleware
app.use(errorHandler);

// Start the server if this file is run directly
if (require.main === module) {
  const port = config.port;
  httpServer.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`🔄 WebSocket available at ws://localhost:${port}/socket.io/`);
    console.log(`📊 Health check at http://localhost:${port}/health`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server is shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Export everything needed for testing and integration
export { 
  httpServer as server, 
  app, 
  io, 
  webRTCService 
};
