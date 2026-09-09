import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface ClassSession {
  id: string;
  code: string;
  title: string;
  subject: string;
  date: string;
  time: string;
  accessMode: 'direct' | 'permission';
  adminName: string;
  createdAt: string;
  status: 'scheduled' | 'live' | 'ended';
}

interface RoomEvent {
  type: string;
  roomCode: string;
  senderId: string;
  payload?: any;
  timestamp?: number;
}

interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
  roomCode?: string;
  senderId?: string;
  userName?: string;
  userRole?: 'admin' | 'student';
}

// In-memory class session store with demo classes
const classesStore: Map<string, ClassSession> = new Map();

const DEFAULT_CLASSES: ClassSession[] = [
  {
    id: 'demo-1',
    code: 'MATH-2026',
    title: 'Matemáticas Avanzadas: Cálculo Diferencial',
    subject: 'Matemáticas',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    accessMode: 'permission',
    adminName: 'Prof. Carlos Mendoza',
    createdAt: new Date().toISOString(),
    status: 'scheduled'
  },
  {
    id: 'demo-2',
    code: 'PROG-101',
    title: 'Introducción a Desarrollo Web y React',
    subject: 'Programación',
    date: new Date().toISOString().split('T')[0],
    time: '16:00',
    accessMode: 'direct',
    adminName: 'Ing. Ana Torres',
    createdAt: new Date().toISOString(),
    status: 'scheduled'
  }
];

DEFAULT_CLASSES.forEach(cls => classesStore.set(cls.code.toUpperCase(), cls));

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  app.use(express.json());

  // REST API Routes
  app.get('/api/classes', (_req, res) => {
    const list = Array.from(classesStore.values());
    res.json(list);
  });

  app.get('/api/classes/:code', (req, res) => {
    const code = req.params.code.trim().toUpperCase();
    const found = classesStore.get(code);
    if (found) {
      res.json(found);
    } else {
      res.status(404).json({ error: 'Class not found' });
    }
  });

  app.post('/api/classes', (req, res) => {
    const body = req.body;
    if (!body || !body.code || !body.title) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const cleanCode = body.code.trim().toUpperCase();
    const newClass: ClassSession = {
      id: body.id || 'class-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      code: cleanCode,
      title: body.title.trim(),
      subject: (body.subject || 'General').trim(),
      date: body.date || new Date().toISOString().split('T')[0],
      time: body.time || '10:00',
      accessMode: body.accessMode || 'permission',
      adminName: body.adminName || 'Profesor',
      createdAt: new Date().toISOString(),
      status: 'scheduled'
    };
    classesStore.set(cleanCode, newClass);
    res.status(201).json(newClass);
  });

  app.patch('/api/classes/:id', (req, res) => {
    const { id } = req.params;
    let found: ClassSession | undefined;
    for (const cls of classesStore.values()) {
      if (cls.id === id) {
        found = cls;
        break;
      }
    }
    if (!found) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    Object.assign(found, req.body);
    classesStore.set(found.code.toUpperCase(), found);
    res.json(found);
  });

  app.delete('/api/classes/:id', (req, res) => {
    const { id } = req.params;
    for (const [code, cls] of classesStore.entries()) {
      if (cls.id === id) {
        classesStore.delete(code);
        break;
      }
    }
    res.json({ success: true });
  });

  // WebSocket Server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Map of roomCode -> Set of WebSocket clients
  const rooms: Map<string, Set<ExtendedWebSocket>> = new Map();

  function broadcastToRoom(roomCode: string, message: string, senderWs?: ExtendedWebSocket) {
    const cleanRoom = roomCode.toUpperCase();
    const clients = rooms.get(cleanRoom);
    if (!clients) return;

    for (const client of clients) {
      if (client !== senderWs && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  function sendToTarget(roomCode: string, targetId: string, message: string, fallbackWs?: ExtendedWebSocket) {
    const cleanRoom = roomCode.toUpperCase();
    const clients = rooms.get(cleanRoom);
    if (!clients) return;

    let delivered = false;
    for (const client of clients) {
      if (client.senderId === targetId && client.readyState === WebSocket.OPEN) {
        client.send(message);
        delivered = true;
      }
    }

    // Fallback broadcast if target was not matched by socket senderId
    if (!delivered && fallbackWs) {
      broadcastToRoom(cleanRoom, message, fallbackWs);
    }
  }

  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const rawString = data.toString();
        const event: RoomEvent = JSON.parse(rawString);

        if (!event || !event.roomCode) return;
        const cleanRoom = event.roomCode.toUpperCase().trim();

        // Handle Subscription / Join to a Room
        if (event.type === 'SUBSCRIBE') {
          ws.roomCode = cleanRoom;
          ws.senderId = event.senderId;
          if (event.payload) {
            ws.userName = event.payload.name;
            ws.userRole = event.payload.role;
          }

          if (!rooms.has(cleanRoom)) {
            rooms.set(cleanRoom, new Set());
          }
          rooms.get(cleanRoom)!.add(ws);

          // Build current active members list for this room
          const activeMembers: Array<{ id: string; name: string; role: string }> = [];
          for (const client of rooms.get(cleanRoom)!) {
            if (client.senderId && client.readyState === WebSocket.OPEN) {
              activeMembers.push({
                id: client.senderId,
                name: client.userName || 'Usuario',
                role: client.userRole || 'student'
              });
            }
          }

          // Send current active members back to the newly subscribed client
          ws.send(JSON.stringify({
            type: 'ROOM_MEMBERS',
            roomCode: cleanRoom,
            senderId: 'server',
            payload: { members: activeMembers },
            timestamp: Date.now()
          }));

          return;
        }

        // Handle PING
        if (event.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', roomCode: cleanRoom, timestamp: Date.now() }));
          return;
        }

        // Targeted messaging: WebRTC peer-to-peer signaling
        const targetId = event.payload?.targetId || event.payload?.targetParticipantId;
        if (targetId && (
          event.type === 'OFFER' ||
          event.type === 'ANSWER' ||
          event.type === 'ICE_CANDIDATE'
        )) {
          sendToTarget(cleanRoom, targetId, rawString, ws);
        } else {
          // Broadcast to all other peers in the room (including CHAT_MESSAGE, FORCE_MUTE, FORCE_CAMERA_OFF, PARTICIPANT_UPDATE)
          broadcastToRoom(cleanRoom, rawString, ws);
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      if (ws.roomCode) {
        const roomSet = rooms.get(ws.roomCode);
        if (roomSet) {
          roomSet.delete(ws);
          if (roomSet.size === 0) {
            rooms.delete(ws.roomCode);
          }
        }
        if (ws.senderId) {
          // Notify other participants that this user has left
          broadcastToRoom(ws.roomCode, JSON.stringify({
            type: 'PARTICIPANT_LEAVE',
            roomCode: ws.roomCode,
            senderId: ws.senderId,
            payload: { id: ws.senderId },
            timestamp: Date.now()
          }));
        }
      }
    });
  });

  // Heartbeat interval to detect and clean up dead sockets
  const pingInterval = setInterval(() => {
    for (const ws of wss.clients as Set<ExtendedWebSocket>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Vite middleware in dev or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`EduMeet Pro server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start EduMeet Pro server:', err);
});
