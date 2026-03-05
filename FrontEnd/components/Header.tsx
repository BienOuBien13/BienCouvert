import React from 'react';
import { ShieldCheck, LogOut, User as UserIcon, Settings } from 'lucide-react';
import { User } from '../types';

interface Props {
  user: User | null;
  onLogout: () => void;
  onProfileClick: () => void;
}

export const Header: React.FC<Props> = ({ user, onLogout, onProfileClick }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
          <img src="/logo_biencouvert.png" alt="BienCouvert" className="h-10 w-auto" />
        </div>
        
        {user && (
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={onProfileClick}
              className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
            >
              <UserIcon className="w-4 h-4 text-slate-500" />
              <span className="font-medium hidden sm:inline max-w-[100px] truncate">{user.firstName} {user.lastName}</span>
              <Settings className="w-3 h-3 text-slate-400 ml-1" />
            </button>
            <button 
              onClick={onLogout}
              className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
              title="Se déconnecter"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};