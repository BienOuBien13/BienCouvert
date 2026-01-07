
// -----------------------------------------------------------------------------
// Contact Experts
// - Formulaire d'envoi de dossier à un expert humain pour audit.
// - Composant volontairement simple : ici il simule l'envoi et affiche un
//   écran de confirmation (utile pour la démo/non-prod).
// -----------------------------------------------------------------------------
import React, { useState } from 'react';
import { Users, Phone, Mail, Clock, ShieldCheck, CheckCircle, ArrowRight, MessageCircle } from 'lucide-react';
import { Policy } from '../types';

interface Props {
  policies: Policy[];
}

export const ExpertContact: React.FC<Props> = ({ policies }) => {
  const [submitted, setSubmitted] = useState(false);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const togglePolicy = (id: string) => {
    setSelectedPolicies(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center animate-fadeIn">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Demande envoyée !</h2>
        <p className="text-slate-600 max-w-md mx-auto mb-8">
          Un de nos experts partenaires va analyser votre dossier. Vous serez recontacté dans les 24h ouvrées pour optimiser votre protection.
        </p>
        <button 
          onClick={() => setSubmitted(false)}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          Faire une autre demande
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">Audit Expert Gratuit</h2>
          <p className="text-slate-300 text-lg leading-relaxed">
            L'IA détecte les doublons, mais l'expert humain négocie pour vous. Économisez en moyenne <span className="text-primary-400 font-bold">240€/an</span> en regroupant vos garanties.
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm">
              <Clock className="w-4 h-4 text-primary-400" /> Réponse sous 24h
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm">
              <ShieldCheck className="w-4 h-4 text-primary-400" /> Partenaires certifiés
            </div>
          </div>
        </div>
        <Users className="absolute -right-12 -bottom-12 w-64 h-64 text-white/5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-4">Sur quels contrats souhaitez-vous un audit ?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {policies.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePolicy(p.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      selectedPolicies.includes(p.id)
                        ? 'bg-primary-50 border-primary-500 ring-1 ring-primary-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      selectedPolicies.includes(p.id) ? 'bg-primary-600 border-primary-600' : 'bg-white border-slate-300'
                    }`}>
                      {selectedPolicies.includes(p.id) && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500 truncate">{p.provider}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Précisez votre besoin (optionnel)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: Je souhaite réduire mes mensualités tout en gardant une excellente couverture santé..."
                rows={4}
                className="w-full rounded-xl border-slate-300 border px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={selectedPolicies.length === 0}
              className="w-full flex items-center justify-center gap-2 py-4 px-6 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-900/10"
            >
              Envoyer mon dossier à un expert
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary-600" />
              Pourquoi un expert ?
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3 text-sm text-slate-600">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span><strong>Résiliation simplifiée</strong> : Ils s'occupent de toute la paperasse pour vous.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-600">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span><strong>Offres cachées</strong> : Accès à des tarifs courtiers non disponibles au public.</span>
              </li>
              <li className="flex gap-3 text-sm text-slate-600">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span><strong>Zéro Doublon</strong> : Garantie contractuelle d'élimination des frais inutiles.</span>
              </li>
            </ul>
          </div>

          <div className="bg-primary-50 rounded-2xl border border-primary-100 p-6">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                 <Phone className="w-6 h-6 text-primary-600" />
               </div>
               <div>
                 <p className="text-xs text-primary-700 font-semibold uppercase tracking-wider">Assistance Directe</p>
                 <p className="text-sm font-bold text-slate-900">0800 123 456</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
