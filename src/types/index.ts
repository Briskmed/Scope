// Core types for the video call service

export interface Participant {
  id: string;
  userId: string;
  name: string;
  role: 'patient' | 'doctor' | 'specialist' | 'guest';
  joinedAt: string;
  leftAt?: string;
  metadata?: {
    department?: string;
    specialization?: string;
    [key: string]: any;
  };
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
  metadata: {
    title?: string;
    description?: string;
    startTime: string;
    endTime?: string;
    createdBy: string;
    [key: string]: any;
  };
}

export interface Call {
  id: string;
  roomId: string;
  participants: string[];
  startTime: string;
  endTime?: string;
  status: 'active' | 'ended' | 'scheduled';
  metadata: {
    appointmentId?: string;
    medicalRecordId?: string;
    [key: string]: any;
  };
}

// WebSocket event types
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'leave' | 'join' | 'error';
  from: string;
  to?: string;
  payload: any;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    stack?: string; // For development environment only
  };
}

// Authentication types
export interface AuthTokenPayload {
  userId: string;
  role: string;
  permissions: string[];
  exp: number;
  iat: number;
}

// Configuration types
export interface ServerConfig {
  port: number;
  env: 'development' | 'production' | 'test';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  cors: {
    allowedOrigins: string[];
  };
  webrtc: {
    iceServers: RTCIceServer[];
  };
}
