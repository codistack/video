import { ChatMessage, Participant, TranscriptionItem } from '../types/conference';

export type EventType =
  | 'JOIN_REQUEST'
  | 'JOIN_RESPONSE'
  | 'PARTICIPANT_UPDATE'
  | 'PARTICIPANT_LEAVE'
  | 'FORCE_MUTE'
  | 'FORCE_CAMERA_OFF'
  | 'CHAT_MESSAGE'
  | 'TRANSCRIPTION'
  | 'ROOM_SYNC'
  | 'ICE_CANDIDATE'
  | 'OFFER'
  | 'ANSWER';

export interface RoomEvent {
  type: EventType;
  roomCode: string;
  senderId: string;
  payload: any;
  timestamp: number;
}

type EventListener = (event: RoomEvent) => void;

class RealtimeChannelService {
  private channel: BroadcastChannel | null = null;
  private currentRoom: string | null = null;
  private listeners: Map<EventType | '*', Set<EventListener>> = new Map();

  public init(roomCode: string): void {
    const cleanRoom = roomCode.toUpperCase().trim();
    if (this.channel && this.currentRoom === cleanRoom) return;

    if (this.channel) {
      this.channel.close();
    }

    this.currentRoom = cleanRoom;
    this.channel = new BroadcastChannel(`edumeet_room_${cleanRoom}`);
    
    this.channel.onmessage = (e: MessageEvent<RoomEvent>) => {
      if (e.data && e.data.roomCode === this.currentRoom) {
        this.notifyListeners(e.data);
      }
    };
  }

  public send(type: EventType, senderId: string, payload: any): void {
    if (!this.channel || !this.currentRoom) return;

    const event: RoomEvent = {
      type,
      roomCode: this.currentRoom,
      senderId,
      payload,
      timestamp: Date.now()
    };

    try {
      this.channel.postMessage(event);
      // Trigger locally as well if requested
    } catch (err) {
      console.error('Error posting BroadcastChannel message:', err);
    }
  }

  public subscribe(type: EventType | '*', listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(listener);
      }
    };
  }

  private notifyListeners(event: RoomEvent): void {
    const specific = this.listeners.get(event.type);
    if (specific) {
      specific.forEach(fn => fn(event));
    }
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach(fn => fn(event));
    }
  }

  public leave(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.currentRoom = null;
    this.listeners.clear();
  }
}

export const realtimeService = new RealtimeChannelService();
