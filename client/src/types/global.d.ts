// Type definitions for MediaStream and other browser APIs
declare interface MediaDevices {
  getDisplayMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;
  getSupportedConstraints(): MediaTrackSupportedConstraints;
}

declare interface HTMLVideoElement {
  srcObject: MediaStream | MediaSource | Blob | null;
  captureStream(frameRate?: number): MediaStream;
}

declare interface Window {
  webkitAudioContext: typeof AudioContext;
  webkitMediaStream: typeof MediaStream;
  webkitRTCPeerConnection: typeof RTCPeerConnection;
}

// For WebRTC
declare interface RTCSessionDescriptionInit {
  type: RTCSdpType;
  sdp: string;
}

declare interface RTCPeerConnection {
  createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit>;
  createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender;
  removeTrack(sender: RTCRtpSender): void;
  getSenders(): RTCRtpSender[];
  getReceivers(): RTCRtpReceiver[];
  getTransceivers(): RTCRtpTransceiver[];
  getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;
  restartIce(): void;
}

// For Web Audio API
declare class AudioContext {
  constructor(contextOptions?: AudioContextOptions);
  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
  createMediaStreamDestination(): MediaStreamAudioDestinationNode;
  close(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  readonly state: AudioContextState;
  readonly sampleRate: number;
  readonly currentTime: number;
  onstatechange: ((this: AudioContext, ev: Event) => any) | null;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ): void;
}

declare interface AudioContextOptions {
  latencyHint?: AudioContextLatencyCategory | number;
  sampleRate?: number;
}

declare type AudioContextState = 'suspended' | 'running' | 'closed';

declare interface MediaStreamAudioSourceNode extends AudioNode {
  mediaStream: MediaStream;
}

declare interface MediaStreamAudioDestinationNode extends AudioNode {
  stream: MediaStream;
}

// For MediaRecorder
declare class MediaRecorder extends EventTarget {
  constructor(stream: MediaStream, options?: MediaRecorderOptions);
  start(timeslice?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  requestData(): Blob;
  
  readonly stream: MediaStream;
  readonly mimeType: string;
  readonly state: 'inactive' | 'recording' | 'paused';
  readonly videoBitsPerSecond: number;
  readonly audioBitsPerSecond: number;
  
  onstart: ((this: MediaRecorder, ev: Event) => any) | null;
  onstop: ((this: MediaRecorder, ev: Event) => any) | null;
  ondataavailable: ((this: MediaRecorder, ev: BlobEvent) => any) | null;
  onpause: ((this: MediaRecorder, ev: Event) => any) | null;
  onresume: ((this: MediaRecorder, ev: Event) => any) | null;
  onerror: ((this: MediaRecorder, ev: MediaRecorderErrorEvent) => any) | null;
  
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ): void;
}

declare interface MediaRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  bitsPerSecond?: number;
}

declare interface BlobEvent extends Event {
  readonly data: Blob;
  readonly timecode: number;
}

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

// For WebSocket
interface WebSocket {
  binaryType: BinaryType;
  readonly bufferedAmount: number;
  readonly extensions: string;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null;
  onerror: ((this: WebSocket, ev: Event) => any) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
  onopen: ((this: WebSocket, ev: Event) => any) | null;
  readonly protocol: string;
  readonly readyState: number;
  readonly url: string;
  close(code?: number, reason?: string): void;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  readonly CLOSED: number;
  readonly CLOSING: number;
  readonly CONNECTING: number;
  readonly OPEN: number;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ): void;
}
