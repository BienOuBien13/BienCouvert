import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, RefreshCw, RotateCcw, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Euro, Cpu, Zap, MessageSquare, FileText, Shield, BarChart2,
} from 'lucide-react';
import { fetchCsrfToken } from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FunctionStatsDetail {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  category: string;
  estimatedCostEur: number;
}

interface CategoryStats {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostEur: number;
}

interface TokenStats {
  startedAt: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostEur: number;
  budgetThresholdEur: number;
  budgetUsedPercent: number;
  budgetAlert: boolean;
  byFunction: Record<string, FunctionStatsDetail>;
  byCategory: Record<string, CategoryStats>;
}

interface TokenSnapshot {
  ts: string;
  deltaCalls: number;
  deltaInputTokens: number;
  deltaOutputTokens: number;
  deltaCostEur: number;
  byCategory: Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API   = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

function fmtCost(n: number): string {
  return n < 0.01 ? '< 0,01 €' : `${n.toFixed(4)} €`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Icônes et couleurs par catégorie ────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  'Agents BMAD':      { icon: <Cpu className="w-4 h-4" />,          color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200' },
  'Ingestion auto':   { icon: <FileText className="w-4 h-4" />,     color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  'Analyse contrats': { icon: <MessageSquare className="w-4 h-4" />, color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Sinistres':        { icon: <Shield className="w-4 h-4" />,        color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  'Non catégorisé':   { icon: <Zap className="w-4 h-4" />,           color: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200' },
};

// ─── Composant principal ──────────────────────────────────────────────────────

type FinTab = 'realtime' | 'history';

export default function TokenStatsPanel() {
  const [tab, setTab]           = useState<FinTab>('realtime');
  const [stats, setStats]       = useState<TokenStats | null>(null);
  const [history, setHistory]   = useState<TokenSnapshot[]>([]);
  const [loading, setLoading]   = useState(false);
  const [sortBy, setSortBy]     = useState<'cost' | 'calls' | 'tokens'>('cost');
  const [sortAsc, setSortAsc]   = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetMsg, setBudgetMsg]     = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [actionMsg, setActionMsg]       = useState<string | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rStats, rHistory] = await Promise.all([
        fetch(`${API}/api/admin/token-stats`, { headers }),
        fetch(`${API}/api/admin/token-stats/history`, { headers }),
      ]);
      if (rStats.ok)   setStats(await rStats.json());
      if (rHistory.ok) setHistory(await rHistory.json());
    } catch { /* silencieux */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleReset = async () => {
    if (!resetConfirm) { setResetConfirm(true); return; }
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`${API}/api/admin/token-stats/reset`, {
        method: 'POST', credentials: 'include',
        headers: { ...headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      });
      if (res.ok) { setActionMsg('Compteurs remis à zéro'); await load(); }
    } catch (e: any) { setActionMsg(`Erreur: ${e.message}`); }
    setResetConfirm(false);
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleBudget = async () => {
    const v = parseFloat(budgetInput);
    if (isNaN(v) || v < 0) { setBudgetMsg('Valeur invalide'); return; }
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`${API}/api/admin/token-stats/budget`, {
        method: 'PUT', credentials: 'include',
        headers: { ...headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        body: JSON.stringify({ budget_eur: v }),
      });
      const d = await res.json();
      setBudgetMsg(d.message ?? 'OK');
      await load();
    } catch (e: any) { setBudgetMsg(`Erreur: ${e.message}`); }
    setTimeout(() => setBudgetMsg(null), 4000);
  };

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(a => !a);
    else { setSortBy(col); setSortAsc(false); }
  };

  if (!stats) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Chargement…' : 'Aucune donnée'}
    </div>
  );

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

  // Trie les fonctions
  const fnEntries = (Object.entries(stats.byFunction) as [string, FunctionStatsDetail][]).sort(([, a], [, b]) => {
    const diff =
      sortBy === 'cost'   ? b.estimatedCostEur - a.estimatedCostEur :
      sortBy === 'calls'  ? b.calls - a.calls :
      (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens);
    return sortAsc ? -diff : diff;
  });

  const budgetPct = Math.min(stats.budgetUsedPercent, 100);
  const budgetColor =
    budgetPct >= 80 ? 'bg-red-500' :
    budgetPct >= 60 ? 'bg-amber-400' :
    'bg-emerald-500';

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-violet-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">FinOps — Consommation API Gemini</h2>
            <p className="text-xs text-slate-500">
              Depuis le {fmtDate(stats.startedAt)} · Mise à jour automatique toutes les 30s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
          <button
            onClick={handleReset}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
              resetConfirm
                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                : 'border-red-200 text-red-600 hover:bg-red-50'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resetConfirm ? 'Confirmer reset ?' : 'Reset compteurs'}
          </button>
          {actionMsg && <span className="text-xs text-slate-500 italic">{actionMsg}</span>}
        </div>
      </div>

      {/* Alerte budget */}
      {stats.budgetAlert && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 font-semibold">
            ⚠️ Seuil budget atteint à {stats.budgetUsedPercent}% — Coût estimé&nbsp;: {fmtCost(stats.estimatedCostEur)} / {fmtCost(stats.budgetThresholdEur)} seuil
          </p>
        </div>
      )}

      {/* Onglets Temps réel / Historique */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([['realtime', 'Temps réel', <TrendingUp className="w-3.5 h-3.5" />], ['history', 'Historique', <BarChart2 className="w-3.5 h-3.5" />]] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Onglet Temps réel ── */}
      {tab === 'realtime' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<Zap className="w-5 h-5 text-violet-600" />} label="Appels API" value={stats.totalCalls.toLocaleString('fr-FR')} sub="total" />
            <KpiCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="Tokens totaux" value={fmtTokens(totalTokens)} sub={`↑ ${fmtTokens(stats.totalInputTokens)} in · ↓ ${fmtTokens(stats.totalOutputTokens)} out`} />
            <KpiCard icon={<Euro className="w-5 h-5 text-emerald-600" />} label="Coût estimé" value={fmtCost(stats.estimatedCostEur)} sub="gemini-2.5-flash (tarifs Mars 2026)" />
            <KpiCard
              icon={stats.budgetAlert
                ? <AlertTriangle className="w-5 h-5 text-red-500" />
                : <CheckCircle className="w-5 h-5 text-emerald-600" />}
              label="Budget utilisé"
              value={`${stats.budgetUsedPercent}%`}
              sub={`seuil : ${fmtCost(stats.budgetThresholdEur)}`}
            />
          </div>

          {/* Barre de budget */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">Consommation vs budget seuil</span>
              <span className={`font-bold ${budgetPct >= 80 ? 'text-red-600' : budgetPct >= 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {fmtCost(stats.estimatedCostEur)} / {fmtCost(stats.budgetThresholdEur)}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number" min="0" step="1" value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                placeholder={`Seuil actuel : ${stats.budgetThresholdEur} €`}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
              <button onClick={handleBudget}
                className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium">
                Définir seuil
              </button>
              {budgetMsg && <span className="text-xs text-slate-500 italic">{budgetMsg}</span>}
            </div>
          </div>

          {/* Par catégorie */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Par service</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.entries(stats.byCategory) as [string, CategoryStats][]).sort(([, a], [, b]) => b.estimatedCostEur - a.estimatedCostEur).map(([cat, cs]) => {
                const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG['Non catégorisé'];
                const pct = stats.estimatedCostEur > 0
                  ? Math.round((cs.estimatedCostEur / stats.estimatedCostEur) * 100)
                  : 0;
                return (
                  <div key={cat} className={`border rounded-xl p-4 ${cfg.bg} ${cfg.border}`}>
                    <div className={`flex items-center gap-2 mb-2 ${cfg.color} font-semibold text-sm`}>
                      {cfg.icon} {cat}
                    </div>
                    <p className={`text-xl font-bold ${cfg.color}`}>{fmtCost(cs.estimatedCostEur)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {cs.calls} appels · {fmtTokens(cs.inputTokens + cs.outputTokens)} tokens · {pct}% du total
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tableau détaillé par fonction */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Détail par fonction</h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Fonction</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Catégorie</th>
                    <SortTh label="Appels" col="calls" sortBy={sortBy} asc={sortAsc} onSort={toggleSort} />
                    <SortTh label="Tokens (in)" col="tokens" sortBy={sortBy} asc={sortAsc} onSort={toggleSort} />
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Tokens (out)</th>
                    <SortTh label="Coût estimé" col="cost" sortBy={sortBy} asc={sortAsc} onSort={toggleSort} right />
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-600">% total</th>
                  </tr>
                </thead>
                <tbody>
                  {fnEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Aucune donnée — les métriques s'accumulent au fil des appels API
                      </td>
                    </tr>
                  ) : fnEntries.map(([fn, s], idx) => {
                    const cfg = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG['Non catégorisé'];
                    const pct = stats.estimatedCostEur > 0
                      ? Math.round((s.estimatedCostEur / stats.estimatedCostEur) * 100 * 10) / 10
                      : 0;
                    return (
                      <tr key={fn} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-700 font-medium">{fn}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                            {cfg.icon} {s.category}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.calls}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtTokens(s.inputTokens)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtTokens(s.outputTokens)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtCost(s.estimatedCostEur)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${
                            pct >= 40 ? 'bg-red-50 text-red-700' :
                            pct >= 20 ? 'bg-amber-50 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {fnEntries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                      <td className="px-4 py-2 text-slate-800" colSpan={2}>TOTAL</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-800">{stats.totalCalls}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtTokens(stats.totalInputTokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtTokens(stats.totalOutputTokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">{fmtCost(stats.estimatedCostEur)}</td>
                      <td className="px-4 py-2 text-right text-slate-700">100%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              * Coûts estimatifs gemini-2.5-flash : 0,075 $/M tokens input · 0,30 $/M tokens output (taux mars 2026, taux de change 1 USD = 0,92 EUR). Non contractuels.
            </p>
          </div>
        </div>
      )}

      {/* ── Onglet Historique ── */}
      {tab === 'history' && (
        <HistoryChart history={history} budgetThreshold={stats.budgetThresholdEur} />
      )}
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span></div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function SortTh({ label, col, sortBy, asc, onSort, right }: {
  label: string; col: 'cost' | 'calls' | 'tokens'; sortBy: string; asc: boolean; onSort: (c: any) => void; right?: boolean;
}) {
  const active = sortBy === col;
  return (
    <th
      className={`px-4 py-2.5 cursor-pointer select-none font-semibold text-slate-600 hover:text-slate-900 ${right ? 'text-right' : 'text-right'}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        {active ? (asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
      </span>
    </th>
  );
}

// ─── Graphe historique ────────────────────────────────────────────────────────

const CATEGORIES_ORDERED = ['Agents BMAD', 'Ingestion auto', 'Analyse contrats', 'Sinistres', 'Non catégorisé'];
const CATEGORY_COLORS: Record<string, string> = {
  'Agents BMAD':      '#7c3aed',
  'Ingestion auto':   '#2563eb',
  'Analyse contrats': '#059669',
  'Sinistres':        '#d97706',
  'Non catégorisé':   '#94a3b8',
};

type Granularity = '15m' | '1h' | '6h' | '24h';

function aggregateHistory(snapshots: TokenSnapshot[], gran: Granularity): TokenSnapshot[] {
  if (snapshots.length === 0) return [];
  const bucketMs: Record<Granularity, number> = { '15m': 15 * 60_000, '1h': 60 * 60_000, '6h': 6 * 3600_000, '24h': 24 * 3600_000 };
  const ms = bucketMs[gran];
  const buckets = new Map<number, TokenSnapshot>();
  for (const s of snapshots) {
    const t = new Date(s.ts).getTime();
    const key = Math.floor(t / ms) * ms;
    if (!buckets.has(key)) {
      buckets.set(key, { ts: new Date(key).toISOString(), deltaCalls: 0, deltaInputTokens: 0, deltaOutputTokens: 0, deltaCostEur: 0, byCategory: {} });
    }
    const b = buckets.get(key)!;
    b.deltaCalls        += s.deltaCalls;
    b.deltaInputTokens  += s.deltaInputTokens;
    b.deltaOutputTokens += s.deltaOutputTokens;
    b.deltaCostEur      = Math.round((b.deltaCostEur + s.deltaCostEur) * 10_000) / 10_000;
    for (const [cat, v] of Object.entries(s.byCategory)) {
      b.byCategory[cat] = Math.round(((b.byCategory[cat] || 0) + v) * 10_000) / 10_000;
    }
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
}

function fmtBarLabel(iso: string, gran: Granularity): string {
  const d = new Date(iso);
  if (gran === '24h') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  if (gran === '6h')  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.getHours()}h`;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function HistoryChart({ history, budgetThreshold }: { history: TokenSnapshot[]; budgetThreshold: number }) {
  const [gran, setGran] = useState<Granularity>('1h');
  const [metric, setMetric] = useState<'cost' | 'calls' | 'tokens'>('cost');

  const data = aggregateHistory(history, gran);
  const SHOW = 48; // max bars displayed
  const visible = data.slice(-SHOW);

  const maxVal = visible.reduce((m, s) => {
    const v = metric === 'cost' ? s.deltaCostEur :
              metric === 'calls' ? s.deltaCalls :
              (s.deltaInputTokens + s.deltaOutputTokens);
    return Math.max(m, v);
  }, 0);

  const allCategories = [...new Set(visible.flatMap(s => Object.keys(s.byCategory)))];
  const orderedCats = CATEGORIES_ORDERED.filter(c => allCategories.includes(c));

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <BarChart2 className="w-12 h-12" />
        <p className="text-sm font-bold">Aucun historique disponible</p>
        <p className="text-xs">Les snapshots s'enregistrent toutes les 15 minutes</p>
      </div>
    );
  }

  // Résumé période
  const totalCost  = visible.reduce((s, d) => s + d.deltaCostEur, 0);
  const totalCalls = visible.reduce((s, d) => s + d.deltaCalls, 0);
  const totalTok   = visible.reduce((s, d) => s + d.deltaInputTokens + d.deltaOutputTokens, 0);

  return (
    <div className="space-y-5">
      {/* Contrôles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(['15m', '1h', '6h', '24h'] as Granularity[]).map(g => (
            <button key={g} onClick={() => setGran(g)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${gran === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {([['cost', 'Coût (€)'], ['calls', 'Appels'], ['tokens', 'Tokens']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${metric === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Synthèse période */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-violet-700">{fmtCost(totalCost)}</p>
          <p className="text-xs text-violet-500 font-semibold">Coût période</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-blue-700">{totalCalls.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-blue-500 font-semibold">Appels période</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-emerald-700">{fmtTokens(totalTok)}</p>
          <p className="text-xs text-emerald-500 font-semibold">Tokens période</p>
        </div>
      </div>

      {/* Graphe barres empilées */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-end gap-0.5 h-48 overflow-x-auto pb-2">
          {visible.map((s, i) => {
            const total = metric === 'cost' ? s.deltaCostEur :
                          metric === 'calls' ? s.deltaCalls :
                          (s.deltaInputTokens + s.deltaOutputTokens);
            const heightPct = maxVal > 0 ? (total / maxVal) * 100 : 0;
            const label = fmtBarLabel(s.ts, gran);

            return (
              <div key={i} className="flex flex-col items-center flex-1 min-w-[8px] group relative" title={`${label}\n${metric === 'cost' ? fmtCost(total) : metric === 'calls' ? total + ' appels' : fmtTokens(total as number)}`}>
                {/* Bar segments par catégorie */}
                <div className="w-full flex flex-col-reverse" style={{ height: `${Math.max(heightPct, total > 0 ? 2 : 0)}%` }}>
                  {metric === 'cost'
                    ? orderedCats.map(cat => {
                        const v = s.byCategory[cat] || 0;
                        const segPct = total > 0 ? (v / (s.deltaCostEur || 1)) * 100 : 0;
                        return <div key={cat} style={{ height: `${segPct}%`, backgroundColor: CATEGORY_COLORS[cat] || '#94a3b8' }} className="w-full rounded-sm" />;
                      })
                    : <div className="w-full h-full rounded-sm bg-violet-500" />
                  }
                </div>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-slate-900 text-white text-[9px] rounded px-1.5 py-1 whitespace-nowrap shadow-lg">
                    <p className="font-bold">{label}</p>
                    {metric === 'cost' && orderedCats.filter(c => (s.byCategory[c] || 0) > 0).map(cat => (
                      <p key={cat} style={{ color: CATEGORY_COLORS[cat] }}>{cat}: {fmtCost(s.byCategory[cat] || 0)}</p>
                    ))}
                    {metric !== 'cost' && <p>{metric === 'calls' ? `${total} appels` : fmtTokens(total as number)}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Axe X (labels espacés) */}
        <div className="flex items-center overflow-hidden mt-1">
          {visible.filter((_, i) => i % Math.max(1, Math.floor(visible.length / 8)) === 0).map((s, i) => (
            <div key={i} className="flex-1 text-[9px] text-slate-400 text-center truncate">
              {fmtBarLabel(s.ts, gran)}
            </div>
          ))}
        </div>
      </div>

      {/* Légende catégories */}
      {metric === 'cost' && (
        <div className="flex flex-wrap gap-3">
          {orderedCats.map(cat => (
            <div key={cat} className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              {cat}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        * Historique en mémoire depuis le démarrage du serveur (ring buffer 4 jours · granularité 15 min). Non persisté en base.
      </p>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
