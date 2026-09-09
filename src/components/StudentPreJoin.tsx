import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  User, 
  ArrowRight, 
  ShieldAlert, 
  Clock, 
  Sparkles,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { ClassSession, PreCallSettings } from '../types/conference';
import { StorageService } from '../services/storage';
import { realtimeService } from '../services/realtime';

interface StudentPreJoinProps {
  initialRoomCode?: string;
  onJoinRoom: (classSession: ClassSession, studentName: string, preCallSettings: PreCallSettings) => void;
  onCancel?: () => void;
}

export const StudentPreJoin: React.FC<StudentPreJoinProps> = ({
  initialRoomCode = '',
  onJoinRoom,
  onCancel
}) => {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [studentName, setStudentName] = useState('');
  const [foundClass, setFoundClass] = useState<ClassSession | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Media preview states
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [hasMediaPermission, setHasMediaPermission] = useState(true);

  // Waiting room state (for permission mode)
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [waitingParticipantId, setWaitingParticipantId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const savedName = StorageService.getUserName();
    if (savedName) {
      setStudentName(savedName);
    } else {
      const defaultName = 'Estudiante ' + Math.floor(100 + Math.random() * 900);
      setStudentName(defaultName);
    }

    if (initialRoomCode) {
      handleLookupRoom(initialRoomCode);
    }

    // Listen for live class details broadcasted by the teacher
    const unsubClassInfo = realtimeService.subscribe('CLASS_INFO_RESPONSE', (event) => {
      if (event.payload && event.payload.classSession) {
        const liveSession: ClassSession = event.payload.classSession;
        setFoundClass(liveSession);
        StorageService.addClass(liveSession);
      }
    });

    return () => unsubClassInfo();
  }, [initialRoomCode]);

  // Handle local camera preview
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        activeStream = stream;
        setMediaStream(stream);
        setHasMediaPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Could not access camera/mic for preview:', err);
        setHasMediaPermission(false);
      }
    };

    startPreview();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Update tracks enabled state
  useEffect(() => {
    if (mediaStream) {
      mediaStream.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOff;
      });
      mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isCameraOff, isMuted, mediaStream]);

  const handleLookupRoom = async (code: string) => {
    setErrorMsg('');
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setFoundClass(null);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const titleParam = params.get('title');
    const adminParam = params.get('admin');
    const modeParam = params.get('mode') as AccessMode | null;
    const subjectParam = params.get('subject');

    const cls = await StorageService.fetchClassByCode(clean);
    if (cls) {
      setFoundClass(cls);
    } else if (titleParam || adminParam || modeParam) {
      const urlClass: ClassSession = {
        id: 'url-' + clean,
        code: clean,
        title: titleParam || `Clase ${clean}`,
        subject: subjectParam || 'Reunión Virtual',
        date: new Date().toISOString().split('T')[0],
        time: 'Ahora',
        accessMode: modeParam || 'direct',
        adminName: adminParam || 'Docente',
        createdAt: new Date().toISOString(),
        status: 'live'
      };
      StorageService.addClass(urlClass);
      setFoundClass(urlClass);
    } else {
      // Create ad-hoc session if code exists but not stored
      const adHoc: ClassSession = {
        id: 'adhoc-' + clean,
        code: clean,
        title: `Sala ${clean}`,
        subject: 'Reunión Virtual',
        date: new Date().toISOString().split('T')[0],
        time: 'Ahora',
        accessMode: 'direct',
        adminName: 'Docente',
        createdAt: new Date().toISOString(),
        status: 'live'
      };
      setFoundClass(adHoc);
    }

    // Connect to room channel and query teacher for live class session details
    realtimeService.init(clean, {
      name: 'Estudiante',
      role: 'student',
      id: studentIdRef
    });
    realtimeService.send('CLASS_INFO_REQUEST', studentIdRef, { code: clean });
  };

  const studentIdRef = useRef('usr-' + Math.random().toString(36).substr(2, 6)).current;

  const handleProceedToRoom = (session: ClassSession) => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      setMediaStream(null);
    }

    onJoinRoom(session, studentName.trim(), {
      name: studentName.trim(),
      isMuted,
      isCameraOff,
      participantId: studentIdRef
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMsg('Por favor ingresa tu Nombre y Apellido');
      return;
    }

    let targetClass = foundClass;
    if (!targetClass) {
      if (!roomCode.trim()) {
        setErrorMsg('Ingresa un código de sala válido');
        return;
      }
      const fetched = await StorageService.fetchClassByCode(roomCode);
      if (fetched) {
        targetClass = fetched;
        setFoundClass(fetched);
      } else {
        targetClass = {
          id: 'adhoc-' + roomCode.trim().toUpperCase(),
          code: roomCode.trim().toUpperCase(),
          title: `Sala ${roomCode.trim().toUpperCase()}`,
          subject: 'Reunión Virtual',
          date: new Date().toISOString().split('T')[0],
          time: 'Ahora',
          accessMode: 'direct',
          adminName: 'Docente',
          createdAt: new Date().toISOString(),
          status: 'live'
        };
        setFoundClass(targetClass);
      }
    }

    StorageService.setUserName(studentName.trim());

    // Check access mode
    if (targetClass.accessMode === 'permission') {
      // Need admin approval
      const tempId = studentIdRef;
      setWaitingParticipantId(tempId);
      setIsWaitingForApproval(true);

      realtimeService.init(targetClass.code, {
        name: studentName.trim(),
        role: 'student',
        id: tempId
      });

      // Send join request immediately and repeat every 2.5 seconds until answered
      const sendJoin = () => {
        realtimeService.send('JOIN_REQUEST', tempId, {
          participantId: tempId,
          name: studentName.trim(),
          role: 'student',
          isMuted,
          isCameraOff
        });
      };

      sendJoin();
      const retryInterval = window.setInterval(sendJoin, 2500);

      const unsubscribe = realtimeService.subscribe('JOIN_RESPONSE', (event) => {
        if (event.payload && event.payload.participantId === tempId) {
          window.clearInterval(retryInterval);
          if (event.payload.accepted) {
            unsubscribe();
            handleProceedToRoom(targetClass!);
          } else {
            setIsWaitingForApproval(false);
            setErrorMsg('El docente ha rechazado la solicitud de ingreso a la sala.');
            unsubscribe();
          }
        }
      });

      return () => {
        window.clearInterval(retryInterval);
        unsubscribe();
      };
    } else {
      // Direct access mode
      handleProceedToRoom(targetClass);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
      <div className="glass-panel rounded-3xl border border-slate-800/80 p-6 lg:p-10 shadow-2xl space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Ingreso a Clase Virtual
          </div>
          <h1 className="text-3xl font-extrabold text-white">Preparar Audio y Video</h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            Verifica tu cámara y micrófono e ingresa tus datos antes de entrar a la sala.
          </p>
        </div>

        {/* Waiting for Approval Overlay Screen */}
        {isWaitingForApproval ? (
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-3xl p-8 text-center space-y-6 animate-pulse">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <Clock className="w-10 h-10 animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Solicitud de Ingreso Enviada</h2>
              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Esperando que el <span className="text-indigo-400 font-semibold">{foundClass?.adminName || 'Administrador'}</span> apruebe tu acceso a la sesión.
              </p>
            </div>
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-400 max-w-sm mx-auto flex items-center justify-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Modo seguro: Requiere aprobación docente</span>
            </div>
            <button
              onClick={() => setIsWaitingForApproval(false)}
              className="px-5 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancelar Solicitud
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            
            {/* Left: Video Preview */}
            <div className="space-y-4">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl group">
                {!isCameraOff && hasMediaPermission ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-slate-500 gap-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
                      <User className="w-8 h-8" />
                    </div>
                    <span className="text-xs text-slate-400 font-semibold">Cámara Desactivada</span>
                  </div>
                )}

                {/* Name Tag Badge */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-medium text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{studentName.trim() || 'Vista Previa'}</span>
                </div>

                {/* Media Control Toggles */}
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-2.5 rounded-xl border transition ${
                      isMuted
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                        : 'bg-slate-950/80 border-slate-800 text-white hover:bg-slate-800'
                    }`}
                    title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCameraOff(!isCameraOff)}
                    className={`p-2.5 rounded-xl border transition ${
                      isCameraOff
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 hover:bg-rose-500/30'
                        : 'bg-slate-950/80 border-slate-800 text-white hover:bg-slate-800'
                    }`}
                    title={isCameraOff ? 'Encender cámara' : 'Apagar cámara'}
                  >
                    {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {!hasMediaPermission && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Sin permiso de cámara o micrófono. Podrás ingresar únicamente como oyente.</span>
                </div>
              )}
            </div>

            {/* Right: Join Form */}
            <form onSubmit={handleFormSubmit} className="space-y-5">
              
              {/* Room Code lookup or status */}
              {foundClass ? (
                <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 space-y-1">
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">
                    Clase Seleccionada: {foundClass.code}
                  </span>
                  <h3 className="text-lg font-bold text-white leading-tight">{foundClass.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                    <span>Materia: {foundClass.subject}</span>
                    <span>•</span>
                    <span>Docente: {foundClass.adminName}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Código de Clase / Reunión
                  </label>
                  <input
                    type="text"
                    required
                    value={roomCode}
                    onChange={(e) => {
                      setRoomCode(e.target.value);
                      handleLookupRoom(e.target.value);
                    }}
                    placeholder="Ej. MATH-2026"
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-sm text-white font-mono uppercase tracking-wider focus:outline-none"
                  />
                </div>
              )}

              {/* Student Full Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nombre y Apellido del Estudiante <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Ingresa tu nombre completo"
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Access Mode Indicator */}
              {foundClass && (
                <div className={`p-3 rounded-2xl text-xs flex items-center gap-2.5 border ${
                  foundClass.accessMode === 'direct'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}>
                  {foundClass.accessMode === 'direct' ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Acceso Directo:</strong> Ingreso inmediato con enlace compartido. No requiere inicio de sesión.</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                      <span><strong>Acceso Controlado:</strong> El docente verificará y autorizará tu ingreso en la sala.</span>
                    </>
                  )}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-indigo-600/30 hover:scale-[1.01] transition cursor-pointer"
                >
                  <span>{foundClass?.accessMode === 'permission' ? 'Solicitar Ingreso a la Sala' : 'Entrar a la Clase Ahora (Acceso Directo)'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white transition"
                  >
                    Volver al Inicio
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
