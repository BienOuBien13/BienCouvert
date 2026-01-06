
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, Plus, Save, X, Globe, Search, AlertCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { Policy, PolicyType, WebSearchResult } from '../types';
import { uuid } from '../utils/uuid';
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
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Web Search Validation Modal
  const [showWebValidation, setShowWebValidation] = useState(false);
  const [webSearchResult, setWebSearchResult] = useState<WebSearchResult | null>(null);
  const [selectedFormula, setSelectedFormula] = useState<string>('');
  const [customFormula, setCustomFormula] = useState('');

  // Initial Load & Draft recovery
  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setProvider(initialData.provider);
      setType(initialData.type);
      setCoverageDetail(initialData.coverageDetail || '');
      setMode(initialData.sourceUrl ? 'web' : 'file');
    } else {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        setHasDraft(true);
      }
    }
  }, [initialData]);

  // Auto-save draft
  useEffect(() => {
    if (!initialData && (name || provider || coverageDetail)) {
      const draft = { name, provider, type, mode, coverageDetail };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [name, provider, type, mode, coverageDetail, initialData]);

  const restoreDraft = () => {
    const draftStr = localStorage.getItem(DRAFT_KEY);
    if (draftStr) {
      const draft = JSON.parse(draftStr);
      setName(draft.name || '');
      setProvider(draft.provider || '');
      setType(draft.type || PolicyType.AUTO);
      setMode(draft.mode || 'web');
      setCoverageDetail(draft.coverageDetail || '');
    }
    setHasDraft(false);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  };

  const resetForm = () => {
    setName('');
    setProvider('');
    setType(PolicyType.AUTO);
    setCoverageDetail('');
    setFile(null);
    setMode('web');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowWebValidation(false);
    setWebSearchResult(null);
    setSelectedFormula('');
    setCustomFormula('');
    clearDraft();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'file' && !initialData && !file) return;
    if (mode === 'web' && (!provider || !name)) return;

    setIsAnalyzing(true);

    try {
      if (mode === 'file') {
        await processFileSubmission();
      } else {
        const result = await searchPolicyInfo(provider, type, name);
        setWebSearchResult(result);
        if (initialData && initialData.coverageDetail) {
          if (result.detectedFormulas.includes(initialData.coverageDetail)) {
             setSelectedFormula(initialData.coverageDetail);
          } else {
             setSelectedFormula('custom');
             setCustomFormula(initialData.coverageDetail);
          }
        } else {
          setSelectedFormula('');
        }
        setShowWebValidation(true);
      }
    } catch (error) {
      console.error("Error processing policy", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFileSubmission = async () => {
      let base64Content = initialData?.fileData || null;
      let fileName = initialData?.fileName || null;
      let mimeType = initialData?.mimeType || 'application/pdf';
      let summary = initialData?.summary || '';
      let sourceUrl = undefined;

      if (file) {
        const reader = new FileReader();
        const filePromise = new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
             const base64String = reader.result as string;
             base64Content = base64String.split(',')[1];
             fileName = file.name;
             mimeType = file.type;
             try {
               summary = await summarizePolicy(base64Content, mimeType);
             } catch (err) {
               summary = "Analyse PDF échouée.";
             }
             resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await filePromise;
      }

      savePolicyData({
        fileData: base64Content,
        fileName,
        mimeType,
        summary,
        sourceUrl,
        coverageDetail
      });
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
      coverageDetail: finalCoverage
    });
  };

  const savePolicyData = (data: Partial<Policy>) => {
    const policyData = { name, provider, type, ...data };
    if (initialData) {
      onUpdatePolicy({ ...initialData, ...policyData } as Policy);
    } else {
      onAddPolicy({ id: uuid(), ...policyData, addedAt: Date.now() } as Omit<Policy, 'userId'>);
    }
    if (!initialData) resetForm();
    else setShowWebValidation(false);
    clearDraft();
  };

  const isEditMode = !!initialData;

  return (
    <>
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${isEditMode ? 'border-primary-200 ring-4 ring-primary-50' : ''}`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            {isEditMode ? <Save className="w-5 h-5 text-primary-600" /> : <Plus className="w-5 h-5 text-primary-600" />}
            {isEditMode ? 'Modifier le contrat' : 'Ajouter un contrat'}
          </h2>
          {isEditMode && onCancelEdit && (
            <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {hasDraft && !isEditMode && (
          <div className="mb-6 p-3 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2 text-sm text-primary-800">
              <RotateCcw className="w-4 h-4" />
              <span>Brouillon détecté</span>
            </div>
            <div className="flex gap-2">
              <button onClick={clearDraft} className="text-xs text-slate-500 hover:text-red-600 font-medium px-2 py-1">Ignorer</button>
              <button onClick={restoreDraft} className="text-xs bg-primary-600 text-white px-3 py-1 rounded-md font-bold hover:bg-primary-700">Restaurer</button>
            </div>
          </div>
        )}

        <div className="flex p-1 bg-slate-100 rounded-lg mb-6 w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setMode('web')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === 'web' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Globe className="w-4 h-4" />
            Recherche Web
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === 'file' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Upload className="w-4 h-4" />
            Import PDF
          </button>
        </div>
        
        <form onSubmit={handleInitialSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom du contrat</label>
              <input
                type="text"
                required
                className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Ex: Assurance Auto Twingo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assureur</label>
              <input
                type="text"
                required
                className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Ex: AXA, Allianz..."
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
              <select
                className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                value={type}
                onChange={(e) => setType(e.target.value as PolicyType)}
              >
                {Object.values(PolicyType).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {mode === 'file' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Formule / Niveau</label>
                <input
                  type="text"
                  className="w-full rounded-lg border-slate-300 border px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Ex: Tous risques, Tiers étendu..."
                  value={coverageDetail}
                  onChange={(e) => setCoverageDetail(e.target.value)}
                />
              </div>
            )}
          </div>

          {mode === 'file' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isEditMode ? 'Remplacer le fichier (Optionnel)' : 'Conditions Générales (PDF)'}
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-lg hover:bg-slate-50 transition-colors cursor-pointer relative"
                  onClick={() => fileInputRef.current?.click()}>
                <div className="space-y-1 text-center">
                  {file ? (
                    <div className="flex flex-col items-center text-primary-600">
                      <FileText className="mx-auto h-10 w-10" />
                      <p className="text-sm font-medium">{file.name}</p>
                    </div>
                  ) : (
                    <>
                      {isEditMode && initialData?.fileName ? (
                        <div className="flex flex-col items-center text-slate-600">
                          <FileText className="mx-auto h-10 w-10 text-slate-400" />
                          <p className="text-sm font-medium">Fichier actuel : {initialData.fileName}</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-10 w-10 text-slate-400" />
                          <span className="font-medium text-primary-600 hover:text-primary-500">Téléchargez un fichier</span>
                          <p className="text-xs text-slate-500">PDF jusqu'à 10MB</p>
                        </>
                      )}
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} required={!isEditMode && mode === 'file'} />
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
               <div className="flex gap-3">
                 <Search className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                 <div>
                   <h4 className="text-sm font-medium text-blue-900">Analyse de garanties via IA</h4>
                   <p className="text-sm text-blue-700 mt-1">
                     L'IA va simuler la lecture du contrat standard de <strong>{provider || "l'assureur"}</strong>.
                   </p>
                 </div>
               </div>
            </div>
          )}

          <button
            type="submit"
            disabled={(mode === 'file' && !file && !isEditMode) || isAnalyzing}
            className={`w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white 
              ${(mode === 'file' && !file && !isEditMode) || isAnalyzing ? 'bg-primary-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700'} transition-all`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Optimisation de la recherche...
              </>
            ) : (
              mode === 'web' ? <><Search className="w-5 h-5" /> Vérifier les garanties</> : <><CheckCircle className="w-5 h-5" /> {isEditMode ? 'Enregistrer' : 'Ajouter'}</>
            )}
          </button>
        </form>
      </div>

      {showWebValidation && webSearchResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-slate-200 bg-primary-50 rounded-t-xl">
               <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                 <CheckCircle className="w-6 h-6 text-primary-600" />
                 Validation des Garanties
               </h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-600">
                <Globe className="w-4 h-4 inline mr-2" />
                Source détectée : {webSearchResult.sourceUrl || 'Analyse sémantique IA'}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-3">Sélectionnez votre formule</label>
                <div className="grid grid-cols-1 gap-2">
                  {webSearchResult.detectedFormulas.length > 0 ? (
                    webSearchResult.detectedFormulas.map((formula, idx) => (
                      <button key={idx} type="button" onClick={() => { setSelectedFormula(formula); setCustomFormula(''); }}
                        className={`text-left px-4 py-3 rounded-lg border transition-all ${selectedFormula === formula ? 'bg-primary-50 border-primary-500 ring-1 ring-primary-500 font-semibold' : 'bg-white border-slate-200 hover:border-primary-300'}`}>
                        {formula}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic mb-2 text-center">Aucune formule détectée, saisissez-la manuellement :</p>
                  )}
                  <button type="button" onClick={() => setSelectedFormula('custom')}
                    className={`text-left px-4 py-3 rounded-lg border transition-all ${selectedFormula === 'custom' ? 'bg-primary-50 border-primary-500 ring-1 ring-primary-500 font-semibold' : 'bg-white border-slate-200 hover:border-primary-300'}`}>
                    Formule spécifique / Personnalisée
                  </button>
                </div>
                {(selectedFormula === 'custom' || webSearchResult.detectedFormulas.length === 0) && (
                  <input type="text" value={customFormula} onChange={(e) => { setCustomFormula(e.target.value); setSelectedFormula('custom'); }} placeholder="Ex: Formule Intégrale" className="mt-3 w-full rounded-lg border-slate-300 border px-3 py-2 text-sm outline-none shadow-inner" />
                )}
              </div>

              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                 <h4 className="text-xs font-bold text-emerald-800 uppercase mb-2">Résumé extrait :</h4>
                 <p className="text-xs text-emerald-700 leading-relaxed italic line-clamp-4">{webSearchResult.summary}</p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button onClick={() => setShowWebValidation(false)} className="px-4 py-2 text-sm text-slate-700 bg-white border rounded-lg hover:bg-slate-50 transition-colors">Retour</button>
              <button onClick={handleWebValidationSubmit} disabled={!selectedFormula || (selectedFormula === 'custom' && !customFormula)} className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg disabled:opacity-50 shadow-lg shadow-primary-900/10">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
