"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShareableReport = exports.indexCgDocument = exports.parsePoliciesFromText = exports.sendMessageToAssistant = exports.chunkText = exports.generateEmbedding = exports.detectDuplicates = exports.searchPolicyInfo = exports.summarizePolicy = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// -----------------------------------------------------------------------------
// Service AI (Gemini) - wrapper minimal
// Ce service encapsule l'accès à l'API Gemini (librairie `@google/genai`). Si la
// clé `GEMINI_API_KEY` n'est pas définie, les fonctions retournent des valeurs
// simulées, ce qui facilite le prototypage local sans accès à Gemini.
// -----------------------------------------------------------------------------
dotenv_1.default.config();
const GEMINI_KEY = process.env.GEMINI_API_KEY;
let client = null;
/**
 * Crée et met en cache un client Gemini si la clé est disponible.
 * Retourne `null` si la clé est absente ou si l'import échoue.
 */
function getAiClient() {
    if (!GEMINI_KEY)
        return null;
    if (!client) {
        try {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            client = new GoogleGenerativeAI(GEMINI_KEY);
        }
        catch (e) {
            console.error('Failed to require @google/generative-ai - AI features will be disabled.', e);
            return null;
        }
    }
    return client;
}
const generateSystemInstruction = (policies = []) => {
    let context = "Tu es AssurClair, un assistant personnel expert en assurances. Ton but est d'aider l'utilisateur à comprendre ses couvertures. ";
    context += "Voici la liste des contrats de l'utilisateur (analyse-les pour répondre) :\n";
    policies.forEach(p => {
        context += `- Contrat \"${p.name}\" chez \"${p.provider}\" (Type: ${p.type}, Formule: ${p.coverageDetail || 'Non spécifiée'}). `;
        if (p.summary)
            context += `Résumé garanties: ${p.summary}. `;
        if (p.sourceUrl)
            context += `Source web: ${p.sourceUrl}. `;
        context += "\n";
    });
    context += "\nConsignes :\n1. Sois précis et cite le contrat concerné quand tu réponds.\n2. Si une garantie n'est pas mentionnée, dis que tu ne la trouves pas dans les documents.\n3. Sois concis et serviable.";
    return context;
};
const summarizePolicy = async (fileBase64, mimeType) => {
    const ai = getAiClient();
    if (!ai) {
        return `Résumé simulé (${mimeType}) : impossible d'accéder à Gemini, configurez GEMINI_API_KEY.`;
    }
    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: mimeType,
                    data: fileBase64
                }
            },
            "Analyse ce document d'assurance. Extrais en français : le nom de l'assureur, le type de contrat, et une liste à puces très concise des garanties majeures. Limite la réponse à 150 mots."
        ]);
        const response = await result.response;
        return response.text() || 'Impossible de générer un résumé.';
    }
    catch (err) {
        console.error('gemini summarize error', err);
        throw err;
    }
};
exports.summarizePolicy = summarizePolicy;
const searchPolicyInfo = async (provider, type, name) => {
    const ai = getAiClient();
    if (!ai) {
        return { summary: `Recherche simulée pour ${provider} - ${type} - ${name}`, sourceUrl: undefined, detectedFormulas: [], availableOptions: [] };
    }
    // ÉTAPE 1: Chercher dans central_cg (RAG) d'abord
    try {
        const storage = require('../storage').storage;
        const questionText = `Informations sur le contrat ${name} de ${provider} (${type})`;
        const questionEmbedding = await (0, exports.generateEmbedding)(questionText);
        const cgResults = await storage.searchCentralCg(questionEmbedding, [provider], 1);
        if (cgResults.length > 0 && cgResults[0].similarity > 0.7) {
            const cg = cgResults[0];
            console.log(`✅ CG trouvée dans RAG: ${cg.insurer} - ${cg.product_name} (similarité: ${cg.similarity})`);
            // Extraire formules et options du contenu
            const promptExtract = `Analyse ce document de conditions générales et extrais:

${cg.content_text?.substring(0, 5000) || ''}

Réponds en JSON:
{
  "summary": "Résumé des garanties principales",
  "formulas": ["liste des formules trouvées"],
  "options": ["liste des options trouvées"]
}`;
            const model = ai.getGenerativeModel({
                model: 'gemini-2.5-flash',
                generationConfig: { responseMimeType: 'application/json' }
            });
            const extractResult = await model.generateContent([promptExtract]);
            const extractText = extractResult.response.text();
            const extracted = JSON.parse(extractText);
            return {
                summary: extracted.summary || 'Informations extraites des conditions générales',
                sourceUrl: cg.document_url,
                detectedFormulas: Array.isArray(extracted.formulas) ? extracted.formulas : [],
                availableOptions: Array.isArray(extracted.options) ? extracted.options : []
            };
        }
    }
    catch (e) {
        console.warn('⚠️ Recherche RAG échouée, fallback sur Internet:', e.message);
    }
    // ÉTAPE 2: Si pas trouvé dans RAG, chercher sur Internet
    console.log('🌐 Recherche sur Internet pour', provider, name);
    const prompt = `Tu es un expert en assurances. Recherche sur Internet les conditions générales actuelles pour ce produit d'assurance :
  
  Assureur: ${provider}
  Catégorie: ${type}
  Nom commercial: ${name}
  
  Instructions :
  1. RECHERCHE WEB: Trouve les informations officielles les plus récentes sur ce contrat
  2. Identifie les garanties incluses par défaut pour ce type de contrat chez cet assureur
  3. Liste les noms EXACTS des formules commerciales disponibles (ex: "Essentiel", "Confort", "Sérénité", "Tiers", "Tiers Plus", "Tous Risques")
  4. Fournis un résumé structuré des plafonds et franchises types si disponibles
  
  Réponds EXCLUSIVEMENT sous forme d'un objet JSON :
  {
    "summary": "Texte détaillé des garanties en français avec sources",
    "formulas": ["Nom Exact Formule A", "Nom Exact Formule B", "Nom Exact Formule C"],
    "options": ["Option 1", "Option 2"]
  }`;
    try {
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });
        const result = await model.generateContent([prompt]);
        const response = await result.response;
        const text = response.text();
        let jsonResponse = {};
        try {
            jsonResponse = JSON.parse(text);
        }
        catch (e) {
            jsonResponse = { summary: text, formulas: [] };
        }
        const summary = jsonResponse.summary || 'Aucun résumé structuré disponible.';
        const detectedFormulas = Array.isArray(jsonResponse.formulas) ? jsonResponse.formulas : [];
        const availableOptions = Array.isArray(jsonResponse.options) ? jsonResponse.options : [];
        return { summary, sourceUrl: undefined, detectedFormulas, availableOptions };
    }
    catch (err) {
        console.error('gemini search error', err);
        return { summary: 'La recherche automatique n\'a pas pu aboutir.', sourceUrl: undefined, detectedFormulas: [], availableOptions: [] };
    }
};
exports.searchPolicyInfo = searchPolicyInfo;
const detectDuplicates = async (policies, profile = {}) => {
    if (!policies || policies.length < 2)
        return [];
    const ai = getAiClient();
    if (!ai)
        return [];
    // ÉTAPE 1: Enrichir les contrats avec RAG (extraits pertinents)
    const storage = require('../storage').storage;
    const enrichedPolicies = [];
    for (const p of policies) {
        let enrichedContext = `Contrat ID: ${p.id}, Nom: ${p.name}, Type: ${p.type}, Assureur: ${p.provider}, Formule: ${p.coverageDetail || 'Non spécifiée'}.`;
        try {
            // Chercher dans les embeddings de ce contrat
            const questionEmbedding = await (0, exports.generateEmbedding)(`Garanties et couvertures du contrat ${p.name}`);
            const chunks = await storage.searchPolicyEmbeddings(questionEmbedding, [parseInt(p.id)], 3);
            if (chunks.length > 0) {
                enrichedContext += '\n\n📄 Extraits du contrat:\n';
                chunks.forEach((chunk) => {
                    enrichedContext += chunk.chunk_text.substring(0, 500) + '...\n';
                });
            }
            else {
                enrichedContext += ` Résumé : ${p.summary || 'Non disponible'}`;
            }
        }
        catch (e) {
            console.warn(`⚠️ RAG échoué pour policy ${p.id}, utilisation métadonnées`);
            enrichedContext += ` Résumé : ${p.summary || 'Non disponible'}`;
        }
        enrichedPolicies.push(enrichedContext);
    }
    const prompt = `Analyse ces contrats d'assurance en fonction du profil utilisateur et identifie les optimisations possibles (doublons, gaps de couverture, économies potentielles).

PROFIL UTILISATEUR : ${JSON.stringify(profile)}

CRITÈRES D'ANALYSE PRIORITAIRES :
1. ADÉQUATION FAMILLE : Vérifie si les âges des membres justifient des garanties santé spécifiques.
2. HABITAT & RISQUES : Analyse la présence de piscine, jardin ou l'année de construction.
3. LOCALISATION : Utilise le code postal pour évaluer les risques géographiques.
4. ANIMAUX : Vérifie si une mutuelle santé animale ou RC adaptée existe.
5. DOUBLONS & MANQUES : Détecte les chevauchements et manques critiques en analysant les clauses exactes.

Retourne un tableau JSON d'optimisations avec les champs:
- title: titre court
- description: explication détaillée avec citations des clauses
- type: 'duplicate' | 'gap' | 'saving'
- severity: 'low' | 'medium' | 'high'
- involvedPolicies: tableau d'IDs de polices concernées
- savingsPotential: montant économisé estimé (nombre)
- recommendation: recommandation d'action`;
    const parts = [{ text: prompt }];
    enrichedPolicies.forEach(enrichedText => {
        parts.push({ text: enrichedText });
    });
    try {
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });
        const result = await model.generateContent(parts);
        const response = await result.response;
        const text = response.text();
        return JSON.parse(text);
    }
    catch (err) {
        console.error('gemini detectDuplicates error', err);
        return [];
    }
};
exports.detectDuplicates = detectDuplicates;
/**
 * Génère un embedding de 768 dimensions pour un texte donné
 * Utilise le modèle text-embedding-004 de Gemini
 */
const generateEmbedding = async (text) => {
    const ai = getAiClient();
    if (!ai) {
        console.warn('No Gemini client - returning zero embedding');
        return new Array(768).fill(0);
    }
    try {
        const model = ai.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    }
    catch (err) {
        console.error('generateEmbedding error:', err);
        return new Array(768).fill(0);
    }
};
exports.generateEmbedding = generateEmbedding;
/**
 * Découpe un texte en chunks de ~1000 tokens
 * Utilise des séparateurs naturels (paragraphes, phrases)
 */
const chunkText = (text, maxChars = 3000) => {
    if (!text)
        return [];
    // Diviser par paragraphes d'abord
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';
    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length < maxChars) {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
        else {
            if (currentChunk)
                chunks.push(currentChunk);
            // Si le paragraphe est trop long, le découper par phrases
            if (paragraph.length > maxChars) {
                const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
                let sentenceChunk = '';
                for (const sentence of sentences) {
                    if (sentenceChunk.length + sentence.length < maxChars) {
                        sentenceChunk += sentence;
                    }
                    else {
                        if (sentenceChunk)
                            chunks.push(sentenceChunk);
                        sentenceChunk = sentence;
                    }
                }
                if (sentenceChunk)
                    chunks.push(sentenceChunk);
                currentChunk = '';
            }
            else {
                currentChunk = paragraph;
            }
        }
    }
    if (currentChunk)
        chunks.push(currentChunk);
    return chunks;
};
exports.chunkText = chunkText;
const sendMessageToAssistant = async (message, policies, history) => {
    const ai = getAiClient();
    if (!ai) {
        return "Le service d'assistant est temporairement indisponible. Veuillez configurer GEMINI_API_KEY.";
    }
    // DEBUG: Afficher les policies reçues
    console.log(`\n🔍 sendMessageToAssistant reçoit ${policies.length} policies:`);
    policies.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.name} - summary: "${p.summary}" - metadata:`, p.metadata ? JSON.stringify(p.metadata).substring(0, 100) : 'null');
    });
    try {
        const storage = require('../storage').storage;
        // Étape 1: Générer l'embedding de la question (peut échouer si ZScaler)
        let questionEmbedding;
        try {
            questionEmbedding = await (0, exports.generateEmbedding)(message);
            console.log(`✅ Embedding généré pour: "${message.substring(0, 50)}..."`);
        }
        catch (embErr) {
            console.warn('⚠️ Échec embedding, mode dégradé sans RAG:', embErr);
            questionEmbedding = new Array(768).fill(0);
        }
        // Étape 2: Rechercher dans les embeddings des contrats utilisateurs
        let policyChunks = [];
        try {
            const policyIds = policies.map(p => parseInt(p.id));
            if (policyIds.length > 0) {
                policyChunks = await storage.searchPolicyEmbeddings(questionEmbedding, policyIds, 5);
                console.log(`✅ RAG Policies: ${policyChunks.length} chunks trouvés`);
            }
        }
        catch (ragErr) {
            console.warn('⚠️ Échec recherche policy_embeddings:', ragErr);
        }
        // Étape 3: Rechercher dans les CG liées aux policies (central_cg et user_cg)
        let cgChunks = [];
        try {
            // Récupérer les IDs des CG liés aux policies
            const centralCgIds = policies.map(p => p.centralCgId).filter(id => id != null);
            const userCgIds = policies.map(p => p.userCgId).filter(id => id != null);
            console.log(`🔍 Recherche CG liés aux policies: ${centralCgIds.length} central_cg, ${userCgIds.length} user_cg`);
            // Recherche dans central_cg via embeddings
            if (centralCgIds.length > 0) {
                const centralResults = await storage.query(`SELECT 
            cg.id,
            cg.content_text,
            i.label as insurer_label,
            it.label_fr as type_label,
            cg.metadata->>'productName' as product_name,
            1 - (cg.embedding <=> $1::vector) as similarity
          FROM central_cg cg
          LEFT JOIN insurers i ON cg.insurer_code = i.code
          LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
          WHERE cg.id = ANY($2)
            AND cg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 5`, [JSON.stringify(questionEmbedding), centralCgIds]);
                cgChunks = cgChunks.concat(centralResults.rows.filter((cg) => !isNaN(cg.similarity)));
                console.log(`✅ RAG central_cg: ${centralResults.rows.length} documents trouvés`);
            }
            // Recherche dans user_cg via embeddings
            if (userCgIds.length > 0) {
                const userResults = await storage.query(`SELECT 
            ucg.id,
            ucg.content_text,
            i.label as insurer_label,
            it.label_fr as type_label,
            ucg.metadata->>'productName' as product_name,
            1 - (ucg.embedding <=> $1::vector) as similarity
          FROM user_cg ucg
          LEFT JOIN insurers i ON ucg.insurer_code = i.code
          LEFT JOIN insurance_types it ON ucg.insurance_type_code = it.code
          WHERE ucg.id = ANY($2)
            AND ucg.embedding IS NOT NULL
          ORDER BY similarity DESC
          LIMIT 5`, [JSON.stringify(questionEmbedding), userCgIds]);
                cgChunks = cgChunks.concat(userResults.rows.filter((cg) => !isNaN(cg.similarity)));
                console.log(`✅ RAG user_cg: ${userResults.rows.length} documents trouvés`);
            }
            // Trier par similarité
            cgChunks.sort((a, b) => b.similarity - a.similarity);
            cgChunks = cgChunks.slice(0, 5);
            console.log(`✅ Total CG: ${cgChunks.length} documents pertinents`);
            cgChunks.forEach((cg, idx) => {
                console.log(`   ${idx + 1}. ${cg.insurer_label} - ${cg.type_label} (similarité: ${cg.similarity.toFixed(3)})`);
            });
        }
        catch (cgErr) {
            console.warn('⚠️ Échec recherche CG liées:', cgErr);
        }
        // Étape 4: Construire le contexte enrichi
        let enrichedContext = '';
        if (policyChunks.length > 0) {
            enrichedContext += '📄 Extraits de vos contrats:\n\n';
            policyChunks.forEach((chunk, idx) => {
                enrichedContext += `[${chunk.provider} - ${chunk.type}]\n${chunk.chunk_text.substring(0, 800)}...\n\n`;
            });
        }
        if (cgChunks.length > 0) {
            enrichedContext += '📚 Conditions générales:\n\n';
            cgChunks.forEach((cg, idx) => {
                const insurerName = cg.insurer_label || cg.insurer || 'Assureur inconnu';
                // Extraction intelligente : chercher les mots-clés de la question dans le document
                const keywords = message.toLowerCase()
                    .replace(/[^\w\séàèùäöüâêîôû]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length > 4 && !['pour', 'avec', 'dans', 'donne', 'quelle', 'comment'].includes(w));
                let extractedText = '';
                const fullText = cg.content_text || '';
                if (keywords.length > 0 && fullText.length > 10000) {
                    // Chercher les positions des mots-clés dans le texte
                    const positions = [];
                    keywords.forEach(kw => {
                        const pos = fullText.toLowerCase().indexOf(kw);
                        if (pos > -1)
                            positions.push(pos);
                    });
                    if (positions.length > 0) {
                        // Extraire autour du premier mot-clé trouvé (±8000 chars = 10k total)
                        const centerPos = Math.min(...positions);
                        const start = Math.max(0, centerPos - 2000);
                        const end = Math.min(fullText.length, centerPos + 8000);
                        extractedText = fullText.substring(start, end);
                        console.log(`   📌 Extraction ciblée autour de "${keywords[0]}" (pos ${centerPos}, extrait ${end - start} chars)`);
                    }
                    else {
                        // Aucun mot-clé trouvé, prendre une partie plus large
                        extractedText = fullText.substring(0, 15000);
                    }
                }
                else {
                    // Document court ou pas de mots-clés, prendre une partie plus large (15k chars au lieu de 5k)
                    extractedText = fullText.substring(0, 15000);
                }
                enrichedContext += `[${insurerName} - ${cg.product_name}]\n${extractedText}...\n\n`;
            });
        }
        // Si aucun contexte RAG, fallback sur metadata
        if (!enrichedContext) {
            console.log('⚠️ Aucun contexte RAG - utilisation metadata');
            enrichedContext = 'Vos contrats:\n' + policies.map(p => {
                const insurer = p.provider || p.insurer || 'Assureur inconnu';
                // Extraire la formule depuis différentes sources possibles
                let formula = p.coverage || p.metadata?.formula;
                if (!formula && p.metadata?.summary) {
                    const summaryMatch = p.metadata.summary.match(/[-–]\s*(.+)$/);
                    if (summaryMatch)
                        formula = summaryMatch[1].trim();
                }
                if (!formula && p.metadata?.coverageDetail) {
                    const detailMatch = p.metadata.coverageDetail.match(/Formule:\s*(.+?)(?:\n|$)/);
                    if (detailMatch)
                        formula = detailMatch[1].trim();
                }
                const formulaInfo = formula ? ` - Formule: ${formula}` : '';
                return `- ${p.name} (${p.type}) chez ${insurer}${formulaInfo}: ${p.summary || 'Pas de résumé'}`;
            }).join('\n');
        }
        else {
            // Ajouter les infos des contrats utilisateur en début de contexte
            const policiesInfo = policies.map(p => {
                const insurer = p.provider || p.insurer || 'Assureur inconnu';
                // Extraire la formule depuis différentes sources possibles
                let formula = p.coverage || p.metadata?.formula;
                // Si pas de formule directe, chercher dans summary (ex: "Automobile - Plénitude")
                if (!formula && p.summary) {
                    const summaryMatch = p.summary.match(/[-–]\s*(.+)$/);
                    if (summaryMatch)
                        formula = summaryMatch[1].trim();
                }
                if (!formula && p.metadata?.summary) {
                    const summaryMatch = p.metadata.summary.match(/[-–]\s*(.+)$/);
                    if (summaryMatch)
                        formula = summaryMatch[1].trim();
                }
                // Si toujours pas de formule, chercher dans coverageDetail
                if (!formula && p.coverageDetail) {
                    const detailMatch = p.coverageDetail.match(/Formule:\s*(.+?)(?:\n|$)/);
                    if (detailMatch)
                        formula = detailMatch[1].trim();
                }
                if (!formula && p.metadata?.coverageDetail) {
                    const detailMatch = p.metadata.coverageDetail.match(/Formule:\s*(.+?)(?:\n|$)/);
                    if (detailMatch)
                        formula = detailMatch[1].trim();
                }
                // Construire la ligne avec toutes les infos importantes
                const options = p.options || p.metadata?.options;
                const optionsInfo = options && options.length > 0 ? ` [Options: ${options.join(', ')}]` : '';
                const formulaInfo = formula ? ` - Formule: ${formula}` : '';
                const policyLine = `${p.name}: ${insurer} / ${p.type}${formulaInfo}${optionsInfo}`;
                console.log(`📝 Contexte policy: ${policyLine}`);
                return policyLine;
            }).join('\n');
            enrichedContext = `📋 VOS CONTRATS:\n${policiesInfo}\n\n` + enrichedContext;
        }
        const systemInstruction = `Tu es un assistant expert en assurance pour l'application AssurClair. Tu as accès aux documents contractuels complets de l'utilisateur via un système de vectorisation RAG.

CONTEXTE DISPONIBLE:

${enrichedContext}

RÔLE ET COMPORTEMENT:
- Tu ES l'expert qui a ACCÈS aux documents contractuels détaillés de l'utilisateur
- CHERCHE la formule du contrat de l'utilisateur dans la section "📋 VOS CONTRATS" ci-dessus (ex: Initiale, Essentiel, Différence, Plénitude, Pertinence)
- Quand on te demande le détail d'une garantie, réponds DIRECTEMENT en PERSONNALISANT selon la formule souscrite
- Ne donne PAS une réponse générique listant toutes les formules - identifie SA formule et donne LES détails spécifiques
- Ne dis JAMAIS "je n'ai pas accès aux documents" - tu y as accès via le contexte fourni
- Ne dis JAMAIS "consultez vos Conditions Particulières" - tu DOIS répondre avec les infos du contexte
- Si une info manque dans le contexte, cherche d'abord dans les extraits fournis avant de dire qu'elle est absente
- Cite les passages pertinents des documents pour appuyer tes réponses
- Sois précis sur les montants, plafonds, franchises quand ils apparaissent dans les extraits
- Adopte un ton confiant et professionnel : tu connais les contrats de l'utilisateur

STRUCTURE DE RÉPONSE:
1. Identifie d'abord la formule du contrat dans "📋 VOS CONTRATS"
2. Réponds DIRECTEMENT à la question avec les infos SPÉCIFIQUES à cette formule
3. Cite les extraits pertinents entre guillemets
4. Si vraiment aucune info dans le contexte fourni, dis-le clairement (mais ne renvoie pas vers d'autres documents)
5. Ne renvoie JAMAIS l'utilisateur vers "son espace en ligne" ou "ses Conditions Particulières" - tu as les documents ici

Exemple de BONNE réponse:
"Avec votre formule Plénitude MAIF pour votre 5008, voici votre Assistance déplacement:
- Assistance 0 km: intervention dès le domicile (inclus)
- Remorquage: illimité vers le garage de votre choix
- Véhicule de remplacement: pendant toute la durée des réparations en cas d'accident, 20 jours en cas de vol, 7 jours en cas de panne
- Hébergement: frais d'hôtel pris en charge si immobilisation loin du domicile

Source: [Extrait CG MAIF - Options d'assistance]"

Exemple de MAUVAISE réponse (à éviter):
"Il existe plusieurs formules... Pour connaître précisément votre couverture, consultez vos Conditions Particulières."`;
        const chatHistory = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash'
        });
        // Ajouter le contexte système au premier message si l'historique est vide
        const chat = model.startChat({
            history: chatHistory.length === 0 ? [
                { role: 'user', parts: [{ text: systemInstruction }] },
                { role: 'model', parts: [{ text: 'Compris, je suis prêt à vous aider avec vos polices d\'assurance en m\'appuyant sur les documents fournis.' }] }
            ] : chatHistory
        });
        console.log(`📤 Envoi du message à Gemini...`);
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const responseText = response.text();
        console.log(`✅ Réponse Gemini reçue (${responseText.length} chars)`);
        return responseText || "Désolé, je n'ai pas pu générer de réponse.";
    }
    catch (err) {
        console.error('❌ gemini sendMessageToAssistant error:', err);
        console.error('Stack:', err?.stack);
        return `Une erreur s'est produite lors de la communication avec l'assistant: ${err?.message || 'Erreur inconnue'}`;
    }
};
exports.sendMessageToAssistant = sendMessageToAssistant;
/**
 * Extrait les contrats d'assurance à partir d'un texte libre.
 * Normalise les noms d'assureurs et identifie les types, formules et options.
 */
const parsePoliciesFromText = async (text) => {
    const ai = getAiClient();
    if (!ai) {
        return { policies: [], clarificationQuestions: null };
    }
    try {
        const storage = require('../storage').storage;
        // 🔍 Étape 1 : Récupérer toutes les formules et options disponibles depuis central_cg
        let availableFormulasAndOptions = '';
        try {
            const allCg = await storage.readCentralCg();
            if (allCg && allCg.length > 0) {
                const formulasByInsurer = {};
                const optionsByInsurer = {};
                allCg.forEach((cg) => {
                    const insurer = cg.insurer || 'Inconnu';
                    const formulas = cg.metadata?.indexedFormulas || [];
                    const options = cg.metadata?.indexedOptions || [];
                    if (formulas.length > 0) {
                        if (!formulasByInsurer[insurer])
                            formulasByInsurer[insurer] = [];
                        formulasByInsurer[insurer].push(...formulas);
                    }
                    if (options.length > 0) {
                        if (!optionsByInsurer[insurer])
                            optionsByInsurer[insurer] = [];
                        optionsByInsurer[insurer].push(...options);
                    }
                });
                // Construire la liste des formules et options disponibles
                if (Object.keys(formulasByInsurer).length > 0) {
                    availableFormulasAndOptions += '\n📋 FORMULES DISPONIBLES PAR ASSUREUR (utilise-les en priorité):\n';
                    for (const [insurer, formulas] of Object.entries(formulasByInsurer)) {
                        availableFormulasAndOptions += `- ${insurer}: ${[...new Set(formulas)].join(', ')}\n`;
                    }
                }
                if (Object.keys(optionsByInsurer).length > 0) {
                    availableFormulasAndOptions += '\n🔧 OPTIONS DISPONIBLES PAR ASSUREUR (suggère-les si pertinent):\n';
                    for (const [insurer, options] of Object.entries(optionsByInsurer)) {
                        availableFormulasAndOptions += `- ${insurer}: ${[...new Set(options)].join(', ')}\n`;
                    }
                }
                console.log('✅ Formules et options chargées depuis central_cg');
            }
        }
        catch (cgErr) {
            console.warn('⚠️ Impossible de charger les formules/options depuis central_cg:', cgErr);
        }
        const prompt = `Tu es un expert en analyse de documents d'assurance. Extrais les polices d'assurance du texte suivant et retourne un JSON.
${availableFormulasAndOptions}

IMPORTANT : 
- Si l'assureur est dans la liste ci-dessus, utilise EXACTEMENT les noms de formules listées (ne les invente pas).
- Suggère les options pertinentes si elles sont mentionnées ou implicites dans le texte.
- Si l'assureur n'est pas dans la liste, tu peux utiliser des noms génériques (Essentiel/Confort/Premium/etc.).

Format attendu :
{
  "policies": [
    {
      "type": "Auto" | "Habitation" | "Santé" | "Vie" | "Autre",
      "provider": "Nom de l'assureur",
      "name": "Nom du contrat",
      "coverageDetail": "Formule exacte (utilise celles de la liste ci-dessus si disponible)",
      "suggestedFormulas": ["Formule 1", "Formule 2"] ou [],
      "suggestedOptions": ["Option 1", "Option 2"] ou [],
      "premium": nombre ou null,
      "startDate": "YYYY-MM-DD" ou null
    }
  ],
  "clarificationQuestions": ["Question 1", "Question 2"] ou null
}

Si des informations sont manquantes ou ambiguës, génère des questions de clarification.

Texte à analyser :
${text}`;
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });
        const result = await model.generateContent([prompt]);
        const response = await result.response;
        const jsonText = response.text();
        const parsed = JSON.parse(jsonText);
        return {
            policies: Array.isArray(parsed.policies) ? parsed.policies : [],
            clarificationQuestions: Array.isArray(parsed.clarificationQuestions) ? parsed.clarificationQuestions : null
        };
    }
    catch (err) {
        console.error('gemini parsePoliciesFromText error', err);
        return { policies: [], clarificationQuestions: null };
    }
};
exports.parsePoliciesFromText = parsePoliciesFromText;
/**
 * Indexe un document de Conditions Générales via URL PDF ou base64
 * Télécharge le PDF et l'analyse directement pour extraire uniquement le contenu réel
 */
const indexCgDocument = async (provider, type, pdfUrl) => {
    const ai = getAiClient();
    if (!ai) {
        return { indexedFormulas: [], indexedOptions: [], semanticSummary: "Service IA non disponible" };
    }
    try {
        console.log(`📥 Téléchargement du PDF depuis: ${pdfUrl.substring(0, 100)}...`);
        // Télécharger le PDF
        let pdfBase64;
        if (pdfUrl.startsWith('data:application/pdf;base64,')) {
            // Si déjà en base64, extraire la partie data
            pdfBase64 = pdfUrl.split(',')[1];
        }
        else {
            // Sinon, télécharger depuis l'URL
            const response = await fetch(pdfUrl);
            if (!response.ok) {
                throw new Error(`Impossible de télécharger le PDF: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
        }
        console.log(`✅ PDF téléchargé (${Math.round(pdfBase64.length / 1024)}KB en base64)`);
        const prompt = `Analyse en profondeur ce document PDF des Conditions Générales ${type} de chez ${provider}.

IMPORTANT: Base-toi UNIQUEMENT sur le contenu réel du document PDF fourni. N'invente AUCUNE information.

Extrais du document : 
1. Les formules commerciales mentionnées (ex: Tiers, Tous Risques, Initiale, Confort, Essentiel, Premium).
2. Les options complémentaires listées (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Si une information n'est pas présente dans le document, laisse le tableau vide ou indique "Non spécifié" dans le résumé.

Réponds UNIQUEMENT au format JSON suivant, sans texte ni markdown supplémentaire :
{
  "indexedFormulas": ["Formule 1", "Formule 2"],
  "indexedOptions": ["Option 1", "Option 2"],
  "semanticSummary": "Résumé des garanties principales..."
}`;
        const model = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });
        console.log(`📤 Demande d'indexation à Gemini avec le contenu du PDF`);
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: pdfBase64
                }
            },
            prompt
        ]);
        const response = await result.response;
        let jsonText = response.text();
        console.log(`✅ Réponse Gemini reçue (${jsonText.length} chars)`);
        // Nettoyage robuste du JSON (enlever markdown, extraire JSON valide)
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        }
        else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/i, '');
        }
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(jsonText);
        if (!parsed.indexedFormulas || !parsed.indexedOptions || !parsed.semanticSummary) {
            throw new Error('Réponse Gemini incomplète');
        }
        console.log(`✅ Indexation réussie: ${parsed.indexedFormulas.length} formules, ${parsed.indexedOptions.length} options`);
        return parsed;
    }
    catch (err) {
        console.error('❌ gemini indexCgDocument error:', err);
        return {
            indexedFormulas: [],
            indexedOptions: [],
            semanticSummary: `Erreur: ${err?.message || 'Erreur inconnue'}`
        };
    }
};
exports.indexCgDocument = indexCgDocument;
/**
 * Génère un texte de partage court résumant le bilan AssurClair de l'utilisateur
 */
const generateShareableReport = async (policies, findings) => {
    const ai = getAiClient();
    if (!ai) {
        return "J'ai fait mon bilan AssurClair !";
    }
    const prompt = `Génère un court texte de partage (max 2 phrases) résumant mon bilan AssurClair.
  Mes contrats : ${policies.map(p => `${p.provider} (${p.type})`).join(', ')}.
  ${findings.length > 0 ? `J'ai ${findings.length} optimisation(s) possibles.` : ''}
  Ton texte doit être engageant et positif.`;
    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([prompt]);
        const response = await result.response;
        return response.text().trim() || "J'ai fait mon bilan AssurClair !";
    }
    catch (error) {
        console.error('gemini generateShareableReport error', error);
        return "J'ai fait mon bilan AssurClair !";
    }
};
exports.generateShareableReport = generateShareableReport;
