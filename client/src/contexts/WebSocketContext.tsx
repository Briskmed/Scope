import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import type { ConnectionStatus, WebSocketOptions } from '../services/websocket/WebSocketService';

interface WebSocketContextType {
  status: ConnectionStatus;
  error: Error | null;
  isConnected: boolean;
  socketId?: string;
  send: (event: string, data?: unknown) => Promise<void>;
  on: <T = unknown>(event: string, callback: (data: T) => void) => () => void;
  off: <T = unknown>(event: string, callback: (data: T) => void) => void;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps extends WebSocketOptions {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url,
  onMessage,
  onError,
  onStatusChange,
  autoConnect = true,
  debug = process.env.NODE_ENV === 'development',
}) => {
  // Memoize the WebSocket options to prevent unnecessary re-renders
  const webSocketOptions = useMemo<WebSocketOptions>(
    () => ({
      url,
      onMessage,
      onError,
      onStatusChange,
      autoConnect,
      debug,
    }),
    [url, onMessage, onError, onStatusChange, autoConnect, debug]
  );

  const {
    status,
    error,
    isConnected,
    socketId,
    send,
    on: originalOn,
    connect,
    disconnect,
    service,
  } = useWebSocket(webSocketOptions);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue: WebSocketContextType = useMemo(() => ({
    status,
    error,
    isConnected,
    socketId,
    send,
    on: <T = unknown>(event: string, callback: (data: T) => void) => 
      originalOn(event, callback as (data: unknown) => void),
    off: <T = unknown>(event: string, callback: (data: T) => void) => {
      if (service?.off) {
        service.off(event, callback as (data: unknown) => void);
      }
    },
    connect,
    disconnect,
  }), [
    status, 
    error, 
    isConnected, 
    socketId, 
    send, 
    originalOn, 
    connect, 
    disconnect, 
    service
  ]);

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};

export default WebSocketContext;
