
 import { useEffect, useRef, useCallback, useReducer } from 'react';
import WebSocketService, { type ConnectionStatus } from '../services/websocket';

interface UseWebSocketOptions {
  url: string;
  autoConnect?: boolean;
  debug?: boolean;
  onMessage?: (event: string, data: unknown) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

interface WebSocketState {
  status: ConnectionStatus;
  error: Error | null;
  isConnected: boolean;
  socketId?: string;
}

type WebSocketAction =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'error'; payload: Error }
  | { type: 'status'; payload: ConnectionStatus }
  | { type: 'socket_id'; payload: string };

const initialState: WebSocketState = {
  status: 'disconnected',
  error: null,
  isConnected: false,
};

function webSocketReducer(state: WebSocketState, action: WebSocketAction): WebSocketState {
  switch (action.type) {
    case 'connect':
      return { ...state, status: 'connecting' };
    case 'disconnect':
      return { ...initialState };
    case 'error':
      return { ...state, error: action.payload, status: 'error' };
    case 'status':
      return {
        ...state,
        status: action.payload,
        isConnected: action.payload === 'connected',
        error: action.payload === 'error' ? state.error : null,
      };
    case 'socket_id':
      return { ...state, socketId: action.payload };
    default:
      return state;
  }
}

export function useWebSocket(options: UseWebSocketOptions) {
  const [state, dispatch] = useReducer(webSocketReducer, initialState);
  const webSocketService = useRef<WebSocketService | null>(null);
  const messageQueue = useRef<Array<{ event: string; data: unknown }>>([]);
  const isMounted = useRef(true);

  // Initialize WebSocket service - only run when URL changes
  useEffect(() => {
    const { url, autoConnect = true, onMessage, onError, onStatusChange } = options;

    console.log(`[useWebSocket] Initializing WebSocket connection to: ${url}`);
    
    let service: WebSocketService | null = null;
    
    const initializeWebSocket = () => {
      try {
        // Clean up any existing connection
        if (webSocketService.current) {
          webSocketService.current.disconnect();
          webSocketService.current = null;
        }

        service = new WebSocketService({
          url,
          autoConnect: false, // We'll handle connection manually
          debug: process.env.NODE_ENV === 'development',
          onMessage: (event, data) => {
            if (!isMounted.current) return;
            console.log(`[WebSocket] Message received:`, event, data);
            onMessage?.(event, data);
          },
          onError: (error) => {
            if (!isMounted.current) return;
            console.error('[WebSocket] Error:', error);
            dispatch({ type: 'error', payload: error });
            onError?.(error);
          },
          onStatusChange: (status) => {
            if (!isMounted.current) return;
            console.log(`[WebSocket] Status changed:`, status);
            dispatch({ type: 'status', payload: status });
            onStatusChange?.(status);
            
            // Handle connection established
            if (status === 'connected' && service) {
              dispatch({ type: 'socket_id', payload: service.id || '' });
              
              // Process any queued messages
              const messages = [...messageQueue.current];
              messageQueue.current = [];
              
              messages.forEach(({ event, data }) => {
                service?.send(event, data).catch(error => {
                  console.error('Failed to send queued message:', error);
                });
              });
            }
          },
        });
        
        webSocketService.current = service;
        console.log('WebSocket service initialized');
        
        if (autoConnect) {
          console.log('[useWebSocket] Auto-connecting to WebSocket server...');
          service.connect().catch((error: unknown) => {
            if (!isMounted.current) return;
            const errorObj = error instanceof Error ? error : new Error('Failed to connect to WebSocket');
            console.error('[useWebSocket] Failed to connect:', errorObj);
            dispatch({ type: 'error', payload: errorObj });
            onError?.(errorObj);
          });
        }
        
      } catch (error) {
        if (!isMounted.current) return;
        console.error('Failed to initialize WebSocket service:', error);
        const errorObj = error instanceof Error ? error : new Error('Failed to initialize WebSocket');
        dispatch({ type: 'error', payload: errorObj });
        onError?.(errorObj);
      }
    };
    
    initializeWebSocket();
    
    // Cleanup function
    return () => {
      isMounted.current = false;
      console.log('[useWebSocket] Cleaning up WebSocket...');
      if (service) {
        service.disconnect();
        if (webSocketService.current === service) {
          webSocketService.current = null;
        }
      }
    };
  }, [options.url]); // Only re-run if URL changes

  // Send message to WebSocket server
  const send = useCallback((event: string, data?: unknown): Promise<void> => {
    if (!webSocketService.current) {
      return Promise.reject(new Error('WebSocket service not initialized'));
    }

    if (webSocketService.current.isConnected) {
      return webSocketService.current.send(event, data);
    }
    
    // Queue the message if not connected
    messageQueue.current.push({ event, data });
    
    // Try to reconnect if not already connecting/connected
    if (state.status === 'disconnected' || state.status === 'error') {
      webSocketService.current.connect().catch(error => {
        console.error('Failed to reconnect:', error);
      });
    }
    
    return Promise.resolve();
  }, [state.status]);

  // Subscribe to WebSocket events
  const on = useCallback(<T = unknown>(
    event: string, 
    callback: (data: T) => void
  ): (() => void) => {
    if (!webSocketService.current) {
      return () => {}; // No-op if service not initialized
    }
    return webSocketService.current.on(event, callback);
  }, []);

  // Connect to WebSocket server
  const connect = useCallback((): void => {
    webSocketService.current?.connect();
  }, []);

  // Disconnect from WebSocket server
  const disconnect = useCallback((): void => {
    webSocketService.current?.disconnect();
    messageQueue.current = [];
  }, []);

  return {
    // State
    status: state.status,
    error: state.error,
    isConnected: state.status === 'connected',
    socketId: state.socketId,
    
    // Methods
    send,
    on,
    off: on, // Alias for on with removeEventListener pattern
    connect,
    disconnect,
    
    // Internal reference for cleanup (use with caution)
    service: webSocketService.current,
  };
}

export default useWebSocket;
