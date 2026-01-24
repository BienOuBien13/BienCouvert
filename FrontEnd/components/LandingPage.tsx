
import React from 'react';
import { 
  ShieldCheck, 
  Zap, 
  MessageSquare, 
  Users, 
  CheckCircle, 
  ArrowRight, 
  Search, 
  Lock,
  PieChart,
  Target,
  Sparkles
} from 'lucide-react';

interface Props {
  onStart: () => void;
}

export const LandingPage: React.FC<Props> = ({ onStart }) => {
  const scrollToConcept = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById('concept');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-primary-100 selection:text-primary-900">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo_biencouvert.png" alt="BienCouvert" className="h-12 w-auto" />
            <span className="text-2xl font-bold tracking-tight text-slate-900">BienCouvert</span>
          </div>
          <button 
            onClick={onStart}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-full font-semibold hover:bg-slate-800 transition-all active:scale-95"
          >
            Se connecter
          </button>
        </div>
      </header>

      <section className="pt-40 pb-24 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-fadeIn">
            <Sparkles className="w-4 h-4" />
            TOTALEMENT GRATUIT
          </div>
          <h1 className="text-5xl lg:text-8xl font-black tracking-tighter text-slate-900 mb-8 max-w-5xl mx-auto leading-[0.95]">
            Votre assitant pour comprendre et optimiser <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600"> TOUTES vos garanties d'assurances.</span>
          </h1>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-12 leading-relaxed font-bold">
            Centralisez, analysez et optimisez votre protection en un clic. <br className="hidden md:block" /> 
            Ne payez plus <span className="text-slate-900 font-black"> les couvertures en doublon ou inutiles</span> et identifiez enfin les garanties qui vous manquent.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={onStart}
              className="w-full sm:w-auto px-12 py-6 bg-primary-600 text-white rounded-[2rem] font-black text-lg hover:bg-primary-700 transition-all shadow-2xl shadow-primary-900/30 flex items-center justify-center gap-4 group active:scale-95"
            >
              C'est parti !
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </button>
            <button 
              onClick={scrollToConcept}
              className="w-full sm:w-auto px-12 py-6 bg-white text-slate-700 border border-slate-200 rounded-[2rem] font-black text-lg hover:bg-slate-50 transition-all flex items-center justify-center active:scale-95"
            >
              Le concept
            </button>
          </div>
        </div>
      </section>

      <section className="py-12 border-y border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="text-center">
            <p className="text-4xl font-black text-slate-900 tracking-tighter">100%</p>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Gratuit</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black text-slate-900 tracking-tighter">~240€</p>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Économie / an</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black text-slate-900 tracking-tighter">2 min</p>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Analyse Express</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black text-slate-900 tracking-tighter">24/7</p>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Assistant IA</p>
          </div>
        </div>
      </section>

      <section id="concept" className="py-32 px-6 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
       
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<Search className="w-8 h-8" />}
              title="Personnalisation complète"
              description="Vous composez en quelques cliques votre portefeuille d'assurances avec vos couvertures actuelles."
            />
            <FeatureCard 
              icon={<MessageSquare className="w-8 h-8" />}
              title="Assitant Assurance"
              description="Posez des questions en direct à votre assistant : 'Suis-je couvert pour le bris de glace ?'."
            />
            <FeatureCard 
              icon={<Zap className="w-8 h-8" />}
              title="Optimisation"
              description="Analyse croisée automatique pour détecter si vous payez plusieurs fois pour la même garantie et identification des couvertures manquantes"
            />
            <FeatureCard 
              icon={<Users className="w-8 h-8" />}
              title="Relais Expert"
              description="Un doute ? Sollicitez un expert indépendant pour finaliser vos économies."
            />
          </div>
        </div>
      </section>

      <footer className="py-24 px-6 text-center border-t border-slate-100 bg-slate-50/30">
        <h2 className="text-4xl font-black text-slate-900 mb-10 tracking-tighter">Prêt à y voir plus clair ?</h2>
        <button 
          onClick={onStart}
          className="px-16 py-7 bg-primary-600 text-white rounded-[2.5rem] font-black text-xl hover:bg-primary-700 transition-all shadow-3xl shadow-primary-900/30 active:scale-95"
        >
          C'est parti !
        </button>
        <p className="mt-12 text-slate-300 text-xs font-black uppercase tracking-[0.4em]">© 2025 BienCouvert - Protection Intelligente</p>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="p-10 bg-white rounded-[3rem] border border-slate-100 hover:border-primary-200 hover:shadow-2xl hover:shadow-primary-900/5 transition-all group">
    <div className="w-20 h-20 bg-slate-50 text-slate-600 rounded-[2rem] flex items-center justify-center mb-8 group-hover:bg-primary-50 group-hover:text-primary-600 transition-all group-hover:rotate-6">
      {icon}
    </div>
    <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed font-medium">{description}</p>
  </div>
);
