import React, { useState, useRef, useEffect } from 'react';
import { Policy, User } from '../types';
import { Home, Car, Heart, Briefcase, Shield, Send, Sparkles, Package, Check, X, MessageSquare, Edit3, Plus, CreditCard, Smartphone, Scale, Loader } from 'lucide-react';
import { uuid } from '../utils/uuid';
import { fetchCsrfToken } from '../services/authService';
import { storageService } from '../services/storageService';
import { useMasterData } from '../hooks/useMasterData';

// Simple AI API call helper
const getAIResponse = async (prompt: string): Promise<string> => {
  try {
    const API_URL = (import.meta as any).env?.VITE_API_URL ?? '';
    const csrfToken = await fetchCsrfToken();
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      },
      credentials: 'include',
      body: JSON.stringify({ message: prompt, policies: [], history: [] })
    });
    if (!response.ok) throw new Error('AI API error');
    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error('AI Error:', error);
    return '';
  }
};

interface Props {
  user: User;
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onCancel: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
  showInsurerLogos?: boolean;
  showOtherInsurerInput?: boolean;
  showFormulas?: boolean;
  showSummary?: boolean;
  formulas?: Array<{ name: string; options: string[] }>;
}

// Mapping des icônes pour les types d'assurance
const TYPE_ICONS: Record<string, React.ElementType> = {
  AUTO: Car,
  HABITATION: Home,
  SANTE: Heart,
  PREVOYANCE: Shield,
  PRO: Briefcase,
  EMPRUNTEUR: CreditCard,
  BANCAIRE: CreditCard,
  APPAREILS: Smartphone,
  JURIDIQUE: Scale,
  VOYAGE: Package,
  ANIMAUX: Heart,
  VIE: Shield,
  AUTRE: Shield,
};

// Mapping des couleurs pour les types
const TYPE_COLORS: Record<string, string> = {
  AUTO: 'from-red-500 to-orange-500',
  HABITATION: 'from-blue-500 to-cyan-500',
  SANTE: 'from-pink-500 to-rose-500',
  PREVOYANCE: 'from-green-500 to-emerald-500',
  PRO: 'from-purple-500 to-indigo-500',
  EMPRUNTEUR: 'from-amber-500 to-yellow-500',
  BANCAIRE: 'from-indigo-500 to-purple-500',
  APPAREILS: 'from-slate-500 to-slate-600',
  JURIDIQUE: 'from-slate-600 to-slate-700',
  VOYAGE: 'from-cyan-500 to-blue-500',
  ANIMAUX: 'from-orange-500 to-red-500',
  VIE: 'from-purple-600 to-blue-600',
  AUTRE: 'from-slate-500 to-slate-600',
};

export const SmartChatAssistant: React.FC<Props> = ({ user, onAddPolicy, onCancel }) => {
  const { types: masterTypes, insurers: masterInsurers, loading: masterDataLoading } = useMasterData();
  
  // Conversion des master data pour l'interface
  const TYPES = masterTypes.map(type => ({
    id: type.code.toLowerCase(),
    name: type.labelFr,
    icon: TYPE_ICONS[type.code] || Shield,
    color: TYPE_COLORS[type.code] || 'from-slate-500 to-slate-600',
  }));
  
  const INSURERS = masterInsurers.map(insurer => ({
    id: insurer.code.toLowerCase(),
    name: insurer.label,
    logo: insurer.logoUrl || '',
    color: insurer.color || 'bg-slate-500',
  }));
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: '👋 Bonjour ! Quel type d\'assurance voulez-vous ajouter ?', sender: 'bot', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [otherInsurerInput, setOtherInsurerInput] = useState('');
  const [contractNameInput, setContractNameInput] = useState('');
  
  const [selectedType, setSelectedType] = useState('');
  const [selectedInsurer, setSelectedInsurer] = useState('');
  const [selectedFormula, setSelectedFormula] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [currentFormulas, setCurrentFormulas] = useState<Array<{ name: string; options: string[] }>>([]);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessage = (text: string, sender: 'user' | 'bot', options?: any) => {
    setMessages(prev => [...prev, { id: uuid(), text, sender, timestamp: Date.now(), ...options }]);
  };

  // Récupérer formules depuis central_cg
  const getFormulasFromCentralCg = async (insurerName: string, policyType: string) => {
    try {
      const data = await storageService.getCentralCgRepo();
      
      // Normalisation du type pour la recherche
      const normalizedType = policyType.toLowerCase();
      const typeMapping: { [key: string]: string[] } = {
        'auto': ['auto', 'automobile'],
        'habitation': ['habitation', 'logement', 'maison'],
        'sante': ['santé', 'sante', 'mutuelle'],
        'prevoyance': ['prévoyance', 'prevoyance'],
        'pro': ['professionnelle', 'pro'],
        'emprunteur': ['emprunteur', 'credit', 'crédit'],
        'bancaire': ['bancaire', 'banque'],
        'appareils': ['appareils', 'electronique', 'électronique'],
        'juridique': ['juridique', 'protection juridique'],
        'voyage': ['voyage'],
        'animaux': ['animaux', 'animal'],
      };
      
      const acceptedTypes = typeMapping[normalizedType] || [normalizedType];
      
      const filtered = data.filter(doc => {
        const docInsurerMatch = doc.insurer?.toLowerCase() === insurerName.toLowerCase();
        const docType = (doc.type || doc.metadata?.type || '').toLowerCase();
        const docTypeMatch = acceptedTypes.some(type => docType.includes(type) || type.includes(docType));
        
        return docInsurerMatch && docTypeMatch;
      });
      
      console.log(`🔍 Recherche formules: "${insurerName}" / "${policyType}" -> ${filtered.length} doc(s) trouvé(s)`);
      
      if (filtered.length > 0) {
        const formulasMap = new Map<string, string[]>();
        filtered.forEach((doc: any) => {
          const formulas = doc.indexedFormulas || doc.metadata?.indexedFormulas || [];
          const options = doc.indexedOptions || doc.metadata?.indexedOptions || [];
          
          if (Array.isArray(formulas)) {
            formulas.forEach((formula: string) => {
              if (!formulasMap.has(formula)) {
                formulasMap.set(formula, options);
              }
            });
          }
        });
        
        if (formulasMap.size > 0) {
          const result = Array.from(formulasMap.entries()).map(([name, options]) => ({ name, options }));
          console.log(`✅ ${result.length} formule(s) extraite(s):`, result.map(f => f.name));
          return result;
        }
      }
    } catch (error) {
      console.error('Erreur récupération central_cg:', error);
    }
    return null;
  };

  const getAIFormulasAndOptions = async (insurerName: string, policyType: string) => {
    setIsLoadingAI(true);
    try {
      const prompt = `Pour une assurance ${policyType} chez ${insurerName}, génère 3-4 formules réalistes avec leurs options.
Réponds en JSON: {"formulas": [{"name": "Formule 1", "options": ["option1", "option2"]}]}`;
      
      const response = await getAIResponse(prompt);
      if (response) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          return data.formulas;
        }
      }
    } catch (error) {
      console.error('Erreur IA:', error);
    } finally {
      setIsLoadingAI(false);
    }
    return [];
  };

  const handleTypeSelect = (typeName: string) => {
    addMessage(`📋 ${typeName}`, 'user');
    setSelectedType(typeName);
    setTimeout(() => {
      addMessage(`Chez quel assureur ?`, 'bot', { showInsurerLogos: true });
    }, 300);
  };

  const handleInsurerSelect = async (insurerName: string) => {
    if (insurerName === 'Autre') {
      addMessage(`Autre assureur`, 'user');
      setShowOtherInput(true);
      setTimeout(() => {
        addMessage(`📝 Quel est le nom de votre assureur ?`, 'bot', { showOtherInsurerInput: true });
      }, 300);
      return;
    }
    
    addMessage(`${insurerName}`, 'user');
    setSelectedInsurer(insurerName);
    await proceedToFormulaSelection(insurerName);
  };

  const handleOtherInsurerSubmit = async () => {
    if (!otherInsurerInput.trim()) return;
    addMessage(`${otherInsurerInput}`, 'user');
    setSelectedInsurer(otherInsurerInput);
    setShowOtherInput(false);
    setOtherInsurerInput('');
    await proceedToFormulaSelection(otherInsurerInput);
  };

  const proceedToFormulaSelection = async (insurerName: string) => {
    addMessage(`⏳ Recherche des formules ${selectedType} chez ${insurerName}...`, 'bot');
    
    let formulas = await getFormulasFromCentralCg(insurerName, selectedType);
    
    if (!formulas || formulas.length === 0) {
      addMessage(`💡 Consultation de l'IA...`, 'bot');
      formulas = await getAIFormulasAndOptions(insurerName, selectedType);
    } else {
      addMessage(`✅ Trouvé dans la base !`, 'bot');
    }
    
    // Vérifier qu'on a bien des formules
    if (!formulas || formulas.length === 0) {
      addMessage(`❌ Aucune formule trouvée. Essayez avec un autre assureur ou contactez le support.`, 'bot');
      return;
    }
    
    setCurrentFormulas(formulas);
    
    setTimeout(() => {
      addMessage(`Choisissez une formule :`, 'bot', { showFormulas: true, formulas });
    }, 300);
  };

  const handleFormulaSelect = (formula: { name: string; options: string[] }) => {
    addMessage(`📦 ${formula.name}`, 'user');
    setSelectedFormula(formula.name);
    setSelectedOptions(formula.options);
    setShowSummary(true);
    
    setTimeout(() => {
      addMessage(
        `✅ Récapitulatif:\n\n🏢 ${selectedInsurer}\n📋 ${selectedType}\n📦 ${formula.name}\n🎯 Options: ${formula.options.join(', ')}\n\n📝 Donnez un nom à ce contrat :`,
        'bot',
        { showSummary: true }
      );
    }, 300);
  };

  const handleFinalSave = () => {
    if (!contractNameInput.trim()) {
      alert('Veuillez donner un nom au contrat');
      return;
    }
    
    const newPolicy: Omit<Policy, 'userId'> = {
      id: uuid(),
      name: contractNameInput,
      insurer: selectedInsurer,
      type: selectedType,
      coverage: selectedFormula,
      coverageDetail: `${selectedInsurer}\n\n📦 Formule: ${selectedFormula}\n\n🎯 Options:\n${selectedOptions.map(opt => `• ${opt}`).join('\n')}`,
      options: selectedOptions,
      summary: `${selectedType} - ${selectedFormula}`,
      sourceUrl: null,
      isInternalSource: true,
      addedAt: Date.now(),
      fileData: null,
      fileName: null,
      mimeType: 'text/plain',
      metadata: {
        formula: selectedFormula,
        options: selectedOptions,
        insurer: selectedInsurer,
        type: selectedType
      }
    };
    
    onAddPolicy(newPolicy);
    addMessage(`✅ Contrat "${contractNameInput}" enregistré !`, 'bot');
    
    // Reset pour permettre d'ajouter un autre contrat
    setTimeout(() => {
      addMessage(`Voulez-vous ajouter un autre contrat ?`, 'bot');
      setSelectedType('');
      setSelectedInsurer('');
      setSelectedFormula('');
      setSelectedOptions([]);
      setShowSummary(false);
      setContractNameInput('');
    }, 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    addMessage(input, 'user');
    setInput('');
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border-2 border-slate-100 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: '600px', maxHeight: '800px' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-cyan-600 p-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Assistant Intelligent</h2>
            <p className="text-xs text-white/90 font-medium">✨ Ajout rapide de contrat</p>
          </div>
        </div>
        <button onClick={onCancel} className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${message.sender === 'user' ? 'bg-primary-600 text-white' : 'bg-white text-slate-900'} rounded-2xl p-4 shadow-sm`}>
              <p className="text-sm font-medium whitespace-pre-line">{message.text}</p>
              
              {/* Types d'assurance - ICÔNES PLUS PETITES */}
              {!selectedType && message.sender === 'bot' && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => handleTypeSelect(type.name)}
                        className={`bg-gradient-to-br ${type.color} text-white p-2 rounded-lg hover:scale-105 transition-all text-center font-bold shadow flex flex-col items-center gap-1`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px]">{type.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Logos assureurs avec "Autre" */}
              {message.showInsurerLogos && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {INSURERS.map((insurer) => (
                    <button
                      key={insurer.id}
                      onClick={() => handleInsurerSelect(insurer.name)}
                      className={`${insurer.id === 'autre' ? insurer.color + ' text-white' : 'bg-white border-2 border-slate-200 hover:border-primary-500'} p-2 rounded-lg hover:scale-105 transition-all flex flex-col items-center gap-1`}
                    >
                      {insurer.logo ? (
                        <img src={insurer.logo} alt={insurer.name} className="w-12 h-12 object-contain" />
                      ) : (
                        <Plus className="w-8 h-8" />
                      )}
                      <span className="text-[10px] font-bold">{insurer.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Input pour "Autre" assureur */}
              {message.showOtherInsurerInput && showOtherInput && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={otherInsurerInput}
                    onChange={(e) => setOtherInsurerInput(e.target.value)}
                    placeholder="Nom de l'assureur..."
                    className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg outline-none focus:border-primary-500 text-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleOtherInsurerSubmit()}
                  />
                  <button
                    onClick={handleOtherInsurerSubmit}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg font-bold text-sm hover:bg-primary-700"
                  >
                    OK
                  </button>
                </div>
              )}

              {/* Formules SANS détails des options */}
              {message.showFormulas && message.formulas && message.formulas.length > 0 && (
                <div className="space-y-2 mt-3">
                  {message.formulas.map((formula, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleFormulaSelect(formula)}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white p-3 rounded-lg hover:shadow-lg transition-all text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-sm">{formula.name}</p>
                          <p className="text-xs opacity-80">{formula.options?.length || 0} options incluses</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Message si pas de formules */}
              {message.showFormulas && (!message.formulas || message.formulas.length === 0) && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">Aucune formule disponible pour le moment.</p>
                </div>
              )}

              {/* Récapitulatif avec input nom */}
              {message.showSummary && showSummary && (
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={contractNameInput}
                    onChange={(e) => setContractNameInput(e.target.value)}
                    placeholder="Ex: Ma voiture, Appartement Paris..."
                    className="w-full px-3 py-2 border-2 border-primary-300 rounded-lg outline-none focus:border-primary-500 text-sm font-medium"
                  />
                  <button
                    onClick={handleFinalSave}
                    disabled={!contractNameInput.trim()}
                    className="w-full bg-gradient-to-r from-primary-600 to-cyan-600 text-white p-3 rounded-lg font-black hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✓ Enregistrer dans mon portefeuille
                  </button>
                </div>
              )}

              {isLoadingAI && message.sender === 'bot' && messages[messages.length - 1].id === message.id && (
                <div className="mt-2 flex items-center gap-2 text-xs text-primary-600 font-bold">
                  <Sparkles className="w-3 h-3 animate-spin" />
                  L'IA analyse...
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t-2 border-slate-100 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tapez votre message..."
            className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all font-black disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
