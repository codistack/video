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
        return DEFAULT_CLASSES;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading classes from localStorage:', error);
      return DEFAULT_CLASSES;
    }
  },

  getClassByCode(code: string): ClassSession | null {
    const classes = this.getClasses();
    const cleanCode = code.trim().toUpperCase();
    return classes.find(c => c.code.toUpperCase() === cleanCode) || null;
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
    return created;
  },

  updateClass(id: string, updates: Partial<ClassSession>): void {
    const classes = this.getClasses();
    const index = classes.findIndex(c => c.id === id);
    if (index !== -1) {
      classes[index] = { ...classes[index], ...updates };
      localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));
    }
  },

  deleteClass(id: string): void {
    const classes = this.getClasses().filter(c => c.id !== id);
    localStorage.setItem(CLASSES_STORAGE_KEY, JSON.stringify(classes));
  },

  getUserName(): string {
    return localStorage.getItem(USER_PROFILE_KEY) || '';
  },

  setUserName(name: string): void {
    localStorage.setItem(USER_PROFILE_KEY, name);
  }
};
