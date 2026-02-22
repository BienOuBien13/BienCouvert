
import React, { useState } from 'react';
import { Users, Phone, Clock, ShieldCheck, CheckCircle, ArrowRight, Calendar, Smartphone, Headset, MessageSquare, Zap, ChevronRight } from 'lucide-react';
import { Policy } from '../types';

interface Props {
  policies: Policy[];
  onNavigateToPolicies?: () => void;
}

const DAYS = [
  { id: 'today', label: 'Aujourd\'hui' },
  { id: 'tomorrow', label: 'Demain' },
  { id: 'next', label: 'Après-demain' }
];

const SLOTS = [
  { id: 'morning', label: 'Matin', time: '9h - 12h' },
  { id: 'lunch', label: 'Déjeuner', time: '12h - 14h' },
  { id: 'afternoon', label: 'Après-midi', time: '14h - 17h' },
  { id: 'evening', label: 'Soir', time: '17h - 19h' }
];

export const ExpertContact: React.FC<Props> = ({ policies, onNavigateToPolicies }) => {
  const [submitted, setSubmitted] = useState(false);

  // Bannière réseau en construction — toujours visible en haut
  const NetworkBanner = () => (
    <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-start gap-4 animate-fadeIn">
      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Headset className="w-5 h-5 text-amber-600" />
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 mb-1">Réseau d'experts en cours de construction</p>
        <p className="text-sm text-amber-800 font-medium leading-relaxed">
          Notre réseau de courtiers indépendants certifiés se déploie progressivement.
          Vous pouvez dès maintenant enregistrer une demande de rappel — un expert vous contactera
          dès la mise en service complète du réseau dans votre zone.
        </p>
      </div>
    </div>
  );
  const [phone, setPhone] = useState('');
  const [selectedDay, setSelectedDay] = useState('today');
  const [selectedSlot, setSelectedSlot] = useState('afternoon');
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const togglePolicy = (id: string) => {
    setSelectedPolicies(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-scaleIn">
        <div className="bg-white rounded-[3rem] shadow-2xl border border-emerald-100 p-12 text-center space-y-8">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-12 h-12" />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">C'est noté !</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              Un expert BienCouvert vous rappellera au <span className="text-slate-900 font-bold">{phone}</span>.<br/>
              Créneau : <span className="text-slate-900 font-bold">{DAYS.find(d => d.id === selectedDay)?.label} ({SLOTS.find(s => s.id === selectedSlot)?.label})</span>.
            </p>
          </div>
          <button 
            onClick={() => setSubmitted(false)}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-all"
          >
            Nouveau rappel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-24 px-4 animate-fadeIn">
      {/* Bannière réseau en cours de construction */}
      <NetworkBanner />

      {/* Hero Header */}
      <div className="bg-slate-900 rounded-[3rem] p-10 md:p-16 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-600/30 rounded-full border border-primary-500/30 text-[10px] font-black uppercase tracking-widest mb-8">
            <Users className="w-3 h-3" /> Expertise Partenaire Certifiée
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-6 leading-tight">
            L'IA audite, l'humain <span className="text-primary-400">négocie</span> pour vous.
          </h2>
          <p className="text-slate-400 font-medium text-lg leading-relaxed">
            Nos experts analysent vos résultats d'audit pour trouver les meilleures offres et s'occupent de toutes vos démarches de résiliation.
          </p>
        </div>
        <Headset className="absolute -right-10 -bottom-10 w-80 h-80 text-white/5 transform -rotate-12" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Form Column */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 md:p-10">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Demander un rappel</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Gratuit et sans engagement</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Phone Input */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> Votre numéro
                </label>
                <input 
                  type="tel" 
                  required
                  placeholder="06 12 34 56 78"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full p-6 bg-slate-50 border border-slate-100 rounded-3xl text-2xl font-black text-center outline-none focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-200"
                />
              </div>

              {/* Day Selector */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Quel jour ?
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {DAYS.map(day => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDay(day.id)}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        selectedDay === day.id 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xl' 
                          : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slot Selector */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Quel créneau ?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
                  {SLOTS.map(slot => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlot(slot.id)}
                      className={`p-4 rounded-2xl border transition-all text-left group ${
                        selectedSlot === slot.id 
                          ? 'bg-primary-600 border-primary-600 shadow-lg' 
                          : 'bg-white border-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <p className={`text-[10px] font-black uppercase tracking-widest ${selectedSlot === slot.id ? 'text-white' : 'text-slate-900'}`}>{slot.label}</p>
                      <p className={`text-[9px] font-bold ${selectedSlot === slot.id ? 'text-primary-100' : 'text-slate-400'}`}>{slot.time}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Policy Selection (Optional) */}
              {policies.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Contrats concernés (optionnel)
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {policies.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePolicy(p.id)}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          selectedPolicies.includes(p.id) ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-100'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-700">{p.name}</span>
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center ${selectedPolicies.includes(p.id) ? 'bg-primary-600 border-primary-600 text-white' : 'bg-slate-50 border-slate-200'}`}>
                          {selectedPolicies.includes(p.id) && <CheckCircle className="w-3 h-3" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!phone}
                className="w-full flex items-center justify-between py-6 px-10 bg-primary-600 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary-900/20 hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 group"
              >
                Confirmer mon rappel
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>

        {/* Benefits Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 space-y-8">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-500" /> Vos Avantages Expert
            </h3>
            
            <div className="space-y-6">
              {[
                { title: "Indépendance", desc: "Nos experts comparent plus de 50 compagnies pour vous.", icon: ShieldCheck },
                { title: "Zéro Paperasse", desc: "On s'occupe de résilier vos anciens contrats sans frais.", icon: MessageSquare },
                { title: "Gain de temps", desc: "Une étude complète en un seul appel de 15 minutes.", icon: Clock }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-50 text-slate-900 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{item.title}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-primary-50 rounded-3xl border border-primary-100 flex items-center gap-4">
               <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-sm flex-shrink-0">
                  <ActivityIcon className="w-6 h-6" />
               </div>
               <p className="text-[10px] text-primary-800 font-bold leading-relaxed">
                 98% des utilisateurs trouvent une économie moyenne de <span className="font-black">240€/an</span> après un appel expert.
               </p>
            </div>
          </div>

          {/* Emergency Call Card */}
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex items-center justify-between group cursor-pointer hover:bg-slate-800 transition-all">
             <div>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Besoin d'aide immédiat ?</p>
                <p className="text-xl font-black">0805 123 456</p>
                <p className="text-[10px] text-primary-400 font-bold">Appel gratuit - 9h/19h</p>
             </div>
             <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-primary-600 transition-colors">
                <Phone className="w-6 h-6" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 12H18L15 21L9 3L6 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
