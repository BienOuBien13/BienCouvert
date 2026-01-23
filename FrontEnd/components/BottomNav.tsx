
import React from 'react';
import { Home, Files, MessageSquare, Zap, Users, User as UserIcon, Plus } from 'lucide-react';
import { AppView } from '../types';

interface Props {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}

export const BottomNav: React.FC<Props> = ({ activeView, setActiveView }) => {
  const navItems = [
    { id: 'home' as AppView, label: 'Accueil', icon: Home },
    { id: 'add' as AppView, label: 'Ajouter', icon: Plus, isCentral: true },
    { id: 'policies' as AppView, label: 'Contrats', icon: Files },
    { id: 'chat' as AppView, label: 'Assistant', icon: MessageSquare },
    { id: 'analysis' as AppView, label: 'Optimisation', icon: Zap },
    { id: 'experts' as AppView, label: 'Experts', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 px-2 pb-safe-area-inset-bottom z-[100] shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
      <div className="max-w-md mx-auto flex items-center justify-between h-20">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          if (item.isCentral) {
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`relative -top-6 flex flex-col items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all active:scale-90 ${
                  isActive 
                  ? 'bg-primary-600 text-white shadow-primary-600/40' 
                  : 'bg-slate-900 text-white shadow-slate-900/20'
                }`}
              >
                <Icon className="w-7 h-7" />
                <span className="absolute -bottom-7 text-[9px] font-black uppercase text-slate-400">Assistant</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex flex-col items-center justify-center flex-1 gap-1 transition-all ${
                isActive ? 'text-primary-600 scale-110' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
              <span className={`text-[9px] font-bold uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>
              {isActive && <div className="w-1 h-1 rounded-full bg-primary-600 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
