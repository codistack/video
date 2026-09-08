import React from 'react';
import { 
  Users, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Shield, 
  UserCheck, 
  UserX, 
  UserPlus, 
  X,
  ShieldAlert
} from 'lucide-react';
import { Participant } from '../types/conference';

interface ParticipantsModalProps {
  participants: Participant[];
  pendingRequests: Participant[];
  currentUserRole: 'admin' | 'student';
  currentUserId: string;
  onClose: () => void;
  onMuteParticipant?: (participantId: string) => void;
  onTurnOffCamera?: (participantId: string) => void;
  onAcceptStudent?: (participantId: string) => void;
  onRejectStudent?: (participantId: string) => void;
  onAddSimulatedParticipant?: () => void;
}

export const ParticipantsModal: React.FC<ParticipantsModalProps> = ({
  participants,
  pendingRequests,
  currentUserRole,
  currentUserId,
  onClose,
  onMuteParticipant,
  onTurnOffCamera,
  onAcceptStudent,
  onRejectStudent,
  onAddSimulatedParticipant
}) => {
  const isAdmin = currentUserRole === 'admin';

  return (
    <aside className="w-full lg:w-80 glass-panel border-l border-slate-800 flex flex-col h-full z-30 animate-fade-in shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Participantes ({participants.length})</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Pending Requests Section (Only visible to Admin or if pending requests exist) */}
        {isAdmin && pendingRequests.length > 0 && (
          <div className="space-y-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
              <ShieldAlert className="w-4 h-4" />
              <span>Solicitudes de Ingreso ({pendingRequests.length})</span>
            </div>

            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{req.name}</p>
                    <p className="text-[10px] text-slate-400">Esperando en sala</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onAcceptStudent?.(req.id)}
                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
                      title="Admitir estudiante"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRejectStudent?.(req.id)}
                      className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition"
                      title="Rechazar ingreso"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Participants List */}
        <div className="space-y-3">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            En la Sala
          </span>

          <div className="space-y-2">
            {participants.map((p) => {
              const isMe = p.id === currentUserId;

              return (
                <div
                  key={p.id}
                  className="bg-slate-900/80 border border-slate-800/80 p-3 rounded-2xl flex items-center justify-between gap-2 hover:bg-slate-800/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {p.name} {isMe && '(Tú)'}
                        </span>
                        {p.role === 'admin' && (
                          <Shield className="w-3 h-3 text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 capitalize">
                        {p.role === 'admin' ? 'Profesor / Admin' : 'Estudiante'}
                      </span>
                    </div>
                  </div>

                  {/* Indicators & Remote Controls */}
                  <div className="flex items-center gap-1.5">
                    {/* Remote Mute Button */}
                    {isAdmin && !isMe ? (
                      <button
                        onClick={() => onMuteParticipant?.(p.id)}
                        className={`p-1.5 rounded-lg border transition ${
                          p.isMuted
                            ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-rose-400'
                        }`}
                        title={p.isMuted ? 'Micrófono Silenciado' : 'Silenciar Micrófono'}
                      >
                        {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className={`p-1.5 rounded-lg text-xs ${p.isMuted ? 'text-rose-400' : 'text-slate-400'}`}>
                        {p.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </span>
                    )}

                    {/* Remote Camera Off Button */}
                    {isAdmin && !isMe ? (
                      <button
                        onClick={() => onTurnOffCamera?.(p.id)}
                        className={`p-1.5 rounded-lg border transition ${
                          p.isCameraOff
                            ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-rose-400'
                        }`}
                        title={p.isCameraOff ? 'Cámara Apagada' : 'Apagar Cámara'}
                      >
                        {p.isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className={`p-1.5 rounded-lg text-xs ${p.isCameraOff ? 'text-rose-400' : 'text-slate-400'}`}>
                        {p.isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Option to add simulated participant for quick 1-click testing */}
        {isAdmin && onAddSimulatedParticipant && (
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={onAddSimulatedParticipant}
              className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              <UserPlus className="w-4 h-4 text-indigo-400" />
              <span>Simular Estudiante Virtual</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
