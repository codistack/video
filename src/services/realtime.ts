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
  private storageListener: ((e: StorageEvent) => void) | null = null;

  public init(roomCode: string): void {
    const cleanRoom = roomCode.toUpperCase().trim();
    if (this.currentRoom === cleanRoom && this.channel) return;

    this.leave();

    this.currentRoom = cleanRoom;
    try {
      this.channel = new BroadcastChannel(`edumeet_room_${cleanRoom}`);
      this.channel.onmessage = (e: MessageEvent<RoomEvent>) => {
        if (e.data && e.data.roomCode === this.currentRoom) {
          this.notifyListeners(e.data);
        }
      };
    } catch (err) {
      console.warn('BroadcastChannel not available, relying on localStorage events:', err);
    }

    // Fallback/secondary listener using window storage event
    this.storageListener = (e: StorageEvent) => {
      if (e.key === `edumeet_event_${cleanRoom}` && e.newValue) {
        try {
          const event: RoomEvent = JSON.parse(e.newValue);
          if (event && event.roomCode === this.currentRoom) {
            this.notifyListeners(event);
          }
        } catch (err) {
          // ignore parse errors
        }
      }
    };
    window.addEventListener('storage', this.storageListener);
  }

  public send(type: EventType, senderId: string, payload: any): void {
    if (!this.currentRoom) return;

    const event: RoomEvent = {
      type,
      roomCode: this.currentRoom,
      senderId,
      payload,
      timestamp: Date.now()
    };

    // 1. Post to BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.error('Error posting BroadcastChannel message:', err);
      }
    }

    // 2. Post to localStorage for cross-window / tab fallback
    try {
      const storageKey = `edumeet_event_${this.currentRoom}`;
      localStorage.setItem(storageKey, JSON.stringify(event));
    } catch (err) {
      // ignore quota errors
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
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    this.currentRoom = null;
    this.listeners.clear();
  }
}

export const realtimeService = new RealtimeChannelService();
