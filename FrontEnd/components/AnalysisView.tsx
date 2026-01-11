
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Zap, CheckCircle, ChevronRight, ChevronLeft,
  User as UserIcon, Shield, Briefcase, Heart, Palmtree, Compass, Info,
  Home, Wallet, ShieldAlert, History, Users, Activity, Loader2,
  Trash2, Save, HeartPulse, AlertOctagon, Scale, Stethoscope, Car, Plane, Gift, FileText, Download, Headset, Plus, Minus,
  MapPin, Calendar, Waves, Trees, Dog
} from 'lucide-react';
import { Policy, OptimizationFinding, UserProfileData, User } from '../types';
import { detectOptimizations } from '../services/geminiService';
import { generateOptimizationPDF } from '../services/pdfService';

interface Props {
  policies: Policy[];
  profile: UserProfileData;
  onUpdateProfile: (profile: UserProfileData) => void;
  user: User;
  onFinishSimulation: () => void;
}

type StepId = 'personal' | 'housing' | 'lifestyle' | 'finance' | 'health' | 'risks' | 'history';

const STEPS: { id: StepId, label: string, icon: any }[] = [
  { id: 'personal', label: 'Famille', icon: Users },
  { id: 'housing', label: 'Habitat', icon: Home },
  { id: 'lifestyle', label: 'Loisirs & Animaux', icon: Compass },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'health', label: 'Santé', icon: HeartPulse },
  { id: 'risks', label: 'Patrimoine', icon: ShieldAlert },
  { id: 'history', label: 'Historique', icon: History },
];

export const AnalysisView: React.FC<Props> = ({ policies, profile, onUpdateProfile, user, onFinishSimulation }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [findings, setFindings] = useState<OptimizationFinding[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  // Calcule le nombre total de membres pour la saisie des âges
  const totalMembers = (profile.adultsCount || 1) + (profile.childrenCount || 0);

  return (
    <div className="space-y-6 pb-40 max-w-2xl mx-auto px-2">
      <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-slate-100 lg:sticky lg:top-20 z-20">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
             <div className="bg-primary-600 p-1 rounded-lg text-white"><Activity className="w-4 h-4" /></div>
             <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Audit : {currentStep.label}</p>
          </div>
          <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{progress}%</span>
        </div>

        <div className="flex items-center gap-1.5 h-1.5 px-0.5">
          {STEPS.map((_, idx) => (
            <div 
              key={idx}
              className={`flex-1 h-full rounded-full transition-all duration-300 ${
                idx <= currentStepIndex ? 'bg-primary-600' : 'bg-slate-100'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 md:p-8 animate-fadeIn transition-all duration-300">
        <div className="space-y-8">
          {currentStep.id === 'personal' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Users className="w-5 h-5" /> Foyer</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <span className="text-xs font-black uppercase text-slate-500">Adultes</span>
                  <div className="flex items-center gap-6">
                    <button onClick={() => updateNumericField('adultsCount', -1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Minus className="w-5 h-5 text-slate-600"/></button>
                    <span className="text-2xl font-black w-8 text-center">{profile.adultsCount || 1}</span>
                    <button onClick={() => updateNumericField('adultsCount', 1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Plus className="w-5 h-5 text-slate-600"/></button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                  <span className="text-xs font-black uppercase text-slate-500">Enfants</span>
                  <div className="flex items-center gap-6">
                    <button onClick={() => updateNumericField('childrenCount', -1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Minus className="w-5 h-5 text-slate-600"/></button>
                    <span className="text-2xl font-black w-8 text-center">{profile.childrenCount || 0}</span>
                    <button onClick={() => updateNumericField('childrenCount', 1)} className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-transform"><Plus className="w-5 h-5 text-slate-600"/></button>
                  </div>
                </div>

                {totalMembers > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Âges des membres (Optionnel)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Array.from({ length: totalMembers }).map((_, i) => (
                        <div key={i} className="space-y-1">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Memb. {i+1}</span>
                          <input 
                            type="number" 
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-center text-xs"
                            value={profile.householdMembersAges?.[i] || ''}
                            onChange={(e) => updateHouseholdAge(i, parseInt(e.target.value) || 0)}
                            placeholder="Âge"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Profession</label>
                  <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-2 focus:ring-primary-500 outline-none" value={profile.profession || ''} onChange={e => onUpdateProfile({...profile, profession: e.target.value})} placeholder="Métier..."/>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'housing' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Home className="w-5 h-5" /> Habitat</h3>
              
              <div className="grid grid-cols-1 gap-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Code Postal</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="text" 
                        maxLength={5}
                        className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-2 focus:ring-primary-500 outline-none" 
                        value={profile.postalCode || ''} 
                        onChange={e => onUpdateProfile({...profile, postalCode: e.target.value})} 
                        placeholder="75001..."
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Année Construction</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="number" 
                        className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-2 focus:ring-primary-500 outline-none" 
                        value={profile.constructionYear || ''} 
                        onChange={e => onUpdateProfile({...profile, constructionYear: parseInt(e.target.value) || 0})} 
                        placeholder="1980..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type de bien</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'house', label: 'Maison', icon: Home },
                      { id: 'apartment', label: 'Appartement', icon: Briefcase }
                    ].map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => onUpdateProfile({...profile, housingType: s.id as any})} 
                        className={`flex-1 p-4 rounded-2xl border font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${profile.housingType === s.id ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        <s.icon className="w-4 h-4" /> {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => onUpdateProfile({...profile, hasPool: !profile.hasPool})} 
                    className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${profile.hasPool ? 'bg-primary-600 text-white border-primary-600 shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    <Waves className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Piscine</span>
                  </button>
                  <button 
                    onClick={() => onUpdateProfile({...profile, hasGarden: !profile.hasGarden})} 
                    className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${profile.hasGarden ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                  >
                    <Trees className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Jardin</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Statut</label>
                    <div className="flex gap-2">
                      {['owner', 'tenant'].map(s => (
                        <button key={s} onClick={() => onUpdateProfile({...profile, housingStatus: s as any})} className={`flex-1 p-4 rounded-xl border font-black text-[10px] uppercase transition-all ${profile.housingStatus === s ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {s === 'owner' ? 'Propriétaire' : 'Locataire'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Surface (m²)</label>
                    <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-2 focus:ring-primary-500 outline-none" value={profile.housingSurface || ''} onChange={e => onUpdateProfile({...profile, housingSurface: parseInt(e.target.value) || 0})}/>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'lifestyle' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Compass className="w-5 h-5" /> Mobilité & Loisirs</h3>
              <div className="space-y-4">
                <div className="p-6 bg-slate-900 rounded-[2rem] text-white flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase tracking-wider">Véhicules</span>
                   <div className="flex items-center gap-6">
                      <button onClick={() => updateNumericField('vehiclesCount', -1)} className="w-12 h-12 rounded-2xl border border-white/20 flex items-center justify-center shadow-sm active:scale-90 transition-transform">-</button>
                      <span className="font-black text-3xl w-10 text-center">{profile.vehiclesCount || 0}</span>
                      <button onClick={() => updateNumericField('vehiclesCount', 1)} className="w-12 h-12 rounded-2xl border border-white/20 flex items-center justify-center shadow-sm active:scale-90 transition-transform">+</button>
                   </div>
                </div>
                
                <div className="p-6 bg-amber-50 rounded-[2rem] border border-amber-100 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                        <Dog className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Animaux de compagnie</span>
                        <p className="text-[8px] font-bold text-amber-600">Chiens, chats...</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => onUpdateProfile({...profile, hasPets: !profile.hasPets})} 
                     className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${profile.hasPets ? 'bg-amber-600 text-white' : 'bg-white text-amber-400 border border-amber-200'}`}
                   >
                     {profile.hasPets ? 'Oui' : 'Non'}
                   </button>
                </div>

                {profile.hasPets && (
                  <div className="space-y-1 animate-fadeIn">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Détails des animaux (Race, âge...)</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-2 focus:ring-primary-500 outline-none" 
                      value={profile.petDetails || ''} 
                      onChange={e => onUpdateProfile({...profile, petDetails: e.target.value})} 
                      placeholder="Ex: Labrador 3 ans, Chat européen..."
                    />
                  </div>
                )}

                <div className="p-6 bg-primary-600 rounded-[2rem] text-white flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase tracking-wider">Télétravail (j/sem)</span>
                   <div className="flex items-center gap-6">
                      <button onClick={() => updateNumericField('teleworkDays', -1)} className="w-12 h-12 rounded-2xl border border-white/20 flex items-center justify-center shadow-sm active:scale-90 transition-transform">-</button>
                      <span className="font-black text-3xl w-10 text-center">{profile.teleworkDays || 0}</span>
                      <button onClick={() => updateNumericField('teleworkDays', 1)} className="w-12 h-12 rounded-2xl border border-white/20 flex items-center justify-center shadow-sm active:scale-90 transition-transform">+</button>
                   </div>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'finance' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><Wallet className="w-5 h-5" /> Finances</h3>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Revenus Mensuels (€)</label>
                    <input type="number" className="w-full p-6 bg-slate-50 border border-slate-100 rounded-[2rem] text-3xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary-500" value={profile.monthlyIncome || ''} onChange={e => onUpdateProfile({...profile, monthlyIncome: parseInt(e.target.value) || 0})}/>
                 </div>
              </div>
            </div>
          )}

          {currentStep.id === 'health' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><HeartPulse className="w-5 h-5" /> Santé</h3>
              <div className="grid grid-cols-2 gap-3">
                {['Optique', 'Dentaire', 'Hôpital', 'Spécialistes'].map(need => (
                  <button key={need} onClick={() => {
                    const cur = profile.healthNeeds || [];
                    onUpdateProfile({...profile, healthNeeds: cur.includes(need) ? cur.filter(n => n !== need) : [...cur, need]});
                  }} className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${ (profile.healthNeeds || []).includes(need) ? 'bg-primary-600 text-white border-primary-600 shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest">{need}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep.id === 'risks' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><ShieldAlert className="w-5 h-5" /> Patrimoine</h3>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Valeur High-Tech (€)</label>
                <input type="number" step="500" className="w-full p-6 bg-slate-50 border border-slate-100 rounded-[2rem] text-3xl font-black focus:ring-2 focus:ring-primary-500 outline-none" value={profile.highTechValue || ''} onChange={e => onUpdateProfile({...profile, highTechValue: parseInt(e.target.value) || 0})}/>
              </div>
            </div>
          )}

          {currentStep.id === 'history' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3"><History className="w-5 h-5" /> Historique</h3>
              <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                 <div className="text-center md:text-left">
                    <h4 className="text-lg font-black uppercase tracking-tighter">Sinistres déclarés</h4>
                    <p className="text-xs text-slate-500 font-bold">Sur les 5 dernières années</p>
                 </div>
                 <div className="flex items-center gap-6">
                    <button onClick={() => updateNumericField('claimsLast5Years', -1)} className="w-14 h-14 rounded-2xl border border-white/20 text-2xl font-black flex items-center justify-center hover:bg-white/10">-</button>
                    <span className="text-5xl font-black text-primary-400 w-16 text-center">{profile.claimsLast5Years || 0}</span>
                    <button onClick={() => updateNumericField('claimsLast5Years', 1)} className="w-14 h-14 rounded-2xl border border-white/20 text-2xl font-black flex items-center justify-center hover:bg-white/10">+</button>
                 </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
           <button 
             onClick={handleBack}
             disabled={currentStepIndex === 0}
             className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-900 disabled:opacity-0 transition-all"
           >
             <ChevronLeft className="w-4 h-4" />
             Précédent
           </button>
           
           <button 
             onClick={handleNext}
             disabled={isAnalyzing}
             className="flex items-center gap-2 px-10 py-5 bg-primary-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-primary-900/20 hover:bg-primary-700 active:scale-95 transition-all"
           >
             {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : currentStepIndex === STEPS.length - 1 ? 'Lancer l\'Analyse' : 'Continuer'}
             {currentStepIndex < STEPS.length - 1 && !isAnalyzing && <ChevronRight className="w-4 h-4" />}
           </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-primary-900/20 flex flex-col sm:flex-row items-center justify-between gap-6 animate-fadeIn">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/20 rounded-[1.5rem] flex items-center justify-center backdrop-blur-xl border border-white/10">
            <Headset className="w-8 h-8" />
          </div>
          <div className="text-center sm:text-left">
            <h4 className="text-xl font-black tracking-tighter">L'IA analyse, l'expert sécurise.</h4>
            <p className="text-xs text-primary-100 font-medium opacity-80 mt-1">Échangez avec un expert pour valider ces résultats gratuitement.</p>
          </div>
        </div>
        <button onClick={onFinishSimulation} className="px-8 py-4 bg-white text-primary-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-50 transition-all shadow-xl whitespace-nowrap active:scale-95">Prendre rendez-vous</button>
      </div>

      {hasAnalyzed && !isAnalyzing && (
        <div className="space-y-8 animate-slideUp">
          <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shadow-sm"><CheckCircle className="w-6 h-6" /></div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Audit Stratégique</h3>
             </div>
             <button 
               onClick={handleExportPDF}
               disabled={isExporting}
               className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
             >
               {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
               Générer Rapport PDF
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {findings.map((f, i) => (
               <div key={i} className="bg-white rounded-[2.5rem] p-8 border border-slate-200 space-y-4 hover:shadow-2xl transition-all group relative overflow-hidden">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    f.type === 'gap' ? 'bg-red-50 text-red-500' : 
                    f.type === 'duplicate' ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'
                  }`}>
                    {f.type === 'gap' ? <ShieldAlert className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
                  </div>
                  <h4 className="font-black text-slate-900 tracking-tight leading-snug text-lg">{f.title}</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{f.description}</p>
                  <div className="pt-6 border-t border-slate-50">
                     <p className="text-[10px] font-black uppercase text-primary-600 tracking-[0.2em] mb-2">Conseil Expert</p>
                     <p className="text-sm font-bold text-slate-900 leading-snug">{f.recommendation}</p>
                  </div>
               </div>
             ))}
          </div>

          <div className="bg-slate-900 rounded-[3rem] p-10 text-white text-center space-y-8 shadow-2xl mt-12 relative overflow-hidden">
             <div className="space-y-3 relative z-10">
                <h3 className="text-3xl font-black tracking-tighter">Audit Terminé</h3>
                <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto">Voulez-vous transférer ce bilan à un expert partenaire pour une contre-offre gratuite ?</p>
             </div>
             <button 
               onClick={onFinishSimulation}
               className="w-full py-6 bg-white text-slate-900 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-primary-50 transition-all shadow-xl relative z-10"
             >
               Transférer le dossier
             </button>
             <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-primary-600/10 rounded-full blur-3xl" />
          </div>
        </div>
      )}
    </div>
  );
};
