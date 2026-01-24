import React, { useState, useRef, useEffect } from 'react';
import { Policy, User } from '../types';
import { Home, Car, Heart, Briefcase, Shield, Send, Sparkles, Package, Check, X, Zap, MessageSquare, Edit3, FileText, CreditCard, Smartphone, Scale } from 'lucide-react';
import { uuid } from '../utils/uuid';

// Simple AI API call helper
const getAIResponse = async (prompt: string): Promise<string> => {
  try {
    const API_URL = (import.meta as any).env?.VITE_API_URL ?? '';
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  showQuantity?: boolean;
  showFormulas?: boolean;
  showConfirm?: boolean;
  formulas?: Array<{ name: string; options: string[] }>;
}

interface PendingContract {
  type: string;
  insurer: string;
  insurerLogo: string;
  name: string;
  formula: string;
  options: string[];
}

const TYPES = [
  { id: 'auto', name: 'Auto', icon: Car, color: 'from-red-500 to-orange-500' },
  { id: 'habitation', name: 'Habitation', icon: Home, color: 'from-blue-500 to-cyan-500' },
  { id: 'sante', name: 'Santé', icon: Heart, color: 'from-pink-500 to-rose-500' },
  { id: 'prevoyance', name: 'Prévoyance', icon: Shield, color: 'from-green-500 to-emerald-500' },
  { id: 'pro', name: 'Professionnelle', icon: Briefcase, color: 'from-purple-500 to-indigo-500' },
  { id: 'emprunteur', name: 'Emprunteur/Crédit', icon: CreditCard, color: 'from-amber-500 to-yellow-500' },
  { id: 'bancaire', name: 'Carte Bancaire', icon: CreditCard, color: 'from-indigo-500 to-purple-500' },
  { id: 'appareils', name: 'Appareils Électroniques', icon: Smartphone, color: 'from-slate-500 to-slate-600' },
  { id: 'juridique', name: 'Juridique', icon: Scale, color: 'from-slate-600 to-slate-700' },
  { id: 'voyage', name: 'Voyage', icon: Package, color: 'from-cyan-500 to-blue-500' },
  { id: 'animaux', name: 'Animaux', icon: Heart, color: 'from-orange-500 to-red-500' },
  { id: 'autre', name: 'Autre', icon: Shield, color: 'from-slate-500 to-slate-600' },
];

const INSURERS = [
  { 
    id: 'maif', 
    name: 'MAIF', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Logo_MAIF.svg/200px-Logo_MAIF.svg.png',
    color: 'bg-green-600' 
  },
  { 
    id: 'axa', 
    name: 'AXA', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/AXA_Logo.svg/200px-AXA_Logo.svg.png',
    color: 'bg-blue-700' 
  },
  { 
    id: 'allianz', 
    name: 'Allianz', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Allianz_logo.svg/200px-Allianz_logo.svg.png',
    color: 'bg-blue-600' 
  },
  { 
    id: 'macif', 
    name: 'MACIF', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Logo_Macif.svg/200px-Logo_Macif.svg.png',
    color: 'bg-red-600' 
  },
  { 
    id: 'groupama', 
    name: 'Groupama', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Logo_Groupama.svg/200px-Logo_Groupama.svg.png',
    color: 'bg-orange-600' 
  },
  { 
    id: 'generali', 
    name: 'Generali', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Generali_logo.svg/200px-Generali_logo.svg.png',
    color: 'bg-red-700' 
  },
  { 
    id: 'mma', 
    name: 'MMA', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/MMA_Logo.svg/200px-MMA_Logo.svg.png',
    color: 'bg-slate-700' 
  },
  { 
    id: 'matmut', 
    name: 'Matmut', 
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Logo_Matmut.svg/200px-Logo_Matmut.svg.png',
    color: 'bg-yellow-600' 
  },
];

export const SmartChatAssistant: React.FC<Props> = ({ user, onAddPolicy, onCancel }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: '👋 Bonjour ! Je suis votre assistant intelligent.\n\n💡 Je peux vous aider à ajouter plusieurs contrats d\'assurance en une fois !\n\n📋 Quel type d\'assurance voulez-vous ajouter ?',
      sender: 'bot',
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedInsurer, setSelectedInsurer] = useState('');
  const [selectedInsurerLogo, setSelectedInsurerLogo] = useState('');
  const [contractCount, setContractCount] = useState(1);
  const [pendingContracts, setPendingContracts] = useState<PendingContract[]>([]);
  const [contractNames, setContractNames] = useState<string[]>([]);
  const [showNameInput, setShowNameInput] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualData, setManualData] = useState({
    type: 'auto',
    insurer: '',
    name: '',
    formula: '',
    options: '',
    pdfUrl: '',
    pdfFile: null as File | null
  });
  const [availableFormulas, setAvailableFormulas] = useState<string[]>([]);
  const [availableOptions, setAvailableOptions] = useState<string[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [currentFormulas, setCurrentFormulas] = useState<Array<{ name: string; options: string[] }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (text: string, sender: 'user' | 'bot', options?: any) => {
    const newMessage: Message = {
      id: uuid(),
      text,
      sender,
      timestamp: Date.now(),
      ...options
    };
    setMessages(prev => [...prev, newMessage]);
  };

  // Récupérer formules depuis central_cg
  const getFormulasFromCentralCg = async (insurerName: string, policyType: string) => {
    try {
      const response = await fetch(`/api/policies/central-cg?insurer=${encodeURIComponent(insurerName)}&type=${encodeURIComponent(policyType)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Extraire les formules uniques avec leurs options
          const formulasMap = new Map<string, string[]>();
          data.forEach((doc: any) => {
            if (doc.indexedFormulas && Array.isArray(doc.indexedFormulas)) {
              doc.indexedFormulas.forEach((formula: string) => {
                if (!formulasMap.has(formula)) {
                  formulasMap.set(formula, doc.indexedOptions || []);
                }
              });
            }
          });
          
          if (formulasMap.size > 0) {
            return Array.from(formulasMap.entries()).map(([name, options]) => ({
              name,
              options
            }));
          }
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
      const prompt = `Pour une assurance ${policyType} chez ${insurerName}, génère 3-4 formules réalistes avec leurs options associées.
      
Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de \`\`\`json):
{
  "formulas": [
    {"name": "Formule 1", "options": ["option1", "option2"]},
    {"name": "Formule 2", "options": ["option1", "option2", "option3"]}
  ]
}

Exemples pour Auto:
- Tiers avec: Responsabilité civile, Assistance 0km
- Tous Risques avec: Bris de glace, Vol, Incendie, Protection juridique, Prêt de véhicule

Exemples pour Habitation:
- Essentielle avec: Incendie, Dégâts des eaux, Vol
- Confort avec: Incendie, Dégâts des eaux, Vol, Bris de glace, Responsabilité civile`;
      
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
    
    // Fallback si l'IA échoue
    if (policyType === 'Auto') {
      return [
        { name: 'Tiers', options: ['Responsabilité civile', 'Assistance 0km'] },
        { name: 'Tiers +', options: ['Responsabilité civile', 'Assistance 0km', 'Bris de glace', 'Vol incendie'] },
        { name: 'Tous Risques', options: ['Tous dommages', 'Assistance 0km', 'Bris de glace', 'Vol', 'Protection juridique', 'Prêt de véhicule'] },
      ];
    } else if (policyType === 'Habitation') {
      return [
        { name: 'Essentielle', options: ['Incendie', 'Dégâts des eaux', 'Vol'] },
        { name: 'Confort', options: ['Incendie', 'Dégâts des eaux', 'Vol', 'Bris de glace', 'RC'] },
        { name: 'Premium', options: ['Multirisque habitation', 'Catastrophes naturelles', 'Assistance', 'Objets de valeur'] },
      ];
    }
    return [
      { name: 'Formule de base', options: ['Garantie essentielle'] },
      { name: 'Formule intermédiaire', options: ['Garanties étendues'] },
      { name: 'Formule premium', options: ['Garanties complètes', 'Services premium'] },
    ];
  };

  const handleTypeSelect = (typeEmoji: string, typeName: string) => {
    addMessage(`${typeEmoji} ${typeName}`, 'user');
    setSelectedType(typeName);
    setTimeout(() => {
      addMessage(`Parfait ! Chez quel assureur ? Cliquez sur un logo :`, 'bot', { showInsurerLogos: true });
    }, 500);
  };

  const handleInsurerSelect = async (insurerName: string, insurerLogo: string) => {
    addMessage(`${insurerName}`, 'user');
    setSelectedInsurer(insurerName);
    setSelectedInsurerLogo(insurerLogo);
    
    setTimeout(() => {
      addMessage(`Combien de contrats ${selectedType} voulez-vous ajouter chez ${insurerName} ?`, 'bot', { showQuantity: true });
    }, 500);
  };

  const handleQuantitySelect = async (count: number) => {
    addMessage(`${count} contrat(s)`, 'user');
    setContractCount(count);
    
    addMessage(`⏳ Je récupère les formules disponibles chez ${selectedInsurer}...`, 'bot');
    
    // Essayer d'abord de récupérer depuis central_cg
    let formulas = await getFormulasFromCentralCg(selectedInsurer, selectedType);
    
    // Si pas de résultats dans central_cg, utiliser l'IA
    if (!formulas || formulas.length === 0) {
      addMessage(`💡 Pas de données dans la base, consultation de l'IA...`, 'bot');
      formulas = await getAIFormulasAndOptions(selectedInsurer, selectedType);
    } else {
      addMessage(`✅ Formules trouvées dans la base de connaissances !`, 'bot');
    }
    
    setCurrentFormulas(formulas);
    
    setTimeout(() => {
      addMessage(
        `✨ Voici les formules disponibles pour ${selectedType} chez ${selectedInsurer}.\n\n📦 Cliquez sur une formule pour créer ${count} contrat(s) :`,
        'bot',
        { showFormulas: true, formulas }
      );
    }, 500);
  };

  const handleFormulaSelect = (formula: { name: string; options: string[] }) => {
    addMessage(`📦 ${formula.name}`, 'user');
    
    // Créer les contrats en masse
    const contracts: PendingContract[] = Array.from({ length: contractCount }, (_, i) => ({
      type: selectedType,
      insurer: selectedInsurer,
      insurerLogo: selectedInsurerLogo,
      name: contractCount > 1 ? `${selectedType} ${selectedInsurer} #${i + 1}` : `${selectedType} ${selectedInsurer}`,
      formula: formula.name,
      options: formula.options
    }));
    
    setPendingContracts(contracts);
    
    setTimeout(() => {
      const logoDisplay = selectedInsurerLogo.startsWith('http') 
        ? `<img src="${selectedInsurerLogo}" alt="${selectedInsurer}" style="display:inline-block;width:20px;height:20px;vertical-align:middle;margin-right:4px;" />`
        : selectedInsurerLogo;
      addMessage(
        `✅ Parfait ! Récapitulatif :\n\n${selectedInsurer}\n📋 ${contractCount} contrat(s) ${selectedType}\n📦 Formule: ${formula.name}\n🎯 Options: ${formula.options.join(', ')}\n\nVoulez-vous confirmer ?`,
        'bot',
        { showConfirm: true }
      );
    }, 500);
  };

  const handleConfirm = () => {
    // Si pas encore de noms, demander
    if (contractNames.length === 0 && pendingContracts.length > 0) {
      setShowNameInput(true);
      addMessage('📝 Donnez un nom à chaque contrat (ou laissez vide pour utiliser le nom par défaut)', 'bot');
      return;
    }
    
    addMessage('✅ Oui, confirmer !', 'user');
    addMessage('⏳ Création des contrats en cours...', 'bot');
    
    setTimeout(() => {
      pendingContracts.forEach((contract, index) => {
        const logoUrl = contract.insurerLogo.startsWith('http') ? contract.insurerLogo : '';
        const contractName = contractNames[index]?.trim() || contract.name;
        const newPolicy: Omit<Policy, 'userId'> = {
          id: uuid(),
          name: contractName,
          provider: contract.insurer,
          type: contract.type,
          coverageDetail: `${contract.insurer}\n\n📦 Formule: ${contract.formula}\n\n🎯 Options incluses:\n${contract.options.map(opt => `• ${opt}`).join('\n')}`,
          options: contract.options,
          summary: `${contract.type} - ${contract.formula}`,
          sourceUrl: logoUrl || null,
          isInternalSource: true,
          addedAt: Date.now(),
          fileData: null,
          fileName: null,
          mimeType: 'text/plain'
        };
        onAddPolicy(newPolicy);
      });
      
      addMessage(
        `🎉 Succès ! ${pendingContracts.length} contrat(s) créé(s) !\n\nQue voulez-vous faire ?`,
        'bot',
        { showConfirm: true }
      );
      setPendingContracts([]);
      setContractNames([]);
      setShowNameInput(false);
    }, 1000);
  };

  const handleAddMore = () => {
    addMessage('➕ Ajouter d\'autres contrats', 'user');
    setSelectedType('');
    setSelectedInsurer('');
    setContractCount(1);
    setCurrentFormulas([]);
    setTimeout(() => {
      addMessage('📋 Quel type d\'assurance ?', 'bot');
    }, 500);
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
      <div className="bg-gradient-to-r from-primary-600 via-cyan-600 to-primary-700 p-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Assistant Intelligent</h2>
            <p className="text-sm text-white/90 font-medium">✨ Ajout rapide & en masse avec suggestions IA</p>
          </div>
        </div>
        <button onClick={onCancel} className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-slate-50 to-slate-100">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${message.sender === 'user' ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-lg shadow-primary-200' : 'bg-white text-slate-900 shadow-md'} rounded-2xl p-5`}>
              <p className="text-sm font-medium whitespace-pre-line leading-relaxed">{message.text}</p>
              
              {/* Types d'assurance */}
              {!selectedType && message.sender === 'bot' && (
                <>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          onClick={() => handleTypeSelect(type.name, type.name)}
                          className={`bg-gradient-to-br ${type.color} text-white p-3 rounded-xl hover:scale-105 transition-all text-center font-bold shadow-lg flex flex-col items-center gap-2`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs">{type.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setManualMode(true)}
                    className="mt-3 w-full bg-slate-700 text-white p-3 rounded-xl hover:bg-slate-800 transition-all text-center font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    Saisie manuelle complète
                  </button>
                </>
              )}

              {/* Logos assureurs */}
              {message.showInsurerLogos && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {INSURERS.map((insurer) => (
                    <button
                      key={insurer.id}
                      onClick={() => handleInsurerSelect(insurer.name, insurer.logo)}
                      className="bg-white border-2 border-slate-200 hover:border-primary-500 p-3 rounded-xl hover:scale-105 transition-all flex flex-col items-center gap-2 group"
                    >
                      <div className="w-16 h-16 flex items-center justify-center bg-white rounded-lg overflow-hidden">
                        <img 
                          src={insurer.logo} 
                          alt={insurer.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            // Fallback vers couleur de fond si l'image ne charge pas
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.className = `w-16 h-16 flex items-center justify-center ${insurer.color} rounded-lg`;
                            e.currentTarget.parentElement!.innerHTML = `<span class="text-white font-black text-xs">${insurer.name}</span>`;
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 group-hover:text-primary-600">{insurer.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quantité */}
              {message.showQuantity && (
                <div className="flex gap-2 mt-4">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleQuantitySelect(num)}
                      className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-primary-500 text-white rounded-xl hover:scale-110 transition-all font-black text-lg"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              )}

              {/* Formules avec options */}
              {message.showFormulas && message.formulas && (
                <div className="space-y-2 mt-4">
                  {message.formulas.map((formula, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleFormulaSelect(formula)}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-xl hover:shadow-xl transition-all text-left"
                    >
                      <div className="flex items-start gap-3">
                        <Package className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-black text-base mb-2">{formula.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {formula.options.map((opt, i) => (
                              <span key={i} className="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">
                                {opt}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Boutons de confirmation */}
              {message.showConfirm && (
                <div className="flex gap-2 mt-4">
                  {pendingContracts.length > 0 ? (
                    <>
                      <button
                        onClick={handleConfirm}
                        className="flex-1 bg-green-500 text-white py-3 rounded-xl font-black hover:bg-green-600 transition-colors"
                      >
                        ✅ Confirmer
                      </button>
                      <button
                        onClick={onCancel}
                        className="px-4 bg-red-500 text-white py-3 rounded-xl font-black hover:bg-red-600 transition-colors"
                      >
                        ❌
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleAddMore}
                        className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-black hover:bg-blue-600 transition-colors"
                      >
                        ➕ Ajouter d'autres
                      </button>
                      <button
                        onClick={onCancel}
                        className="flex-1 bg-slate-600 text-white py-3 rounded-xl font-black hover:bg-slate-700 transition-colors"
                      >
                        ✓ Terminer
                      </button>
                    </>
                  )}
                </div>
              )}

              {isLoadingAI && message.sender === 'bot' && messages[messages.length - 1].id === message.id && (
                <div className="mt-3 flex items-center gap-2 text-xs text-primary-600 font-bold">
                  <Sparkles className="w-4 h-4 animate-spin" />
                  L'IA analyse les offres...
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Saisie des noms de contrats */}
      {showNameInput && pendingContracts.length > 0 && (
        <div className="p-6 bg-gradient-to-br from-primary-50 to-cyan-50 border-t-2 border-primary-200 space-y-4">
          <h3 className="font-black text-lg text-primary-900 flex items-center gap-2">
            <Edit3 className="w-5 h-5" />
            Nommez vos contrats
          </h3>
          {pendingContracts.map((contract, index) => (
            <div key={index}>
              <label className="text-xs font-bold text-slate-600 mb-1 block">
                Contrat #{index + 1} - {contract.insurer} {contract.type}
              </label>
              <input
                type="text"
                value={contractNames[index] || ''}
                onChange={(e) => {
                  const newNames = [...contractNames];
                  newNames[index] = e.target.value;
                  setContractNames(newNames);
                }}
                placeholder={contract.name}
                className="w-full p-3 border-2 border-primary-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-primary-600 to-cyan-600 text-white p-4 rounded-2xl font-black hover:shadow-xl hover:scale-105 transition-all"
            >
              ✓ Valider et enregistrer
            </button>
            <button
              onClick={() => {
                setContractNames([]);
                setShowNameInput(false);
              }}
              className="px-6 bg-slate-300 text-slate-700 p-4 rounded-2xl font-black hover:bg-slate-400 transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Formulaire de saisie manuelle */}
      {manualMode && (
        <div className="p-6 bg-white border-t-2 border-primary-200 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              Saisie manuelle
            </h3>
            <button onClick={() => setManualMode(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Type d'assurance</label>
              <select 
                value={manualData.type}
                onChange={(e) => setManualData({...manualData, type: e.target.value})}
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              >
                {TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Assureur</label>
              <input
                type="text"
                value={manualData.insurer}
                onChange={(e) => setManualData({...manualData, insurer: e.target.value})}
                placeholder="MAIF, AXA..."
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
            </div>
            
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1 block">Nom du contrat</label>
              <input
                type="text"
                value={manualData.name}
                onChange={(e) => setManualData({...manualData, name: e.target.value})}
                placeholder="Auto Zen, Habitation Confort..."
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Formule</label>
              <input
                type="text"
                value={manualData.formula}
                onChange={(e) => setManualData({...manualData, formula: e.target.value})}
                placeholder="Tiers, Tous Risques..."
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Options (séparées par des virgules)</label>
              <input
                type="text"
                value={manualData.options}
                onChange={(e) => setManualData({...manualData, options: e.target.value})}
                placeholder="Assistance, Protection juridique..."
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
            </div>
            
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1 block">
                Document PDF (optionnel) - stocké en base64 dans PostgreSQL
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setManualData({...manualData, pdfFile: file});
                  }
                }}
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium text-sm"
              />
              {manualData.pdfFile && (
                <p className="text-xs text-green-600 mt-1 font-semibold">
                  ✓ {manualData.pdfFile.name} ({(manualData.pdfFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </div>
          
          <button
            onClick={async () => {
              if (manualData.insurer && manualData.name) {
                let fileData: string | null = null;
                let fileName: string | null = null;
                
                // Convertir le PDF en base64 si présent
                if (manualData.pdfFile) {
                  const reader = new FileReader();
                  fileData = await new Promise<string>((resolve) => {
                    reader.onload = () => {
                      const base64 = reader.result as string;
                      resolve(base64.split(',')[1]); // Enlever le préfixe data:application/pdf;base64,
                    };
                    reader.readAsDataURL(manualData.pdfFile!);
                  });
                  fileName = manualData.pdfFile.name;
                }
                
                const newPolicy: Omit<Policy, 'userId'> = {
                  id: uuid(),
                  name: manualData.name,
                  provider: manualData.insurer,
                  type: manualData.type,
                  coverageDetail: `${manualData.insurer}\n\n📦 Formule: ${manualData.formula}\n\n🎯 Options:\n${manualData.options.split(',').map(opt => `• ${opt.trim()}`).join('\n')}`,
                  options: manualData.options ? manualData.options.split(',').map(o => o.trim()) : [],
                  summary: `${manualData.type} - ${manualData.formula}`,
                  sourceUrl: null,
                  isInternalSource: true,
                  addedAt: Date.now(),
                  fileData, // base64 du PDF
                  fileName, // nom original du fichier
                  mimeType: fileData ? 'application/pdf' : 'text/plain'
                };
                onAddPolicy(newPolicy);
                setManualMode(false);
                setManualData({ type: 'auto', insurer: '', name: '', formula: '', options: '', pdfFile: null });
                addMessage('✅ Contrat ajouté avec succès !', 'bot');
              }
            }}
            disabled={!manualData.insurer || !manualData.name}
            className="w-full bg-gradient-to-r from-primary-600 to-cyan-600 text-white p-4 rounded-2xl font-black hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✓ Enregistrer le contrat
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-5 bg-white border-t-2 border-slate-100 flex-shrink-0">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tapez votre message ou posez une question..."
            className="flex-1 px-5 py-4 border-2 border-slate-200 rounded-2xl focus:border-primary-500 outline-none font-medium text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-8 py-4 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-2xl hover:shadow-xl transition-all font-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
