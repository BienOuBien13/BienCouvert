// -----------------------------------------------------------------------------
// Liste des contrats affichés dans l'UI
// - Affiche un résumé, badge de type, actions (modifier/supprimer) et source
// - Composant présentational : se contente d'afficher les données fournies
// -----------------------------------------------------------------------------
import React, { useState } from 'react';
import { 
  FileText, Trash2, Pencil, Globe, ExternalLink, 
  ChevronDown, ChevronUp, Car, Home, Heart, Scale, 
  Briefcase, Shield, AlertCircle
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
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
        <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-slate-900">Aucun contrat enregistré</h3>
        <p className="text-slate-500 max-w-sm mx-auto mt-1">
          Ajoutez vos assurances pour commencer à optimiser votre couverture.
        </p>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Helper pour obtenir l'icône et la couleur selon le type
  const getPolicyStyle = (type: PolicyType) => {
    switch (type) {
      case PolicyType.AUTO:
        return { icon: Car, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' };
      case PolicyType.HOME:
        return { icon: Home, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' };
      case PolicyType.HEALTH:
        return { icon: Heart, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' };
      case PolicyType.LEGAL:
        return { icon: Scale, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' };
      case PolicyType.LIFE:
        return { icon: Briefcase, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' };
      default:
        return { icon: Shield, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {policies.map((policy) => {
        const isExpanded = expandedId === policy.id;
        const style = getPolicyStyle(policy.type);
        const Icon = style.icon;

        return (
          <div 
            key={policy.id} 
            className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden ${isExpanded ? 'border-primary-200 shadow-md ring-1 ring-primary-50' : 'border-slate-200 hover:border-primary-200 hover:shadow-sm'}`}
          >
            {/* Header Compact (Toujours visible) */}
            <div 
              onClick={() => toggleExpand(policy.id)}
              className="p-4 flex items-center gap-4 cursor-pointer select-none group"
            >
              {/* Icône Type */}
              <div className={`p-2.5 rounded-lg flex-shrink-0 ${style.bg} ${style.color}`}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Informations Principales */}
              <div className="flex-grow min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                
                {/* Nom & Assureur */}
                <div className="sm:col-span-5">
                  <h3 className="font-semibold text-slate-900 truncate">{policy.name}</h3>
                  <p className="text-sm text-slate-500 truncate">{policy.provider}</p>
                </div>

                {/* Badges Info */}
                <div className="sm:col-span-7 flex flex-wrap items-center gap-2 sm:justify-end">
                  {policy.coverageDetail && (
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200 truncate max-w-[150px]">
                      {policy.coverageDetail}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${style.bg} ${style.color} ${style.border}`}>
                    {policy.type}
                  </span>
                  
                  {/* Source Icon (Petit indicateur) */}
                  <div className="text-slate-300 px-1 hidden sm:block">
                    {policy.sourceUrl ? <Globe className="w-4 h-4 text-indigo-400" /> : <FileText className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
              </div>

              {/* Chevron */}
              <div className="flex-shrink-0 text-slate-400 group-hover:text-primary-600 transition-colors">
                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </div>

            {/* Body Détails (Visible si étendu) */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-0 animate-fadeIn">
                <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-6">
                  
                  {/* Résumé IA */}
                  <div className="flex-grow">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                       Résumé du contrat
                    </h4>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 leading-relaxed border border-slate-100">
                      {policy.summary || (
                        <span className="text-slate-400 italic flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> Analyse en attente ou non disponible.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions et Liens */}
                  <div className="sm:w-48 flex-shrink-0 flex flex-col gap-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                       Actions
                    </h4>
                    
                    {/* Lien Source */}
                    {policy.sourceUrl ? (
                      <a 
                        href={policy.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100"
                      >
                        <Globe className="w-4 h-4" />
                        Voir en ligne
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </a>
                    ) : policy.fileName ? (
                       <div className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 cursor-default" title={policy.fileName || ''}>
                        <FileText className="w-4 h-4" />
                        <span className="truncate max-w-[100px]">PDF Stocké</span>
                      </div>
                    ) : null}

                    <div className="flex gap-2 mt-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(policy); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                        Modifier
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(policy.id); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-300 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Suppr.
                      </button>
                    </div>
                    
                    <div className="text-[10px] text-slate-400 text-center mt-1">
                      Ajouté le {new Date(policy.addedAt).toLocaleDateString()}
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