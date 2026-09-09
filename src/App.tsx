import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { AdminPanel } from './components/AdminPanel';
import { StudentPreJoin } from './components/StudentPreJoin';
import { ConferenceRoom } from './components/ConferenceRoom';
import { ClassSession, PreCallSettings } from './types/conference';
import { StorageService } from './services/storage';

export function App() {
  const [currentRole, setCurrentRole] = useState<'admin' | 'student'>('admin');
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null);
  const [preCallSettings, setPreCallSettings] = useState<PreCallSettings | null>(null);
  const [urlRoomCode, setUrlRoomCode] = useState<string>('');

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const roleParam = params.get('role');

    if (!roomParam) {
      if (roleParam === 'student') {
        setCurrentRole('student');
      }
      return;
    }

    const cleanCode = roomParam.trim().toUpperCase();
    const titleParam = params.get('title') || `Clase ${cleanCode}`;
    const adminParam = params.get('admin') || 'Docente';
    const modeParam = (params.get('mode') as 'direct' | 'permission') || 'direct';
    const subjectParam = params.get('subject') || 'Reunión Virtual';
    const nameParam = params.get('name');

    const resolveAndJoin = async () => {
      let session: ClassSession | null = await StorageService.fetchClassByCode(cleanCode);
      if (!session) {
        session = {
          id: 'url-' + cleanCode,
          code: cleanCode,
          title: titleParam,
          subject: subjectParam,
          date: new Date().toISOString().split('T')[0],
          time: 'Ahora',
          accessMode: modeParam,
          adminName: adminParam,
          createdAt: new Date().toISOString(),
          status: 'live'
        };
        StorageService.addClass(session);
      }

      // If accessMode is 'direct': join ConferenceRoom immediately with NO login, registration or forms!
      if (session.accessMode === 'direct') {
        const studentName = nameParam || StorageService.getUserName() || `Estudiante ${Math.floor(100 + Math.random() * 900)}`;
        StorageService.setUserName(studentName);
        setActiveSession(session);
        setCurrentRole('student');
        setPreCallSettings({
          name: studentName,
          isMuted: false,
          isCameraOff: false,
          participantId: 'usr-' + Math.random().toString(36).substr(2, 6)
        });
      } else {
        // If accessMode is 'permission': show waiting room for teacher approval
        setUrlRoomCode(cleanCode);
        setCurrentRole('student');
      }
    };

    resolveAndJoin();
  }, []);

  const handleStartClassAsAdmin = (session: ClassSession) => {
    const adminName = StorageService.getUserName() || session.adminName || 'Profesor Admin';
    setActiveSession(session);
    setCurrentRole('admin');
    setPreCallSettings({
      name: adminName,
      isMuted: false,
      isCameraOff: false
    });
  };

  const handleJoinClassAsStudent = (
    session: ClassSession, 
    studentName: string, 
    settings: PreCallSettings
  ) => {
    setActiveSession(session);
    setCurrentRole('student');
    setPreCallSettings(settings);
  };

  const handleLeaveConference = () => {
    setActiveSession(null);
    setPreCallSettings(null);
    // Clear URL parameters without reload
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentRole={currentRole}
        onSwitchRole={(role) => {
          setCurrentRole(role);
          if (!activeSession) {
            setUrlRoomCode('');
          }
        }}
        inCall={!!activeSession}
      />

      {/* Main Body Content */}
      <main className="flex-1 flex flex-col">
        {activeSession && preCallSettings ? (
          /* 1. Active Conference Room View */
          <ConferenceRoom
            classSession={activeSession}
            userRole={currentRole}
            userName={preCallSettings.name}
            preCallSettings={preCallSettings}
            onLeaveRoom={handleLeaveConference}
          />
        ) : currentRole === 'admin' ? (
          /* 2. Admin Management Panel View */
          <AdminPanel onStartClass={handleStartClassAsAdmin} />
        ) : (
          /* 3. Student Pre-Join View */
          <StudentPreJoin
            initialRoomCode={urlRoomCode}
            onJoinRoom={handleJoinClassAsStudent}
            onCancel={() => {
              setCurrentRole('admin');
              setUrlRoomCode('');
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
