import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  MonitorOff, 
  MessageSquare, 
  Users, 
  Subtitles, 
  Disc, 
  Square, 
  PhoneOff, 
  Copy, 
  Check, 
  Maximize, 
  Minimize
} from 'lucide-react';
import { 
  ClassSession, 
  Participant, 
  ChatMessage, 
  TranscriptionItem, 
  PreCallSettings 
} from '../types/conference';
import { realtimeService } from '../services/realtime';
import { StorageService } from '../services/storage';
import { ChatPanel } from './ChatPanel';
import { ParticipantsModal } from './ParticipantsModal';
import { SubtitlesOverlay } from './SubtitlesOverlay';

interface ConferenceRoomProps {
  classSession: ClassSession;
  userRole: 'admin' | 'student';
  userName: string;
  preCallSettings: PreCallSettings;
  onLeaveRoom: () => void;
}

// Remote Video Player Helper Component
const RemoteVideoPlayer: React.FC<{
  stream: MediaStream;
  isCameraOff: boolean;
  name: string;
}> = ({ stream, isCameraOff, name }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasActiveVideo, setHasActiveVideo] = useState(() => {
    return stream ? stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled) : false;
  });

  useEffect(() => {
    const updateActiveVideo = () => {
      if (!stream) {
        setHasActiveVideo(false);
        return;
      }
      const live = stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);
      setHasActiveVideo(live);
    };

    updateActiveVideo();

    if (stream) {
      stream.onaddtrack = updateActiveVideo;
      stream.onremovetrack = updateActiveVideo;
      stream.getVideoTracks().forEach(track => {
        track.onunmute = updateActiveVideo;
        track.onmute = updateActiveVideo;
        track.onended = updateActiveVideo;
      });
    }

    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      if (!isCameraOff) {
        videoRef.current.play().catch(err => console.warn("[WebRTC] Remote video playback note:", err));
      }
    }
    if (audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
      audioRef.current.play().catch(err => console.warn("[WebRTC] Remote audio playback note:", err));
    }
  }, [stream, isCameraOff]);

  return (
    <div className="w-full h-full relative">
      {/* Persistent audio element so participant voice is always audible */}
      <audio ref={audioRef} autoPlay playsInline />

      {/* Video element - always muted so browser autoplay policies never block playback */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${(!isCameraOff && hasActiveVideo) ? 'block' : 'hidden'}`}
      />

      {/* When camera is off or video frames are not ready yet */}
      {(!hasActiveVideo || isCameraOff) && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-slate-400 gap-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-indigo-600/20">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {isCameraOff ? 'Cámara Desactivada' : 'Conectando señal de video...'}
          </span>
        </div>
      )}
    </div>
  );
};

// Helper to safely add/replace tracks on RTCPeerConnection using WebRTC Transceivers
const syncPeerConnectionTracks = (
  pc: RTCPeerConnection,
  vStream: MediaStream | null,
  mStream: MediaStream | null
): boolean => {
  let changed = false;
  const activeVideoTrack = vStream?.getVideoTracks().find(t => t.readyState === 'live') || 
                           mStream?.getVideoTracks().find(t => t.readyState === 'live') || null;
  const activeAudioTrack = mStream?.getAudioTracks().find(t => t.readyState === 'live') || null;

  // Video track handling via transceiver
  const videoTransceiver = pc.getTransceivers().find(t =>
    t.receiver.track.kind === 'video' || t.sender.track?.kind === 'video'
  );

  if (videoTransceiver) {
    if (activeVideoTrack) {
      if (videoTransceiver.direction !== 'sendrecv') {
        videoTransceiver.direction = 'sendrecv';
        changed = true;
      }
      if (videoTransceiver.sender.track !== activeVideoTrack) {
        videoTransceiver.sender.replaceTrack(activeVideoTrack).catch(e => console.warn("replaceTrack video error:", e));
        changed = true;
      }
    } else if (videoTransceiver.sender.track) {
      videoTransceiver.sender.replaceTrack(null).catch(() => {});
      changed = true;
    }
  } else if (activeVideoTrack) {
    try {
      const streamToUse = vStream || mStream;
      if (streamToUse) {
        pc.addTrack(activeVideoTrack, streamToUse);
        changed = true;
      }
    } catch (e) {
      console.warn("addTrack video error:", e);
    }
  }

  // Audio track handling via transceiver
  const audioTransceiver = pc.getTransceivers().find(t =>
    t.receiver.track.kind === 'audio' || t.sender.track?.kind === 'audio'
  );

  if (audioTransceiver) {
    if (activeAudioTrack) {
      if (audioTransceiver.direction !== 'sendrecv') {
        audioTransceiver.direction = 'sendrecv';
        changed = true;
      }
      if (audioTransceiver.sender.track !== activeAudioTrack) {
        audioTransceiver.sender.replaceTrack(activeAudioTrack).catch(e => console.warn("replaceTrack audio error:", e));
        changed = true;
      }
    } else if (audioTransceiver.sender.track) {
      audioTransceiver.sender.replaceTrack(null).catch(() => {});
      changed = true;
    }
  } else if (activeAudioTrack) {
    try {
      if (mStream) {
        pc.addTrack(activeAudioTrack, mStream);
        changed = true;
      }
    } catch (e) {
      console.warn("addTrack audio error:", e);
    }
  }

  return changed;
};

// Audio Mixer Helper for MediaRecorder Recording
const createMixedMediaStream = (
  videoStream: MediaStream | null,
  micStream: MediaStream | null,
  remoteStreamsMap: Map<string, MediaStream>
): { stream: MediaStream; cleanUp: () => void } => {
  const compositeStream = new MediaStream();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  let audioCtx: AudioContext | null = null;
  const sources: MediaStreamAudioSourceNode[] = [];

  // 1. Video Track: Screen share takes priority if available, otherwise local camera
  const videoTrack = videoStream?.getVideoTracks()[0] || micStream?.getVideoTracks()[0];
  if (videoTrack) {
    compositeStream.addTrack(videoTrack);
  }

  // 2. Mix Audio Tracks using Web Audio API
  if (AudioCtx) {
    try {
      audioCtx = new AudioCtx();
      const destination = audioCtx.createMediaStreamDestination();

      // Add local microphone audio
      if (micStream && micStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(destination);
          sources.push(micSource);
        } catch (e) {
          console.warn("Mic audio mix error:", e);
        }
      }

      // Add screen share audio if present
      if (videoStream && videoStream !== micStream && videoStream.getAudioTracks().length > 0) {
        try {
          const screenAudioSource = audioCtx.createMediaStreamSource(videoStream);
          screenAudioSource.connect(destination);
          sources.push(screenAudioSource);
        } catch (e) {
          console.warn("Screen audio mix error:", e);
        }
      }

      // Add remote student/peer audio tracks
      remoteStreamsMap.forEach((rStream) => {
        if (rStream && rStream.getAudioTracks().length > 0) {
          try {
            const rSource = audioCtx.createMediaStreamSource(rStream);
            rSource.connect(destination);
            sources.push(rSource);
          } catch (e) {
            console.warn("Remote audio mix error:", e);
          }
        }
      });

      const mixedAudioTrack = destination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        compositeStream.addTrack(mixedAudioTrack);
      }
    } catch (err) {
      console.warn("AudioContext initialization warning:", err);
    }
  }

  // Fallback: If AudioContext audio mixing failed, attach mic audio track directly
  if (compositeStream.getAudioTracks().length === 0 && micStream?.getAudioTracks()[0]) {
    compositeStream.addTrack(micStream.getAudioTracks()[0]);
  }

  const cleanUp = () => {
    sources.forEach(s => { try { s.disconnect(); } catch (e) {} });
    if (audioCtx && audioCtx.state !== 'closed') {
      try { audioCtx.close(); } catch (e) {}
    }
  };

  return { stream: compositeStream, cleanUp };
};

export const ConferenceRoom: React.FC<ConferenceRoomProps> = ({
  classSession,
  userRole,
  userName,
  preCallSettings,
  onLeaveRoom
}) => {
  // Local User State
  const userId = useRef(preCallSettings.participantId || 'usr-' + Math.random().toString(36).substr(2, 6)).current;
  const [isMuted, setIsMuted] = useState(preCallSettings.isMuted);
  const [isCameraOff, setIsCameraOff] = useState(preCallSettings.isCameraOff);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // ---- Live-value refs so event handlers always read current state (avoids stale closures) ----
  const isMutedRef = useRef(preCallSettings.isMuted);
  const isCameraOffRef = useRef(preCallSettings.isCameraOff);
  const isScreenSharingRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(preCallSettings.initialStream || null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Keep refs in sync with state
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);

  // Room Features State
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Recording State (MediaRecorder API)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordCleanupRef = useRef<(() => void) | null>(null);

  // Data Lists
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [, setTranscriptions] = useState<TranscriptionItem[]>([]);

  // Local & Remote Media Streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(preCallSettings.initialStream || null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // WebRTC Peer Connections & DataChannels Ref
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Video Element Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // UI Utilities
  const [copiedCode, setCopiedCode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const roomContainerRef = useRef<HTMLDivElement>(null);

  // Broadcast event directly over WebRTC DataChannels to all connected peers
  const broadcastP2P = (event: RoomEvent) => {
    const raw = JSON.stringify(event);
    dataChannelsRef.current.forEach((dc) => {
      if (dc.readyState === 'open') {
        try {
          dc.send(raw);
        } catch (e) {
          console.warn('[WebRTC DataChannel] Send error:', e);
        }
      }
    });
  };

  const setupDataChannel = (remotePeerId: string, channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log(`[WebRTC DataChannel] Connection opened with peer ${remotePeerId}`);
    };
    channel.onmessage = (e) => {
      try {
        let str = '';
        if (typeof e.data === 'string') {
          str = e.data;
        } else if (e.data instanceof ArrayBuffer) {
          str = new TextDecoder('utf-8').decode(e.data);
        } else {
          str = String(e.data);
        }
        const event: RoomEvent = JSON.parse(str);
        if (event && event.roomCode === classSession.code && event.senderId !== userId) {
          handleIncomingRoomEventRef.current?.(event);
        }
      } catch (err) {
        console.warn('[WebRTC DataChannel] Parse error:', err);
      }
    };
    channel.onclose = () => {
      dataChannelsRef.current.delete(remotePeerId);
    };
    dataChannelsRef.current.set(remotePeerId, channel);
  };

  // Ref holder to break circular dependency between createPeerConnection and handleIncomingRoomEvent
  const handleIncomingRoomEventRef = useRef<((event: RoomEvent) => void) | null>(null);

  // 1. Initialize Local Media Stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const initMedia = async () => {
      // 1. If we received an active stream from pre-join, reuse it directly without re-prompting
      if (preCallSettings.initialStream && preCallSettings.initialStream.active) {
        const stream = preCallSettings.initialStream;
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Apply mute/camera states
        stream.getAudioTracks().forEach(t => t.enabled = !preCallSettings.isMuted);
        stream.getVideoTracks().forEach(t => t.enabled = !preCallSettings.isCameraOff);

        // Notify connected peers with updated tracks
        peerConnectionsRef.current.forEach((pc, peerId) => {
          syncPeerConnectionTracks(pc, stream, stream);
          renegotiatePeer(peerId);
        });
        return;
      }

      // 2. Otherwise acquire fresh media stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true
        });
        activeStream = stream;
        localStreamRef.current = stream;
        setLocalStream(stream);

        // Apply initial mute/camera state
        stream.getAudioTracks().forEach(t => t.enabled = !preCallSettings.isMuted);
        stream.getVideoTracks().forEach(t => t.enabled = !preCallSettings.isCameraOff);

        // Notify connected peers with updated tracks
        peerConnectionsRef.current.forEach((pc, peerId) => {
          syncPeerConnectionTracks(pc, stream, stream);
          renegotiatePeer(peerId);
        });
      } catch (err) {
        console.warn('Could not acquire local camera/mic stream:', err);
      }
    };

    initMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      localStreamRef.current = null;
    };
  }, []);

  // Update video element when local stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff, isScreenSharing]);

  // Update video element when screen stream changes
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
      screenVideoRef.current.play().catch(err => console.warn("Screen video play error:", err));
    }
  }, [screenStream, isScreenSharing]);

  // Helper to renegotiate peer connection tracks with a remote peer
  const renegotiatePeer = async (targetId: string) => {
    const pc = peerConnectionsRef.current.get(targetId);
    if (!pc || pc.signalingState === 'closed') return;

    try {
      const liveLocal = localStreamRef.current;
      const liveScreen = screenStreamRef.current;
      const activeVideoStream = (isScreenSharingRef.current && liveScreen) ? liveScreen : liveLocal;
      syncPeerConnectionTracks(pc, activeVideoStream, liveLocal);

      if (pc.signalingState !== 'stable') {
        return;
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      realtimeService.send('OFFER', userId, {
        targetId,
        sdp: pc.localDescription
      });
    } catch (err) {
      console.warn(`[WebRTC] Error renegotiating with peer ${targetId}:`, err);
    }
  };

  // 2. WebRTC Peer Connection Helper — reads from refs to avoid stale closures
  const createPeerConnection = (targetId: string, isOfferer: boolean): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(targetId);
    if (existing) {
      if (existing.connectionState !== 'failed' && existing.connectionState !== 'closed') {
        const liveLocal = localStreamRef.current;
        const liveScreen = screenStreamRef.current;
        const activeVideoStream = (isScreenSharingRef.current && liveScreen) ? liveScreen : liveLocal;
        syncPeerConnectionTracks(existing, activeVideoStream, liveLocal);
        return existing;
      }
      existing.close();
      peerConnectionsRef.current.delete(targetId);
      dataChannelsRef.current.delete(targetId);
    }

    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ],
      iceCandidatePoolSize: 10
    };

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(targetId, pc);

    // Setup direct WebRTC DataChannel
    if (isOfferer) {
      try {
        const dc = pc.createDataChannel('edumeet_p2p', { ordered: true });
        setupDataChannel(targetId, dc);
      } catch (e) {
        console.warn('Could not create data channel:', e);
      }
    }
    pc.ondatachannel = (event) => {
      setupDataChannel(targetId, event.channel);
    };

    // Attach ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        realtimeService.send('ICE_CANDIDATE', userId, {
          targetId,
          candidate: event.candidate
        });
      }
    };

    // Attach ontrack handler with immediate UI notification and live-unmute listener
    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        let stream = prev.get(targetId);
        if (!stream) {
          stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream();
        }
        if (event.track && !stream.getTracks().some(t => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        const next = new Map(prev);
        // Fresh MediaStream instance with all tracks so React components detect state change
        next.set(targetId, new MediaStream(stream.getTracks()));
        return next;
      });

      // When first video frame arrives, trigger an update so player shows the camera feed
      event.track.onunmute = () => {
        setRemoteStreams(prev => {
          const s = prev.get(targetId);
          if (!s) return prev;
          const next = new Map(prev);
          next.set(targetId, new MediaStream(s.getTracks()));
          return next;
        });
      };
    };

    // If offerer, configure initial transceivers/tracks and send offer
    if (isOfferer) {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
      } catch (e) {}

      // Add / sync local tracks using live ref values (not stale closure state)
      const liveLocal = localStreamRef.current;
      const liveScreen = screenStreamRef.current;
      const activeVideoStream = (isScreenSharingRef.current && liveScreen) ? liveScreen : liveLocal;
      syncPeerConnectionTracks(pc, activeVideoStream, liveLocal);

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          realtimeService.send('OFFER', userId, {
            targetId,
            sdp: pc.localDescription
          });
        })
        .catch(err => console.error("Error creating WebRTC offer:", err));
    }

    return pc;
  };

  // Update track enabled status & WebRTC Senders when state changes
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
    }

    // Keep stream refs in sync whenever streams change
    localStreamRef.current = localStream;
    screenStreamRef.current = screenStream;

    peerConnectionsRef.current.forEach((pc, peerId) => {
      const activeVideoStream = (isScreenSharing && screenStream) ? screenStream : localStream;
      const changed = syncPeerConnectionTracks(pc, activeVideoStream, localStream);
      if (changed && localStream) {
        renegotiatePeer(peerId);
      }
    });

    // Broadcast participant update
    realtimeService.send('PARTICIPANT_UPDATE', userId, {
      id: userId,
      name: userName,
      role: userRole,
      isMuted,
      isCameraOff,
      isScreenSharing
    });
  }, [isMuted, isCameraOff, isScreenSharing, localStream, screenStream, userId, userName, userRole]);

  // 3. Real-Time Room Synchronization & WebRTC Event Handlers
  useEffect(() => {
    realtimeService.init(classSession.code, {
      name: userName,
      role: userRole,
      id: userId
    });

    // Register self in participants list
    const myParticipant: Participant = {
      id: userId,
      name: userName,
      role: userRole,
      status: 'active',
      isMuted,
      isCameraOff,
      isScreenSharing,
      joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setParticipants([myParticipant]);

    // Broadcast join and request sync from existing peers
    realtimeService.send('PARTICIPANT_UPDATE', userId, myParticipant);
    realtimeService.send('ROOM_SYNC', userId, { requestSync: true });

    const retryTimer1 = window.setTimeout(() => {
      realtimeService.send('PARTICIPANT_UPDATE', userId, {
        id: userId,
        name: userName,
        role: userRole,
        status: 'active',
        isMuted: isMutedRef.current,
        isCameraOff: isCameraOffRef.current,
        isScreenSharing: isScreenSharingRef.current,
        joinedAt: myParticipant.joinedAt
      });
      realtimeService.send('ROOM_SYNC', userId, { requestSync: true });
    }, 1200);

    const retryTimer2 = window.setTimeout(() => {
      realtimeService.send('PARTICIPANT_UPDATE', userId, {
        id: userId,
        name: userName,
        role: userRole,
        status: 'active',
        isMuted: isMutedRef.current,
        isCameraOff: isCameraOffRef.current,
        isScreenSharing: isScreenSharingRef.current,
        joinedAt: myParticipant.joinedAt
      });
    }, 3000);

    const initialSysMessage: ChatMessage = {
      id: 'sys-' + Date.now(),
      senderId: 'system',
      senderName: 'Sistema',
      role: 'system',
      text: `${userName} (${userRole === 'admin' ? 'Profesor' : 'Estudiante'}) se unió a la reunión.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    setChatMessages([initialSysMessage]);

    // Handler for all incoming events from realtimeService and WebRTC DataChannels
    const handleIncomingRoomEvent = (event: RoomEvent) => {
      if (!event || event.senderId === userId) return; // Ignore self events

      switch (event.type) {
        case 'ROOM_SYNC': {
          const syncUpdate = {
            id: userId,
            name: userName,
            role: userRole,
            status: 'active',
            isMuted: isMutedRef.current,
            isCameraOff: isCameraOffRef.current,
            isScreenSharing: isScreenSharingRef.current,
            joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          realtimeService.send('PARTICIPANT_UPDATE', userId, syncUpdate);
          broadcastP2P({
            type: 'PARTICIPANT_UPDATE',
            roomCode: classSession.code,
            senderId: userId,
            payload: syncUpdate,
            timestamp: Date.now()
          });
          break;
        }

        case 'CLASS_INFO_REQUEST': {
          if (userRole === 'admin') {
            realtimeService.send('CLASS_INFO_RESPONSE', userId, {
              classSession: {
                id: classSession.id,
                code: classSession.code,
                title: classSession.title,
                subject: classSession.subject,
                date: classSession.date,
                time: classSession.time,
                accessMode: classSession.accessMode,
                adminName: classSession.adminName,
                status: 'live'
              }
            });
          }
          break;
        }

        case 'ROOM_MEMBERS': {
          const members = event.payload?.members || [];
          members.forEach((m: { id: string; name: string; role: 'admin' | 'student' }) => {
            if (m.id !== userId) {
              setParticipants(prev => {
                if (prev.some(p => p.id === m.id)) return prev;
                return [...prev, {
                  id: m.id,
                  name: m.name,
                  role: m.role,
                  status: 'active',
                  isMuted: false,
                  isCameraOff: false,
                  isScreenSharing: false,
                  joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }];
              });
              // Professor initiates WebRTC connection
              if (userRole === 'admin') {
                createPeerConnection(m.id, true);
              }
            }
          });
          break;
        }

        case 'PARTICIPANT_UPDATE': {
          const remoteP: Participant = event.payload;
          if (!remoteP || !remoteP.id) break;

          setParticipants(prev => {
            const exists = prev.find(p => p.id === remoteP.id);
            if (exists) {
              return prev.map(p => (p.id === remoteP.id ? { ...p, ...remoteP } : p));
            } else {
              return [...prev, { ...remoteP, status: 'active' }];
            }
          });

          // Initiate WebRTC peer connection with remote participant without glare
          if (remoteP.id !== userId && !remoteP.isSimulated) {
            let isOfferer = false;
            if (userRole === 'admin' && remoteP.role === 'student') {
              isOfferer = true;
            } else if (userRole === 'student' && remoteP.role === 'admin') {
              isOfferer = false;
            } else {
              isOfferer = userId < remoteP.id;
            }
            createPeerConnection(remoteP.id, isOfferer);
          }
          break;
        }

        case 'OFFER': {
          if (event.payload.targetId === userId) {
            let pc = peerConnectionsRef.current.get(event.senderId);
            if (!pc || pc.signalingState === 'closed') {
              pc = createPeerConnection(event.senderId, false);
            }
            pc.setRemoteDescription(new RTCSessionDescription(event.payload.sdp))
              .then(() => {
                // Flush queued ICE candidates
                const queued = iceCandidateQueueRef.current.get(event.senderId) || [];
                queued.forEach(cand => {
                  pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("Queued ICE error:", e));
                });
                iceCandidateQueueRef.current.delete(event.senderId);

                // Attach local tracks into the answer transceivers so student stream is returned
                const liveLocal = localStreamRef.current;
                const liveScreen = screenStreamRef.current;
                const activeVideoStream = (isScreenSharingRef.current && liveScreen) ? liveScreen : liveLocal;
                syncPeerConnectionTracks(pc, activeVideoStream, liveLocal);

                return pc.createAnswer();
              })
              .then(answer => pc.setLocalDescription(answer))
              .then(() => {
                realtimeService.send('ANSWER', userId, {
                  targetId: event.senderId,
                  sdp: pc.localDescription
                });
              })
              .catch(err => console.error("[WebRTC] Error handling offer:", err));
          }
          break;
        }

        case 'ANSWER': {
          if (event.payload.targetId === userId) {
            const pc = peerConnectionsRef.current.get(event.senderId);
            if (pc && pc.signalingState === 'have-local-offer') {
              pc.setRemoteDescription(new RTCSessionDescription(event.payload.sdp))
                .then(() => {
                  // Flush queued ICE candidates
                  const queued = iceCandidateQueueRef.current.get(event.senderId) || [];
                  queued.forEach(cand => {
                    pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn("Queued ICE error:", e));
                  });
                  iceCandidateQueueRef.current.delete(event.senderId);
                })
                .catch(err => console.error("[WebRTC] Error setting answer:", err));
            }
          }
          break;
        }

        case 'ICE_CANDIDATE': {
          if (event.payload.targetId === userId) {
            const pc = peerConnectionsRef.current.get(event.senderId);
            if (pc && event.payload.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                pc.addIceCandidate(new RTCIceCandidate(event.payload.candidate))
                  .catch(err => console.error("Error adding ICE candidate:", err));
              } else {
                const queue = iceCandidateQueueRef.current.get(event.senderId) || [];
                queue.push(event.payload.candidate);
                iceCandidateQueueRef.current.set(event.senderId, queue);
              }
            }
          }
          break;
        }

        case 'JOIN_REQUEST': {
          if (userRole === 'admin') {
            const pendingStudent: Participant = {
              id: event.payload.participantId,
              name: event.payload.name,
              role: 'student',
              status: 'waiting',
              isMuted: event.payload.isMuted,
              isCameraOff: event.payload.isCameraOff,
              isScreenSharing: false,
              joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setPendingRequests(prev => {
              if (prev.some(p => p.id === pendingStudent.id)) return prev;
              return [...prev, pendingStudent];
            });
            setShowParticipants(true); // Open panel for admin to accept
          }
          break;
        }

        case 'FORCE_MUTE': {
          const target = event.payload?.targetParticipantId || event.payload?.targetId;
          if (target === userId) {
            setIsMuted(true);
            isMutedRef.current = true;
            if (localStreamRef.current) {
              localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
            }
            const sysMuteMsg: ChatMessage = {
              id: 'mute-' + Date.now(),
              senderId: 'system',
              senderName: 'Sistema',
              role: 'system',
              text: 'El profesor ha silenciado tu micrófono.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isSystem: true
            };
            setChatMessages(prev => [...prev, sysMuteMsg]);

            // Notify everyone immediately that local state is muted
            const updatePayload = {
              id: userId,
              name: userName,
              role: userRole,
              isMuted: true,
              isCameraOff: isCameraOffRef.current,
              isScreenSharing: isScreenSharingRef.current
            };
            realtimeService.send('PARTICIPANT_UPDATE', userId, updatePayload);
            broadcastP2P({
              type: 'PARTICIPANT_UPDATE',
              roomCode: classSession.code,
              senderId: userId,
              payload: updatePayload,
              timestamp: Date.now()
            });
          }
          setParticipants(prev => prev.map(p => (p.id === target ? { ...p, isMuted: true } : p)));
          break;
        }

        case 'FORCE_CAMERA_OFF': {
          const target = event.payload?.targetParticipantId || event.payload?.targetId;
          if (target === userId) {
            setIsCameraOff(true);
            isCameraOffRef.current = true;
            if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(t => (t.enabled = false));
            }
            const sysCamMsg: ChatMessage = {
              id: 'cam-' + Date.now(),
              senderId: 'system',
              senderName: 'Sistema',
              role: 'system',
              text: 'El profesor ha apagado tu cámara.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isSystem: true
            };
            setChatMessages(prev => [...prev, sysCamMsg]);

            const updatePayload = {
              id: userId,
              name: userName,
              role: userRole,
              isMuted: isMutedRef.current,
              isCameraOff: true,
              isScreenSharing: isScreenSharingRef.current
            };
            realtimeService.send('PARTICIPANT_UPDATE', userId, updatePayload);
            broadcastP2P({
              type: 'PARTICIPANT_UPDATE',
              roomCode: classSession.code,
              senderId: userId,
              payload: updatePayload,
              timestamp: Date.now()
            });
          }
          setParticipants(prev => prev.map(p => (p.id === target ? { ...p, isCameraOff: true } : p)));
          break;
        }

        case 'CHAT_MESSAGE': {
          const newMsg: ChatMessage = event.payload;
          if (!newMsg || !newMsg.id) break;
          setChatMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!showChat) {
            setUnreadChatCount(prev => prev + 1);
          }
          break;
        }

        case 'TRANSCRIPTION': {
          const item: TranscriptionItem = event.payload;
          setTranscriptions(prev => [...prev, item]);
          break;
        }

        case 'PARTICIPANT_LEAVE': {
          const targetId = event.senderId;
          const pc = peerConnectionsRef.current.get(targetId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(targetId);
          }
          dataChannelsRef.current.delete(targetId);
          iceCandidateQueueRef.current.delete(targetId);
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(targetId);
            return next;
          });
          setParticipants(prev => prev.filter(p => p.id !== targetId));
          break;
        }

        default:
          break;
      }
    };

    handleIncomingRoomEventRef.current = handleIncomingRoomEvent;

    // Subscribe to incoming events
    const unsub = realtimeService.subscribe('*', handleIncomingRoomEvent);

    return () => {
      clearTimeout(retryTimer1);
      clearTimeout(retryTimer2);
      unsub();
      handleIncomingRoomEventRef.current = null;
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      dataChannelsRef.current.forEach(dc => dc.close());
      dataChannelsRef.current.clear();
      iceCandidateQueueRef.current.clear();
      realtimeService.send('PARTICIPANT_LEAVE', userId, { id: userId });
      realtimeService.leave();
    };
  }, [classSession.code, userId, userName, userRole]);

  // 4. Screen Sharing Handler
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        setScreenStream(stream);
        setIsScreenSharing(true);

        // Native browser stop button handler
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
        };
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    }
  };

  // 5. Local Class Recording with Mixed Audio (Mic + Screen + Remote Peers)
  const startRecording = () => {
    try {
      recordedChunksRef.current = [];
      const videoStreamToRecord = screenStream || localStream;

      if (!videoStreamToRecord && remoteStreams.size === 0) {
        alert('No hay flujo de video activo para grabar.');
        return;
      }

      // Mix video and audio tracks
      const { stream: compositeStream, cleanUp } = createMixedMediaStream(
        videoStreamToRecord,
        localStream,
        remoteStreams
      );
      recordCleanupRef.current = cleanUp;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(compositeStream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordCleanupRef.current) {
          recordCleanupRef.current();
          recordCleanupRef.current = null;
        }

        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `Grabacion_Clase_${classSession.code}_${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Error starting MediaRecorder:', err);
      alert('Error al iniciar la grabación local con audio.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const formatRecordingTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 6. Admin Remote Control Handlers
  const handleRemoteMuteParticipant = (targetId: string) => {
    if (userRole !== 'admin') return;
    const payload = { targetParticipantId: targetId, targetId: targetId };
    realtimeService.send('FORCE_MUTE', userId, payload);
    broadcastP2P({
      type: 'FORCE_MUTE',
      roomCode: classSession.code,
      senderId: userId,
      payload,
      timestamp: Date.now()
    });
    setParticipants(prev => prev.map(p => p.id === targetId ? { ...p, isMuted: true } : p));
  };

  const handleRemoteTurnOffCamera = (targetId: string) => {
    if (userRole !== 'admin') return;
    const payload = { targetParticipantId: targetId, targetId: targetId };
    realtimeService.send('FORCE_CAMERA_OFF', userId, payload);
    broadcastP2P({
      type: 'FORCE_CAMERA_OFF',
      roomCode: classSession.code,
      senderId: userId,
      payload,
      timestamp: Date.now()
    });
    setParticipants(prev => prev.map(p => p.id === targetId ? { ...p, isCameraOff: true } : p));
  };

  // Dedicated toggles to guarantee camera and mic track re-acquisition & WebRTC renegotiation
  const toggleMic = async () => {
    if (isMuted) {
      const audTrack = localStream?.getAudioTracks().find(t => t.readyState === 'live');
      if (audTrack) {
        audTrack.enabled = true;
        setIsMuted(false);
        peerConnectionsRef.current.forEach((pc, peerId) => {
          syncPeerConnectionTracks(pc, localStream, localStream);
          renegotiatePeer(peerId);
        });
      } else {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const newAud = micStream.getAudioTracks()[0];
          if (newAud) {
            newAud.enabled = true;
            let fresh: MediaStream;
            if (localStream) {
              localStream.getAudioTracks().forEach(t => {
                localStream.removeTrack(t);
                t.stop();
              });
              localStream.addTrack(newAud);
              fresh = new MediaStream(localStream.getTracks());
              setLocalStream(fresh);
              localStreamRef.current = fresh;
            } else {
              fresh = micStream;
              setLocalStream(fresh);
              localStreamRef.current = fresh;
            }
            setIsMuted(false);
            peerConnectionsRef.current.forEach((pc, peerId) => {
              syncPeerConnectionTracks(pc, fresh, fresh);
              renegotiatePeer(peerId);
            });
          }
        } catch (err) {
          console.warn("Could not activate mic:", err);
          alert("No se pudo reactivar el micrófono. Revisa los permisos del navegador.");
          return;
        }
      }
    } else {
      if (localStream) {
        localStream.getAudioTracks().forEach(t => (t.enabled = false));
      }
      setIsMuted(true);
      peerConnectionsRef.current.forEach((pc, peerId) => {
        syncPeerConnectionTracks(pc, localStream, localStream);
        renegotiatePeer(peerId);
      });
    }
  };

  const toggleCamera = async () => {
    if (isCameraOff) {
      const vidTrack = localStream?.getVideoTracks().find(t => t.readyState === 'live');
      if (vidTrack) {
        vidTrack.enabled = true;
        setIsCameraOff(false);
        peerConnectionsRef.current.forEach((pc, peerId) => {
          syncPeerConnectionTracks(pc, localStream, localStream);
          renegotiatePeer(peerId);
        });
      } else {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false
          });
          const newVid = camStream.getVideoTracks()[0];
          if (newVid) {
            newVid.enabled = true;
            let fresh: MediaStream;
            if (localStream) {
              localStream.getVideoTracks().forEach(t => {
                localStream.removeTrack(t);
                t.stop();
              });
              localStream.addTrack(newVid);
              fresh = new MediaStream(localStream.getTracks());
              setLocalStream(fresh);
              localStreamRef.current = fresh;
            } else {
              fresh = camStream;
              setLocalStream(fresh);
              localStreamRef.current = fresh;
            }
            setIsCameraOff(false);
            peerConnectionsRef.current.forEach((pc, peerId) => {
              syncPeerConnectionTracks(pc, fresh, fresh);
              renegotiatePeer(peerId);
            });
          }
        } catch (err) {
          console.warn("Could not activate camera:", err);
          alert("No se pudo encender la cámara. Revisa los permisos del navegador.");
          return;
        }
      }
    } else {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => (t.enabled = false));
      }
      setIsCameraOff(true);
      peerConnectionsRef.current.forEach((pc, peerId) => {
        syncPeerConnectionTracks(pc, localStream, localStream);
        renegotiatePeer(peerId);
      });
    }
  };

  const handleAcceptStudent = (studentId: string) => {
    const student = pendingRequests.find(p => p.id === studentId);
    if (student) {
      realtimeService.send('JOIN_RESPONSE', userId, { participantId: studentId, accepted: true });
      setPendingRequests(prev => prev.filter(p => p.id !== studentId));
      setParticipants(prev => {
        if (prev.some(p => p.id === studentId)) return prev;
        return [...prev, { ...student, status: 'active' }];
      });
      // Note: Student will receive JOIN_RESPONSE, mount ConferenceRoom, and broadcast PARTICIPANT_UPDATE,
      // which triggers createPeerConnection automatically with student's active stream.
    }
  };

  const handleRejectStudent = (studentId: string) => {
    realtimeService.send('JOIN_RESPONSE', userId, { participantId: studentId, accepted: false });
    setPendingRequests(prev => prev.filter(p => p.id !== studentId));
  };

  const handleAddSimulatedParticipant = () => {
    const simNames = ['Camila Silva', 'Mateo Ramírez', 'Sofía López', 'Lucas Fernández', 'Valentina Gómez'];
    const randomName = simNames[Math.floor(Math.random() * simNames.length)] + ' (Simulado)';
    const simId = 'sim-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    const simP: Participant = {
      id: simId,
      name: randomName,
      role: 'student',
      status: 'active',
      isMuted: Math.random() > 0.5,
      isCameraOff: Math.random() > 0.5,
      isScreenSharing: false,
      joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSimulated: true
    };

    setParticipants(prev => [...prev, simP]);

    const sysMsg: ChatMessage = {
      id: 'sys-' + Date.now(),
      senderId: 'system',
      senderName: 'Sistema',
      role: 'system',
      text: `${randomName} se unió a la sesión.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSystem: true
    };
    setChatMessages(prev => [...prev, sysMsg]);
  };

  const handleSendChatMessage = (text: string) => {
    const newMsg: ChatMessage = {
      id: 'chat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      senderId: userId,
      senderName: userName,
      role: userRole,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, newMsg]);
    realtimeService.send('CHAT_MESSAGE', userId, newMsg);
    broadcastP2P({
      type: 'CHAT_MESSAGE',
      roomCode: classSession.code,
      senderId: userId,
      payload: newMsg,
      timestamp: Date.now()
    });
  };

  const copyRoomLink = () => {
    const link = StorageService.getSharableRoomLink(classSession);
    navigator.clipboard.writeText(link);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      roomContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div ref={roomContainerRef} className="relative w-full h-[calc(100vh-65px)] bg-slate-950 flex overflow-hidden">
      
      {/* Main Video Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Top Floating Bar: Class Info & Copy Link */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-slate-800/80 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
            <div>
              <h2 className="text-xs font-bold text-white leading-none">{classSession.title}</h2>
              <p className="text-[10px] text-slate-400">Código: <span className="font-mono text-indigo-400 font-bold">{classSession.code}</span></p>
            </div>

            <button
              onClick={copyRoomLink}
              className={`ml-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                copiedCode 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200'
              }`}
              title="Copiar enlace de acceso directo público (sin login)"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-emerald-300 font-medium hidden sm:inline">¡Enlace Público Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] hidden sm:inline">Copiar Enlace</span>
                </>
              )}
            </button>
          </div>

          {/* Recording Badge Indicator */}
          {isRecording && (
            <div className="pointer-events-auto bg-rose-600/90 border border-rose-500 text-white px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold font-mono shadow-lg shadow-rose-600/30 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
              <span>REC {formatRecordingTime(recordingSeconds)}</span>
            </div>
          )}
        </div>

        {/* Floating Teacher Approval Alert Banner */}
        {userRole === 'admin' && pendingRequests.length > 0 && (
          <div className="absolute top-18 left-1/2 transform -translate-x-1/2 z-30 w-full max-w-md px-4 pointer-events-auto">
            <div className="bg-amber-500 text-slate-950 p-3.5 rounded-2xl shadow-2xl border border-amber-400 flex items-center justify-between gap-4 backdrop-blur-md animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center font-bold text-xs">
                  {pendingRequests[0].name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-xs leading-tight">
                    {pendingRequests[0].name}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-900">
                    Solicita ingresar a la clase
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAcceptParticipant(pendingRequests[0].id)}
                  className="bg-slate-950 text-white hover:bg-slate-900 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow cursor-pointer"
                >
                  Permitir
                </button>
                <button
                  onClick={() => handleRejectParticipant(pendingRequests[0].id)}
                  className="bg-amber-600/30 hover:bg-amber-600/50 text-slate-950 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Video Grid */}
        <div className="flex-1 p-4 flex items-center justify-center overflow-y-auto">
          {isScreenSharing ? (
            /* Screen Sharing Stage Layout */
            <div className="w-full h-full flex flex-col lg:flex-row gap-4">
              {/* Screen Share Large Tile */}
              <div className="flex-1 relative rounded-3xl overflow-hidden bg-slate-900 border border-indigo-500/40 shadow-2xl">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain bg-black"
                />
                <div className="absolute top-4 left-4 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                  Presentación de Pantalla en Vivo
                </div>
              </div>

              {/* Side Participant List */}
              <div className="w-full lg:w-72 flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto max-h-48 lg:max-h-full">
                {participants.map(p => {
                  const rStream = remoteStreams.get(p.id);
                  return (
                    <div key={p.id} className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                      {p.id === userId && !isCameraOff && localStream ? (
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover transform -scale-x-100"
                        />
                      ) : rStream ? (
                        <RemoteVideoPlayer stream={rStream} isCameraOff={p.isCameraOff} name={p.name} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white font-bold text-lg">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-white">
                        {p.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Normal Participant Grid */
            <div
              className={`w-full max-w-6xl grid gap-4 ${
                participants.length === 1
                  ? 'grid-cols-1 max-w-3xl'
                  : participants.length === 2
                  ? 'grid-cols-1 md:grid-cols-2 max-w-4xl'
                  : participants.length <= 4
                  ? 'grid-cols-2'
                  : 'grid-cols-2 md:grid-cols-3'
              }`}
            >
              {participants.map((p) => {
                const isMe = p.id === userId;
                const rStream = remoteStreams.get(p.id);

                return (
                  <div
                    key={p.id}
                    className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800/80 shadow-2xl group flex flex-col items-center justify-center"
                  >
                    {/* Local User Stream */}
                    {isMe && !isCameraOff && localStream ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />
                    ) : !isMe && rStream ? (
                      /* Remote Connected Student WebRTC Stream */
                      <RemoteVideoPlayer stream={rStream} isCameraOff={p.isCameraOff} name={p.name} />
                    ) : !p.isCameraOff && p.isSimulated ? (
                      /* Simulated HD Camera */
                      <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-tr from-indigo-950 to-purple-950">
                        <div className="text-center space-y-2">
                          <div className="w-20 h-20 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-2xl font-bold mx-auto animate-pulse">
                            {p.name.charAt(0)}
                          </div>
                          <span className="text-xs text-indigo-300 font-semibold block">Cámara Simulada HD</span>
                        </div>
                      </div>
                    ) : !p.isCameraOff ? (
                      /* Remote participant turned on camera: connecting/renegotiating stream */
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/95 text-indigo-300 gap-3">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-indigo-600/30 animate-pulse">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-indigo-400 font-medium animate-pulse">Cámara Encendida · Conectando video...</span>
                      </div>
                    ) : (
                      /* Camera Off Avatar Placeholder */
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-slate-400 gap-3">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-indigo-600/20">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-400 font-medium">Cámara Desactivada</span>
                      </div>
                    )}

                    {/* Participant Info Overlay Tag */}
                    <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold text-white flex items-center gap-2 shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>{p.name} {isMe && '(Tú)'}</span>
                      {p.role === 'admin' && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold">
                          DOCENTE
                        </span>
                      )}
                    </div>

                    {/* Top Right Controls & Muted Badge */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                      {userRole === 'admin' && !isMe && (
                        <div className="flex items-center gap-1 bg-slate-950/85 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg">
                          <button
                            onClick={() => handleRemoteMuteParticipant(p.id)}
                            className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                              p.isMuted
                                ? 'bg-rose-600 text-white hover:bg-rose-500'
                                : 'bg-slate-800 text-slate-300 hover:text-rose-400 hover:bg-slate-700'
                            }`}
                            title={p.isMuted ? 'Micrófono Silenciado (Click para silenciar de nuevo)' : 'Silenciar micrófono del estudiante'}
                          >
                            {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleRemoteTurnOffCamera(p.id)}
                            className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                              p.isCameraOff
                                ? 'bg-rose-600 text-white hover:bg-rose-500'
                                : 'bg-slate-800 text-slate-300 hover:text-rose-400 hover:bg-slate-700'
                            }`}
                            title={p.isCameraOff ? 'Cámara Apagada' : 'Apagar cámara del estudiante'}
                          >
                            {p.isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                      {!(userRole === 'admin' && !isMe) && p.isMuted && (
                        <div className="bg-rose-600/90 text-white p-1.5 rounded-xl border border-rose-500 shadow-md" title="Micrófono Silenciado">
                          <MicOff className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Subtitles Floating Overlay Component */}
        <SubtitlesOverlay
          isEnabled={showSubtitles}
          speakerName={userName}
          onNewTranscription={(item) => {
            setTranscriptions(prev => [...prev, item]);
            realtimeService.send('TRANSCRIPTION', userId, item);
          }}
        />

        {/* Bottom Media Controls Bar */}
        <div className="h-20 bg-slate-950/90 border-t border-slate-800/80 backdrop-blur-xl px-4 lg:px-8 flex items-center justify-between z-30">
          
          {/* Left: Subtitles & Recording Controls */}
          <div className="flex items-center gap-2">
            {/* Subtitles Toggle */}
            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                showSubtitles
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Activar/Desactivar Subtítulos en Vivo"
            >
              <Subtitles className="w-4 h-4" />
              <span className="hidden sm:inline">Subtítulos</span>
            </button>

            {/* Record Session Button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isRecording
                  ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/30 animate-pulse'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isRecording ? 'Detener Grabación y Descargar' : 'Grabar Clase Localmente con Audio'}
            >
              {isRecording ? <Square className="w-4 h-4 text-white" /> : <Disc className="w-4 h-4 text-rose-400" />}
              <span className="hidden sm:inline">{isRecording ? 'Detener Grabación' : 'Grabar Clase'}</span>
            </button>
          </div>

          {/* Center: Main Media Action Toggles */}
          <div className="flex items-center gap-3">
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              className={`p-3.5 rounded-2xl border transition shadow-xl cursor-pointer ${
                isMuted
                  ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500 shadow-rose-600/20'
                  : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
              }`}
              title={isMuted ? 'Desmutear micrófono' : 'Silenciar micrófono'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              className={`p-3.5 rounded-2xl border transition shadow-xl cursor-pointer ${
                isCameraOff
                  ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500 shadow-rose-600/20'
                  : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
              }`}
              title={isCameraOff ? 'Encender cámara' : 'Apagar cámara'}
            >
              {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {/* Screen Share Toggle */}
            <button
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-2xl border transition shadow-xl cursor-pointer ${
                isScreenSharing
                  ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 shadow-emerald-600/20'
                  : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
              }`}
              title={isScreenSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>

            {/* Leave / End Call Button */}
            <button
              onClick={onLeaveRoom}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white border border-rose-500 shadow-xl shadow-rose-600/30 transition cursor-pointer"
              title="Salir de la reunión"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          {/* Right: Panels & Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Participants Toggle */}
            <button
              onClick={() => {
                setShowParticipants(!showParticipants);
                if (showChat) setShowChat(false);
              }}
              className={`relative p-2.5 rounded-xl border transition cursor-pointer ${
                showParticipants
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Lista de Participantes"
            >
              <Users className="w-4 h-4" />
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-extrabold rounded-full flex items-center justify-center animate-bounce">
                  {pendingRequests.length}
                </span>
              )}
            </button>

            {/* Chat Toggle */}
            <button
              onClick={() => {
                setShowChat(!showChat);
                if (showParticipants) setShowParticipants(false);
                setUnreadChatCount(0);
              }}
              className={`relative p-2.5 rounded-xl border transition cursor-pointer ${
                showChat
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Chat en Vivo"
            >
              <MessageSquare className="w-4 h-4" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadChatCount}
                </span>
              )}
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer hidden md:flex"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Side Slide-Over Panels */}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleSendChatMessage}
          onClose={() => setShowChat(false)}
          currentUserId={userId}
        />
      )}

      {showParticipants && (
        <ParticipantsModal
          participants={participants}
          pendingRequests={pendingRequests}
          currentUserRole={userRole}
          currentUserId={userId}
          onClose={() => setShowParticipants(false)}
          onMuteParticipant={handleRemoteMuteParticipant}
          onTurnOffCamera={handleRemoteTurnOffCamera}
          onAcceptStudent={handleAcceptStudent}
          onRejectStudent={handleRejectStudent}
          onAddSimulatedParticipant={handleAddSimulatedParticipant}
        />
      )}
    </div>
  );
};
