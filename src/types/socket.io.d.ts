declare module 'socket.io' {
  import { Server as HttpServer } from 'http';
  import { Server as HttpsServer } from 'https';
  import { EventEmitter } from 'events';

  interface ServerOptions {
    path?: string;
    serveClient?: boolean;
    pingTimeout?: number;
    pingInterval?: number;
    cookie?: boolean | string;
    cors?: {
      origin: string | string[];
      methods?: string[];
      allowedHeaders?: string[];
      credentials?: boolean;
    };
  }

  interface Socket extends EventEmitter {
    id: string;
    handshake: {
      headers: Record<string, string>;
      time: string;
      address: string;
      xdomain: boolean;
      secure: boolean;
      issued: number;
      url: string;
      query: Record<string, string>;
      auth: Record<string, any>;
    };
    rooms: Set<string>;
    join(room: string): void;
    leave(room: string): void;
    to(room: string): Socket;
    emit(event: string, ...args: any[]): boolean;
    disconnect(close?: boolean): Socket;
  }

  interface Server extends EventEmitter {
    serveClient(v: boolean): Server;
    path(v: string): Server;
    adapter(v: any): Server;
    origins(v: string): Server;
    origins(fn: (origin: string, callback: (err: Error | null, success: boolean) => void) => void): Server;
    attach(srv: HttpServer | HttpsServer | number, opts?: ServerOptions): Server;
    listen(srv: HttpServer | HttpsServer | number, opts?: ServerOptions): Server;
    on(event: 'connection', listener: (socket: Socket) => void): this;
    on(event: string, listener: Function): this;
    of(nsp: string): Namespace;
  }

  interface Namespace extends EventEmitter {
    name: string;
    connected: { [id: string]: Socket };
    use(fn: (socket: Socket, fn: (err?: any) => void) => void): Namespace;
    on(event: 'connection', listener: (socket: Socket) => void): this;
    emit(event: string, ...args: any[]): Namespace;
  }

  function Server(opts?: ServerOptions): Server;
  function Server(srv: HttpServer | HttpsServer, opts?: ServerOptions): Server;
  function listen(srv: HttpServer | HttpsServer | number, opts?: ServerOptions): Server;

  export { Server, Socket, Namespace };
  export = Server;
}
