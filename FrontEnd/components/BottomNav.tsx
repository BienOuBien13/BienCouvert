
import React from 'react';
import { Home, Files, MessageSquare, TrendingUp, User as UserIcon } from 'lucide-react';
import { AppView } from '../types';

interface Props {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
}

export const BottomNav: React.FC<Props> = ({ activeView, setActiveView }) => {
  const navItems = [
    { id: 'home' as AppView, label: 'Accueil', icon: Home },
    { id: 'policies' as AppView, label: 'Mes Contrats', icon: Files },
    { id: 'chat' as AppView, label: 'Assistant', icon: MessageSquare, isCentral: true },
    { id: 'analysis' as AppView, label: 'Analyse', icon: TrendingUp },
    { id: 'experts' as AppView, label: 'Experts', icon: UserIcon },
  ];


  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-slate-100/80 px-1 z-[100] shadow-[0_-1px_0_0_rgba(0,0,0,0.04),0_-8px_30px_rgba(0,0,0,0.06)]" style={{paddingBottom: 'env(safe-area-inset-bottom, 8px)'}}>
      <div className="max-w-md mx-auto flex items-center justify-between h-[4.5rem]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          if (item.isCentral) {
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`relative -top-5 flex flex-col items-center justify-center w-[4.25rem] h-[4.25rem] rounded-full shadow-2xl transition-all duration-200 active:scale-90 ring-4 ${
                  isActive 
                  ? 'bg-primary-600 text-white shadow-primary-500/50 ring-primary-100' 
                  : 'bg-slate-900 text-white shadow-slate-800/30 ring-transparent'
                }`}
              >
                <Icon className="w-7 h-7" />
                <span className="absolute -bottom-7 text-[9px] font-black uppercase text-slate-400 tracking-wide">Assistant</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className="flex flex-col items-center justify-center flex-1 gap-1 py-1 transition-all duration-200 active:scale-95 min-w-0"
            >
              <div className={`flex items-center justify-center w-12 h-9 rounded-xl transition-all duration-200 ${isActive ? 'bg-primary-50' : ''}`}>
                <Icon className={`w-6 h-6 transition-all duration-200 ${isActive ? 'text-primary-600 stroke-[2.5px]' : 'text-slate-400 stroke-[2px]'}`} />
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-tighter transition-colors duration-200 leading-none ${isActive ? 'text-primary-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
