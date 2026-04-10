/**
 * IngestionJobBadge — Indicateur flottant compact d'ingestion catalogue
 *
 * Reste visible sur toutes les pages. Rôle : signaler qu'un job est en cours
 * et afficher la progression globale. Le monitoring détaillé est dans
 * l'onglet Admin > Catalogue > Monitoring des jobs.
 *
 * Persistance via localStorage ('ingestion_active_job_id') : survit à la navigation.
 * Polling autonome toutes les 2s sur GET /api/admin/catalogue/job/:id
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, X, Database } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogueJob {
  job_id:    string;
  total:     number;
  done:      number;
  errors:    number;
  cancelled: number;
  completed: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

export const INGESTION_JOB_LS_KEY = 'ingestion_active_job_id';

const API   = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

// ─── Composant ────────────────────────────────────────────────────────────────

export default function IngestionJobBadge() {
  const [jobId,   setJobId]   = useState<string | null>(null);
  const [jobData, setJobData] = useState<CatalogueJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lire job_id depuis localStorage au montage
  useEffect(() => {
    const saved = localStorage.getItem(INGESTION_JOB_LS_KEY);
    if (saved) setJobId(saved);
  }, []);

  // Écouter l'événement "nouveau job lancé"
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      localStorage.setItem(INGESTION_JOB_LS_KEY, id);
      setJobId(id);
      setJobData(null);
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
  }, [stopPolling]);

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
          window.dispatchEvent(new Event('ingestion:job-completed'));
        }
      } catch { /* réseau — retry */ }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return stopPolling;
  }, [jobId, dismiss, stopPolling]);

  if (!jobId || !jobData) return null;

  const progress = jobData.total > 0 ? Math.round((jobData.done / jobData.total) * 100) : 0;
  const isRunning = !jobData.completed;
  const hasIssue = jobData.errors > 0 || (jobData.cancelled ?? 0) > 0;

  return (
    <div className="fixed bottom-24 right-3 z-[70] flex items-center gap-2 px-3 py-2 rounded-2xl shadow-lg border bg-white border-slate-200 text-xs font-bold select-none">
      {/* Icône */}
      <div className="shrink-0">
        {isRunning
          ? <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          : hasIssue
          ? <XCircle className="w-3.5 h-3.5 text-amber-500" />
          : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
      </div>

      {/* Label + barre */}
      <div className="flex flex-col gap-0.5">
        <span className="text-slate-700 flex items-center gap-1">
          <Database className="w-3 h-3 shrink-0 text-slate-400" />
          Ingestion catalogue
        </span>
        <div className="flex items-center gap-1.5">
          {/* Barre progression */}
          <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hasIssue ? 'bg-amber-400' : isRunning ? 'bg-blue-500' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-normal">
            {progress}% · {jobData.done}/{jobData.total}
            {isRunning ? ' en cours…' : ' ✓'}
          </span>
        </div>
      </div>

      {/* Fermer */}
      {!isRunning && (
        <button
          onClick={dismiss}
          className="ml-1 text-slate-300 hover:text-slate-600 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}



