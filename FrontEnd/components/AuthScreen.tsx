
import React, { useState } from 'react';
import React, { useEffect } from 'react';
import TermsOfService from './TermsOfService';
import PrivacyPolicy from './PrivacyPolicy';
import { ShieldCheck, Mail, Lock, User as UserIcon, ArrowRight, Loader2, ArrowLeft, Send, MailCheck, ExternalLink, ChevronLeft } from 'lucide-react';
import { authService } from '../services/authService';
import { User } from '../types';

interface Props {
  onLogin: (user: User) => void;
  onBack: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'email-sent' | 'reset';

export const AuthScreen: React.FC<Props> = ({ onLogin, onBack }) => {
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Scroll to top on mode change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mode]);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAiDisclaimer, setAcceptedAiDisclaimer] = useState(false);
  const [passwordWarning, setPasswordWarning] = useState('');

  // Validation mot de passe : min 6, 1 majuscule, 1 spécial
  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) return 'Au moins 6 caractères.';
    if (!/[A-Z]/.test(pwd)) return 'Au moins 1 majuscule.';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) return 'Au moins 1 caractère spécial.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      if (mode === 'login') {
        const user = await authService.login(email, password);
        onLogin(user);
      } else if (mode === 'register') {
        if (!acceptedTerms) throw new Error("Veuillez accepter les CGU et la politique de confidentialité.");
        if (!acceptedAiDisclaimer) throw new Error("Veuillez accepter le disclaimer IA.");
                  <label htmlFor="terms" className="text-xs text-slate-700 leading-relaxed">
                    J'accepte les <button type="button" className="text-primary-600 underline" onClick={() => setShowTerms(true)}>Conditions Générales d'Utilisation</button> et la <button type="button" className="text-primary-600 underline" onClick={() => setShowPrivacy(true)}>Politique de confidentialité</button>. Je reconnais que mes données seront traitées conformément au RGPD (stockage sécurisé sur Azure Europe).
                  </label>
        onLogin(user);
      } else if (mode === 'forgot') {
        try {
          await authService.resetPassword(email, "temp_check"); 
          setMode('email-sent');
        } catch (e) {
          throw new Error("Aucun compte trouvé avec cet email.");
        }
      } else if (mode === 'reset') {
        if (password !== confirmPassword) throw new Error("Les mots de passe ne correspondent pas.");
        const pwdWarn = validatePassword(password);
        if (pwdWarn) throw new Error("Mot de passe invalide : " + pwdWarn);
        await authService.resetPassword(email, password);
        setSuccess("Mot de passe réinitialisé ! Connectez-vous avec votre nouveau mot de passe.");
        setMode('login');
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderForm = () => {
    switch(mode) {
      case 'forgot':
        return (
          <div className="space-y-6 animate-fadeIn">
            <p className="text-sm text-slate-600">Saisissez votre email pour recevoir un lien sécurisé de réinitialisation.</p>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-slate-400" /></div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="focus:ring-primary-500 focus:border-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none" placeholder="jean@exemple.com" />
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 font-bold transition-all shadow-lg shadow-primary-900/10">
              {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <><Send className="w-4 h-4" /> Envoyer l'email</>}
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-slate-500 hover:text-primary-600 flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" /> Retour à la connexion</button>
          </div>
        );
      case 'email-sent':
        return (
          <div className="space-y-6 text-center animate-fadeIn">
            <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-2">
              <MailCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Vérifiez vos emails</h3>
            <p className="text-sm text-slate-600">
              Un email contenant un lien de réinitialisation a été envoyé à <strong>{email}</strong>.
            </p>
            
            <div className="bg-primary-50 border border-primary-100 p-4 rounded-xl text-left">
              <p className="text-xs text-primary-800 font-semibold uppercase tracking-wider mb-2">Simulation (Démo)</p>
              <button 
                type="button"
                onClick={() => setMode('reset')}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-primary-200 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Simuler l'ouverture du mail
              </button>
            </div>

            <button type="button" onClick={() => setMode('forgot')} className="text-sm text-slate-500 hover:text-primary-600">Email non reçu ? Renvoyer</button>
          </div>
        );
      case 'reset':
        return (
          <div className="space-y-6 animate-fadeIn">
            <p className="text-sm text-slate-600">Saisissez votre nouveau mot de passe pour <strong>{email}</strong>.</p>
            <div>
              <label className="block text-sm font-medium text-slate-700">Nouveau mot de passe</label>
              <div className="mt-1 relative shadow-sm"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400" /></div>
              <input type="password" required value={password} onChange={(e) => {
                setPassword(e.target.value);
                if (mode === 'register' || mode === 'reset') {
                  setPasswordWarning(validatePassword(e.target.value));
                } else {
                  setPasswordWarning('');
                }
              }} className="focus:ring-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none" placeholder="••••••••" /></div>
              {passwordWarning && (mode === 'register' || mode === 'reset') && (
                <div className="text-xs text-orange-600 mt-1">{passwordWarning}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Confirmer le mot de passe</label>
              <div className="mt-1 relative shadow-sm"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400" /></div>
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="focus:ring-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none" placeholder="••••••••" /></div>
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 px-4 rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 font-bold transition-all shadow-lg shadow-primary-900/10">Réinitialiser le mot de passe</button>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            <div className="flex mb-6 border-b border-slate-200">
              <button type="button" className={`flex-1 pb-4 text-sm font-medium text-center relative ${mode === 'login' ? 'text-primary-600' : 'text-slate-500'}`} onClick={() => { setMode('login'); setError(''); }}>Connexion {mode === 'login' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />}</button>
              <button type="button" className={`flex-1 pb-4 text-sm font-medium text-center relative ${mode === 'register' ? 'text-primary-600' : 'text-slate-500'}`} onClick={() => { setMode('register'); setError(''); }}>Inscription {mode === 'register' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />}</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <div className="mt-1 relative shadow-sm"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-slate-400" /></div>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="focus:ring-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none" placeholder="jean@exemple.com" /></div>
            </div>
            <div>
              <div className="flex justify-between">
                <label className="block text-sm font-medium text-slate-700">Mot de passe</label>
                {mode === 'login' && <button type="button" onClick={() => setMode('forgot')} className="text-xs text-primary-600 hover:underline">Mot de passe oublié ?</button>}
              </div>
              <div className="mt-1 relative shadow-sm"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-400" /></div>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="focus:ring-primary-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none" placeholder="••••••••" /></div>
            </div>
            
            {mode === 'register' && (
              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="terms"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="terms" className="text-xs text-slate-700 leading-relaxed">
                    J'accepte les <button type="button" className="text-primary-600 underline" onClick={() => setShowTerms(true)}>Conditions Générales d'Utilisation</button> et la <a href="/politique-confidentialite" target="_blank" className="text-primary-600 underline">Politique de confidentialité</a>. Je reconnais que mes données seront traitées conformément au RGPD (stockage sécurisé sur Azure Europe).
                  </label>
                </div>
                
                <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 p-3 rounded-lg">
                  <input 
                    type="checkbox" 
                    id="ai-disclaimer"
                    checked={acceptedAiDisclaimer}
                    onChange={(e) => setAcceptedAiDisclaimer(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-orange-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="ai-disclaimer" className="text-xs text-orange-900 leading-relaxed">
                    <strong>⚠️ Important :</strong> Je comprends que les analyses et recommandations générées par l'intelligence artificielle sont fournies à titre informatif uniquement et ne constituent pas des conseils professionnels en assurance. Ces résultats ne sont pas vérifiés par un expert et peuvent contenir des erreurs. Je consulterai un professionnel agréé pour toute décision importante.
                  </label>
                </div>
              </div>
            )}
            
            <button type="submit" disabled={isLoading || (mode === 'register' && (!acceptedTerms || !acceptedAiDisclaimer))} className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all shadow-lg shadow-primary-900/10">
              {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <>{mode === 'login' ? 'Se connecter' : "S'inscrire"} <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button onClick={() => setShowTerms(false)} className="absolute top-4 right-4 text-slate-500 hover:text-primary-600 text-lg font-bold">&times;</button>
            <TermsOfService onBack={() => setShowTerms(false)} />
          </div>
        </div>
      )}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button onClick={() => setShowPrivacy(false)} className="absolute top-4 right-4 text-slate-500 hover:text-primary-600 text-lg font-bold">&times;</button>
            <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
          </div>
        </div>
      )}
      <button 
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium"
      >
        <ChevronLeft className="w-5 h-5" />
        Retour à l'accueil
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto h-16 w-16 flex items-center justify-center mb-4">
          <img src="/logo_biencouvert.png" alt="BienCouvert" className="h-16 w-auto" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900">BienCouvert</h2>
        <p className="mt-2 text-sm text-slate-600">Votre assistant d'assurance personnel intelligent</p>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-100">
          <form onSubmit={handleSubmit}>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">{error}</div>}
            {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100">{success}</div>}
            {renderForm()}
          </form>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-center text-xs text-slate-400 mb-3">
              Vos données sont hébergées sur Azure Europe (conforme RGPD)
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>⚠️ Disclaimer :</strong> BienCouvert est un outil d'aide à la décision. Les analyses et recommandations générées par l'IA sont fournies à titre informatif uniquement et ne sont pas vérifiées par un professionnel. Elles ne constituent pas des conseils en assurance au sens légal. Consultez un courtier ou assureur agréé pour toute décision importante.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
