import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Trash2, PlusCircle, ArrowLeft, Loader2, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Upload, X, Shield
} from 'lucide-react';
import { fetchCsrfToken } from '../services/authService';
import { API_URL } from '../services/apiUrl';

const TOKEN_KEY = 'assurclair_token';

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(TOKEN_KEY);
  const isMutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase());
  let csrfToken = null;
  if (isMutating) csrfToken = await fetchCsrfToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(isMutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };
  const response = await fetch(`${API_URL}/api${endpoint}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
};

interface UserCg {
  id: number;
  insurer_code: string;
  insurer_label: string;
  insurance_type_code: string;
  insurance_type_label: string;
  target_filename: string;
  status: string;
  vectorization_status: string;
  metadata: {
    formules?: string[];
    options?: Record<string, string[]>;
    resume_court?: string;
    insurer_name?: string;
    insurance_type_name?: string;
    uploaded_at?: string;
  } | null;
  created_at: string;
  vectorized_at: string | null;
  linked_policies_count: number;
}

interface Props {
  onBack: () => void;
  onPolicyAdded?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  extracting: { label: 'Extraction…', color: 'bg-blue-100 text-blue-700' },
  embedding: { label: 'Analyse…', color: 'bg-indigo-100 text-indigo-700' },
  processing: { label: 'Vectorisation…', color: 'bg-violet-100 text-violet-700' },
  done: { label: 'Indexé', color: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Échec', color: 'bg-red-100 text-red-700' },
};

export const MyPersonalContractsPage: React.FC<Props> = ({ onBack, onPolicyAdded }) => {
  const [contracts, setContracts] = useState<UserCg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Add-to-portfolio modal state
  const [addModal, setAddModal] = useState<UserCg | null>(null);
  const [selectedFormula, setSelectedFormula] = useState('');
  const [contractName, setContractName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/cg/user/list');
      setContracts(data);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer définitivement ce document ? Cette action est irréversible.')) return;
    setDeletingId(id);
    try {
      await apiFetch(`/cg/user/${id}`, { method: 'DELETE' });
      setContracts(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const openAddModal = (cg: UserCg) => {
    setAddModal(cg);
    const formules = cg.metadata?.formules ?? [];
    setSelectedFormula(formules.length === 1 ? formules[0] : '');
    setContractName(`${cg.insurer_label} – ${cg.insurance_type_label}`);
    setAddSuccess(false);
    setAddError(null);
  };

  const handleAddToPortfolio = async () => {
    if (!addModal) return;
    setAddLoading(true);
    setAddError(null);
    try {
      await apiFetch('/policies', {
        method: 'POST',
        body: JSON.stringify({
          insurerCode: addModal.insurer_code,
          insurance_type_code: addModal.insurance_type_code,
          cg_source: 'user',
          cg_id: addModal.id,
          formula: selectedFormula || null,
          name: contractName || `${addModal.insurer_label} – ${addModal.insurance_type_label}`,
        }),
      });
      setAddSuccess(true);
      setContracts(prev =>
        prev.map(c => c.id === addModal.id ? { ...c, linked_policies_count: c.linked_policies_count + 1 } : c)
      );
      onPolicyAdded?.();
      setTimeout(() => {
        setAddModal(null);
        setAddSuccess(false);
      }, 1500);
    } catch (e: any) {
      setAddError(e.message || 'Erreur lors de l\'ajout');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mes contrats perso</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Documents que vous avez uploadés</p>
        </div>
        <button
          onClick={loadContracts}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl border border-slate-200 bg-white transition-colors"
          title="Actualiser"
        >
          <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin text-primary-500' : ''}`} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && contracts.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 mx-auto bg-slate-100 rounded-3xl flex items-center justify-center">
            <Upload className="w-8 h-8 text-slate-300" />
          </div>
          <div>
            <p className="font-bold text-slate-700">Aucun contrat uploadé</p>
            <p className="text-sm text-slate-400 mt-1">
              Importez vos conditions particulières dans "Ajouter un contrat"
            </p>
          </div>
        </div>
      )}

      {/* Contract list */}
      {!loading && contracts.length > 0 && (
        <div className="space-y-3">
          {contracts.map(cg => {
            const meta = cg.metadata ?? {};
            const formulas = meta.formules ?? [];
            const isExpanded = expandedId === cg.id;
            const statusInfo = STATUS_LABELS[cg.vectorization_status] ?? { label: cg.vectorization_status, color: 'bg-slate-100 text-slate-500' };

            return (
              <div key={cg.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-black text-slate-900 text-sm truncate">{cg.insurer_label}</p>
                          <p className="text-xs text-slate-500 font-medium">{cg.insurance_type_label}</p>
                        </div>
                        <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      {formulas.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {formulas.map(f => (
                            <span key={f} className="text-[9px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 uppercase">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-400">
                          {new Date(cg.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {cg.linked_policies_count > 0 && (
                            <span className="ml-2 text-emerald-600 font-bold">
                              · {cg.linked_policies_count} contrat{cg.linked_policies_count > 1 ? 's' : ''} lié{cg.linked_policies_count > 1 ? 's' : ''}
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : cg.id)}
                          className="text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-50 space-y-3 animate-fadeIn">
                    {meta.resume_court && (
                      <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 leading-relaxed">
                        {meta.resume_court}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 font-medium truncate">
                      📄 {cg.target_filename}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="px-5 pb-5 flex gap-2">
                  <button
                    onClick={() => openAddModal(cg)}
                    disabled={cg.vectorization_status !== 'done'}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-primary-700 active:scale-95 transition-all shadow-sm shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={cg.vectorization_status !== 'done' ? 'Attendez la fin de l\'indexation' : 'Ajouter à votre portefeuille'}
                  >
                    <PlusCircle className="w-4 h-4" />
                    Ajouter au portefeuille
                  </button>
                  <button
                    onClick={() => handleDelete(cg.id)}
                    disabled={deletingId === cg.id}
                    className="p-3 bg-white border border-red-100 text-red-500 rounded-2xl hover:bg-red-50 active:scale-95 transition-all"
                    title="Supprimer ce document"
                  >
                    {deletingId === cg.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add-to-portfolio modal */}
      {addModal && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-slideUp">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-xl text-slate-900">Ajouter au portefeuille</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{addModal.insurer_label} · {addModal.insurance_type_label}</p>
                </div>
                <button onClick={() => setAddModal(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addSuccess ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                  <p className="font-black text-emerald-700">Contrat ajouté !</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {/* Contract name */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nom du contrat</label>
                      <input
                        type="text"
                        value={contractName}
                        onChange={e => setContractName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-400 text-sm font-bold"
                        placeholder="Mon contrat auto"
                      />
                    </div>

                    {/* Formula selector */}
                    {(addModal.metadata?.formules ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Formule</label>
                        <select
                          value={selectedFormula}
                          onChange={e => setSelectedFormula(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary-400 text-sm font-bold appearance-none"
                        >
                          <option value="">— Sélectionner une formule —</option>
                          {(addModal.metadata?.formules ?? []).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {addError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {addError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setAddModal(null)}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleAddToPortfolio}
                      disabled={addLoading}
                      className="flex-[2] py-4 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary-200 transition-all active:scale-[0.98]"
                    >
                      {addLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Ajout…</>
                        : <><Shield className="w-4 h-4" /> Ajouter</>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPersonalContractsPage;
