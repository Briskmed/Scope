import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Call, Participant, Room } from '../types';

interface RoomMap {
  [roomId: string]: Room;
}

export class WebRTCService {
  private rooms: RoomMap = {};
  private activeCalls: { [callId: string]: Call } = {};

  /**
   * Create a new video call room
   */
  public createRoom(creatorId: string, metadata: any = {}): Room {
    const roomId = this.generateRoomId();
    const room: Room = {
      id: roomId,
      participants: new Map<string, Participant>(),
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        createdBy: creatorId,
      },
    };

    this.rooms[roomId] = room;
    return room;
  }

  /**
   * Add a participant to a room
   */
  public addParticipant(roomId: string, participant: Omit<Participant, 'id' | 'joinedAt'>): Participant | null {
    const room = this.rooms[roomId];
    if (!room) return null;

    const participantId = uuidv4();
    const newParticipant: Participant = {
      ...participant,
      id: participantId,
      joinedAt: new Date().toISOString(),
    };

    room.participants.set(participantId, newParticipant);
    return newParticipant;
  }

  /**
   * Remove a participant from a room
   */
  public removeParticipant(roomId: string, participantId: string): boolean {
    const room = this.rooms[roomId];
    if (!room) return false;

    return room.participants.delete(participantId);
  }

  /**
   * Get room information
   */
  public getRoom(roomId: string): Room | null {
    return this.rooms[roomId] || null;
  }

  /**
   * End a call and clean up resources
   */
  public endCall(roomId: string): boolean {
    if (this.rooms[roomId]) {
      delete this.rooms[roomId];
      return true;
    }
    return false;
  }

  /**
   * Handle WebRTC signaling
   */
  public handleSignal(roomId: string, from: string, to: string, signal: any): boolean {
    const room = this.rooms[roomId];
    if (!room) return false;

    // In a real implementation, you would forward this signal to the target participant
    // This is a simplified version
    return true;
  }

  /**
   * Generate a unique room ID
   */
  private generateRoomId(): string {
    return `room_${Math.random().toString(36).substr(2, 9)}`;
  }
}
