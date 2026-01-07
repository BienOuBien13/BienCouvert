
import React from 'react';
import { 
  ShieldCheck, 
  Files, 
  MessageSquare, 
  Zap, 
  Users, 
  User as UserIcon, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { AppView, User } from '../types';

interface Props {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  user: User;
  onLogout: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<Props> = ({ 
  activeView, 
  setActiveView, 
  user, 
  onLogout, 
  isCollapsed, 
  setIsCollapsed,
  isMobileOpen,
  onCloseMobile
}) => {
  const menuItems = [
    { id: 'policies' as AppView, label: 'Mes Contrats', icon: Files },
    { id: 'chat' as AppView, label: 'Assistant IA', icon: MessageSquare },
    { id: 'analysis' as AppView, label: 'Optimisation', icon: Zap },
    { id: 'experts' as AppView, label: 'Experts Humains', icon: Users },
  ];

  const sidebarClasses = `
    fixed left-0 top-0 z-50 h-screen bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ease-in-out
    ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
    ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
  `;

  // NavItem logic is now inlined in the map below to fix the type error with 'key' prop

  return (
    <>
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={sidebarClasses}>
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-primary-600 p-2 rounded-lg flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className={`text-xl font-bold text-white whitespace-nowrap transition-opacity ${isCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'}`}>
              AssurClair
            </span>
          </div>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          
          <button onClick={onCloseMobile} className="lg:hidden p-1 text-slate-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto scrollbar-hide">
          {/* Inlined NavItem logic here to fix the TypeScript error on 'key' prop */}
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  if (window.innerWidth < 1024) onCloseMobile();
                }}
                title={isCollapsed ? item.label : ''}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative ${
                  isActive 
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' 
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={`font-medium whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'}`}>
                  {item.label}
                </span>
                {isCollapsed && isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-l-full hidden lg:block" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => {
              setActiveView('profile');
              if (window.innerWidth < 1024) onCloseMobile();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeView === 'profile' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className={`text-left overflow-hidden transition-opacity ${isCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'}`}>
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">Paramètres</p>
            </div>
          </button>

          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all ${isCollapsed ? 'lg:justify-center' : ''}`}
            title={isCollapsed ? "Déconnexion" : ""}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className={`text-sm font-medium whitespace-nowrap transition-opacity ${isCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'}`}>
              Déconnexion
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
