import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  BookOpen, 
  Plus, 
  Copy, 
  Share2, 
  ShieldAlert, 
  ShieldCheck, 
  Video, 
  Trash2, 
  Check, 
  Sparkles,
  Search,
  ExternalLink,
  Users
} from 'lucide-react';
import { ClassSession, AccessMode } from '../types/conference';
import { StorageService } from '../services/storage';

interface AdminPanelProps {
  onStartClass: (classSession: ClassSession) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onStartClass }) => {
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('10:00');
  const [accessMode, setAccessMode] = useState<AccessMode>('permission');
  const [adminName, setAdminName] = useState('Profesor Admin');

  useEffect(() => {
    loadClasses();
    const savedName = StorageService.getUserName();
    if (savedName) setAdminName(savedName);
  }, []);

  const loadClasses = () => {
    setClasses(StorageService.getClasses());
  };

  const generateUniqueCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    code += '-';
    for (let i = 0; i < 3; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim()) return;

    StorageService.setUserName(adminName);

    const newClass = StorageService.addClass({
      code: generateUniqueCode(),
      title: title.trim(),
      subject: subject.trim(),
      date,
      time,
      accessMode,
      adminName: adminName.trim() || 'Profesor Admin'
    });

    setClasses(StorageService.getClasses());
    setIsCreating(false);
    // Reset form
    setTitle('');
    setSubject('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de eliminar esta clase agendada?')) {
      StorageService.deleteClass(id);
      loadClasses();
    }
  };

  const toggleAccessMode = (session: ClassSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode: AccessMode = session.accessMode === 'direct' ? 'permission' : 'direct';
    StorageService.updateClass(session.id, { accessMode: newMode });
    loadClasses();
  };

  const getDirectLink = (code: string) => {
    return `${window.location.origin}/?room=${code}`;
  };

  const copyToClipboard = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = getDirectLink(code);
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const shareViaWhatsApp = (session: ClassSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = getDirectLink(session.code);
    const text = `🎓 *Invitación a Clase Virtual - EduMeet Pro*\n\n📌 *Tema:* ${session.title}\n📚 *Materia:* ${session.subject}\n📅 *Fecha:* ${session.date} a las ${session.time}\n🔑 *Código de Clase:* ${session.code}\n\n👉 *Unirse con un clic:* ${link}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const filteredClasses = classes.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900/60 via-slate-900 to-purple-900/40 border border-slate-800/80 p-6 lg:p-10 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> Panel de Administración Docente
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              Gestión de Clases Virtuales
            </h1>
            <p className="text-slate-400 text-sm max-w-2xl">
              Crea salas con enlaces directos, administra la seguridad de acceso y mantén el control total de tus sesiones en vivo.
            </p>
          </div>

          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Agendar Nueva Clase</span>
          </button>
        </div>
      </div>

      {/* Modal / Form para Crear Clase */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl glass-panel rounded-3xl border border-slate-700/80 p-6 lg:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Agendar Clase Virtual</h2>
                  <p className="text-xs text-slate-400">Configura los detalles y permisos de acceso</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre del Profesor / Administrador</label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ej. Prof. Juan Pérez"
                  className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tema / Título de la Clase</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Ecuaciones Diferenciales y Matrices"
                  className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Materia / Asignatura</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ej. Matemáticas III"
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Modo de Acceso</label>
                  <select
                    value={accessMode}
                    onChange={(e) => setAccessMode(e.target.value as AccessMode)}
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="permission">🔒 Requiere permiso del admin (Sala de Espera)</option>
                    <option value="direct">⚡ Ingreso directo sin espera</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Hora de Inicio</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 transition"
                >
                  Guardar y Generar Código
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Classes Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Clases Programadas ({classes.length})</h2>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por tema, materia o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 focus:border-indigo-500/50 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredClasses.length === 0 ? (
          <div className="glass-panel rounded-3xl border border-slate-800/80 p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Video className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">No hay clases agendadas</h3>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Crea tu primera sala de videoconferencia haciendo clic en "Agendar Nueva Clase".
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.map((item) => {
              const isCopied = copiedCode === item.code;
              return (
                <div
                  key={item.id}
                  className="glass-panel glass-panel-hover rounded-3xl border border-slate-800/80 p-6 flex flex-col justify-between space-y-5 relative group"
                >
                  {/* Top Badge & Delete */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {item.code}
                    </span>

                    <div className="flex items-center gap-2">
                      {/* Access mode button toggle */}
                      <button
                        onClick={(e) => toggleAccessMode(item, e)}
                        title={item.accessMode === 'permission' ? 'Modo: Requiere Permiso del Admin' : 'Modo: Ingreso Directo'}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                          item.accessMode === 'permission'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {item.accessMode === 'permission' ? (
                          <>
                            <ShieldAlert className="w-3 h-3" /> Permiso
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3" /> Directo
                          </>
                        )}
                      </button>

                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                        title="Eliminar clase"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Subject */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold tracking-wide uppercase text-indigo-400">
                      {item.subject}
                    </span>
                    <h3 className="text-lg font-bold text-white leading-snug line-clamp-2">
                      {item.title}
                    </h3>
                  </div>

                  {/* Date & Time */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{item.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{item.time} hs</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => onStartClass(item)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 hover:scale-[1.01] transition cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                      <span>Iniciar Clase como Profesor</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={(e) => copyToClipboard(item.code, e)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={(e) => shareViaWhatsApp(item, e)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600/20 text-emerald-300 text-xs font-semibold rounded-xl transition"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
