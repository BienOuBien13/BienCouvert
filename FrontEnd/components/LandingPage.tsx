
import React from 'react';
import {
  ShieldCheck,
  Zap,
  MessageSquare,
  Users,
  ArrowRight,
  Search,
  Sparkles,
  BookOpen,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  onStart: () => void;
}

export const LandingPage: React.FC<Props> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">

      {/* ── Navbar ── same padding conventions as app Header */}
      <header className="fixed top-0 inset-x-0 bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <img src="/logo_biencouvert.png" alt="BienCouvert" className="h-10 w-auto" />
          <button
            onClick={onStart}
            className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition-all active:scale-95"
          >
            Se connecter
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest mb-6">
            <Sparkles className="w-3 h-3" />
            100 % Gratuit
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 mb-5 leading-tight">
            Comprenez enfin{' '}
            <span className="text-blue-600">toutes vos garanties</span>{' '}
            d'assurance
          </h1>

          <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto mb-8 leading-relaxed">
            Votre assistant personnel répond à vos questions, détecte les doublons
            et identifie les protections manquantes — en 2 minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              onClick={onStart}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 active:scale-95 group"
            >
              Commencer gratuitement
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#comment"
              onClick={e => { e.preventDefault(); document.getElementById('comment')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-base hover:bg-slate-50 transition-all active:scale-95"
            >
              Comment ça marche ?
            </a>
          </div>
        </div>
      </section>

      {/* ── Key numbers ── */}
      <section className="py-8 border-y border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: '100%', label: 'Gratuit' },
              { value: '~240 €', label: 'Économie / an' },
              { value: '2 min', label: 'Analyse express' },
              { value: '24/7', label: 'Assistant IA' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-2xl sm:text-3xl font-black text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="comment" className="py-16 px-4 sm:px-6 lg:px-8 scroll-mt-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Comment ça marche ?</h2>
            <p className="text-slate-500 mt-2 text-sm sm:text-base">3 étapes pour maîtriser votre couverture</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                icon: <BookOpen className="w-6 h-6" />,
                title: 'Ajoutez vos contrats',
                desc: 'Sélectionnez vos assurances depuis notre catalogue de + 500 CG, ou importez vos conditions particulières en PDF.',
                color: 'bg-blue-50 text-blue-600',
              },
              {
                step: '2',
                icon: <MessageSquare className="w-6 h-6" />,
                title: 'Posez vos questions',
                desc: "Demandez en langage naturel : « Suis-je couvert si je renverse mon téléphone ? » et obtenez une réponse immédiate.",
                color: 'bg-violet-50 text-violet-600',
              },
              {
                step: '3',
                icon: <TrendingDown className="w-6 h-6" />,
                title: 'Optimisez votre budget',
                desc: "Identifiez les garanties en double, les lacunes et économisez sur vos primes grâce à des recommandations personnalisées.",
                color: 'bg-emerald-50 text-emerald-600',
              },
            ].map((item, i) => (
              <div key={i} className="relative bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md hover:border-slate-200 transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                  {item.icon}
                </div>
                <span className="absolute top-5 right-5 text-xs font-black text-slate-200">0{item.step}</span>
                <h3 className="font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Ce que vous pouvez faire</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <FeatureCard
              icon={<Search className="w-6 h-6" />}
              color="text-blue-600 bg-blue-50"
              title="Catalogue complet"
              description="Accédez à + 500 conditions générales déjà indexées et enrichissez-les avec vos propres documents."
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6" />}
              color="text-violet-600 bg-violet-50"
              title="Assistant IA"
              description="Posez n'importe quelle question sur vos garanties et obtenez une réponse précise, issue de vos contrats."
            />
            <FeatureCard
              icon={<Zap className="w-6 h-6" />}
              color="text-amber-600 bg-amber-50"
              title="Détection des doublons"
              description="Voyez en un coup d'œil les garanties superflues et celles qui manquent à votre protection."
            />
            <FeatureCard
              icon={<BookOpen className="w-6 h-6" />}
              color="text-indigo-600 bg-indigo-50"
              title="Garanties en détail"
              description="Consultez le détail complet de chaque garantie de vos contrats directement depuis l'app."
            />
          </div>
        </div>
      </section>

      {/* ── Trust signals ── */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <ul className="space-y-3">
            {[
              'Aucune donnée personnelle vendue ni partagée',
              'Vos contrats restent strictement privés',
              'Accès 100 % gratuit, sans abonnement caché',
              "Outil d'aide à la décision – complété par des experts agréés",
            ].map(item => (
              <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-blue-600">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-4">Prêt à y voir plus clair ?</h2>
          <p className="text-blue-100 mb-8 text-sm sm:text-base">Gratuit, sans inscription longue, résultats en 2 minutes.</p>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-2xl font-bold text-base hover:bg-blue-50 transition-all shadow-xl active:scale-95 group"
          >
            C'est parti !
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-6 px-4 sm:px-6 lg:px-8 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-300" />
            <span>© {new Date().getFullYear()} BienCouvert</span>
          </div>
          <p className="text-center">
            ⚠️ Outil d'aide à la décision. Consultez un courtier agréé pour toute décision importante.
          </p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({
  icon, color, title, description,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md hover:border-slate-200 transition-all">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}>
      {icon}
    </div>
    <h3 className="font-bold text-slate-900 mb-1.5 text-sm">{title}</h3>
    <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
  </div>
);
