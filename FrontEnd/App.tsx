
import React, { useState, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { PolicyForm } from './components/PolicyForm';
import { SmartChatAssistant } from './components/SmartChatAssistant';
import AddPolicyPage from './components/AddPolicyPage';
import { PolicyList } from './components/PolicyList';
import { ChatInterface } from './components/ChatInterface';
import { AnalysisView } from './components/AnalysisView';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { ClearDataModal } from './components/ClearDataModal';
import { UserProfile } from './components/UserProfile';
import { ExpertContact } from './components/ExpertContact';
import { AdminView } from './components/AdminView';
import MonitoringDashboard from './components/MonitoringDashboard';
import PartnerDashboard from './components/PartnerDashboard';
import ClaimAssistant from './components/ClaimAssistant';
import { PolicyStats } from './components/PolicyStats';
import CoverageDetailPage from './components/CoverageDetailPage';
import Footer from './components/Footer';
import TermsOfService from './components/TermsOfService';
import PrivacyPolicy from './components/PrivacyPolicy';
import IngestionJobBadge from './components/IngestionJobBadge';
import { Policy, Message, User, AppView, UserProfileData } from './types';
import { authService } from './services/authService';
import { storageService } from './services/storageService';
import { 
  Database, LogOut, Sparkles, ShieldAlert,
  ArrowRight, CheckCircle2, Search, Zap, MessageSquare, Shield,
  Rocket, Target, Flag, Info, Settings, Briefcase, Activity
} from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeView, setActiveView] = useState<AppView>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState<string>('');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [coveragePolicy, setCoveragePolicy] = useState<Policy | null>(null);
  
  const [userProfile, setUserProfile] = useState<UserProfileData>({
    adultsCount: 1,
    childrenCount: 0,
    healthNeeds: [],
    hasPool: false,
    hasGarden: false
  });

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) handleLogin(currentUser);

    // Détection des paramètres URL spéciaux
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset');
    const verifyToken = params.get('verify');

    if (resetToken) {
      // Lien de réinitialisation de mot de passe reçu par email
      setResetTokenFromUrl(resetToken);
      setShowAuth(true);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (verifyToken) {
      // Lien de vérification d'email reçu par email
      authService.verifyEmail(verifyToken)
        .then(() => {
          alert('✅ Votre adresse email a bien été vérifiée !');
          window.history.replaceState(null, '', window.location.pathname);
        })
        .catch(() => {
          alert('❌ Lien de vérification invalide ou expiré.');
          window.history.replaceState(null, '', window.location.pathname);
        });
    }

    setIsLoading(false);
  }, []);

  // Session expirée : déconnecter proprement et afficher un message
  useEffect(() => {
    const handleSessionExpired = () => {
      authService.logout();
      setUser(null);
      setPolicies([]);
      setMessages([]);
      setShowAuth(false);
      alert('Votre session a expiré. Veuillez vous reconnecter.');
    };
    // Listener permanent (pas once:true) car App.tsx ne se démonte pas
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, []);

  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView]);

  const handleLogin = async (loggedInUser: User) => {
    setUser(loggedInUser);
    try {
      const userPolicies = await storageService.getPolicies(loggedInUser.id);
      setPolicies(userPolicies);
    } catch (error) {
      console.error('Failed to load policies:', error);
      setPolicies([]);
    }
    if (loggedInUser.profile) setUserProfile(loggedInUser.profile);
    setMessages([]);
    setActiveView('home');
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setPolicies([]);
    setMessages([]);
    setShowAuth(false);
  };

  const handleDeleteAccount = async () => {
    try {
      await authService.deleteAccount();
      // Redirection automatique après suppression (localStorage vidé par authService)
      setUser(null);
      setPolicies([]);
      setMessages([]);
      setShowAuth(false);
      alert('Votre compte a été supprimé définitivement. Toutes vos données ont été effacées.');
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Erreur lors de la suppression du compte. Veuillez réessayer.');
    }
  };

  const handleClearAllData = async () => {
    if (user) {
      try {
        await Promise.all(policies.map(p => storageService.deletePolicy(p.id)));
        const resetProfile = { adultsCount: 1, childrenCount: 0 };
        await authService.updateUser(user.id, { firstName: user.firstName, lastName: user.lastName, email: user.email, profile: resetProfile });
        setUserProfile(resetProfile);
        setPolicies([]);
        setMessages([]);
      } catch (error) {
        console.error('Failed to clear data:', error);
      }
    }
    setIsClearModalOpen(false);
    setActiveView('home');
  };

  const handleAddPolicy = async (policy: Omit<Policy, 'userId'>) => {
    if (!user) return;
    const policyWithUser: Policy = { ...policy, userId: user.id };
    try {
      await storageService.savePolicy(policyWithUser);
      setPolicies(prev => [policyWithUser, ...prev]);
      // Reste sur la vue 'add' pour permettre l'ajout de plusieurs contrats
    } catch (error) {
      console.error('Failed to save policy:', error);
      alert('Erreur lors de la sauvegarde du contrat');
    }
  };

  const handleUpdatePolicy = async (updatedPolicy: Policy) => {
    try {
      await storageService.updatePolicy(updatedPolicy);
      setPolicies(prev => prev.map(p => p.id === updatedPolicy.id ? updatedPolicy : p));
      setEditingPolicy(null);
    } catch (error) {
      console.error('Failed to update policy:', error);
      alert('Erreur lors de la mise à jour du contrat');
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (window.confirm("Supprimer ce contrat ?")) {
      try {
        await storageService.deletePolicy(id);
        setPolicies(prev => prev.filter(p => p.id !== id));
        if (editingPolicy?.id === id) setEditingPolicy(null);
      } catch (error) {
        console.error('Failed to delete policy:', error);
        alert('Erreur lors de la suppression du contrat');
      }
    }
  };

  const handleEditPolicy = (policy: Policy) => {
    setEditingPolicy(policy);
    setActiveView('policies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateProfile = async (newProfile: UserProfileData) => {
    setUserProfile(newProfile);
    if (user) {
      try {
        const updatedUser = { ...user, profile: newProfile };
        setUser(updatedUser);
        await authService.updateUser(user.id, { firstName: user.firstName, lastName: user.lastName, email: user.email, profile: newProfile });
      } catch (error) {
        console.error('Failed to update profile:', error);
        alert('Erreur lors de la mise à jour du profil');
      }
    }
  };

  const renderContent = () => {
    if (!user) return null;

    switch (activeView) {
      case 'home':
        return (
          <div className="space-y-10 animate-fadeIn pb-12">
            {/* Hero Section */}
            <div className="space-y-6 px-2 py-4 text-center">
               <div className="space-y-3">
                  <p className="text-primary-600 font-black text-xs uppercase tracking-widest">Simple • Rapide • Intelligent</p>
                  <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
                    Votre conseiller assurance <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">personnel</span>
                  </h2>
               </div>
               <p className="text-slate-600 text-base max-w-md mx-auto leading-relaxed">
                  Comprenez vos garanties, optimisez vos contrats et économisez en quelques clics
               </p>
            </div>

            {/* Étape 1 : Le Scan (Toujours visible et mis en avant si pas de contrats) */}
            {policies.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900">Étape 1 : Le Scan de Départ</h3>
                  <p className="text-slate-600 text-sm">Ajoutez vos premiers contrats pour débloquer toutes les fonctionnalités</p>
                </div>
                
                <div 
                  onClick={() => setActiveView('policies')}
                  className="relative p-8 rounded-3xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white shadow-2xl cursor-pointer active:scale-95 transition-transform group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50" />
                  
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                        <Search className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="font-black text-xl mb-1">Commencez le scan</h4>
                        <p className="text-white/80 text-sm">Ajoutez 2-3 contrats pour démarrer</p>
                      </div>
                    </div>
                    <ArrowRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Barre de progression */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <h4 className="text-sm font-bold text-slate-900">Scan complété - {policies.length} contrat(s)</h4>
                    </div>
                    <button 
                      onClick={() => setActiveView('policies')}
                      className="text-xs font-bold text-primary-600 hover:text-primary-700"
                    >
                      + Ajouter
                    </button>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-primary-500 rounded-full transition-all duration-1000" style={{width: `${Math.min(policies.length * 33, 100)}%`}} />
                  </div>
                </div>

                {/* Les 3 bénéfices principaux */}
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-slate-900 text-center mb-6">Profitez de vos avantages</h3>
                  
                  {/* Bénéfice 1 : Assistant */}
                  <div 
                    onClick={() => setActiveView('chat')}
                    className="p-6 rounded-3xl bg-white border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)] hover:border-primary-100 cursor-pointer active:scale-[0.98] transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-500 text-white flex items-center justify-center shadow-lg">
                        <MessageSquare className="w-7 h-7" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-slate-900 mb-1">Votre assistant dans la poche</h5>
                        <p className="text-sm text-slate-600">Posez vos questions, obtenez des réponses instantanées</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  {/* Bénéfice 2 : Optimisation */}
                  <div 
                    onClick={() => setActiveView('analysis')}
                    className="p-6 rounded-3xl bg-white border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.15)] hover:border-emerald-100 cursor-pointer active:scale-[0.98] transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-lg">
                        <Zap className="w-7 h-7" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-slate-900 mb-1">Optimisez votre couverture</h5>
                        <p className="text-sm text-slate-600">Détectez doublons, lacunes et économies potentielles</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  {/* Bénéfice 3 : Garanties */}
                  <div 
                    onClick={() => setActiveView('coverage')}
                    className="p-6 rounded-3xl bg-white border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)] hover:border-indigo-100 cursor-pointer active:scale-[0.98] transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-lg">
                        <Shield className="w-7 h-7" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-lg text-slate-900 mb-1">Vos garanties en détail</h5>
                        <p className="text-sm text-slate-600">Visualisez toutes les garanties de chaque contrat</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      
      case 'policies':
        return (
          <div className="space-y-6 animate-fadeIn">{/* Header avec navigation */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Mon Portefeuille</h2>
                <p className="text-slate-600 font-medium">{policies.length} / 10 contrat(s)</p>
              </div>
              {policies.length >= 10 ? (
                <div className="flex items-center gap-2 px-6 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl">
                  <span className="text-xs font-black uppercase tracking-widest">Limite atteinte (10 max)</span>
                </div>
              ) : (
                <button
                  onClick={() => setActiveView('add')}
                  className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-2xl font-black hover:shadow-xl hover:scale-105 transition-all"
                >
                  <Sparkles className="w-5 h-5" />
                  Ajouter des contrats
                </button>
              )}
            </div>

            <PolicyList 
              policies={policies} 
              onDelete={handleDeletePolicy} 
              onEdit={handleEditPolicy}
              user={user} 
              onUpdatePolicy={handleUpdatePolicy}
              onViewCoverage={(policy) => setCoveragePolicy(policy)}
            />
          </div>
        );
      case 'add':
        return (
          <div className="animate-fadeIn">
            <AddPolicyPage 
              onCancel={() => setActiveView('policies')}
              onAdd={(policy) => {
                setPolicies(prev => [policy, ...prev]);
                console.log('✅ Policy ajoutée au state:', policy);
              }}
            />
          </div>
        );
      case 'smart-add':
        return (
          <div className="animate-fadeIn">
            <SmartChatAssistant 
              user={user} 
              onAddPolicy={handleAddPolicy}
              onCancel={() => setActiveView('policies')}
            />
          </div>
        );
      case 'chat':
        return <div className="h-[calc(100vh-140px)] animate-fadeIn"><ChatInterface policies={policies} messages={messages} setMessages={setMessages} /></div>;
      case 'analysis':
        return <div className="animate-fadeIn"><AnalysisView policies={policies} profile={userProfile} onUpdateProfile={handleUpdateProfile} user={user} onFinishSimulation={() => setIsClearModalOpen(true)} /></div>;
      case 'coverage':
        return (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">Vos Garanties</h2>
              <p className="text-slate-600 font-medium">Sélectionnez un contrat pour voir le détail de ses garanties</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {policies.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="font-black uppercase tracking-widest text-sm">Aucun contrat</p>
                  <p className="text-xs mt-1">Ajoutez des contrats pour visualiser leurs garanties</p>
                  <button onClick={() => setActiveView('add')} className="mt-6 px-6 py-3 bg-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-700 transition-all">
                    Ajouter un contrat
                  </button>
                </div>
              ) : (
                policies.map(policy => (
                  <button
                    key={policy.id}
                    onClick={() => setCoveragePolicy(policy)}
                    className="w-full flex items-center gap-4 p-5 bg-white rounded-3xl border border-slate-100 shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)] hover:border-primary-200 transition-all group active:scale-[0.98] text-left"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-cyan-500 text-white flex items-center justify-center shrink-0">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 truncate">{policy.name}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{policy.insurer} · {policy.coverageDetail || policy.coverage || 'Formule souscrite'}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        );
      case 'experts':
        return null; // Réseau d'experts en construction — masqué
      case 'profile':
        return <div className="animate-fadeIn"><UserProfile user={user} onUpdateUser={setUser} onUpdateProfile={handleUpdateProfile} onClose={() => setActiveView('home')} onDeleteAccount={handleDeleteAccount} /></div>;
      case 'admin':
        return <AdminView />;
      case 'monitoring':
        return <div className="animate-fadeIn"><MonitoringDashboard /></div>;
      case 'partner':
        return <div className="animate-fadeIn"><PartnerDashboard /></div>;
      case 'sinistre':
        return <div className="animate-fadeIn"><ClaimAssistant user={user} policies={policies} /></div>;
      default: return null;
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-primary-600 font-black uppercase tracking-[0.4em] animate-pulse">BienCouvert</div>;
  if (!user) {
    if (showAuth) return <AuthScreen onLogin={handleLogin} onBack={() => setShowAuth(false)} resetToken={resetTokenFromUrl || undefined} />;
    return <LandingPage onStart={() => setShowAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100/60 flex flex-col" style={{paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 16px))"}}>
      {/* Modal d'édition (mode classique) */}
      {editingPolicy && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <PolicyForm 
              onAddPolicy={() => {}} 
              onUpdatePolicy={handleUpdatePolicy}
              initialData={editingPolicy}
              onCancelEdit={() => setEditingPolicy(null)}
              existingPolicies={policies}
            />
          </div>
        </div>
      )}

      <header className="bg-white/95 backdrop-blur-xl border-b border-slate-100 sticky top-0 z-[60] shadow-sm shadow-slate-100">
        {/* Spacer couvrant la barre de statut du téléphone */}
        <div style={{height: "env(safe-area-inset-top, 24px)"}} />
        {/* Contenu du header à hauteur fixe */}
        <div className="px-3 md:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center cursor-pointer group" onClick={() => setActiveView('home')}>
          <img src="/logo_biencouvert.png" alt="BienCouvert" className="h-7 md:h-9 w-auto object-contain group-hover:scale-105 transition-transform duration-200" />
        </div>
        <div className="flex items-center gap-2">
           {user?.isAdmin && (
           <button 
             onClick={() => setActiveView('admin')} 
             className={`flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-xl border shadow-sm transition-all active:scale-95 ${activeView === 'admin' ? 'bg-primary-600 text-white border-primary-600 shadow-primary-200' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300 hover:text-primary-600'}`}
             title="Administration - Base de Connaissances"
           >
             <Database className="w-4 h-4" />
             <span className="text-sm font-bold hidden sm:inline">Admin</span>
           </button>
           )}
           {user?.isAdmin && (
           <button
             onClick={() => setActiveView('monitoring')}
             className={`flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-xl border shadow-sm transition-all active:scale-95 ${activeView === 'monitoring' ? 'bg-amber-500 text-white border-amber-500 shadow-amber-200' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600'}`}
             title="Monitoring des connexions"
           >
             <Activity className="w-4 h-4" />
             <span className="text-sm font-bold hidden sm:inline">Monitoring</span>
           </button>
           )}
           {user?.isPartner && (
           <button
             onClick={() => setActiveView('partner')}
             className={`flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-xl border shadow-sm transition-all active:scale-95 ${activeView === 'partner' ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
             title="Espace Partenaire"
           >
             <Briefcase className="w-4 h-4" />
             <span className="text-sm font-bold hidden sm:inline">Partenaire</span>
           </button>
           )}
           <button
             onClick={() => setActiveView('sinistre')}
             className={`flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-xl border shadow-sm transition-all active:scale-95 ${activeView === 'sinistre' ? 'bg-rose-600 text-white border-rose-600 shadow-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-600'}`}
             title="Assistant Sinistre"
           >
             <ShieldAlert className="w-4 h-4" />
             <span className="text-sm font-bold hidden sm:inline">Sinistre</span>
           </button>
           <button onClick={() => setActiveView('profile')} className={`p-1.5 md:p-2 rounded-xl border border-slate-100 shadow-sm active:scale-95 transition-all ${activeView === 'profile' ? 'bg-primary-600 text-white' : 'bg-white text-slate-400'}`} title="Profil & Paramètres">
             <Settings className="w-5 h-5" />
           </button>
           <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors bg-white p-1.5 md:p-2 rounded-xl border border-slate-100 shadow-sm active:scale-95" title="Déconnexion">
             <LogOut className="w-5 h-5" />
           </button>
        </div>
        </div>{/* fin contenu header */}
      </header>

      <main className="p-3 md:p-8 flex-1">
        <div className={`${activeView === 'admin' || activeView === 'monitoring' || activeView === 'partner' || activeView === 'sinistre' ? 'max-w-7xl' : 'max-w-xl'} mx-auto`}>{renderContent()}</div>
      </main>

      {/* Overlay détail des garanties d'une formule */}
      {coveragePolicy && (
        <CoverageDetailPage
          policy={coveragePolicy}
          onClose={() => setCoveragePolicy(null)}
        />
      )}

      <div className="hidden md:block">
        <Footer 
          onNavigateToTerms={() => setShowTerms(true)}
          onNavigateToPrivacy={() => setShowPrivacy(true)}
        />
      </div>

      <BottomNav activeView={activeView} setActiveView={setActiveView} />

      {/* Badge flottant ingestion catalogue — visible sur toutes les pages (admins) */}
      {user?.isAdmin && <IngestionJobBadge />}

      <ClearDataModal 
        isOpen={isClearModalOpen} 
        onClose={() => setIsClearModalOpen(false)} 
        onConfirmClear={handleClearAllData} 
        onConfirmSave={() => { setIsClearModalOpen(false); setActiveView('home'); }} 
        onTransferToExpert={() => { setIsClearModalOpen(false); setActiveView('analysis'); }}
      />

      {/* Modal Conditions d'utilisation */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto">
          <div className="min-h-screen">
            <TermsOfService onBack={() => setShowTerms(false)} />
          </div>
        </div>
      )}

      {/* Modal Politique de confidentialité */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto">
          <div className="min-h-screen">
            <PrivacyPolicy onBack={() => setShowPrivacy(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
