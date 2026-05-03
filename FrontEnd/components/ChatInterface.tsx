
import React, { useState, useRef, useEffect } from 'react';
import { uuid } from '../utils/uuid';
import { Send, Bot, Mic, MicOff, Activity, X, Sparkles } from 'lucide-react';
import { Message, Policy } from '../types';
import { sendMessageToAssistant, sendMessageToAssistantStream, connectLiveSession } from '../services/geminiService';

// ─────────────────────────────────────────────────────────────────────────────
// Rendu Markdown simplifié : gère liens [text](url), gras, titres, listes
// Les liens vers les CG deviennent des <a> cliquables pointant vers le PDF
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    // Gras : **text**
    let line = rawLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italique : *text*
    line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Code inline : `code`
    line = line.replace(/`([^`]+)`/g, '<code class="bg-slate-200 rounded px-1 text-[11px]">$1</code>');
    // Liens Markdown [texte](url) → <a> cliquable ouvrant dans un nouvel onglet
    line = line.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary-600 underline hover:text-primary-800 font-medium break-all">$1 ↗</a>'
    );

    // Éléments de liste (- ou •)
    if (/^[-•]\s/.test(line)) {
      if (!inList) { parts.push('<ul class="list-disc pl-5 space-y-0.5 my-1">'); inList = true; }
      parts.push('<li>' + line.replace(/^[-•]\s/, '') + '</li>');
      continue;
    } else if (inList) {
      parts.push('</ul>');
      inList = false;
    }

    // Titres
    if (/^#{1,3}\s/.test(line)) {
      const level = (line.match(/^(#{1,3})\s/) || ['', ''])[1].length;
      const content = line.replace(/^#{1,3}\s/, '');
      const cls = level === 1 ? 'font-bold text-base text-slate-900 mt-3 mb-1' : 'font-semibold text-sm text-slate-800 mt-2';
      parts.push(`<p class="${cls}">${content}</p>`);
      continue;
    }

    // Ligne vide
    if (line.trim() === '') { parts.push('<br>'); continue; }

    // Ligne ordinaire
    parts.push(line + '<br>');
  }

  if (inList) parts.push('</ul>');

  // Nettoyer les <br> en double en fin de liste
  return parts.join('').replace(/<\/ul><br>/g, '</ul>').replace(/(<br>){3,}/g, '<br><br>');
}

interface Props {
  policies: Policy[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export const ChatInterface: React.FC<Props> = ({ policies, messages, setMessages }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // State for Live Transcriptions (to show in UI immediately)
  const [liveUserText, setLiveUserText] = useState('');
  const [liveModelText, setLiveModelText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  
  // Refs to track latest transcription values for the closure in connectLiveSession
  const liveUserTextRef = useRef('');
  const liveModelTextRef = useRef('');
  
  const cleanupLiveSession = useRef<(() => void) | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Ne plus scroller automatiquement - l'utilisateur garde le contrôle
    // Le scroll automatique est désactivé pour éviter les sauts de page
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
    // scrollToBottom() désactivé volontairement
  }, [messages, isLoading, isLive, liveUserText, liveModelText]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (cleanupLiveSession.current) {
        cleanupLiveSession.current();
      }
    };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: uuid(),
      role: 'user',
      text: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Créer un message bot vide qui sera rempli progressivement
    const botMessageId = uuid();
    const initialBotMessage: Message = {
      id: botMessageId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, initialBotMessage]);

    try {
      let accumulatedText = '';
      
      await sendMessageToAssistantStream(
        userMessage.text,
        policies,
        messages,
        // onChunk: Ajouter progressivement le texte
        (chunk: string) => {
          accumulatedText += chunk;
          setMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { ...msg, text: accumulatedText }
                : msg
            )
          );
        },
        // onComplete
        () => {
          setIsLoading(false);
        },
        // onError
        (error: string) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === botMessageId 
                ? { ...msg, text: `Erreur: ${error}` }
                : msg
            )
          );
          setIsLoading(false);
        }
      );
    } catch (error) {
      const errorMessage = "Désolé, j'ai rencontré une erreur. Veuillez réessayer.";
      setMessages(prev => 
        prev.map(msg => 
          msg.id === botMessageId 
            ? { ...msg, text: errorMessage }
            : msg
        )
      );
      setIsLoading(false);
    }
  };

  const toggleLiveSession = async () => {
    if (isLive) {
      // Stop Session
      if (cleanupLiveSession.current) cleanupLiveSession.current();
      cleanupLiveSession.current = null;
      setIsLive(false);
      setLiveUserText('');
      setLiveModelText('');
      liveUserTextRef.current = '';
      liveModelTextRef.current = '';
    } else {
      // Start Session
      setIsLive(true);
      setLiveUserText('');
      setLiveModelText('');
      liveUserTextRef.current = '';
      liveModelTextRef.current = '';
      
      try {
        const cleanup = await connectLiveSession(
          policies,
          (inputText) => {
             setLiveUserText(prev => prev + inputText);
             liveUserTextRef.current += inputText;
          },
          (outputText) => {
             setLiveModelText(prev => prev + outputText);
             liveModelTextRef.current += outputText;
          },
          () => {
             // Turn Complete
             const finalUserText = liveUserTextRef.current;
             const finalModelText = liveModelTextRef.current;

             if (finalUserText || finalModelText) {
               setMessages(prev => {
                 const newMessages = [...prev];
                 // Only add if there is actual content
                 if (finalUserText.trim()) {
                   newMessages.push({
                     id: uuid(),
                     role: 'user',
                     text: finalUserText,
                     timestamp: Date.now()
                   });
                 }
                 if (finalModelText.trim()) {
                   newMessages.push({
                     id: uuid(),
                     role: 'model',
                     text: finalModelText,
                     timestamp: Date.now()
                   });
                 }
                 return newMessages;
               });
             }

             // Reset for next turn
             setLiveUserText('');
             setLiveModelText('');
             liveUserTextRef.current = '';
             liveModelTextRef.current = '';
          }
        );
        cleanupLiveSession.current = cleanup;
      } catch (error) {
        console.error("Failed to start live session", error);
        setIsLive(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <Bot className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Assistant Expert</h3>
            <p className="text-xs text-slate-500">Posez vos questions sur vos contrats</p>
          </div>
        </div>
        {isLive && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium animate-pulse">
            <Activity className="w-3 h-3" />
            En direct
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white chat-scroll">
        {messages.length === 0 && !isLive && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 mt-10">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary-400" />
            </div>
            <p className="text-slate-500 max-w-xs">
              "Est-ce que je suis couvert pour le bris de glace ?"<br/>
              "Quel est le montant de ma franchise ?"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm bg-primary-600 text-white rounded-br-none">
                {msg.text}
              </div>
            ) : (
              <div
                className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
              />
            )}
          </div>
        ))}

        {/* Live Transcription Bubbles (Temporary) */}
        {(liveUserText || (isLive && !liveModelText)) && (
           <div className="flex justify-end">
             <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm bg-primary-600/80 text-white rounded-br-none animate-pulse">
                {liveUserText || "..."}
             </div>
           </div>
        )}
        
        {liveModelText && (
           <div className="flex justify-start">
             <div
               className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200"
               dangerouslySetInnerHTML={{ __html: renderMarkdown(liveModelText) }}
             />
           </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <form onSubmit={handleSend} className="flex items-center gap-3">
          <div className="relative flex-grow">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLive ? "Mode vocal actif (cliquez sur le micro pour arrêter)..." : "Posez votre question..."}
              disabled={isLoading || isLive}
              className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all disabled:opacity-60 disabled:bg-slate-100 text-sm"
            />
          </div>

          {/* Mic Button */}
          <button
            type="button"
            onClick={toggleLiveSession}
            className={`p-3 rounded-xl flex-shrink-0 transition-all duration-300 ${
              isLive 
                ? 'bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600 ring-4 ring-red-100 scale-105' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-primary-600'
            }`}
            title={isLive ? "Arrêter le mode vocal" : "Démarrer le mode vocal"}
          >
            {isLive ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Send Button */}
          {!isLive && (
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
