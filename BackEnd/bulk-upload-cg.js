const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
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
 * Script de chargement en masse de PDF dans central_cg
 * 
 * UTILISATION :
 * 1. Créer un fichier CSV 'bulk-upload.csv' avec les colonnes :
 *    filename,insurer_code,insurance_type_code,version,type,url,productName
 * 
 * 2. Placer tous les PDFs dans le dossier './pdfs/'
 * 
 * 3. Exécuter : node bulk-upload-cg.js
 * 
 * EXEMPLE CSV :
 * filename,insurer_code,insurance_type_code,version,type,url,productName
 * maif-auto.pdf,MAIF,AUTO,2024-01,CG,https://www.maif.fr/cg-auto.pdf,Auto Vam
 * axa-habitation.pdf,AXA,HABITATION,2024-01,CG,,MRH Confort
 */

async function extractTextFromPdf(pdfPath) {
  console.log(`  📄 Extraction du texte de ${path.basename(pdfPath)}...`);
  
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
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8192) }] }, outputDimensionality: 768 }),
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

async function indexDocument(pdfPath, metadata) {
  console.log(`\n📥 Traitement de ${metadata.filename}...`);
  
  try {
    // Vérifier que le fichier existe
    if (!fs.existsSync(pdfPath)) {
      console.error(`  ❌ Fichier introuvable : ${pdfPath}`);
      return false;
    }
    
    // Extraire le texte
    const contentText = await extractTextFromPdf(pdfPath);
    
    // Générer l'embedding
    const embedding = await generateEmbedding(contentText);
    
    // Insérer dans la base
    console.log('  💾 Insertion dans la base de données...');
    
    const result = await pool.query(`
      INSERT INTO central_cg (
        insurer_code, insurance_type_code, version, type, owner,
        detail, url, target_filename, status, content_text, embedding, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING id
    `, [
      metadata.insurer_code,
      metadata.insurance_type_code,
      metadata.version || null,
      metadata.type || 'CG',
      'bulk_upload',
      null,
      metadata.url || null,
      metadata.filename,
      'active',
      contentText,
      JSON.stringify(embedding),
      JSON.stringify({
        productName: metadata.productName || metadata.filename,
        indexedFormulas: [],
        indexedOptions: {},
        description: `Document ${metadata.filename} importé via bulk upload`,
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

async function bulkUpload() {
  console.log('🚀 Chargement en masse de documents CG\n');
  console.log('═'.repeat(60));
  
  const csvPath = path.join(__dirname, 'bulk-upload.csv');
  const pdfDir = path.join(__dirname, 'pdfs');
  
  // Vérifier que le CSV existe
  if (!fs.existsSync(csvPath)) {
    console.error(`\n❌ Fichier CSV introuvable : ${csvPath}`);
    console.log('\n💡 Créez un fichier bulk-upload.csv avec les colonnes :');
    console.log('   filename,insurer_code,insurance_type_code,version,type,url,productName\n');
    process.exit(1);
  }
  
  // Vérifier que le dossier PDFs existe
  if (!fs.existsSync(pdfDir)) {
    console.error(`\n❌ Dossier PDFs introuvable : ${pdfDir}`);
    console.log('\n💡 Créez un dossier "pdfs" et placez-y vos fichiers PDF\n');
    process.exit(1);
  }
  
  const documents = [];
  
  // Lire le CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => documents.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`\n📋 ${documents.length} document(s) à traiter\n`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`\n[${i + 1}/${documents.length}] ───────────────────────────────`);
    
    const pdfPath = path.join(pdfDir, doc.filename);
    const result = await indexDocument(pdfPath, doc);
    
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Pause de 2 secondes entre chaque document pour éviter les rate limits API
    if (i < documents.length - 1) {
      console.log('\n  ⏳ Pause de 2 secondes...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n═'.repeat(60));
  console.log('\n✨ RÉSUMÉ');
  console.log(`   ✅ Réussis : ${success}`);
  console.log(`   ❌ Échoués : ${failed}`);
  console.log(`   📊 Total   : ${documents.length}\n`);
  
  await pool.end();
}

bulkUpload()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Erreur fatale:', error);
    process.exit(1);
  });
