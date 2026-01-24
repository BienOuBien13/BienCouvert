const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
const fetch = require('node-fetch');

// Désactiver la vérification SSL pour les tests
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fonction pour générer un embedding
async function generateEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function vectorizeExistingCg() {
  try {
    console.log('📊 Récupération des CG existantes...\n');
    
    const result = await pool.query(`
      SELECT id, insurer, product_name, document_url, 
             CASE WHEN embedding IS NOT NULL THEN 'OUI' ELSE 'NON' END as has_embedding
      FROM central_cg
    `);
    
    console.log(`Trouvé ${result.rows.length} CG(s)\n`);
    
    for (const cg of result.rows) {
      console.log(`\n🔄 Traitement: ${cg.insurer} - ${cg.product_name}`);
      console.log(`   URL: ${cg.document_url}`);
      console.log(`   Embedding existant: ${cg.has_embedding}`);
      
      if (cg.has_embedding === 'OUI') {
        console.log('   ⏭️  Déjà vectorisé, passage au suivant');
        continue;
      }
      
      try {
        // Télécharger le PDF
        console.log('   📥 Téléchargement du PDF...');
        const response = await fetch(cg.document_url, { agent: httpsAgent });
        if (!response.ok) {
          console.error(`   ❌ Erreur HTTP: ${response.status}`);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
        
        // Extraire le texte
        console.log('   📄 Extraction du texte...');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const extractResult = await model.generateContent([
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64
            }
          },
          "Extrais tout le texte de ce document PDF en français, mot pour mot, sans résumé."
        ]);
        
        const pdfText = extractResult.response.text();
        console.log(`   ✅ Texte extrait: ${pdfText.length} caractères`);
        
        // Générer l'embedding
        console.log('   🧮 Génération de l\'embedding...');
        const embedding = await generateEmbedding(pdfText);
        console.log(`   ✅ Embedding généré: ${embedding.length} dimensions`);
        
        // Sauvegarder
        await pool.query(
          `UPDATE central_cg 
           SET content_text = $1, embedding = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [pdfText, JSON.stringify(embedding), cg.id]
        );
        
        console.log(`   ✅ CG ${cg.id} vectorisée avec succès!`);
        
      } catch (err) {
        console.error(`   ❌ Erreur pour CG ${cg.id}:`, err.message);
      }
    }
    
    console.log('\n\n🎉 Vectorisation terminée!');
    
    // Vérification finale
    const finalCheck = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM central_cg
    `);
    
    const stats = finalCheck.rows[0];
    console.log(`\n📊 Statistiques finales:`);
    console.log(`   Total CG: ${stats.total}`);
    console.log(`   Avec embedding: ${stats.with_embedding}`);
    console.log(`   Sans embedding: ${stats.without_embedding}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

vectorizeExistingCg();
