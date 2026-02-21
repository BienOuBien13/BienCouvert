
import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Zap, CheckCircle, ChevronRight, ChevronLeft,
  User as UserIcon, Shield, Briefcase, Heart, Palmtree, Compass, Info,
  Home, Wallet, ShieldAlert, History, Users, Activity, Loader2,
  Trash2, Save, HeartPulse, AlertOctagon, Scale, Stethoscope, Car, Plane, Gift, FileText, Download, Headset, Plus, Minus,
  MapPin, Calendar, Waves, Trees, Dog, Map
} from 'lucide-react';
import { Policy, OptimizationFinding, UserProfileData, User } from '../types';
import { detectOptimizations } from '../services/geminiService';
import { generateOptimizationPDF } from '../services/pdfService';
import { authService } from '../services/authService';

interface Props {
  policies: Policy[];
  profile: UserProfileData;
  onUpdateProfile: (profile: UserProfileData) => void;
  user: User;
  onFinishSimulation: () => void;
}

type StepId = 'personal' | 'housing' | 'lifestyle' | 'finance' | 'health' | 'history';

const STEPS: { id: StepId, label: string, icon: any }[] = [
  { id: 'personal', label: 'Famille', icon: Users },
  { id: 'housing', label: 'Habitat', icon: Home },
  { id: 'lifestyle', label: 'Loisirs & Animaux', icon: Compass },
  { id: 'finance', label: 'Finances', icon: Wallet },
  { id: 'health', label: 'Santé', icon: HeartPulse },
  { id: 'history', label: 'Antécédents', icon: History },
];

const TYPE_CONFIG = {
  duplicate: { bg: 'bg-amber-50', text: 'text-amber-500', icon: Zap },
  gap: { bg: 'bg-red-50', text: 'text-red-500', icon: ShieldAlert },
  saving: { bg: 'bg-emerald-50', text: 'text-emerald-500', icon: Zap },
};

const FindingCard: React.FC<{ f: OptimizationFinding }> = ({ f }) => {
  const cfg = TYPE_CONFIG[f.type] ?? TYPE_CONFIG.saving;
  const IconComponent = cfg.icon;
  return (
    <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 space-y-6 hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${cfg.bg} ${cfg.text}`}>
        <IconComponent className="w-7 h-7" />
      </div>
      <div className="flex-grow space-y-3">
        <h4 className="font-black text-slate-900 tracking-tight leading-snug text-xl">{f.title}</h4>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">{f.description}</p>
        {f.estimatedSaving != null && f.estimatedSaving > 0 && (
          <p className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full inline-block">
            Économie estimée : {f.estimatedSaving} €/an
          </p>
        )}
      </div>
      <div className="pt-6 border-t border-slate-50">
        <p className="text-[10px] font-black uppercase text-primary-600 tracking-[0.2em] mb-2 flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> Recommandation IA
        </p>
        <p className="text-sm font-bold text-slate-900 leading-snug bg-slate-50 p-4 rounded-2xl border border-slate-100">{f.recommendation}</p>
      </div>
      {f.severity === 'high' && <div className="absolute top-8 right-8 w-2 h-2 rounded-full bg-red-500 animate-ping" />}
    </div>
  );
};

export const AnalysisView: React.FC<Props> = ({ policies, profile, onUpdateProfile, user, onFinishSimulation }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [findings, setFindings] = useState<OptimizationFinding[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Charger le profil saved depuis la table dédiée au montage du composant
  useEffect(() => {
    authService.getAnalysisProfile()
      .then(savedProfile => {
        if (savedProfile && Object.keys(savedProfile).length > 0) {
          onUpdateProfile(savedProfile);
        }
      })
      .catch(err => console.warn('Impossible de charger le profil d’analyse:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = STEPS[currentStepIndex];

  const handleNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleAnalyze();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      // Persister le profil dans la table dédiée avant analyse
      await authService.updateAnalysisProfile(profile).catch(err =>
        console.warn('Sauvegarde du profil d’analyse échouée (analyse continue):', err)
      );
      const results = await detectOptimizations(policies, profile);
      setFindings(results);
      setHasAnalyzed(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      await new Promise(res => setTimeout(res, 800));
      generateOptimizationPDF(user, policies, findings);
    } finally {
      setIsExporting(false);
    }
  };

  const updateNumericField = (field: keyof UserProfileData, delta: number) => {
    const currentValue = (profile[field] as number) || 0;
    const newValue = Math.max(0, currentValue + delta);
    onUpdateProfile({ ...profile, [field]: newValue });
  };

  const updateHouseholdAge = (index: number, age: number) => {
    const ages = [...(profile.householdMembersAges || [])];
    ages[index] = age;
    onUpdateProfile({ ...profile, householdMembersAges: ages });
  };

  const progress = Math.round(((currentStepIndex + 1) / STEPS.length) * 100);
  const totalMembers = (profile.adultsCount || 1) + (profile.childrenCount || 0);

  return (
    <div className="space-y-6 pb-40 max-w-2xl mx-auto px-2">
      {/* Dynamic Header with Progress */}
      <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 lg:sticky lg:top-20 z-20 transition-all">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
             <div className="bg-primary-600 p-1.5 rounded-xl text-white shadow-lg shadow-primary-200">
               {React.createElement(currentStep.icon, { className: "w-4 h-4" })}
             </div>
             <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none">Étape {currentStepIndex + 1}</p>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tighter">{currentStep.label}</h3>
             </div>
          </div>
          <div className="text-right">
             <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full">{progress}% complété</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 h-1.5 px-0.5">
          {STEPS.map((_, idx) => (
            <div 
              key={idx}
              className={`flex-1 h-full rounded-full transition-all duration-500 ${
                idx <= currentStepIndex ? 'bg-primary-600' : 'bg-slate-100'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-10 animate-fadeIn transition-all">
        <div className="space-y-10">
          {currentStep.id === 'personal' && (
            <div className="space-y-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:border-primary-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-600 shadow-sm"><Users className="w-6 h-6" /></div>
                    <span className="text-xs font-black uppercase text-slate-900">Nombre d'adultes</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <button onClick={() => updateNumericField('adultsCount', -1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Minus className="w-5 h-5 text-slate-400"/></button>
                    <span className="text-3xl font-black w-8 text-center">{profile.adultsCount || 1}</span>
                    <button onClick={() => updateNumericField('adultsCount', 1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Plus className="w-5 h-5 text-slate-400"/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100 group hover:border-primary-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-600 shadow-sm"><Heart className="w-6 h-6" /></div>
                    <span className="text-xs font-black uppercase text-slate-900">Enfants à charge</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <button onClick={() => updateNumericField('childrenCount', -1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Minus className="w-5 h-5 text-slate-400"/></button>
                    <span className="text-3xl font-black w-8 text-center">{profile.childrenCount || 0}</span>
                    <button onClick={() => updateNumericField('childrenCount', 1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Plus className="w-5 h-5 text-slate-400"/></button>
                  </div>
                </div>

                {totalMembers > 0 && (
                  <div className="space-y-4 pt-6 animate-slideUp">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Âge des membres du foyer (essentiel pour la mutuelle)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Array.from({ length: totalMembers }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Memb. {i+1}</span>
                          <input 
                            type="number" 
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-center text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                            value={profile.householdMembersAges?.[i] || ''}
                            onChange={(e) => updateHouseholdAge(i, parseInt(e.target.value) || 0)}
                            placeholder="Âge"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep.id === 'housing' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Localisation (Code Postal)</label>
                    <div className="relative group">
                      <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary-500 transition-colors" />
                      <input 
                        type="text" 
                        maxLength={5}
                        className="w-full pl-14 pr-4 py-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-lg focus:ring-2 focus:ring-primary-500 outline-none shadow-inner" 
                        value={profile.postalCode || ''} 
                        onChange={e => onUpdateProfile({...profile, postalCode: e.target.value})} 
                        placeholder="75001"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Année de construction</label>
                    <div className="relative group">
                      <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-primary-500 transition-colors" />
                      <input 
                        type="number" 
                        className="w-full pl-14 pr-4 py-5 bg-slate-50 border border-slate-100 rounded-3xl font-black text-lg focus:ring-2 focus:ring-primary-500 outline-none shadow-inner" 
                        value={profile.constructionYear || ''} 
                        onChange={e => onUpdateProfile({...profile, constructionYear: parseInt(e.target.value) || 0})} 
                        placeholder="1980"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type de logement</label>
                  <div className="flex gap-3">
                    {[
                      { id: 'house', label: 'Maison', icon: Home },
                      { id: 'apartment', label: 'Appartement', icon: Briefcase }
                    ].map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => onUpdateProfile({...profile, housingType: s.id as any})} 
                        className={`flex-1 p-6 rounded-[2rem] border-2 font-black text-[11px] uppercase tracking-widest transition-all flex flex-col items-center gap-3 ${profile.housingType === s.id ? 'bg-slate-900 text-white border-slate-900 shadow-xl scale-105' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-300'}`}
                      >
                        <s.icon className="w-6 h-6" /> {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => onUpdateProfile({...profile, hasPool: !profile.hasPool})} 
                    className={`p-6 rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-4 ${profile.hasPool ? 'bg-primary-600 text-white border-primary-600 shadow-xl ring-4 ring-primary-50' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${profile.hasPool ? 'bg-white/20' : 'bg-white shadow-sm'}`}><Waves className="w-6 h-6" /></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Piscine</span>
                  </button>
                  <button 
                    onClick={() => onUpdateProfile({...profile, hasGarden: !profile.hasGarden})} 
                    className={`p-6 rounded-[2.5rem] border-2 transition-all flex flex-col items-center gap-4 ${profile.hasGarden ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl ring-4 ring-emerald-50' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${profile.hasGarden ? 'bg-white/20' : 'bg-white shadow-sm'}`}><Trees className="w-6 h-6" /></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Jardin</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'lifestyle' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="space-y-6">
                <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100 flex flex-col sm:flex-row items-center justify-between gap-6 transition-all hover:shadow-lg">
                   <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                        <Dog className="w-8 h-8" />
                      </div>
                      <div className="text-center sm:text-left">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 opacity-60">Animaux</span>
                        <h4 className="text-lg font-black text-amber-900 tracking-tight">Compagnons à poils ?</h4>
                      </div>
                   </div>
                   <div className="flex bg-white/50 p-1.5 rounded-2xl border border-amber-200 shadow-inner">
                      <button onClick={() => onUpdateProfile({...profile, hasPets: false})} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!profile.hasPets ? 'bg-white shadow-md text-amber-900' : 'text-amber-400 hover:text-amber-600'}`}>Non</button>
                      <button onClick={() => onUpdateProfile({...profile, hasPets: true})} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.hasPets ? 'bg-amber-600 text-white shadow-md' : 'text-amber-400 hover:text-amber-600'}`}>Oui</button>
                   </div>
                </div>

                {profile.hasPets && (
                  <div className="space-y-2 animate-slideUp">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Espèces (Chiens, chats, NAC...)</label>
                    <input 
                      type="text" 
                      className="w-full p-5 bg-white border border-amber-100 rounded-3xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-400 shadow-inner" 
                      value={profile.petDetails || ''} 
                      onChange={e => onUpdateProfile({...profile, petDetails: e.target.value})} 
                      placeholder="Ex: 2 chats, 1 labrador..."
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-900 rounded-[2.5rem] text-white flex flex-col items-center justify-center gap-4 text-center">
                    <Car className="w-8 h-8 text-primary-400" />
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Véhicules</p>
                      <div className="flex items-center gap-6">
                        <button onClick={() => updateNumericField('vehiclesCount', -1)} className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center hover:bg-white/10">-</button>
                        <span className="text-3xl font-black">{profile.vehiclesCount || 0}</span>
                        <button onClick={() => updateNumericField('vehiclesCount', 1)} className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center hover:bg-white/10">+</button>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 bg-primary-600 rounded-[2.5rem] text-white flex flex-col items-center justify-center gap-4 text-center">
                    <Briefcase className="w-8 h-8 text-primary-200" />
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase text-primary-200 tracking-widest">Télétravail (j/sem)</p>
                      <div className="flex items-center gap-6">
                        <button onClick={() => updateNumericField('teleworkDays', -1)} className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center hover:bg-white/10">-</button>
                        <span className="text-3xl font-black">{profile.teleworkDays || 0}</span>
                        <button onClick={() => updateNumericField('teleworkDays', 1)} className="w-10 h-10 rounded-xl border border-white/20 flex items-center justify-center hover:bg-white/10">+</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'finance' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="space-y-6 text-center">
                 <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-inner">
                   <Wallet className="w-10 h-10" />
                 </div>
                 <div className="space-y-2">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Budget mensuel</h3>
                    <p className="text-xs text-slate-400 font-bold max-w-xs mx-auto">Ces revenus nous permettent d'évaluer vos besoins de prévoyance en cas d'arrêt de travail.</p>
                 </div>
                 <div className="relative group max-w-xs mx-auto">
                    <input 
                      type="number" 
                      className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-4xl font-black text-center text-slate-900 outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-500 transition-all shadow-xl" 
                      value={profile.monthlyIncome || ''} 
                      onChange={e => onUpdateProfile({...profile, monthlyIncome: parseInt(e.target.value) || 0})}
                      placeholder="0"
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 right-6 font-black text-slate-300 text-2xl group-focus-within:text-emerald-500 transition-colors">€</div>
                 </div>
              </div>
            </div>
          )}

          {currentStep.id === 'health' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Priorités de soins</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Optique', 'Dentaire', 'Hospitalisation', 'Médecine douce'].map(need => (
                    <button key={need} onClick={() => {
                      const cur = profile.healthNeeds || [];
                      onUpdateProfile({...profile, healthNeeds: cur.includes(need) ? cur.filter(n => n !== need) : [...cur, need]});
                    }} className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 ${ (profile.healthNeeds || []).includes(need) ? 'bg-primary-600 text-white border-primary-600 shadow-xl ring-4 ring-primary-50' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${ (profile.healthNeeds || []).includes(need) ? 'bg-white/20' : 'bg-white shadow-sm'}`}><Activity className="w-6 h-6" /></div>
                      <span className="text-[10px] font-black uppercase tracking-widest">{need}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'history' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="p-10 bg-slate-900 rounded-[3rem] text-white flex flex-col items-center justify-center gap-8 text-center shadow-2xl relative overflow-hidden">
                 <div className="relative z-10 space-y-2">
                    <h4 className="text-xl font-black uppercase tracking-tighter">Sinistres sur 5 ans</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Auto & Habitation cumulés</p>
                 </div>
                 <div className="flex items-center gap-10 relative z-10">
                    <button onClick={() => updateNumericField('claimsLast5Years', -1)} className="w-16 h-16 rounded-[1.5rem] border border-white/20 text-3xl font-black flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all">-</button>
                    <span className="text-6xl font-black text-primary-400 w-20 text-center">{profile.claimsLast5Years || 0}</span>
                    <button onClick={() => updateNumericField('claimsLast5Years', 1)} className="w-16 h-16 rounded-[1.5rem] border border-white/20 text-3xl font-black flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all">+</button>
                 </div>
                 <div className="absolute -left-10 -bottom-10 opacity-10"><History className="w-48 h-48" /></div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
           <button 
             onClick={handleBack}
             disabled={currentStepIndex === 0}
             className="flex items-center gap-2 px-6 py-4 rounded-2xl text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-900 disabled:opacity-0 transition-all"
           >
             <ChevronLeft className="w-5 h-5" />
             Précédent
           </button>
           
           <button 
             onClick={handleNext}
             disabled={isAnalyzing}
             className="flex items-center gap-3 px-10 py-5 bg-primary-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary-900/20 hover:bg-primary-700 active:scale-95 transition-all group"
           >
             {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : currentStepIndex === STEPS.length - 1 ? 'Lancer l\'audit IA' : 'Continuer'}
             {currentStepIndex < STEPS.length - 1 && !isAnalyzing && <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
           </button>
        </div>
      </div>

      {/* Finishing Call to Action (Expert) */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] p-8 text-white shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-8 animate-fadeIn relative overflow-hidden group">
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-white/10 rounded-[1.5rem] flex items-center justify-center backdrop-blur-xl border border-white/10 group-hover:bg-primary-600 transition-colors">
            <Headset className="w-8 h-8" />
          </div>
          <div className="text-center sm:text-left">
            <h4 className="text-xl font-black tracking-tighter">Besoin d'un regard humain ?</h4>
            <p className="text-xs text-slate-400 font-medium opacity-80 mt-1">Validez vos résultats avec un expert certifié gratuitement.</p>
          </div>
        </div>
        <button onClick={onFinishSimulation} className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-50 transition-all shadow-xl whitespace-nowrap active:scale-95 relative z-10">Prendre RDV</button>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
      </div>

      {/* Results Display */}
      {hasAnalyzed && !isAnalyzing && (
        <div className="space-y-8 animate-slideUp">
          {/* Header */}
          <div className="flex items-center justify-between px-2 pt-10">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-[1.2rem] flex items-center justify-center shadow-lg shadow-emerald-200"><CheckCircle className="w-6 h-6" /></div>
                <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Votre Bilan Stratégique</h3>
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{findings.length} point{findings.length > 1 ? 's' : ''} analysé{findings.length > 1 ? 's' : ''}</p>
                </div>
             </div>
             <button 
               onClick={handleExportPDF}
               disabled={isExporting}
               className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95"
             >
               {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
               Rapport PDF
             </button>
          </div>

          {/* Summary stats bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Doublons', count: findings.filter(f => f.type === 'duplicate').length, color: 'bg-amber-50 border-amber-100 text-amber-700' },
              { label: 'Manques', count: findings.filter(f => f.type === 'gap').length, color: 'bg-red-50 border-red-100 text-red-700' },
              { label: 'Économies', count: findings.filter(f => f.type === 'saving').length, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
            ].map(stat => (
              <div key={stat.label} className={`p-4 rounded-2xl border text-center ${stat.color}`}>
                <div className="text-2xl font-black">{stat.count}</div>
                <div className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-70">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Section: Doublons */}
          {findings.filter(f => f.type === 'duplicate').length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center"><Zap className="w-4 h-4 text-amber-600" /></div>
                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">Doublons détectés — {findings.filter(f => f.type === 'duplicate').length}</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {findings.filter(f => f.type === 'duplicate').map((f, i) => (
                  <FindingCard key={`dup-${i}`} f={f} />
                ))}
              </div>
            </div>
          )}

          {/* Section: Garanties manquantes */}
          {findings.filter(f => f.type === 'gap').length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-red-600" /></div>
                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">Garanties manquantes — {findings.filter(f => f.type === 'gap').length}</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {findings.filter(f => f.type === 'gap').map((f, i) => (
                  <FindingCard key={`gap-${i}`} f={f} />
                ))}
              </div>
            </div>
          )}

          {/* Section: Économies & Propositions */}
          {findings.filter(f => f.type === 'saving').length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center"><Sparkles className="w-4 h-4 text-emerald-600" /></div>
                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">Propositions d'optimisation — {findings.filter(f => f.type === 'saving').length}</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {findings.filter(f => f.type === 'saving').map((f, i) => (
                  <FindingCard key={`sav-${i}`} f={f} />
                ))}
              </div>
            </div>
          )}

          {/* No findings */}
          {findings.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-12 text-center">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h4 className="text-xl font-black text-slate-900">Portefeuille optimal</h4>
              <p className="text-sm text-slate-500 mt-2">Aucun doublon ou manque critique détecté.</p>
            </div>
          )}


          <div className="bg-slate-900 rounded-[3rem] p-12 text-white text-center space-y-10 shadow-3xl mt-12 relative overflow-hidden group">
             <div className="space-y-4 relative z-10">
                <h3 className="text-4xl font-black tracking-tighter">Optimisation prête</h3>
                <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">Voulez-vous que nos experts négocient ces changements pour vous ? C'est gratuit et nous gérons toute la résiliation.</p>
             </div>
             <button 
               onClick={onFinishSimulation}
               className="w-full py-6 bg-primary-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/40 relative z-10 active:scale-95"
             >
               Transférer mon dossier
             </button>
             <div className="absolute -left-20 -bottom-20 w-96 h-96 bg-primary-600/10 rounded-full blur-[120px] group-hover:bg-primary-600/20 transition-all" />
          </div>
        </div>
      )}
    </div>
  );
};
