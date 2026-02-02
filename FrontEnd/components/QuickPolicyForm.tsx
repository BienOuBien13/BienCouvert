import React, { useState, useEffect, useRef } from 'react';
import { Policy, User } from '../types';
import { 
  Home, Car, Heart, Briefcase, Shield, Umbrella, Baby, Plane,
  Send, Sparkles, Check, Loader2, FileText, Upload, ExternalLink
} from 'lucide-react';
import { uuid } from '../utils/uuid';
import { useMasterData } from '../hooks/useMasterData';

interface Props {
  user: User;
  onAddPolicy: (policy: Omit<Policy, 'userId'>) => void;
  onCancel: () => void;
}

interface InsuranceType {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
}

interface Insurer {
  id: string;
  name: string;
  logo: string;
  color: string;
}

interface AIMessage {
  role: 'assistant' | 'user';
  content: string;
  suggestions?: string[];
  options?: Array<{ label: string; value: string }>;
}

// Mapping des icônes
const TYPE_ICONS: Record<string, React.ElementType> = {
  AUTO: Car,
  HABITATION: Home,
  SANTE: Heart,
  VIE: Shield,
  PREVOYANCE: Umbrella,
  PRO: Briefcase,
  VOYAGE: Plane,
};

const TYPE_COLORS: Record<string, string> = {
  AUTO: 'bg-red-500',
  HABITATION: 'bg-blue-500',
  SANTE: 'bg-pink-500',
  VIE: 'bg-purple-500',
  PREVOYANCE: 'bg-indigo-500',
  PRO: 'bg-orange-500',
  VOYAGE: 'bg-cyan-500',
};

export const QuickPolicyForm: React.FC<Props> = ({ user, onAddPolicy, onCancel }) => {
  const { types: masterTypes, insurers: masterInsurers, loading: masterDataLoading } = useMasterData();
  
  // Conversion des master data
  const INSURANCE_TYPES: InsuranceType[] = masterTypes.map(type => ({
    id: type.code.toLowerCase(),
    name: type.labelFr,
    icon: TYPE_ICONS[type.code] || Shield,
    color: TYPE_COLORS[type.code] || 'bg-slate-500',
  }));
  
  const INSURERS: Insurer[] = masterInsurers.map(insurer => ({
    id: insurer.code.toLowerCase(),
    name: insurer.label,
    logo: insurer.logoUrl || '🛡️',
    color: `border-${insurer.color || 'slate'}-600`,
  }));
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedInsurer, setSelectedInsurer] = useState<string>('');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [policyData, setPolicyData] = useState<any>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedType && selectedInsurer) {
      initializeChat();
    }
  }, [selectedType, selectedInsurer]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initializeChat = () => {
    const insurerName = INSURERS.find(i => i.id === selectedInsurer)?.name;
    const typeName = INSURANCE_TYPES.find(t => t.id === selectedType)?.name;

    setMessages([{
      role: 'assistant',
      content: `Parfait ! Vous souhaitez ajouter un contrat **${typeName}** chez **${insurerName}**. Je vais vous aider à compléter rapidement les informations.`,
      suggestions: [
        'J\'ai déjà un contrat',
        'Je veux comparer les offres',
        'Upload mon contrat PDF'
      ]
    }]);

    // Simuler la récupération des produits disponibles
    setTimeout(() => {
      const products = getAvailableProducts(selectedInsurer, selectedType);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Voici les formules disponibles chez ${insurerName} pour l'assurance ${typeName} :`,
        options: products
      }]);
    }, 800);
  };

  const getAvailableProducts = (insurer: string, type: string): Array<{ label: string; value: string }> => {
    // Simulation - à remplacer par un appel API à /policies/central-cg
    const products: Record<string, Record<string, string[]>> = {
      'allianz': {
        'habitation': ['Essentielle', 'Confort', 'Premium'],
        'auto': ['Tiers', 'Tiers Plus', 'Tous Risques'],
        'sante': ['Base', 'Equilibre', 'Sérénité'],
      },
      'axa': {
        'habitation': ['Protect', 'Confort', 'Premium'],
        'auto': ['Au Tiers', 'Intermédiaire', 'Tous Risques'],
        'sante': ['Santé Essentielle', 'Santé Confort', 'Santé Premium'],
      },
      'maif': {
        'habitation': ['Rythme', 'Rythme+', 'Rythme Premium'],
        'auto': ['Protection Juridique', 'Tous Risques'],
        'sante': ['Santé Active', 'Santé Famille'],
      }
    };

    const insurerProducts = products[insurer]?.[type] || ['Formule Standard', 'Formule Confort', 'Formule Premium'];
    return insurerProducts.map(p => ({ label: p, value: p.toLowerCase().replace(/\s+/g, '-') }));
  };

  const handleSuggestionClick = (suggestion: string) => {
    setUserInput(suggestion);
    handleSendMessage(suggestion);
  };

  const handleOptionSelect = (value: string, label: string) => {
    setPolicyData({ ...policyData, productName: label });
    setMessages(prev => [...prev, 
      { role: 'user', content: `J'ai sélectionné : ${label}` },
      { 
        role: 'assistant', 
        content: `Excellent choix ! Formule **${label}** sélectionnée. Maintenant, avez-vous le numéro de contrat ?`,
        suggestions: ['J\'ai mon numéro', 'Je ne l\'ai pas encore', 'Upload le PDF']
      }
    ]);
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = text || userInput;
    if (!messageText.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: messageText }]);
    setUserInput('');
    setIsLoading(true);

    // Simuler une réponse IA
    setTimeout(() => {
      const response = generateAIResponse(messageText, policyData);
      setMessages(prev => [...prev, response]);
      setIsLoading(false);
    }, 1000);
  };

  const generateAIResponse = (userMessage: string, currentData: any): AIMessage => {
    const lower = userMessage.toLowerCase();

    // Détection de numéro de contrat
    if (/\d{5,}/.test(userMessage)) {
      const contractNumber = userMessage.match(/\d{5,}/)?.[0];
      setPolicyData({ ...currentData, policyNumber: contractNumber });
      return {
        role: 'assistant',
        content: `Numéro de contrat **${contractNumber}** enregistré ! Quelle est votre prime annuelle ?`,
        suggestions: ['150€/an', '300€/an', '500€/an', 'Je ne sais pas']
      };
    }

    // Détection de montant
    if (/\d+\s*€/.test(userMessage) || /\d+\s*eur/.test(lower)) {
      const amount = userMessage.match(/\d+/)?.[0];
      setPolicyData({ ...currentData, premium: parseFloat(amount || '0') });
      return {
        role: 'assistant',
        content: `Prime de **${amount}€/an** notée. Et le montant de couverture ?`,
        suggestions: ['50 000€', '100 000€', '200 000€', 'Finaliser']
      };
    }

    // Détection de finalisation
    if (lower.includes('finaliser') || lower.includes('terminer') || lower.includes('créer')) {
      return {
        role: 'assistant',
        content: `✅ Parfait ! Votre contrat est prêt à être créé. Souhaitez-vous ajouter des détails supplémentaires ?`,
        suggestions: ['Créer le contrat', 'Ajouter des options', 'Upload un document']
      };
    }

    // Réponse générique
    return {
      role: 'assistant',
      content: `J'ai bien noté. Continuez à me donner les informations (numéro de contrat, montant, options...).`,
      suggestions: ['Continuer', 'Voir le récapitulatif', 'Finaliser']
    };
  };

  const handleCreatePolicy = () => {
    const insurerName = INSURERS.find(i => i.id === selectedInsurer)?.name || selectedInsurer;
    const typeName = INSURANCE_TYPES.find(t => t.id === selectedType)?.name || selectedType;

    const newPolicy: Omit<Policy, 'userId'> = {
      id: uuid(),
      name: policyData.productName || `${typeName} ${insurerName}`,
      provider: insurerName,
      type: typeName,
      coverageDetail: policyData.coverageDetail || '',
      options: policyData.options || [],
      summary: `Contrat ${typeName} créé via QuickAdd`,
      sourceUrl: null,
      isInternalSource: true,
      addedAt: Date.now(),
      fileData: null,
      fileName: null,
      mimeType: 'text/plain'
    };

    onAddPolicy(newPolicy);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4 pb-24">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-slate-900">⚡ Ajout Rapide</h1>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold"
          >
            Annuler
          </button>
        </div>
      </div>

      {/* Type Selection */}
      {!selectedType && (
        <div className="max-w-4xl mx-auto animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-lg p-8">
            <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary-500" />
              Quel type d'assurance ?
            </h2>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
              {INSURANCE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all hover:scale-105"
                  >
                    <div className={`w-12 h-12 ${type.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 text-center">{type.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Insurer Selection */}
      {selectedType && !selectedInsurer && (
        <div className="max-w-4xl mx-auto animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary-500" />
                Quel assureur ?
              </h2>
              <button
                onClick={() => setSelectedType('')}
                className="text-sm text-slate-500 hover:text-slate-700 font-bold"
              >
                ← Changer le type
              </button>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
              {INSURERS.map((insurer) => (
                <button
                  key={insurer.id}
                  onClick={() => setSelectedInsurer(insurer.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 ${insurer.color} bg-white hover:bg-slate-50 transition-all hover:scale-105`}
                >
                  <div className="text-3xl">{insurer.logo}</div>
                  <span className="text-xs font-bold text-slate-700 text-center">{insurer.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Interface */}
      {selectedType && selectedInsurer && (
        <div className="max-w-4xl mx-auto animate-fadeIn">
          {/* Selected Type & Insurer Pills */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm">
              {(() => {
                const Icon = INSURANCE_TYPES.find(t => t.id === selectedType)?.icon || Shield;
                return <Icon className="w-4 h-4 text-primary-500" />;
              })()}
              <span className="text-sm font-bold text-slate-700">
                {INSURANCE_TYPES.find(t => t.id === selectedType)?.name}
              </span>
              <button
                onClick={() => { setSelectedType(''); setSelectedInsurer(''); setMessages([]); }}
                className="ml-2 text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm">
              <span className="text-lg">{INSURERS.find(i => i.id === selectedInsurer)?.logo}</span>
              <span className="text-sm font-bold text-slate-700">
                {INSURERS.find(i => i.id === selectedInsurer)?.name}
              </span>
              <button
                onClick={() => { setSelectedInsurer(''); setMessages([]); }}
                className="ml-2 text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
            <div className="h-[500px] overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${
                    msg.role === 'user' 
                      ? 'bg-primary-500 text-white rounded-3xl rounded-br-md' 
                      : 'bg-slate-100 text-slate-900 rounded-3xl rounded-bl-md'
                  } px-6 py-4 shadow-sm`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" 
                       dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    
                    {/* Suggestions */}
                    {msg.suggestions && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {msg.suggestions.map((sug, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestionClick(sug)}
                            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold transition-all"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Options (produits) */}
                    {msg.options && (
                      <div className="mt-4 space-y-2">
                        {msg.options.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => handleOptionSelect(opt.value, opt.label)}
                            className="w-full px-4 py-3 bg-white hover:bg-primary-50 rounded-2xl text-sm font-bold text-left transition-all border-2 border-transparent hover:border-primary-500 flex items-center justify-between"
                          >
                            <span>{opt.label}</span>
                            <Check className="w-4 h-4 text-primary-500 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-3xl rounded-bl-md px-6 py-4">
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Tapez votre message... (ex: numéro de contrat, montant, options)"
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!userInput.trim()}
                  className="px-6 py-3 bg-primary-500 text-white rounded-2xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mt-3 flex gap-2">
                <button className="px-4 py-2 bg-white rounded-xl text-sm font-bold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload PDF
                </button>
                <button 
                  onClick={handleCreatePolicy}
                  className="px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-all flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Créer le contrat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
