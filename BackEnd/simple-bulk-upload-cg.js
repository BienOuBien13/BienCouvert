const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const nodeFetch = require('node-fetch');
const https = require('https');
const insecureAgent = new https.Agent({ rejectUnauthorized: false });
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Script de chargement simple par convention de nommage
 * 
 * UTILISATION :
 * 1. Nommer vos PDFs selon le format : 
 *    {CODE_ASSUREUR}_{CODE_TYPE}_{VERSION}.pdf
 *    
 *    Exemples :
 *    - MAIF_AUTO_2024-01.pdf
 *    - AXA_HABITATION_2024-02.pdf
 *    - ALLIANZ_SANTE_2024-01.pdf
 * 
 * 2. Placer tous les PDFs dans le dossier './pdfs/'
 * 
 * 3. Exécuter : node simple-bulk-upload-cg.js
 * 
 * Le script va automatiquement extraire les informations du nom de fichier
 */

async function extractTextFromPdf(pdfPath) {
  console.log(`  📄 Extraction du texte...`);
  
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');
  
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBase64
      }
    },
    "Extrais tout le texte de ce document PDF en français, mot pour mot, sans résumé."
  ]);
  
  const text = result.response.text();
  console.log(`  ✅ ${text.length} caractères extraits`);
  return text;
}

const _EMBED_MODELS = ['gemini-embedding-001'];
let _workingEmbedModel = undefined;

async function generateEmbedding(text) {
  console.log('  🔮 Génération de l\'embedding...');
  const apiKey = process.env.GEMINI_API_KEY;
  const modelsToTry = _workingEmbedModel ? [_workingEmbedModel] : _EMBED_MODELS;

  for (const modelName of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;
    try {
      const res = await nodeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8192) }] } }),
        agent: insecureAgent
      });
      if (res.status === 404 || res.status === 400) continue;
      if (!res.ok) {
        const b = await res.text();
        console.error(`  ⚠️  ${modelName}: ${res.status} ${b.slice(0, 120)}`);
        continue;
      }
      const data = await res.json();
      const values = data.embedding?.values;
      if (values && values.length > 0) {
        if (_workingEmbedModel === undefined) {
          console.log(`  ✅ Embedding via ${modelName} (${values.length} dims)`);
          _workingEmbedModel = modelName;
        }
        return values;
      }
    } catch (err) {
      console.error(`  ⚠️  ${modelName} network error:`, err.message);
    }
  }
  throw new Error('❌ Aucun modèle embedding disponible');
}

function parseFilename(filename) {
  // Format attendu : ASSUREUR_TYPE_VERSION.pdf
  const nameWithoutExt = filename.replace('.pdf', '');
  const parts = nameWithoutExt.split('_');
  
  if (parts.length >= 2) {
    return {
      insurer_code: parts[0],
      insurance_type_code: parts[1],
      version: parts[2] || null,
      productName: nameWithoutExt.replace(/_/g, ' ')
    };
  }
  
  // Si le format n'est pas respecté, demander à l'utilisateur
  return null;
}

async function uploadPdf(pdfPath) {
  const filename = path.basename(pdfPath);
  console.log(`\n📥 Traitement de ${filename}...`);
  
  try {
    // Parser le nom de fichier
    const metadata = parseFilename(filename);
    
    if (!metadata) {
      console.log(`  ⚠️  Format de nom invalide. Utilisez : ASSUREUR_TYPE_VERSION.pdf`);
      console.log(`      Exemple : MAIF_AUTO_2024-01.pdf`);
      return false;
    }
    
    console.log(`  📋 Assureur : ${metadata.insurer_code}`);
    console.log(`  📋 Type     : ${metadata.insurance_type_code}`);
    console.log(`  📋 Version  : ${metadata.version || 'N/A'}`);
    
    // Extraire le texte
    const contentText = await extractTextFromPdf(pdfPath);
    
    // Générer l'embedding
    const embedding = await generateEmbedding(contentText);
    
    // Insérer dans la base
    console.log('  💾 Insertion dans la base de données...');
    
    const result = await pool.query(`
      INSERT INTO central_cg (
        insurer_code, insurance_type_code, version, type, owner,
        url, target_filename, status, content_text, embedding, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING id
    `, [
      metadata.insurer_code,
      metadata.insurance_type_code,
      metadata.version,
      'CG',
      'bulk_upload',
      null,
      filename,
      'active',
      contentText,
      JSON.stringify(embedding),
      JSON.stringify({
        productName: metadata.productName,
        indexedFormulas: [],
        indexedOptions: {},
        description: `Document importé automatiquement`,
        uploadDate: new Date().toISOString()
      })
    ]);
    
    console.log(`  ✅ Document enregistré avec l'ID ${result.rows[0].id}`);
    return true;
    
  } catch (error) {
    console.error(`  ❌ Erreur : ${error.message}`);
    return false;
  }
}

async function scanAndUpload() {
  console.log('🚀 Chargement automatique de documents CG\n');
  console.log('═'.repeat(60));
  
  const pdfDir = path.join(__dirname, 'pdfs');
  
  if (!fs.existsSync(pdfDir)) {
    console.error(`\n❌ Dossier introuvable : ${pdfDir}`);
    console.log('\n💡 Créez un dossier "pdfs" et placez-y vos fichiers PDF');
    console.log('   Nommez-les : ASSUREUR_TYPE_VERSION.pdf');
    console.log('   Exemple : MAIF_AUTO_2024-01.pdf\n');
    process.exit(1);
  }
  
  // Lister tous les PDFs
  const files = fs.readdirSync(pdfDir)
    .filter(f => f.toLowerCase().endsWith('.pdf'));
  
  if (files.length === 0) {
    console.log('\n⚠️  Aucun fichier PDF trouvé dans le dossier pdfs/\n');
    process.exit(0);
  }
  
  console.log(`\n📋 ${files.length} fichier(s) PDF trouvé(s)\n`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}] ───────────────────────────────`);
    
    const pdfPath = path.join(pdfDir, files[i]);
    const result = await uploadPdf(pdfPath);
    
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Pause entre chaque document
    if (i < files.length - 1) {
      console.log('\n  ⏳ Pause de 2 secondes...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n═'.repeat(60));
  console.log('\n✨ RÉSUMÉ');
  console.log(`   ✅ Réussis : ${success}`);
  console.log(`   ❌ Échoués : ${failed}`);
  console.log(`   📊 Total   : ${files.length}\n`);
  
  await pool.end();
}

scanAndUpload()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Erreur fatale:', error);
    process.exit(1);
  });
