
import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, Plus, Trash2, Globe, FileText, CheckCircle, Search, 
  ExternalLink, AlertCircle, RefreshCw, Filter, ShieldCheck, ArrowUpRight, 
  Cpu, Sparkles, Wand2, Loader2, ListChecks, Pencil, X, Tag, BarChart2, ChevronDown, Save, Users, Share2, FlaskConical, Settings
} from 'lucide-react';
import ControlCheckPage from './ControlCheckPage';
import { fetchCsrfToken } from '../services/authService';

// ---------------------------------------------------------------------------
// Types pour la gestion des faits de couverture (coverage_facts)
// ---------------------------------------------------------------------------
interface CoverageFact {
  id: number;
  guarantee_key: string;
  guarantee_label: string;
  formula_key: string;
  formula_label: string;
  coverage_status: 'included' | 'optional' | 'excluded' | 'not_applicable';
  coverage_amount?: string;
  coverage_notes?: string;
  franchise?: string;
  source_page_number?: number;
  extraction_confidence?: number;
}
// ---------------------------------------------------------------------------
// Type pour la liste admin des CG utilisateurs
// ---------------------------------------------------------------------------
interface UserCgEntry {
  id: number;
  user_id: number;
  user_email: string;
  first_name: string | null;
  last_name: string | null;
  insurer_code: string;
  insurer_label: string;
  insurance_type_code: string;
  insurance_type_label: string;
  target_filename: string;
  url: string | null;
  created_at: string;
  vectorized_at: string | null;
  pages_count: number;
  facts_count: number;
}

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

  // --- État du modal d'édition des formules/options ---
  const [editingEntry, setEditingEntry] = useState<CentralCgEntry | null>(null);
  const [editFormulas, setEditFormulas] = useState<string[]>([]);
  const [editOptions, setEditOptions] = useState<Record<string, string[]>>({});
  const [newFormulaInput, setNewFormulaInput] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- État du modal coverage_facts ---
  const [factsDocId, setFactsDocId] = useState<number | null>(null);
  const [factsDocLabel, setFactsDocLabel] = useState('');
  const [facts, setFacts] = useState<CoverageFact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsPatchLoading, setFactsPatchLoading] = useState<Record<number, boolean>>({});
  // Flag: true → on affiche des faits user_coverage_facts (vs coverage_facts central)
  const [factsIsUser, setFactsIsUser] = useState(false);

  // --- État de l'onglet User CG ---
  const [activeTab, setActiveTab] = useState<'central' | 'userCg' | 'controlCheck' | 'ingestion'>('central');
  const [userCgList, setUserCgList] = useState<UserCgEntry[]>([]);
  const [userCgLoading, setUserCgLoading] = useState(false);
  const [userCgSearchTerm, setUserCgSearchTerm] = useState('');
  const [promotingCgId, setPromotingCgId] = useState<number | null>(null);

  // Charge les faits de couverture d'un document CG central
  const loadCoverageFacts = async (centralCgId: number, label: string) => {
    setFactsIsUser(false);
    setFactsDocId(centralCgId);
    setFactsDocLabel(label);
    setFacts([]);
    setFactsLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/cg/coverage-facts/${centralCgId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }
      );
      const data = await res.json();
      setFacts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[coverage-facts]', e);
      setFacts([]);
    } finally {
      setFactsLoading(false);
    }
  };

  // Charge les faits de couverture d'un CG utilisateur (user_coverage_facts)
  const loadUserCoverageFacts = async (userCgId: number, label: string) => {
    setFactsIsUser(true);
    setFactsDocId(userCgId);
    setFactsDocLabel(label);
    setFacts([]);
    setFactsLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/cg/user-coverage-facts/${userCgId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }
      );
      const data = await res.json();
      setFacts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[user-coverage-facts]', e);
      setFacts([]);
    } finally {
      setFactsLoading(false);
    }
  };

  // Met à jour le statut d'un fait (central ou utilisateur)
  const handlePatchFact = async (factId: number, newStatus: CoverageFact['coverage_status']) => {
    setFactsPatchLoading(prev => ({ ...prev, [factId]: true }));
    try {
      const endpoint = factsIsUser
        ? `${import.meta.env.VITE_API_URL || ''}/api/cg/user-coverage-fact/${factId}`
        : `${import.meta.env.VITE_API_URL || ''}/api/cg/coverage-fact/${factId}`;
      const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({ coverage_status: newStatus })
        }
      );
      if (res.ok) {
        setFacts(prev => prev.map(f => f.id === factId ? { ...f, coverage_status: newStatus } : f));
      }
    } catch (e) {
      console.error('[coverage-fact PATCH]', e);
    } finally {
      setFactsPatchLoading(prev => ({ ...prev, [factId]: false }));
    }
  };

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

  const handleOpenEdit = (entry: CentralCgEntry) => {
    const meta = (entry as any).metadata || {};
    setEditingEntry(entry);
    setEditFormulas(Array.isArray(meta.indexedFormulas) ? [...meta.indexedFormulas] : []);
    // Normalize indexedOptions: must be Record<string, string[]>, never a flat array
    const rawOpts = meta.indexedOptions;
    let normalizedOpts: Record<string, string[]> = {};
    if (rawOpts && typeof rawOpts === 'object' && !Array.isArray(rawOpts)) {
      normalizedOpts = Object.fromEntries(
        Object.entries(rawOpts).map(([k, v]) => [k, Array.isArray(v) ? v : [String(v)]])
      );
    }
    setEditOptions(normalizedOpts);
    setNewFormulaInput('');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    setIsSavingEdit(true);
    try {
      await storageService.updateCgMetadata(editingEntry.id, {
        indexedFormulas: editFormulas,
        indexedOptions: editOptions,
      });
      // Recharger le repo pour refléter les changements
      const data = await storageService.getCentralCgRepo();
      setRepo(data || []);
      setEditingEntry(null);
    } catch (error: any) {
      alert(`Erreur lors de la sauvegarde: ${error.message || 'Erreur inconnue'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Charge la liste de tous les CG utilisateurs (vue admin)
  const loadUserCgs = async () => {
    setUserCgLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/cg/admin/user-cgs`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }
      );
      const data = await res.json();
      setUserCgList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[admin/user-cgs]', e);
      setUserCgList([]);
    } finally {
      setUserCgLoading(false);
    }
  };

  // Supprime un CG utilisateur
  const handleDeleteUserCg = async (id: number, filename: string) => {
    if (!confirm(`Supprimer le CG "${filename}" ? Cette action est irréversible.`)) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/cg/admin/user-cg/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      setUserCgList(prev => prev.filter(u => u.id !== id));
    } catch (e: any) {
      alert(`Erreur lors de la suppression : ${e.message}`);
    }
  };

  // Promeut un CG utilisateur en CG centrale (partagée avec tous)
  const handlePromoteToCentral = async (entry: UserCgEntry) => {
    if (!confirm(
      `Partager "${entry.target_filename}" comme CG de référence centrale ?\n\n` +
      `Ce document sera vectorisé et rendu visible pour tous les utilisateurs.\n` +
      `L'opération peut prendre quelques minutes.`
    )) return;
    setPromotingCgId(entry.id);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/cg/user/promote-to-central/${entry.id}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      alert(`✅ CG partagé avec succès !\nL'identifiant central est #${data.central_cg_id}.\nLa vectorisation est en cours en arrière-plan.`);
    } catch (e: any) {
      alert(`Erreur lors du partage : ${e.message}`);
    } finally {
      setPromotingCgId(null);
    }
  };

  const filteredRepo = (repo || []).filter(e => {
    if (!e) return false;
    const provider = e.insurer?.toLowerCase() || '';
    const productName = e.productName?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return provider.includes(search) || productName.includes(search);
  });

  const filteredUserCgList = (userCgList || []).filter(e => {
    if (!e) return false;
    const u = `${e.first_name || ''} ${e.last_name || ''} ${e.user_email || ''}`.toLowerCase();
    const ins = `${e.insurer_label || ''} ${e.insurance_type_label || ''}`.toLowerCase();
    const s = userCgSearchTerm.toLowerCase();
    return u.includes(s) || ins.includes(s);
  });

  return (
    <>
    <div className="max-w-full mx-auto space-y-8 animate-fadeIn pb-20 px-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
            <Database className="w-8 h-8 text-primary-600" />
            Gestionnaire de Connaissances
          </h2>
          <p className="text-slate-500 font-medium mt-1">Base vectorisée pour l'IA de BienCouvert</p>
        </div>
        
        {activeTab === 'central' && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-xl shadow-primary-900/10 transition-all"
          >
            {showAddForm ? 'Annuler' : <><Plus className="w-4 h-4" /> Indexer un nouveau document</>}
          </button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('central')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'central'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Database className="w-3.5 h-3.5" /> Contrats généraux
        </button>
        <button
          onClick={() => { setActiveTab('userCg'); loadUserCgs(); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'userCg'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> CG Utilisateurs
        </button>
        <button
          onClick={() => setActiveTab('controlCheck')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'controlCheck'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" /> Non-régression
        </button>
        <button
          onClick={() => setActiveTab('ingestion')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            activeTab === 'ingestion'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" /> Ingestion auto
        </button>
      </div>

      {activeTab === 'central' && (<>
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
          <table className="w-full text-left" style={{ minWidth: '1000px' }}>
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                <th className="px-4 py-4">ID</th>
                <th className="px-6 py-4">Assureur</th>
                <th className="px-6 py-4">Type d'assurance</th>
                <th className="px-6 py-4">Sous-type</th>
                <th className="px-6 py-4">Formules</th>
                <th className="px-6 py-4">URL</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-center">Actions</th>
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
                  {/* Formules indexées */}
                  <td className="px-6 py-4 max-w-[200px]">
                    {(() => {
                      const raw = (entry as any).metadata?.indexedFormulas;
                      const formulas: string[] = Array.isArray(raw) ? raw : [];
                      return formulas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {formulas.slice(0, 3).map(f => (
                            <span key={f} className="px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-100 rounded-lg text-[9px] font-bold whitespace-nowrap">{f}</span>
                          ))}
                          {formulas.length > 3 && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-bold">+{formulas.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[9px]">—</span>
                      );
                    })()}
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
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => loadCoverageFacts(
                          entry.id,
                          `${(entry as any).insurer || entry.insurerCode} · ${(entry as any).productName || entry.insuranceTypeCode}`
                        )}
                        className="p-2 text-slate-300 hover:text-emerald-600 transition-colors"
                        title="Voir / corriger les faits de couverture"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(entry)}
                        className="p-2 text-slate-300 hover:text-primary-600 transition-colors"
                        title="Éditer les formules / options"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {/* ===================================================================
          ONGLET : CG Utilisateurs
      =================================================================== */}
      {activeTab === 'userCg' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50">
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par utilisateur, assureur, type..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                value={userCgSearchTerm}
                onChange={e => setUserCgSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {filteredUserCgList.length} CG utilisateur(s)
              </div>
              <button
                onClick={loadUserCgs}
                disabled={userCgLoading}
                className="p-2 text-slate-400 hover:text-primary-600 transition-colors disabled:opacity-50"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${userCgLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {userCgLoading ? (
            <div className="flex items-center justify-center h-40 gap-3">
              <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
              <span className="text-sm text-slate-400 font-medium">Chargement…</span>
            </div>
          ) : filteredUserCgList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Users className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-400 font-medium">Aucun CG utilisateur trouvé.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                    <th className="px-5 py-4">Utilisateur</th>
                    <th className="px-5 py-4">Assureur / Type</th>
                    <th className="px-5 py-4">Fichier</th>
                    <th className="px-5 py-4">Date upload</th>
                    <th className="px-5 py-4">Statut</th>
                    <th className="px-5 py-4 text-center">Pages / Faits</th>
                    <th className="px-5 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUserCgList.map(entry => {
                    const initials = `${entry.first_name?.[0] || ''}${entry.last_name?.[0] || ''}`.toUpperCase() || entry.user_email[0].toUpperCase();
                    const fullName = [entry.first_name, entry.last_name].filter(Boolean).join(' ') || '—';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-black shrink-0">
                              {initials}
                            </div>
                            <div>
                              <div className="font-black text-slate-900 text-sm">{fullName}</div>
                              <div className="text-[10px] text-slate-400">{entry.user_email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800 text-xs block">{entry.insurer_label}</span>
                            <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-lg uppercase inline-block">
                              {entry.insurance_type_label}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 max-w-[200px]">
                          <span className="text-xs text-slate-700 font-medium truncate block" title={entry.target_filename}>
                            {entry.target_filename}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-slate-600">
                            {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {entry.vectorized_at ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold text-emerald-700">Vectorisé</span>
                              </div>
                              <span className="text-[9px] text-slate-400">
                                {new Date(entry.vectorized_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-slate-300" />
                              <span className="text-[9px] text-slate-400">Non vectorisé</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs font-bold text-slate-500">{entry.pages_count}p</span>
                            <span className="text-slate-300 text-xs">·</span>
                            <span className="text-xs font-bold text-emerald-600">{entry.facts_count}f</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => loadUserCoverageFacts(
                                entry.id,
                                `${entry.insurer_label} · ${entry.insurance_type_label} (${fullName})`
                              )}
                              className="p-2 text-slate-300 hover:text-emerald-600 transition-colors"
                              title="Voir les faits de couverture"
                            >
                              <BarChart2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePromoteToCentral(entry)}
                              disabled={promotingCgId === entry.id}
                              className="p-2 text-slate-300 hover:text-blue-600 transition-colors disabled:opacity-40"
                              title="Promouvoir en CG centrale (partager avec tous les utilisateurs)"
                            >
                              {promotingCgId === entry.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Share2 className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteUserCg(entry.id, entry.target_filename)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>

      {/* =====================================================================
          MODAL : Édition des formules / options d'un document CG
      ===================================================================== */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-8"
          onClick={() => setEditingEntry(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Tag className="w-6 h-6 text-primary-600" />
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {(editingEntry as any).insurer || editingEntry.insurerCode}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {(editingEntry as any).insuranceTypeLabel || editingEntry.insuranceTypeCode}
                    {((editingEntry as any).productName) ? ` · ${(editingEntry as any).productName}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditingEntry(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

              {/* --- Formules --- */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Tag className="w-3 h-3" /> Formules indexées
                </p>
                <div className="flex flex-wrap gap-2 min-h-[2rem]">
                  {editFormulas.map((f, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-xl text-xs font-bold group"
                    >
                      {f}
                      <button
                        onClick={() => setEditFormulas(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-primary-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {editFormulas.length === 0 && (
                    <span className="text-slate-300 text-xs italic">Aucune formule — ajoutez-en ci-dessous</span>
                  )}
                </div>

                {/* Ajouter une formule */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nouvelle formule (ex : Confort, Tiers+…)"
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500 font-medium"
                    value={newFormulaInput}
                    onChange={e => setNewFormulaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newFormulaInput.trim()) {
                        const v = newFormulaInput.trim();
                        if (!editFormulas.includes(v)) setEditFormulas(prev => [...prev, v]);
                        setNewFormulaInput('');
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const v = newFormulaInput.trim();
                      if (v && !editFormulas.includes(v)) setEditFormulas(prev => [...prev, v]);
                      setNewFormulaInput('');
                    }}
                    className="px-4 py-2.5 bg-primary-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-700 transition-colors"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {/* --- Options (lecture seule ou édition par catégorie) --- */}
              {Object.keys(editOptions).length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Options indexées</p>
                  {Object.entries(editOptions).map(([category, opts]) => (
                    <div key={category} className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase text-slate-400 ml-1">{category}</p>
                      <div className="flex flex-wrap gap-2">
                        {(opts as string[]).map((opt, oi) => (
                          <span
                            key={oi}
                            className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold"
                          >
                            {opt}
                            <button
                              onClick={() => {
                                const updated = (opts as string[]).filter((_, idx) => idx !== oi);
                                setEditOptions(prev => ({ ...prev, [category]: updated }));
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pied de modal */}
            <div className="flex gap-3 px-8 py-6 border-t border-slate-100">
              <button
                onClick={() => setEditingEntry(null)}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex-1 py-3 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 shadow-lg shadow-primary-900/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {isSavingEdit ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL : Faits de couverture (coverage_facts) — visualisation + correction
      ===================================================================== */}
      {factsDocId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-8"
          onClick={() => setFactsDocId(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <BarChart2 className="w-6 h-6 text-emerald-600" />
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Faits de couverture</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{factsDocLabel}</p>
                </div>
              </div>
              <button onClick={() => setFactsDocId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-auto px-8 py-6">
              {factsLoading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-sm text-slate-400 font-medium">Chargement des faits…</p>
                </div>
              ) : facts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <AlertCircle className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-400 font-medium">Aucun fait de couverture extrait pour ce document.</p>
                  <p className="text-xs text-slate-300">Lancez une vectorisation complète pour générer les données.</p>
                </div>
              ) : (() => {
                // Construire la matrice guarantee × formula
                const guaranteeMap = new Map<string, { key: string; label: string }>();
                const formulaMap = new Map<string, { key: string; label: string }>();
                facts.forEach(f => {
                  if (!guaranteeMap.has(f.guarantee_key)) guaranteeMap.set(f.guarantee_key, { key: f.guarantee_key, label: f.guarantee_label });
                  if (!formulaMap.has(f.formula_key)) formulaMap.set(f.formula_key, { key: f.formula_key, label: f.formula_label });
                });
                const guarantees = Array.from(guaranteeMap.values());
                const formulas = Array.from(formulaMap.values());
                const factsByCell = new Map<string, CoverageFact>();
                facts.forEach(f => factsByCell.set(`${f.guarantee_key}|${f.formula_key}`, f));

                const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
                  included: { label: 'Inclus', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
                  optional: { label: 'Option', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
                  excluded: { label: 'Exclu', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
                  not_applicable: { label: 'N/A', bg: 'bg-slate-50', text: 'text-slate-400', dot: 'bg-slate-300' },
                };

                return (
                  <div className="overflow-x-auto">
                    <p className="text-xs text-slate-400 mb-4 font-medium">{facts.length} faits · {guarantees.length} garanties · {formulas.length} formules</p>
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 bg-slate-50 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest rounded-tl-xl sticky left-0 z-10 min-w-[180px]">Garantie</th>
                          {formulas.map(f => (
                            <th key={f.key} className="px-3 py-2 bg-slate-50 text-center text-[10px] font-bold text-slate-600 max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis">
                              {f.label || f.key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {guarantees.map((g, gi) => (
                          <tr key={g.key} className={gi % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2 font-semibold text-slate-700 sticky left-0 z-10 bg-inherit border-b border-slate-100 text-[11px] leading-tight">
                              {g.label || g.key}
                            </td>
                            {formulas.map(f => {
                              const fact = factsByCell.get(`${g.key}|${f.key}`);
                              if (!fact) return (
                                <td key={f.key} className="px-2 py-1 text-center border-b border-slate-100">
                                  <span className="text-slate-200 text-[10px]">—</span>
                                </td>
                              );
                              const sc = statusConfig[fact.coverage_status] ?? statusConfig.not_applicable;
                              const isPatching = factsPatchLoading[fact.id];
                              return (
                                <td key={f.key} className="px-2 py-1 text-center border-b border-slate-100">
                                  <div className="relative inline-block">
                                    {isPatching ? (
                                      <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin mx-auto" />
                                    ) : (
                                      <select
                                        value={fact.coverage_status}
                                        onChange={e => handlePatchFact(fact.id, e.target.value as CoverageFact['coverage_status'])}
                                        title={fact.coverage_amount ? `Montant: ${fact.coverage_amount}` : undefined}
                                        className={`appearance-none text-[10px] font-bold px-2 py-1 pr-5 rounded-lg border-0 cursor-pointer outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-400 ${sc.bg} ${sc.text}`}
                                      >
                                        <option value="included">✅ Inclus</option>
                                        <option value="optional">🟡 Option</option>
                                        <option value="excluded">❌ Exclu</option>
                                        <option value="not_applicable">⬜ N/A</option>
                                      </select>
                                    )}
                                    {fact.coverage_amount && !isPatching && (
                                      <span className="block text-[9px] text-slate-400 truncate max-w-[100px] mx-auto mt-0.5">
                                        {fact.coverage_amount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Pied */}
            <div className="px-8 py-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setFactsDocId(null)}
                className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          ONGLET : Non-régression
      =================================================================== */}
      {activeTab === 'controlCheck' && (
        <ControlCheckPage />
      )}

      {activeTab === 'ingestion' && (
        <IngestionPanel />
      )}
    </>
  );
};

// =============================================================================
// IngestionPanel — Widget d'ingestion automatique de CG
// =============================================================================
const API = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

interface InsurerScope { code: string; label: string; fullName: string; websiteUrl: string; cgSearchEnabled: boolean; cgSearchPatterns: any; }
interface TypeScope    { code: string; labelFr: string; }
interface RunHistory   { run_id: string; started_at: string; last_updated: string; total: number; done: number; skipped: number; errors: number; in_progress: number; insurers: string[]; types: string[]; }
interface JobDetail    { id: number; insurer_code: string; insurance_type_code: string; source_url: string | null; status: string; confidence: number | null; error_message: string | null; central_cg_id: number | null; pages_count: number | null; }

const STATUS_COLORS: Record<string, string> = {
  done:        'text-emerald-700 bg-emerald-50 border-emerald-200',
  skipped:     'text-amber-600   bg-amber-50   border-amber-200',
  error:       'text-red-600     bg-red-50     border-red-200',
  vectorizing: 'text-blue-700   bg-blue-50    border-blue-200',
  classifying: 'text-violet-700 bg-violet-50  border-violet-200',
  fetching:    'text-sky-700    bg-sky-50     border-sky-200',
  pending:     'text-slate-500  bg-slate-50   border-slate-200',
};

function IngestionPanel() {
  const [scope, setScope]             = useState<{ insurers: InsurerScope[]; insurance_types: TypeScope[] } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [selInsurers, setSelInsurers] = useState<string[]>([]);
  const [selTypes, setSelTypes]       = useState<string[]>([]);
  const [maxDocs, setMaxDocs]         = useState(2);
  const [confThreshold, setConf]      = useState(0.70);
  const [running, setRunning]         = useState(false);
  const [statusMsg, setStatusMsg]     = useState<string | null>(null);
  const [history, setHistory]         = useState<RunHistory[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [jobDetails, setJobDetails]   = useState<Record<string, JobDetail[]>>({});
  const [editPatterns, setEditPatterns] = useState<{ insurer: InsurerScope | null; open: boolean }>({ insurer: null, open: false });
  const [patternDraft, setPatternDraft] = useState<{ cgPageUrls: string; pdfPatterns: string; excludePatterns: string; enabled: boolean }>({ cgPageUrls: '', pdfPatterns: '', excludePatterns: '', enabled: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` };

  const loadScope = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/cg-ingestion/scope`, { headers });
      const data = await res.json();
      if (res.ok && data.insurers && data.insurance_types) {
        setScope(data);
      } else {
        console.error('[IngestionPanel] scope error:', data?.error ?? data);
      }
    } catch { /* silencieux */ }
    setLoading(false);
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`${API}/api/admin/cg-ingestion/history?limit=20`, { headers });
      const data = await res.json();
      if (Array.isArray(data)) setHistory(data);
    } catch { /* silencieux */ }
  };

  const pollStatus = async () => {
    try {
      const res = await fetch(`${API}/api/admin/cg-ingestion/status`, { headers });
      const data = await res.json();
      if (!data.running) {
        setRunning(false);
        setStatusMsg('Pipeline terminé ✅');
        if (pollRef.current) clearInterval(pollRef.current);
        loadHistory();
      } else {
        const counts = (data.counts as any[]) ?? [];
        const done  = counts.find(c => c.status === 'done')?.count ?? 0;
        const total = counts.reduce((s: number, c: any) => s + Number(c.count), 0);
        setStatusMsg(`En cours… ${done}/${total} jobs`);
      }
    } catch { /* silencieux */ }
  };

  useEffect(() => {
    loadScope();
    loadHistory();
    // Vérifier si un run est déjà en cours
    fetch(`${API}/api/admin/cg-ingestion/status`, { headers })
      .then(r => r.json())
      .then(d => { if (d.running) { setRunning(true); pollRef.current = setInterval(pollStatus, 5000); } })
      .catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleRun = async () => {
    if (!selInsurers.length || !selTypes.length) { alert('Sélectionnez au moins un assureur et un type d\'assurance'); return; }
    const csrf = await fetchCsrfToken();
    const res = await fetch(`${API}/api/admin/cg-ingestion/run`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ scope: 'targeted', insurers: selInsurers, insurance_types: selTypes, max_docs_per_combo: maxDocs, confidence_threshold: confThreshold }),
    });
    if (res.ok) {
      setRunning(true);
      setStatusMsg('Démarrage…');
      pollRef.current = setInterval(pollStatus, 5000);
    } else {
      const err = await res.json().catch(() => ({ message: `Erreur HTTP ${res.status}` }));
      alert(err.message ?? 'Erreur démarrage');
    }
  };

  const handleStop = async () => {
    const csrf = await fetchCsrfToken();
    await fetch(`${API}/api/admin/cg-ingestion/stop`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    });
    setStatusMsg('Arrêt demandé…');
  };

  const loadJobDetails = async (runId: string) => {
    if (jobDetails[runId]) { setExpandedRun(expandedRun === runId ? null : runId); return; }
    const res = await fetch(`${API}/api/admin/cg-ingestion/jobs/${runId}`, { headers });
    const data = await res.json();
    setJobDetails(prev => ({ ...prev, [runId]: data }));
    setExpandedRun(runId);
  };

  const openEditPatterns = (ins: InsurerScope) => {
    const p = ins.cgSearchPatterns ?? {};
    setPatternDraft({
      enabled: ins.cgSearchEnabled ?? false,
      cgPageUrls:     (p.cg_page_urls ?? []).join('\n'),
      pdfPatterns:    (p.pdf_url_patterns ?? []).join('\n'),
      excludePatterns:(p.exclude_patterns ?? []).join('\n'),
    });
    setEditPatterns({ insurer: ins, open: true });
  };

  const savePatterns = async () => {
    if (!editPatterns.insurer) return;
    const payload = {
      insurer_code: editPatterns.insurer.code,
      cg_search_enabled: patternDraft.enabled,
      cg_search_patterns: {
        cg_page_urls:     patternDraft.cgPageUrls.split('\n').map(s => s.trim()).filter(Boolean),
        pdf_url_patterns: patternDraft.pdfPatterns.split('\n').map(s => s.trim()).filter(Boolean),
        exclude_patterns: patternDraft.excludePatterns.split('\n').map(s => s.trim()).filter(Boolean),
      },
    };
    const csrf = await fetchCsrfToken();
    await fetch(`${API}/api/admin/cg-ingestion/insurer-patterns`, {
      method: 'PUT',
      credentials: 'include',
      headers: { ...headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify(payload),
    });
    await loadScope();
    setEditPatterns({ insurer: null, open: false });
  };

  const toggle = (arr: string[], val: string, set: (a: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-violet-600" /> Ingestion automatique de CG
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Découverte, classification et vectorisation automatiques via agents IA</p>
        </div>
        <button onClick={loadScope} className="p-2 text-slate-400 hover:text-violet-600 transition-colors" title="Actualiser"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading && <div className="flex items-center gap-3 p-4"><Loader2 className="w-5 h-5 animate-spin text-violet-600" /><span className="text-sm text-slate-500">Chargement du périmètre…</span></div>}

      {scope && (
        <>
          {/* ── Sélection périmètre ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">1. Sélection des assureurs</p>
            <div className="flex flex-wrap gap-2">
              {scope.insurers.map(ins => (
                <button
                  key={ins.code}
                  onClick={() => toggle(selInsurers, ins.code, setSelInsurers)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selInsurers.includes(ins.code)
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                  }`}
                >
                  {ins.label}
                  {ins.cgSearchEnabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Patterns configurés" />}
                  <button
                    onClick={e => { e.stopPropagation(); openEditPatterns(ins); }}
                    className="ml-1 opacity-60 hover:opacity-100"
                    title="Configurer les patterns de crawl"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>

            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. Types d'assurance</p>
            <div className="flex flex-wrap gap-2">
              {scope.insurance_types.map(t => (
                <button
                  key={t.code}
                  onClick={() => toggle(selTypes, t.code, setSelTypes)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selTypes.includes(t.code)
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                  }`}
                >
                  {t.labelFr}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Docs max / combo</label>
                <input type="number" min={1} max={10} value={maxDocs}
                  onChange={e => setMaxDocs(Number(e.target.value))}
                  className="w-16 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Confiance min</label>
                <input type="number" min={0} max={1} step={0.05} value={confThreshold}
                  onChange={e => setConf(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-center outline-none"
                />
              </div>
              <div className="flex gap-2 ml-auto">
                {running ? (
                  <button onClick={handleStop}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all">
                    <X className="w-3.5 h-3.5" /> Arrêter
                  </button>
                ) : (
                  <button onClick={handleRun}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-700 shadow-lg shadow-violet-900/15 transition-all disabled:opacity-50"
                    disabled={!selInsurers.length || !selTypes.length}>
                    <Wand2 className="w-3.5 h-3.5" /> Lancer l'ingestion
                  </button>
                )}
              </div>
            </div>

            {(running || statusMsg) && (
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                running ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                {running ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
                <span className="text-xs font-bold">{statusMsg}</span>
              </div>
            )}
          </div>

          {/* ── Historique des runs ── */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Historique des runs</p>
                <button onClick={loadHistory} className="text-slate-400 hover:text-slate-600"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
              <div className="divide-y divide-slate-100">
                {history.map(run => (
                  <div key={run.run_id}>
                    <button
                      onClick={() => loadJobDetails(run.run_id)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-slate-400 truncate">{run.run_id}</p>
                        <p className="text-[10px] text-slate-400">{new Date(run.started_at).toLocaleString('fr-FR')} · {run.insurers?.join(', ')}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">{run.done} ✅</span>
                        {run.errors > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200">{run.errors} ❌</span>}
                        {run.skipped > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">{run.skipped} ⏭</span>}
                        {run.in_progress > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">{run.in_progress} ⏳</span>}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandedRun === run.run_id ? 'rotate-180' : ''}`} />
                    </button>

                    {expandedRun === run.run_id && jobDetails[run.run_id] && (
                      <div className="px-5 pb-3 space-y-1.5">
                        {jobDetails[run.run_id].map(job => (
                          <div key={job.id} className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs ${STATUS_COLORS[job.status] ?? STATUS_COLORS.pending}`}>
                            <span className="font-bold shrink-0">[{job.insurer_code}/{job.insurance_type_code}]</span>
                            <span className={`px-2 py-0.5 rounded-lg font-bold text-[10px] border ${STATUS_COLORS[job.status] ?? STATUS_COLORS.pending}`}>{job.status}</span>
                            {job.confidence !== null && <span className="text-[10px] opacity-70">{(job.confidence * 100).toFixed(0)}%</span>}
                            {job.pages_count && <span className="text-[10px] opacity-70">{job.pages_count} pages</span>}
                            <span className="text-[10px] truncate opacity-60">{job.source_url ?? '—'}</span>
                            {job.error_message && <span className="text-[10px] text-red-500 truncate ml-auto" title={job.error_message}>⚠ {job.error_message.slice(0, 60)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal config patterns ── */}
      {editPatterns.open && editPatterns.insurer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setEditPatterns({ insurer: null, open: false })}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-black text-slate-900">Patterns — {editPatterns.insurer.label}</h4>
              <button onClick={() => setEditPatterns({ insurer: null, open: false })} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setPatternDraft(p => ({ ...p, enabled: !p.enabled }))}
                className={`w-10 h-5 rounded-full transition-colors ${patternDraft.enabled ? 'bg-violet-600' : 'bg-slate-200'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${patternDraft.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-bold text-slate-700">Activer l'ingestion auto pour cet assureur</span>
            </label>

            {[['Pages CG ou PDFs directs (une URL par ligne)', 'cgPageUrls'], ['Patterns URL PDF à inclure', 'pdfPatterns'], ['Patterns URL à exclure', 'excludePatterns']].map(([label, key]) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">{label}</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-violet-400"
                  value={(patternDraft as any)[key]}
                  onChange={e => setPatternDraft(p => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={() => setEditPatterns({ insurer: null, open: false })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs uppercase">Annuler</button>
              <button onClick={savePatterns} className="flex-1 py-3 bg-violet-600 text-white rounded-2xl font-bold text-xs uppercase shadow-lg">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
