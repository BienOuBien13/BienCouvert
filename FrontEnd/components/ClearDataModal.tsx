
import React from 'react';
import { X, Trash2, Save, ShieldCheck, AlertTriangle, Headset, ArrowRight, Users } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: () => void;
  onConfirmSave: () => void;
  onTransferToExpert: () => void;
}

export const ClearDataModal: React.FC<Props> = ({ isOpen, onClose, onConfirmClear, onConfirmSave, onTransferToExpert }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl animate-fadeIn">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn relative">
        <div className="p-10 text-center space-y-6">
          <div className="mx-auto w-20 h-20 bg-primary-50 rounded-3xl flex items-center justify-center text-primary-600 shadow-inner">
            <ShieldCheck className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Audit Terminé</h2>
            <p className="text-sm text-slate-500 font-medium px-4">
              Souhaitez-vous sauvegarder ce bilan ou approfondir l'analyse avec un expert humain ?
            </p>
          </div>

          <div className="space-y-3 pt-4">
            {/* Main CTA: Transfer to Expert */}
            <button 
              onClick={onTransferToExpert}
              className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-900/20 active:scale-95 group"
            >
              <Users className="w-4 h-4" />
              Transférer à un Expert
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={onConfirmSave}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-lg"
            >
              <Save className="w-4 h-4" />
              Sauvegarder dans mon profil
            </button>
            
            <button 
              onClick={onConfirmClear}
              className="w-full py-4 bg-white border border-red-100 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-50 transition-all mt-4"
            >
              <Trash2 className="w-3 h-3" />
              Tout supprimer (Anonyme)
            </button>
          </div>

          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter flex items-center justify-center gap-2">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            L'expertise humaine est gratuite et sans engagement.
          </p>
        </div>

        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
