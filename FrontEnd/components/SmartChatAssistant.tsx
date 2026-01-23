import React, { useState, useRef, useEffect } from 'react';
import { Policy, User } from '../types';
import { Home, Car, Heart, Briefcase, Shield, Send, Sparkles, Package, Check, X, Zap, MessageSquare } from 'lucide-react';
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
  { id: 'auto', name: 'Auto', icon: Car, color: 'from-red-500 to-orange-500', emoji: '🚗' },
  { id: 'habitation', name: 'Habitation', icon: Home, color: 'from-blue-500 to-cyan-500', emoji: '🏠' },
  { id: 'sante', name: 'Santé', icon: Heart, color: 'from-pink-500 to-rose-500', emoji: '❤️' },
  { id: 'pro', name: 'Professionnelle', icon: Briefcase, color: 'from-purple-500 to-indigo-500', emoji: '💼' },
  { id: 'autre', name: 'Autre', icon: Shield, color: 'from-slate-500 to-slate-600', emoji: '🛡️' },
];

const INSURERS = [
  { id: 'maif', name: 'MAIF', logo: '🟢', color: 'bg-green-600' },
  { id: 'axa', name: 'AXA', logo: '🔵', color: 'bg-blue-700' },
  { id: 'allianz', name: 'Allianz', logo: '🔷', color: 'bg-blue-600' },
  { id: 'macif', name: 'MACIF', logo: '🔴', color: 'bg-red-600' },
  { id: 'groupama', name: 'Groupama', logo: '🟠', color: 'bg-orange-600' },
  { id: 'generali', name: 'Generali', logo: '🦁', color: 'bg-red-700' },
  { id: 'mma', name: 'MMA', logo: '⚫', color: 'bg-slate-700' },
  { id: 'matmut', name: 'Matmut', logo: '🟡', color: 'bg-yellow-600' },
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
    addMessage(`${insurerLogo} ${insurerName}`, 'user');
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
    
    const formulas = await getAIFormulasAndOptions(selectedInsurer, selectedType);
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
      addMessage(
        `✅ Parfait ! Récapitulatif :\n\n${selectedInsurerLogo} ${selectedInsurer}\n📋 ${contractCount} contrat(s) ${selectedType}\n📦 Formule: ${formula.name}\n🎯 Options: ${formula.options.join(', ')}\n\nVoulez-vous confirmer ?`,
        'bot',
        { showConfirm: true }
      );
    }, 500);
  };

  const handleConfirm = () => {
    addMessage('✅ Oui, confirmer !', 'user');
    addMessage('⏳ Création des contrats en cours...', 'bot');
    
    setTimeout(() => {
      pendingContracts.forEach(contract => {
        const newPolicy: Omit<Policy, 'userId'> = {
          id: uuid(),
          name: contract.name,
          provider: contract.insurer,
          type: contract.type,
          coverageDetail: `${contract.insurerLogo} ${contract.insurer}\n\n📦 Formule: ${contract.formula}\n\n🎯 Options incluses:\n${contract.options.map(opt => `• ${opt}`).join('\n')}`,
          options: contract.options,
          summary: `${contract.type} - ${contract.formula}`,
          sourceUrl: null,
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
    <div className="bg-white rounded-3xl shadow-2xl h-[750px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 via-cyan-600 to-primary-700 p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">Assistant Intelligent</h2>
            <p className="text-sm text-white/80 font-medium">Ajout rapide & en masse avec IA</p>
          </div>
        </div>
        <button onClick={onCancel} className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${message.sender === 'user' ? 'bg-primary-600 text-white' : 'bg-white text-slate-900'} rounded-2xl p-4 shadow-sm`}>
              <p className="text-sm font-medium whitespace-pre-line">{message.text}</p>
              
              {/* Types d'assurance */}
              {!selectedType && message.sender === 'bot' && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleTypeSelect(type.emoji, type.name)}
                      className="bg-gradient-to-br text-white from-primary-500 to-cyan-500 p-4 rounded-xl hover:scale-105 transition-all text-left font-black shadow-lg"
                    >
                      <span className="text-3xl block mb-2">{type.emoji}</span>
                      <span className="text-sm">{type.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Logos assureurs */}
              {message.showInsurerLogos && (
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {INSURERS.map((insurer) => (
                    <button
                      key={insurer.id}
                      onClick={() => handleInsurerSelect(insurer.name, insurer.logo)}
                      className={`${insurer.color} text-white p-3 rounded-xl hover:scale-110 transition-all flex flex-col items-center gap-1 font-black text-xs`}
                    >
                      <span className="text-2xl">{insurer.logo}</span>
                      {insurer.name}
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tapez votre message..."
            className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary-500 outline-none font-medium"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all font-black"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
