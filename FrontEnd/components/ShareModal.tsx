
import React, { useState } from 'react';
import { X, Share2, Download, Copy, Check, MessageCircle, Mail, Loader2, FileJson, Sparkles, FileText } from 'lucide-react';
import { Policy, OptimizationFinding, User } from '../types';
import { generateShareableReport } from '../services/geminiService';
import { generateOptimizationPDF } from '../services/pdfService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  policies: Policy[];
  findings: OptimizationFinding[];
  user: User;
}

export const ShareModal: React.FC<Props> = ({ isOpen, onClose, policies, findings, user }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [shareText, setShareText] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const report = await generateShareableReport(policies, findings);
      setShareText(report);
    } catch (e) {
      setShareText("Voici mon bilan BienCouvert : j'ai optimisé mes contrats d'assurance !");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Small timeout to ensure visual feedback
      await new Promise(resolve => setTimeout(resolve, 800));
      generateOptimizationPDF(user, policies, findings);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mon Bilan BienCouvert',
          text: shareText || "J'ai audité mes assurances avec BienCouvert !",
          url: window.location.href,
        });
      } catch (err) {}
    }
  };

  const handleExportData = () => {
    const data = JSON.stringify({ policies, timestamp: Date.now() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mes_contrats_biencouvert_${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col animate-scaleIn">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Partager mon bilan</h2>
            <p className="text-slate-500 text-sm font-medium">Transmettez vos contrats ou votre analyse IA.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 shadow-sm border border-transparent hover:border-slate-100">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
          {/* Section 0: PDF Export (Prominent) */}
          <section className="space-y-4">
             <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <FileText className="w-3 h-3 text-red-500" /> Rapport Professionnel
              </label>
              <button 
                onClick={handleGeneratePDF}
                disabled={isGeneratingPDF || findings.length === 0}
                className="w-full flex items-center justify-between p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-primary-200 transition-all group hover:bg-primary-50/30 disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-900">Exporter en PDF personnalisable</p>
                    <p className="text-[10px] text-slate-400 font-medium">Idéal pour envoyer à un conseiller</p>
                  </div>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transition-colors" />
              </button>
          </section>

          {/* Section 1: IA Report */}
          <section className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-primary-500" /> Synthèse IA pour mes proches
              </label>
            </div>
            
            {!shareText ? (
              <button 
                onClick={handleGenerateReport} 
                disabled={isGenerating}
                className="w-full py-8 bg-primary-50 border-2 border-dashed border-primary-200 rounded-3xl flex flex-col items-center justify-center gap-3 group hover:border-primary-400 transition-all"
              >
                {isGenerating ? (
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                ) : (
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-primary-600 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-6 h-6" />
                  </div>
                )}
                <span className="text-sm font-bold text-primary-900">Générer le résumé texte</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-sm text-slate-700 leading-relaxed italic animate-fadeIn">
                  "{shareText}"
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-50">
                    {copied ? <><Check className="w-4 h-4 text-emerald-500" /> Copié</> : <><Copy className="w-4 h-4" /> Copier</>}
                  </button>
                  <button onClick={handleNativeShare} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-2xl text-xs font-bold hover:bg-primary-700">
                    <Share2 className="w-4 h-4" /> Partager
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Raw Data Export */}
          <section className="space-y-4 pt-6 border-t border-slate-100">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
              <FileJson className="w-3 h-3" /> Coffre-fort Portable
            </label>
            <button 
              onClick={handleExportData}
              className="w-full flex items-center justify-between p-5 bg-slate-900 text-white rounded-3xl hover:bg-slate-800 transition-all group shadow-xl shadow-slate-900/10"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-primary-500 transition-colors">
                  <Download className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">Télécharger mon export .json</p>
                  <p className="text-[10px] opacity-60 font-medium">Format compatible Import BienCouvert</p>
                </div>
              </div>
              <ChevronRightIcon className="w-5 h-5 opacity-40 group-hover:translate-x-1 transition-transform" />
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">🔒 Vos documents ne quittent jamais votre appareil</p>
        </div>
      </div>
    </div>
  );
};

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
