import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, RefreshCw, Search, Download, CheckCircle, AlertTriangle,
  XCircle, HelpCircle, Eye, Play, BarChart3
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixCell {
  insurer_code: string;
  insurer_label: string;
  insurance_type_code: string;
  insurance_type_label: string;
  doc_type: string;
  matrix_status: string;
  central_cg_id: number | null;
  current_url: string | null;
  indexed_at: string | null;
  last_checked_at: string | null;
}

interface MatrixStats {
  total: number;
  indexed: number;
  missing: number;
  outdated: number;
  discovered: number;
  error: number;
  unknown: number;
  coverage_percent: number;
}

interface MatrixResult {
  cells: MatrixCell[];
  stats: MatrixStats;
  insurers: { code: string; label: string }[];
  insurance_types: { code: string; label: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = (import.meta as any).env?.VITE_API_URL ?? '';
const TOKEN = () => localStorage.getItem('assurclair_token') || '';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  indexed:    { label: 'Indexé',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  missing:    { label: 'Manquant',   color: 'text-red-600',     bg: 'bg-red-50 border-red-200',          icon: <XCircle className="w-3.5 h-3.5" /> },
  outdated:   { label: 'Obsolète',   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',      icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  discovered: { label: 'Découvert',  color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',        icon: <Eye className="w-3.5 h-3.5" /> },
  error:      { label: 'Erreur',     color: 'text-red-700',     bg: 'bg-red-100 border-red-300',         icon: <XCircle className="w-3.5 h-3.5" /> },
  unknown:    { label: 'Inconnu',    color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200',      icon: <HelpCircle className="w-3.5 h-3.5" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function CataloguePanel() {
  const [data, setData] = useState<MatrixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterInsurer, setFilterInsurer] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` };

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterInsurer) params.set('insurer_code', filterInsurer);
      if (filterType) params.set('insurance_type_code', filterType);
      if (filterStatus) params.set('matrix_status', filterStatus);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API}/api/admin/catalogue/matrix${qs}`, { headers });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e: any) {
      console.error('[CataloguePanel] Erreur chargement:', e.message);
    }
    setLoading(false);
  }, [filterInsurer, filterType, filterStatus]);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  const doAction = async (endpoint: string, body?: any) => {
    setActionMsg(null);
    try {
      const res = await fetch(`${API}/api/admin/catalogue/${endpoint}`, {
        method: 'POST', headers, body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json();
      setActionMsg(d.message || 'OK');
      setTimeout(() => loadMatrix(), 2000);
    } catch (e: any) {
      setActionMsg(`Erreur: ${e.message}`);
    }
  };

  // ─── Statistiques ─────────────────────────────────────────────────────────

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Catalogue documentaire</h2>
            <p className="text-sm text-slate-500">
              Suivi de la matrice assureur × type d'assurance × document
            </p>
          </div>
        </div>
        <button onClick={loadMatrix} disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
        </button>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total" value={stats.total} color="text-slate-900" />
          <StatCard label="Indexés" value={stats.indexed} color="text-emerald-700" />
          <StatCard label="Manquants" value={stats.missing} color="text-red-600" />
          <StatCard label="Obsolètes" value={stats.outdated} color="text-amber-600" />
          <StatCard label="Découverts" value={stats.discovered} color="text-blue-700" />
          <StatCard label="Erreurs" value={stats.error} color="text-red-700" />
          <StatCard label="Couverture" value={`${stats.coverage_percent}%`} color="text-blue-600" />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => doAction('sync')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700">
          <RefreshCw className="w-4 h-4" /> Sync matrice
        </button>
        <button onClick={() => doAction('discover', { limit: 20 })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-sm font-medium text-blue-700">
          <Search className="w-4 h-4" /> Découvrir documents
        </button>
        <button onClick={() => doAction('check', { limit: 20 })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-sm font-medium text-amber-700">
          <CheckCircle className="w-4 h-4" /> Vérifier indexés
        </button>
        {actionMsg && (
          <span className="self-center text-sm text-slate-500 italic">{actionMsg}</span>
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select value={filterInsurer} onChange={e => setFilterInsurer(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white">
          <option value="">Tous les assureurs</option>
          {data?.insurers.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white">
          <option value="">Tous les types</option>
          {data?.insurance_types.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Tableau */}
      {data && data.cells.length > 0 ? (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Assureur</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Type</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Doc</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Statut</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Indexé le</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Vérifié le</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.cells.map((cell, idx) => (
                <tr key={`${cell.insurer_code}-${cell.insurance_type_code}-${cell.doc_type}`}
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-4 py-2 font-medium text-slate-800">{cell.insurer_label}</td>
                  <td className="px-4 py-2 text-slate-600">{cell.insurance_type_label}</td>
                  <td className="px-4 py-2 text-slate-500">{cell.doc_type}</td>
                  <td className="px-4 py-2"><StatusBadge status={cell.matrix_status} /></td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {cell.indexed_at ? new Date(cell.indexed_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {cell.last_checked_at ? new Date(cell.last_checked_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {cell.current_url && (
                        <a href={cell.current_url} target="_blank" rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-slate-100" title="Voir le PDF">
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                        </a>
                      )}
                      {(cell.matrix_status === 'discovered' || cell.matrix_status === 'outdated') && (
                        <button onClick={() => doAction(`ingest/${(cell as any).id ?? 0}`)}
                          className="p-1 rounded hover:bg-blue-50" title="Lancer l'ingestion">
                          <Play className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <div className="text-center py-12 text-slate-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Aucune entrée dans le catalogue</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Sous-composant statistique ───────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
