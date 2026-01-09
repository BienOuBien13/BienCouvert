// =============================================================================
// APPLICATION PRINCIPALE - AssurClair
// Composant racine qui gère l'état global de l'application et la navigation.
// Ce fichier orchestre l'authentification, la gestion des polices, le chat IA,
// et toutes les vues principales de l'application.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PolicyForm } from './components/PolicyForm';
import { PolicyList } from './components/PolicyList';
import { ChatInterface } from './components/ChatInterface';
import { AnalysisView } from './components/AnalysisView';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { ClearDataModal } from './components/ClearDataModal';
import { UserProfile } from './components/UserProfile';
import { ExpertContact } from './components/ExpertContact';
import { AdminView } from './components/AdminView';
import { Policy, Message, User, AppView, UserProfileData } from './types';
import { authService } from './services/authService';
import { storageService } from './services/storageService';
import { Menu, ShieldCheck } from 'lucide-react';

function App() {
  // --- États principaux de l'application ---
  const [user, setUser] = useState<User | null>(null);                    // Utilisateur connecté (null si non authentifié)
  const [policies, setPolicies] = useState<Policy[]>([]);                 // Liste des polices d'assurance de l'utilisateur
  const [messages, setMessages] = useState<Message[]>([]);                // Historique du chat avec l'IA
  const [activeView, setActiveView] = useState<AppView>('policies');     // Vue active (policies, chat, analysis, etc.)
  const [isLoading, setIsLoading] = useState(true);                      // Indicateur de chargement initial
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null); // Police en cours d'édition
  const [showAuth, setShowAuth] = useState(false);                       // Affichage du formulaire d'authentification
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);       // Affichage de la modale de réinitialisation
  
  // Profil utilisateur avec valeurs par défaut
  const [userProfile, setUserProfile] = useState<UserProfileData>({
    childrenCount: 0,
    healthNeeds: [],
    expensiveEquipment: [],
    hasPool: false,
    hasGarden: false
  });

  // États de l'interface utilisateur
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);   // Sidebar réduite/dépliée
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);       // Menu mobile ouvert/fermé

  // --- Effet de montage : restauration de la session utilisateur ---
  // Vérifie au chargement si un utilisateur est déjà connecté (session en localStorage)
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) handleLogin(currentUser);
    setIsLoading(false);
  }, []);

  /**
   * Gestionnaire de connexion utilisateur.
   * Initialise l'état de l'application avec les données de l'utilisateur connecté.
   * @param loggedInUser - Utilisateur authentifié
   */
  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    const userPolicies = storageService.getPolicies(loggedInUser.id);
    setPolicies(userPolicies);
    if (loggedInUser.profile) setUserProfile(loggedInUser.profile);
    setMessages([]);                    // Réinitialise l'historique du chat
    setActiveView('policies');          // Retour à la vue principale
    setShowAuth(false);                 // Ferme l'écran d'authentification
  };

  /**
   * Gestionnaire de déconnexion utilisateur.
   * Réinitialise complètement l'état de l'application.
   */
  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setPolicies([]);
    setMessages([]);
    setShowAuth(false);
  };

  /**
   * Réinitialisation complète des données utilisateur.
   * Supprime toutes les polices et réinitialise le profil.
   * Action irréversible confirmée par une modale.
   */
  const handleClearAllData = () => {
    if (user) {
      // Suppression de toutes les polices de l'utilisateur
      policies.forEach(p => storageService.deletePolicy(p.id));
      
      // Réinitialisation du profil utilisateur
      const resetProfile = { childrenCount: 0 };
      authService.updateUser(user.id, { name: user.name, email: user.email, profile: resetProfile });
      setUserProfile(resetProfile);
      setPolicies([]);
      setMessages([]);
    }
    setIsClearModalOpen(false);
    setActiveView('policies');
    alert("Données réinitialisées avec succès.");
  };

  /**
   * Ajout d'une nouvelle police d'assurance.
   * @param policy - Objet police sans userId (ajouté automatiquement)
   */
  const handleAddPolicy = (policy: Omit<Policy, 'userId'>) => {
    if (!user) return;
    const policyWithUser: Policy = { ...policy, userId: user.id };
    storageService.savePolicy(policyWithUser);
    setPolicies(prev => [policyWithUser, ...prev]);  // Ajout en début de liste
  };

  const handleUpdatePolicy = (updatedPolicy: Policy) => {
    storageService.updatePolicy(updatedPolicy);
    setPolicies(prev => prev.map(p => p.id === updatedPolicy.id ? updatedPolicy : p));
    setEditingPolicy(null);
  };

  const handleDeletePolicy = (id: string) => {
    if (window.confirm("Supprimer ce contrat ?")) {
      storageService.deletePolicy(id);
      setPolicies(prev => prev.filter(p => p.id !== id));
      if (editingPolicy?.id === id) setEditingPolicy(null);
    }
  };

  const handleEditPolicy = (policy: Policy) => {
    setEditingPolicy(policy);
    setActiveView('policies');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateProfile = (newProfile: UserProfileData) => {
    setUserProfile(newProfile);
    if (user) {
      const updatedUser = { ...user, profile: newProfile };
      setUser(updatedUser);
      authService.updateUser(user.id, { name: user.name, email: user.email, profile: newProfile });
    }
  };

  const renderContent = () => {
    if (!user) return null;

    switch (activeView) {
      case 'policies':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <div className="xl:col-span-5 space-y-6">
              <PolicyForm 
                onAddPolicy={handleAddPolicy} 
                onUpdatePolicy={handleUpdatePolicy}
                initialData={editingPolicy}
                onCancelEdit={() => setEditingPolicy(null)}
                existingPolicies={policies}
              />
            </div>
            <div className="xl:col-span-7 space-y-6">
              <PolicyList 
                policies={policies} 
                onDelete={handleDeletePolicy} 
                onEdit={handleEditPolicy}
                user={user} 
                onUpdatePolicy={handleUpdatePolicy}
              />
            </div>
          </div>
        );
      case 'chat':
        return <div className="h-[calc(100vh-140px)]"><ChatInterface policies={policies} messages={messages} setMessages={setMessages} /></div>;
      case 'analysis':
        return <AnalysisView policies={policies} profile={userProfile} onUpdateProfile={handleUpdateProfile} user={user} onFinishSimulation={() => setIsClearModalOpen(true)} />;
      case 'experts':
        return <ExpertContact policies={policies} />;
      case 'profile':
        return <UserProfile user={user} onUpdateUser={setUser} onUpdateProfile={handleUpdateProfile} />;
      case 'admin':
        return <AdminView />;
      default: return null;
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Chargement...</div>;
  if (!user) {
    if (showAuth) return <AuthScreen onLogin={handleLogin} onBack={() => setShowAuth(false)} />;
    return <LandingPage onStart={() => setShowAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <Sidebar activeView={activeView} setActiveView={setActiveView} user={user} onLogout={handleLogout} isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="lg:hidden bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between sticky top-0 z-30">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-600 -ml-2"><Menu className="w-6 h-6" /></button>
          <div className="flex items-center gap-2" onClick={() => setActiveView('policies')}><div className="bg-primary-600 p-1.5 rounded-lg"><ShieldCheck className="w-5 h-5 text-white" /></div><span className="font-bold text-slate-900">AssurClair</span></div>
          <div className="w-10"></div>
        </header>
        <main className="p-4 md:p-8 min-h-screen">
          <div className="max-w-6xl mx-auto animate-fadeIn">{renderContent()}</div>
        </main>
      </div>
      <ClearDataModal 
        isOpen={isClearModalOpen} 
        onClose={() => setIsClearModalOpen(false)} 
        onConfirmClear={handleClearAllData} 
        onConfirmSave={() => {
          setIsClearModalOpen(false);
          setActiveView('policies');
          alert("Audit sauvegardé dans votre profil.");
        }} 
        onTransferToExpert={() => {
          setIsClearModalOpen(false);
          setActiveView('experts');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

export default App;
