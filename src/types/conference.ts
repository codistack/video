export type AccessMode = 'direct' | 'permission';

export interface ClassSession {
  id: string;
  code: string; // Unique meeting code e.g. MATH-101-A
  title: string;
  subject: string;
  date: string;
  time: string;
  accessMode: AccessMode;
  adminName: string;
  createdAt: string;
  status: 'scheduled' | 'live' | 'ended';
}

export interface Participant {
  id: string;
  name: string;
  role: 'admin' | 'student';
  status: 'waiting' | 'accepted' | 'rejected' | 'active';
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
  avatarColor?: string;
  isSimulated?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  role: 'admin' | 'student' | 'system';
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface TranscriptionItem {
  id: string;
  senderName: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
}

export interface PreCallSettings {
  name: string;
  isMuted: boolean;
  isCameraOff: boolean;
}
