
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
  Target
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
            <div className="bg-primary-600 p-2 rounded-xl shadow-lg shadow-primary-200">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">AssurClair</span>
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 border border-primary-100 text-primary-700 text-sm font-bold mb-8 animate-fadeIn">
            <SparklesIcon className="w-4 h-4" />
            Propulsé par Gemini 30.0 Pro
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 max-w-4xl mx-auto leading-[1.1]">
            L'assurance qui s'éclaire enfin par <span className="text-primary-600">l'IA générative</span>.
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-12 leading-relaxed">
            Centralisez vos contrats, analysez vos garanties en temps réel et économisez jusqu'à 30% en éliminant les doublons inutiles.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={onStart}
              className="w-full sm:w-auto px-10 py-5 bg-primary-600 text-white rounded-2xl font-bold text-lg hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/20 flex items-center justify-center gap-3 group"
            >
              C'est parti !
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={scrollToConcept}
              className="w-full sm:w-auto px-10 py-5 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all flex items-center justify-center"
            >
              Découvrir le concept
            </button>
          </div>
        </div>
      </section>

      <section className="py-12 border-y border-slate-100 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">100%</p>
            <p className="text-sm text-slate-500 font-medium">Local & Privé</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">~240€</p>
            <p className="text-sm text-slate-500 font-medium">Économie moyenne</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">2 min</p>
            <p className="text-sm text-slate-500 font-medium">Pour tout centraliser</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-900">24/7</p>
            <p className="text-sm text-slate-500 font-medium">Assistant disponible</p>
          </div>
        </div>
      </section>

      <section id="concept" className="py-24 px-6 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Une gestion 3.0 de votre protection</h2>
            <p className="text-slate-500 text-lg">Oubliez la paperasse, concentrez-vous sur l'essentiel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard 
              icon={<Search className="w-6 h-6" />}
              title="Ajout Intelligent"
              description="Importez vos PDF ou laissez notre IA trouver vos garanties via une simple recherche web de votre assureur."
            />
            <FeatureCard 
              icon={<MessageSquare className="w-6 h-6" />}
              title="Assistant Vocal & Chat"
              description="Posez des questions en direct à votre assistant : 'Suis-je couvert pour le bris de glace ?'."
            />
            <FeatureCard 
              icon={<Zap className="w-6 h-6" />}
              title="Optimisation IA"
              description="Analyse croisée de vos contrats et de votre profil pour détecter doublons et manques."
            />
            <FeatureCard 
              icon={<Users className="w-6 h-6" />}
              title="Experts Humains"
              description="Un doute ? Sollicitez un audit gratuit par l'un de nos experts partenaires pour optimiser vos tarifs."
            />
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-slate-900 text-white rounded-[3rem] mx-4 mb-24 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-600/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold mb-8">Reprenez le pouvoir sur vos contrats.</h2>
              <div className="space-y-8">
                <Step 
                  number="01" 
                  title="Connectez vos assurances" 
                  desc="Recherchez votre banque, mutuelle ou assureur auto. L'IA récupère les garanties types en un clic." 
                />
                <Step 
                  number="02" 
                  title="Auditez vos garanties" 
                  desc="Découvrez instantanément les trous dans votre raquette ou les assurances que vous payez pour rien." 
                />
                <Step 
                  number="03" 
                  title="Optimisez & Économisez" 
                  desc="Utilisez l'assistant pour comparer ou demandez l'aide d'un courtier expert pour résilier le superflu." 
                />
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-sm">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 font-bold">IA</div>
                <div className="flex-1 bg-white/10 h-3 rounded-full overflow-hidden">
                  <div className="bg-primary-500 h-full w-[85%] animate-pulse" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-white/10 rounded-2xl border border-white/5">
                  <p className="text-primary-400 text-xs font-bold uppercase mb-2">Alerte Doublon Détectée</p>
                  <p className="text-sm leading-relaxed">Vous avez une protection juridique avec votre contrat <strong>Auto AXA</strong> et votre <strong>Assurance Habitation MAIF</strong>.</p>
                  <p className="text-emerald-400 text-sm font-bold mt-2">Économie possible : 62€ / an</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 italic text-slate-400 text-sm">
                  "Assistant, est-ce que ma carte VISA couvre les sports d'hiver ?"
                </div>
                <div className="p-4 bg-primary-600/20 rounded-2xl border border-primary-500/30 text-sm">
                  "Oui, mais votre mutuelle offre un remboursement supérieur pour les frais de recherche en montagne."
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-8">
            <Lock className="w-10 h-10 text-primary-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Confidentialité absolue</h2>
          <p className="text-slate-600 text-lg leading-relaxed mb-8">
            AssurClair est conçu avec une approche <strong>Privacy-First</strong>. Vos documents et données de contrats sont stockés uniquement dans la mémoire locale de votre navigateur. Aucune donnée sensible n'est stockée sur nos serveurs.
          </p>
          <div className="flex flex-wrap justify-center gap-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle className="w-5 h-5 text-emerald-500" /> RGPD Compliant
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle className="w-5 h-5 text-emerald-500" /> Chiffrement Local
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircle className="w-5 h-5 text-emerald-500" /> Sans compte externe requis
            </div>
          </div>
        </div>
      </section>

      <footer className="py-24 px-6 text-center border-t border-slate-100">
        <h2 className="text-4xl font-bold text-slate-900 mb-8">Prêt à y voir plus clair ?</h2>
        <button 
          onClick={onStart}
          className="px-12 py-5 bg-primary-600 text-white rounded-2xl font-bold text-xl hover:bg-primary-700 transition-all shadow-xl shadow-primary-900/20"
        >
          C'est parti !
        </button>
        <p className="mt-8 text-slate-400 text-sm">© 2025 AssurClair. Tous droits réservés.</p>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="p-8 bg-white rounded-3xl border border-slate-100 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-900/5 transition-all group">
    <div className="w-14 h-14 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
      {icon}
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
  </div>
);

const Step = ({ number, title, desc }: { number: string, title: string, desc: string }) => (
  <div className="flex gap-6">
    <div className="text-4xl font-black text-white/10 select-none">{number}</div>
    <div>
      <h4 className="text-xl font-bold mb-2">{title}</h4>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3V4M12 20V21M4 12H3M21 12H20M18.364 5.636L17.657 6.343M6.343 17.657L5.636 18.364M5.636 5.636L6.343 6.343M17.657 17.657L18.364 18.364" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
