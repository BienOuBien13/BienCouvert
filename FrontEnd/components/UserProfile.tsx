
import React, { useState, useMemo } from 'react';
import { User, UserProfileData } from '../types';
import { authService } from '../services/authService';
// Import Loader2 which was missing and causing a compilation error
import { 
  User as UserIcon, Mail, Lock, Save, Check, Briefcase, 
  Users, Home, ShieldAlert, Sparkles, ChevronRight, 
  Settings2, Activity, Info, Loader2, X
} from 'lucide-react';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onUpdateProfile?: (profile: UserProfileData) => void;
  onClose?: () => void;
}

type TabType = 'account' | 'personal' | 'housing' | 'lifestyle';

export const UserProfile: React.FC<Props> = ({ user, onUpdateUser, onUpdateProfile, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<UserProfileData>(user.profile || {
    adultsCount: 1,
    childrenCount: 0,
    housingStatus: 'tenant'
  });
  
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const completeness = useMemo(() => {
    const fields = [
      profile.profession, profile.workStatus, profile.housingStatus, 
      profile.housingSurface, profile.monthlyIncome, profile.riskySports?.length
    ];
    const filled = fields.filter(f => f !== undefined && f !== null && f !== '').length;
    return Math.round((filled / fields.length) * 100);
  }, [profile]);

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

  const updateProfileField = (field: keyof UserProfileData, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const TabButton = ({ id, label, icon: Icon }: { id: TabType, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-6 py-4 border-b-2 transition-all ${
        activeTab === id 
        ? 'border-primary-600 text-primary-900 font-bold bg-primary-50/50' 
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </button>
  );

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
          
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 min-w-[200px]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Profil Complété</span>
              <span className="text-sm font-black">{completeness}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 transition-all duration-1000" 
                style={{ width: `${completeness}%` }} 
              />
            </div>
            <p className="text-[9px] mt-3 opacity-60 leading-relaxed">
              Un profil complet améliore la précision des audits IA.
            </p>
          </div>
        </div>
        <Sparkles className="absolute -right-8 -top-8 w-40 h-40 text-white/5" />
      </div>

      {/* Main Profile Content */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-hide">
          <TabButton id="account" label="Compte" icon={Settings2} />
          <TabButton id="personal" label="Vie Privée" icon={Users} />
          <TabButton id="housing" label="Mon Toit" icon={Home} />
          <TabButton id="lifestyle" label="Activité" icon={Briefcase} />
        </div>

        <form onSubmit={handleSubmit} className="p-8 lg:p-12 space-y-10">
          {activeTab === 'account' && (
            <div className="space-y-8 animate-fadeIn">
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
          )}

          {activeTab === 'personal' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Profession</label>
                  <input
                    type="text"
                    value={profile.profession || ''}
                    onChange={(e) => updateProfileField('profession', e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                    placeholder="Ex: Ingénieur, Médecin..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Statut Pro</label>
                  <select
                    value={profile.workStatus || ''}
                    onChange={(e) => updateProfileField('workStatus', e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none appearance-none"
                  >
                    <option value="">Sélectionner...</option>
                    <option value="salarié">Salarié</option>
                    <option value="indépendant">Indépendant / Libéral</option>
                    <option value="fonctionnaire">Fonctionnaire</option>
                    <option value="retraité">Retraité</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Adultes au foyer</span>
                  <input 
                    type="number" 
                    value={profile.adultsCount || 1} 
                    onChange={e => updateProfileField('adultsCount', parseInt(e.target.value))}
                    className="bg-transparent text-2xl font-black w-full outline-none"
                  />
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Enfants à charge</span>
                  <input 
                    type="number" 
                    value={profile.childrenCount || 0} 
                    onChange={e => updateProfileField('childrenCount', parseInt(e.target.value))}
                    className="bg-transparent text-2xl font-black w-full outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'housing' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Type de Logement</label>
                  <div className="flex gap-2">
                    {['owner', 'tenant'].map((s) => (
                      <button 
                        key={s}
                        type="button"
                        onClick={() => updateProfileField('housingStatus', s)}
                        className={`flex-1 p-4 rounded-2xl border font-bold text-sm transition-all ${
                          profile.housingStatus === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-600'
                        }`}
                      >
                        {s === 'owner' ? 'Propriétaire' : 'Locataire'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Surface (m²)</label>
                  <input
                    type="number"
                    value={profile.housingSurface || 0}
                    onChange={(e) => updateProfileField('housingSurface', parseInt(e.target.value))}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'lifestyle' && (
            <div className="space-y-8 animate-fadeIn">
               <div className="p-8 bg-primary-50 rounded-[2rem] border border-primary-100 flex items-center gap-6">
                 <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-sm flex-shrink-0">
                    <Activity className="w-8 h-8" />
                 </div>
                 <div>
                    <h4 className="font-black text-slate-900">Revenu Annuel</h4>
                    <p className="text-xs text-slate-500 font-medium mb-3">Utilisé pour calculer vos besoins en prévoyance.</p>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={profile.monthlyIncome || 0}
                        onChange={e => updateProfileField('monthlyIncome', parseInt(e.target.value))}
                        className="bg-white border border-primary-200 px-4 py-2 rounded-xl font-bold text-primary-900 w-32 outline-none"
                      />
                      <span className="font-black text-primary-900">€ / mois</span>
                    </div>
                 </div>
               </div>

               <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Sports & Risques spécifiques</label>
                  <div className="flex flex-wrap gap-2">
                    {['Ski', 'Parapente', 'Moto', 'Plongée', 'Voyages Fréquents'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const current = profile.riskySports || [];
                          const updated = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
                          updateProfileField('riskySports', updated);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase border transition-all ${
                          (profile.riskySports || []).includes(tag) 
                          ? 'bg-slate-900 text-white border-slate-900' 
                          : 'bg-white text-slate-400 border-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}

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
