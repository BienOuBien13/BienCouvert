
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Loader2, Plus, ArrowRight, 
  Car, Home, Heart, Scale, Briefcase, Shield, CreditCard, Smartphone, Banknote, 
  Edit3, Sparkles, ExternalLink, Database, Cpu, Check, Info, HelpCircle, ShieldCheck, Zap, BookOpen, X,
  Mic, MicOff, Activity, Bot, User, CheckCircle2, Globe, FileSearch, Upload, FileUp
} from 'lucide-react';
import { Policy, PolicyType, CentralCgEntry } from '../types';
import { searchPolicyInfo, parsePoliciesFromText, connectIntakeSession } from '../services/geminiService';
import { storageService } from '../services/storageService';

interface Props {
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onUpdatePolicy: (policy: Policy) => void;
  initialData?: Policy | null;
  onCancelEdit?: () => void;
  existingPolicies?: Policy[];
}

type InputMode = 'smart' | 'web';

const TYPICAL_NEEDS = [
  { type: PolicyType.AUTO, label: 'Auto' },
  { type: PolicyType.HOME, label: 'Habitation' },
  { type: PolicyType.HEALTH, label: 'Santé' },
  { type: PolicyType.LEGAL, label: 'Juridique' },
  { type: PolicyType.LIFE, label: 'Prévoyance' },
];

export const PolicyForm: React.FC<Props> = ({ onAddPolicy, onUpdatePolicy, initialData, onCancelEdit, existingPolicies = [] }) => {
  const [mode, setMode] = useState<InputMode>('smart');
  const [smartText, setSmartText] = useState('');
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  const [showEducation, setShowEducation] = useState(true);
  
  // Voice Recording & Intake Session State
  const [isRecording, setIsRecording] = useState(false);
  const [intakeHistory, setIntakeHistory] = useState<{ role: 'user' | 'bot', text: string }[]>([]);
  const cleanupIntakeSession = useRef<(() => void) | null>(null);
  const sessionFullTextRef = useRef('');
  const historyEndRef = useRef<HTMLDivElement>(null);

  const [extractedPolicies, setExtractedPolicies] = useState<Partial<Policy & { 
    isSearchingPDF: boolean;
    isInternalSource?: boolean;
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
  }>[]>([]);

  // Manual Mode Fields
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState<PolicyType>(PolicyType.AUTO);
  const [coverageDetail, setCoverageDetail] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [isSearchingManualPDF, setIsSearchingManualPDF] = useState(false);
  const [isInternalManual, setIsInternalManual] = useState(false);
  const [suggestedFormulas, setSuggestedFormulas] = useState<string[]>([]);
  const [suggestedOptions, setSuggestedOptions] = useState<string[]>([]);
  const [manualFile, setManualFile] = useState<{ data: string; name: string; type: string } | null>(null);

  const coveredNeeds = useMemo(() => {
    const types = new Set<PolicyType>([...existingPolicies.map(p => p.type)]);
    extractedPolicies.forEach(p => { if(p.type) types.add(p.type as PolicyType); });
    return types;
  }, [existingPolicies, extractedPolicies]);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setProvider(initialData.provider);
      setType(initialData.type);
      setCoverageDetail(initialData.coverageDetail || '');
      setSelectedOptions(initialData.options || []);
      setSummary(initialData.summary || '');
      setSourceUrl(initialData.sourceUrl || '');
      setIsInternalManual(initialData.isInternalSource || false);
      setMode('web');
      setShowEducation(false);
    } else {
      resetForm();
    }
  }, [initialData]);

  useEffect(() => {
    if (isRecording) {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [intakeHistory, isRecording]);

  useEffect(() => {
    return () => {
      if (cleanupIntakeSession.current) cleanupIntakeSession.current();
    };
  }, []);

  const appendSessionText = (text: string, role: 'user' | 'bot') => {
    if (role === 'user') sessionFullTextRef.current += ' ' + text;
    setIntakeHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  };

  const processAndStopSession = () => {
    if (cleanupIntakeSession.current) cleanupIntakeSession.current();
    cleanupIntakeSession.current = null;
    setIsRecording(false);
    
    if (sessionFullTextRef.current.trim()) {
      handleSmartExtraction(sessionFullTextRef.current);
    }
  };

  const toggleIntakeSession = async () => {
    if (isRecording) {
      processAndStopSession();
    } else {
      setIsRecording(true);
      setIntakeHistory([]);
      sessionFullTextRef.current = '';
      try {
        const existingTypes = Array.from(coveredNeeds) as PolicyType[];
        const cleanup = await connectIntakeSession(
          (userText) => appendSessionText(userText, 'user'),
          (botText) => appendSessionText(botText, 'bot'),
          () => {},
          existingTypes
        );
        cleanupIntakeSession.current = cleanup;
      } catch (err) {
        console.error(err);
        setIsRecording(false);
      }
    }
  };

  const handleSmartExtraction = async (text: string) => {
    if (!text.trim() || isAnalyzingText) return;
    setIsAnalyzingText(true);
    try {
      const result = await parsePoliciesFromText(text);
      const policies = result.policies.map(p => ({ ...p, isSearchingPDF: true }));
      
      // On affiche immédiatement les contrats trouvés avec l'état de chargement
      setExtractedPolicies(prev => [...prev, ...policies]);
      setSmartText("");

      // Lancement automatique de l'analyse profonde pour chaque nouveau contrat
      for (const p of policies) {
        try {
          const internal = storageService.findCgInRepo(p.provider!, p.name!, p.type as PolicyType);
          let updates;
          if (internal) {
            updates = {
              sourceUrl: internal.pdfUrl,
              isInternalSource: true,
              suggestedFormulas: internal.indexedFormulas,
              suggestedOptions: internal.indexedOptions,
              summary: internal.semanticSummary,
            };
          } else {
            const info = await searchPolicyInfo(p.provider!, p.type as PolicyType, p.name!);
            updates = {
              sourceUrl: info.sourceUrl,
              summary: info.summary,
              suggestedFormulas: info.detectedFormulas,
              suggestedOptions: info.availableOptions,
              isInternalSource: false,
            };
          }
          
          setExtractedPolicies(prev => prev.map(item => 
            (item.name === p.name && item.provider === p.provider) 
            ? { ...item, ...updates, isSearchingPDF: false } 
            : item
          ));
        } catch (e) {
          setExtractedPolicies(prev => prev.map(item => 
            (item.name === p.name && item.provider === p.provider) 
            ? { ...item, isSearchingPDF: false } 
            : item
          ));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzingText(false);
    }
  };

  const updateExtractedPolicy = (original: Partial<Policy>, updates: Partial<any>) => {
    setExtractedPolicies(prev => prev.map(item => item === original ? { ...item, ...updates } : item));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setManualFile({
          data: base64,
          name: file.name,
          type: file.type
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePolicy = async (p: Partial<Policy>) => {
    const policyData: Omit<Policy, 'userId'> = {
      id: initialData?.id || crypto.randomUUID(),
      name: p.name || name,
      provider: p.provider || provider,
      type: (p.type as PolicyType) || type,
      coverageDetail: p.coverageDetail || coverageDetail,
      summary: p.summary || summary || "Document vérifié par AssurClair.",
      sourceUrl: p.sourceUrl || sourceUrl,
      isInternalSource: p.isInternalSource !== undefined ? p.isInternalSource : isInternalManual,
      addedAt: Date.now(),
      fileData: p.fileData || (manualFile ? manualFile.data : null), 
      fileName: p.fileName || (manualFile ? manualFile.name : null), 
      mimeType: p.mimeType || (manualFile ? manualFile.type : 'text/plain'),
      options: p.options || selectedOptions
    };

    if (initialData) onUpdatePolicy(policyData as Policy);
    else onAddPolicy(policyData);
    
    setExtractedPolicies(prev => prev.filter(item => item !== p));
    if (extractedPolicies.length <= 1) resetForm();
  };

  const resetForm = () => {
    setName(''); setProvider(''); setType(PolicyType.AUTO); 
    setCoverageDetail(''); setSelectedOptions([]); setSummary('');
    setSourceUrl(''); setSmartText(''); setExtractedPolicies([]);
    setSuggestedFormulas([]); setSuggestedOptions([]);
    setIsInternalManual(false); setManualFile(null);
    setMode('smart');
  };

  const toggleOption = (opt: string) => {
    setSelectedOptions(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
  };

  const typeIcons = {
    [PolicyType.AUTO]: <Car className="w-5 h-5" />,
    [PolicyType.HOME]: <Home className="w-5 h-5" />,
    [PolicyType.HEALTH]: <Heart className="w-5 h-5" />,
    [PolicyType.LEGAL]: <Scale className="w-5 h-5" />,
    [PolicyType.LIFE]: <Briefcase className="w-5 h-5" />,
    [PolicyType.BANK_CARD]: <CreditCard className="w-5 h-5" />,
    [PolicyType.LOAN]: <Banknote className="w-5 h-5" />,
    [PolicyType.MOBILE]: <Smartphone className="w-5 h-5" />,
    [PolicyType.OTHER]: <Shield className="w-5 h-5" />,
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (provider.trim().length >= 2 && name.trim().length >= 2 && mode === 'web' && !initialData) {
        setIsSearchingManualPDF(true);
        const internal = storageService.findCgInRepo(provider, name, type);
        if (internal) {
          setSourceUrl(internal.pdfUrl);
          setIsInternalManual(true);
          setSuggestedFormulas(internal.indexedFormulas);
          setSuggestedOptions(internal.indexedOptions);
          setSummary(internal.semanticSummary);
        } else {
          try {
            const res = await searchPolicyInfo(provider, type, name);
            setSourceUrl(res.sourceUrl || "");
            setSuggestedFormulas(res.detectedFormulas || []);
            setSuggestedOptions(res.availableOptions || []);
            setSummary(res.summary || "");
            setIsInternalManual(false);
          } catch (e) { console.error(e); }
        }
        setIsSearchingManualPDF(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [provider, name, type, mode]);

  return (
    <div className="space-y-4 lg:sticky lg:top-8">
      {/* Education block */}
      {showEducation && !initialData && (
        <div className="bg-primary-50 rounded-3xl p-5 border border-primary-100 shadow-sm relative animate-fadeIn">
          <button onClick={() => setShowEducation(false)} className="absolute top-4 right-4 text-primary-400 hover:text-primary-600">
            <X className="w-4 h-4" />
          </button>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary-600 shadow-sm flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-primary-900 leading-none">Comment ça marche ?</h3>
              <p className="text-xs text-primary-800/70 font-medium leading-relaxed">
                Listez vos contrats au micro ou par écrit. L'IA les extraira et ira lire vos garanties réelles sur le web <strong>automatiquement</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Status */}
      {!initialData && (
        <div className="bg-white rounded-3xl p-3 border border-slate-200 shadow-sm flex items-center justify-between gap-4 overflow-hidden">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-emerald-500 p-1.5 rounded-lg text-white shadow-lg shadow-emerald-500/10"><ShieldCheck className="w-3 h-3" /></div>
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider hidden sm:inline">Check-list :</span>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1">
            {TYPICAL_NEEDS.map(n => (
              <div key={n.type} className={`flex items-center gap-1.5 flex-shrink-0 transition-all ${coveredNeeds.has(n.type) ? 'opacity-100' : 'opacity-25'}`}>
                <div className={`w-2 h-2 rounded-full ${coveredNeeds.has(n.type) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                <span className={`text-[8px] font-black uppercase ${coveredNeeds.has(n.type) ? 'text-slate-900' : 'text-slate-400'}`}>{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tighter">
            {initialData ? <Edit3 className="w-4 h-4 text-primary-600" /> : <Sparkles className="w-4 h-4 text-primary-600" />}
            {initialData ? 'Modification' : 'Admission intelligente'}
          </h2>
          {!initialData && (
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setMode('smart')} className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${mode === 'smart' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-400'}`}>Chat</button>
              <button onClick={() => setMode('web')} className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${mode === 'web' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-400'}`}>Manuel</button>
            </div>
          )}
        </div>

        {mode === 'smart' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="relative group">
              {isRecording && <div className="absolute -inset-1 bg-primary-500/10 rounded-3xl blur-md animate-pulse" />}
              
              <div className={`w-full bg-slate-50 border rounded-3xl transition-all relative overflow-hidden ${isRecording ? 'border-primary-500 bg-white ring-2 ring-primary-50' : 'border-slate-200 focus-within:border-primary-400'}`}>
                {isRecording ? (
                  <div className="p-4 space-y-2 h-[160px] overflow-y-auto scrollbar-hide flex flex-col">
                    {intakeHistory.map((h, i) => (
                      <div key={i} className={`flex items-start gap-2 animate-slideUp ${h.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {h.role === 'bot' && <div className="w-5 h-5 bg-primary-600 text-white rounded-lg flex items-center justify-center flex-shrink-0"><Bot className="w-3 h-3" /></div>}
                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-[11px] font-medium leading-tight ${h.role === 'user' ? 'bg-primary-600 text-white rounded-br-none shadow-sm' : 'bg-slate-100 text-slate-700 rounded-bl-none border border-slate-200'}`}>
                          {h.text}
                        </div>
                      </div>
                    ))}
                    <div ref={historyEndRef} />
                    {intakeHistory.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-2 opacity-30">
                         <div className="flex gap-1 items-end h-5">
                            {[0.3, 0.7, 0.5, 0.9, 0.4].map((v, i) => (
                              <div key={i} className="w-1 bg-primary-500 rounded-full animate-pulse" style={{ height: `${v * 100}%`, animationDelay: `${i * 0.1}s` }} />
                            ))}
                         </div>
                         <p className="text-[8px] font-black uppercase tracking-widest">Assistant à l'écoute...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <textarea 
                    className="w-full p-4 bg-transparent border-none outline-none text-xs font-medium placeholder:text-slate-300 min-h-[120px] resize-none"
                    placeholder="Écrivez : 'J'ai une auto à la MAIF et une mutuelle Harmonie'..."
                    value={smartText}
                    onChange={e => setSmartText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSmartExtraction(smartText))}
                  />
                )}
              </div>
              
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {isRecording && (
                  <button 
                    onClick={processAndStopSession}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10 active:scale-95 group animate-fadeIn"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Analyser</span>
                  </button>
                )}

                <button 
                  onClick={toggleIntakeSession}
                  className={`p-3.5 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center ${isRecording ? 'bg-red-500 text-white ring-4 ring-red-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {!isRecording && (
                  <button 
                    onClick={() => handleSmartExtraction(smartText)}
                    disabled={!smartText.trim() || isAnalyzingText}
                    className="p-3.5 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg"
                  >
                    {isAnalyzingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {extractedPolicies.length > 0 && (
              <div className="space-y-3 animate-slideUp">
                <div className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-2 px-1">
                  <Zap className="w-3 h-3 text-amber-500" /> {extractedPolicies.length} contrat(s) détecté(s)
                </div>

                {extractedPolicies.map((p, i) => (
                  <div key={i} className={`p-4 rounded-3xl border bg-white transition-all duration-300 ${p.sourceUrl ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 shadow-sm'} relative group`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-inner border transition-all ${p.sourceUrl ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-primary-600 border-slate-100'}`}>
                        {p.type ? typeIcons[p.type as PolicyType] : <Shield className="w-4 h-4" />}
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black text-slate-900 truncate">{p.name || 'Nouveau contrat'}</p>
                          {p.sourceUrl && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        </div>
                        <p className={`text-[8px] font-bold uppercase tracking-widest ${p.sourceUrl ? 'text-emerald-600' : 'text-primary-600'}`}>{p.provider}</p>
                      </div>
                      <button onClick={() => setExtractedPolicies(prev => prev.filter(item => item !== p))} className="p-1 text-slate-300 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {p.isSearchingPDF ? (
                      <div className="mt-3 flex items-center gap-2 text-primary-600 text-[8px] font-black uppercase tracking-widest p-2 bg-primary-50 rounded-xl border border-primary-100 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Lecture des garanties de {p.provider}...
                      </div>
                    ) : p.sourceUrl ? (
                      <div className="mt-3 space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between p-2.5 border rounded-xl bg-white border-emerald-100">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.isInternalSource ? <Cpu className="w-3.5 h-3.5 text-emerald-600" /> : <Globe className="w-3.5 h-3.5 text-slate-400" />}
                            <div className="min-w-0">
                              <span className="text-[8px] font-black uppercase leading-none block text-emerald-800">
                                {p.isInternalSource ? 'CG Certifiées' : 'Source Web'}
                              </span>
                              <p className="text-[7px] opacity-60 font-bold truncate max-w-[100px] mt-0.5">{p.sourceUrl}</p>
                            </div>
                          </div>
                          <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        
                        <div className="space-y-1.5">
                          <p className="text-[8px] font-black uppercase text-slate-400 ml-1">Formule détectée :</p>
                          <div className="flex flex-wrap gap-1">
                            {p.suggestedFormulas?.map(f => (
                              <button key={f} onClick={() => updateExtractedPolicy(p, { coverageDetail: f })} className={`px-2.5 py-1 rounded-lg text-[8px] font-bold border transition-all ${p.coverageDetail === f ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}>
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={() => handleSavePolicy(p)} 
                          disabled={!p.coverageDetail}
                          className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl disabled:opacity-30"
                        >
                          Enregistrer au portefeuille
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 text-[8px] text-slate-400 font-bold italic px-1">
                         Document introuvable ou erreur d'analyse.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'web' && (
          <form onSubmit={e => { e.preventDefault(); handleSavePolicy({}); }} className="space-y-4 animate-fadeIn">
            {/* TYPE SELECTOR IN MANUAL MODE */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Type d'assurance</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {Object.values(PolicyType).slice(0, 8).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${type === t ? 'bg-primary-600 text-white border-primary-600 shadow-md scale-105' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-primary-200'}`}
                  >
                    <div className="mb-1">{typeIcons[t]}</div>
                    <span className="text-[7px] font-black uppercase truncate w-full text-center">{t.split('/')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Assureur</label>
                <input type="text" required placeholder="AXA, Maif, Allianz..." className="w-full rounded-2xl border-slate-200 border-2 px-4 py-3 text-xs font-bold focus:border-primary-500 outline-none" value={provider} onChange={e => setProvider(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nom du Contrat</label>
                <input type="text" required placeholder="Auto Tiers, Habitation Zen..." className="w-full rounded-2xl border-slate-200 border-2 px-4 py-3 text-xs font-bold focus:border-primary-500 outline-none" value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>

            {/* MANUAL PDF UPLOAD */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Document (Optionnel)</label>
              <div className="relative">
                <input 
                  type="file" 
                  accept=".pdf" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  id="manual-pdf-upload" 
                />
                <label 
                  htmlFor="manual-pdf-upload"
                  className={`flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${manualFile ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-primary-300'}`}
                >
                  {manualFile ? <FileText className="w-5 h-5" /> : <FileUp className="w-5 h-5" />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {manualFile ? manualFile.name : 'Charger mon PDF de garanties'}
                  </span>
                  {manualFile && <X className="w-4 h-4 ml-2 hover:text-red-500" onClick={(e) => { e.preventDefault(); setManualFile(null); }} />}
                </label>
              </div>
            </div>

            {isSearchingManualPDF ? (
               <div className="flex items-center gap-2 text-primary-600 text-[8px] font-black uppercase tracking-widest p-4 bg-primary-50 rounded-2xl border border-primary-100 animate-pulse">
                 <Loader2 className="w-4 h-4 animate-spin" /> Recherche des documents officiels...
               </div>
            ) : sourceUrl && (
              <div className={`p-3 border-2 rounded-2xl flex items-center justify-between animate-fadeIn ${isInternalManual ? 'bg-primary-50 border-primary-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    {isInternalManual ? <Cpu className="w-4 h-4 text-primary-600" /> : <Database className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <div>
                    <p className={`text-[8px] font-black uppercase leading-none ${isInternalManual ? 'text-primary-800' : 'text-emerald-800'}`}>
                      {isInternalManual ? 'Base Certifiée' : 'Source Web'}
                    </p>
                    <p className="text-[7px] opacity-60 font-bold truncate max-w-[120px] mt-0.5">{sourceUrl}</p>
                  </div>
                </div>
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`p-2 rounded-xl text-white ${isInternalManual ? 'bg-primary-600' : 'bg-emerald-600'}`}><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Votre Formule</label>
                <div className="flex flex-wrap gap-1">
                  {suggestedFormulas.map(f => (
                    <button key={f} type="button" onClick={() => setCoverageDetail(f)} className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border transition-all ${coverageDetail === f ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-primary-50'}`}>
                      {f}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="Autre formule..." className="w-full rounded-2xl border-slate-200 border-2 px-4 py-3 text-xs font-bold focus:border-primary-500 outline-none mt-1" value={coverageDetail} onChange={e => setCoverageDetail(e.target.value)} />
              </div>

              {/* OPTIONS SELECTION IN MANUAL MODE */}
              {(suggestedOptions.length > 0 || selectedOptions.length > 0) && (
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Options complémentaire</label>
                  <div className="flex flex-wrap gap-1">
                    {suggestedOptions.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleOption(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase border transition-all ${selectedOptions.includes(opt) ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-slate-400 border-slate-200 hover:border-primary-300'}`}
                      >
                        {selectedOptions.includes(opt) && <Check className="w-3 h-3 inline mr-1" />}
                        {opt}
                      </button>
                    ))}
                    <div className="flex gap-1 w-full mt-1">
                       <input 
                         type="text" 
                         placeholder="Ajouter une option..." 
                         className="flex-grow rounded-xl border-slate-200 border px-3 py-2 text-[10px] font-bold outline-none"
                         onKeyDown={e => {
                           if (e.key === 'Enter') {
                             e.preventDefault();
                             const val = e.currentTarget.value.trim();
                             if (val) {
                               toggleOption(val);
                               e.currentTarget.value = '';
                             }
                           }
                         }}
                       />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" disabled={!coverageDetail || !provider || !name} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl active:scale-95 disabled:opacity-30">
              {initialData ? 'Mettre à jour' : 'Enregistrer au portefeuille'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
