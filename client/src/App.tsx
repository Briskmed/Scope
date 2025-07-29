import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext';
import { SpeechRecognitionProvider } from './contexts/SpeechRecognitionContext';
import SpeechRecognitionUI from './components/SpeechRecognitionUI';
import './App.css';

// Define types for our application
type Participant = {
  id: string;
  username: string;
  stream?: MediaStream;
};

// WebRTCMessage type removed as it's not being used

// Main App component that wraps everything with WebSocketProvider
const App: React.FC = () => {
  // Memoize WebSocket URL to prevent unnecessary re-renders
  const socketUrl = useMemo(() => {
    const baseUrl = process.env.REACT_APP_WS_URL || 'http://localhost:3001';
    // Create URL object to properly handle hostname and protocol
    const url = new URL(baseUrl);
    // Set WebSocket protocol (ws or wss)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Remove any trailing slashes
    const socketUrl = url.toString().replace(/\/+$/, '');
    console.log('Constructed WebSocket URL:', socketUrl);
    return socketUrl;
  }, []); // Empty dependency array means this runs once on mount
  
  return (
    <WebSocketProvider 
      url={socketUrl}
      onMessage={(event, data) => {
        console.log('WebSocket message:', event, data);
      }}
      onError={(error) => {
        console.error('WebSocket error:', error);
      }}
      onStatusChange={(status) => {
        console.log('WebSocket status changed:', status);
      }}
    >
      <AppContent />
    </WebSocketProvider>
  );
};

// Define the AppContent component with proper typing
const AppContent: React.FC = () => {
  // WebSocket context
  const { send, on, status, isConnected } = useWebSocketContext();
  
  // State management
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [transcript] = useState(''); // setTranscript not used
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  
  // Event handler types
  type StreamHandler = (data: { userId: string; stream: MediaStream | MediaStreamTrack[] }) => void;
  type ParticipantLeftHandler = (userId: string) => void;
  
  // Handle WebSocket connection status changes
  useEffect(() => {
    console.log('WebSocket status:', status);
    
    if (isConnected && username && roomId) {
      // Rejoin room if we were in a call
      send('join-room', { roomId, username });
    }
  }, [status, isConnected, roomId, username, send]);

  // Handle joining a room
  const joinRoom = useCallback(async (roomId: string, username: string) => {
    try {
      // Request microphone and camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      
      // Set local stream
      setLocalStream(stream);
      
      // Update video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Join the room via WebSocket
      await send('join-room', { roomId, username });
      
      // Update state
      setRoomId(roomId);
      setUsername(username);
      setIsInCall(true);
      
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Failed to access media devices. Please check your permissions.');
    }
  }, [send]);
  
  // Handle leaving the room
  const leaveRoom = useCallback(async () => {
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    
    // Leave the room
    if (isConnected) {
      await send('leave-room', { roomId });
    }
    
    // Reset state
    setParticipants([]);
    setRoomId('');
    setUsername('');
    setIsInCall(false);
  }, [localStream, roomId, isConnected, send]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isInCall) {
        leaveRoom();
      }
    };
  }, [isInCall, leaveRoom]);

  // WebSocket event handlers
  useEffect(() => {
    if (!isConnected) return;

    const handleJoin = (data: { username: string; id: string }) => {
      console.log('User joined:', data);
      // Add new participant
      setParticipants(prev => [...prev, { id: data.id, username: data.username }]);
    };

    const handleLeave = (data: { userId: string }) => {
      console.log('User left:', data);
      // Clean up peer connection
      if (peerConnections.current[data.userId]) {
        peerConnections.current[data.userId].close();
        delete peerConnections.current[data.userId];
      }
      // Remove participant
      setParticipants(prev => prev.filter(p => p.id !== data.userId));
    };

    const handleDisconnect = (reason: string) => {
      console.warn('Disconnected from WebSocket server:', reason);
      if (reason === 'io server disconnect') {
        console.log('Server closed the connection');
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      console.log(`Reconnection attempt ${attempt}`);
    };

    const handleReconnect = (attempt: number) => {
      console.log(`Successfully reconnected after ${attempt} attempts`);
      if (username) {
        send('rejoin', { username }).catch(console.error);
      }
    };

    // Set up event listeners
    const cleanupJoin = on('user-joined', handleJoin);
    const cleanupLeave = on('user-left', handleLeave);
    const cleanupDisconnect = on('disconnect', handleDisconnect);
    const cleanupReconnectAttempt = on('reconnect_attempt', handleReconnectAttempt);
    const cleanupReconnect = on('reconnect', handleReconnect);

    // Clean up on unmount
    return () => {
      cleanupJoin();
      cleanupLeave();
      cleanupDisconnect();
      cleanupReconnectAttempt();
      cleanupReconnect();
    };
  }, [isConnected, username, on, send]);

  // Handle incoming streams from other participants
  const handleStream: StreamHandler = useCallback(({ userId, stream: streamData }) => {
    console.log(`Received stream from user ${userId}`);
    
    // Create a new MediaStream and add tracks directly
    const stream = new MediaStream();
    if ('getTracks' in streamData) {
      // If it's a proper MediaStream object
      streamData.getTracks().forEach((track: MediaStreamTrack) => {
        stream.addTrack(track);
      });
    } else if (Array.isArray(streamData)) {
      // If it's an array of tracks
      streamData.forEach((track: MediaStreamTrack) => {
        if (track instanceof MediaStreamTrack) {
          stream.addTrack(track);
        }
      });
    }
    
    // Update participants state with the new stream
    setParticipants(prevParticipants => {
      const existingParticipant = prevParticipants.find(p => p.id === userId);
      if (existingParticipant) {
        // Update existing participant's stream
        return prevParticipants.map(p => 
          p.id === userId ? { ...p, stream } : p
        ) as Participant[];
      } else {
        // Add new participant with proper type
        const newParticipant: Participant = { 
          id: userId, 
          username: `User ${userId.substring(0, 5)}`, 
          stream 
        };
        return [...prevParticipants, newParticipant];
      }
    });
  }, []);
  
  // Handle participant leaving
  const handleParticipantLeft: ParticipantLeftHandler = useCallback((userId: string) => {
    console.log(`Participant ${userId} left the call`);
    setParticipants(prev => prev.filter(p => p.id !== userId));
  }, []);
  
  // Set up event listeners for streams and participant events
  useEffect(() => {
    if (!isConnected) return;
    
    const cleanupStream = on('stream', handleStream);
    const cleanupParticipantLeft = on('participant-left', handleParticipantLeft);
    
    return () => {
      cleanupStream();
      cleanupParticipantLeft();
    };
  }, [isConnected, on, handleStream, handleParticipantLeft]);

  // Update video elements when streams change
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }

    Object.entries(remoteVideosRef.current).forEach(([userId, videoElement]) => {
      if (videoElement) {
        const participant = participants.find(p => p.id === userId);
        if (participant?.stream) {
          videoElement.srcObject = participant.stream;
        }
      }
    });
  }, [participants, localStream]);

  const startCall = async () => {
    if (!roomId.trim() || !username.trim()) {
      alert('Please enter a room ID and your name');
      return;
    }
    
    try {
      await joinRoom(roomId, username);
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Failed to start call. Please try again.');
    }
  };

  const endCall = useCallback(async () => {
    await leaveRoom();
  }, [leaveRoom]);

  // Render UI
  return (
    <div className="app">
      <h1>Video Call App</h1>
      
      {/* Speech Recognition UI */}
      <div className="speech-ui-container">
        <SpeechRecognitionProvider
          options={{
            serverUrl: process.env.REACT_APP_WS_URL || 'ws://localhost:3001',
            debug: process.env.NODE_ENV === 'development',
          }}
          onTranscript={(transcript, isFinal) => {
            if (isFinal && transcript) {
              console.log('Final transcript:', transcript);
              // You can send the transcript to other participants via WebSocket if needed
              if (isConnected && roomId) {
                send('transcript', { roomId, transcript });
              }
            }
          }}
          onError={(error) => {
            console.error('Speech recognition error:', error);
          }}
        >
          <SpeechRecognitionUI 
            showVisualizer={true}
            visualizerType="bars"
            showControls={true}
            showTranscript={true}
            showStatus={true}
            showError={true}
            style={{
              maxWidth: '600px',
              margin: '20px auto',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
              backgroundColor: '#f8f9fa',
            }}
          />
        </SpeechRecognitionProvider>
      </div>
      
      {!isInCall ? (
        <div className="join-form">
          <input
            type="text"
            placeholder="Your Name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={startCall} disabled={!roomId.trim() || !username.trim()}>
            Join Call
          </button>
        </div>
      ) : (
        <div className="call-container">
          <div className="videos">
            <div className="local-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="video"
              />
              <div className="username">You ({username})</div>
            </div>
            
            {participants.map((participant) => (
              <div key={participant.id} className="remote-video">
                <video
                  ref={(el) => {
                    if (el) {
                      remoteVideosRef.current[participant.id] = el;
                    } else {
                      delete remoteVideosRef.current[participant.id];
                    }
                  }}
                  autoPlay
                  playsInline
                  className="video"
                />
                <div className="username">{participant.username}</div>
              </div>
            ))}
          </div>
          
          <div className="controls">
            <button onClick={endCall} className="end-call">
              End Call
            </button>
          </div>
          
          {transcript && (
            <div className="transcript">
              <h3>Transcript</h3>
              <p>{transcript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
