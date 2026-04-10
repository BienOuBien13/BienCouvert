/**
 * IngestionMonitorPanel — Panneau de monitoring des jobs d'ingestion catalogue
 *
 * Affiche la liste des jobs récents avec :
 *  - Barre de progression globale
 *  - Tableau détaillé par entrée (statut, message, actions)
 *  - Bouton arrêt total (⬛) et annulation unitaire (×)
 *  - Polling automatique toutes les 2s tant qu'un job est actif
 *
 * Utilise les routes :
 *  GET  /api/admin/catalogue/jobs
 *  GET  /api/admin/catalogue/job/:id
 *  POST /api/admin/catalogue/job/:id/stop
 *  POST /api/admin/catalogue/job/:id/cancel-entry/:catalogue_id
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle, XCircle, Loader2, Square, X, RefreshCw,
  ChevronDown, ChevronRight, Clock, AlertTriangle,
} from 'lucide-react';
import { fetchCsrfToken } from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryStep =
  | 'pending' | 'searching' | 'fetching'
  | 'classifying' | 'vectorizing'
  | 'done' | 'error' | 'cancelled';

interface EntryJobStatus {
  catalogue_id:        number;
  insurer_label:       string;
  type_label:          string;
  doc_type:            string;
  step:                EntryStep;
  message:             string;
  started_at:          string;
  completed_at?:       string;
  found_url?:          string;
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEP_CONFIG: Record<EntryStep, { label: string; color: string; bg: string; spin: boolean }> = {
  pending:     { label: 'En attente',    color: 'text-slate-500',    bg: 'bg-slate-50 border-slate-200',    spin: false },
  searching:   { label: 'Recherche URL', color: 'text-blue-700',     bg: 'bg-blue-50 border-blue-200',      spin: true  },
  fetching:    { label: 'Téléchargement',color: 'text-violet-700',   bg: 'bg-violet-50 border-violet-200',  spin: true  },
  classifying: { label: 'Classification',color: 'text-amber-700',    bg: 'bg-amber-50 border-amber-200',    spin: true  },
  vectorizing: { label: 'Vectorisation', color: 'text-indigo-700',   bg: 'bg-indigo-50 border-indigo-200',  spin: true  },
  done:        { label: 'Terminé',       color: 'text-emerald-700',  bg: 'bg-emerald-50 border-emerald-200',spin: false },
  error:       { label: 'Erreur',        color: 'text-red-700',      bg: 'bg-red-50 border-red-200',        spin: false },
  cancelled:   { label: 'Annulé',        color: 'text-slate-400',    bg: 'bg-slate-50 border-slate-100',    spin: false },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CG: 'CG', IPID: 'IPID', notice: 'Notice', tableau_garanties: 'Tableau',
};

const TERMINAL: EntryStep[] = ['done', 'error', 'cancelled'];

const API   = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

function fmtDuration(startIso: string, endIso?: string): string {
  try {
    const ms = (endIso ? new Date(endIso) : new Date()).getTime() - new Date(startIso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m${s % 60}s`;
  } catch { return ''; }
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function IngestionMonitorPanel() {
  const [jobs,       setJobs]      = useState<CatalogueJob[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [expanded,   setExpanded]  = useState<Set<string>>(new Set());
  const [stopping,   setStopping]  = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Chargement de la liste des jobs ──────────────────────────────────────
  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/catalogue/jobs`, {
        headers: { Authorization: `Bearer ${TOKEN()}` },
      });
      if (res.ok) {
        const data: CatalogueJob[] = await res.json();
        setJobs(data);
        // Auto-expander le job le plus récent non terminé
        const activeJob = data.find(j => !j.completed);
        if (activeJob) setExpanded(prev => new Set([...prev, activeJob.job_id]));
      }
    } catch { /* réseau */ }
    finally { setLoading(false); }
  }, []);

  // ─── Polling (actif si un job en cours) ────────────────────────────────────
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const hasActive = jobs.some(j => !j.completed);
    if (pollRef.current) clearInterval(pollRef.current);
    if (hasActive) {
      pollRef.current = setInterval(() => loadJobs(true), 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobs, loadJobs]);

  // Écouter les nouveaux jobs lancés depuis CataloguePanel
  useEffect(() => {
    const handler = () => setTimeout(() => loadJobs(true), 500);
    window.addEventListener('ingestion:job-launched', handler);
    return () => window.removeEventListener('ingestion:job-launched', handler);
  }, [loadJobs]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const stopJob = useCallback(async (jobId: string) => {
    setStopping(prev => new Set([...prev, jobId]));
    try {
      const csrf = await fetchCsrfToken();
      await fetch(`${API}/api/admin/catalogue/job/${jobId}/stop`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${TOKEN()}`, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      });
      setTimeout(() => loadJobs(true), 500);
    } finally {
      setStopping(prev => { const s = new Set(prev); s.delete(jobId); return s; });
    }
  }, [loadJobs]);

  const cancelEntry = useCallback(async (jobId: string, catalogueId: number) => {
    try {
      const csrf = await fetchCsrfToken();
      await fetch(`${API}/api/admin/catalogue/job/${jobId}/cancel-entry/${catalogueId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${TOKEN()}`, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      });
    } catch { /* best-effort */ }
  }, []);

  const toggleExpand = (jobId: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(jobId) ? s.delete(jobId) : s.add(jobId);
      return s;
    });

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Chargement des jobs…</span>
      </div>
    );
  }

  if (!loading && jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <Clock className="w-10 h-10" />
        <p className="text-sm font-bold">Aucun job d'ingestion récent</p>
        <p className="text-xs">Lancez une ingestion depuis le panneau Catalogue</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── En-tête ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
          Jobs d'ingestion récents ({jobs.length})
        </h3>
        <button
          onClick={() => loadJobs()}
          title="Rafraîchir"
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Liste des jobs ── */}
      {jobs.map(job => {
        const progress  = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
        const isActive  = !job.completed;
        const isStopping = stopping.has(job.job_id);
        const isExpanded = expanded.has(job.job_id);

        // Couleurs selon l'état
        const barColor = isStopping || (job.cancelled > 0)
          ? 'bg-amber-400'
          : job.errors > 0
          ? 'bg-red-400'
          : isActive
          ? 'bg-blue-500'
          : 'bg-emerald-500';

        const borderColor = isActive
          ? 'border-blue-200 ring-1 ring-blue-100'
          : job.errors > 0
          ? 'border-red-100'
          : 'border-slate-100';

        return (
          <div
            key={job.job_id}
            className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${borderColor}`}
          >
            {/* ── Header du job ── */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
              onClick={() => toggleExpand(job.job_id)}
            >
              {/* Icône statut */}
              <div className="shrink-0">
                {isActive
                  ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  : job.errors > 0
                  ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                  : <CheckCircle className="w-4 h-4 text-emerald-500" />}
              </div>

              {/* Info principale */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-800">
                    {isActive ? '● En cours' : '○ Terminé'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {job.job_id.slice(0, 8)}…
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {fmtTime(job.started_at)} · {fmtDuration(job.started_at, job.completed ? job.statuses.at(-1)?.completed_at : undefined)}
                  </span>
                  {job.delay_ms > 3000 && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {job.delay_ms / 1000}s/doc
                    </span>
                  )}
                </div>
                {/* Mini barre de progression */}
                <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-medium flex gap-2">
                  <span>{progress}% — {job.done}/{job.total} docs</span>
                  {job.errors > 0 && <span className="text-red-500">{job.errors} erreur{job.errors > 1 ? 's' : ''}</span>}
                  {job.cancelled > 0 && <span className="text-amber-500">{job.cancelled} annulé{job.cancelled > 1 ? 's' : ''}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isActive && !isStopping && (
                  <button
                    onClick={e => { e.stopPropagation(); stopJob(job.job_id); }}
                    title="Arrêter tout le job"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 border border-red-100 text-[10px] font-black uppercase transition-colors"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" /> Arrêter
                  </button>
                )}
                {isStopping && (
                  <span className="text-[10px] text-amber-500 font-bold animate-pulse px-2">Arrêt…</span>
                )}
                <span className="text-slate-300">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
              </div>
            </div>

            {/* ── Détail par entrée ── */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                <table className="w-full text-left" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      <th className="px-4 py-2">Assureur</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-2 py-2">Doc</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 w-full">Message</th>
                      <th className="px-3 py-2 text-right">Durée</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {job.statuses.map(s => {
                      const sc = STEP_CONFIG[s.step];
                      const isTerminal = TERMINAL.includes(s.step);
                      const isCancellable = isActive && !isTerminal;

                      return (
                        <tr key={s.catalogue_id} className="hover:bg-slate-50 transition-colors group">
                          {/* Assureur */}
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-bold text-slate-800">{s.insurer_label}</span>
                          </td>
                          {/* Type */}
                          <td className="px-3 py-2.5">
                            <span className="text-[11px] text-slate-600">{s.type_label}</span>
                          </td>
                          {/* Doc type */}
                          <td className="px-2 py-2.5">
                            <span className="text-[10px] font-bold text-slate-500">
                              {DOC_TYPE_LABELS[s.doc_type] ?? s.doc_type}
                            </span>
                          </td>
                          {/* Statut badge */}
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${sc.bg} ${sc.color}`}>
                              {sc.spin
                                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                : s.step === 'done'
                                ? <CheckCircle className="w-2.5 h-2.5" />
                                : s.step === 'error'
                                ? <XCircle className="w-2.5 h-2.5" />
                                : s.step === 'cancelled'
                                ? <X className="w-2.5 h-2.5" />
                                : null}
                              {sc.label}
                            </span>
                          </td>
                          {/* Message */}
                          <td className="px-3 py-2.5 w-full">
                            <p className={`text-[11px] truncate max-w-xs ${s.step === 'error' ? 'text-red-600' : 'text-slate-500'}`}
                               title={s.message}>
                              {s.message}
                            </p>
                            {s.found_url && (
                              <a href={s.found_url} target="_blank" rel="noopener noreferrer"
                                 className="text-[9px] text-blue-500 hover:underline truncate block max-w-xs"
                                 title={s.found_url}>
                                {s.found_url.slice(0, 60)}…
                              </a>
                            )}
                            {s.step === 'done' && s.pages_count != null && (
                              <span className="text-[9px] text-emerald-600 font-medium">{s.pages_count} pages · CG #{s.central_cg_id}</span>
                            )}
                          </td>
                          {/* Durée */}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <span className="text-[9px] text-slate-400">
                              {fmtDuration(s.started_at, s.completed_at)}
                            </span>
                          </td>
                          {/* Annulation unitaire */}
                          <td className="px-3 py-2.5">
                            {isCancellable && (
                              <button
                                onClick={() => cancelEntry(job.job_id, s.catalogue_id)}
                                title="Annuler cette entrée"
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
