import { ClassSession } from '../types/conference';

const CLASSES_STORAGE_KEY = 'edumeet_classes_v1';
const USER_PROFILE_KEY = 'edumeet_user_profile_v1';

// Initial default demo class if empty
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

export const StorageService = {
  getClasses(): ClassSession[] {
    try {
      const data = localStorage.getItem(CLASSES_STORAGE_KEY);
      if (!data) {
        localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(DEFAULT_CLASSES));
        this.syncWithServer();
        return DEFAULT_CLASSES;
      }
      this.syncWithServer();
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading classes from localStorage:', error);
      return DEFAULT_CLASSES;
    }
  },

  async syncWithServer(): Promise<ClassSession[]> {
    try {
      const res = await fetch('/api/classes');
      if (res.ok) {
        const serverClasses: ClassSession[] = await res.json();
        if (Array.isArray(serverClasses) && serverClasses.length > 0) {
          localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(serverClasses));
          return serverClasses;
        }
      }
    } catch (err) {
      // Offline / server not reachable, fallback to local storage
    }
    return this.getClasses();
  },

  getClassByCode(code: string): ClassSession | null {
    const classes = this.getClasses();
    const cleanCode = code.trim().toUpperCase();
    return classes.find(c => c.code.toUpperCase() === cleanCode) || null;
  },

  async fetchClassByCode(code: string): Promise<ClassSession | null> {
    const cleanCode = code.trim().toUpperCase();
    // 1. Try server first to get freshest session details across devices
    try {
      const res = await fetch(`/api/classes/${encodeURIComponent(cleanCode)}`);
      if (res.ok) {
        const serverClass: ClassSession = await res.json();
        if (serverClass) {
          // Update local cache
          const localClasses = this.getClasses();
          const existingIdx = localClasses.findIndex(c => c.code.toUpperCase() === cleanCode);
          if (existingIdx !== -1) {
            localClasses[existingIdx] = serverClass;
          } else {
            localClasses.unshift(serverClass);
          }
          localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(localClasses));
          return serverClass;
        }
      }
    } catch (err) {
      console.warn('Could not fetch class from server, falling back to local cache:', err);
    }

    // 2. Fallback to local storage
    return this.getClassByCode(cleanCode);
  },

  addClass(newClass: Omit<ClassSession, 'id' | 'createdAt' | 'status'>): ClassSession {
    const classes = this.getClasses();
    const created: ClassSession = {
      ...newClass,
      id: 'class-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      code: newClass.code.trim().toUpperCase(),
      createdAt: new Date().toISOString(),
      status: 'scheduled'
    };
    classes.unshift(created);
    localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));

    // Async post to server
    fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created)
    }).catch(err => console.warn('Failed to sync new class to server:', err));

    return created;
  },

  updateClass(id: string, updates: Partial<ClassSession>): void {
    const classes = this.getClasses();
    const index = classes.findIndex(c => c.id === id);
    if (index !== -1) {
      classes[index] = { ...classes[index], ...updates };
      localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));

      fetch(`/api/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }).catch(err => console.warn('Failed to sync class update to server:', err));
    }
  },

  deleteClass(id: string): void {
    const classes = this.getClasses().filter(c => c.id !== id);
    localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));

    fetch(`/api/classes/${id}`, {
      method: 'DELETE'
    }).catch(err => console.warn('Failed to sync class deletion to server:', err));
  },

  getUserName(): string {
    return localStorage.getItem(USER_PROFILE_KEY) || '';
  },

  setUserName(name: string): void {
    localStorage.setItem(USER_PROFILE_KEY, name);
  },

  getSharableRoomLink(
    sessionOrCode: ClassSession | string,
    customParams?: { title?: string; adminName?: string; accessMode?: string; subject?: string }
  ): string {
    let origin = window.location.origin;
    // Replace Cloud Run dev URL with the public preview URL so external participants are NOT prompted for Google account login!
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }

    if (typeof sessionOrCode === 'object') {
      const s = sessionOrCode;
      const code = encodeURIComponent(s.code);
      const title = encodeURIComponent(s.title || `Clase ${s.code}`);
      const admin = encodeURIComponent(s.adminName || 'Docente');
      const mode = encodeURIComponent(s.accessMode || 'direct');
      const subject = encodeURIComponent(s.subject || 'Reunión Virtual');
      return `${origin}/?room=${code}&role=student&title=${title}&admin=${admin}&mode=${mode}&subject=${subject}`;
    }

    const cleanCode = (sessionOrCode || '').trim().toUpperCase();
    const found = this.getClassByCode(cleanCode);
    if (found) {
      const code = encodeURIComponent(found.code);
      const title = encodeURIComponent(found.title || `Clase ${found.code}`);
      const admin = encodeURIComponent(found.adminName || 'Docente');
      const mode = encodeURIComponent(found.accessMode || 'direct');
      const subject = encodeURIComponent(found.subject || 'Reunión Virtual');
      return `${origin}/?room=${code}&role=student&title=${title}&admin=${admin}&mode=${mode}&subject=${subject}`;
    }

    const code = encodeURIComponent(cleanCode);
    const title = encodeURIComponent(customParams?.title || `Sala ${cleanCode}`);
    const admin = encodeURIComponent(customParams?.adminName || 'Docente');
    const mode = encodeURIComponent(customParams?.accessMode || 'direct');
    const subject = encodeURIComponent(customParams?.subject || 'Reunión Virtual');
    return `${origin}/?room=${code}&role=student&title=${title}&admin=${admin}&mode=${mode}&subject=${subject}`;
  }
};
