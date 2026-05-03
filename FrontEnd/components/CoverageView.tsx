// =============================================================================
// CoverageView â€” Vue "Garanties" double-onglet
//   Tab 1 Â· Contrats    : dark hero + bento-grid par domaine
//   Tab 2 Â· Par garantie: matrix cross-contrat par catÃ©gorie de garantie
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Policy, PolicyType } from '../types';
import { getCoverageDetails } from '../services/geminiService';
import type { CoverageData, CoverageItem } from './CoverageDetailPage';
import {
  Car, Home, HeartPulse, Heart, Scale, CreditCard,
  Banknote, Smartphone, Shield, Plus, ArrowRight, ChevronRight,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, AlertCircle,
  Layers, LayoutGrid,
} from 'lucide-react';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ViewTab = 'contracts' | 'guarantees';

type PolicyCoverageStatus = {
  policyId: string;
  policyName: string;
  policyInsurer: string;
  policyType: PolicyType | string;
  status: 'included' | 'excluded' | 'partial';
  items: CoverageItem[];
};

type CategoryRow = {
  category: string;
  perPolicy: PolicyCoverageStatus[];
  includedCount: number;
  excludedCount: number;
};

type CoverageMapValue = CoverageData | 'loading' | 'error';

interface Props {
  policies: Policy[];
  onSelectPolicy: (policy: Policy) => void;
  onAddPolicy: () => void;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Config visuelle par domaine
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DOMAIN_CFG: Record<string, {
  Icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  glow: string;
  short: string;
  stop1: string;
  textColor: string;
  bgLight: string;
}> = {
  [PolicyType.AUTO]:      { Icon: Car,        gradient: 'from-sky-400 to-blue-700',      glow: 'shadow-sky-500/50',    short: 'Auto',       stop1: '#38bdf8', textColor: 'text-sky-700',    bgLight: 'bg-sky-50'    },
  [PolicyType.HOME]:      { Icon: Home,       gradient: 'from-violet-400 to-purple-800', glow: 'shadow-violet-500/50', short: 'Habitation', stop1: '#a78bfa', textColor: 'text-violet-700', bgLight: 'bg-violet-50' },
  [PolicyType.HEALTH]:    { Icon: HeartPulse, gradient: 'from-rose-400 to-pink-700',     glow: 'shadow-rose-500/50',   short: 'Santé',      stop1: '#fb7185', textColor: 'text-rose-700',   bgLight: 'bg-rose-50'   },
  [PolicyType.LIFE]:      { Icon: Heart,      gradient: 'from-red-400 to-rose-800',      glow: 'shadow-red-500/50',    short: 'Prévoyance', stop1: '#f87171', textColor: 'text-red-700',    bgLight: 'bg-red-50'    },
  [PolicyType.LEGAL]:     { Icon: Scale,      gradient: 'from-amber-400 to-orange-600',  glow: 'shadow-amber-500/50',  short: 'Juridique',  stop1: '#fbbf24', textColor: 'text-amber-700',  bgLight: 'bg-amber-50'  },
  [PolicyType.BANK_CARD]: { Icon: CreditCard, gradient: 'from-teal-400 to-emerald-700',  glow: 'shadow-teal-500/50',   short: 'Carte',      stop1: '#2dd4bf', textColor: 'text-teal-700',   bgLight: 'bg-teal-50'   },
  [PolicyType.LOAN]:      { Icon: Banknote,   gradient: 'from-green-400 to-emerald-800', glow: 'shadow-green-500/50',  short: 'Emprunteur', stop1: '#4ade80', textColor: 'text-green-700',  bgLight: 'bg-green-50'  },
  [PolicyType.MOBILE]:    { Icon: Smartphone, gradient: 'from-slate-400 to-slate-700',   glow: 'shadow-slate-500/50',  short: 'Appareils',  stop1: '#94a3b8', textColor: 'text-slate-700',  bgLight: 'bg-slate-100' },
  [PolicyType.OTHER]:     { Icon: Shield,     gradient: 'from-indigo-400 to-indigo-800', glow: 'shadow-indigo-500/50', short: 'Autre',      stop1: '#818cf8', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50' },
};

const TYPE_ORDER = [
  PolicyType.AUTO, PolicyType.HOME, PolicyType.HEALTH, PolicyType.LIFE,
  PolicyType.LEGAL, PolicyType.BANK_CARD, PolicyType.LOAN, PolicyType.MOBILE, PolicyType.OTHER,
];

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const getPrice = (p: Policy) => (p as any).annualPremium || (p as any).premium || 0;

const getDomainCfg = (type: string) => DOMAIN_CFG[type] ?? DOMAIN_CFG[PolicyType.OTHER];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Category color by keyword
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getCategoryStyle(category: string): { border: string; badge: string; dot: string } {
  const c = category.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (c.includes('vol') || c.includes('cambriol'))          return { border: 'border-l-amber-400',  badge: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-400'  };
  if (c.includes('incend') || c.includes('feu'))            return { border: 'border-l-red-400',    badge: 'bg-red-50 text-red-700',      dot: 'bg-red-400'    };
  if (c.includes('eau') || c.includes('inond'))             return { border: 'border-l-blue-400',   badge: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-400'   };
  if (c.includes('bris') || c.includes('vitr') || c.includes('glace')) return { border: 'border-l-sky-400', badge: 'bg-sky-50 text-sky-700', dot: 'bg-sky-400' };
  if (c.includes('civil') || c.includes(' rc') || c.includes('responsabilite')) return { border: 'border-l-violet-400', badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-400' };
  if (c.includes('assist'))                                 return { border: 'border-l-teal-400',   badge: 'bg-teal-50 text-teal-700',    dot: 'bg-teal-400'   };
  if (c.includes('corps') || c.includes('vehic'))          return { border: 'border-l-indigo-400', badge: 'bg-indigo-50 text-indigo-700',dot: 'bg-indigo-400' };
  if (c.includes('medical') || c.includes('hospit') || c.includes('sante')) return { border: 'border-l-rose-400', badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-400' };
  return { border: 'border-l-slate-300', badge: 'bg-slate-50 text-slate-600', dot: 'bg-slate-400' };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Matrix builder
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildMatrix(policies: Policy[], dataMap: Record<string, CoverageMapValue>): CategoryRow[] {
  const catSet = new Set<string>();
  for (const p of policies) {
    const d = dataMap[p.id];
    if (!d || d === 'loading' || d === 'error') continue;
    (d as CoverageData).coverages.forEach(c => catSet.add(c.category));
  }

  return [...catSet].sort().map(cat => {
    const perPolicy: PolicyCoverageStatus[] = [];
    for (const p of policies) {
      const d = dataMap[p.id];
      if (!d || d === 'loading' || d === 'error') continue;
      const items = (d as CoverageData).coverages.filter(c => c.category === cat);
      if (items.length === 0) continue;
      const inc = items.filter(c => c.included).length;
      const exc = items.filter(c => !c.included).length;
      const status: PolicyCoverageStatus['status'] =
        inc > 0 && exc > 0 ? 'partial' :
        inc > 0 ? 'included' : 'excluded';
      perPolicy.push({ policyId: p.id, policyName: p.name || p.insurer, policyInsurer: p.insurer, policyType: p.type, status, items });
    }
    const includedCount = perPolicy.filter(pp => pp.status !== 'excluded').length;
    const excludedCount = perPolicy.filter(pp => pp.status === 'excluded').length;
    return { category: cat, perPolicy, includedCount, excludedCount };
  }).filter(r => r.perPolicy.length > 0);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Status chip
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const StatusChip: React.FC<{ status: PolicyCoverageStatus['status'] }> = ({ status }) => {
  if (status === 'included') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
      <CheckCircle2 className="w-2.5 h-2.5" /> Couvert
    </span>
  );
  if (status === 'excluded') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-red-50 text-red-700 border border-red-200 shrink-0">
      <XCircle className="w-2.5 h-2.5" /> Exclu
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      <AlertCircle className="w-2.5 h-2.5" /> Partiel
    </span>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sub-components
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SectionLabel: React.FC<{ count: number; color: string; label: string }> = ({ count, color, label }) => (
  <div className="flex items-center gap-2 px-0.5">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</span>
    <span className={`w-5 h-5 rounded-full ${color} text-white text-[9px] font-black flex items-center justify-center`}>{count}</span>
  </div>
);

const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-5">
    <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
      <Shield className="w-11 h-11 text-slate-400" />
    </div>
    <div className="text-center">
      <p className="font-black text-slate-900 text-lg">Aucun contrat</p>
      <p className="text-slate-500 text-sm mt-2 max-w-[220px] leading-relaxed mx-auto">
        Ajoutez vos contrats d'assurance pour visualiser vos garanties
      </p>
    </div>
    <button onClick={onAdd}
      className="px-8 py-4 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-900/20">
      + Premier contrat
    </button>
  </div>
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CoverageView({ policies, onSelectPolicy, onAddPolicy }: Props) {
  const [activeTab, setActiveTab]       = useState<ViewTab>('contracts');
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [expandedCat, setExpandedCat]   = useState<string | null>(null);
  const [coverageDataMap, setCoverageDataMap] = useState<Record<string, CoverageMapValue>>({});

  // â”€â”€ Score arc â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const grouped = policies.reduce<Record<string, Policy[]>>((acc, p) => {
    const k = p.type || PolicyType.OTHER;
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});
  const coveredTypes  = TYPE_ORDER.filter(t => grouped[t]?.length);
  const gapTypes      = TYPE_ORDER.filter(t => !grouped[t]?.length);
  const pct           = coveredTypes.length / TYPE_ORDER.length;
  const totalPremium  = policies.reduce((s, p) => s + getPrice(p), 0);
  const scoreLabel    = pct >= 0.8 ? 'Excellent' : pct >= 0.55 ? 'Bien couvert' : pct >= 0.33 ? 'À compléter' : 'Insuffisant';
  const scoreColor    = pct >= 0.8 ? '#34d399' : pct >= 0.55 ? '#38bdf8' : pct >= 0.33 ? '#fbbf24' : '#f87171';
  const R = 52; const C = 2 * Math.PI * R; const arcLen = pct * C * 0.75;

  // â”€â”€ Load coverage data lazily when switching to guarantees tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (activeTab !== 'guarantees' || policies.length === 0) return;
    const toLoad = policies.filter(p => !(p.id in coverageDataMap));
    if (toLoad.length === 0) return;

    setCoverageDataMap(prev => {
      const upd: Record<string, CoverageMapValue> = {};
      toLoad.forEach(p => { upd[p.id] = 'loading'; });
      return { ...prev, ...upd };
    });

    toLoad.forEach(async (policy) => {
      const cacheKey = `coverage_v2_${policy.id}_${(policy as any).coverageDetail || (policy as any).coverage || ''}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setCoverageDataMap(prev => ({ ...prev, [policy.id]: JSON.parse(cached) }));
          return;
        }
      } catch { /* ignore */ }
      try {
        const data = await getCoverageDetails(policy);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
        setCoverageDataMap(prev => ({ ...prev, [policy.id]: data }));
      } catch {
        setCoverageDataMap(prev => ({ ...prev, [policy.id]: 'error' }));
      }
    });
  }, [activeTab, policies]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadedCount  = policies.filter(p => coverageDataMap[p.id] && coverageDataMap[p.id] !== 'loading' && coverageDataMap[p.id] !== 'error').length;
  const loadingCount = policies.filter(p => coverageDataMap[p.id] === 'loading').length;
  const matrix       = buildMatrix(policies, coverageDataMap);

  return (
    <div className="-mx-3 -mt-3 animate-fadeIn">

      {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative bg-[#060c18] overflow-hidden px-5 pt-10 pb-6">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full opacity-25 blur-[90px]" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute top-0 right-1/4 w-64 h-64 rounded-full opacity-20 blur-[90px]" style={{ background: 'radial-gradient(circle, #38bdf8, transparent)' }} />
        </div>

        <p className="relative z-10 text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mb-8 text-center">Votre Bouclier</p>

        {/* Score ring */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[135deg]">
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" stroke="#ffffff08" strokeDasharray={`${C * 0.75} ${C}`} strokeLinecap="round" />
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" stroke="url(#pg)" strokeDasharray={`${arcLen} ${C}`} strokeLinecap="round" />
              <defs>
                <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black text-white leading-none">{coveredTypes.length}</span>
              <span className="text-white/30 text-sm font-bold">/ {TYPE_ORDER.length}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: scoreColor }} />
            <span className="font-black text-sm" style={{ color: scoreColor }}>{scoreLabel}</span>
          </div>
          <p className="text-white/20 text-xs mt-1">domaines assurés</p>
        </div>

        {/* Stats */}
        {policies.length > 0 && (
          <div className="relative z-10 flex gap-3 mt-8 mb-6">
            {[
              { label: 'Contrats',  value: String(policies.length),                      color: 'text-white' },
              { label: 'Budget/an', value: totalPremium > 0 ? fmt(totalPremium) : '—',  color: 'text-white' },
              { label: 'Lacunes',   value: String(gapTypes.length),                      color: 'text-rose-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex-1 rounded-2xl px-3 py-3 border bg-white/[0.04]" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">{label}</p>
                <p className={`${color} text-lg font-black mt-0.5 leading-none`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab switcher */}
        <div className="relative z-10 flex gap-1 p-1 bg-white/[0.06] rounded-2xl border border-white/[0.08]">
          {([
            { id: 'contracts',   label: 'Contrats',     Icon: LayoutGrid },
            { id: 'guarantees',  label: 'Par garantie', Icon: Layers },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                activeTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* â”€â”€ CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-[#f1f5f9] px-4 pt-6 pb-24 min-h-[50vh]">

        {/* â•â•â• TAB 1 â€” CONTRATS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'contracts' && (
          policies.length === 0 ? (
            <EmptyState onAdd={onAddPolicy} />
          ) : (
            <div className="space-y-5">
              <SectionLabel count={coveredTypes.length} color="bg-emerald-400" label="Couverts" />
              <div className="grid grid-cols-2 gap-3">
                {coveredTypes.map((type, idx) => {
                  const cfg  = getDomainCfg(type);
                  const grp  = grouped[type];
                  const isHero = idx === 0;
                  const isExp  = expandedType === type;
                  const price  = getPrice(grp[0]);

                  if (isHero) return (
                    <div key={type} className="col-span-2">
                      <button
                        onClick={() => grp.length === 1 ? onSelectPolicy(grp[0]) : setExpandedType(isExp ? null : type)}
                        className={`w-full bg-gradient-to-br ${cfg.gradient} rounded-3xl p-5 shadow-2xl ${cfg.glow} hover:scale-[1.01] active:scale-[0.99] transition-all text-left relative overflow-hidden`}
                      >
                        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20 blur-2xl" style={{ background: cfg.stop1 }} />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                        <div className="relative z-10 flex items-center gap-4">
                          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30 shrink-0 shadow-lg">
                            <cfg.Icon className="w-8 h-8 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white/60 text-[9px] font-black uppercase tracking-[0.2em]">{type}</p>
                            <p className="text-white font-black text-xl leading-tight truncate mt-0.5">{grp[0].name || grp[0].insurer}</p>
                            <p className="text-white/60 text-xs mt-1 truncate">{grp[0].insurer}{grp[0].coverageDetail ? ` · ${grp[0].coverageDetail}` : ''}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {price > 0 && <p className="text-white font-black text-base">{fmt(price)}</p>}
                            {grp.length > 1 && <p className="text-white/60 text-[10px] font-bold mt-0.5">{grp.length} contrats</p>}
                            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center mt-2 ml-auto">
                              <ArrowRight className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        </div>
                      </button>
                      {isExp && grp.length > 1 && (
                        <div className="mt-2 space-y-2 pl-3">
                          {grp.map(p => (
                            <button key={p.id} onClick={() => onSelectPolicy(p)}
                              className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm text-left hover:border-slate-200 active:scale-[0.98] transition-all">
                              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                                <cfg.Icon className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-900 text-sm truncate">{p.name || p.insurer}</p>
                                {getPrice(p) > 0 && <p className="text-xs text-slate-400 font-medium mt-0.5">{fmt(getPrice(p))}/an</p>}
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <button key={type}
                      onClick={() => grp.length === 1 ? onSelectPolicy(grp[0]) : setExpandedType(isExp ? null : type)}
                      className={`bg-gradient-to-br ${cfg.gradient} rounded-3xl p-4 shadow-xl ${cfg.glow} hover:scale-[1.03] active:scale-[0.97] transition-all text-left relative overflow-hidden min-h-[140px] flex flex-col justify-between`}
                    >
                      <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full opacity-20 blur-xl" style={{ background: cfg.stop1 }} />
                      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                      <div className="relative z-10">
                        <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30 mb-3">
                          <cfg.Icon className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-white/60 text-[8px] font-black uppercase tracking-wider">{cfg.short}</p>
                        <p className="text-white font-black text-sm mt-0.5 leading-snug line-clamp-2">{grp[0].name && grp[0].name !== grp[0].insurer ? grp[0].name : grp[0].insurer}</p>
                      </div>
                      <div className="relative z-10 mt-2">
                        {grp.length > 1 ? <span className="text-white/70 text-[10px] font-bold">{grp.length} contrats</span>
                          : price > 0 ? <span className="text-white font-black text-sm">{fmt(price)}<span className="text-white/50 text-[10px] font-bold">/an</span></span>
                          : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {gapTypes.length > 0 && (
                <>
                  <SectionLabel count={gapTypes.length} color="bg-rose-400" label="Non couverts" />
                  <div className="grid grid-cols-3 gap-2.5">
                    {gapTypes.map(type => {
                      const cfg = getDomainCfg(type);
                      return (
                        <button key={type} onClick={onAddPolicy}
                          className="group relative bg-white border-2 border-dashed border-slate-200 rounded-3xl p-3 flex flex-col items-center gap-2 hover:border-slate-400 hover:bg-slate-50 active:scale-95 transition-all min-h-[100px] justify-center">
                          <div className="w-10 h-10 rounded-2xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
                            <cfg.Icon className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                          </div>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-wide leading-tight px-0.5 group-hover:text-slate-500 transition-colors text-center">{cfg.short}</p>
                          <div className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
                            <Plus className="w-3 h-3 text-slate-300 group-hover:text-primary-500 transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )
        )}

        {/* â•â•â• TAB 2 â€” PAR GARANTIE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'guarantees' && (
          policies.length === 0 ? (
            <EmptyState onAdd={onAddPolicy} />
          ) : (
            <div className="space-y-4">
              {/* Loading progress */}
              {loadingCount > 0 && (
                <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 text-primary-600 animate-spin shrink-0" />
                    <p className="text-sm font-black text-slate-900">Chargement des garanties...</p>
                    <span className="ml-auto text-xs text-slate-400 font-bold">{loadedCount}/{policies.length}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
                         style={{ width: `${(loadedCount / policies.length) * 100}%` }} />
                  </div>
                  {/* Per-policy status chips */}
                  <div className="flex flex-wrap gap-2">
                    {policies.map(p => {
                      const cfg = getDomainCfg(p.type);
                      const state = coverageDataMap[p.id];
                      return (
                        <div key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-black border transition-all ${
                          state === 'loading'  ? 'bg-slate-50 text-slate-500 border-slate-200' :
                          state === 'error'    ? 'bg-red-50 text-red-600 border-red-200' :
                          state              ? `${cfg.bgLight} ${cfg.textColor} border-transparent` :
                          'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                          {state === 'loading' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> :
                           state === 'error'   ? <XCircle className="w-2.5 h-2.5" /> :
                           state              ? <CheckCircle2 className="w-2.5 h-2.5" /> :
                           <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />}
                          {p.name || p.insurer}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

{/* Stats summary */}
              {matrix.length > 0 && loadingCount === 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Catégories', value: String(matrix.length),                                              cls: 'text-slate-900',   bg: 'bg-white border-slate-100' },
                    { label: 'Couvertes',  value: String(matrix.filter(r => r.excludedCount === 0).length),           cls: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
                    { label: 'Lacunes',    value: String(matrix.filter(r => r.includedCount === 0).length),           cls: 'text-red-600',     bg: 'bg-red-50 border-red-100' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-2xl p-3 border text-center`}>
                      <p className={`text-xl font-black ${s.cls}`}>{s.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Category cards */}
              {matrix.length > 0 && (
                <div className="space-y-2">
                  {matrix.map(row => {
                    const style      = getCategoryStyle(row.category);
                    const isOpen     = expandedCat === row.category;
                    const totalPol   = row.perPolicy.length;
                    const partialCnt = row.perPolicy.filter(pp => pp.status === 'partial').length;
                    const covRatio   = totalPol > 0 ? (row.includedCount + partialCnt * 0.5) / totalPol : 0;
                    return (
                      <div key={row.category} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                        {/* Colored accent top bar */}
                        <div className={`h-1 ${style.dot}`} />
                        <button
                          onClick={() => setExpandedCat(isOpen ? null : row.category)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/60 active:bg-slate-100/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-slate-800 text-sm">{row.category}</span>
                            {/* Coverage progress bar */}
                            <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{
                                width: `${Math.round(covRatio * 100)}%`,
                                background: covRatio >= 0.8 ? '#34d399' : covRatio >= 0.4 ? '#fbbf24' : '#f87171',
                              }} />
                            </div>
                          </div>
                          {/* Policy avatar circles (overlapping) */}
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            {row.perPolicy.map(pp => (
                              <div key={pp.policyId}
                                className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black shadow-sm ${
                                  pp.status === 'included' ? 'bg-emerald-400 text-white' :
                                  pp.status === 'excluded' ? 'bg-red-400 text-white' :
                                  'bg-amber-400 text-white'
                                }`}
                                title={pp.policyName}>
                                {(pp.policyName || pp.policyInsurer).charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                          {isOpen
                            ? <ChevronUp className="w-4 h-4 text-slate-300 shrink-0 ml-1" />
                            : <ChevronDown className="w-4 h-4 text-slate-300 shrink-0 ml-1" />}
                        </button>

                        {/* Expanded: 2-column policy card grid */}
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-slate-50">
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              {row.perPolicy.map(pp => {
                                const domCfg  = getDomainCfg(pp.policyType);
                                const keyItem = pp.items.find(i => i.included) ?? pp.items[0];
                                return (
                                  <div key={pp.policyId} className={`rounded-xl p-3 ${
                                    pp.status === 'included' ? 'bg-emerald-50 border border-emerald-100' :
                                    pp.status === 'excluded' ? 'bg-red-50 border border-red-100' :
                                    'bg-amber-50 border border-amber-100'
                                  }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${domCfg.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                                        <domCfg.Icon className="w-3.5 h-3.5 text-white" />
                                      </div>
                                      <p className="text-xs font-black text-slate-800 truncate flex-1 leading-snug">{pp.policyName}</p>
                                    </div>
                                    <StatusChip status={pp.status} />
                                    {keyItem?.limit && (
                                      <p className="text-[9px] text-slate-500 mt-2 font-bold">↑ {keyItem.limit}</p>
                                    )}
                                    {keyItem?.note && !keyItem.limit && (
                                      <p className="text-[9px] text-slate-400 mt-2 leading-snug line-clamp-2">{keyItem.note}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

                            {/* Empty: loading not started yet */}
              {loadingCount === 0 && matrix.length === 0 && loadedCount === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-black text-sm uppercase tracking-widest">Aucune donnÃ©e</p>
                  <p className="text-xs mt-1 max-w-[220px] mx-auto">Les garanties dÃ©taillÃ©es apparaissent une fois vos contrats chargÃ©s</p>
                </div>
              )}
            </div>
          )
        )}

      </div>
    </div>
  );
}
