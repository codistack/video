import React from 'react';
import { Video, Shield, User, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentRole: 'admin' | 'student';
  onSwitchRole?: (role: 'admin' | 'student') => void;
  inCall?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRole, onSwitchRole, inCall = false }) => {
  return (
    <header className="w-full glass-panel border-b border-slate-800/80 sticky top-0 z-40 px-4 lg:px-8 py-3 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.href = '/'}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                EduMeet<span className="text-indigo-400">Pro</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                HD Call
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Plataforma Profesional de Videoconferencias</p>
          </div>
        </div>

        {/* Navigation & Controls */}
        <div className="flex items-center gap-3">
          {!inCall && (
            <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-inner">
              <button
                onClick={() => onSwitchRole?.('admin')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentRole === 'admin'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Modo Admin</span>
              </button>
              <button
                onClick={() => onSwitchRole?.('student')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentRole === 'student'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Modo Estudiante</span>
              </button>
            </div>
          )}

          {inCall && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold text-emerald-400">En Sesión</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400 capitalize">{currentRole === 'admin' ? 'Profesor / Admin' : 'Estudiante'}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
