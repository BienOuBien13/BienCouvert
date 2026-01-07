
import React, { useState } from 'react';
import { Sparkles, Zap, TrendingUp, AlertTriangle, CheckCircle, ChevronRight, User as UserIcon, Shield, Briefcase, Heart, Palmtree, Compass, Info } from 'lucide-react';
import { Policy, OptimizationFinding, UserProfileData } from '../types';
import { detectOptimizations } from '../services/geminiService';

interface Props {
  policies: Policy[];
  profile: UserProfileData;
  onUpdateProfile: (profile: UserProfileData) => void;
}

export const AnalysisView: React.FC<Props> = ({ policies, profile, onUpdateProfile }) => {
  const [findings, setFindings] = useState<OptimizationFinding[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const results = await detectOptimizations(policies, profile);
      setFindings(results);
      setHasAnalyzed(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const totalSavings = findings.reduce((acc, f) => acc + (f.estimatedSaving || 0), 0);

  const toggleList = (list: string[] | undefined, item: string) => {
    const current = list || [];
    return current.includes(item) ? current.filter(n => n !== item) : [...current, item];
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Profile Setup - Multi-sections */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-200">
           <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
             <UserIcon className="w-5 h-5 text-primary-600" />
             Profil de Risque & Lifestyle
           </h2>
           <p className="text-sm text-slate-500">Plus vous êtes précis, plus les conseils de l'IA seront pertinents.</p>
        </div>

        <div className="p-8 space-y-10">
          {/* Section 1: Travail & Famille */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Vie Professionnelle
              </label>
              <div className="grid grid-cols-1 gap-3">
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  value={profile.workStatus || 'salarié'}
                  onChange={(e) => onUpdateProfile({...profile, workStatus: e.target.value as any})}
                >
                  <option value="salarié">Salarié</option>
                  <option value="indépendant">Indépendant (Freelance, TNS)</option>
                  <option value="fonctionnaire">Fonctionnaire</option>
                  <option value="retraité">Retraité</option>
                </select>
                <input 
                  type="text" 
                  placeholder="Métier (ex: Infirmier, Développeur...)"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  value={profile.profession || ''}
                  onChange={(e) => onUpdateProfile({...profile, profession: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UserIcon className="w-4 h-4" /> Foyer
              </label>
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                 <span className="text-sm text-slate-600 font-medium">Nombre d'enfants :</span>
                 <div className="flex items-center gap-4">
                    <button onClick={() => onUpdateProfile({...profile, childrenCount: Math.max(0, (profile.childrenCount || 0) - 1)})} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-lg font-bold">-</button>
                    <span className="font-bold text-slate-800">{profile.childrenCount || 0}</span>
                    <button onClick={() => onUpdateProfile({...profile, childrenCount: (profile.childrenCount || 0) + 1})} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-lg font-bold">+</button>
                 </div>
              </div>
            </div>
          </div>

          {/* Section 2: Santé & Prévoyance */}
          <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Heart className="w-4 h-4" /> Santé & Antécédents
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {['Optique', 'Dentaire', 'Hospitalisation', 'Médecine Douce', 'Maternité'].map(need => (
                <button 
                  key={need} 
                  onClick={() => onUpdateProfile({...profile, healthNeeds: toggleList(profile.healthNeeds, need)})}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${profile.healthNeeds?.includes(need) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-200'}`}
                >
                  {need}
                </button>
              ))}
            </div>
            <textarea 
              placeholder="Spécificités (ex: diabète, port de lunettes important, chirurgie prévue...)"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm italic"
              rows={2}
              value={profile.healthSpecifics || ''}
              onChange={(e) => onUpdateProfile({...profile, healthSpecifics: e.target.value})}
            />
          </div>

          {/* Section 3: Loisirs & Voyages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Compass className="w-4 h-4" /> Sports à risque & Hobbies
              </label>
              <div className="flex flex-wrap gap-2">
                {['Ski', 'Plongée', 'Parapente', 'Cyclisme', 'Équitation', 'Chasse'].map(sport => (
                  <button 
                    key={sport} 
                    onClick={() => onUpdateProfile({...profile, riskySports: toggleList(profile.riskySports, sport)})}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${profile.riskySports?.includes(sport) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'}`}
                  >
                    {sport}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Palmtree className="w-4 h-4" /> Voyages
              </label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                value={profile.travelFrequency || 'occasionnel'}
                onChange={(e) => onUpdateProfile({...profile, travelFrequency: e.target.value as any})}
              >
                <option value="rare">Je voyage rarement</option>
                <option value="occasionnel">Quelques fois par an</option>
                <option value="fréquent">Je suis souvent à l'étranger</option>
              </select>
            </div>
          </div>

          {/* Section 4: Projets de vie (Libre) */}
          <div className="space-y-4">
             <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Projets & Notes Libres
              </label>
              <textarea 
                placeholder="Ex: 'Je prévois d'acheter un vélo électrique', 'Je pars 6 mois en Asie en 2025', 'Je veux changer ma voiture'..."
                className="w-full p-4 bg-primary-50/30 border border-primary-100 rounded-2xl text-sm text-slate-700"
                rows={3}
                value={profile.lifeProjects || ''}
                onChange={(e) => onUpdateProfile({...profile, lifeProjects: e.target.value})}
              />
          </div>
        </div>
        
        <div className="p-8 bg-slate-900 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-white">
             <h4 className="font-bold flex items-center gap-2"><Info className="w-4 h-4 text-primary-400" /> Analyse Multidimensionnelle</h4>
             <p className="text-slate-400 text-xs">L'IA va croiser votre profession, vos sports et vos projets avec vos contrats.</p>
          </div>
          <button 
            onClick={handleAnalyze} 
            disabled={isAnalyzing || policies.length < 1}
            className={`px-10 py-4 rounded-2xl font-black uppercase tracking-wider text-sm flex items-center gap-3 transition-all shadow-2xl ${isAnalyzing ? 'bg-slate-700 text-slate-400' : 'bg-primary-600 text-white hover:bg-primary-500 hover:scale-105 active:scale-95 shadow-primary-900/30'}`}
          >
            {isAnalyzing ? <><TrendingUp className="animate-spin w-5 h-5" /> Calculs en cours...</> : <><Sparkles className="w-5 h-5 text-amber-300" /> Optimiser mon profil</>}
          </button>
        </div>
      </section>

      {/* Analysis Results */}
      {hasAnalyzed && (
        <div className="animate-fadeIn space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-emerald-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-900/10">
                <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest mb-1">Économie Potentielle</p>
                <p className="text-4xl font-black">{totalSavings}€<span className="text-lg font-normal opacity-80"> / an</span></p>
             </div>
             <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Protection IA</p>
                <p className="text-2xl font-black text-slate-900">Excellente</p>
             </div>
             <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Score Sérénité</p>
                <p className="text-2xl font-black text-slate-900">92/100</p>
             </div>
          </div>

          <div className="space-y-4">
            {findings.map((f, i) => (
              <div key={i} className="bg-white rounded-3xl border border-slate-200 p-6 hover:border-primary-300 transition-all shadow-sm group">
                <div className="flex items-start gap-4">
                  <div className={`p-4 rounded-2xl flex-shrink-0 ${f.type === 'duplicate' ? 'bg-amber-50 text-amber-600' : f.type === 'gap' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {f.type === 'duplicate' ? <AlertTriangle className="w-6 h-6" /> : f.type === 'gap' ? <Zap className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-black text-slate-900">{f.title}</h3>
                      {f.estimatedSaving && <span className="bg-emerald-100 text-emerald-700 text-xs font-black px-3 py-1 rounded-full">+ {f.estimatedSaving}€ / an</span>}
                    </div>
                    <p className="text-slate-600 text-sm mb-4 leading-relaxed">{f.description}</p>
                    
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <p className="text-[10px] font-black text-primary-700 uppercase tracking-widest mb-2 flex items-center gap-2"><Sparkles className="w-3 h-3"/> Conseil AssurClair :</p>
                      <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <ChevronRight className="w-4 h-4 text-primary-500" />
                        {f.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
