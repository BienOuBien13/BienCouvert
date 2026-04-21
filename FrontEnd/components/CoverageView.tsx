// =============================================================================
// CoverageView — Vue "Garanties" disruptive
// Arc de score + bento-grid de tuiles colorées (couvertes) + fantômes (lacunes)
// =============================================================================

import React, { useState } from 'react';
import { Policy, PolicyType } from '../types';
import {
  Car, Home, HeartPulse, Heart, Scale, CreditCard,
  Banknote, Smartphone, Shield, Plus, ArrowRight, ChevronRight,
} from 'lucide-react';

interface Props {
  policies: Policy[];
  onSelectPolicy: (policy: Policy) => void;
  onAddPolicy: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config visuelle par domaine
// ─────────────────────────────────────────────────────────────────────────────
const DOMAIN_CFG: Record<string, {
  Icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  glow: string;
  short: string;
  stop1: string;
  stop2: string;
}> = {
  [PolicyType.AUTO]:      { Icon: Car,        gradient: 'from-sky-400 to-blue-700',      glow: 'shadow-sky-500/50',    short: 'Auto',        stop1: '#38bdf8', stop2: '#1d4ed8' },
  [PolicyType.HOME]:      { Icon: Home,       gradient: 'from-violet-400 to-purple-800', glow: 'shadow-violet-500/50', short: 'Habitation',  stop1: '#a78bfa', stop2: '#5b21b6' },
  [PolicyType.HEALTH]:    { Icon: HeartPulse, gradient: 'from-rose-400 to-pink-700',     glow: 'shadow-rose-500/50',   short: 'Santé',       stop1: '#fb7185', stop2: '#be185d' },
  [PolicyType.LIFE]:      { Icon: Heart,      gradient: 'from-red-400 to-rose-800',      glow: 'shadow-red-500/50',    short: 'Prévoyance',  stop1: '#f87171', stop2: '#9f1239' },
  [PolicyType.LEGAL]:     { Icon: Scale,      gradient: 'from-amber-400 to-orange-600',  glow: 'shadow-amber-500/50',  short: 'Juridique',   stop1: '#fbbf24', stop2: '#ea580c' },
  [PolicyType.BANK_CARD]: { Icon: CreditCard, gradient: 'from-teal-400 to-emerald-700',  glow: 'shadow-teal-500/50',   short: 'Carte',       stop1: '#2dd4bf', stop2: '#047857' },
  [PolicyType.LOAN]:      { Icon: Banknote,   gradient: 'from-green-400 to-emerald-800', glow: 'shadow-green-500/50',  short: 'Emprunteur',  stop1: '#4ade80', stop2: '#065f46' },
  [PolicyType.MOBILE]:    { Icon: Smartphone, gradient: 'from-slate-400 to-slate-700',   glow: 'shadow-slate-500/50',  short: 'Appareils',   stop1: '#94a3b8', stop2: '#1e293b' },
  [PolicyType.OTHER]:     { Icon: Shield,     gradient: 'from-indigo-400 to-indigo-800', glow: 'shadow-indigo-500/50', short: 'Autre',       stop1: '#818cf8', stop2: '#312e81' },
};

const TYPE_ORDER = [
  PolicyType.AUTO, PolicyType.HOME, PolicyType.HEALTH, PolicyType.LIFE,
  PolicyType.LEGAL, PolicyType.BANK_CARD, PolicyType.LOAN, PolicyType.MOBILE, PolicyType.OTHER,
];

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const getPrice = (p: Policy) => p.annualPremium || (p as any).premium || 0;

// ─────────────────────────────────────────────────────────────────────────────

export default function CoverageView({ policies, onSelectPolicy, onAddPolicy }: Props) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const grouped = policies.reduce<Record<string, Policy[]>>((acc, p) => {
    const k = p.type || PolicyType.OTHER;
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});

  const coveredTypes = TYPE_ORDER.filter(t => grouped[t]?.length);
  const gapTypes = TYPE_ORDER.filter(t => !grouped[t]?.length);
  const totalTypes = TYPE_ORDER.length;
  const pct = coveredTypes.length / totalTypes;
  const totalPremium = policies.reduce((s, p) => s + getPrice(p), 0);

  const scoreLabel =
    pct >= 0.8 ? 'Excellent' :
    pct >= 0.55 ? 'Bien couvert' :
    pct >= 0.33 ? 'À compléter' : 'Insuffisant';
  const scoreColor =
    pct >= 0.8 ? '#34d399' :
    pct >= 0.55 ? '#38bdf8' :
    pct >= 0.33 ? '#fbbf24' : '#f87171';

  // SVG arc: 270° sweep (from 135° to 45°), radius 52
  const R = 52;
  const C = 2 * Math.PI * R;
  const arcLen = pct * C * 0.75;

  return (
    // bleed to main's p-3 edges
    <div className="-mx-3 -mt-3 animate-fadeIn">

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* HERO — Dark atmospheric header                                       */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div className="relative bg-[#060c18] overflow-hidden px-5 pt-10 pb-12">
        {/* Ambient blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full opacity-25 blur-[90px]"
               style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute top-0 right-1/4 w-64 h-64 rounded-full opacity-20 blur-[90px]"
               style={{ background: 'radial-gradient(circle, #38bdf8, transparent)' }} />
        </div>

        {/* Label */}
        <p className="relative z-10 text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mb-8 text-center">
          Votre Bouclier
        </p>

        {/* Score ring */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[135deg]">
              {/* Track */}
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7"
                stroke="#ffffff08"
                strokeDasharray={`${C * 0.75} ${C}`}
                strokeLinecap="round" />
              {/* Progress */}
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7"
                stroke={`url(#pg)`}
                strokeDasharray={`${arcLen} ${C}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
              <defs>
                <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
            </svg>
            {/* Center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <span className="text-5xl font-black text-white leading-none tracking-tight">
                {coveredTypes.length}
              </span>
              <span className="text-white/30 text-sm font-bold">/ {totalTypes}</span>
            </div>
          </div>

          {/* Score badge */}
          <div className="mt-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: scoreColor }} />
            <span className="font-black text-sm" style={{ color: scoreColor }}>{scoreLabel}</span>
          </div>
          <p className="text-white/20 text-xs mt-1">domaines assurés</p>
        </div>

        {/* Stats row */}
        {policies.length > 0 && (
          <div className="relative z-10 flex gap-3 mt-8">
            {[
              { label: 'Contrats',     value: String(policies.length), color: 'text-white' },
              { label: 'Budget/an',    value: totalPremium > 0 ? fmt(totalPremium) : '—', color: 'text-white' },
              { label: 'Lacunes',      value: String(gapTypes.length), color: 'text-rose-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex-1 rounded-2xl px-3 py-3 border bg-white/[0.04]"
                   style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">{label}</p>
                <p className={`${color} text-lg font-black mt-0.5 leading-none`}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* CONTENT                                                              */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#f1f5f9] px-4 pt-6 pb-24 min-h-[50vh] space-y-6">

        {policies.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 gap-5">
            <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
              <Shield className="w-11 h-11 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="font-black text-slate-900 text-lg">Aucun contrat</p>
              <p className="text-slate-500 text-sm mt-2 max-w-[220px] leading-relaxed mx-auto">
                Ajoutez vos contrats d'assurance pour visualiser votre protection
              </p>
            </div>
            <button onClick={onAddPolicy}
              className="px-8 py-4 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-900/20">
              + Premier contrat
            </button>
          </div>
        ) : (
          <>
            {/* ── COUVERTS ──────────────────────────────────────────────── */}
            {coveredTypes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4 px-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Couverts
                  </span>
                  <span className="w-5 h-5 rounded-full bg-emerald-400 text-white text-[9px] font-black flex items-center justify-center">
                    {coveredTypes.length}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {coveredTypes.map((type, idx) => {
                    const cfg = DOMAIN_CFG[type] ?? DOMAIN_CFG[PolicyType.OTHER];
                    const group = grouped[type];
                    const isHero = idx === 0;
                    const isExpanded = expandedType === type;
                    const price = getPrice(group[0]);

                    /* ── Hero tile (full width) ── */
                    if (isHero) {
                      return (
                        <div key={type} className="col-span-2">
                          <button
                            onClick={() => {
                              if (group.length === 1) onSelectPolicy(group[0]);
                              else setExpandedType(isExpanded ? null : type);
                            }}
                            className={`w-full bg-gradient-to-br ${cfg.gradient} rounded-3xl p-5 shadow-2xl ${cfg.glow} hover:scale-[1.01] active:scale-[0.99] transition-all text-left relative overflow-hidden`}
                          >
                            {/* Decorative blob */}
                            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20 blur-2xl"
                                 style={{ background: cfg.stop1 }} />
                            {/* Subtle grid */}
                            <div className="absolute inset-0 opacity-5"
                                 style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />

                            <div className="relative z-10 flex items-center gap-4">
                              {/* Icon */}
                              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30 shrink-0 shadow-lg">
                                <cfg.Icon className="w-8 h-8 text-white" />
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-white/60 text-[9px] font-black uppercase tracking-[0.2em]">{type}</p>
                                <p className="text-white font-black text-xl leading-tight truncate mt-0.5">
                                  {group[0].name || group[0].insurer}
                                </p>
                                <p className="text-white/60 text-xs mt-1 truncate">
                                  {group[0].insurer}
                                  {group[0].coverageDetail ? ` · ${group[0].coverageDetail}` : ''}
                                  {group[0].coverage && !group[0].coverageDetail ? ` · ${group[0].coverage}` : ''}
                                </p>
                              </div>
                              {/* Right */}
                              <div className="shrink-0 text-right">
                                {price > 0 && (
                                  <p className="text-white font-black text-base">{fmt(price)}</p>
                                )}
                                {group.length > 1 && (
                                  <p className="text-white/60 text-[10px] font-bold mt-0.5">{group.length} contrats</p>
                                )}
                                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center mt-2 ml-auto">
                                  <ArrowRight className="w-4 h-4 text-white" />
                                </div>
                              </div>
                            </div>
                          </button>

                          {/* Expanded sub-contracts */}
                          {isExpanded && group.length > 1 && (
                            <div className="mt-2 space-y-2 pl-3">
                              {group.map(p => (
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
                    }

                    /* ── Regular tile (half-width) ── */
                    return (
                      <button key={type}
                        onClick={() => {
                          if (group.length === 1) onSelectPolicy(group[0]);
                          else setExpandedType(isExpanded ? null : type);
                        }}
                        className={`bg-gradient-to-br ${cfg.gradient} rounded-3xl p-4 shadow-xl ${cfg.glow} hover:scale-[1.03] active:scale-[0.97] transition-all text-left relative overflow-hidden min-h-[140px] flex flex-col justify-between`}
                      >
                        {/* Decoration */}
                        <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full opacity-20 blur-xl"
                             style={{ background: cfg.stop1 }} />
                        <div className="absolute inset-0 opacity-[0.04]"
                             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '12px 12px' }} />

                        <div className="relative z-10">
                          {/* Icon chip */}
                          <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/30 mb-3">
                            <cfg.Icon className="w-5 h-5 text-white" />
                          </div>
                          <p className="text-white/60 text-[8px] font-black uppercase tracking-wider leading-none">{cfg.short}</p>
                          <p className="text-white font-black text-sm mt-0.5 leading-snug line-clamp-2">
                            {group[0].name && group[0].name !== group[0].insurer ? group[0].name : group[0].insurer}
                          </p>
                        </div>

                        <div className="relative z-10 mt-2">
                          {group.length > 1 ? (
                            <span className="text-white/70 text-[10px] font-bold">{group.length} contrats</span>
                          ) : price > 0 ? (
                            <span className="text-white font-black text-sm">{fmt(price)}<span className="text-white/50 text-[10px] font-bold">/an</span></span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── LACUNES ───────────────────────────────────────────────── */}
            {gapTypes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4 px-0.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Non couverts
                  </span>
                  <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-[9px] font-black flex items-center justify-center">
                    {gapTypes.length}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {gapTypes.map(type => {
                    const cfg = DOMAIN_CFG[type] ?? DOMAIN_CFG[PolicyType.OTHER];
                    return (
                      <button key={type} onClick={onAddPolicy}
                        className="group relative bg-white border-2 border-dashed border-slate-200 rounded-3xl p-3 flex flex-col items-center gap-2 text-center hover:border-slate-400 hover:bg-slate-50 active:scale-95 transition-all overflow-hidden min-h-[100px] justify-center">
                        {/* Ghost icon */}
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
                          <cfg.Icon className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                        </div>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wide leading-tight px-0.5 group-hover:text-slate-500 transition-colors">
                          {cfg.short}
                        </p>
                        <div className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
                          <Plus className="w-3 h-3 text-slate-300 group-hover:text-primary-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
