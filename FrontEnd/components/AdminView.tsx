
import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Plus, Trash2, Globe, FileText, CheckCircle, Search, 
  ExternalLink, AlertCircle, RefreshCw, Filter, ShieldCheck, ArrowUpRight, 
  Cpu, Sparkles, Wand2, Loader2, ListChecks
} from 'lucide-react';
import { CentralCgEntry, PolicyType } from '../types';
import { storageService } from '../services/storageService';
import { indexCgDocument } from '../services/geminiService';
import { useMasterData } from '../hooks/useMasterData';
import { getInsuranceSubTypes, getDocumentTypes, type InsuranceSubType, type DocumentType } from '../services/masterDataService';

type VectorizationStatus = {
  id: number;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'partial';
  pagesTotal: number;
  pagesProcessed: number;
  tablesExtracted: number;
  factsCount: number;
  vectorizedAt: string | null;
  error: string | null;
};

export const AdminView: React.FC = () => {
  const [repo, setRepo] = useState<CentralCgEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const { types: insuranceTypes, insurers } = useMasterData();
  const [vectorizationStatus, setVectorizationStatus] = useState<VectorizationStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [newEntry, setNewEntry] = useState({
    insurerCode: '',
    productName: '',
    insuranceTypeCode: '',
    insuranceSubTypeCode: '',
    documentTypeCode: 'CG',
    version: '',
    detail: '',
    url: ''
  });

  const [availableSubTypes, setAvailableSubTypes] = useState<InsuranceSubType[]>([]);
  const [availableDocTypes, setAvailableDocTypes] = useState<DocumentType[]>([]);
  const [isLoadingSubTypes, setIsLoadingSubTypes] = useState(false);

  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [indexingResult, setIndexingResult] = useState<{
    indexedFormulas: string[];
    indexedOptions: string[];
    semanticSummary: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Charger les types de document au montage
  useEffect(() => {
    getDocumentTypes().then(setAvailableDocTypes);
  }, []);

  // Charger les sous-types quand le type d'assurance change
  useEffect(() => {
    if (!newEntry.insuranceTypeCode) {
      setAvailableSubTypes([]);
      setNewEntry(prev => ({ ...prev, insuranceSubTypeCode: '' }));
      return;
    }
    setIsLoadingSubTypes(true);
    getInsuranceSubTypes(newEntry.insuranceTypeCode)
      .then(setAvailableSubTypes)
      .finally(() => setIsLoadingSubTypes(false));
  }, [newEntry.insuranceTypeCode]);

  useEffect(() => {
    const loadRepo = async () => {
      try {
        const data = await storageService.getCentralCgRepo();
        setRepo(data || []);
      } catch (error) {
        console.error('Failed to load CG repo:', error);
        setRepo([]);
      }
    };
    loadRepo();
    // Cleanup polling on unmount
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleStartIndexing = async () => {
    if (!newEntry.insurerCode || !pdfFile) {
      alert('Veuillez sélectionner un assureur et charger un fichier PDF');
      return;
    }
    
    // Reset complet de l'état avant indexation
    setIndexingResult(null);
    setIsIndexing(true);
    
    try {
      // Convertir le fichier PDF en base64
      const reader = new FileReader();
      const pdfData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pdfFile);
      });
      
      const result = await indexCgDocument(newEntry.insurerCode, newEntry.insuranceTypeCode, pdfData);
      
      // Vérifier que le résultat contient des données valides
      if (!result) {
        throw new Error('Aucun résultat reçu du serveur');
      }
      
      // Vérifier si l'indexation a vraiment fonctionné
      const hasData = (result.indexedFormulas && result.indexedFormulas.length > 0) || 
                      (result.indexedOptions && result.indexedOptions.length > 0) ||
                      (result.semanticSummary && result.semanticSummary !== "Erreur d'indexation" && result.semanticSummary !== "Service IA non disponible");
      
      if (!hasData) {
        throw new Error('Indexation échouée: aucune donnée extraite. Vérifiez que le PDF est accessible et que l\'API Gemini fonctionne.');
      }
      
      setIndexingResult({
        indexedFormulas: result.indexedFormulas || [],
        indexedOptions: result.indexedOptions || [],
        semanticSummary: result.semanticSummary || 'Aucun résumé disponible'
      });
    } catch (e: any) {
      console.error('Erreur indexation:', e);
      alert(`Erreur lors de l'indexation: ${e.message || 'Erreur inconnue'}`);
      setIndexingResult(null); // Reset en cas d'erreur
    } finally {
      setIsIndexing(false);
    }
  };

  const handleFinalAdd = async () => {
    if (!indexingResult || !pdfFile) return;
    
    // Validation côté client
    if (!newEntry.insurerCode || !newEntry.productName || !newEntry.insuranceTypeCode) {
      alert('Veuillez remplir tous les champs obligatoires (Assureur, Nom Contrat, Type d\'assurance)');
      return;
    }
    
    try {
      // Convertir le PDF en base64 pour l'envoi
      const reader = new FileReader();
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pdfFile);
      });
      
      const entryToSave = {
        insurerCode: newEntry.insurerCode,
        productName: newEntry.productName,
        insuranceTypeCode: newEntry.insuranceTypeCode,
        insuranceSubTypeCode: newEntry.insuranceSubTypeCode || null,
        documentTypeCode: newEntry.documentTypeCode || 'CG',
        version: newEntry.version || '',
        type: newEntry.documentTypeCode || 'CG',
        detail: newEntry.detail || '',
        url: newEntry.url || '',
        targetFilename: pdfFile.name,
        pdfData: pdfBase64,
        metadata: {
          indexedFormulas: indexingResult.indexedFormulas || [],
          indexedOptions: {},  // À structurer par formule si besoin
          description: indexingResult.semanticSummary || ''
        }
      };
      
      console.log('📤 Envoi de l\'entrée CG:', {
        ...entryToSave,
        pdfData: `[${Math.round(pdfBase64.length / 1024)}KB base64]`
      });
      
      const savedEntry = await storageService.saveCgEntry(entryToSave);
      const savedId = (savedEntry as any)?.id;

      // Démarrer le polling de statut vectorisation si on a un id
      if (savedId) {
        setVectorizationStatus({ id: savedId, status: 'pending', pagesTotal: 0, pagesProcessed: 0, tablesExtracted: 0, factsCount: 0, vectorizedAt: null, error: null });
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          try {
            const status = await storageService.getVectorizationStatus(savedId);
            setVectorizationStatus(status);
            if (status.status === 'done' || status.status === 'failed' || status.status === 'partial') {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              const data = await storageService.getCentralCgRepo();
              setRepo(data || []);
            }
          } catch (e) {
            console.warn('⚠️ Erreur polling statut vectorisation:', e);
          }
        }, 8000); // poll toutes les 8s pour éviter le rate-limiting
      }

      const data = await storageService.getCentralCgRepo();
      setRepo(data || []);
      setNewEntry({ insurerCode: '', productName: '', insuranceTypeCode: '', insuranceSubTypeCode: '', documentTypeCode: 'CG', version: '', detail: '', url: '' });
      setIndexingResult(null);
      setShowAddForm(false);
      setPdfFile(null);
    } catch (error: any) {
      console.error('Failed to save CG entry:', error);
      alert(`Erreur lors de la sauvegarde: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id || !confirm("Supprimer ce document de la base centrale ?")) return;
    try {
      await storageService.deleteCgEntry(id);
      const data = await storageService.getCentralCgRepo();
      setRepo(data || []);
    } catch (error: any) {
      console.error('Failed to delete CG entry:', error);
      alert(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const filteredRepo = (repo || []).filter(e => {
    if (!e) return false;
    const provider = e.insurer?.toLowerCase() || '';
    const productName = e.productName?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return provider.includes(search) || productName.includes(search);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
            <Database className="w-8 h-8 text-primary-600" />
            Gestionnaire de Connaissances
          </h2>
          <p className="text-slate-500 font-medium mt-1">Base vectorisée pour l'IA de BienCouvert</p>
        </div>
        
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-xl shadow-primary-900/10 transition-all"
        >
          {showAddForm ? 'Annuler' : <><Plus className="w-4 h-4" /> Indexer un nouveau document</>}
        </button>
      </div>

      {/* Bandeau de progression vectorisation */}
      {vectorizationStatus && (
        <div className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
          vectorizationStatus.status === 'done' ? 'bg-emerald-50 border-emerald-200' :
          vectorizationStatus.status === 'failed' ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          {vectorizationStatus.status === 'done' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : vectorizationStatus.status === 'failed' ? (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-widest mb-1">
              {vectorizationStatus.status === 'done' ? '✅ Vectorisation terminée' :
               vectorizationStatus.status === 'failed' ? '❌ Vectorisation échouée' :
               '⏳ Vectorisation en cours...'}
            </p>
            {vectorizationStatus.status !== 'failed' && vectorizationStatus.pagesTotal > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${vectorizationStatus.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.round((vectorizationStatus.pagesProcessed / vectorizationStatus.pagesTotal) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold whitespace-nowrap">
                  {vectorizationStatus.pagesProcessed}/{vectorizationStatus.pagesTotal} pages
                  {vectorizationStatus.tablesExtracted > 0 && ` · ${vectorizationStatus.tablesExtracted} tableau(x)`}
                  {vectorizationStatus.factsCount > 0 && ` · ${vectorizationStatus.factsCount} faits`}
                </span>
              </div>
            )}
            {vectorizationStatus.status === 'failed' && vectorizationStatus.error && (
              <p className="text-[10px] text-red-600 font-medium mt-1 truncate">{vectorizationStatus.error}</p>
            )}
          </div>
          <button onClick={() => setVectorizationStatus(null)} className="text-slate-400 hover:text-slate-600 text-xs shrink-0">✕</button>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-primary-100 shadow-2xl animate-scaleIn space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Assureur *</label>
              <select 
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold appearance-none"
                value={newEntry.insurerCode} 
                onChange={e => setNewEntry({...newEntry, insurerCode: e.target.value})}
              >
                <option value="">Sélectionner un assureur</option>
                {insurers && insurers.length > 0 ? (
                  insurers.map(ins => (
                    <option key={ins.code} value={ins.code}>
                      {ins.label}
                    </option>
                  ))
                ) : (
                  <option disabled>Chargement...</option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type d'assurance *</label>
              <select 
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold appearance-none"
                value={newEntry.insuranceTypeCode} 
                onChange={e => setNewEntry({...newEntry, insuranceTypeCode: e.target.value})}
              >
                <option value="">Sélectionner un type</option>
                {insuranceTypes && insuranceTypes.length > 0 ? (
                  insuranceTypes.map(type => (
                    <option key={type.code} value={type.code}>
                      {type.labelFr}
                    </option>
                  ))
                ) : (
                  <option disabled>Chargement...</option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nom Contrat *</label>
              <input 
                type="text" required placeholder="Auto Zen..." 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.productName} onChange={e => setNewEntry({...newEntry, productName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Version</label>
              <input 
                type="text" placeholder="2024-01" 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.version} onChange={e => setNewEntry({...newEntry, version: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sous-type d'assurance</label>
              <select
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold appearance-none"
                value={newEntry.insuranceSubTypeCode}
                onChange={e => setNewEntry({...newEntry, insuranceSubTypeCode: e.target.value})}
                disabled={!newEntry.insuranceTypeCode || isLoadingSubTypes}
              >
                <option value="">{isLoadingSubTypes ? 'Chargement...' : '— Aucun sous-type —'}</option>
                {availableSubTypes.map(st => (
                  <option key={st.code} value={st.code}>{st.labelFr}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type de document</label>
              <select
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold appearance-none"
                value={newEntry.documentTypeCode}
                onChange={e => setNewEntry({...newEntry, documentTypeCode: e.target.value})}
              >
                {availableDocTypes.length > 0 ? (
                  availableDocTypes.map(dt => (
                    <option key={dt.code} value={dt.code}>{dt.labelFr}</option>
                  ))
                ) : (
                  <>
                    <option value="CG">Conditions Générales</option>
                    <option value="CP">Conditions Particulières</option>
                    <option value="IPID">IPID</option>
                    <option value="DIP">Document d'information précontractuelle</option>
                    <option value="NOTIF">Notice d'information</option>
                    <option value="AN">Annexe contractuelle</option>
                    <option value="TGARP">Tableau des garanties</option>
                    <option value="FIC">Fiche d'information et de conseil</option>
                  </>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">URL (optionnelle)</label>
              <input 
                type="url" placeholder="https://..." 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.url} onChange={e => setNewEntry({...newEntry, url: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Détail du document (optionnel)</label>
              <input
                type="text" placeholder="Ex : CG Auto 2024 — formule Tiers+, version jan. 2024"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.detail} onChange={e => setNewEntry({...newEntry, detail: e.target.value})}
              />
            </div>
          </div>

          {/* Fichier PDF uniquement */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Fichier PDF *</label>
            <div className="relative">
              <input 
                type="file"
                accept="application/pdf"
                onChange={e => setPdfFile(e.target.files?.[0] || null)}
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
              />
            </div>
            {pdfFile && (
              <p className="text-xs text-emerald-600 font-medium ml-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {!indexingResult ? (
            <button 
              onClick={handleStartIndexing}
              disabled={isIndexing || !pdfFile}
              className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isIndexing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
              {isIndexing ? 'Vectorisation en cours...' : 'Lancer l\'indexation sémantique'}
            </button>
          ) : (
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 space-y-6 animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="w-6 h-6" />
                <h4 className="font-black uppercase text-xs tracking-widest">Analyse IA terminée</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Formules Indexées :</p>
                  <div className="flex flex-wrap gap-2">
                    {indexingResult.indexedFormulas.map(f => (
                      <span key={f} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold">{f}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Options Indexées :</p>
                  <div className="flex flex-wrap gap-2">
                    {indexingResult.indexedOptions.map(o => (
                      <span key={o} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold">{o}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                 <p className="text-[10px] font-black uppercase text-slate-400">Résumé Sémantique :</p>
                 <p className="text-xs text-slate-600 font-medium leading-relaxed bg-white p-4 rounded-2xl border border-slate-100">{indexingResult.semanticSummary}</p>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIndexingResult(null)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest">Recommencer</button>
                <button onClick={handleFinalAdd} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Valider et stocker en base</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Rechercher dans la base vectorisée..." 
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filteredRepo.length} Contrat(s) certifié(s)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                <th className="px-4 py-4">ID</th>
                <th className="px-6 py-4">Assureur</th>
                <th className="px-6 py-4">Type d'assurance</th>
                <th className="px-6 py-4">Sous-type</th>
                <th className="px-6 py-4">URL</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-center">Suppression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRepo.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-4">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">{entry.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-0.5">
                      <span className="font-black text-slate-900 text-sm">{entry.insurer}</span>
                      <div className="text-[9px] text-slate-400">{entry.insurerCode}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-1 rounded-lg uppercase block w-fit">
                      {(entry as any).insuranceTypeLabel || entry.insuranceTypeCode || entry.type || '–'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {(entry as any).insuranceSubTypeLabel || (entry as any).insuranceSubTypeCode ? (
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg block w-fit">
                        {(entry as any).insuranceSubTypeLabel || (entry as any).insuranceSubTypeCode}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {entry.documentUrl ? (
                      <a
                        href={entry.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs font-medium group/link"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="max-w-[160px] truncate group-hover/link:underline">
                          {entry.documentUrl.replace(/^https?:\/\//, '').split('/')[0]}
                        </span>
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {(entry as any).vectorizedAt ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-emerald-700">Vectorisé</span>
                        </div>
                        <span className="text-[9px] text-slate-400">
                          {new Date((entry as any).vectorizedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <span className="text-[9px] text-slate-400">Non vectorisé</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
