declare module 'socket.io-client' {
  import { ManagerOptions, SocketOptions } from 'socket.io-client/build/manager';
  import { DefaultEventsMap, EventsMap, EventNames, EventParams, Emitter } from 'socket.io-client/build/typed-events';

  export * from 'socket.io-client/build/manager';
  export * from 'socket.io-client/build/socket';
  export * from 'socket.io-client/build/on';
  export * from 'socket.io-client/build/contrib/bytebuffer';
  export * from 'socket.io-client/build/contrib/parseuri';
  
  const io: {
    // Main function signatures
    (uri?: string, opts?: Partial<ManagerOptions & SocketOptions>): Socket<DefaultEventsMap, DefaultEventsMap>;
    <ListenEvents extends EventsMap = DefaultEventsMap, EmitEvents extends EventsMap = ListenEvents>(
      uri?: string,
      opts?: Partial<ManagerOptions & SocketOptions>
    ): Socket<ListenEvents, EmitEvents>;
    
    // Additional properties
    protocol: number;
    Socket: typeof Socket;
    Manager: typeof Manager;
  };

  export default io;

  // Re-export types for convenience
  export type { Socket } from 'socket.io-client/build/socket';
  export type { Manager } from 'socket.io-client/build/manager';
  export type { 
    ManagerOptions, 
    SocketOptions,
    DefaultEventsMap,
    EventsMap,
    EventNames,
    EventParams,
    Emitter
  };
}
