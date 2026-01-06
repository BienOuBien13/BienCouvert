import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';
import { User as UserIcon, Mail, Lock, Save, Check } from 'lucide-react';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
}

export const UserProfile: React.FC<Props> = ({ user, onUpdateUser }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');

    try {
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const updatedUser = await authService.updateUser(user.id, {
        name,
        email,
        password: password || undefined
      });
      
      onUpdateUser(updatedUser);
      setStatus('success');
      setPassword('');
      
      // Reset success message after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || "Erreur lors de la mise à jour.");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-slate-600" />
          Mon Profil
        </h2>
        <p className="text-slate-500 text-sm mt-1">Gérez vos informations personnelles et de connexion</p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adresse Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                required
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-medium text-slate-900 mb-4">Sécurité</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nouveau mot de passe
                <span className="text-slate-400 font-normal ml-1">(laisser vide pour ne pas changer)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>
          </div>
        </div>

        {status === 'error' && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {errorMessage}
          </div>
        )}

        {status === 'success' && (
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            Profil mis à jour avec succès !
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:ring-4 focus:ring-primary-200 transition-all disabled:opacity-70"
          >
            {status === 'saving' ? (
              'Enregistrement...'
            ) : (
              <>
                <Save className="w-4 h-4" />
                Enregistrer les modifications
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};