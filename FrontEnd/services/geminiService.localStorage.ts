
// @google/genai SDK is used for all GenAI interactions.
import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob } from "@google/genai";
import { Policy, OptimizationFinding, Message, WebSearchResult, UserProfileData, PolicyType, CentralCgEntry } from "../types";

const getAiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('VITE_GEMINI_API_KEY non configurée. Les fonctions audio/live ne seront pas disponibles.');
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export interface SmartExtractionResult {
  policies: Array<Partial<Policy & { 
    isComplete: boolean; 
    suggestedFormulas?: string[]; 
    suggestedOptions?: string[];
    summary?: string;
  }>>;
  clarificationQuestions: string[] | null;
}

export const indexCgDocument = async (provider: string, type: string, pdfUrl: string): Promise<Partial<CentralCgEntry>> => {
  const ai = getAiClient();
  const prompt = `Analyse en profondeur le document PDF des Conditions Générales ${type} de chez ${provider} via l'URL : ${pdfUrl}.
  Extrais : 1. Les formules commerciales. 2. Les options complémentaires. 3. Un résumé sémantique.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            indexedFormulas: { type: Type.ARRAY, items: { type: Type.STRING } },
            indexedOptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            semanticSummary: { type: Type.STRING }
          },
          required: ["indexedFormulas", "indexedOptions", "semanticSummary"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Erreur" };
  }
};

export const parsePoliciesFromText = async (text: string): Promise<SmartExtractionResult> => {
  const ai = getAiClient();
  const prompt = `Extrais les contrats d'assurance du texte suivant : "${text}".
  
  CONSIGNES :
  1. NORMALISATION : Corrige impérativement les noms d'assureurs (ex: MAIFFE -> MAIF, AXAXA -> AXA, ALLIANCE -> Allianz, MACIFF -> MACIF).
  2. DÉTECTION : Identifie le type, le nom du contrat, l'assureur, la formule (Tiers, Tous Risques, etc.) et les options citées.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            policies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Nom commercial du contrat" },
                  provider: { type: Type.STRING, description: "Nom de l'assureur normalisé" },
                  type: { type: Type.STRING, enum: Object.values(PolicyType) },
                  coverageDetail: { type: Type.STRING, description: "Formule détectée" },
                  options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Options spécifiques citées" }
                },
                required: ["name", "provider", "type"]
              }
            }
          },
          required: ["policies"]
        }
      }
    });
    return JSON.parse(response.text || '{"policies": []}');
  } catch (error) {
    return { policies: [], clarificationQuestions: null };
  }
};

export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  const ai = getAiClient();
  const prompt = `Recherche les Conditions Générales officielles (PDF) pour l'assurance ${type} "${name}" chez l'assureur ${provider}. 
  Identifie précisément les noms des formules (ex: Tiers, Tous Risques, Initiale, Confort, Intégrale) et les options (ex: Assistance 0km, Prêt de véhicule).`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sourceUrl: { type: Type.STRING },
            detectedFormulas: { type: Type.ARRAY, items: { type: Type.STRING } },
            availableOptions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "sourceUrl", "detectedFormulas", "availableOptions"]
        }
      },
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return { summary: "Analyse web indisponible.", detectedFormulas: [], sourceUrl: "", availableOptions: [] };
  }
};

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  const ai = getAiClient();
  let context = "Tu es AssurClair, un assistant IA spécialisé en assurances. Contrats actuels de l'utilisateur :\n";
  policies.forEach(p => context += `- ${p.type} "${p.name}" chez ${p.provider}\n`);
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: {
        parts: [{ text: message }]
      },
      config: { 
        systemInstruction: context,
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (error) {
    console.error('sendMessageToAssistant error:', error);
    throw error;
  }
};

export const detectOptimizations = async (policies: Policy[], profile: UserProfileData): Promise<OptimizationFinding[]> => {
  const ai = getAiClient();
  const prompt = `Analyse les contrats suivants en fonction du profil utilisateur détaillé :
  CONTRATS : ${JSON.stringify(policies)}
  PROFIL : ${JSON.stringify(profile)}

  RÈGLES D'ANALYSE :
  1. ADÉQUATION PROFIL : Vérifie si les garanties (Santé, Habitation) correspondent aux âges et aux spécificités du foyer (ex: besoin dentaire/optique pour les enfants, RC piscine).
  2. DOUBLONS : Détecte si deux contrats couvrent le même risque (ex: Protection Juridique dans Auto ET Habitation).
  3. MANQUES : Identifie des risques non couverts (ex: maison sans assurance habitation, animal de compagnie sans mutuelle, absence de GAV).
  4. LOCALISATION : Utilise le code postal pour évaluer si le contrat habitation semble cohérent avec les risques de la zone (si mentionné).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["duplicate", "gap", "saving"] },
              severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
              involvedPolicies: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING }
            },
            required: ["title", "description", "type", "severity", "involvedPolicies", "recommendation"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) { return []; }
};

export const generateShareableReport = async (policies: Policy[], findings: OptimizationFinding[]): Promise<string> => {
  const ai = getAiClient();
  const prompt = `Génère un court texte de partage résumant mon bilan AssurClair. Mes contrats : ${policies.map(p => `${p.provider} (${p.type})`).join(', ')}.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: { parts: [{ text: prompt }] },
    });
    return response.text?.trim() || "J'ai fait mon bilan AssurClair !";
  } catch (error) {
    return "J'ai fait mon bilan AssurClair !";
  }
};

export const connectIntakeSession = async (
  onInput: (t: string) => void,
  onOutput: (t: string) => void,
  onComplete: () => void,
  existingPolicyTypes: PolicyType[]
) => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('Fonction audio non disponible: VITE_GEMINI_API_KEY manquante');
  }
  const allRecommended = ["Automobile", "Habitation", "Santé/Mutuelle", "Protection Juridique", "Prévoyance/Décès"];
  const missing = allRecommended.filter(type => !existingPolicyTypes.includes(type as PolicyType));
  
  const systemInstruction = `Tu es l'agent d'admission d'AssurClair. Ton rôle est d'être PRÉCIS.
  
  RÈGLES D'INTERACTION :
  1. Si l'utilisateur mentionne un contrat SANS l'assureur : Demande impérativement "Chez quel assureur ?"
  2. Si l'assureur est connu mais la FORMULE est absente (ex: Tiers, Tous Risques, Initiale) : Demande "Quelle est votre formule ou niveau de garantie ?"
  3. Si l'utilisateur mentionne des options, valide-les.
  4. NORMALISATION : Corrige vocalement les noms (ex: "D'accord pour la MAIF" si l'utilisateur dit MAIFFE).
  5. Suggère les types manquants : ${missing.join(', ')}.
  6. Réponse courte (max 10 mots).`;
  
  let nextStartTime = 0;
  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  
  // Volume boost
  const outputNode = outputAudioContext.createGain();
  outputNode.gain.value = 1.3; // 30% boost
  outputNode.connect(outputAudioContext.destination);
  
  const sources = new Set<AudioBufferSourceNode>();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => {
        // Ensure audio contexts are resumed
        inputAudioContext.resume();
        outputAudioContext.resume();

        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then(s => {
            try {
              s.sendRealtimeInput({ media: pcmBlob });
            } catch (err) {
              console.error("Failed to send audio input", err);
            }
          });
        };
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) onOutput(message.serverContent.outputTranscription.text);
        else if (message.serverContent?.inputTranscription) onInput(message.serverContent.inputTranscription.text);
        if (message.serverContent?.turnComplete) onComplete();
        
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
          try {
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNode);
            source.onended = () => sources.delete(source);
            source.start(nextStartTime);
            nextStartTime += audioBuffer.duration;
            sources.add(source);
          } catch (err) {
            console.error("Audio decoding error", err);
          }
        }
        if (message.serverContent?.interrupted) {
          for (const source of sources.values()) {
            try { source.stop(); } catch(e) {}
          }
          sources.clear();
          nextStartTime = 0;
        }
      },
      onerror: (e) => console.error("Live session error:", e),
      onclose: () => console.log("Live session closed"),
    },
    config: { 
      responseModalities: [Modality.AUDIO], 
      outputAudioTranscription: {}, 
      inputAudioTranscription: {}, 
      systemInstruction: systemInstruction,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    },
  });
  
  function createBlob(data: Float32Array): Blob {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }
  
  return async () => {
    try {
      (await sessionPromise).close();
    } catch(e) {}
    stream.getTracks().forEach(t => t.stop());
    inputAudioContext.close();
    outputAudioContext.close();
  };
};

export const connectLiveSession = async (
  policies: Policy[],
  onInput: (t: string) => void,
  onOutput: (t: string) => void,
  onComplete: () => void
) => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('Fonction audio non disponible: VITE_GEMINI_API_KEY manquante');
  }
  let context = "Tu es AssurClair. Contrats actuels :\n";
  policies.forEach(p => context += `- [${p.type}] ${p.name} chez ${p.provider}.\n`);
  
  let nextStartTime = 0;
  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  
  const outputNode = outputAudioContext.createGain();
  outputNode.gain.value = 1.3; // Boost
  outputNode.connect(outputAudioContext.destination);
  
  const sources = new Set<AudioBufferSourceNode>();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks: {
      onopen: () => {
        inputAudioContext.resume();
        outputAudioContext.resume();
        const source = inputAudioContext.createMediaStreamSource(stream);
        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then(s => {
            try { s.sendRealtimeInput({ media: pcmBlob }); } catch(e) {}
          });
        };
        source.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) onOutput(message.serverContent.outputTranscription.text);
        else if (message.serverContent?.inputTranscription) onInput(message.serverContent.inputTranscription.text);
        if (message.serverContent?.turnComplete) onComplete();
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
          try {
            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNode);
            source.onended = () => sources.delete(source);
            source.start(nextStartTime);
            nextStartTime += audioBuffer.duration;
            sources.add(source);
          } catch(e) {}
        }
        if (message.serverContent?.interrupted) {
          for (const source of sources.values()) { try { source.stop(); } catch(e) {} }
          sources.clear();
          nextStartTime = 0;
        }
      },
      onerror: (e) => console.error(e),
    },
    config: { 
      responseModalities: [Modality.AUDIO], 
      outputAudioTranscription: {}, 
      inputAudioTranscription: {}, 
      systemInstruction: context,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
    },
  });
  
  function createBlob(data: Float32Array): Blob {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }
  
  return async () => {
    try { (await sessionPromise).close(); } catch(e) {}
    stream.getTracks().forEach(t => t.stop());
    inputAudioContext.close();
    outputAudioContext.close();
  };
};

function decode(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function encode(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}
