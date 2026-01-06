
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PolicyForm } from './components/PolicyForm';
import { PolicyList } from './components/PolicyList';
import { ChatInterface } from './components/ChatInterface';
import { AnalysisView } from './components/AnalysisView';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { PolicyStats } from './components/PolicyStats';
import { UserProfile } from './components/UserProfile';
import { ExpertContact } from './components/ExpertContact';
import { Policy, Message, User, AppView } from './types';
import { authService } from './services/authService';
import { storageService } from './services/storageService';
import { Menu, ShieldCheck } from 'lucide-react';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeView, setActiveView] = useState<AppView>('policies');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  
  // UI State for Navigation
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      (async () => {
        await handleLogin(currentUser);
        setIsLoading(false);
      })();
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async (loggedInUser: User) => {
    setUser(loggedInUser);
    try {
      const userPolicies = await storageService.getPolicies(loggedInUser.id);
      setPolicies(userPolicies);
    } catch (err) {
      console.error('Failed to load policies after login', err);
      setPolicies([]);
    }
    setMessages([]);
    setActiveView('policies');
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setPolicies([]);
    setMessages([]);
    setShowAuth(false);
  };

  const handleAddPolicy = async (policy: Omit<Policy, 'userId'> & { file?: File | null; fileData?: string | null; fileName?: string | null }) => {
    if (!user) return;
    const policyWithUser: any = { ...policy, userId: user.id };
    try {
      const created = await storageService.savePolicy(policyWithUser);
      // Use returned created policy (may include summary, fileData, id)
      setPolicies(prev => [created, ...prev]);
    } catch (err) {
      console.error('Failed to save policy', err);
    }
  };

  const handleUpdatePolicy = async (updatedPolicy: Policy & { file?: File | null; fileData?: string | null; fileName?: string | null }) => {
    try {
      const updated = await storageService.updatePolicy(updatedPolicy);
      setPolicies(prev => prev.map(p => p.id === updated.id ? updated : p));
      setEditingPolicy(null);
    } catch (err) {
      console.error('Failed to update policy', err);
    }
  };

  const handleDeletePolicy = (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce contrat ?")) {
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

  const renderContent = () => {
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
              />
              <PolicyStats policies={policies} />
            </div>
            <div className="xl:col-span-7 space-y-6">
              <div className="flex justify-between items-end mb-2">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Mes Contrats</h2>
                <span className="bg-white px-3 py-1 rounded-full text-xs font-bold border border-slate-200 text-slate-500">
                  {policies.length} contrats
                </span>
              </div>
              <PolicyList 
                policies={policies} 
                onDelete={handleDeletePolicy} 
                onEdit={handleEditPolicy}
              />
            </div>
          </div>
        );
      case 'chat':
        return (
          <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-120px)]">
            <ChatInterface 
              policies={policies} 
              messages={messages} 
              setMessages={setMessages} 
            />
          </div>
        );
      case 'analysis':
        return <AnalysisView policies={policies} />;
      case 'experts':
        return <ExpertContact policies={policies} />;
      case 'profile':
        return <UserProfile user={user!} onUpdateUser={setUser} />;
      default:
        return null;
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Initialisation...</div>;
  
  if (!user) {
    if (showAuth) return <AuthScreen onLogin={handleLogin} onBack={() => setShowAuth(false)} />;
    return <LandingPage onStart={() => setShowAuth(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        user={user} 
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="bg-primary-600 p-1.5 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">AssurClair</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="p-4 md:p-8 min-h-[calc(100vh-64px)] lg:min-h-screen">
          <div className="max-w-6xl mx-auto animate-fadeIn">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
