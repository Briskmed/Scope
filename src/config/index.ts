import dotenv from 'dotenv';
import { ServerConfig } from '../types';

// Load environment variables
dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return (value || defaultValue) as string;
};

export const config: ServerConfig = {
  port: parseInt(getEnv('PORT', '3000'), 10),
  env: (getEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test'),
  logLevel: (getEnv('LOG_LEVEL', 'debug') as 'error' | 'warn' | 'info' | 'debug'),
  cors: {
    allowedOrigins: getEnv('ALLOWED_ORIGINS', '*').split(','),
  },
  webrtc: {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
      // Add your TURN servers here for production
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'username',
      //   credential: 'password'
      // }
    ],
  },
  jwt: {
    secret: getEnv('JWT_SECRET', 'your-secret-key'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '24h'),
  },
};

// Validate required environment variables in production
if (config.env === 'production') {
  const requiredVars = [
    'JWT_SECRET',
    // Add other required variables here
  ];

  requiredVars.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Required environment variable ${key} is not set in production`);
    }
  });
}
