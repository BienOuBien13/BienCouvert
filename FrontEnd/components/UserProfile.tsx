
import React, { useState } from 'react';
import { User, UserProfileData } from '../types';
import { authService } from '../services/authService';
// Import Loader2 which was missing and causing a compilation error
import { 
  User as UserIcon, Mail, Lock, Save, Check,
  ShieldAlert, Sparkles, Info, Loader2, X, FileText, Shield
} from 'lucide-react';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onUpdateProfile?: (profile: UserProfileData) => void;
  onClose?: () => void;
  onDeleteAccount?: () => void;
}

export const UserProfile: React.FC<Props> = ({ user, onUpdateUser, onUpdateProfile, onClose, onDeleteAccount }) => {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [profile, setProfile] = useState<UserProfileData>(user.profile || {
    adultsCount: 1,
    childrenCount: 0,
    housingStatus: 'tenant'
  });
  
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const updatedUser = await authService.updateUser(user.id, {
        firstName,
        lastName,
        // Email n'est plus envoyé car non modifiable
        password: password || undefined,
        profile
      });
      
      onUpdateUser(updatedUser);
      if (onUpdateProfile) onUpdateProfile(profile);
      
      setStatus('success');
      setPassword('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || "Erreur lors de la mise à jour.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-fadeIn">
      {/* Bouton fermeture */}
      {onClose && (
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-colors"
        >
          <X className="w-5 h-5" />
          <span>Retour</span>
        </button>
      )}

      {/* Profile Header Card */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-primary-500 rounded-3xl flex items-center justify-center text-3xl font-black shadow-lg shadow-primary-500/20">
              {firstName.charAt(0).toUpperCase()}{lastName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tighter">{firstName} {lastName}</h2>
              <p className="text-primary-400 font-medium">{email}</p>
            </div>
          </div>
        </div>
        <Sparkles className="absolute -right-8 -top-8 w-40 h-40 text-white/5" />
      </div>

      {/* Main Profile Content */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-8 lg:p-12 space-y-10">
          <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Prénom</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nom</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">
                    Adresse Email <span className="text-red-500">(non modifiable)</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 cursor-not-allowed"
                      title="L'email est une clé unique et ne peut pas être modifié"
                    />
                  </div>
                  <p className="text-xs text-slate-500 ml-1">L'email est votre identifiant unique et ne peut pas être changé</p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 space-y-4">
                <div className="flex items-center gap-3 text-slate-900 mb-4">
                  <Lock className="w-5 h-5" />
                  <h3 className="font-black text-lg">Changement de mot de passe</h3>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-primary-500 outline-none font-bold"
                    placeholder="••••••••"
                    minLength={6}
                  />
                  <p className="text-[10px] text-slate-400 italic ml-1">Laissez vide pour conserver le mot de passe actuel.</p>
                </div>
              </div>
            </div>

          {/* Action Footer */}
          <div className="pt-10 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3 text-slate-400">
               <Info className="w-5 h-5" />
               <p className="text-[10px] font-bold uppercase tracking-widest">Dernière mise à jour : Aujourd'hui</p>
            </div>
            
            <button
              type="submit"
              disabled={status === 'saving'}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-5 bg-primary-600 text-white rounded-2xl font-black text-sm hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/20 active:scale-95 disabled:opacity-70"
            >
              {status === 'saving' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : status === 'success' ? (
                <Check className="w-5 h-5" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {status === 'saving' ? 'Enregistrement...' : status === 'success' ? 'Profil Sauvegardé' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>

        {/* Zone de suppression de compte (RGPD) */}
        <div className="mt-8 pt-8 border-t border-red-200 px-8 pb-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-red-900 mb-2">🗑️ Zone de danger</h3>
              <p className="text-sm text-red-700 mb-4">
                La suppression de votre compte est <strong>définitive et irréversible</strong>. 
                Toutes vos données (contrats, profil, documents) seront définitivement supprimées.
              </p>
              
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-6 py-3 bg-white border-2 border-red-500 text-red-700 rounded-xl font-bold text-sm hover:bg-red-50 transition-all"
                >
                  Supprimer mon compte
                </button>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-red-800 font-bold">
                    Pour confirmer, tapez "<span className="font-mono">SUPPRIMER</span>" ci-dessous :
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="SUPPRIMER"
                    className="w-full px-4 py-3 border-2 border-red-300 rounded-xl focus:border-red-500 outline-none font-mono"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText('');
                      }}
                      className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-300 transition-all"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (deleteConfirmText === 'SUPPRIMER' && onDeleteAccount) {
                          onDeleteAccount();
                        }
                      }}
                      disabled={deleteConfirmText !== 'SUPPRIMER'}
                      className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmer la suppression
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* CGU & Politique de confidentialité */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 py-6 space-y-3">
          <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Informations légales</h3>
          <button
            onClick={() => {
              const isNative = (window as any).Capacitor?.isNativePlatform?.();
              window.open('https://biencouvert.fr/cgu', isNative ? '_system' : '_blank', 'noopener,noreferrer');
            }}
            className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 rounded-2xl hover:bg-slate-100 active:scale-[0.98] transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-slate-800 text-sm">Conditions Générales d'Utilisation</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Consulter les CGU</p>
            </div>
            <X className="w-4 h-4 text-slate-300 rotate-45 group-hover:text-slate-400 transition-colors" />
          </button>
          <button
            onClick={() => {
              const isNative = (window as any).Capacitor?.isNativePlatform?.();
              window.open('https://biencouvert.fr/confidentialite', isNative ? '_system' : '_blank', 'noopener,noreferrer');
            }}
            className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50 rounded-2xl hover:bg-slate-100 active:scale-[0.98] transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-slate-800 text-sm">Politique de confidentialité</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Consulter la politique de confidentialité</p>
            </div>
            <X className="w-4 h-4 text-slate-300 rotate-45 group-hover:text-slate-400 transition-colors" />
          </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 flex items-center gap-3 animate-fadeIn">
          <ShieldAlert className="w-5 h-5" />
          <p className="text-sm font-bold">{errorMessage}</p>
        </div>
      )}
    </div>
  );
};
