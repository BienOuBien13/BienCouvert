import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert, ArrowLeft, ArrowRight, CheckCircle, ClipboardList,
  FileText, AlertTriangle, Loader2, Copy, Check, Trash2,
  ChevronRight, Calendar, Clock, BookOpen, AlertCircle,
  Shield, Sparkles, RefreshCw, Plus, CircleCheck,
  MessageCircle, Send, ChevronDown, ChevronUp
} from 'lucide-react';
import { Policy, User } from '../types';
import {
  claimService,
  ClaimSession,
  ClaimContext,
  ClaimAnalysis,
  ClaimAction,
  ChatMessage,
} from '../services/claimService';

// ─── Types helpers ────────────────────────────────────────────────────────────
interface Props {
  user: User;
  policies: Policy[];
}

const WIZARD_STEPS = [
  { id: 1, label: 'Contrat' },
  { id: 2, label: 'Déclaration' },
  { id: 3, label: 'Analyse' },
  { id: 4, label: 'Plan' },
  { id: 5, label: 'Lettre' },
];

const EVENTS_BY_TYPE: Record<string, string[]> = {
  AUT01: ['Accident de la route', 'Vol du véhicule', 'Tentative de vol', 'Bris de glace', 'Incendie / Explosion', 'Catastrophe naturelle', 'Vandalisme', 'Dommages au tiers'],
  HAB01: ['Dégât des eaux', 'Incendie / Explosion', 'Vol / Cambriolage', 'Catastrophe naturelle', 'Vandalisme', 'Dommages électriques', 'Bris de glace', 'Responsabilité civile'],
  SAN01: ['Hospitalisation', 'Consultation spécialiste', 'Soins dentaires', 'Optique / Lunettes', 'Médecine douce', 'Chirurgie', 'Urgences'],
  VIE01: ['Arrêt de travail', 'Invalidité permanente', 'Décès', 'Dépendance'],
  EMP01: ['Arrêt de travail', 'Invalidité', 'Perte d\'emploi', 'Décès'],
  JUR01: ['Litige avec un locataire', 'Litige avec l\'employeur', 'Litige consommateur', 'Accident corporel', 'Conflit de voisinage', 'Litige contractuel'],
  APP01: ['Casse accidentelle', 'Vol', 'Oxydation / Dégâts liquide', 'Panne électronique'],
  PRE01: ['Décès', 'Incapacité de travail', 'Invalidité'],
  LOI01: ['Litige locataire', 'Litige bailleur', 'Trouble de jouissance'],
};

const DOMMAGES_BY_EVENT: Record<string, string[]> = {
  'Dégât des eaux': ['Plafond', 'Murs', 'Parquet / Sol', 'Mobilier', 'Électroménager', 'Vêtements'],
  'Incendie / Explosion': ['Structure du bâtiment', 'Mobilier', 'Équipements électroniques', 'Effets personnels', 'Véhicule'],
  'Vol / Cambriolage': ['Bijoux / Montres', 'Équipements électroniques', 'Espèces', 'Véhicule', 'Documents officiels'],
  'Accident de la route': ['Carrosserie', 'Vitres', 'Mécanique', 'Dommages au tiers', 'Blessures corporelles'],
  'Bris de glace': ['Pare-brise', 'Vitres latérales', 'Lunette arrière', 'Toit vitré'],
  'Arrêt de travail': ['Perte de revenus', 'Frais médicaux', 'Rembousement mensualités'],
};

const DEFAULT_DOMMAGES = ['Dommages matériels', 'Dommages corporels', 'Préjudice financier', 'Perte d\'usage'];

const STATUS_COLORS: Record<string, string> = {
  qualification: 'bg-slate-100 text-slate-600',
  analyzing:     'bg-blue-100 text-blue-700',
  plan:          'bg-amber-100 text-amber-700',
  letter:        'bg-indigo-100 text-indigo-700',
  done:          'bg-emerald-100 text-emerald-700',
};
const STATUS_LABELS: Record<string, string> = {
  qualification: 'En cours',
  analyzing:     'En analyse',
  plan:          'Plan disponible',
  letter:        'Lettre prête',
  done:          'Terminé',
};

const COVERAGE_COLORS: Record<string, string> = {
  true:  'bg-emerald-50 border-emerald-200 text-emerald-800',
  false: 'bg-red-50 border-red-200 text-red-800',
  null:  'bg-amber-50 border-amber-200 text-amber-800',
};
const COVERAGE_ICONS: Record<string, React.FC<any>> = {
  true:  CheckCircle,
  false: AlertCircle,
  null:  AlertTriangle,
};
const COVERAGE_TEXTS: Record<string, string> = {
  true:  'Ce sinistre semble couvert',
  false: 'Ce sinistre ne semble pas couvert',
  null:  'Couverture incertaine — vérifiez avec votre assureur',
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-red-50 border-red-200 text-red-700',
  important: 'bg-amber-50 border-amber-200 text-amber-700',
  normal:    'bg-slate-50 border-slate-200 text-slate-600',
};
const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ClaimAssistant: React.FC<Props> = ({ user, policies }) => {
  const [view, setView] = useState<'history' | 'wizard'>('history');
  const [sessions, setSessions] = useState<ClaimSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [currentSession, setCurrentSession] = useState<ClaimSession | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [checkedActions, setCheckedActions] = useState<Set<number>>(new Set());
  const [letterContent, setLetterContent] = useState('');
  const [emailSubject, setEmailSubject] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [claimForm, setClaimForm] = useState<Partial<ClaimContext>>({
    tiers: false,
    urgence: false,
    dommages: [],
    dateIncident: new Date().toISOString().split('T')[0],
  });

  // ── Load sessions ───────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await claimService.getSessions(user.id);
      setSessions(data);
    } catch (_) {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [user.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  // ── Start new sinistre ──────────────────────────────────────────────────────
  const handleStartNew = () => {
    setCurrentSession(null);
    setWizardStep(1);
    setSelectedPolicyId(null);
    setClaimForm({ tiers: false, urgence: false, dommages: [], dateIncident: new Date().toISOString().split('T')[0] });
    setCheckedActions(new Set());
    setLetterContent('');
    setEmailSubject('');
    setChatMessages([]);
    setChatOpen(false);
    setView('wizard');
  };

  // ── Resume existing session ─────────────────────────────────────────────────
  const handleResumeSession = (session: ClaimSession) => {
    setCurrentSession(session);
    setSelectedPolicyId(session.policyId || null);
    setClaimForm(session.claimData || {});
    setLetterContent(session.letterContent || '');
    setChatMessages(session.messages || []);
    setChatOpen((session.messages || []).length > 0);
    // Determine wizard step from status
    const stepMap: Record<string, number> = { qualification: 2, analyzing: 3, plan: 4, letter: 5, done: 5 };
    setWizardStep(stepMap[session.status] ?? 2);
    setView('wizard');
  };

  // ── Delete session ──────────────────────────────────────────────────────────
  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer ce dossier sinistre ?')) return;
    try {
      await claimService.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (_) {}
  };

  // ── Step 2 → save qualification ─────────────────────────────────────────────
  const handleSaveQualification = async () => {
    if (!claimForm.evenement || !claimForm.dateIncident) {
      alert('Veuillez renseigner l\'événement et la date.');
      return;
    }
    setIsLoading(true);
    try {
      const selectedPolicy = policies.find(p => String(p.id) === String(selectedPolicyId));
      const title = `${claimForm.evenement}${selectedPolicy ? ` — ${selectedPolicy.insurer}` : ''}`;
      if (!currentSession) {
        const session = await claimService.createSession(user.id, selectedPolicyId, claimForm as ClaimContext, title);
        setCurrentSession(session);
      } else {
        await claimService.updateSession(currentSession.id, { claimData: claimForm as ClaimContext, policyId: selectedPolicyId, title });
      }
      setWizardStep(3);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 3 → trigger AI analysis ────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!currentSession) return;
    setIsLoading(true);
    try {
      const { analysis } = await claimService.analyze(currentSession.id);
      setCurrentSession(prev => prev ? { ...prev, analysis, status: 'plan' } : null);
      setWizardStep(4);
    } catch (err: any) {
      alert(`Erreur analyse: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 5 → generate letter ────────────────────────────────────────────────
  const handleGenerateLetter = async () => {
    if (!currentSession) return;
    setIsLoading(true);
    try {
      const result = await claimService.generateLetter(currentSession.id, user.id);
      setLetterContent(result.letter);
      setEmailSubject(result.emailSubject);
      setCurrentSession(prev => prev ? { ...prev, letterContent: result.letter, status: 'done' } : null);
      setWizardStep(5);
      // Reload sessions list
      loadSessions();
    } catch (err: any) {
      alert(`Erreur génération lettre: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLetter = () => {
    navigator.clipboard.writeText(letterContent);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2500);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentSession || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    // Optimistic update
    const optimistic: ChatMessage = { role: 'user', content: msg, ts: new Date().toISOString() };
    setChatMessages(prev => [...prev, optimistic]);
    try {
      const { messages: updated } = await claimService.chat(currentSession.id, msg);
      setChatMessages(updated);
      setCurrentSession(prev => prev ? { ...prev, messages: updated } : null);
    } catch (err: any) {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ Erreur: ${err.message}`, ts: new Date().toISOString() },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const toggleAction = (step: number) => {
    setCheckedActions(prev => {
      const next = new Set(prev);
      next.has(step) ? next.delete(step) : next.add(step);
      return next;
    });
  };

  const selectedPolicy = policies.find(p => String(p.id) === String(selectedPolicyId));
  const events = EVENTS_BY_TYPE[selectedPolicy?.typeCode || ''] || EVENTS_BY_TYPE['HAB01'];
  const dommagesOptions = DOMMAGES_BY_EVENT[claimForm.evenement || ''] || DEFAULT_DOMMAGES;
  const completedActions = checkedActions.size;
  const totalActions = currentSession?.analysis?.actions?.length ?? 0;

  // Chat panel (shown from step 2+ when session exists)
  const renderChatPanel = () => {
    if (!currentSession || wizardStep < 2) return null;
    const unread = chatMessages.length;
    return (
      <div className="mt-3 border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
        {/* Toggle header */}
        <button
          onClick={() => setChatOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-rose-500" />
            <span className="font-black text-sm text-slate-800">Questions à l'IA</span>
            {unread > 0 && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full">
                {unread} message{unread > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {chatOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {chatOpen && (
          <div className="border-t border-slate-100">
            {/* Message list */}
            <div className="max-h-72 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {chatMessages.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <MessageCircle className="w-8 h-8 text-slate-200 mx-auto" />
                  <p className="text-xs text-slate-400">Posez vos questions sur votre sinistre, vos garanties ou les démarches à suivre</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-rose-600 text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[9px] mt-1 ${
                        msg.role === 'user' ? 'text-rose-200' : 'text-slate-400'
                      }`}>
                        {new Date(msg.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                    <span className="text-xs text-slate-500">Réflexion en cours…</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 p-3 border-t border-slate-100 bg-white">
              <textarea
                rows={2}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                placeholder="Posez une question sur votre sinistre…"
                className="flex-1 resize-none text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || chatLoading}
                className="p-3 bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-40 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: History (list of sessions)
  // ─────────────────────────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <div className="space-y-6 animate-fadeIn pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-200">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Assistant Sinistre</h2>
              <p className="text-xs text-slate-500 font-medium">Préparez votre déclaration en 5 étapes</p>
            </div>
          </div>
          <button
            onClick={handleStartNew}
            className="flex items-center gap-2 px-5 py-3 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nouveau sinistre
          </button>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            <span className="font-black">Important :</span> Cet assistant vous aide à préparer votre déclaration. Il ne remplace pas votre assureur. En cas d'urgence, appelez directement votre assureur ou le 15/17/18.
          </p>
        </div>

        {/* Sessions list */}
        {loadingSessions ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 mx-auto bg-slate-100 rounded-3xl flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 mb-1">Aucun dossier sinistre</h3>
              <p className="text-sm text-slate-400">Créez un dossier pour préparer votre déclaration</p>
            </div>
            <button
              onClick={handleStartNew}
              className="inline-flex items-center gap-2 px-6 py-3 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Démarrer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <div
                key={session.id}
                onClick={() => handleResumeSession(session)}
                className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:border-slate-200 cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{session.title || 'Sinistre sans titre'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_COLORS[session.status] || ''}`}>
                      {STATUS_LABELS[session.status] || session.status}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(session.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Wizard
  // ─────────────────────────────────────────────────────────────────────────────
  const analysis = currentSession?.analysis;

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {/* Wizard Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { loadSessions(); setView('history'); }}
          className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {currentSession?.title || 'Nouveau sinistre'}
          </h2>
          <p className="text-[10px] text-slate-400 font-medium">Étape {wizardStep} sur {WIZARD_STEPS.length}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {WIZARD_STEPS.map((step) => (
          <div key={step.id} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full transition-all duration-300 ${
              step.id < wizardStep ? 'bg-rose-500' :
              step.id === wizardStep ? 'bg-rose-400' : 'bg-slate-100'
            }`} />
            <span className={`text-[8px] font-bold uppercase tracking-widest transition-colors ${
              step.id === wizardStep ? 'text-rose-600' : step.id < wizardStep ? 'text-slate-400' : 'text-slate-200'
            }`}>{step.label}</span>
          </div>
        ))}
      </div>

      {/* ── Step 1 : Select Policy ─────────────────────────────────────────────── */}
      {wizardStep === 1 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-900">Quel contrat est concerné ?</h3>
            <p className="text-sm text-slate-500">Sélectionnez le contrat lié à votre sinistre</p>
          </div>

          {policies.length === 0 ? (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-sm font-bold text-amber-700">Aucun contrat enregistré</p>
              <p className="text-xs text-amber-600">Ajoutez d'abord vos contrats dans "Mes Contrats"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {policies.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPolicyId(Number(p.id))}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    String(selectedPolicyId) === String(p.id)
                      ? 'border-rose-400 bg-rose-50'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    String(selectedPolicyId) === String(p.id) ? 'bg-rose-100' : 'bg-slate-100'
                  }`}>
                    <Shield className="w-5 h-5 text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{(p as any).name || p.insurer}</p>
                    <p className="text-xs text-slate-400">{p.insurer} · {p.type}</p>
                  </div>
                  {String(selectedPolicyId) === String(p.id) && (
                    <CheckCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                </div>
              ))}

              {/* Option "Je ne sais pas encore" */}
              <div
                onClick={() => setSelectedPolicyId(null)}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  selectedPolicyId === null
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-500 text-sm">Je ne sais pas encore</p>
                  <p className="text-xs text-slate-400">L'assistant vous aidera à identifier le bon contrat</p>
                </div>
                {selectedPolicyId === null && <CheckCircle className="w-5 h-5 text-slate-400 shrink-0" />}
              </div>
            </div>
          )}

          <button
            onClick={() => setWizardStep(2)}
            className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-[0.98]"
          >
            Étape suivante <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Step 2 : Qualify claim ─────────────────────────────────────────────── */}
      {wizardStep === 2 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-black text-slate-900 mb-1">Décrivez votre sinistre</h3>
            <p className="text-sm text-slate-500">Plus vous êtes précis, meilleure sera l'analyse IA</p>
          </div>

          {/* Urgence banner */}
          <div
            onClick={() => setClaimForm(f => ({ ...f, urgence: !f.urgence }))}
            className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              claimForm.urgence ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
            }`}
          >
            <AlertTriangle className={`w-5 h-5 shrink-0 ${claimForm.urgence ? 'text-red-600' : 'text-slate-400'}`} />
            <div className="flex-1">
              <p className={`font-black text-sm ${claimForm.urgence ? 'text-red-700' : 'text-slate-600'}`}>Situation d'urgence</p>
              <p className="text-xs text-slate-400">Dommages corporels, incendie en cours, inondation active…</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
              claimForm.urgence ? 'border-red-500 bg-red-500' : 'border-slate-300'
            }`}>
              {claimForm.urgence && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>

          <div className="space-y-4">
            {/* Événement */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Que s'est-il passé ? *</label>
              <select
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 font-bold appearance-none text-sm"
                value={claimForm.evenement || ''}
                onChange={e => setClaimForm(f => ({ ...f, evenement: e.target.value, dommages: [] }))}
              >
                <option value="">— Sélectionner le type de sinistre —</option>
                {events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Date du sinistre *</label>
              <input
                type="date"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 font-bold text-sm"
                value={claimForm.dateIncident || ''}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setClaimForm(f => ({ ...f, dateIncident: e.target.value }))}
              />
            </div>

            {/* Lieu */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Lieu du sinistre</label>
              <input
                type="text"
                placeholder="Ville, adresse ou lieu précis…"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 font-bold text-sm"
                value={claimForm.lieu || ''}
                onChange={e => setClaimForm(f => ({ ...f, lieu: e.target.value }))}
              />
            </div>

            {/* Tiers */}
            <div
              onClick={() => setClaimForm(f => ({ ...f, tiers: !f.tiers }))}
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                claimForm.tiers ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                claimForm.tiers ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
              }`}>
                {claimForm.tiers && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className={`font-bold text-sm ${claimForm.tiers ? 'text-blue-700' : 'text-slate-600'}`}>Un tiers est impliqué</p>
                <p className="text-xs text-slate-400">Autre conducteur, voisin, prestataire, personne tierce…</p>
              </div>
            </div>

            {/* Dommages */}
            {claimForm.evenement && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Dommages constatés</label>
                <div className="flex flex-wrap gap-2">
                  {dommagesOptions.map(d => {
                    const checked = (claimForm.dommages || []).includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setClaimForm(f => ({
                          ...f,
                          dommages: checked
                            ? (f.dommages || []).filter(x => x !== d)
                            : [...(f.dommages || []), d]
                        }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                          checked ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Détails libres */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Contexte supplémentaire</label>
              <textarea
                rows={3}
                placeholder="Décrivez les circonstances exactes, ce qui s'est passé, les mesures déjà prises…"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 font-medium text-sm resize-none"
                value={claimForm.details || ''}
                onChange={e => setClaimForm(f => ({ ...f, details: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setWizardStep(1)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
              Retour
            </button>
            <button
              onClick={handleSaveQualification}
              disabled={isLoading || !claimForm.evenement || !claimForm.dateIncident}
              className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-[0.98]"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isLoading ? 'Enregistrement…' : 'Analyser avec l\'IA'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 : Trigger Analysis ─────────────────────────────────────────── */}
      {wizardStep === 3 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-black text-slate-900 mb-1">Analyse IA de votre contrat</h3>
            <p className="text-sm text-slate-500">L'IA analyse votre sinistre et les conditions de votre contrat</p>
          </div>

          {/* Recap card */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Récapitulatif déclaré</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Événement</p>
                <p className="text-sm font-black text-slate-800">{claimForm.evenement || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Date</p>
                <p className="text-sm font-black text-slate-800">
                  {claimForm.dateIncident ? new Date(claimForm.dateIncident + 'T00:00:00').toLocaleDateString('fr-FR') : '—'}
                </p>
              </div>
              {claimForm.lieu && (
                <div className="col-span-2">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Lieu</p>
                  <p className="text-sm font-black text-slate-800">{claimForm.lieu}</p>
                </div>
              )}
              {(claimForm.dommages || []).length > 0 && (
                <div className="col-span-2">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Dommages</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(claimForm.dommages || []).map(d => (
                      <span key={d} className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedPolicy && (
              <div className="pt-2 border-t border-slate-200">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-0.5">Contrat analysé</p>
                <p className="text-sm font-bold text-slate-700">{(selectedPolicy as any).name || selectedPolicy.insurer} · {selectedPolicy.insurer}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setWizardStep(2)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
              Modifier
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isLoading}
              className="flex-[2] py-4 bg-gradient-to-r from-rose-600 to-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-[0.98] hover:shadow-xl"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Lancer l'analyse IA</>
              )}
            </button>
          </div>

          {isLoading && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <div>
                <p className="text-xs font-black text-blue-700">Analyse en cours…</p>
                <p className="text-[10px] text-blue-500">L'IA lit votre contrat et les règles d'assurance</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4 : Analysis results + Action plan ───────────────────────────── */}
      {wizardStep === 4 && analysis && (
        <div className="space-y-5">
          {/* Coverage verdict */}
          <div className={`p-5 border-2 rounded-3xl flex items-start gap-4 ${COVERAGE_COLORS[String(analysis.isCovered)]}`}>
            {React.createElement(COVERAGE_ICONS[String(analysis.isCovered)], { className: 'w-7 h-7 shrink-0 mt-0.5' })}
            <div className="space-y-1.5">
              <p className="font-black text-base">{COVERAGE_TEXTS[String(analysis.isCovered)]}</p>
              <p className="text-sm leading-relaxed opacity-90">{analysis.reasoning}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Fiabilité de l'analyse :</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                  analysis.confidence === 'high' ? 'bg-emerald-200 text-emerald-800' :
                  analysis.confidence === 'medium' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'
                }`}>{CONFIDENCE_LABELS[analysis.confidence]}</span>
              </div>
            </div>
          </div>

          {/* Key numbers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center">
              <Clock className="w-4 h-4 text-rose-500 mx-auto mb-1" />
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wide">Délai déclaration</p>
              <p className="font-black text-slate-900 text-lg">{analysis.declarationDeadlineDays}j</p>
              {analysis.declarationDeadlineDate && (
                <p className="text-[9px] text-rose-600 font-bold">avant le {analysis.declarationDeadlineDate}</p>
              )}
            </div>
            <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center">
              <AlertCircle className="w-4 h-4 text-amber-500 mx-auto mb-1" />
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wide">Franchise</p>
              <p className="font-black text-slate-900 text-sm leading-tight mt-1">{analysis.franchise || 'Non précisée'}</p>
            </div>
            <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center">
              <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-slate-500" />
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wide">Risque refus</p>
              <p className={`font-black text-sm mt-1 ${
                analysis.riskLevel === 'high' ? 'text-red-600' :
                analysis.riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'
              }`}>{analysis.riskLevel === 'high' ? 'Élevé' : analysis.riskLevel === 'medium' ? 'Modéré' : 'Faible'}</p>
            </div>
          </div>

          {/* Action plan */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Plan d'actions
              </h4>
              <span className="text-[10px] font-bold text-slate-400">{completedActions}/{totalActions} accompli(s)</span>
            </div>
            {/* Progress */}
            {totalActions > 0 && (
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${(completedActions / totalActions) * 100}%` }} />
              </div>
            )}

            <div className="space-y-2">
              {(analysis.actions || []).map(action => {
                const done = checkedActions.has(action.step);
                return (
                  <div
                    key={action.step}
                    onClick={() => toggleAction(action.step)}
                    className={`flex items-start gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${
                      done ? 'border-emerald-200 bg-emerald-50 opacity-70' : PRIORITY_COLORS[action.priority]
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      done ? 'border-emerald-500 bg-emerald-500' : 'border-current'
                    }`}>
                      {done && <Check className="w-3 h-3 text-white" />}
                      {!done && <span className="text-[9px] font-black">{action.step}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${done ? 'line-through text-slate-400' : ''}`}>{action.label}</p>
                      {action.deadline && !done && (
                        <p className="text-[10px] font-bold flex items-center gap-1 mt-0.5 opacity-70">
                          <Calendar className="w-3 h-3" />{action.deadline}
                        </p>
                      )}
                    </div>
                    {!done && (
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                        action.priority === 'urgent' ? 'bg-red-200 text-red-700' :
                        action.priority === 'important' ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-500'
                      }`}>{action.priority}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Required docs */}
          {(analysis.requiredDocs || []).length > 0 && (
            <div className="space-y-2">
              <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" /> Documents à rassembler
              </h4>
              <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                {analysis.requiredDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CircleCheck className="w-4 h-4 text-slate-300 shrink-0" />
                    <p className="text-sm text-slate-700 font-medium">{doc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] text-slate-500">{analysis.disclaimer}</p>
          </div>

          <button
            onClick={handleGenerateLetter}
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-primary-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {isLoading ? 'Génération…' : 'Générer la lettre de déclaration'}
          </button>
        </div>
      )}

      {/* ── Step 5 : Generated letter ─────────────────────────────────────────── */}
      {wizardStep === 5 && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900">Votre lettre de déclaration</h3>
              <p className="text-xs text-slate-500">Copiez, adaptez et envoyez à votre assureur</p>
            </div>
          </div>

          {emailSubject && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Objet :</span>
              <span className="text-sm font-bold text-slate-700 flex-1">{emailSubject}</span>
            </div>
          )}

          <div className="relative">
            <textarea
              className="w-full h-72 p-5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-800 font-mono leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-300"
              value={letterContent || currentSession?.letterContent || ''}
              onChange={e => setLetterContent(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCopyLetter}
              className={`flex-1 py-4 flex items-center justify-center gap-2 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-sm ${
                copiedLetter
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copiedLetter ? <><Check className="w-4 h-4" /> Copié !</> : <><Copy className="w-4 h-4" /> Copier</>}
            </button>
            <button
              onClick={handleGenerateLetter}
              disabled={isLoading}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 flex items-center justify-center gap-2 transition-all"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Régénérer
            </button>
          </div>

          <div className="flex items-start gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-black text-emerald-800">Dossier prêt à envoyer</p>
              <p className="text-xs text-emerald-700 leading-relaxed">
                Envoyez cette lettre + les pièces justificatives à votre assureur par courrier recommandé avec accusé de réception, ou via votre espace client en ligne.
              </p>
            </div>
          </div>

          <button
            onClick={() => { loadSessions(); setView('history'); }}
            className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-[0.98]"
          >
            <ClipboardList className="w-4 h-4" /> Voir tous mes dossiers
          </button>
        </div>
      )}

      {/* ── Chat contextuel (visible dès l'étape 2) ──────────────────────── */}
      {renderChatPanel()}
    </div>
  );
};

export default ClaimAssistant;
