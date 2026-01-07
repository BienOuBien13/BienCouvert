
// -----------------------------------------------------------------------------
// Service client pour fonctionnalités AI
// - Ce module délègue les appels AI au backend (endpoints `/api/ai`), ce qui
//   évite d'exposer une clé API dans le navigateur. Les fonctions retournent
//   des données simples (résumé, recherche, détection de doublons) provenant
//   du backend.
// -----------------------------------------------------------------------------
import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob } from "@google/genai";
import { Policy, DuplicateFinding, Message, WebSearchResult } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

const getAiClient = () => {
  // Dans le navigateur, on utilise l'API backend pour appeler Gemini afin de
  // ne pas exposer de clé au client. Renvoie `null` car le client natif n'est
  // pas utilisé côté front.
  return null;
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
  try {
    const res = await fetch(`${API_BASE}/api/policies/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64, mimeType }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Summarize failed');
    return body.summary as string;
  } catch (error) {
    console.error('Error summarizing policy (client->backend):', error);
    throw error;
  }
};

/**
 * Searches for the policy conditions online with improved grounding and extraction.
 */
export const searchPolicyInfo = async (provider: string, type: string, name: string): Promise<WebSearchResult> => {
  try {
    const res = await fetch(`${API_BASE}/api/policies/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, type, name })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Search failed:', errBody);
      return { summary: 'La recherche a échoué.', sourceUrl: undefined, detectedFormulas: [] };
    }

    const body = await res.json().catch(() => ({}));
    return { summary: body.summary || '', sourceUrl: body.sourceUrl, detectedFormulas: body.formulas || [] } as WebSearchResult;
  } catch (error) {
    console.error('Error searching policy info (client->backend):', error);
    return { summary: 'Erreur réseau lors de la recherche.', sourceUrl: undefined, detectedFormulas: [] };
  }
};

/**
 * Detects duplicates across multiple policies.
 */
export const detectDuplicates = async (policies: Policy[]): Promise<DuplicateFinding[]> => {
  if (policies.length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/api/policies/detect-duplicates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policies }) });
    const body = await res.json();
    if (!res.ok) throw new Error('Detect duplicates failed');
    return body as DuplicateFinding[];
  } catch (error) {
    console.error('Error detectDuplicates (client->backend):', error);
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
  try {
    const res = await fetch(`${API_BASE}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, policies, history }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Chat failed');
    return body.reply as string;
  } catch (error) {
    console.error('Error in chat (client->backend):', error);
    return 'Une erreur technique est survenue.';
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
  if (!ai) throw new Error('Live audio sessions require direct Gemini client support; configure GEMINI_API_KEY or use server-side live endpoint.');
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
