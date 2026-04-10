// =============================================================================
// MonitoringDashboard.tsx — Dashboard de monitoring des connexions utilisateurs
// Accessible uniquement aux admins via le bouton header
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, LogIn, LogOut, UserPlus, ShieldAlert, Activity,
  RefreshCw, TrendingUp, Clock, Wifi, AlertTriangle, CheckCircle2, BarChart2,
} from 'lucide-react';
import {
  adminService,
  DashboardStats,
  AdminUser,
  ConnectionLog,
} from '../services/adminService';
import TokenStatsPanel from './TokenStatsPanel';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ACTION_META = {
  USER_LOGIN:        { label: 'Connexion',    color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', dot: 'bg-emerald-500',  Icon: LogIn        },
  USER_LOGOUT:       { label: 'Déconnexion',  color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200',   dot: 'bg-slate-400',    Icon: LogOut       },
  USER_FAILED_LOGIN: { label: 'Échec login',  color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200',     dot: 'bg-red-500',      Icon: AlertTriangle },
  USER_REGISTER:     { label: 'Inscription',  color: 'text-sky-600',     bg: 'bg-sky-50',      border: 'border-sky-200',     dot: 'bg-sky-500',      Icon: UserPlus     },
} as const;

// ─── Sous-composants ─────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, Icon, colorClass, bgClass,
}: {
  label: string; value: string | number; sub?: string;
  Icon: React.ElementType; colorClass: string; bgClass: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col gap-3`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClass}`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div>
        <p className="text-3xl font-black text-slate-900">{value}</p>
        <p className="text-sm font-semibold text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: ConnectionLog; key?: React.Key }) {
  const meta = ACTION_META[log.action] ?? ACTION_META.USER_LOGOUT;
  const name = log.first_name
    ? `${log.first_name} ${log.last_name ?? ''}`.trim()
    : log.user_email ?? 'Inconnu';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${meta.border} ${meta.bg}`}>
      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm truncate">{name}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {log.user_email ?? '—'} &nbsp;·&nbsp; {log.ip_address ?? '—'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{fmt(log.timestamp)}</p>
      </div>
    </div>
  );
}

function UserRow({ u }: { u: AdminUser; key?: React.Key }) {
  const initials = ((u.first_name?.[0] ?? u.email[0]) + (u.last_name?.[0] ?? '')).toUpperCase();
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-colors">
      <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-black text-sm flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">
            {u.first_name} {u.last_name}
          </span>
          {u.is_admin && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold">Admin</span>
          )}
          {u.is_partner && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-bold">Partenaire</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{u.email}</p>
        <p className="text-xs text-slate-400">
          {u.policy_count} contrat{u.policy_count !== 1 ? 's' : ''} &nbsp;·&nbsp; Inscrit {fmt(u.created_at)}
        </p>
      </div>
      <div className="text-right flex-shrink-0 hidden sm:block">
        <p className="text-xs text-slate-400">Dernière connexion</p>
        <p className="text-xs font-semibold text-slate-600">{fmt(u.last_login)}</p>
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

type Tab = 'overview' | 'users' | 'logs' | 'finops';

const MonitoringDashboard: React.FC = () => {
  const [tab, setTab]         = useState<Tab>('overview');
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [logs, setLogs]       = useState<ConnectionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, u, l] = await Promise.all([
        adminService.getDashboardStats(),
        adminService.getUsers(),
        adminService.getConnectionLogs(200),
      ]);
      setStats(s);
      setUsers(u);
      setLogs(l);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Vue globale',   icon: <Activity className="w-3.5 h-3.5" /> },
    { key: 'users',    label: `Utilisateurs${users.length ? ` (${users.length})` : ''}`, icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'logs',     label: `Connexions${logs.length ? ` (${logs.length})` : ''}`,     icon: <LogIn className="w-3.5 h-3.5" /> },
    { key: 'finops',   label: 'FinOps',        icon: <BarChart2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-amber-500" />
            Monitoring Connexions
          </h2>
          {lastRefresh && (
            <p className="text-xs text-slate-400 mt-0.5">
              Mise à jour : {fmt(lastRefresh.toISOString())}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-600 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Vue globale ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {loading && !stats ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Utilisateurs total"    value={stats.total_users}           Icon={Users}        colorClass="text-sky-600"     bgClass="bg-sky-50"     />
              <StatCard label="Nouveaux (7 jours)"    value={stats.new_users_week}        Icon={UserPlus}     colorClass="text-violet-600"  bgClass="bg-violet-50"  />
              <StatCard label="Connexions aujourd'hui" value={stats.logins_today}         Icon={LogIn}        colorClass="text-emerald-600" bgClass="bg-emerald-50" />
              <StatCard label="Échecs aujourd'hui"    value={stats.failed_logins_today}   Icon={ShieldAlert}  colorClass="text-red-600"     bgClass="bg-red-50"     sub={Number(stats.failed_logins_today) > 0 ? '⚠ Surveiller' : undefined} />
              <StatCard label="Connexions (7 jours)"  value={stats.logins_week}           Icon={TrendingUp}   colorClass="text-amber-600"   bgClass="bg-amber-50"   />
              <StatCard label="Actifs (30 jours)"     value={stats.active_users_month}    Icon={Wifi}         colorClass="text-cyan-600"    bgClass="bg-cyan-50"    />
            </div>
          )}

          {/* Dernières connexions */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> 10 derniers événements
            </h3>
            <div className="space-y-2">
              {loading && logs.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)
                : logs.slice(0, 10).map(l => <LogRow key={l.id} log={l} />)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Utilisateurs ── */}
      {tab === 'users' && (
        <div className="space-y-2">
          {loading && users.length === 0
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)
            : users.map(u => <UserRow key={u.id} u={u} />)
          }
        </div>
      )}

      {/* ── Logs de connexion ── */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {loading && logs.length === 0
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)
            : logs.map(l => <LogRow key={l.id} log={l} />)
          }
        </div>
      )}

      {/* ── FinOps ── */}
      {tab === 'finops' && (
        <TokenStatsPanel />
      )}
    </div>
  );
};

export default MonitoringDashboard;
