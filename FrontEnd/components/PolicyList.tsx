
import React, { useState } from 'react';
import { 
  FileText, Trash2, Pencil, Globe, ExternalLink, 
  ChevronDown, ChevronUp, Car, Home, Heart, Scale, 
  Briefcase, Shield, AlertCircle, CreditCard, Banknote, Smartphone, Tag
} from 'lucide-react';
import { Policy, PolicyType } from '../types';

interface Props {
  policies: Policy[];
  onDelete: (id: string) => void;
  onEdit: (policy: Policy) => void;
}

export const PolicyList: React.FC<Props> = ({ policies, onDelete, onEdit }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (policies.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-3xl border-2 border-slate-100 border-dashed">
        <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900">Aucun contrat</h3>
        <p className="text-slate-500 max-w-sm mx-auto mt-1 text-sm">Ajoutez vos contrats auto, habitation ou cartes bancaires pour commencer.</p>
      </div>
    );
  }

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

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

  return (
    <div className="flex flex-col gap-4">
      {policies.map((policy) => {
        const isExpanded = expandedId === policy.id;
        const style = getPolicyStyle(policy.type);
        const Icon = style.icon;

        return (
          <div key={policy.id} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'border-primary-400 shadow-lg' : 'border-slate-200 hover:border-primary-200'}`}>
            <div onClick={() => toggleExpand(policy.id)} className="p-4 flex items-center gap-4 cursor-pointer">
              <div className={`p-3 rounded-xl ${style.bg} ${style.color}`}><Icon className="w-5 h-5" /></div>
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-slate-900 truncate">{policy.name}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500 truncate">{policy.provider}</p>
                  {policy.options && policy.options.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-primary-600 font-bold bg-primary-50 px-1.5 py-0.5 rounded">
                      <Tag className="w-2.5 h-2.5" /> {policy.options.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <span className={`hidden sm:inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${style.bg} ${style.color} border-current opacity-70`}>{policy.type}</span>
                 {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-5 animate-fadeIn">
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-grow space-y-3">
                      <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 leading-relaxed border border-slate-100 italic">
                        {policy.summary || "Analyse IA non disponible."}
                      </div>
                      
                      {policy.options && policy.options.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                           {policy.options.map(opt => (
                             <span key={opt} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 uppercase tracking-tight">
                               {opt}
                             </span>
                           ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="sm:w-40 flex flex-col gap-2">
                      <button onClick={() => onEdit(policy)} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50">Modifier</button>
                      <button onClick={() => onDelete(policy.id)} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-red-100 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50">Supprimer</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
