import React, { useState, useEffect } from 'react';
import {
  X, Shield, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  ArrowLeft, Zap, Info, TrendingUp, TrendingDown, Minus as MinusIcon,
  Car, Home, Heart, Scale, Briefcase, CreditCard, Banknote, Smartphone,
  Loader2, Sparkles, Star, Award, ArrowRight, FileText, ExternalLink, Euro
} from 'lucide-react';
import { Policy, PolicyType } from '../types';
import { getCoverageDetails } from '../services/geminiService';

// ─── Types spécifiques à cette page ──────────────────────────────────────────
export interface CoverageItem {
  category: string;
  guarantee: string;
  included: boolean;
  limit?: string;
  note?: string;
  importance: 'key' | 'standard' | 'optional';
}

export interface AlternativeFormula {
  name: string;
  priceVariation: string;   // ex: "+15€/mois", "-8€/mois"
  mainDifference: string;   // ex: "Inclut bris de glace + véhicule de remplacement"
  recommended?: boolean;
}

export interface CoverageData {
  formulaName: string;
  formulaLevel: 'basic' | 'intermediate' | 'premium';
  formulaDescription?: string;
  coverages: CoverageItem[];
  exclusions: string[];
  annualPremiumEstimate?: number;
  keyStrengths: string[];
  keyWeaknesses: string[];
  recommendation?: string;
  alternativeFormulas?: AlternativeFormula[];
}

// ─── Helpers visuels ─────────────────────────────────────────────────────────
const getPolicyIcon = (type: PolicyType) => {
  switch (type) {
    case PolicyType.AUTO:      return Car;
    case PolicyType.HOME:      return Home;
    case PolicyType.HEALTH:    return Heart;
    case PolicyType.BANK_CARD: return CreditCard;
    case PolicyType.LOAN:      return Banknote;
    case PolicyType.MOBILE:    return Smartphone;
    case PolicyType.LEGAL:     return Scale;
    case PolicyType.LIFE:      return Briefcase;
    default:                   return Shield;
  }
};

const getPolicyColor = (type: PolicyType) => {
  switch (type) {
    case PolicyType.AUTO:      return { text: 'text-blue-600',    bg: 'bg-blue-50',    ring: 'ring-blue-200',    gradient: 'from-blue-600 to-indigo-600' };
    case PolicyType.HOME:      return { text: 'text-orange-600',  bg: 'bg-orange-50',  ring: 'ring-orange-200',  gradient: 'from-orange-500 to-amber-500' };
    case PolicyType.HEALTH:    return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200', gradient: 'from-emerald-500 to-teal-500' };
    case PolicyType.LEGAL:     return { text: 'text-purple-600',  bg: 'bg-purple-50',  ring: 'ring-purple-200',  gradient: 'from-purple-500 to-violet-500' };
    case PolicyType.LIFE:      return { text: 'text-rose-600',    bg: 'bg-rose-50',    ring: 'ring-rose-200',    gradient: 'from-rose-500 to-pink-500' };
    default:                   return { text: 'text-slate-600',   bg: 'bg-slate-50',   ring: 'ring-slate-200',   gradient: 'from-slate-600 to-slate-700' };
  }
};

const LEVEL_LABELS: Record<string, { label: string; color: string; icon: typeof Star }> = {
  basic:        { label: 'Essentiel',    color: 'text-amber-600 bg-amber-50 border-amber-200',  icon: MinusIcon },
  intermediate: { label: 'Confort',      color: 'text-blue-600 bg-blue-50 border-blue-200',     icon: Shield },
  premium:      { label: 'Premium',      color: 'text-purple-600 bg-purple-50 border-purple-200', icon: Award },
};

const IMPORTANCE_COLORS: Record<string, string> = {
  key:      'border-l-4 border-l-primary-500',
  standard: 'border-l-4 border-l-slate-300',
  optional: 'border-l-4 border-l-slate-100',
};
const IMPORTANCE_LABELS: Record<string, string> = {
  key:      'Garantie clé',
  standard: 'Standard',
  optional: 'Optionnel',
};

// ─── Skeleton pendant le chargement ─────────────────────────────────────────
const CoverageItemSkeleton: React.FC = () => (
  <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-2xl animate-pulse">
    <div className="w-6 h-6 bg-slate-200 rounded-full flex-shrink-0 mt-0.5" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-slate-200 rounded-full w-3/4" />
      <div className="h-2 bg-slate-100 rounded-full w-1/2" />
    </div>
  </div>
);

// ─── Composant principal ─────────────────────────────────────────────────────
interface Props {
  policy: Policy;
  onClose: () => void;
}

export const CoverageDetailPage: React.FC<Props> = ({ policy, onClose }) => {
  const [coverageData, setCoverageData] = useState<CoverageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const policyColor = getPolicyColor(policy.type as PolicyType);
  const PolicyIcon = getPolicyIcon(policy.type as PolicyType);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadCoverageDetails();
  }, [policy.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const CACHE_KEY = `coverage_v2_${policy.id}_${policy.coverageDetail || policy.coverage || ''}`;

  const loadCoverageDetails = async () => {
    // Check sessionStorage cache first — instant display
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setCoverageData(JSON.parse(cached));
        setIsLoading(false);
        return;
      }
    } catch {
      // sessionStorage unavailable, continue normally
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getCoverageDetails(policy);
      setCoverageData(data);
      // Store in sessionStorage for instant repeat views
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota exceeded or private mode */ }
    } catch (e) {
      setError('Impossible de charger les détails de garanties. Vérifiez votre connexion.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Grouper les garanties par catégorie
  const coveragesByCategory: Record<string, CoverageItem[]> = coverageData
    ? coverageData.coverages.reduce((acc: Record<string, CoverageItem[]>, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      }, {})
    : {};

  const includedCount  = coverageData?.coverages.filter(c => c.included).length ?? 0;
  const excludedCount  = coverageData?.coverages.filter(c => !c.included).length ?? 0;
  const levelInfo      = coverageData ? LEVEL_LABELS[coverageData.formulaLevel] ?? LEVEL_LABELS.intermediate : LEVEL_LABELS.intermediate;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50 overflow-y-auto animate-slideUp">
      {/* ── Header fixe ─────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${policyColor.gradient} text-white sticky top-0 z-10 shadow-xl`}>
        <div style={{height: 'env(safe-area-inset-top, 0px)'}} />
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90 backdrop-blur-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-75">Détail des garanties</p>
              <h1 className="font-black text-lg leading-tight truncate">{policy.name}</h1>
            </div>
            {(policy as any).sourceUrl && (
              <a
                href={(policy as any).sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center hover:bg-white/30 transition-all active:scale-90"
                title="Voir les conditions générales"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
          </div>

          {/* Infos principales */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-2xl">
              <PolicyIcon className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-widest">{policy.insurer}</span>
            </div>
            {(policy.coverageDetail || policy.coverage) && (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-2xl">
                <Zap className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-widest">{policy.coverageDetail || policy.coverage}</span>
              </div>
            )}
            {policy.annualPremium && (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-2xl">
                <Euro className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-widest">{policy.annualPremium}€/an</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Contenu ──────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-5 pb-24">

        {/* Loader */}
        {isLoading && (
          <div className="space-y-4">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Analyse en cours</p>
                <p className="text-xs text-slate-400 font-medium mt-1">L'IA analyse vos garanties...</p>
              </div>
            </div>
            {[1, 2, 3, 4].map(i => <CoverageItemSkeleton key={i} />)}
          </div>
        )}

        {/* Erreur */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-100 rounded-[2rem] p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="font-black text-slate-900">{error}</p>
            <button
              onClick={loadCoverageDetails}
              className="px-8 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all"
            >
              Réessayer
            </button>
          </div>
        )}

        {coverageData && !isLoading && (
          <>
            {/* ── Synthèse ─────────────────────────────────────────── */}
            <div className="space-y-5 animate-fadeIn">
                {/* Score global */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Niveau de couverture</p>
                      <h2 className="text-2xl font-black text-slate-900 mt-1">{coverageData.formulaName}</h2>
                    </div>
                    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl border font-black text-xs uppercase tracking-widest ${levelInfo.color}`}>
                      {React.createElement(levelInfo.icon, { className: 'w-4 h-4' })}
                      {levelInfo.label}
                    </div>
                  </div>

                  {coverageData.formulaDescription && (
                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      {coverageData.formulaDescription}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                      <div className="text-2xl font-black text-emerald-600">{includedCount}</div>
                      <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Incluses</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
                      <div className="text-2xl font-black text-red-500">{excludedCount}</div>
                      <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mt-1">Exclues</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                      <div className="text-2xl font-black text-slate-700">{coverageData.exclusions.length}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Exclusions</div>
                    </div>
                  </div>
                </div>

                {/* Points forts */}
                {coverageData.keyStrengths.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-7 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                      <h3 className="font-black text-emerald-900 uppercase tracking-tight text-sm">Points forts</h3>
                    </div>
                    <ul className="space-y-2">
                      {coverageData.keyStrengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-emerald-800">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="font-medium">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Points faibles */}
                {coverageData.keyWeaknesses.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-[2.5rem] p-7 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center">
                        <TrendingDown className="w-5 h-5 text-amber-600" />
                      </div>
                      <h3 className="font-black text-amber-900 uppercase tracking-tight text-sm">Points faibles</h3>
                    </div>
                    <ul className="space-y-2">
                      {coverageData.keyWeaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-amber-800">
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="font-medium">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommandation */}
                {coverageData.recommendation && (
                  <div className="bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-100 rounded-[2.5rem] p-7 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-2xl flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary-600" />
                      </div>
                      <h3 className="font-black text-primary-900 uppercase tracking-tight text-sm">Recommandation IA</h3>
                    </div>
                    <p className="text-sm text-primary-800 leading-relaxed font-medium bg-white/60 p-4 rounded-2xl border border-primary-100">
                      {coverageData.recommendation}
                    </p>
                  </div>
                )}

                {/* Exclusions */}
                {coverageData.exclusions.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-[2.5rem] p-7 space-y-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-red-500" />
                      </div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Exclusions importantes</h3>
                    </div>
                    <ul className="space-y-2">
                      {coverageData.exclusions.map((excl, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-600 py-2 border-b border-slate-50 last:border-0">
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <span>{excl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CoverageDetailPage;
