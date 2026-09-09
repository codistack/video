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
  | 'ANSWER'
  | 'ROOM_MEMBERS';

export interface RoomEvent {
  type: EventType;
  roomCode: string;
  senderId: string;
  payload: any;
  timestamp: number;
}

type EventListener = (event: RoomEvent) => void;

interface ParticipantMeta {
  name: string;
  role: 'admin' | 'student';
  id?: string;
}

class RealtimeChannelService {
  private channel: BroadcastChannel | null = null;
  private currentRoom: string | null = null;
  private currentSenderId: string | null = null;
  private currentParticipantInfo: ParticipantMeta | null = null;
  private listeners: Map<EventType | '*', Set<EventListener>> = new Map();
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private processedEvents: Set<string> = new Set();

  // Internal WebSocket connection to /ws
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private messageQueue: string[] = [];

  public init(roomCode: string, participantInfo?: ParticipantMeta): void {
    const cleanRoom = roomCode.toUpperCase().trim();
    if (participantInfo) {
      this.currentParticipantInfo = participantInfo;
      if (participantInfo.id) {
        this.currentSenderId = participantInfo.id;
      }
    }

    if (
      this.currentRoom === cleanRoom &&
      ((this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) || this.channel)
    ) {
      return;
    }

    this.leave();

    this.currentRoom = cleanRoom;
    this.processedEvents.clear();

    // 1. BroadcastChannel (Fast Same Browser Multi-Tab Sync)
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

    // 2. localStorage Storage Event (Same Machine Fallback)
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

    // 3. Robust Internal Full-Stack WebSocket Server (/ws)
    this.connectInternalWebSocket(cleanRoom);
  }

  private connectInternalWebSocket(roomCode: string): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        // Subscribe to this room on the server
        const subMsg = JSON.stringify({
          type: 'SUBSCRIBE',
          roomCode,
          senderId: this.currentSenderId || 'anonymous',
          payload: this.currentParticipantInfo || { role: 'student', name: 'Usuario' },
          timestamp: Date.now()
        });
        ws.send(subMsg);

        // Flush any queued outgoing messages
        while (this.messageQueue.length > 0) {
          const queued = this.messageQueue.shift();
          if (queued) ws.send(queued);
        }

        // Periodic ping to keep alive
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
          if (event && event.roomCode === this.currentRoom && event.type !== 'PONG') {
            this.notifyListeners(event);
          }
        } catch (err) {
          // ignore non-JSON frames
        }
      };

      ws.onerror = (err) => {
        console.warn('[Realtime] WebSocket notice:', err);
      };

      ws.onclose = () => {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }

        // Reconnect if still in the same room
        if (this.currentRoom === roomCode && !this.reconnectTimer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (this.currentRoom === roomCode) {
              this.connectInternalWebSocket(roomCode);
            }
          }, 2000);
        }
      };
    } catch (err) {
      console.warn('[Realtime] Could not initialize internal WebSocket:', err);
    }
  }

  public send(type: EventType, senderId: string, payload: any): void {
    if (!this.currentRoom) return;
    this.currentSenderId = senderId;

    const event: RoomEvent = {
      type,
      roomCode: this.currentRoom,
      senderId,
      payload,
      timestamp: Date.now()
    };

    const rawString = JSON.stringify(event);

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

    // 3. Full-Stack WebSocket Server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(rawString);
      } catch (err) {
        console.error('Error sending via WebSocket:', err);
      }
    } else {
      // Buffer until open
      this.messageQueue.push(rawString);
      if (this.messageQueue.length > 50) this.messageQueue.shift();
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
    // Ignore self-broadcasts
    if (this.currentSenderId && event.senderId === this.currentSenderId) {
      return;
    }

    // Build a stable event ID using sender + type + timestamp + payload excerpt
    const payloadStr = JSON.stringify(event.payload || '');
    const eventId = `${event.senderId}_${event.type}_${event.timestamp}_${payloadStr.slice(0, 64)}`;
    if (this.processedEvents.has(eventId)) {
      return; // Ignore duplicate event
    }
    this.processedEvents.add(eventId);

    if (this.processedEvents.size > 300) {
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.messageQueue = [];
    this.currentRoom = null;
    this.currentParticipantInfo = null;
    this.listeners.clear();
    this.processedEvents.clear();
  }
}

export const realtimeService = new RealtimeChannelService();
