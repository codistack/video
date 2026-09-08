import React, { useEffect, useState, useRef } from 'react';
import { Subtitles, Volume2, AlertCircle } from 'lucide-react';
import { TranscriptionItem } from '../types/conference';

interface SubtitlesOverlayProps {
  isEnabled: boolean;
  speakerName: string;
  onNewTranscription?: (item: TranscriptionItem) => void;
}

export const SubtitlesOverlay: React.FC<SubtitlesOverlayProps> = ({
  isEnabled,
  speakerName,
  onNewTranscription
}) => {
  const [currentText, setCurrentText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      setCurrentText('');
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setErrorInfo('Tu navegador no soporta Web Speech API. Te recomendamos usar Google Chrome o Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES'; // Spanish language speech recognition

      recognition.onstart = () => {
        setIsListening(true);
        setErrorInfo(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const displayText = finalTranscript || interimTranscript;
        setCurrentText(displayText);

        if (finalTranscript && onNewTranscription) {
          onNewTranscription({
            id: 'trans-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
            senderName: speakerName,
            text: finalTranscript.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isFinal: true
          });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // Normal silence, restart if enabled
        } else if (event.error === 'not-allowed') {
          setErrorInfo('Permiso de micrófono denegado para transcripción.');
        }
      };

      recognition.onend = () => {
        // Automatically restart if still enabled
        if (isEnabled) {
          try {
            recognition.start();
          } catch (e) {}
        } else {
          setIsListening(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

    } catch (err) {
      console.error('Error initializing Speech Recognition:', err);
      setErrorInfo('No se pudo inicializar la transcripción en vivo.');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [isEnabled, speakerName]);

  if (!isEnabled) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4 pointer-events-none animate-fade-in">
      <div className="bg-slate-950/85 backdrop-blur-md border border-indigo-500/30 rounded-2xl p-4 shadow-2xl text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
          <Subtitles className="w-3.5 h-3.5" />
          <span>Subtítulos en Vivo (Voz a Texto API)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        </div>

        {errorInfo ? (
          <p className="text-xs text-rose-400 flex items-center justify-center gap-1.5 pt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorInfo}</span>
          </p>
        ) : (
          <p className="text-sm md:text-base font-medium text-white drop-shadow leading-snug">
            {currentText ? (
              <span>
                <span className="text-indigo-300 font-bold mr-1.5">{speakerName}:</span>
                "{currentText}"
              </span>
            ) : (
              <span className="text-slate-400 italic text-xs">
                Escuchando audio en tiempo real... Habla por el micrófono para generar subtítulos.
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};
