
import React, { useState, useEffect, useRef } from 'react';
import { uuid } from '../utils/uuid';
import { 
  FileText, Loader2, ArrowRight, 
  Car, Home, Heart, Scale, Shield, CreditCard, Smartphone, Banknote, 
  Sparkles, Zap, X, Bot, CheckCircle2, ChevronLeft, Search, Check, Info, Database
} from 'lucide-react';
import { Policy, PolicyType } from '../types';
import { searchPolicyInfo, parsePoliciesFromText } from '../services/geminiService';
import { storageService } from '../services/storageService';

interface Props {
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onUpdatePolicy: (policy: Policy) => void;
  initialData?: Policy | null;
  onCancelEdit?: () => void;
  existingPolicies?: Policy[];
}

type FormView = 'selector' | 'input' | 'refining';
type InputMode = 'smart' | 'web';

const GUIDE_CATEGORIES = [
  { type: PolicyType.AUTO, label: 'Automobile', icon: Car, color: 'bg-blue-50 text-blue-600 border-blue-100', description: 'Assurance voiture, moto' },
  { type: PolicyType.HOME, label: 'Habitation', icon: Home, color: 'bg-orange-50 text-orange-600 border-orange-100', description: 'Appartement, maison' },
  { type: PolicyType.HEALTH, label: 'Santé', icon: Heart, color: 'bg-emerald-50 text-emerald-600 border-emerald-100', description: 'Mutuelle, prévoyance' },
  { type: PolicyType.BANK_CARD, label: 'Carte Bancaire', icon: CreditCard, color: 'bg-indigo-50 text-indigo-600 border-indigo-100', description: 'VISA, Mastercard' },
  { type: PolicyType.MOBILE, label: 'Appareils', icon: Smartphone, color: 'bg-slate-50 text-slate-600 border-slate-100', description: 'Smartphone, tablette' },
  { type: PolicyType.LEGAL, label: 'Juridique', icon: Scale, color: 'bg-purple-50 text-purple-600 border-purple-100', description: 'Protection juridique' },
  { type: PolicyType.LOAN, label: 'Emprunteur', icon: Banknote, color: 'bg-amber-50 text-amber-600 border-amber-100', description: 'Crédit immo' },
  { type: PolicyType.OTHER, label: 'Autre', icon: Shield, color: 'bg-slate-50 text-slate-400 border-slate-100', description: 'Assurance diverse' },
];

const MAJOR_INSURERS = [
  { name: 'AXA', color: 'bg-blue-600', text: 'white' },
  { name: 'MAIF', color: 'bg-red-600', text: 'white' },
  { name: 'MACIF', color: 'bg-blue-500', text: 'white' },
  { name: 'Allianz', color: 'bg-indigo-900', text: 'white' },
  { name: 'Matmut', color: 'bg-blue-800', text: 'white' },
  { name: 'GMF', color: 'bg-orange-500', text: 'white' },
  { name: 'Generali', color: 'bg-red-700', text: 'white' },
  { name: 'Direct Assur.', color: 'bg-primary-600', text: 'white' },
];

export const PolicyForm: React.FC<Props> = ({ onAddPolicy, onUpdatePolicy, initialData, onCancelEdit, existingPolicies = [] }) => {
  const [formView, setFormView] = useState<FormView>('selector');
  const [mode, setMode] = useState<InputMode>('smart');
  const [smartText, setSmartText] = useState('');
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  
  // États pour le chatbot conversationnel
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', text: string}>>([]);
  const [isWaitingResponse, setIsWaitingResponse] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Raffinement State
  const [refiningPolicy, setRefiningPolicy] = useState<Partial<Policy> & { 
    isSearchingPDF: boolean;
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
  } | null>(null);

  // Manual Mode Fields
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState<PolicyType>(PolicyType.AUTO);
  const [coverageDetail, setCoverageDetail] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormView('input');
      setName(initialData.name);
      setProvider(initialData.provider);
      setType(initialData.type);
      setCoverageDetail(initialData.coverageDetail || '');
      setSelectedOptions(initialData.options || []);
      setSummary(initialData.summary || '');
      setSourceUrl(initialData.sourceUrl || '');
      setMode('web');
    }
  }, [initialData]);

  // Auto-scroll pour le chatbot
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Initialiser le chatbot quand on passe en mode smart
  useEffect(() => {
    if (mode === 'smart' && formView === 'input' && chatMessages.length === 0) {
      initializeChatbot(type);
    }
  }, [mode, formView]);

  const selectCategory = (catType: PolicyType) => {
    setType(catType);
    setFormView('input');
    // Initialiser la conversation avec une question de l'IA
    if (mode === 'smart' && chatMessages.length === 0) {
      initializeChatbot(catType);
    }
  };

  const initializeChatbot = (catType: PolicyType) => {
    const categoryName = GUIDE_CATEGORIES.find(c => c.type === catType)?.label || 'assurance';
    const initialMessage = `Bonjour ! 👋 Je vais vous aider à enregistrer votre ${categoryName.toLowerCase()}. Pour commencer, chez quel assureur êtes-vous ?`;
    setChatMessages([{ role: 'assistant', text: initialMessage }]);
  };

  const resetForm = () => {
    setName(''); setProvider(''); setType(PolicyType.AUTO); 
    setCoverageDetail(''); setSelectedOptions([]); setSummary('');
    setSourceUrl(''); setSmartText(''); setRefiningPolicy(null);
    setChatMessages([]); setIsWaitingResponse(false);
    setMode('smart');
    setFormView('selector');
    if (onCancelEdit) onCancelEdit();
  };

  const startRefining = async (extracted: Partial<Policy>) => {
    setFormView('refining');
    const temp: any = { ...extracted, isSearchingPDF: true };
    setRefiningPolicy(temp);

    try {
      // Priorité 1 : Recherche dans la base vérifiée (Admin Base)
      const internal = await storageService.findCgInRepo(extracted.provider!, extracted.name || 'Contrat', extracted.type as PolicyType);
      let data;
      if (internal) {
        data = { 
          sourceUrl: internal.pdfUrl, 
          isInternalSource: true, 
          suggestedFormulas: internal.indexedFormulas, 
          suggestedOptions: internal.indexedOptions, 
          summary: internal.semanticSummary 
        };
      } else {
        // Priorité 2 : Recherche Web (Google Search Grounding)
        const info = await searchPolicyInfo(extracted.provider!, extracted.type as PolicyType, extracted.name || 'Contrat');
        data = { 
          sourceUrl: info.sourceUrl, 
          summary: info.summary, 
          suggestedFormulas: info.detectedFormulas, 
          suggestedOptions: info.availableOptions, 
          isInternalSource: false 
        };
      }
      setRefiningPolicy({ ...temp, ...data, isSearchingPDF: false });
    } catch (e) {
      setRefiningPolicy({ ...temp, isSearchingPDF: false, suggestedFormulas: [], suggestedOptions: [] });
    }
  };

  const handleChatMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isWaitingResponse) return;
    
    // Ajouter le message utilisateur
    const newMessages = [...chatMessages, { role: 'user' as const, text: userMessage }];
    setChatMessages(newMessages);
    setSmartText('');
    setIsWaitingResponse(true);
    
    try {
      // Construire le contexte pour l'IA
      const conversationContext = newMessages.map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.text}`).join('\n');
      const fullContext = `Tu es un assistant qui aide à enregistrer des contrats d'assurance. Pose des questions courtes et précises pour obtenir : 1) l'assureur, 2) le nom/numéro du contrat, 3) la formule si applicable. Quand tu as assez d'infos, dis "[COMPLET]" suivi des informations extraites au format JSON.\n\nConversation:\n${conversationContext}\nAssistant:`;
      
      const result = await parsePoliciesFromText(fullContext);
      
      // Vérifier si on a assez d'informations
      if (result.policies.length > 0 && result.policies[0].provider && result.policies[0].name) {
        startRefining(result.policies[0]);
      } else if (result.clarificationQuestions) {
        // Poser une question de clarification
        setChatMessages([...newMessages, { role: 'assistant', text: result.clarificationQuestions }]);
      } else {
        // Question par défaut basée sur ce qui manque
        let nextQuestion = "Pouvez-vous me donner plus de détails sur votre contrat ?";
        const lastMsg = conversationContext.toLowerCase();
        
        if (!lastMsg.includes('axa') && !lastMsg.includes('maif') && !lastMsg.includes('macif') && !lastMsg.includes('allianz')) {
          nextQuestion = "Chez quel assureur avez-vous souscrit ce contrat ?";
        } else if (!result.policies[0]?.name) {
          nextQuestion = "Parfait ! Connaissez-vous le nom ou le numéro de votre contrat ? Sinon, quelle est votre formule (Tiers, Tous Risques, etc.) ?";
        }
        
        setChatMessages([...newMessages, { role: 'assistant', text: nextQuestion }]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages([...newMessages, { role: 'assistant', text: "Désolé, j'ai rencontré une erreur. Pouvez-vous reformuler ?" }]);
    } finally {
      setIsWaitingResponse(false);
    }
  };

  const handleSmartExtraction = async (text: string) => {
    handleChatMessage(text);
  };

  const handleManualNext = () => {
    if (!provider || !name) return;
    startRefining({ provider, name, type, coverageDetail, options: selectedOptions });
  };

  const finalizeSave = () => {
    if (!refiningPolicy) return;
    const finalPolicy: Omit<Policy, 'userId'> = {
      id: initialData?.id || uuid(),
      name: refiningPolicy.name || name || 'Sans nom',
      provider: refiningPolicy.provider || provider,
      type: refiningPolicy.type || type,
      coverageDetail: refiningPolicy.coverageDetail || coverageDetail,
      options: refiningPolicy.options || selectedOptions,
      summary: refiningPolicy.summary || summary || "Vérifié par AssurClair.",
      sourceUrl: refiningPolicy.sourceUrl || sourceUrl,
      isInternalSource: refiningPolicy.isInternalSource,
      addedAt: Date.now(),
      fileData: null,
      fileName: null,
      mimeType: 'text/plain'
    };

    if (initialData) onUpdatePolicy(finalPolicy as Policy);
    else onAddPolicy(finalPolicy);
    resetForm();
  };

  if (formView === 'selector') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between px-2">
           <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Admission Express</h2>
           <div className="bg-primary-50 px-3 py-1 rounded-full text-[9px] font-black uppercase text-primary-600 tracking-widest flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> Étape 1 : Le Scan
           </div>
        </div>
        
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {GUIDE_CATEGORIES.map((cat) => (
              <button
                key={cat.type}
                onClick={() => selectCategory(cat.type)}
                className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 ${cat.color} group`}
              >
                <cat.icon className="w-8 h-8 mb-3 transition-transform group-hover:scale-110" />
                <span className="text-xs font-black uppercase tracking-tighter">{cat.label}</span>
              </button>
            ))}
          </div>

          <button 
            onClick={() => { setType(PolicyType.OTHER); setFormView('input'); setMode('smart'); }}
            className="w-full flex items-center justify-center gap-3 p-5 bg-slate-900 text-white rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            Saisie Libre / Assistant Vocal
          </button>
        </div>
      </div>
    );
  }

  if (formView === 'refining') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between px-2">
           <button onClick={() => setFormView('input')} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest transition-colors">
              <ChevronLeft className="w-4 h-4" /> Retour
           </button>
           <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${refiningPolicy?.isInternalSource ? 'bg-emerald-50 text-emerald-600' : 'bg-primary-50 text-primary-600'}`}>
              {refiningPolicy?.isInternalSource ? <Database className="w-3 h-3" /> : <Search className="w-3 h-3" />}
              {refiningPolicy?.isInternalSource ? 'Base Certifiée' : 'Analyse en direct'}
           </div>
        </div>

        <div className="bg-white rounded-[3rem] border border-slate-200 p-8 shadow-2xl space-y-8 relative overflow-hidden">
           {/* Header du Raffinement */}
           <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
              <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl rotate-3">
                 {GUIDE_CATEGORIES.find(c => c.type === refiningPolicy?.type)?.icon && React.createElement(GUIDE_CATEGORIES.find(c => c.type === refiningPolicy?.type)!.icon, { className: "w-8 h-8" })}
              </div>
              <div>
                 <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{refiningPolicy?.name || name}</h3>
                 <p className="text-[10px] font-black uppercase text-primary-600 tracking-widest">{refiningPolicy?.provider || provider}</p>
              </div>
           </div>

           {refiningPolicy?.isSearchingPDF ? (
             <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                <div className="relative">
                  <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center text-primary-600">
                    <Search className="w-10 h-10 animate-bounce" />
                  </div>
                  <div className="absolute inset-0 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin" />
                </div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">L'IA parcourt le catalogue de {refiningPolicy.provider}...</p>
             </div>
           ) : (
             <div className="space-y-8 animate-slideUp">
                {/* Formules Pill Selector */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Zap className="w-3 h-3 text-amber-500" /> Quelle est votre formule ?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {refiningPolicy?.suggestedFormulas?.map(f => (
                      <button 
                        key={f} 
                        onClick={() => setRefiningPolicy({...refiningPolicy, coverageDetail: f})}
                        className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                          refiningPolicy.coverageDetail === f 
                          ? 'bg-primary-600 text-white border-primary-600 shadow-xl scale-105' 
                          : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                    <button 
                       onClick={() => {
                         const f = prompt("Entrez votre formule :");
                         if (f) setRefiningPolicy({...refiningPolicy, coverageDetail: f});
                       }}
                       className="px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary-400 hover:text-primary-600"
                    >
                      Autre +
                    </button>
                  </div>
                </div>

                {/* Options Checklist */}
                {refiningPolicy?.suggestedOptions && refiningPolicy.suggestedOptions.length > 0 && (
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                      <Check className="w-3 h-3 text-emerald-500" /> Options souscrites ?
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {refiningPolicy.suggestedOptions.map(opt => {
                        const isSelected = refiningPolicy.options?.includes(opt);
                        return (
                          <button 
                            key={opt}
                            onClick={() => {
                              const cur = refiningPolicy.options || [];
                              setRefiningPolicy({...refiningPolicy, options: isSelected ? cur.filter(o => o !== opt) : [...cur, opt]});
                            }}
                            className={`flex items-center justify-between p-4 rounded-[1.5rem] border-2 transition-all ${
                              isSelected ? 'bg-emerald-50 border-emerald-500 shadow-md' : 'bg-white border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <span className={`text-[11px] font-bold ${isSelected ? 'text-emerald-900' : 'text-slate-600'}`}>{opt}</span>
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-50 border-slate-200'}`}>
                              {isSelected && <Check className="w-4 h-4" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resume IA Card */}
                {refiningPolicy?.summary && (
                  <div className="p-5 bg-primary-50 rounded-[2rem] border border-primary-100 flex gap-4">
                     <Info className="w-5 h-5 text-primary-600 flex-shrink-0" />
                     <p className="text-[10px] text-primary-800 font-medium leading-relaxed italic line-clamp-5">
                       "{refiningPolicy.summary}"
                     </p>
                  </div>
                )}

                <div className="pt-6">
                   <button 
                    onClick={finalizeSave}
                    className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:bg-primary-600 transition-all active:scale-95 flex items-center justify-center gap-3"
                   >
                     Ajouter au Portefeuille <ArrowRight className="w-5 h-5" />
                   </button>
                </div>
             </div>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between px-2">
        <button onClick={resetForm} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black text-[10px] uppercase tracking-widest transition-colors">
          <ChevronLeft className="w-5 h-5" /> Retour
        </button>
        <div className="flex items-center gap-2">
           {GUIDE_CATEGORIES.find(c => c.type === type)?.icon && React.createElement(GUIDE_CATEGORIES.find(c => c.type === type)!.icon, { className: "w-4 h-4 text-primary-600" })}
           <span className="text-[10px] font-black uppercase text-primary-600">{type}</span>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-2xl w-fit mx-auto mb-4">
          <button onClick={() => setMode('smart')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'smart' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-400'}`}>Scan IA</button>
          <button onClick={() => setMode('web')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'web' ? 'bg-white shadow-sm text-primary-700' : 'text-slate-400'}`}>Saisie</button>
        </div>

        {mode === 'smart' ? (
          <div className="space-y-4">
             {/* Zone de conversation */}
             <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 min-h-[300px] max-h-[400px] overflow-y-auto space-y-3">
               {chatMessages.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full text-center py-8">
                   <Sparkles className="w-10 h-10 text-primary-300 mb-3" />
                   <p className="text-xs text-slate-400 font-medium max-w-xs">
                     L'assistant IA va vous poser quelques questions pour identifier votre contrat rapidement.
                   </p>
                 </div>
               )}
               
               {chatMessages.map((msg, idx) => (
                 <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-slate-200'}`}>
                     {msg.text}
                   </div>
                 </div>
               ))}
               
               {isWaitingResponse && (
                 <div className="flex justify-start">
                   <div className="bg-white rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 border border-slate-200">
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                     <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                   </div>
                 </div>
               )}
               <div ref={messagesEndRef} />
             </div>
             
             {/* Zone de saisie */}
             <div className="relative flex gap-2">
                <input 
                  type="text"
                  className="flex-1 px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl outline-none text-sm font-medium placeholder:text-slate-300 focus:border-primary-400 transition-colors"
                  placeholder="Répondez à l'assistant..."
                  value={smartText}
                  onChange={e => setSmartText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSmartExtraction(smartText))}
                  disabled={isWaitingResponse}
                />
                <button 
                  onClick={() => handleSmartExtraction(smartText)}
                  disabled={!smartText.trim() || isWaitingResponse}
                  className="px-6 py-4 bg-primary-600 text-white rounded-2xl hover:bg-primary-700 disabled:opacity-50 transition-all shadow-sm active:scale-95 flex items-center gap-2"
                >
                  {isWaitingResponse ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                </button>
             </div>
             
             <div className="text-[10px] text-center text-slate-400 font-medium">
               💡 Répondez naturellement aux questions de l'assistant
             </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Assureurs Populaires</label>
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide px-1">
                {MAJOR_INSURERS.map((ins) => (
                  <button
                    key={ins.name}
                    onClick={() => setProvider(ins.name)}
                    className={`flex-shrink-0 flex items-center gap-3 px-5 py-3 rounded-2xl border-2 transition-all ${
                      provider === ins.name 
                      ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-100' 
                      : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-8 h-8 ${ins.color} rounded-xl flex items-center justify-center text-[10px] font-black text-${ins.text} shadow-sm`}>
                      {ins.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-xs font-black text-slate-700 whitespace-nowrap">{ins.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Assureur</label>
                <input type="text" placeholder="AXA, Maif, Allianz..." className="w-full rounded-2xl border-slate-100 border-2 px-6 py-4 text-xs font-bold focus:border-primary-500 outline-none transition-colors" value={provider} onChange={e => setProvider(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nom du Contrat</label>
                <input type="text" placeholder="N° police ou nom commercial..." className="w-full rounded-2xl border-slate-100 border-2 px-6 py-4 text-xs font-bold focus:border-primary-500 outline-none transition-colors" value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>

            <button 
              onClick={handleManualNext}
              disabled={!provider || !name}
              className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              Suivant <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
