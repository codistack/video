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

    if (roomParam) {
      setUrlRoomCode(roomParam);
      setCurrentRole('student'); // Default to student when arriving via room link
    } else if (roleParam === 'student') {
      setCurrentRole('student');
    }
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
