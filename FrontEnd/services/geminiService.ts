
import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob } from "@google/genai";
import { Policy, OptimizationFinding, Message, WebSearchResult, UserProfileData } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    throw new Error("Clé API manquante. Veuillez configurer votre clé API.");
  }
  return new GoogleGenAI({ apiKey });
};

const generateSystemInstruction = (policies: Policy[]): string => {
  let context = "Tu es AssurClair, un assistant personnel expert en assurances. Ton but est d'aider l'utilisateur à comprendre ses couvertures. ";
  context += "Voici la liste des contrats de l'utilisateur :\n";

  policies.forEach(p => {
    context += `- Contrat "${p.name}" chez "${p.provider}" (Type: ${p.type}, Formule: ${p.coverageDetail || 'Non spécifiée'}). `;
    if (p.options?.length) context += `Options souscrites: ${p.options.join(', ')}. `;
    if (p.summary) context += `Résumé garanties: ${p.summary}. `;
    context += "\n";
  });

  context += "\nConsignes :\n";
  context += "1. Sois précis et cite le contrat concerné.\n";
  context += "2. Inclus les assurances de cartes bancaires (Visa Premier, Gold Mastercard) dans tes raisonnements de doublons (voyage, location de voiture).\n";
  context += "3. Sois concis et serviable.\n";
  
  return context;
};

export const summarizePolicy = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: fileBase64 } },
          { text: "Analyse ce document d'assurance. Extrais : l'assureur, le type de contrat, la formule et les options éventuelles. Limite à 150 mots." }
        ]
      }
    });
    return response.text || "Impossible de générer un résumé.";
  } catch (error) {
    console.error("Error summarizing policy:", error);
    throw error;
  }
};

export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  const ai = getAiClient();
  const prompt = `Trouve les garanties, formules et options complémentaires standard pour l'assurance suivante : 
  Assureur: ${provider}, Type: ${type}, Produit: ${name}.
  Donne un court résumé des garanties, liste les noms des formules commerciales (ex: Tiers, Confort) et liste les options couramment proposées (ex: Assistance 0km, Jardin+, Vol hors domicile).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            formulas: { type: Type.ARRAY, items: { type: Type.STRING } },
            options: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "formulas", "options"]
        }
      }
    });

    let textResponse = response.text || "";
    if (textResponse.includes("```json")) textResponse = textResponse.replace(/```json|```/g, "").trim();

    const jsonResponse = JSON.parse(textResponse);
    let sourceUrl = undefined;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      const webChunk = chunks.find((c: any) => c.web?.uri);
      if (webChunk) sourceUrl = webChunk.web.uri;
    }

    return { 
      summary: jsonResponse.summary || "Données récupérées via le web.", 
      sourceUrl, 
      detectedFormulas: jsonResponse.formulas?.length ? jsonResponse.formulas : ["Standard", "Essentiel", "Premium"],
      availableOptions: jsonResponse.options || []
    };
  } catch (error) {
    return { 
      summary: "Données web indisponibles pour le moment.", 
      sourceUrl: undefined, 
      detectedFormulas: ["Standard", "Essentiel", "Premium"],
      availableOptions: []
    };
  }
};

export const detectOptimizations = async (policies: Policy[], profile: UserProfileData): Promise<OptimizationFinding[]> => {
  const ai = getAiClient();
  const promptParts: any[] = [
    {
      text: `Agis en expert courtier. Analyse ces contrats selon ce profil utilisateur détaillé.
      
      PROFIL UTILISATEUR :
      - Profession: ${profile.profession || 'Non renseigné'} (${profile.workStatus})
      - Enfants: ${profile.childrenCount || 0}
      - Maison: ${profile.hasPool ? 'Piscine' : ''}, ${profile.hasGarden ? 'Jardin' : ''}
      - Santé: ${profile.healthNeeds?.join(', ') || 'Standard'}. Note: ${profile.healthSpecifics || 'RAS'}
      - Sports à risque: ${profile.riskySports?.join(', ') || 'Aucun'}
      - Voyages: ${profile.travelFrequency}
      - Projets de vie: ${profile.lifeProjects || 'Aucun projet spécifié'}
      
      MISSIONS :
      1. DOUBLONS : Ex: Assurance voyage payée alors qu'il a une carte Gold/Premier.
      2. CARENCES : Ex: Pratique du ski/parapente sans garantie spécifique, ou indépendant sans prévoyance. 
         Vérifie si les options souscrites (ex: Jardin+) sont pertinentes ou s'il en manque (ex: a un jardin mais pas l'option).
      3. ÉCONOMIES : Estime les gains si on supprime un doublon ou une option inutile.

      Retourne un tableau JSON d'OptimizationFinding.`
    }
  ];

  policies.forEach(p => {
    promptParts.push({ text: `ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail}. Options: ${p.options?.join(', ') || 'Aucune'}. Résumé: ${p.summary}` });
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: promptParts },
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
              estimatedSaving: { type: Type.NUMBER },
              recommendation: { type: Type.STRING }
            },
            required: ["title", "description", "type", "severity", "involvedPolicies", "recommendation"]
          }
        }
      }
    });
    return JSON.parse(response.text) as OptimizationFinding[];
  } catch (error) {
    console.error("Error detecting optimizations:", error);
    return [];
  }
};

export const sendMessageToAssistant = async (message: string, policies: Policy[], history: Message[]): Promise<string> => {
  const ai = getAiClient();
  const systemInstruction = generateSystemInstruction(policies);
  try {
    const finalParts = [
      ...history.map(h => ({ text: `${h.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${h.text}` })),
      { text: message }
    ];
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: finalParts },
      config: { systemInstruction, tools: [{ googleSearch: {} }] }
    });
    return response.text || "Désolé...";
  } catch (error) {
    return "Une erreur technique est survenue.";
  }
};

/* AUDIO UTILS */
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) int16[i] = Math.max(-1, Math.min(1, data[i])) * 32768;
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  return buffer;
}

export const connectLiveSession = async (policies: Policy[], onInput: (t: string) => void, onOutput: (t: string) => void, onComplete: () => void) => {
  const ai = getAiClient();
  const systemInstruction = generateSystemInstruction(policies);
  const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const outputNode = outputCtx.createGain();
  outputNode.connect(outputCtx.destination);
  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
        };
        source.connect(processor);
        processor.connect(inputCtx.destination);
      },
      onmessage: async (m: LiveServerMessage) => {
        if (m.serverContent?.inputTranscription) onInput(m.serverContent.inputTranscription.text);
        if (m.serverContent?.outputTranscription) onOutput(m.serverContent.outputTranscription.text);
        if (m.serverContent?.turnComplete) onComplete();
        const b64 = m.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (b64) {
          nextStartTime = Math.max(nextStartTime, outputCtx.currentTime);
          const buf = await decodeAudioData(decode(b64), outputCtx);
          const src = outputCtx.createBufferSource();
          src.buffer = buf;
          src.connect(outputNode);
          src.start(nextStartTime);
          nextStartTime += buf.duration;
          sources.add(src);
        }
      }
    },
    config: { 
      responseModalities: [Modality.AUDIO], 
      systemInstruction, 
      inputAudioTranscription: {}, 
      outputAudioTranscription: {} 
    }
  });
  return () => {
    sessionPromise.then(s => s.close());
    stream.getTracks().forEach(t => t.stop());
    inputCtx.close();
    outputCtx.close();
  };
};
