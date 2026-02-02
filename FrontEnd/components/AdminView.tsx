
import React, { useState, useEffect } from 'react';
import { 
  Database, Plus, Trash2, Globe, FileText, CheckCircle, Search, 
  ExternalLink, AlertCircle, RefreshCw, Filter, ShieldCheck, ArrowUpRight, 
  Cpu, Sparkles, Wand2, Loader2, ListChecks
} from 'lucide-react';
import { CentralCgEntry, PolicyType } from '../types';
import { storageService } from '../services/storageService';
import { indexCgDocument } from '../services/geminiService';

export const AdminView: React.FC = () => {
  const [repo, setRepo] = useState<CentralCgEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  
  const [newEntry, setNewEntry] = useState({
    insurer: '',
    productName: '',
    type: PolicyType.AUTO,
    pdfUrl: ''
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('url');

  const [indexingResult, setIndexingResult] = useState<{
    indexedFormulas: string[];
    indexedOptions: string[];
    semanticSummary: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

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
  }, []);

  const handleStartIndexing = async () => {
    if (!newEntry.insurer || (uploadMode === 'url' && !newEntry.pdfUrl) || (uploadMode === 'file' && !pdfFile)) {
      alert('Veuillez remplir l\'assureur et fournir un PDF (URL ou fichier)');
      return;
    }
    
    // Reset complet de l'état avant indexation
    setIndexingResult(null);
    setIsIndexing(true);
    
    try {
      let pdfData = newEntry.pdfUrl;
      
      // Si mode fichier, convertir en base64
      if (uploadMode === 'file' && pdfFile) {
        const reader = new FileReader();
        pdfData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        });
        // Mettre à jour newEntry.pdfUrl avec le base64
        setNewEntry(prev => ({ ...prev, pdfUrl: pdfData }));
      }
      
      const result = await indexCgDocument(newEntry.insurer, newEntry.type, pdfData);
      
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
    if (!indexingResult) return;
    
    // Validation côté client
    if (!newEntry.insurer || !newEntry.productName || !newEntry.type || !newEntry.pdfUrl) {
      alert('Veuillez remplir tous les champs obligatoires (Assureur, Nom Contrat, Type, PDF)');
      return;
    }
    
    try {
      const entryToSave = {
        insurer: newEntry.insurer,
        productName: newEntry.productName,
        type: newEntry.type,
        pdfUrl: newEntry.pdfUrl,
        indexedFormulas: indexingResult.indexedFormulas || [],
        indexedOptions: indexingResult.indexedOptions || [],
        semanticSummary: indexingResult.semanticSummary || ''
      };
      
      console.log('📤 Envoi de l\'entrée CG:', entryToSave);
      
      await storageService.saveCgEntry(entryToSave);
      
      // Message de succès avec info sur la vectorisation
      alert('✅ Document ajouté avec succès!\n\nℹ️ La vectorisation du PDF se fait en arrière-plan et peut prendre quelques minutes. Le document sera pleinement opérationnel une fois la vectorisation terminée.');
      
      const data = await storageService.getCentralCgRepo();
      setRepo(data || []);
      setNewEntry({ insurer: '', productName: '', type: PolicyType.AUTO, pdfUrl: '' });
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

      {showAddForm && (
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-primary-100 shadow-2xl animate-scaleIn space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Assureur</label>
              <input 
                type="text" required placeholder="AXA, Maif..." 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.insurer} onChange={e => setNewEntry({...newEntry, insurer: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nom Contrat</label>
              <input 
                type="text" required placeholder="Auto Zen..." 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                value={newEntry.productName} onChange={e => setNewEntry({...newEntry, productName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type</label>
              <select 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold appearance-none"
                value={newEntry.type} onChange={e => setNewEntry({...newEntry, type: e.target.value as PolicyType})}
              >
                {Object.values(PolicyType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Mode selection: URL ou Fichier */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Source du PDF</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setUploadMode('url'); setPdfFile(null); }}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                  uploadMode === 'url'
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Globe className="w-4 h-4 inline mr-2" />
                URL en ligne
              </button>
              <button
                type="button"
                onClick={() => { setUploadMode('file'); setNewEntry({...newEntry, pdfUrl: ''}); }}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                  uploadMode === 'file'
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Charger un fichier
              </button>
            </div>

            {uploadMode === 'url' ? (
              <div className="space-y-1">
                <input 
                  type="url" required placeholder="https://exemple.com/document.pdf" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 font-bold"
                  value={newEntry.pdfUrl} onChange={e => setNewEntry({...newEntry, pdfUrl: e.target.value})}
                />
              </div>
            ) : (
              <div className="space-y-1">
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
            )}
          </div>

          {!indexingResult ? (
            <button 
              onClick={handleStartIndexing}
              disabled={isIndexing || (uploadMode === 'url' ? !newEntry.pdfUrl : !pdfFile)}
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
                <th className="px-8 py-4">Assureur</th>
                <th className="px-8 py-4">Nom</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">URL</th>
                <th className="px-8 py-4">Intelligence</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRepo.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <span className="font-black text-slate-900">{entry.insurer}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="font-bold text-slate-600">{entry.productName}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-1 rounded-lg uppercase">
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    {entry.documentUrl ? (
                      <a 
                        href={entry.documentUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs font-medium group/link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="max-w-[200px] truncate group-hover/link:underline">
                          {entry.documentUrl.replace(/^https?:\/\//, '').split('/')[0]}
                        </span>
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                       <div className="flex -space-x-1">
                          <div className={`w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black ${entry.indexedFormulas?.length ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>F</div>
                          <div className={`w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black ${entry.indexedOptions?.length ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>O</div>
                       </div>
                       <span className="text-[9px] font-bold text-slate-400 uppercase">{entry.indexedFormulas?.length + entry.indexedOptions?.length} points indexés</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button 
                      onClick={() => handleDelete(entry.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
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
