
import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob } from "@google/genai";
import { Policy, DuplicateFinding, Message, WebSearchResult } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables.");
    throw new Error("Clé API manquante. Veuillez configurer votre clé API.");
  }
  return new GoogleGenAI({ apiKey });
};

/* --- HELPER: Generate System Instruction from Policies --- */
const generateSystemInstruction = (policies: Policy[]): string => {
  let context = "Tu es AssurClair, un assistant personnel expert en assurances. Ton but est d'aider l'utilisateur à comprendre ses couvertures. ";
  context += "Voici la liste des contrats de l'utilisateur (analyse-les pour répondre) :\n";

  policies.forEach(p => {
    context += `- Contrat "${p.name}" chez "${p.provider}" (Type: ${p.type}, Formule: ${p.coverageDetail || 'Non spécifiée'}). `;
    if (p.summary) context += `Résumé garanties: ${p.summary}. `;
    if (p.sourceUrl) context += `Source web: ${p.sourceUrl}. `;
    context += "\n";
  });

  context += "\nConsignes :\n";
  context += "1. Sois précis et cite le contrat concerné quand tu réponds.\n";
  context += "2. Si une garantie n'est pas mentionnée, dis que tu ne la trouves pas dans les documents.\n";
  context += "3. Sois concis et serviable.\n";
  
  return context;
};

/**
 * Generates a brief summary of the uploaded insurance policy.
 */
export const summarizePolicy = async (fileBase64: string, mimeType: string): Promise<string> => {
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64
            }
          },
          {
            text: "Analyse ce document d'assurance. Extrais en français : le nom de l'assureur, le type de contrat, et une liste à puces très concise des garanties majeures. Limite la réponse à 150 mots."
          }
        ]
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    
    return response.text || "Impossible de générer un résumé.";
  } catch (error) {
    console.error("Error summarizing policy:", error);
    throw error;
  }
};

/**
 * Searches for the policy conditions online with improved grounding and extraction.
 */
export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  const ai = getAiClient();
  
  const prompt = `Recherche les conditions générales et les garanties types pour ce produit d'assurance :
  Assureur: ${provider}
  Catégorie: ${type}
  Nom commercial approximatif: ${name}
  
  Instructions :
  1. Identifie les garanties incluses par défaut pour ce type de contrat chez cet assureur.
  2. Liste les noms exacts des formules commerciales (ex: "Essentiel", "Confort", "Sérénité", "Tiers Plus", "Tous Risques").
  3. Fournis un résumé structuré des plafonds et franchises types si disponibles.
  
  Réponds EXCLUSIVEMENT sous forme d'un objet JSON.
  {
    "summary": "Texte détaillé des garanties en français",
    "formulas": ["Nom Formule A", "Nom Formule B", ...]
  }`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            formulas: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            }
          },
          required: ["summary", "formulas"]
        }
      }
    });
    
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(response.text);
    } catch (e) {
      console.warn("JSON Parse failed for search result", e);
      jsonResponse = { summary: response.text, formulas: [] };
    }
    
    const summary = jsonResponse.summary || "Aucun résumé structuré disponible.";
    const detectedFormulas = Array.isArray(jsonResponse.formulas) ? jsonResponse.formulas : [];
    
    let sourceUrl = undefined;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
      const webChunk = chunks.find((c: any) => c.web?.uri);
      if (webChunk) {
        sourceUrl = webChunk.web.uri;
      }
    }

    return { summary, sourceUrl, detectedFormulas };
  } catch (error) {
    console.error("Error searching policy info:", error);
    return { 
      summary: "La recherche automatique n'a pas pu aboutir. Veuillez essayer avec un nom d'assureur plus précis ou uploader un document.", 
      sourceUrl: undefined,
      detectedFormulas: []
    };
  }
};

/**
 * Detects duplicates across multiple policies.
 */
export const detectDuplicates = async (policies: Policy[]): Promise<DuplicateFinding[]> => {
  if (policies.length < 2) return [];

  const ai = getAiClient();

  const parts: any[] = [
    {
      text: `Analyse ces contrats d'assurance et identifie les doublons (chevauchements de garanties). 
      Exemple : "Protection Juridique" présente dans deux contrats différents.
      Retourne un tableau JSON.`
    }
  ];

  policies.forEach(p => {
    parts.push({
      text: `Contrat ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail || 'Non spécifiée'}. Résumé : ${p.summary}`
    });
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
              involvedPolicies: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["title", "description", "severity", "involvedPolicies"]
          }
        }
      }
    });

    return JSON.parse(response.text) as DuplicateFinding[];
  } catch (error) {
    console.error("Error detecting duplicates:", error);
    throw error;
  }
};

/**
 * Chat with the AI (Text Mode).
 */
export const sendMessageToAssistant = async (
  message: string, 
  policies: Policy[], 
  history: Message[]
): Promise<string> => {
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
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });

    return response.text || "Désolé, je n'ai pas pu analyser cette demande.";
  } catch (error) {
    console.error("Error in chat:", error);
    return "Une erreur technique est survenue.";
  }
};


/* ==========================================
   LIVE API & AUDIO UTILITIES
   ========================================== */

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32768;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const connectLiveSession = async (
  policies: Policy[],
  onInputTranscription: (text: string) => void,
  onOutputTranscription: (text: string) => void,
  onTurnComplete: () => void
) => {
  const ai = getAiClient();
  const systemInstruction = generateSystemInstruction(policies);

  const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  
  try {
    await outputAudioContext.resume();
  } catch (e) {
    console.warn("Failed to resume audio context", e);
  }

  const outputNode = outputAudioContext.createGain();
  outputNode.connect(outputAudioContext.destination);

  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();
  let stream: MediaStream | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;

  stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: () => {
        sourceNode = inputAudioContext.createMediaStreamSource(stream!);
        scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
        
        scriptProcessor.onaudioprocess = (e) => {
          if (outputAudioContext.currentTime < nextStartTime) {
             return; 
          }
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBlob = createBlob(inputData);
          sessionPromise.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
          });
        };
        
        sourceNode.connect(scriptProcessor);
        scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.inputTranscription) {
           onInputTranscription(message.serverContent.inputTranscription.text);
        }
        if (message.serverContent?.outputTranscription) {
           onOutputTranscription(message.serverContent.outputTranscription.text);
        }
        if (message.serverContent?.turnComplete) {
           onTurnComplete();
        }

        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
          try {
            nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
            const audioBuffer = await decodeAudioData(
              decode(base64Audio),
              outputAudioContext
            );
            
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNode);
            source.addEventListener('ended', () => sources.delete(source));
            source.start(nextStartTime);
            nextStartTime += audioBuffer.duration;
            sources.add(source);
          } catch (err) {
            console.error("Error decoding audio", err);
          }
        }

        if (message.serverContent?.interrupted) {
          sources.forEach(s => {
            try { s.stop(); } catch (e) {}
          });
          sources.clear();
          nextStartTime = 0;
        }
      },
      onclose: () => console.log("Live Session Closed"),
      onerror: (err) => console.error("Live Session Error", err)
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
      },
      systemInstruction: systemInstruction,
      inputAudioTranscription: {}, 
      outputAudioTranscription: {}
    }
  });

  return () => {
    sessionPromise.then(session => session.close());
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (sourceNode) sourceNode.disconnect();
    if (scriptProcessor) scriptProcessor.disconnect();
    if (inputAudioContext.state !== 'closed') inputAudioContext.close();
    if (outputAudioContext.state !== 'closed') outputAudioContext.close();
  };
};
