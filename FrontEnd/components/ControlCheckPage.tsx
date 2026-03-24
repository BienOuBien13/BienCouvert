import React, { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Filter, BarChart3, Clock, Search,
  FileText, Loader2, Eye
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ControlDetail {
  id: number;
  insurer_code: string;
  insurance_type_code: string;
  formula_key: string;
  formula_label: string;
  guarantee_key: string;
  guarantee_label: string;
  expected_status: string;
  expected_amount_pattern: string | null;
  actual_status: string | null;
  actual_amount: string | null;
  result: 'passed' | 'failed' | 'not_found';
  error: string | null;
  source_doc_hint: string | null;
  source_cg_filename: string | null;
}

interface ControlCheckReport {
  run_at: string;
  filters: { insurer_code?: string; insurance_type_code?: string; source_cg_filename?: string };
  total: number;
  passed: number;
  failed: number;
  not_found: number;
  success_rate: string;
  details: ControlDetail[];
  failures: ControlDetail[];
}

interface SummaryRow {
  insurer_code: string;
  insurance_type_code: string;
  source_cg_filename: string;
  total: number;
  passed: number;
  failed: number;
  not_found: number;
  never_run: number;
  last_run_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || '';
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const map: Record<string, string> = {
    included: 'bg-emerald-100 text-emerald-700',
    optional: 'bg-amber-100 text-amber-700',
    excluded: 'bg-red-100 text-red-700',
    not_applicable: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function ResultBadge({ result }: { result: 'passed' | 'failed' | 'not_found' | null | undefined }) {
  if (!result) return <span className="text-slate-300 text-xs">—</span>;
  if (result === 'passed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> OK
    </span>
  );
  if (result === 'failed') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> KO
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-700">
      <AlertTriangle className="w-3 h-3" /> Introuvable
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const ControlCheckPage: React.FC = () => {
  // Filters
  const [filterInsurer, setFilterInsurer]   = useState('');
  const [filterType, setFilterType]         = useState('');
  const [filterFile, setFilterFile]         = useState('');

  // Run state
  const [isRunning, setIsRunning]           = useState(false);
  const [report, setReport]                 = useState<ControlCheckReport | null>(null);
  const [runError, setRunError]             = useState<string | null>(null);

  // Summary state
  const [summary, setSummary]               = useState<SummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Display
  const [tab, setTab]                       = useState<'summary' | 'details'>('summary');
  const [showOnlyFailures, setShowOnlyFailures] = useState(false);
  const [searchTerm, setSearchTerm]         = useState('');
  const [expandedRows, setExpandedRows]     = useState<Set<number>>(new Set());

  // ── Load summary on mount ──────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/control-check/summary`, { headers: authHeader() });
      if (r.ok) setSummary(await r.json());
    } catch (e) {
      console.error('[control-check/summary]', e);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Run control check ──────────────────────────────────────────────────────
  const handleRun = async () => {
    setIsRunning(true);
    setReport(null);
    setRunError(null);
    setTab('details');
    try {
      const body: Record<string, string> = {};
      if (filterInsurer.trim()) body.insurer_code        = filterInsurer.trim();
      if (filterType.trim())    body.insurance_type_code = filterType.trim();
      if (filterFile.trim())    body.source_cg_filename  = filterFile.trim();

      const r = await fetch(`${API}/api/admin/control-check`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setRunError(data.message || 'Erreur inconnue'); return; }
      setReport(data);
      setShowOnlyFailures(data.failed > 0 || data.not_found > 0);
      // Refresh summary
      loadSummary();
    } catch (e: any) {
      setRunError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Filtered details ───────────────────────────────────────────────────────
  const displayedDetails = report
    ? (showOnlyFailures ? report.failures : report.details).filter(d => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return d.guarantee_label.toLowerCase().includes(s)
          || d.formula_label.toLowerCase().includes(s)
          || d.guarantee_key.toLowerCase().includes(s)
          || d.formula_key.toLowerCase().includes(s);
      })
    : [];

  const toggleExpand = (id: number) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Filtres + bouton run ─────────────────────────────────────────── */}
      <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-2xl bg-violet-100 flex items-center justify-center">
            <Filter className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Filtres du contrôle</h3>
            <p className="text-xs text-slate-400 mt-0.5">Laissez vide pour tester tous les contrôles de référence</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Code assureur</label>
            <input
              type="text"
              value={filterInsurer}
              onChange={e => setFilterInsurer(e.target.value)}
              placeholder="ex : MAT01, MAAF01"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Type d'assurance</label>
            <input
              type="text"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              placeholder="ex : HAB01, AUT01"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Fichier CG source</label>
            <input
              type="text"
              value={filterFile}
              onChange={e => setFilterFile(e.target.value)}
              placeholder="ex : MAT01_HAB01_002.pdf"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400 transition-all"
            />
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-violet-700 shadow-lg shadow-violet-900/10 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isRunning
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Contrôle en cours…</>
            : <><PlayCircle className="w-4 h-4" /> Lancer le contrôle</>}
        </button>

        {runError && (
          <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {runError}
          </div>
        )}
      </div>

      {/* ── Onglets summary / résultats ──────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        <button
          onClick={() => setTab('summary')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            tab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Vue d'ensemble
        </button>
        <button
          onClick={() => setTab('details')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
            tab === 'details' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Résultats détaillés
          {report && report.failed + report.not_found > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full leading-none">
              {report.failed + report.not_found}
            </span>
          )}
        </button>
      </div>

      {/* ── Vue d'ensemble ─────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-500" /> Derniers runs par configuration
            </h3>
            <button onClick={loadSummary} disabled={summaryLoading} className="p-2 text-slate-400 hover:text-violet-600 transition-colors">
              <RefreshCw className={`w-4 h-4 ${summaryLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {summaryLoading ? (
            <div className="flex items-center justify-center h-32 gap-3">
              <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
              <span className="text-sm text-slate-400">Chargement…</span>
            </div>
          ) : summary.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
              <FileText className="w-8 h-8 text-slate-200" />
              <p className="text-sm">Aucun run effectué — lancez un contrôle pour voir les résultats ici.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assureur</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fichier CG</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-emerald-500 uppercase tracking-widest">✓ OK</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-red-500 uppercase tracking-widest">✗ KO</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-amber-500 uppercase tracking-widest">? Introuvable</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Jamais testé</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dernier run</th>
                    <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, idx) => {
                    const tested = row.passed + row.failed + row.not_found;
                    const score = tested > 0 ? Math.round((row.passed / tested) * 100) : null;
                    const hasProblems = row.failed > 0 || row.not_found > 0;
                    return (
                      <tr
                        key={idx}
                        className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer ${hasProblems ? 'bg-red-50/30' : ''}`}
                        onClick={() => {
                          setFilterInsurer(row.insurer_code);
                          setFilterType(row.insurance_type_code);
                          setFilterFile(row.source_cg_filename ?? '');
                          setTab('details');
                        }}
                      >
                        <td className="px-5 py-3 font-bold text-slate-800">{row.insurer_code}</td>
                        <td className="px-4 py-3 text-slate-600">{row.insurance_type_code}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                          {row.source_cg_filename || <span className="text-slate-300">générique</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">{row.total}</td>
                        <td className="px-4 py-3 text-center">
                          {row.passed > 0 && <span className="font-bold text-emerald-600">{row.passed}</span>}
                          {row.passed === 0 && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.failed > 0 && <span className="font-bold text-red-600">{row.failed}</span>}
                          {row.failed === 0 && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.not_found > 0 && <span className="font-bold text-amber-600">{row.not_found}</span>}
                          {row.not_found === 0 && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.never_run > 0 && <span className="text-slate-400">{row.never_run}</span>}
                          {row.never_run === 0 && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(row.last_run_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {score === null ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : (
                            <span className={`text-sm font-black ${score === 100 ? 'text-emerald-600' : score >= 80 ? 'text-amber-500' : 'text-red-600'}`}>
                              {score}%
                            </span>
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
      )}

      {/* ── Résultats détaillés ──────────────────────────────────────────── */}
      {tab === 'details' && (
        <>
          {/* Stats cards */}
          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total', value: report.total, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
                { label: 'Passés', value: report.passed, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
                { label: 'Échoués', value: report.failed, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: <XCircle className="w-4 h-4 text-red-500" /> },
                { label: 'Introuvables', value: report.not_found, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: <AlertTriangle className="w-4 h-4 text-amber-500" /> },
              ].map(card => (
                <div key={card.label} className={`${card.bg} border ${card.border} rounded-2xl px-5 py-4`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</span>
                    {card.icon}
                  </div>
                  <div className={`text-3xl font-black ${card.color}`}>{card.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Rate + run date */}
          {report && (
            <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-500">
              <span className="font-bold">Taux : <span className={`text-base font-black ${report.success_rate === '100%' ? 'text-emerald-600' : 'text-amber-500'}`}>{report.success_rate}</span></span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(report.run_at)}</span>
              {report.filters.insurer_code && <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-lg font-bold">{report.filters.insurer_code}</span>}
              {report.filters.insurance_type_code && <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-lg font-bold">{report.filters.insurance_type_code}</span>}
              {report.filters.source_cg_filename && <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-lg font-mono text-[10px]">{report.filters.source_cg_filename}</span>}
            </div>
          )}

          {/* Toolbar */}
          {report && report.total > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrer garantie, formule…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-400 transition-all"
                />
              </div>
              <button
                onClick={() => setShowOnlyFailures(f => !f)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                  showOnlyFailures
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                {showOnlyFailures ? `Échecs seulement (${report.failures.length})` : 'Tous les résultats'}
              </button>
            </div>
          )}

          {/* Table */}
          {!report && !isRunning && (
            <div className="bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center h-48 gap-3 text-slate-400 shadow-sm">
              <PlayCircle className="w-10 h-10 text-slate-200" />
              <p className="text-sm">Lancez un contrôle pour voir les résultats détaillés</p>
            </div>
          )}

          {isRunning && (
            <div className="bg-white rounded-[2rem] border border-slate-200 flex items-center justify-center h-48 gap-3 shadow-sm">
              <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
              <span className="text-sm text-slate-500 font-medium">Comparaison des faits extraits en cours…</span>
            </div>
          )}

          {report && report.total === 0 && (
            <div className="bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center h-48 gap-2 text-slate-400 shadow-sm">
              <AlertTriangle className="w-8 h-8 text-slate-200" />
              <p className="text-sm">Aucun contrôle de référence trouvé pour ces filtres</p>
            </div>
          )}

          {report && displayedDetails.length > 0 && (
            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="w-8" />
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Assureur / Type</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Formule</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Garantie</th>
                      <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Attendu</th>
                      <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Obtenu</th>
                      <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedDetails.map(d => {
                      const expanded = expandedRows.has(d.id);
                      const rowBg = d.result === 'passed' ? '' : d.result === 'failed' ? 'bg-red-50/30' : 'bg-amber-50/30';
                      return (
                        <React.Fragment key={d.id}>
                          <tr
                            className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${rowBg}`}
                            onClick={() => toggleExpand(d.id)}
                          >
                            <td className="px-3 py-3 text-slate-300">
                              {d.result !== 'passed'
                                ? (expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
                                : null}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-800">{d.insurer_code}</span>
                              <span className="text-slate-400 text-xs ml-1">/ {d.insurance_type_code}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs">{d.formula_label}</td>
                            <td className="px-4 py-3 text-slate-700 font-medium">{d.guarantee_label}</td>
                            <td className="px-4 py-3 text-center"><StatusBadge status={d.expected_status} /></td>
                            <td className="px-4 py-3 text-center"><StatusBadge status={d.actual_status} /></td>
                            <td className="px-4 py-3 text-center"><ResultBadge result={d.result} /></td>
                          </tr>
                          {expanded && d.result !== 'passed' && (
                            <tr className={`${rowBg}`}>
                              <td />
                              <td colSpan={6} className="px-4 pb-4 pt-1">
                                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 space-y-1 text-xs text-slate-600">
                                  <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Clé garantie</span> <span className="font-mono">{d.guarantee_key}</span></div>
                                  <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Clé formule</span> <span className="font-mono">{d.formula_key}</span></div>
                                  {d.source_cg_filename && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Fichier CG</span> <span className="font-mono">{d.source_cg_filename}</span></div>}
                                  {d.source_doc_hint && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Source</span> {d.source_doc_hint}</div>}
                                  {d.actual_amount && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Montant extrait</span> {d.actual_amount}</div>}
                                  {d.expected_amount_pattern && <div><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Pattern montant attendu</span> <span className="font-mono">{d.expected_amount_pattern}</span></div>}
                                  {d.error && <div className="text-red-600"><span className="font-bold uppercase tracking-widest text-[10px]">Erreur</span> {d.error}</div>}
                                  {d.result === 'not_found' && (
                                    <div className="mt-2 p-2 bg-amber-50 rounded-lg text-amber-700">
                                      ⚠️ Cette garantie n'a pas été trouvée dans coverage_facts. Vérifiez que le PDF a bien été ingéré et que la guarantee_key correspond à la valeur extraite.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
                <span>{displayedDetails.length} ligne(s) affichée(s)</span>
                {report && <span className="font-bold">{report.success_rate} de succès</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ControlCheckPage;
