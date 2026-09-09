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
  private processedEvents: Set<string> = new Set();

  // Public WebSocket Relay for Cross-Device / Internet Signaling (Vercel)
  private wsRelay: WebSocket | null = null;
  private heartbeatTimer: number | null = null;

  public init(roomCode: string): void {
    const cleanRoom = roomCode.toUpperCase().trim();
    if (
      this.currentRoom === cleanRoom &&
      (this.channel || (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN))
    ) {
      return;
    }

    this.leave();

    this.currentRoom = cleanRoom;
    this.processedEvents.clear();

    // 1. BroadcastChannel (Same Browser Multi-Tab Sync)
    try {
      this.channel = new BroadcastChannel(`edumeet_room_${cleanRoom}`);
      this.channel.onmessage = (e: MessageEvent<RoomEvent>) => {
        if (e.data && e.data.roomCode === this.currentRoom) {
          this.notifyListeners(e.data);
        }
      };
    } catch (err) {
      console.warn('BroadcastChannel not available:', err);
    }

    // 2. localStorage Storage Event (Same Machine Multi-Window Fallback)
    this.storageListener = (e: StorageEvent) => {
      if (e.key === `edumeet_event_${cleanRoom}` && e.newValue) {
        try {
          const event: RoomEvent = JSON.parse(e.newValue);
          if (event && event.roomCode === this.currentRoom) {
            this.notifyListeners(event);
          }
        } catch (err) {
          // ignore
        }
      }
    };
    window.addEventListener('storage', this.storageListener);

    // 3. Internet WebSocket Relay (For Vercel / Cross-Device Worldwide Connections)
    this.connectWebSocketRelay(cleanRoom);
  }

  private connectWebSocketRelay(roomCode: string): void {
    try {
      // PieSocket Public Relay channel for this specific room code
      const apiKey = 'VCWS5aCouB5wBxcmhfPpRR9moEJu-nWKfkBXBSLR';
      const wsUrl = `wss://relay.piesocket.com/v3/edumeet_${roomCode.toLowerCase()}?api_key=${apiKey}&notify_self=0`;

      const ws = new WebSocket(wsUrl);
      this.wsRelay = ws;

      ws.onopen = () => {
        // Send periodic ping to keep cloud WebSocket connection active
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING', roomCode }));
          }
        }, 20000);
      };

      ws.onmessage = (msgEvent: MessageEvent) => {
        try {
          const event: RoomEvent = JSON.parse(msgEvent.data);
          if (event && event.roomCode === this.currentRoom && event.type !== 'PING') {
            this.notifyListeners(event);
          }
        } catch (err) {
          // ignore non-JSON or ping frames
        }
      };

      ws.onerror = (err) => {
        console.warn('[Realtime] Cloud WebSocket Relay warning:', err);
      };

      ws.onclose = () => {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      };
    } catch (err) {
      console.warn('[Realtime] Could not initialize Cloud WebSocket Relay:', err);
    }
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

    // 1. Local BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.error('Error posting BroadcastChannel message:', err);
      }
    }

    // 2. Local localStorage
    try {
      const storageKey = `edumeet_event_${this.currentRoom}`;
      const payloadWithNonce = JSON.stringify({
        ...event,
        _nonce: Math.random().toString(36).substring(2) + '_' + Date.now()
      });
      localStorage.setItem(storageKey, payloadWithNonce);
    } catch (err) {
      // ignore quota error
    }

    // 3. Internet Cloud WebSocket Relay (Crucial for Vercel / Cross-Device links)
    if (this.wsRelay && this.wsRelay.readyState === WebSocket.OPEN) {
      try {
        this.wsRelay.send(JSON.stringify(event));
      } catch (err) {
        console.error('Error sending via WebSocket Relay:', err);
      }
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
    const eventId = `${event.senderId}_${event.type}_${event.timestamp}_${JSON.stringify(event.payload).length}`;
    if (this.processedEvents.has(eventId)) {
      return; // Ignore duplicate event received over local + cloud channels
    }
    this.processedEvents.add(eventId);

    if (this.processedEvents.size > 200) {
      const firstVal = this.processedEvents.values().next().value;
      if (firstVal) this.processedEvents.delete(firstVal);
    }

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
    if (this.wsRelay) {
      this.wsRelay.close();
      this.wsRelay = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentRoom = null;
    this.listeners.clear();
    this.processedEvents.clear();
  }
}

export const realtimeService = new RealtimeChannelService();
