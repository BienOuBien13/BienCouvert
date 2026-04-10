/**
 * IngestionJobBadge — Indicateur flottant de progression d'ingestion catalogue
 *
 * Rendu au niveau de App.tsx : reste visible quelle que soit la page active.
 * Persistance via localStorage ('ingestion_job_id') : survit à la navigation.
 * Polling autonome toutes les 2s sur GET /api/admin/catalogue/job/:id
 *
 * Contrôles :
 *  - ⬛ Arrêter  : stoppe tout le job (entrée en cours finit, les suivantes → cancelled)
 *  - ×  (ligne) : annule une entrée individuelle avant son démarrage
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, X, ChevronDown, ChevronUp, Database, Square } from 'lucide-react';
import { fetchCsrfToken } from '../services/authService';

// ─── Types (miroir de CatalogueIngestionService) ──────────────────────────────

type EntryStep = 'pending' | 'searching' | 'fetching' | 'classifying' | 'vectorizing' | 'done' | 'error' | 'cancelled';

interface EntryJobStatus {
  catalogue_id:        number;
  insurer_label:       string;
  type_label:          string;
  doc_type:            string;
  step:                EntryStep;
  message:             string;
  pages_count?:        number;
  central_cg_id?:      number;
}

interface CatalogueJob {
  job_id:     string;
  started_at: string;
  total:      number;
  done:       number;
  errors:     number;
  cancelled:  number;
  statuses:   EntryJobStatus[];
  completed:  boolean;
  delay_ms:   number;
}

// ─── Config visuelle par étape ────────────────────────────────────────────────

const STEP_CONFIG: Record<EntryStep, { label: string; color: string; spin: boolean }> = {
  pending:     { label: 'En attente',    color: 'text-slate-400',  spin: false },
  searching:   { label: 'Recherche URL', color: 'text-blue-500',   spin: true  },
  fetching:    { label: 'Téléchargement',color: 'text-violet-500', spin: true  },
  classifying: { label: 'Classification',color: 'text-amber-500',  spin: true  },
  vectorizing: { label: 'Vectorisation', color: 'text-indigo-500', spin: true  },
  done:        { label: 'Terminé',       color: 'text-emerald-500',spin: false },
  error:       { label: 'Erreur',        color: 'text-red-500',    spin: false },
  cancelled:   { label: 'Annulé',        color: 'text-slate-400',  spin: false },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CG: 'CG', IPID: 'IPID', notice: 'Notice', tableau_garanties: 'Tableau',
};

const TERMINAL_STEPS: EntryStep[] = ['done', 'error', 'cancelled'];

// ─── Constantes localStorage ──────────────────────────────────────────────────

export const INGESTION_JOB_LS_KEY = 'ingestion_active_job_id';

const API   = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

// ─── Composant ────────────────────────────────────────────────────────────────

export default function IngestionJobBadge() {
  const [jobId,     setJobId]     = useState<string | null>(null);
  const [jobData,   setJobData]   = useState<CatalogueJob | null>(null);
  const [expanded,  setExpanded]  = useState(false);
  const [stopping,  setStopping]  = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lire job_id depuis localStorage au montage
  useEffect(() => {
    const saved = localStorage.getItem(INGESTION_JOB_LS_KEY);
    if (saved) setJobId(saved);
  }, []);

  // Écouter l'événement "nouveau job lancé" (depuis CataloguePanel)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      localStorage.setItem(INGESTION_JOB_LS_KEY, id);
      setJobId(id);
      setJobData(null);
      setStopping(false);
      setExpanded(true);
    };
    window.addEventListener('ingestion:job-launched', handler);
    return () => window.removeEventListener('ingestion:job-launched', handler);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const dismiss = useCallback(() => {
    stopPolling();
    localStorage.removeItem(INGESTION_JOB_LS_KEY);
    setJobId(null);
    setJobData(null);
    setExpanded(false);
    setStopping(false);
  }, [stopPolling]);

  // Démarrer / relancer le polling quand job_id change
  useEffect(() => {
    if (!jobId) { stopPolling(); return; }

    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/admin/catalogue/job/${jobId}`, {
          headers: { Authorization: `Bearer ${TOKEN()}` },
        });
        if (res.status === 404) { dismiss(); return; }
        if (!res.ok) return;
        const job: CatalogueJob = await res.json();
        setJobData(job);
        if (job.completed) {
          stopPolling();
          localStorage.removeItem(INGESTION_JOB_LS_KEY);
          setStopping(false);
          // Signaler au CataloguePanel qu'il peut recharger la matrice
          window.dispatchEvent(new Event('ingestion:job-completed'));
        }
      } catch { /* réseau indisponible — retry au prochain tick */ }
    };

    poll(); // appel immédiat
    pollRef.current = setInterval(poll, 2000);
    return stopPolling;
  }, [jobId, dismiss, stopPolling]);

  // ─── Arrêt total du job ────────────────────────────────────────────────────
  const handleStopJob = useCallback(async () => {
    if (!jobId || stopping) return;
    setStopping(true);
    try {
      const csrf = await fetchCsrfToken();
      await fetch(`${API}/api/admin/catalogue/job/${jobId}/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${TOKEN()}`,
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
    } catch { setStopping(false); }
  }, [jobId, stopping]);

  // ─── Annulation unitaire d'une entrée ─────────────────────────────────────
  const handleCancelEntry = useCallback(async (catalogueId: number) => {
    if (!jobId) return;
    try {
      const csrf = await fetchCsrfToken();
      await fetch(`${API}/api/admin/catalogue/job/${jobId}/cancel-entry/${catalogueId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${TOKEN()}`,
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
    } catch { /* best-effort — le polling remettra l'état à jour */ }
  }, [jobId]);

  if (!jobId || !jobData) return null;

  const progress  = jobData.total > 0 ? Math.round((jobData.done / jobData.total) * 100) : 0;
  const isRunning = !jobData.completed;
  const delayLabel = jobData.delay_ms >= 10000
    ? `${jobData.delay_ms / 1000}s/doc`
    : jobData.delay_ms >= 1000
    ? `${jobData.delay_ms / 1000}s/doc`
    : null;

  return (
    <div
      className="fixed bottom-24 right-3 z-[70] w-72 rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
      style={{ maxHeight: expanded ? '440px' : undefined }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="shrink-0">
          {isRunning
            ? <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            : jobData.errors > 0 || (jobData.cancelled ?? 0) > 0
            ? <XCircle className="w-4 h-4 text-amber-500" />
            : <CheckCircle className="w-4 h-4 text-emerald-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
            <Database className="w-3 h-3 shrink-0" />
            Ingestion catalogue
            {delayLabel && (
              <span className="ml-1 text-[9px] text-slate-400 font-normal">· {delayLabel}</span>
            )}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">
            {jobData.done}/{jobData.total}
            {(jobData.cancelled ?? 0) > 0 && ` · ${jobData.cancelled} annulé${jobData.cancelled > 1 ? 's' : ''}`}
            {jobData.errors > 0 && ` · ${jobData.errors} erreur${jobData.errors > 1 ? 's' : ''}`}
            {isRunning && !(jobData.cancelled || jobData.errors) && !stopping ? ' · en cours…' : ''}
            {stopping ? ' · arrêt en cours…' : ''}
            {!isRunning && !stopping ? ' · terminé ✓' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Bouton arrêt total — visible uniquement si en cours */}
          {isRunning && (
            <button
              onClick={e => { e.stopPropagation(); handleStopJob(); }}
              title="Arrêter tout le job"
              disabled={stopping}
              className="p-0.5 text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            : <ChevronUp   className="w-3.5 h-3.5 text-slate-400" />}
          <button
            onClick={e => { e.stopPropagation(); dismiss(); }}
            className="ml-1 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Barre de progression ── */}
      <div className="h-1 bg-slate-100">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            stopping || (jobData.cancelled ?? 0) > 0
              ? 'bg-amber-400'
              : jobData.errors > 0
              ? 'bg-red-400'
              : isRunning
              ? 'bg-blue-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Détail par entrée ── */}
      {expanded && (
        <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
          {jobData.statuses.map(s => {
            const sc          = STEP_CONFIG[s.step];
            const isTerminal  = TERMINAL_STEPS.includes(s.step);
            const isCancellable = isRunning && !isTerminal;

            return (
              <div key={s.catalogue_id} className="flex items-start gap-2.5 px-4 py-2.5">
                <div className="shrink-0 mt-0.5">
                  {sc.spin
                    ? <Loader2 className={`w-3 h-3 animate-spin ${sc.color}`} />
                    : s.step === 'done'
                    ? <CheckCircle className={`w-3 h-3 ${sc.color}`} />
                    : s.step === 'error'
                    ? <XCircle    className={`w-3 h-3 ${sc.color}`} />
                    : s.step === 'cancelled'
                    ? <XCircle    className={`w-3 h-3 ${sc.color}`} />
                    : <div className="w-2 h-2 rounded-full bg-slate-200 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-800 truncate">
                    {s.insurer_label} · {s.type_label}
                    <span className="ml-1 text-slate-400 font-normal">{DOC_TYPE_LABELS[s.doc_type] ?? s.doc_type}</span>
                  </p>
                  <p className={`text-[10px] font-medium truncate ${sc.color}`}>{s.message}</p>
                  {s.step === 'done' && s.pages_count != null && (
                    <p className="text-[9px] text-slate-400">{s.pages_count} pages vectorisées</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-slate-50 border border-slate-100 ${sc.color}`}>
                    {sc.label}
                  </span>
                  {/* Bouton annulation unitaire — visible pour les entrées non terminées */}
                  {isCancellable && (
                    <button
                      onClick={e => { e.stopPropagation(); handleCancelEntry(s.catalogue_id); }}
                      title="Annuler cette entrée"
                      className="p-0.5 text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
