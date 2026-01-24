
import React, { useState, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { PolicyForm } from './components/PolicyForm';
import { ModernPolicyWizard } from './components/ModernPolicyWizard';
import { SmartChatAssistant } from './components/SmartChatAssistant';
import { PolicyList } from './components/PolicyList';
import { ChatInterface } from './components/ChatInterface';
import { AnalysisView } from './components/AnalysisView';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { ClearDataModal } from './components/ClearDataModal';
import { UserProfile } from './components/UserProfile';
import { ExpertContact } from './components/ExpertContact';
import { AdminView } from './components/AdminView';
import { PolicyStats } from './components/PolicyStats';
import { Policy, Message, User, AppView, UserProfileData } from './types';
import { authService } from './services/authService';
import { storageService } from './services/storageService';
import { 
  ShieldCheck, Database, LogOut, Sparkles, 
  ArrowRight, CheckCircle2, Search, Zap, MessageSquare,
  Rocket, Target, Flag, Info, Settings
} from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeView, setActiveView] = useState<AppView>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  
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
    setIsLoading(false);
  }, []);

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
            {/* Catchy Hero Section avec Texte Impactant */}
            <div className="space-y-6 px-2 py-4 text-center md:text-left">
               <div className="space-y-2">
                  <p className="text-primary-600 font-black text-[10px] uppercase tracking-[0.4em]">Propulsez votre protection</p>
                  <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-[0.9] lg:max-w-xl">
                    Reprenez le pouvoir sur <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">vos assurances.</span>
                  </h2>
               </div>
               <p className="text-slate-500 font-bold text-sm max-w-sm mx-auto md:mx-0 leading-relaxed">
                  Fini les contrats oubliés et les garanties en doublon. BienCouvert analyse tout pour vous en 2 minutes.
               </p>
               <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                     <CheckCircle2 className="w-3.5 h-3.5" /> Économies détectées
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary-100">
                     <Sparkles className="w-3.5 h-3.5" /> IA Gemini 3.0 Pro
                  </div>
               </div>
            </div>

            {/* Barre de Progression de l'Onboarding */}
            <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
               <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Niveau de Sérénité</h4>
                  <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{policies.length > 0 ? (policies.length >= 3 ? '100%' : '50%') : '10%'}</span>
               </div>
               <div className="flex gap-2 h-2.5">
                  <div className={`flex-1 rounded-full transition-all duration-1000 ${policies.length > 0 ? 'bg-primary-500 shadow-[0_0_15px_rgba(2,132,199,0.3)]' : 'bg-primary-500 animate-pulse'}`} />
                  <div className={`flex-1 rounded-full transition-all duration-1000 ${policies.length >= 3 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-slate-100'}`} />
                  <div className={`flex-1 rounded-full transition-all duration-1000 ${policies.length >= 5 ? 'bg-amber-500' : 'bg-slate-100'}`} />
               </div>
            </div>

            {/* Mission Path (Fun UI) */}
            <div className="space-y-4">
               <div className="px-2 flex items-center justify-between">
                 <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Votre Mission</h3>
               </div>

               <div className="space-y-4">
                  {/* Step 1 */}
                  <div 
                    onClick={() => setActiveView('policies')}
                    className={`relative p-6 rounded-[2.5rem] border transition-all cursor-pointer active:scale-95 group overflow-hidden ${
                      policies.length === 0 
                      ? 'bg-slate-900 text-white shadow-2xl border-slate-900' 
                      : 'bg-white text-slate-900 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-5 relative z-10">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-6 ${
                         policies.length === 0 ? 'bg-primary-600 text-white shadow-lg' : 'bg-primary-50 text-primary-600'
                       }`}>
                          <Search className="w-7 h-7" />
                       </div>
                       <div className="flex-grow">
                          <h5 className="font-black text-lg tracking-tight">Le Scan de Départ</h5>
                          <p className={`text-[11px] font-medium ${policies.length === 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                            {policies.length === 0 ? "Ajoutez vos 3 premiers contrats." : `${policies.length} contrat(s) sécurisé(s) !`}
                          </p>
                       </div>
                       {policies.length > 0 ? (
                         <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"><CheckCircle2 className="w-5 h-5" /></div>
                       ) : (
                         <div className="w-8 h-8 rounded-full bg-primary-600/50 text-white flex items-center justify-center animate-pulse"><ArrowRight className="w-5 h-5" /></div>
                       )}
                    </div>
                    {policies.length === 0 && (
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-400 to-transparent -translate-x-full group-hover:animate-scan" />
                    )}
                  </div>

                  {/* Step 2 */}
                  <div 
                    onClick={() => policies.length > 0 && setActiveView('analysis')}
                    className={`p-6 rounded-[2.5rem] border transition-all active:scale-95 group overflow-hidden ${
                      policies.length > 0 && policies.length < 3
                      ? 'bg-emerald-600 text-white shadow-2xl border-emerald-600 cursor-pointer' 
                      : (policies.length >= 3 ? 'bg-white text-slate-900 border-slate-100 cursor-pointer' : 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed opacity-60')
                    }`}
                  >
                    <div className="flex items-center gap-5">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                         policies.length > 0 && policies.length < 3 ? 'bg-white text-emerald-600 shadow-lg' : 'bg-emerald-50 text-emerald-600'
                       }`}>
                          <Zap className="w-7 h-7" />
                       </div>
                       <div className="flex-grow">
                          <h5 className="font-black text-lg tracking-tight">L'Audit Doublons</h5>
                          <p className={`text-[11px] font-medium ${policies.length > 0 && policies.length < 3 ? 'text-emerald-100' : 'text-slate-500'}`}>
                            Traquez les garanties inutiles.
                          </p>
                       </div>
                       {policies.length >= 3 ? (
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"><CheckCircle2 className="w-5 h-5" /></div>
                       ) : <ArrowRight className="w-5 h-5 opacity-40" />}
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div 
                    onClick={() => policies.length >= 3 && setActiveView('experts')}
                    className={`p-6 rounded-[2.5rem] border transition-all active:scale-95 group overflow-hidden ${
                      policies.length >= 3
                      ? 'bg-amber-500 text-white shadow-2xl border-amber-500 cursor-pointer' 
                      : 'bg-slate-50 text-slate-300 border-transparent cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-5">
                       <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                         policies.length >= 3 ? 'bg-white text-amber-600 shadow-lg' : 'bg-amber-50 text-amber-600'
                       }`}>
                          <Flag className="w-7 h-7" />
                       </div>
                       <div className="flex-grow">
                          <h5 className="font-black text-lg tracking-tight">Le Pacte Économie</h5>
                          <p className={`text-[11px] font-medium ${policies.length >= 3 ? 'text-amber-100' : 'text-slate-500'}`}>
                            Encaissez vos gains avec un expert.
                          </p>
                       </div>
                       <ArrowRight className="w-5 h-5 opacity-40" />
                    </div>
                  </div>
               </div>
            </div>

            {/* Dashboard / Stats (Seulement si données) */}
            {policies.length > 0 && (
              <div className="space-y-6 animate-slideUp">
                <PolicyStats policies={policies} />
              </div>
            )}

            {/* Chat Float Style */}
            <div className="p-6 bg-primary-600 rounded-[2.5rem] text-white flex items-center justify-between group cursor-pointer shadow-3xl shadow-primary-900/30 active:scale-95 transition-all" onClick={() => setActiveView('chat')}>
              <div className="flex items-center gap-5">
                 <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-primary-600 shadow-xl group-hover:scale-110 transition-transform"><MessageSquare className="w-6 h-6" /></div>
                 <div>
                    <h5 className="font-black text-lg tracking-tight">Assistant IA</h5>
                    <p className="text-[10px] text-primary-100 font-bold uppercase tracking-widest">Une question sur vos contrats ?</p>
                 </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><ArrowRight className="w-4 h-4" /></div>
            </div>
            
            <div className="text-center pb-10">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Propulsé par Gemini 3.0 Pro</p>
            </div>
          </div>
        );
      case 'add':
        return (
          <div className="space-y-6 animate-fadeIn max-w-5xl mx-auto">
            <SmartChatAssistant user={user} onAddPolicy={handleAddPolicy} onCancel={() => setActiveView('home')} />
          </div>
        );
      case 'policies':
        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Header avec navigation */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Mon Portefeuille</h2>
                <p className="text-slate-600 font-medium">{policies.length} contrat(s) d'assurance</p>
              </div>
              <button
                onClick={() => setActiveView('add')}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-2xl font-black hover:shadow-xl hover:scale-105 transition-all"
              >
                <Sparkles className="w-5 h-5" />
                Ajouter des contrats
              </button>
            </div>

            <PolicyList 
              policies={policies} 
              onDelete={handleDeletePolicy} 
              onEdit={handleEditPolicy}
              user={user} 
              onUpdatePolicy={handleUpdatePolicy}
            />
          </div>
        );
      case 'chat':
        return <div className="h-[calc(100vh-140px)] animate-fadeIn"><ChatInterface policies={policies} messages={messages} setMessages={setMessages} /></div>;
      case 'analysis':
        return <div className="animate-fadeIn"><AnalysisView policies={policies} profile={userProfile} onUpdateProfile={handleUpdateProfile} user={user} onFinishSimulation={() => setIsClearModalOpen(true)} /></div>;
      case 'experts':
        return <div className="animate-fadeIn"><ExpertContact policies={policies} /></div>;
      case 'profile':
        return <div className="animate-fadeIn"><UserProfile user={user} onUpdateUser={setUser} onUpdateProfile={handleUpdateProfile} onClose={() => setActiveView('home')} /></div>;
      case 'admin':
        return <AdminView />;
      default: return null;
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-primary-600 font-black uppercase tracking-[0.4em] animate-pulse">BienCouvert</div>;
  if (!user) {
    if (showAuth) return <AuthScreen onLogin={handleLogin} onBack={() => setShowAuth(false)} />;
    return <LandingPage onStart={() => setShowAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 md:bg-slate-50 pb-32">
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

      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-100 h-16 px-6 flex items-center justify-between sticky top-0 z-[60]">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveView('home')}>
          <div className="bg-primary-600 p-1.5 rounded-xl shadow-lg shadow-primary-200 group-hover:rotate-12 transition-transform"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <span className="font-black text-slate-900 uppercase tracking-tighter text-lg">BienCouvert</span>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => setActiveView('admin')} 
             className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm transition-all active:scale-95 ${activeView === 'admin' ? 'bg-primary-600 text-white border-primary-600 shadow-primary-200' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300 hover:text-primary-600'}`}
             title="Administration - Base de Connaissances"
           >
             <Database className="w-4 h-4" />
             <span className="text-sm font-bold hidden sm:inline">Admin</span>
           </button>
           <button onClick={() => setActiveView('profile')} className={`p-2 rounded-xl border border-slate-100 shadow-sm active:scale-95 transition-all ${activeView === 'profile' ? 'bg-primary-600 text-white' : 'bg-white text-slate-400'}`} title="Profil & Paramètres">
             <Settings className="w-5 h-5" />
           </button>
           <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors bg-white p-2 rounded-xl border border-slate-100 shadow-sm active:scale-95" title="Déconnexion">
             <LogOut className="w-5 h-5" />
           </button>
        </div>
      </header>

      <main className="p-4 md:p-8">
        <div className="max-w-xl mx-auto">{renderContent()}</div>
      </main>

      <BottomNav activeView={activeView} setActiveView={setActiveView} />

      <ClearDataModal 
        isOpen={isClearModalOpen} 
        onClose={() => setIsClearModalOpen(false)} 
        onConfirmClear={handleClearAllData} 
        onConfirmSave={() => { setIsClearModalOpen(false); setActiveView('home'); }} 
        onTransferToExpert={() => { setIsClearModalOpen(false); setActiveView('experts'); }}
      />
    </div>
  );
}

export default App;
