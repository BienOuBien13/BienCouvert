const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const GEMINI_API_KEY = 'AIzaSyCPV3dky8oIny2ZYClo6lOi4V-BIlYvaqY';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Agent HTTPS qui ignore les erreurs de certificat
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

/**
 * Extrait le texte d'un PDF (simulation - dans un vrai cas, utiliser pdf-parse)
 */
async function extractTextFromPDF(pdfUrl) {
  console.log(`📄 Extraction du texte depuis: ${pdfUrl}`);
  
  // Pour l'instant, on simule avec l'analyse directe via Gemini
  // Dans un vrai cas, vous utiliseriez pdf-parse ou similar
  
  try {
    const response = await fetch(pdfUrl, { agent: httpsAgent });
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    // Utiliser Gemini pour extraire le texte
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: 'application/pdf'
        }
      },
      `Extrait TOUT le contenu textuel EXACT de ce document PDF d'assurance.
      
      RÈGLES STRICTES:
      - NE MODIFIE RIEN, recopie le texte tel quel
      - N'INVENTE AUCUNE information
      - Inclus TOUTES les formules mentionnées dans le document
      - Inclus TOUTES les options/garanties listées dans le document
      - Inclus les tableaux de garanties
      - Conserve la structure du document`
    ]);
    
    const text = result.response.text();
    console.log(`✅ Texte extrait: ${text.length} caractères`);
    return text;
    
  } catch (error) {
    console.error('❌ Erreur extraction PDF:', error.message);
    throw error;
  }
}

/**
 * Analyse le document et extrait les métadonnées structurées
 */
async function analyzeDocument(text, insurer, type) {
  console.log('🧠 Analyse du document avec IA...');
  
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const prompt = `Analyse ce document d'assurance ${type} de ${insurer}.

⚠️ RÈGLES ABSOLUES - ZÉRO HALLUCINATION:
1. N'INVENTE AUCUNE formule qui n'est pas explicitement mentionnée dans le document
2. N'INVENTE AUCUNE option qui n'est pas listée dans le document
3. Si tu n'es pas SÛR à 100%, ne l'inclus PAS
4. Utilise les NOMS EXACTS tels qu'écrits dans le document
5. Si rien n'est trouvé, retourne des tableaux vides []

TEXTE DU DOCUMENT:
${text}

Extrait et retourne UNIQUEMENT un JSON valide avec cette structure exacte:
{
  "formules": ["Nom exact formule 1", "Nom exact formule 2"],
  "options": ["Nom exact option 1", "Nom exact option 2"],
  "resume": "Résumé factuel basé UNIQUEMENT sur le document"
}

Cherche dans le document:
- Les FORMULES: sections "Nos formules", "Niveaux de garantie", tableaux comparatifs
- Les OPTIONS: sections "Options", "Garanties optionnelles", "Extensions de garantie"

Si tu ne trouves RIEN de certain, retourne {"formules": [], "options": [], "resume": "Document analysé - contenu à vérifier manuellement"}.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Nettoyer la réponse (enlever les markdown code blocks si présents)
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const analysis = JSON.parse(jsonStr);
    
    console.log(`✅ Analyse terminée:`);
    console.log(`   - ${analysis.formules?.length || 0} formules identifiées`);
    if (analysis.formules?.length > 0) {
      console.log(`     Formules: ${analysis.formules.join(', ')}`);
    }
    console.log(`   - ${analysis.options?.length || 0} options identifiées`);
    if (analysis.options?.length > 0) {
      console.log(`     Options: ${analysis.options.join(', ')}`);
    }
    console.log(`   - Résumé: ${analysis.resume?.substring(0, 100)}...`);
    
    // Validation: vérifier que les formules/options ne sont pas des génériques inventés
    const suspiciousPatterns = ['formule 1', 'formule 2', 'option 1', 'option 2', 'formule de base', 'formule intermédiaire'];
    const hasSuspicious = [...(analysis.formules || []), ...(analysis.options || [])].some(item => 
      suspiciousPatterns.some(pattern => item.toLowerCase().includes(pattern))
    );
    
    if (hasSuspicious) {
      console.warn('⚠️  ATTENTION: Des noms génériques détectés - possible hallucination !');
      console.warn('   Vérifiez manuellement les résultats avant utilisation.');
    }
    
    return analysis;
  } catch (error) {
    console.error('❌ Erreur analyse document:', error.message);
    return {
      formules: [],
      options: [],
      resume: 'Analyse non disponible'
    };
  }
}

/**
 * Génère un embedding vectoriel via l'API Gemini
 */
async function generateEmbedding(text) {
  console.log('🎯 Génération de l\'embedding vectoriel...');
  
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    // Limiter le texte à 10000 caractères pour l'embedding
    const truncatedText = text.substring(0, 10000);
    
    const result = await model.embedContent(truncatedText);
    const embedding = result.embedding.values;
    
    console.log(`✅ Embedding généré: ${embedding.length} dimensions`);
    return embedding;
    
  } catch (error) {
    console.error('❌ Erreur génération embedding:', error.message);
    throw error;
  }
}

/**
 * Insère ou met à jour l'entrée dans PostgreSQL avec le vecteur
 */
async function saveToDatabase(data) {
  console.log('💾 Sauvegarde dans PostgreSQL...');
  
  const { insurer, productName, type, documentUrl, contentText, embedding, formules, options, resume } = data;
  
  // Préparer les métadonnées
  const metadata = {
    type: type,
    indexedFormulas: formules || [],
    indexedOptions: options || [],
    semanticSummary: resume || ''
  };
  
  // Convertir l'embedding en format pgvector
  const vectorStr = '[' + embedding.join(',') + ']';
  
  try {
    // Vérifier si l'entrée existe déjà
    const existing = await client.query(
      'SELECT id FROM central_cg WHERE insurer = $1 AND product_name = $2',
      [insurer, productName]
    );
    
    if (existing.rows.length > 0) {
      // UPDATE
      console.log('   📝 Mise à jour de l\'entrée existante...');
      await client.query(
        `UPDATE central_cg 
         SET document_url = $1, 
             content_text = $2, 
             embedding = $3::vector,
             metadata = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE insurer = $5 AND product_name = $6`,
        [documentUrl, contentText, vectorStr, JSON.stringify(metadata), insurer, productName]
      );
      console.log('✅ Entrée mise à jour avec succès');
    } else {
      // INSERT
      console.log('   ➕ Création d\'une nouvelle entrée...');
      await client.query(
        `INSERT INTO central_cg 
         (insurer, product_name, version, document_url, content_text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
        [insurer, productName, '2024', documentUrl, contentText, vectorStr, JSON.stringify(metadata)]
      );
      console.log('✅ Nouvelle entrée créée avec succès');
    }
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde database:', error.message);
    throw error;
  }
}

/**
 * Fonction principale de vectorisation
 */
async function vectorizePDF(insurer, productName, type, pdfUrl) {
  console.log('\n🚀 DÉMARRAGE DE LA VECTORISATION\n');
  console.log(`📋 Paramètres:`);
  console.log(`   Assureur: ${insurer}`);
  console.log(`   Produit: ${productName}`);
  console.log(`   Type: ${type}`);
  console.log(`   URL: ${pdfUrl}\n`);
  
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL\n');
    
    // 1. Extraire le texte du PDF
    const contentText = await extractTextFromPDF(pdfUrl);
    
    // 2. Analyser le document
    const analysis = await analyzeDocument(contentText, insurer, type);
    
    // 3. Générer l'embedding
    const embedding = await generateEmbedding(contentText);
    
    // 4. Sauvegarder dans la base
    await saveToDatabase({
      insurer,
      productName,
      type,
      documentUrl: pdfUrl,
      contentText,
      embedding,
      formules: analysis.formules,
      options: analysis.options,
      resume: analysis.resume
    });
    
    console.log('\n🎉 VECTORISATION TERMINÉE AVEC SUCCÈS!\n');
    console.log('📊 Résultat:');
    console.log(`   ✓ Texte: ${contentText.length} caractères`);
    console.log(`   ✓ Embedding: ${embedding.length} dimensions`);
    console.log(`   ✓ Formules: ${analysis.formules?.length || 0}`);
    console.log(`   ✓ Options: ${analysis.options?.length || 0}\n`);
    
  } catch (error) {
    console.error('\n❌ ÉCHEC DE LA VECTORISATION:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('👋 Déconnecté de PostgreSQL\n');
  }
}

// Interface en ligne de commande
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           VECTORISATION AUTOMATIQUE DE PDF                     ║
╚════════════════════════════════════════════════════════════════╝

Usage: node vectorize-pdf.js <assureur> <produit> <type> <url>

Exemples:
  node vectorize-pdf.js "MAIF" "Auto Zen" "auto" "https://www.maif.fr/cg.pdf"
  node vectorize-pdf.js "AXA" "Habitation Confort" "habitation" "https://axa.fr/cg-hab.pdf"
  node vectorize-pdf.js "Allianz" "Santé Plus" "sante" "https://allianz.fr/sante.pdf"

Types disponibles: auto, habitation, sante, pro, autre
`);
    process.exit(1);
  }
  
  const [insurer, productName, type, pdfUrl] = args;
  
  vectorizePDF(insurer, productName, type, pdfUrl)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { vectorizePDF };
