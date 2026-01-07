// -----------------------------------------------------------------------------
// Vue d'analyse / détection de doublons
// - Lance une analyse via `detectDuplicates` (backend) et affiche les
//   résultats structurés (sévérité, description, polices impliquées).
// -----------------------------------------------------------------------------
import React, { useState } from 'react';
import { AlertTriangle, Search, CheckCircle2, Info, AlertOctagon } from 'lucide-react';
import { Policy, DuplicateFinding } from '../types';
import { detectDuplicates } from '../services/geminiService';

interface Props {
  policies: Policy[];
}

export const AnalysisView: React.FC<Props> = ({ policies }) => {
  const [findings, setFindings] = useState<DuplicateFinding[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const handleAnalyze = async () => {
    // L'analyse nécessite au moins 2 contrats pour trouver des chevauchements
    if (policies.length < 2) return;
    setIsAnalyzing(true);
    try {
      // Appel backend qui exécute un pipeline AI pour détecter chevauchements
      const results = await detectDuplicates(policies);
      setFindings(results);
      setHasAnalyzed(true);
    } catch (error) {
      // On log l'erreur et on laisse l'UI montrer un état vide
      console.error("Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-50 text-red-700 border-red-200';
      case 'medium': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'low': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertOctagon className="w-5 h-5 text-red-600" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'low': return <Info className="w-5 h-5 text-blue-600" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  if (policies.length < 2) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center h-full flex flex-col justify-center items-center">
        <div className="bg-slate-100 p-3 rounded-full mb-4">
          <Search className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Analyse des doublons indisponible</h3>
        <p className="text-slate-500 max-w-md">
          Vous devez ajouter au moins deux contrats d'assurance pour que notre IA puisse détecter les chevauchements de garanties.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full min-h-[400px]">
      <div className="p-6 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Analyse de Doublons
          </h2>
          <p className="text-sm text-slate-500">Détectez les chevauchements entre vos {policies.length} contrats</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors
            ${isAnalyzing 
              ? 'bg-slate-400 cursor-not-allowed' 
              : 'bg-slate-900 hover:bg-slate-800 shadow-sm'
            }`}
        >
          {isAnalyzing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyse en cours...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Lancer l'analyse
            </>
          )}
        </button>
      </div>

      <div className="flex-1 p-6 bg-slate-50 overflow-y-auto">
        {!hasAnalyzed && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Search className="w-12 h-12 mb-3 text-slate-300" />
            <p>Cliquez sur "Lancer l'analyse" pour auditer vos contrats.</p>
          </div>
        )}

        {hasAnalyzed && findings.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-emerald-600">
            <CheckCircle2 className="w-16 h-16 mb-4" />
            <h3 className="text-lg font-semibold">Aucun doublon détecté !</h3>
            <p className="text-slate-500 text-center max-w-sm mt-2">
              Vos contrats semblent complémentaires. Excellent travail d'optimisation.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {findings.map((finding, idx) => (
            <div key={idx} className={`p-4 rounded-lg border ${getSeverityColor(finding.severity)}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {getSeverityIcon(finding.severity)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-sm uppercase tracking-wide mb-1 opacity-90">
                      {finding.title}
                    </h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${finding.severity === 'high' ? 'bg-red-100 text-red-800' : finding.severity === 'medium' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                      {finding.severity}
                    </span>
                  </div>
                  <p className="text-sm mb-3 opacity-90 leading-relaxed">
                    {finding.description}
                  </p>
                  <div className="bg-white/50 p-2 rounded text-xs font-medium">
                    Concernés : {finding.involvedPolicies.map(id => {
                        const p = policies.find(pol => pol.id === id);
                        return p ? p.name : 'Inconnu';
                    }).join(', ')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};