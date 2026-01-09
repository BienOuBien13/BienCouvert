
import React, { useState } from 'react';
import { Shield, Lock, Search, ChevronRight, Loader2, CheckCircle, AlertCircle, RefreshCw, Link as LinkIcon } from 'lucide-react';

interface Insurer {
  id: string;
  name: string;
  logo: string;
  color: string;
}

const INSURERS: Insurer[] = [
  { id: 'axa', name: 'AXA France', logo: 'AXA', color: 'bg-blue-700' },
  { id: 'allianz', name: 'Allianz', logo: 'ALZ', color: 'bg-blue-900' },
  { id: 'maif', name: 'MAIF', logo: 'MAIF', color: 'bg-red-600' },
  { id: 'macif', name: 'MACIF', logo: 'MAC', color: 'bg-blue-600' },
  { id: 'generali', name: 'Generali', logo: 'GEN', color: 'bg-red-700' },
  { id: 'boursorama', name: 'Boursorama', logo: 'BRS', color: 'bg-pink-600' },
];

export const SyncView: React.FC = () => {
  const [step, setStep] = useState<'list' | 'login' | 'syncing' | 'success'>('list');
  const [selectedInsurer, setSelectedInsurer] = useState<Insurer | null>(null);
  const [credentials, setCredentials] = useState({ user: '', pass: '' });

  const handleConnect = () => {
    setStep('syncing');
    setTimeout(() => setStep('success'), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Synchronisation Directe</h2>
        <p className="text-slate-500 max-w-lg mx-auto text-sm font-medium">
          Connectez vos espaces assureurs pour importer automatiquement vos contrats et détecter les doublons cachés.
        </p>
      </div>

      {step === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INSURERS.map((insurer) => (
            <button
              key={insurer.id}
              onClick={() => { setSelectedInsurer(insurer); setStep('login'); }}
              className="bg-white p-6 rounded-[2rem] border border-slate-200 hover:border-primary-400 hover:shadow-xl hover:shadow-primary-900/5 transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${insurer.color} rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-inner`}>
                  {insurer.logo}
                </div>
                <div className="text-left">
                  <p className="font-black text-slate-900 leading-tight">{insurer.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Liaison API</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
            </button>
          ))}
          <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center gap-2 group cursor-pointer hover:bg-slate-100 transition-colors">
             <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                <Search className="w-5 h-5" />
             </div>
             <p className="text-xs font-bold text-slate-500">Chercher un autre assureur</p>
          </div>
        </div>
      )}

      {step === 'login' && selectedInsurer && (
        <div className="max-w-md mx-auto bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-scaleIn">
          <div className={`p-8 ${selectedInsurer.color} text-white flex items-center justify-between`}>
             <div className="flex items-center gap-4">
               <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black">{selectedInsurer.logo}</div>
               <h3 className="font-black text-lg">Connexion {selectedInsurer.name}</h3>
             </div>
             <button onClick={() => setStep('list')} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <RefreshCw className="w-5 h-5" />
             </button>
          </div>
          <div className="p-8 space-y-6">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex gap-4">
               <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0" />
               <p className="text-[11px] text-emerald-800 leading-relaxed font-bold">
                 Vos identifiants sont chiffrés et ne sont jamais transmis en clair. Nous utilisons un tunnel de synchronisation sécurisé (Mock-API).
               </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Identifiant client</label>
                <input 
                  type="text" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 font-bold text-slate-900" 
                  placeholder="Numéro client ou email"
                  value={credentials.user}
                  onChange={(e) => setCredentials({...credentials, user: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Mot de passe</label>
                <input 
                  type="password" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-500 font-bold text-slate-900" 
                  placeholder="••••••••"
                  value={credentials.pass}
                  onChange={(e) => setCredentials({...credentials, pass: e.target.value})}
                />
              </div>
            </div>
            <button 
              onClick={handleConnect}
              disabled={!credentials.user || !credentials.pass}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50"
            >
              <LinkIcon className="w-4 h-4" />
              Établir la connexion
            </button>
            <div className="flex items-center justify-center gap-2 text-slate-400">
               <Lock className="w-3 h-3" />
               <span className="text-[10px] font-black uppercase tracking-tighter">Sécurité Niveau Bancaire</span>
            </div>
          </div>
        </div>
      )}

      {step === 'syncing' && (
        <div className="max-w-md mx-auto bg-white rounded-[2.5rem] p-12 text-center space-y-6 shadow-xl border border-slate-100 animate-fadeIn">
          <div className="relative mx-auto w-24 h-24">
             <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
             <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-primary-500" />
             </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900">Analyse du portefeuille...</h3>
            <p className="text-sm text-slate-500 font-medium">Récupération sécurisée des polices actives chez {selectedInsurer?.name}.</p>
          </div>
          <div className="space-y-3">
             {['Vérification identifiants...', 'Exploration des contrats...', 'Extraction des garanties...'].map((text, i) => (
               <div key={i} className="flex items-center gap-3 text-left">
                  <div className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-emerald-500' : 'bg-slate-200 animate-pulse'}`} />
                  <span className={`text-[11px] font-bold ${i < 2 ? 'text-slate-600' : 'text-slate-400'}`}>{text}</span>
               </div>
             ))}
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="max-w-md mx-auto bg-white rounded-[2.5rem] p-12 text-center space-y-8 shadow-2xl border border-emerald-100 animate-scaleIn">
          <div className="mx-auto w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
             <CheckCircle className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-slate-900">Synchronisé !</h3>
            <p className="text-sm text-slate-500 font-medium">3 nouveaux contrats ont été importés avec succès de {selectedInsurer?.name}.</p>
          </div>
          <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 text-left space-y-4">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nouveaux contrats</p>
             <div className="space-y-3">
               {['Habitation - Formule Zen', 'Auto - N° 284193', 'Protection Mobile'].map(c => (
                 <div key={c} className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">{c}</span>
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">Actif</span>
                 </div>
               ))}
             </div>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-900/20"
          >
            Retour au tableau de bord
          </button>
        </div>
      )}

      <div className="bg-slate-100 p-8 rounded-[2.5rem] border border-slate-200">
         <div className="flex gap-4 items-start">
            <div className="p-3 bg-white rounded-2xl shadow-sm text-amber-500">
               <AlertCircle className="w-6 h-6" />
            </div>
            <div>
               <h4 className="font-black text-slate-900">Note sur la confidentialité</h4>
               <p className="text-xs text-slate-500 leading-relaxed font-medium mt-1">
                 Cette application ne conserve pas vos identifiants. La synchronisation directe est une démonstration technique des futures intégrations d'Open Insurance. Pour le moment, seul l'import PDF ou la recherche web sont recommandés pour un usage réel.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};
