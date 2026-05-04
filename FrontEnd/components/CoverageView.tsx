// =============================================================================
// CoverageView -- Vue "Garanties"
//   Tab 1 . Mes contrats : dashboard par type d'assurance (simple, leger)
//   Tab 2 . Par besoin   : analyse IA cross-contrats (regroupement intelligent)
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Policy, PolicyType } from '../types';
import { getCoverageDetails, groupCoveragesByNeed } from '../services/geminiService';
import type { GroupedNeed } from '../services/geminiService';
import type { CoverageData } from './CoverageDetailPage';
import {
  Car, Home, HeartPulse, Heart, Scale, CreditCard,
  Banknote, Smartphone, Shield, ArrowRight, ChevronRight,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, AlertCircle,
  LayoutGrid, Sparkles,
} from 'lucide-react';

// Types

type ViewTab = 'contracts' | 'needs';
type CoverageMapValue = CoverageData | 'loading' | 'error';

interface Props {
  policies: Policy[];
  onSelectPolicy: (policy: Policy) => void;
  onAddPolicy: () => void;
}

// Domain config

const DOMAIN_CFG: Record<string, {
  Icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  short: string;
}> = {
  [PolicyType.AUTO]:      { Icon: Car,        gradient: 'from-sky-400 to-blue-700',      short: 'Auto'       },
  [PolicyType.HOME]:      { Icon: Home,       gradient: 'from-violet-400 to-purple-800', short: 'Habitation' },
  [PolicyType.HEALTH]:    { Icon: HeartPulse, gradient: 'from-rose-400 to-pink-700',     short: 'Sante'      },
  [PolicyType.LIFE]:      { Icon: Heart,      gradient: 'from-red-400 to-rose-800',      short: 'Prevoyance' },
  [PolicyType.LEGAL]:     { Icon: Scale,      gradient: 'from-amber-400 to-orange-600',  short: 'Juridique'  },
  [PolicyType.BANK_CARD]: { Icon: CreditCard, gradient: 'from-teal-400 to-emerald-700',  short: 'Carte'      },
  [PolicyType.LOAN]:      { Icon: Banknote,   gradient: 'from-green-400 to-emerald-800', short: 'Emprunteur' },
  [PolicyType.MOBILE]:    { Icon: Smartphone, gradient: 'from-slate-400 to-slate-700',   short: 'Appareils'  },
  [PolicyType.OTHER]:     { Icon: Shield,     gradient: 'from-indigo-400 to-indigo-800', short: 'Autre'      },
};

const TYPE_ORDER = [
  PolicyType.AUTO, PolicyType.HOME, PolicyType.HEALTH, PolicyType.LIFE,
  PolicyType.LEGAL, PolicyType.BANK_CARD, PolicyType.LOAN, PolicyType.MOBILE, PolicyType.OTHER,
];

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const getPrice = (p: Policy): number => (p as any).annualPremium || (p as any).premium || 0;

const getDomainCfg = (type: string) => DOMAIN_CFG[type] ?? DOMAIN_CFG[PolicyType.OTHER];

// EmptyState

const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-5">
    <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
      <Shield className="w-11 h-11 text-slate-300" />
    </div>
    <div className="text-center">
      <p className="font-black text-slate-900 text-lg">Aucun contrat</p>
      <p className="text-slate-400 text-sm mt-2 max-w-[220px] leading-relaxed mx-auto">
        Ajoutez vos contrats pour visualiser vos garanties
      </p>
    </div>
    <button
      onClick={onAdd}
      className="px-8 py-4 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all"
    >
      + Premier contrat
    </button>
  </div>
);

// Main component

export default function CoverageView({ policies, onSelectPolicy, onAddPolicy }: Props) {
  const [activeTab, setActiveTab] = useState<ViewTab>('contracts');
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [expandedNeed, setExpandedNeed] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [coverageDataMap, setCoverageDataMap] = useState<Record<string, CoverageMapValue>>({});
  const [groupedNeeds, setGroupedNeeds] = useState<GroupedNeed[] | null>(null);
  const [needsLoading, setNeedsLoading] = useState(false);
  const [needsError, setNeedsError] = useState(false);

  const grouped = policies.reduce<Record<string, Policy[]>>((acc, p) => {
    const k = p.type || PolicyType.OTHER;
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});

  // Types dans le portefeuille mais hors TYPE_ORDER (ex: "Professionnel", types custom)
  const extraTypes = Object.keys(grouped).filter(t => !TYPE_ORDER.includes(t as PolicyType));
  const allTypes = [...TYPE_ORDER, ...extraTypes];

  const coveredTypes = allTypes.filter(t => grouped[t]?.length);
  const gapTypes = TYPE_ORDER.filter(t => !grouped[t]?.length);

  useEffect(() => {
    if (activeTab !== 'needs' || policies.length === 0) return;
    const toLoad = policies.filter(p => !(p.id in coverageDataMap));
    if (toLoad.length === 0) return;

    setCoverageDataMap(prev => {
      const upd: Record<string, CoverageMapValue> = {};
      toLoad.forEach(p => { upd[p.id] = 'loading'; });
      return { ...prev, ...upd };
    });

    toLoad.forEach(async (policy) => {
      const cacheKey = `cov_v2_${policy.id}_${(policy as any).coverageDetail || (policy as any).coverage || ''}`;
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

  const loadedCount = policies.filter(
    p => coverageDataMap[p.id] && coverageDataMap[p.id] !== 'loading' && coverageDataMap[p.id] !== 'error'
  ).length;
  const loadingCount = policies.filter(p => coverageDataMap[p.id] === 'loading').length;
  const allLoaded = policies.length > 0 && policies.every(p =>
    coverageDataMap[p.id] && coverageDataMap[p.id] !== 'loading'
  );

  useEffect(() => {
    if (!allLoaded || groupedNeeds !== null || needsLoading || needsError) return;

    const cacheKey = `grouped_needs_v1_${policies.map(p => p.id).sort().join(',')}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setGroupedNeeds(JSON.parse(cached)); return; }
    } catch { /* ignore */ }

    const policyData = policies.map(p => {
      const data = coverageDataMap[p.id];
      return {
        id: String(p.id),
        name: p.name || p.insurer,
        type: p.type,
        insurer: p.insurer,
        items: (data && data !== 'loading' && data !== 'error')
          ? (data as CoverageData).coverages
          : [],
      };
    });

    setNeedsLoading(true);
    groupCoveragesByNeed(policyData)
      .then(needs => {
        setGroupedNeeds(needs);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(needs)); } catch { /* ignore */ }
      })
      .catch(() => setNeedsError(true))
      .finally(() => setNeedsLoading(false));
  }, [allLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsByCategory = (groupedNeeds ?? []).reduce<Record<string, GroupedNeed[]>>((acc, n) => {
    if (!acc[n.category]) acc[n.category] = [];
    acc[n.category].push(n);
    return acc;
  }, {});

  return (
    <div className="-mx-3 -mt-3 animate-fadeIn">

      {/* TAB SWITCHER — visible, sticky */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 shadow-sm">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          {([
            { id: 'contracts' as ViewTab, label: 'Mes contrats', Icon: LayoutGrid },
            { id: 'needs'     as ViewTab, label: 'Par besoin',   Icon: Sparkles   },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                activeTab === id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENU */}
      <div className="bg-[#f1f5f9] px-4 pt-6 pb-24 min-h-[50vh]">

        {/* ONGLET 1 -- MES CONTRATS */}
        {activeTab === 'contracts' && (
          policies.length === 0
            ? <EmptyState onAdd={onAddPolicy} />
            : (
              <div className="space-y-3">
                {coveredTypes.map(type => {
                  const cfg = getDomainCfg(type);
                  const grp = grouped[type];
                  const isExp = expandedType === type;

                  return (
                    <div key={type} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                      <button
                        onClick={() => grp.length > 1 && setExpandedType(isExp ? null : type)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                          <cfg.Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 text-sm">{cfg.short}</p>
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {grp.length === 1 ? grp[0].insurer : `${grp.length} contrats`}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {grp.length === 1 && getPrice(grp[0]) > 0 && (
                            <span className="text-xs font-black text-slate-500">
                              {fmt(getPrice(grp[0]))}<span className="text-slate-300">/an</span>
                            </span>
                          )}
                          {grp.length === 1 ? (
                            <button
                              onClick={e => { e.stopPropagation(); onSelectPolicy(grp[0]); }}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                            >
                              <ArrowRight className="w-4 h-4 text-slate-400" />
                            </button>
                          ) : (
                            isExp
                              ? <ChevronUp className="w-4 h-4 text-slate-300" />
                              : <ChevronDown className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                      </button>

                      {grp.length > 1 && isExp && (
                        <div className="border-t border-slate-50 divide-y divide-slate-50">
                          {grp.map(p => (
                            <button
                              key={p.id}
                              onClick={() => onSelectPolicy(p)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{p.name || p.insurer}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  {p.insurer}{(p as any).coverageDetail ? ` . ${(p as any).coverageDetail}` : ''}
                                </p>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {getPrice(p) > 0 && (
                                  <span className="text-xs font-black text-slate-500">
                                    {fmt(getPrice(p))}<span className="text-slate-300">/an</span>
                                  </span>
                                )}
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {gapTypes.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">
                      Non couverts - {gapTypes.length}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {gapTypes.map(type => {
                        const cfg = getDomainCfg(type);
                        return (
                          <button
                            key={type}
                            onClick={onAddPolicy}
                            className="group bg-white border-2 border-dashed border-slate-200 rounded-2xl p-3 flex flex-col items-center gap-2 hover:border-slate-300 active:scale-95 transition-all min-h-[90px] justify-center"
                          >
                            <div className="w-9 h-9 rounded-xl bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center transition-colors">
                              <cfg.Icon className="w-4 h-4 text-slate-300" />
                            </div>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-wide text-center">
                              {cfg.short}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
        )}

        {/* ONGLET 2 -- PAR BESOIN (IA) */}
        {activeTab === 'needs' && (
          policies.length === 0
            ? <EmptyState onAdd={onAddPolicy} />
            : (
              <div className="space-y-4">

                {loadingCount > 0 && (
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
                      <p className="text-sm font-black text-slate-900">Lecture des garanties...</p>
                      <span className="ml-auto text-xs text-slate-400 font-bold">
                        {loadedCount}/{policies.length}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full transition-all duration-500"
                        style={{ width: `${(loadedCount / policies.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {allLoaded && needsLoading && (
                  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">Analyse IA en cours...</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Regroupement intelligent de vos garanties
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {needsError && (
                  <div className="bg-red-50 rounded-2xl p-5 border border-red-100 text-center">
                    <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm font-black text-red-700">Analyse indisponible</p>
                    <button
                      onClick={() => { setNeedsError(false); setGroupedNeeds(null); }}
                      className="mt-3 text-xs font-bold text-red-600 underline"
                    >
                      Reessayer
                    </button>
                  </div>
                )}

                {groupedNeeds && groupedNeeds.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Analyse IA - {groupedNeeds.length} besoins identifies
                      </p>
                    </div>

                    {Object.entries(needsByCategory).map(([category, needs]) => {
                      const isCatOpen = expandedCategory === null || expandedCategory === category;
                      return (
                        <div key={category}>
                          <button
                            onClick={() =>
                              setExpandedCategory(expandedCategory === category ? null : category)
                            }
                            className="w-full flex items-center gap-2 px-1 mb-2 text-left"
                          >
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex-1">
                              {category}
                            </p>
                            <span className="text-[9px] text-slate-400 font-bold">{needs.length}</span>
                            {isCatOpen
                              ? <ChevronUp className="w-3 h-3 text-slate-300" />
                              : <ChevronDown className="w-3 h-3 text-slate-300" />
                            }
                          </button>

                          {isCatOpen && (
                            <div className="space-y-2 mb-3">
                              {needs.map(need => {
                                const needKey = `${category}__${need.need}`;
                                const isOpen = expandedNeed === needKey;
                                const fullCount = need.coveringPolicies.filter(p => p.level === 'full').length;
                                const partialCount = need.coveringPolicies.filter(p => p.level === 'partial').length;
                                const totalCovering = fullCount + partialCount;

                                return (
                                  <div
                                    key={need.need}
                                    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100"
                                  >
                                    <button
                                      onClick={() => setExpandedNeed(isOpen ? null : needKey)}
                                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                                    >
                                      <span className="text-xl shrink-0">{need.emoji}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm">{need.need}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                          {totalCovering === 0
                                            ? 'Non couvert'
                                            : `${totalCovering} contrat${totalCovering > 1 ? 's' : ''}`
                                          }
                                          {fullCount > 0 && partialCount > 0
                                            ? ` - ${partialCount} partiel${partialCount > 1 ? 's' : ''}`
                                            : ''
                                          }
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {need.coveringPolicies.map(cp => (
                                          <div
                                            key={cp.policyId}
                                            className={`w-2.5 h-2.5 rounded-full ${
                                              cp.level === 'full'
                                                ? 'bg-emerald-400'
                                                : cp.level === 'partial'
                                                ? 'bg-amber-400'
                                                : 'bg-slate-200'
                                            }`}
                                            title={cp.policyName}
                                          />
                                        ))}
                                      </div>
                                      {isOpen
                                        ? <ChevronUp className="w-4 h-4 text-slate-300 shrink-0" />
                                        : <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
                                      }
                                    </button>

                                    {isOpen && (
                                      <div className="border-t border-slate-50 px-4 py-3 space-y-2">
                                        {need.coveringPolicies.map(cp => {
                                          const policy = policies.find(
                                            p => String(p.id) === String(cp.policyId)
                                          );
                                          const domCfg = getDomainCfg(policy?.type ?? PolicyType.OTHER);
                                          return (
                                            <div
                                              key={cp.policyId}
                                              className={`flex items-start gap-3 p-3 rounded-xl ${
                                                cp.level === 'full'
                                                  ? 'bg-emerald-50 border border-emerald-100'
                                                  : cp.level === 'partial'
                                                  ? 'bg-amber-50 border border-amber-100'
                                                  : 'bg-slate-50 border border-slate-100'
                                              }`}
                                            >
                                              <div
                                                className={`w-7 h-7 rounded-xl bg-gradient-to-br ${domCfg.gradient} flex items-center justify-center shrink-0 mt-0.5`}
                                              >
                                                <domCfg.Icon className="w-3.5 h-3.5 text-white" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <p className="text-xs font-black text-slate-800">
                                                    {cp.policyName}
                                                  </p>
                                                  {cp.level === 'full' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-700">
                                                      <CheckCircle2 className="w-2.5 h-2.5" /> Couvert
                                                    </span>
                                                  ) : cp.level === 'partial' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700">
                                                      <AlertCircle className="w-2.5 h-2.5" /> Partiel
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700">
                                                      <XCircle className="w-2.5 h-2.5" /> Exclu
                                                    </span>
                                                  )}
                                                </div>
                                                {cp.detail && (
                                                  <p className="text-[11px] text-slate-500 mt-1">{cp.detail}</p>
                                                )}
                                              </div>
                                              {policy && (
                                                <button
                                                  onClick={() => onSelectPolicy(policy)}
                                                  className="p-1.5 rounded-lg bg-white/70 hover:bg-white active:bg-slate-50 transition-colors shrink-0"
                                                  title="Voir les garanties detaillees"
                                                >
                                                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                                                </button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {loadingCount === 0 && !allLoaded && !needsLoading && !groupedNeeds && (
                  <div className="text-center py-12 text-slate-400">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="font-black text-sm uppercase tracking-widest">Chargement...</p>
                  </div>
                )}

              </div>
            )
        )}

      </div>
    </div>
  );
}
