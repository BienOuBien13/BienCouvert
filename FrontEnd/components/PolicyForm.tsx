
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, Plus, Save, X, Globe, Search, ArrowRight, RotateCcw, Car, Home, Heart, Scale, Briefcase, Shield, AlertCircle, CreditCard, Smartphone, Banknote, Tag } from 'lucide-react';
import { Policy, PolicyType, WebSearchResult } from '../types';
import { summarizePolicy, searchPolicyInfo } from '../services/geminiService';

interface Props {
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onUpdatePolicy: (policy: Policy) => void;
  initialData?: Policy | null;
  onCancelEdit?: () => void;
}

type InputMode = 'file' | 'web';
const DRAFT_KEY = 'assurclair_policy_draft';

export const PolicyForm: React.FC<Props> = ({ onAddPolicy, onUpdatePolicy, initialData, onCancelEdit }) => {
  const [mode, setMode] = useState<InputMode>('web');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState<PolicyType>(PolicyType.AUTO);
  const [coverageDetail, setCoverageDetail] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [showLongWaitOption, setShowLongWaitOption] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showWebValidation, setShowWebValidation] = useState(false);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<string>('');
  const [customFormula, setCustomFormula] = useState('');
  const [newOption, setNewOption] = useState('');

  useEffect(() => {
    let timer: any;
    if (isAnalyzing && mode === 'web') {
      timer = setTimeout(() => {
        setShowLongWaitOption(true);
      }, 12000);
    } else {
      setShowLongWaitOption(false);
    }
    return () => clearTimeout(timer);
  }, [isAnalyzing, mode]);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setProvider(initialData.provider);
      setType(initialData.type);
      setCoverageDetail(initialData.coverageDetail || '');
      setSelectedOptions(initialData.options || []);
      setMode(initialData.sourceUrl ? 'web' : 'file');
    } else {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setHasDraft(true);
    }
  }, [initialData]);

  useEffect(() => {
    if (!initialData && (name || provider || coverageDetail)) {
      const draft = { name, provider, type, mode, coverageDetail, selectedOptions };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [name, provider, type, mode, coverageDetail, selectedOptions, initialData]);

  const restoreDraft = () => {
    const draftStr = localStorage.getItem(DRAFT_KEY);
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      setName(draft.name || '');
      setProvider(draft.provider || '');
      setType(draft.type || PolicyType.AUTO);
      setMode(draft.mode || 'web');
      setCoverageDetail(draft.coverageDetail || '');
      setSelectedOptions(draft.selectedOptions || []);
    }
    setHasDraft(false);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  };

  const resetForm = () => {
    setName(''); setProvider(''); setType(PolicyType.AUTO); setCoverageDetail(''); setSelectedOptions([]); setFile(null); setMode('web');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowWebValidation(false); setWebSearchResult(null); setSelectedFormula(''); setCustomFormula('');
    setAnalysisStatus('');
    clearDraft();
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'file' && !initialData && !file) return;
    if (mode === 'web' && (!provider || !name)) return;
    
    setIsAnalyzing(true);
    setAnalysisStatus(mode === 'web' ? 'Consultation des sites assureurs...' : 'Analyse du document PDF...');

    try {
      if (mode === 'file') {
        await processFileSubmission();
      } else {
        const result = await searchPolicyInfo(provider, type, name);
        setWebSearchResult(result);
        setShowWebValidation(true);
      }
    } catch (error) {
      handleManualEntryFallback();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualEntryFallback = () => {
    setWebSearchResult({
      summary: "Données web inaccessibles. Veuillez saisir votre formule manuellement.",
      detectedFormulas: ["Standard", "Plus", "Premium", "Excellence"],
      availableOptions: ["Protection Juridique", "Assistance 0km", "Objets de valeur"]
    });
    setShowWebValidation(true);
    setIsAnalyzing(false);
  };

  const processFileSubmission = async () => {
    let base64Content = initialData?.fileData || null;
    let fileName = initialData?.fileName || null;
    let mimeType = initialData?.mimeType || 'application/pdf';
    let summary = initialData?.summary || '';
    if (file) {
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = async () => {
          const base64String = reader.result as string;
          base64Content = base64String.split(',')[1];
          fileName = file.name; mimeType = file.type;
          try { summary = await summarizePolicy(base64Content, mimeType); } catch (e) {}
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    savePolicyData({ fileData: base64Content, fileName, mimeType, summary, coverageDetail, options: selectedOptions });
  };

  const handleWebValidationSubmit = () => {
    if (!webSearchResult) return;
    const finalCoverage = selectedFormula === 'custom' ? customFormula : selectedFormula;
    savePolicyData({ 
      fileData: null, 
      fileName: null, 
      mimeType: 'text/html', 
      summary: webSearchResult.summary, 
      sourceUrl: webSearchResult.sourceUrl, 
      coverageDetail: finalCoverage,
      options: selectedOptions
    });
  };

  const savePolicyData = (data: Partial<Policy>) => {
    const policyData = { name, provider, type, ...data };
    if (initialData) onUpdatePolicy({ ...initialData, ...policyData } as Policy);
    else onAddPolicy({ id: crypto.randomUUID(), ...policyData, addedAt: Date.now() } as Omit<Policy, 'userId'>);
    if (!initialData) resetForm(); else setShowWebValidation(false);
    clearDraft();
  };

  const toggleOption = (opt: string) => {
    setSelectedOptions(prev => 
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    );
  };

  const addCustomOption = () => {
    if (newOption.trim() && !selectedOptions.includes(newOption.trim())) {
      setSelectedOptions(prev => [...prev, newOption.trim()]);
      setNewOption('');
    }
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          {initialData ? <Save className="w-5 h-5 text-primary-600" /> : <Plus className="w-5 h-5 text-primary-600" />}
          {initialData ? 'Modifier le contrat' : 'Nouveau contrat'}
        </h2>
        {initialData && onCancelEdit && (
          <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
        )}
      </div>

      <div className="flex gap-4 mb-8">
        <button onClick={() => setMode('web')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${mode === 'web' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
          <Globe className="w-6 h-6" />
          <span className="text-sm font-bold">Recherche IA</span>
        </button>
        <button onClick={() => setMode('file')} className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${mode === 'file' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
          <Upload className="w-6 h-6" />
          <span className="text-sm font-bold">Import PDF</span>
        </button>
      </div>

      <form onSubmit={handleInitialSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-3">Catégorie</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {Object.values(PolicyType).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${type === t ? 'border-primary-500 bg-primary-50 text-primary-600 ring-1 ring-primary-500' : 'border-slate-200 text-slate-500 hover:border-primary-200'}`}>
                {typeIcons[t]}
                <span className="text-[9px] font-bold uppercase truncate w-full text-center leading-tight">{t.split('/')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom du contrat</label>
            <input type="text" required className="w-full rounded-xl border-slate-300 border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex: Visa Premier / Auto Zen" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assureur / Banque</label>
            <input type="text" required className="w-full rounded-xl border-slate-300 border px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex: Boursorama, AXA..." value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <button type="submit" disabled={isAnalyzing} className="w-full py-4 bg-primary-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-700 transition-all shadow-lg shadow-primary-900/10">
            {isAnalyzing ? <><Loader2 className="animate-spin w-5 h-5" /> {analysisStatus}</> : 'Continuer'}
          </button>
          {showLongWaitOption && isAnalyzing && (
             <button type="button" onClick={handleManualEntryFallback} className="w-full py-2 text-xs text-slate-500 hover:text-primary-600 transition-colors">Passer la recherche IA</button>
          )}
        </div>
      </form>

      {showWebValidation && webSearchResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-scaleIn max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Personnalisez votre contrat</h3>
              <button onClick={() => setShowWebValidation(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {/* Formules section */}
              <section>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Formule principale</label>
                <div className="grid grid-cols-2 gap-2">
                  {webSearchResult.detectedFormulas.map(f => (
                    <button key={f} onClick={() => { setSelectedFormula(f); setCustomFormula(''); }} className={`text-left p-3 rounded-xl border text-sm font-medium transition-all ${selectedFormula === f ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500' : 'border-slate-100 bg-slate-50 hover:border-primary-200'}`}>
                      {f}
                    </button>
                  ))}
                  <button onClick={() => setSelectedFormula('custom')} className={`text-left p-3 rounded-xl border text-sm font-medium transition-all ${selectedFormula === 'custom' ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500' : 'border-slate-100 bg-slate-50 hover:border-primary-200'}`}>
                    Autre...
                  </button>
                </div>
                {selectedFormula === 'custom' && (
                  <input type="text" className="w-full mt-2 p-3 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Précisez la formule" value={customFormula} onChange={e => setCustomFormula(e.target.value)} />
                )}
              </section>

              {/* Options section */}
              <section>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Tag className="w-3 h-3" /> Options souscrites
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {webSearchResult.availableOptions?.map(opt => (
                    <button 
                      key={opt} 
                      onClick={() => toggleOption(opt)} 
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${selectedOptions.includes(opt) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-500 border-slate-200 hover:border-primary-200'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                
                {/* Manual option entry */}
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-grow p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" 
                    placeholder="Ajouter une option (ex: Jardin+)" 
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomOption()}
                  />
                  <button type="button" onClick={addCustomOption} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                {selectedOptions.filter(o => !webSearchResult.availableOptions?.includes(o)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                     {selectedOptions.filter(o => !webSearchResult.availableOptions?.includes(o)).map(o => (
                       <span key={o} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold border border-slate-200">
                         {o}
                         <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => toggleOption(o)} />
                       </span>
                     ))}
                  </div>
                )}
              </section>
            </div>

            <div className="flex gap-3 pt-6 border-t border-slate-100 mt-6">
              <button onClick={() => setShowWebValidation(false)} className="flex-1 py-3 rounded-xl border font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
              <button onClick={handleWebValidationSubmit} disabled={!selectedFormula} className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 shadow-lg shadow-primary-900/10 disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
