import io, { Socket } from 'socket.io-client';
import type { ManagerOptions, SocketOptions } from 'socket.io-client';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface WebSocketOptions {
  url: string;
  path?: string;
  autoConnect?: boolean;
  debug?: boolean;
  onStatusChange?: (status: ConnectionStatus) => void;
  onMessage?: (event: string, data: unknown) => void;
  onError?: (error: Error) => void;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private options: Required<WebSocketOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitDisconnect = false;
  private messageQueue: Array<{ event: string; data: unknown }> = [];
  private eventListeners: Map<string, Set<(data: unknown) => void>> = new Map();
  
  // Public getters
  public get id(): string | undefined {
    return this.socket?.id;
  }
  
  public get isConnected(): boolean {
    return this.socket?.connected || false;
  }
  
  private managerOptions: Partial<ManagerOptions & SocketOptions> = {
    path: '/socket.io',
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    // Force WebSocket transport and disable polling
    transports: ['websocket'],
    upgrade: false,
    // Add ping/pong timeouts
    pingTimeout: 20000,
    pingInterval: 25000
  };

  constructor(options: WebSocketOptions) {
    this.options = {
      path: '/socket.io',
      autoConnect: true,
      debug: false,
      onStatusChange: () => {},
      onMessage: () => {},
      onError: () => {},
      ...options,
    };

    this.managerOptions.path = this.options.path;
    this.managerOptions.autoConnect = this.options.autoConnect;

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Connect to the WebSocket server
   * @returns A promise that resolves when connected or rejects on error
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        this.log('Already connected');
        resolve();
        return;
      }

      this.isExplicitDisconnect = false;
      this.updateStatus('connecting');

      try {
        // Create socket with options
        this.socket = io(this.options.url, this.managerOptions);
        
        // Set up a one-time connect handler
        const handleConnect = () => {
          this.socket?.off('connect_error', handleConnectError);
          resolve();
        };
        
        const handleConnectError = (error: Error) => {
          this.socket?.off('connect', handleConnect);
          reject(error);
        };
        
        this.socket.once('connect', handleConnect);
        this.socket.once('connect_error', handleConnectError);
        
        this.setupEventListeners();
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error('Failed to connect to WebSocket');
        this.handleError(errorObj);
        reject(errorObj);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.cleanup();
    this.updateStatus('disconnected');
  }

  /**
   * Send a message to the server
   */
  public send(event: string, data?: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        // Queue the message if not connected
        this.messageQueue.push({ event, data });
        this.connect();
        resolve();
        return;
      }

      try {
        this.socket.emit(event, data);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a WebSocket event
   */
  public on<T = unknown>(event: string, callback: (data: T) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    const listeners = this.eventListeners.get(event)!;
    const wrappedCallback = (data: unknown) => callback(data as T);
    listeners.add(wrappedCallback);

    // Return unsubscribe function
    return () => {
      listeners.delete(wrappedCallback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    };
  }

  /**
   * Unsubscribe from a WebSocket event
   */
  public off(event: string, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }
  }

  /**
   * Get current connection status
   */
  public get status(): ConnectionStatus {
    if (!this.socket) return 'disconnected';
    if (this.socket.connected) return 'connected';
    if (this.reconnectTimer) return 'reconnecting';
    return 'disconnected';
  }

  // id and isConnected getters are defined at the class level

  // Private methods
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[WebSocket] ${message}`);
    }
  }

  private updateStatus(status: ConnectionStatus): void {
    this.options.onStatusChange?.(status);
  }

  private handleError(error: Error): void {
    this.log(`Error: ${error.message}`);
    this.options.onError?.(error);
    this.updateStatus('error');
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.log('Connected to server');
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      this.processMessageQueue();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.log(`Disconnected: ${reason}`);
      this.updateStatus('disconnected');
      
      if (!this.isExplicitDisconnect) {
        this.attemptReconnect();
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      this.log(`Connection error: ${error.message}`);
      this.handleError(error);
      this.attemptReconnect();
    });

    this.socket.on('error', (error: Error) => {
      this.log(`Error: ${error.message}`);
      this.handleError(error);
    });

    // Forward all events to the appropriate handlers
    this.socket.onAny((event: string, ...args: unknown[]) => {
      this.options.onMessage?.(event, args[0]);
      
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        for (const listener of Array.from(listeners)) {
          try {
            listener(args[0]);
          } catch (err) {
            console.error(`Error in event listener for ${event}:`, err);
          }
        }
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectTimer || this.isExplicitDisconnect) return;

    this.reconnectAttempts++;
    const maxAttempts = this.managerOptions.reconnectionAttempts || 5;
    const delay = Math.min(
      (this.managerOptions.reconnectionDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
      this.managerOptions.reconnectionDelayMax || 5000
    );

    if (this.reconnectAttempts > maxAttempts) {
      this.log('Max reconnection attempts reached');
      this.updateStatus('error');
      return;
    }

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitDisconnect) {
        this.connect();
      }
    }, delay);
  }

  private processMessageQueue(): void {
    if (!this.socket?.connected) return;

    while (this.messageQueue.length > 0) {
      const { event, data } = this.messageQueue.shift()!;
      try {
        this.socket.emit(event, data);
      } catch (error) {
        console.error('Failed to send queued message:', error);
      }
    }
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.off();
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export default WebSocketService;
