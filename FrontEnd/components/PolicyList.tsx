
import React, { useState } from 'react';
import { 
  Trash2, Pencil, Shield, ChevronDown, Car, Home, Heart, Scale, 
  Briefcase, CreditCard, Banknote, Smartphone, Share2, 
  ChevronRight, Filter, SortAsc, SortDesc, Calendar, Euro, Building2, Info, CheckCircle, Zap, ExternalLink, Globe, Search, Loader2, AlertCircle, FileWarning, Link2, X, Check, FileText, Download
} from 'lucide-react';
import { Policy, PolicyType, User } from '../types';
import { searchPolicyInfo } from '../services/geminiService';
import { generatePortfolioPDF } from '../services/pdfService';

interface Props {
  policies: Policy[];
  onDelete: (id: string) => void;
  onEdit: (policy: Policy) => void;
  onUpdatePolicy?: (policy: Policy) => void;
  user: User;
}

export const PolicyList: React.FC<Props> = ({ policies, onDelete, onEdit, onUpdatePolicy, user }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSearchingLink, setIsSearchingLink] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const getPolicyStyle = (type: PolicyType) => {
    switch (type) {
      case PolicyType.AUTO: return { icon: Car, color: 'text-blue-600', bg: 'bg-blue-50' };
      case PolicyType.HOME: return { icon: Home, color: 'text-orange-600', bg: 'bg-orange-50' };
      case PolicyType.HEALTH: return { icon: Heart, color: 'text-emerald-600', bg: 'bg-emerald-50' };
      case PolicyType.BANK_CARD: return { icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50' };
      case PolicyType.LOAN: return { icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' };
      case PolicyType.MOBILE: return { icon: Smartphone, color: 'text-slate-700', bg: 'bg-slate-100' };
      case PolicyType.LEGAL: return { icon: Scale, color: 'text-purple-600', bg: 'bg-purple-50' };
      case PolicyType.LIFE: return { icon: Briefcase, color: 'text-rose-600', bg: 'bg-rose-50' };
      default: return { icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50' };
    }
  };

  const handleRepairLink = async (policy: Policy) => {
    setIsSearchingLink(policy.id);
    try {
      const result = await searchPolicyInfo(policy.insurer, policy.type, policy.name);
      if (result.sourceUrl && onUpdatePolicy) {
        onUpdatePolicy({ ...policy, sourceUrl: result.sourceUrl, summary: result.summary });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearchingLink(null);
    }
  };

  const handleExportPortfolio = async () => {
    if (policies.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      generatePortfolioPDF(user, policies);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="px-4 flex items-center justify-between">
         <h3 className="font-black text-slate-900 uppercase tracking-tighter">Mon Portefeuille ({policies.length})</h3>
         
         {policies.length > 0 && (
           <button 
             onClick={handleExportPortfolio}
             disabled={isExporting}
             className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
           >
             {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-primary-600" /> : <Download className="w-4 h-4 text-primary-600" />}
             {isExporting ? 'Génération...' : 'Exporter PDF'}
           </button>
         )}
      </div>

      <div className="space-y-4">
        {policies.map((policy) => {
          const isExpanded = expandedId === policy.id;
          const style = getPolicyStyle(policy.type);
          const Icon = style.icon;

          return (
            <div key={policy.id} className={`bg-white rounded-[2.5rem] border transition-all duration-300 ${isExpanded ? 'border-primary-400 shadow-2xl ring-4 ring-primary-50' : 'border-slate-100 hover:border-slate-300'}`}>
              
              <div onClick={() => setExpandedId(isExpanded ? null : policy.id)} className="p-6 flex items-center gap-6 cursor-pointer group">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isExpanded ? 'bg-primary-600 text-white' : style.bg + ' ' + style.color}`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="font-black text-slate-900 truncate">{policy.name}</h4>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{policy.insurer}</p>
                    {policy.coverageDetail && (
                      <span className="text-[8px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full uppercase">
                        {policy.coverageDetail}
                      </span>
                    )}
                  </div>
                </div>
                {policy.sourceUrl && <div className="hidden sm:block"><CheckCircle className="w-5 h-5 text-emerald-500" /></div>}
                <ChevronDown className={`w-5 h-5 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {isExpanded && (
                <div className="px-8 pb-8 animate-fadeIn">
                  <div className="pt-6 border-t border-slate-100 space-y-6">
                    
                    {/* Formule et options */}
                    {(policy.formula || (policy.options && policy.options.length > 0)) && (
                      <div className="bg-gradient-to-br from-primary-50 to-blue-50 p-6 rounded-[2rem] border border-primary-100 space-y-4">
                        {policy.formula && (
                          <div>
                            <label className="text-[10px] font-black text-primary-700 uppercase tracking-widest flex items-center gap-2">
                              <Zap className="w-3 h-3" /> Formule souscrite
                            </label>
                            <p className="text-lg font-black text-primary-900 mt-2">{policy.formula}</p>
                          </div>
                        )}
                        
                        {policy.options && policy.options.length > 0 && (
                          <div>
                            <label className="text-[10px] font-black text-primary-700 uppercase tracking-widest">Options choisies</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {policy.options.map(opt => (
                                <span key={opt} className="px-3 py-1.5 bg-white text-primary-700 text-[10px] font-black uppercase tracking-widest rounded-xl border border-primary-200 shadow-sm">
                                  <Check className="w-3 h-3 inline mr-1" />
                                  {opt}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Document de référence */}
                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-3 h-3" /> Document de référence
                      </label>

                      {(policy as any).centralCgId || (policy as any).userCgId ? (
                        <a 
                          href={`${import.meta.env.VITE_API_URL || ''}/api/cg/${(policy as any).centralCgId ? 'central' : 'user'}/${(policy as any).centralCgId || (policy as any).userCgId}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full p-5 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-widest">
                              Conditions Générales {(policy as any).centralCgId ? '(Standards)' : '(Personnalisées)'}
                            </span>
                          </div>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : policy.sourceUrl ? (
                        <a 
                          href={policy.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full p-5 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-slate-800 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs font-black uppercase tracking-widest">Conditions Générales (.PDF)</span>
                          </div>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <button 
                          onClick={() => handleRepairLink(policy)}
                          disabled={isSearchingLink === policy.id}
                          className="w-full p-6 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold hover:border-primary-400 hover:text-primary-600 transition-all flex flex-col items-center gap-2"
                        >
                          {isSearchingLink === policy.id ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
                          Rechercher les conditions chez {policy.insurer}
                        </button>
                      )}
                    </div>

                    {/* Résumé */}
                    {policy.summary && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Info className="w-3 h-3 text-primary-500" /> Description courte
                        </label>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 text-sm text-slate-700 leading-relaxed shadow-sm">
                          {policy.summary}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-4">
                       <button onClick={() => onEdit(policy)} className="flex-1 py-4 bg-primary-50 text-primary-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-100 transition-all">Modifier</button>
                       <button onClick={() => onDelete(policy.id)} className="flex-1 py-4 bg-white border border-red-100 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all">Supprimer</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {policies.length === 0 && (
          <div className="py-20 text-center space-y-4 opacity-40">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                <Shield className="w-10 h-10 text-slate-300" />
             </div>
             <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Votre portefeuille est vide</p>
          </div>
        )}
      </div>
    </div>
  );
};
