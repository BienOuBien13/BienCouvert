import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, RefreshCw, Search, CheckCircle, AlertTriangle,
  XCircle, HelpCircle, Eye, Play, Plus, Trash2, Pencil,
  ExternalLink, Loader2, Wifi, WifiOff, X
} from 'lucide-react';
import { fetchCsrfToken } from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixCell {
  id:                   number;
  insurer_code:         string;
  insurer_label:        string;
  insurance_type_code:  string;
  insurance_type_label: string;
  doc_type:             string;
  matrix_status:        string;
  central_cg_id:        number | null;
  current_url:          string | null;
  indexed_at:           string | null;
  last_checked_at:      string | null;
}

interface MatrixStats {
  total: number; indexed: number; missing: number; outdated: number;
  discovered: number; error: number; unknown: number; coverage_percent: number;
}

interface MatrixResult {
  cells:            MatrixCell[];
  stats:            MatrixStats;
  insurers:         { code: string; label: string }[];
  insurance_types:  { code: string; label: string }[];
}

interface ScopeInsurer  { code: string; label: string; fullName: string; websiteUrl: string; }
interface ScopeType     { code: string; labelFr: string; }

type EntryStep = 'pending' | 'searching' | 'fetching' | 'classifying' | 'vectorizing' | 'done' | 'error';

interface EntryJobStatus {
  catalogue_id:         number;
  insurer_code:         string;
  insurer_label:        string;
  insurance_type_code:  string;
  type_label:           string;
  doc_type:             string;
  step:                 EntryStep;
  message:              string;
  started_at:           string;
  completed_at?:        string;
  found_url?:           string;
  central_cg_id?:       number;
  pages_count?:         number;
}

interface CatalogueJob {
  job_id:     string;
  started_at: string;
  total:      number;
  done:       number;
  errors:     number;
  statuses:   EntryJobStatus[];
  completed:  boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API   = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

const DOC_TYPES = ['CG', 'IPID', 'notice', 'tableau_garanties'];
const DOC_TYPE_LABELS: Record<string, string> = {
  CG: 'CG', IPID: 'IPID', notice: 'Notice', tableau_garanties: 'Tableau garanties',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  indexed:    { label: 'Indexé',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',  icon: <CheckCircle className="w-3 h-3" /> },
  missing:    { label: 'Manquant',  color: 'text-red-600',     bg: 'bg-red-50 border-red-200',          icon: <XCircle className="w-3 h-3" /> },
  outdated:   { label: 'Obsolète',  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',      icon: <AlertTriangle className="w-3 h-3" /> },
  discovered: { label: 'Découvert', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',        icon: <Eye className="w-3 h-3" /> },
  error:      { label: 'Erreur',    color: 'text-red-700',     bg: 'bg-red-100 border-red-300',         icon: <XCircle className="w-3 h-3" /> },
  unknown:    { label: 'Inconnu',   color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200',      icon: <HelpCircle className="w-3 h-3" /> },
};

const STEP_CONFIG: Record<string, { label: string; color: string; spin?: boolean }> = {
  pending:     { label: 'En attente',  color: 'text-slate-500' },
  searching:   { label: 'Recherche…',  color: 'text-blue-600',   spin: true },
  fetching:    { label: 'Télécharg…',  color: 'text-sky-600',    spin: true },
  classifying: { label: 'Classif…',    color: 'text-violet-600', spin: true },
  vectorizing: { label: 'Vectoris…',   color: 'text-indigo-600', spin: true },
  done:        { label: 'Terminé',     color: 'text-emerald-700' },
  error:       { label: 'Erreur',      color: 'text-red-600' },
  cancelled:   { label: 'Annulé',      color: 'text-amber-600' },
};

// ─── Petits composants ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center shadow-sm">
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{label}</p>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CataloguePanel() {

  const [data,            setData]            = useState<MatrixResult | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [scope,           setScope]           = useState<{ insurers: ScopeInsurer[]; insurance_types: ScopeType[] } | null>(null);
  const [watchdogRunning, setWatchdogRunning] = useState<boolean | null>(null);
  const [filterInsurer,   setFilterInsurer]   = useState('');
  const [filterType,      setFilterType]      = useState('');
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterSearch,    setFilterSearch]    = useState('');
  const [selected,        setSelected]        = useState<Set<number>>(new Set());
  const [activeJobId,     setActiveJobId]     = useState<string | null>(null);
  const [jobData,         setJobData]         = useState<CatalogueJob | null>(null);
  const [ingestDelay,     setIngestDelay]     = useState<number>(3000);  // délai séquenceur ms
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editUrl,         setEditUrl]         = useState<{ id: number; value: string } | null>(null);
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [addForm,         setAddForm]         = useState({ insurer_code: '', insurance_type_code: '', doc_type: 'CG', url: '' });
  const [addLoading,      setAddLoading]      = useState(false);
  const [flash,           setFlash]           = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [stopping,        setStopping]        = useState(false);
  const [cancellingEntry, setCancellingEntry] = useState<number | null>(null); // catalogue_id en cours d'annulation

  const hdrs = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` };

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterInsurer) params.set('insurer_code',        filterInsurer);
      if (filterType)    params.set('insurance_type_code', filterType);
      if (filterStatus)  params.set('matrix_status',       filterStatus);
      const qs  = params.toString() ? `?${params}` : '';
      const res = await fetch(`${API}/api/admin/catalogue/matrix${qs}`, { headers: hdrs });
      if (res.ok) setData(await res.json());
    } catch { /* silencieux */ }
    setLoading(false);
  }, [filterInsurer, filterType, filterStatus]);

  const loadScope = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/cg-ingestion/scope`, { headers: hdrs });
      if (res.ok) setScope(await res.json());
    } catch { /* silencieux */ }
  }, []);

  const loadWatchdog = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/catalogue/watchdog`, { headers: hdrs });
      if (res.ok) { const d = await res.json(); setWatchdogRunning(d.running); }
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => { loadMatrix(); loadScope(); loadWatchdog(); }, [loadMatrix, loadScope, loadWatchdog]);

  // Recharger la matrice quand le badge global signale la fin d'un job
  useEffect(() => {
    const handler = () => setTimeout(() => loadMatrix(), 500);
    window.addEventListener('ingestion:job-completed', handler);
    return () => window.removeEventListener('ingestion:job-completed', handler);
  }, [loadMatrix]);

  // Polling local (utilisé uniquement pour mettre à jour jobData dans le panneau visible ici)
  useEffect(() => {
    if (!activeJobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/admin/catalogue/job/${activeJobId}`, { headers: hdrs });
        if (res.ok) {
          const job: CatalogueJob = await res.json();
          setJobData(job);
          if (job.completed) { clearInterval(pollRef.current!); pollRef.current = null; }
        }
      } catch { /* silencieux */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeJobId, loadMatrix]);

  const showFlash = (type: 'ok' | 'err', msg: string) => {
    setFlash({ type, msg }); setTimeout(() => setFlash(null), 4000);
  };

  async function apiPost(endpoint: string, body?: object) {
    const csrf = await fetchCsrfToken();
    const res  = await fetch(`${API}/api/admin/catalogue/${endpoint}`, {
      method: 'POST', credentials: 'include',
      headers: { ...hdrs, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message ?? `Erreur ${res.status}`);
    return d;
  }

  async function apiDel(endpoint: string) {
    const csrf = await fetchCsrfToken();
    const res  = await fetch(`${API}/api/admin/catalogue/${endpoint}`, {
      method: 'DELETE', credentials: 'include',
      headers: { ...hdrs, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message ?? `Erreur ${res.status}`);
    return d;
  }

  async function apiPut(endpoint: string, body: object) {
    const csrf = await fetchCsrfToken();
    const res  = await fetch(`${API}/api/admin/catalogue/${endpoint}`, {
      method: 'PUT', credentials: 'include',
      headers: { ...hdrs, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message ?? `Erreur ${res.status}`);
    return d;
  }

  const doSmartIngest = async (ids: number[]) => {
    if (ids.length === 0) { showFlash('err', 'Aucune entrée sélectionnée'); return; }
    try {
      const d = await apiPost('smart-ingest', { catalogue_ids: ids, delay_between_entries_ms: ingestDelay });
      setActiveJobId(d.job_id); setJobData(null); setSelected(new Set());
      // Notifier le badge global (persistance cross-page)
      window.dispatchEvent(new CustomEvent('ingestion:job-launched', { detail: d.job_id }));
      showFlash('ok', `Job lancé (${ids.length} entrée${ids.length > 1 ? 's' : ''})`);
    } catch (e: any) { showFlash('err', e.message); }
  };

  const doDelete = async (id: number, label: string) => {
    if (!confirm(`Supprimer "${label}" du catalogue ?`)) return;
    try { await apiDel(`entry/${id}`); showFlash('ok', 'Entrée supprimée'); loadMatrix(); }
    catch (e: any) { showFlash('err', e.message); }
  };

  const doSaveUrl = async () => {
    if (!editUrl) return;
    try { await apiPut(`entry/${editUrl.id}/url`, { url: editUrl.value }); setEditUrl(null); showFlash('ok', 'URL mise à jour'); loadMatrix(); }
    catch (e: any) { showFlash('err', e.message); }
  };

  const doAdd = async () => {
    if (!addForm.insurer_code || !addForm.insurance_type_code || !addForm.doc_type) { showFlash('err', 'Tous les champs requis'); return; }
    setAddLoading(true);
    try {
      await apiPost('entry', addForm); showFlash('ok', 'Entrée ajoutée'); setShowAddModal(false);
      setAddForm({ insurer_code: '', insurance_type_code: '', doc_type: 'CG', url: '' }); loadMatrix();
    } catch (e: any) { showFlash('err', e.message); }
    setAddLoading(false);
  };

  const doSync  = async () => { try { const d = await apiPost('sync'); showFlash('ok', `Synchro : ${d.inserted ?? 0} nouvelle(s)`); loadMatrix(); } catch (e: any) { showFlash('err', e.message); } };
  const doWatchdog = async (action: 'start' | 'stop') => { try { await apiPost(`watchdog/${action}`); loadWatchdog(); } catch (e: any) { showFlash('err', e.message); } };

  const doStopJob = async () => {
    if (!activeJobId) return;
    setStopping(true);
    try {
      await apiPost(`job/${activeJobId}/stop`);
      showFlash('ok', 'Arrêt demandé — les entrées en attente seront annulées');
    } catch (e: any) { showFlash('err', e.message); }
    setStopping(false);
  };

  const doCancelEntry = async (catalogueId: number) => {
    if (!activeJobId) return;
    setCancellingEntry(catalogueId);
    try {
      await apiPost(`job/${activeJobId}/cancel-entry/${catalogueId}`);
    } catch (e: any) { showFlash('err', e.message); }
    setCancellingEntry(null);
  };

  const doClearUrl = async (id: number) => {
    const csrf = await fetchCsrfToken();
    const res = await fetch(`${API}/api/admin/catalogue/entry/${id}/url`, {
      method: 'DELETE', credentials: 'include',
      headers: { ...hdrs, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    });
    if (res.ok) { showFlash('ok', 'URL effacée'); loadMatrix(); }
    else { const d = await res.json(); showFlash('err', d.message ?? 'Erreur'); }
  };

  const filteredCells = (data?.cells ?? []).filter(c => {
    if (filterInsurer && c.insurer_code        !== filterInsurer) return false;
    if (filterType    && c.insurance_type_code !== filterType)    return false;
    if (filterStatus  && c.matrix_status       !== filterStatus)  return false;
    if (filterSearch) { const q = filterSearch.toLowerCase(); return c.insurer_label.toLowerCase().includes(q) || c.insurance_type_label.toLowerCase().includes(q) || (c.current_url ?? '').toLowerCase().includes(q); }
    return true;
  });

  const allVisibleSelected = filteredCells.length > 0 && filteredCells.every(c => selected.has(c.id));
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(p => { const n = new Set(p); filteredCells.forEach(c => n.delete(c.id)); return n; });
    else                    setSelected(p => { const n = new Set(p); filteredCells.forEach(c => n.add(c.id));    return n; });
  };
  const toggleOne   = (id: number) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedIds = filteredCells.filter(c => selected.has(c.id)).map(c => c.id);
  const stats       = data?.stats;

  return (
    <div className="space-y-5 animate-fadeIn">

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" /> Catalogue documentaire
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">CRUD + Ingestion intelligente (Gemini + Google Search)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
          <button onClick={doSync}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50">
            <RefreshCw className="w-3.5 h-3.5" /> Synchro
          </button>
          <button onClick={() => doWatchdog(watchdogRunning ? 'stop' : 'start')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${watchdogRunning ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
            {watchdogRunning ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            Veille {watchdogRunning ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`flex items-center gap-3 p-3 rounded-2xl border text-sm font-medium ${flash.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {flash.type === 'ok' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {flash.msg}
          <button onClick={() => setFlash(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <StatCard label="Total"      value={stats.total}      color="text-slate-900" />
          <StatCard label="Indexés"    value={stats.indexed}    color="text-emerald-700" />
          <StatCard label="Manquants"  value={stats.missing}    color="text-red-600" />
          <StatCard label="Obsolètes"  value={stats.outdated}   color="text-amber-600" />
          <StatCard label="Découverts" value={stats.discovered} color="text-blue-700" />
          <StatCard label="Erreurs"    value={stats.error}      color="text-red-700" />
          <StatCard label="Inconnus"   value={stats.unknown}    color="text-slate-500" />
          <div className="bg-white rounded-2xl border border-slate-200 p-3 text-center shadow-sm">
            <p className={`text-xl font-black ${stats.coverage_percent >= 50 ? 'text-emerald-700' : 'text-amber-600'}`}>
              {stats.coverage_percent.toFixed(0)}%
            </p>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Couverture</p>
          </div>
        </div>
      )}

      {/* ── Panneau job en cours (remonté en haut) ── */}
      {activeJobId && jobData && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-md overflow-hidden">
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {!jobData.completed
                ? <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                : <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900">
                  Ingestion — {jobData.done}/{jobData.total}
                  {jobData.errors > 0 && <span className="text-red-600 ml-1">({jobData.errors} erreur{jobData.errors > 1 ? 's' : ''})</span>}
                  {(jobData as any).cancelled > 0 && <span className="text-amber-600 ml-1">({(jobData as any).cancelled} annulé{(jobData as any).cancelled > 1 ? 's' : ''})</span>}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{activeJobId.slice(0, 20)}…</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!jobData.completed && (
                <button
                  onClick={doStopJob}
                  disabled={stopping}
                  title="Arrêter le job (les entrées en attente seront annulées)"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  Arrêter
                </button>
              )}
              <button onClick={() => { setActiveJobId(null); setJobData(null); }} title="Fermer" className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
            {jobData.statuses.map(s => {
              const sc = STEP_CONFIG[s.step] ?? STEP_CONFIG.pending;
              const isPending = s.step === 'pending';
              return (
                <div key={s.catalogue_id} className="flex items-start gap-3 px-5 py-2.5">
                  <div className="shrink-0 mt-0.5">
                    {sc.spin ? <Loader2 className={`w-3.5 h-3.5 animate-spin ${sc.color}`} />
                      : s.step === 'done'      ? <CheckCircle className={`w-3.5 h-3.5 ${sc.color}`} />
                      : s.step === 'error'     ? <XCircle     className={`w-3.5 h-3.5 ${sc.color}`} />
                      : s.step === 'cancelled' ? <XCircle     className="w-3.5 h-3.5 text-amber-500" />
                      : <div className="w-2 h-2 rounded-full bg-slate-300 mt-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800">{s.insurer_label} · {s.type_label} · {DOC_TYPE_LABELS[s.doc_type] ?? s.doc_type}</p>
                    <p className={`text-[10px] font-medium truncate ${sc.color}`}>{s.message}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 ${sc.color}`}>{sc.label}</span>
                    {isPending && !jobData.completed && (
                      <button
                        onClick={() => doCancelEntry(s.catalogue_id)}
                        disabled={cancellingEntry === s.catalogue_id}
                        title="Annuler cette entrée"
                        className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors disabled:opacity-40"
                      >
                        {cancellingEntry === s.catalogue_id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <X className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barre filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="Rechercher…"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-400"
              value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
          </div>
          <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            value={filterInsurer} onChange={e => setFilterInsurer(e.target.value)}>
            <option value="">Tous assureurs</option>
            {data?.insurers.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
          </select>
          <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tous types</option>
            {data?.insurance_types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <select className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={loadMatrix} disabled={loading} className="p-2 text-slate-400 hover:text-blue-600 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-xl border border-blue-200">
            <span className="text-xs font-black text-blue-700">
              {selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}
            </span>
            {/* Sélecteur de cadence d'ingestion */}
            <select
              value={ingestDelay}
              onChange={e => setIngestDelay(Number(e.target.value))}
              title="Délai entre deux documents (séquencement charge DB)"
              className="px-2 py-1 text-[10px] font-bold bg-white border border-blue-200 rounded-lg outline-none text-blue-700 cursor-pointer"
            >
              <option value={3000}>Rapide (3s)</option>
              <option value={10000}>Normal (10s)</option>
              <option value={20000}>Prudent (20s)</option>
            </select>
            <button onClick={() => doSmartIngest(selectedIds)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase hover:bg-blue-700 shadow-sm">
              <Search className="w-3 h-3" /> Rechercher & Indexer
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-blue-400 hover:text-blue-600 text-xs font-bold">
              Désélectionner
            </button>
          </div>
        )}
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: '860px' }}>
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="rounded cursor-pointer accent-blue-600" />
                </th>
                <th className="px-4 py-3">Assureur</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-3 py-3">Doc</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-3 py-3">Indexé le</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && filteredCells.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" /></td></tr>
              ) : filteredCells.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">Aucune entrée</td></tr>
              ) : filteredCells.map(cell => (
                <tr key={cell.id} className={`hover:bg-slate-50/60 transition-colors ${selected.has(cell.id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-3 py-2 w-8">
                    <input type="checkbox" checked={selected.has(cell.id)} onChange={() => toggleOne(cell.id)} className="rounded cursor-pointer accent-blue-600" />
                  </td>
                  <td className="px-4 py-2">
                    <p className="text-xs font-black text-slate-900">{cell.insurer_label}</p>
                    <p className="text-[9px] text-slate-400 font-mono">{cell.insurer_code}</p>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-lg">{cell.insurance_type_label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{DOC_TYPE_LABELS[cell.doc_type] ?? cell.doc_type}</span>
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={cell.matrix_status} /></td>
                  <td className="px-4 py-2 max-w-[200px]">
                    {editUrl?.id === cell.id ? (
                      <div className="flex items-center gap-1">
                        <input type="url" value={editUrl.value}
                          onChange={e => setEditUrl(ev => ev ? { ...ev, value: e.target.value } : null)}
                          onKeyDown={e => { if (e.key === 'Enter') doSaveUrl(); if (e.key === 'Escape') setEditUrl(null); }}
                          className="flex-1 px-2 py-1 text-[10px] border border-blue-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                          autoFocus placeholder="https://…" />
                        <button onClick={doSaveUrl} className="text-emerald-600 hover:text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditUrl(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : cell.current_url ? (
                      <div className="flex items-center gap-1 group/url">
                        <a href={cell.current_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 text-[10px] font-medium truncate max-w-[120px] hover:underline" title={cell.current_url}>
                          {cell.current_url.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/')}…
                        </a>
                        <button onClick={() => setEditUrl({ id: cell.id, value: cell.current_url ?? '' })}
                          className="shrink-0 text-slate-300 hover:text-blue-500 opacity-0 group-hover/url:opacity-100 transition-all" title="Modifier l'URL">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => doClearUrl(cell.id)}
                          className="shrink-0 text-slate-300 hover:text-red-500 opacity-0 group-hover/url:opacity-100 transition-all" title="Effacer l'URL (relancera la recherche auto)">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setEditUrl({ id: cell.id, value: '' })}
                        className="text-[10px] text-slate-400 hover:text-blue-600 italic flex items-center gap-1">
                        <Plus className="w-3 h-3" /> URL
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] text-slate-400">{cell.indexed_at ? new Date(cell.indexed_at).toLocaleDateString('fr-FR') : '—'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => doSmartIngest([cell.id])}
                        className="p-1.5 text-slate-300 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Rechercher & Indexer">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditUrl({ id: cell.id, value: cell.current_url ?? '' })}
                        className="p-1.5 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" title="Modifier l'URL">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {cell.current_url && (
                        <a href={cell.current_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" title="Ouvrir">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => doDelete(cell.id, `${cell.insurer_label}/${cell.doc_type}`)}
                        className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 font-bold">
          {filteredCells.length} entrée(s) · {selectedIds.length} sélectionnée(s)
        </div>
      </div>

      {/* Modal ajout */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-black text-slate-900 text-lg">Ajouter une entrée</h4>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Assureur *</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={addForm.insurer_code} onChange={e => setAddForm(f => ({ ...f, insurer_code: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {(scope?.insurers ?? data?.insurers ?? []).map((i: any) => (
                  <option key={i.code} value={i.code}>{i.label ?? i.fullName ?? i.code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Type d'assurance *</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={addForm.insurance_type_code} onChange={e => setAddForm(f => ({ ...f, insurance_type_code: e.target.value }))}>
                <option value="">Sélectionner…</option>
                {(scope?.insurance_types ?? data?.insurance_types ?? []).map((t: any) => (
                  <option key={t.code} value={t.code}>{t.labelFr ?? t.label ?? t.code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Type de document *</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={addForm.doc_type} onChange={e => setAddForm(f => ({ ...f, doc_type: e.target.value }))}>
                {DOC_TYPES.map(dt => <option key={dt} value={dt}>{DOC_TYPE_LABELS[dt]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">URL PDF (optionnelle)</label>
              <input type="url" placeholder="https://www.assureur.fr/cg.pdf"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-400"
                value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} />
              <p className="text-[10px] text-slate-400">Si fournie, l'étape de recherche sera ignorée</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase">Annuler</button>
              <button onClick={doAdd} disabled={addLoading || !addForm.insurer_code || !addForm.insurance_type_code}
                className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-blue-700">
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addLoading ? 'Ajout…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
