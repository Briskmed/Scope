import { Server, Socket } from 'socket.io';
import { WebRTCService } from '../services/WebRTCService';
import { Participant, Room, SignalingMessage } from '../types';

export function initSocketHandlers(io: Server, webRTCService: WebRTCService) {
  io.on('connection', (socket: Socket) => {
    console.log(`New connection: ${socket.id}`);

    // Join a room
    socket.on('join-room', async ({ roomId, user }: { roomId: string; user: Omit<Participant, 'id' | 'joinedAt'> }) => {
      try {
        // Check if room exists, create if not
        let room = webRTCService.getRoom(roomId);
        if (!room) {
          room = webRTCService.createRoom(user.userId, {
            title: `Consultation ${new Date().toLocaleString()}`,
          });
        }

        // Add participant to room
        const participant = webRTCService.addParticipant(roomId, user);
        if (!participant) {
          throw new Error('Failed to join room');
        }

        // Join the socket room
        await socket.join(roomId);
        
        // Notify others in the room
        socket.to(roomId).emit('participant-joined', {
          participant,
          roomId,
        });

        // Send room info to the new participant
        socket.emit('room-info', {
          room,
          participantId: participant.id,
        });

      } catch (error: unknown) {
        console.error('Error joining room:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        socket.emit('error', {
          code: 'JOIN_ERROR',
          message: 'Failed to join room',
          details: errorMessage,
        });
      }
    });

    // Handle WebRTC signaling
    socket.on('signal', (data: SignalingMessage & { roomId: string }) => {
      const { roomId, to, ...message } = data;
      
      // Forward the signal to the target participant
      if (to) {
        socket.to(to).emit('signal', {
          ...message,
          from: socket.id,
        });
      } else {
        // Broadcast to all in room if no specific target
        socket.to(roomId).emit('signal', {
          ...message,
          from: socket.id,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // In a real implementation, clean up participant from rooms
    });

    // Handle leave room
    socket.on('leave-room', ({ roomId, participantId }: { roomId: string; participantId: string }) => {
      const left = webRTCService.removeParticipant(roomId, participantId);
      if (left) {
        socket.to(roomId).emit('participant-left', {
          participantId,
          roomId,
        });
      }
      socket.leave(roomId);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
}
