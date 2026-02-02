/**
 * Script pour forcer la vectorisation d'une CG existante
 * Usage: node force-vectorize-cg.js <id>
 */

require('dotenv').config();
const { query } = require('./dist/db');
const { storage } = require('./dist/storage');

async function forceVectorize(cgId) {
  try {
    console.log(`🔍 Récupération de la CG ${cgId}...`);
    
    const result = await query(
      'SELECT id, insurer, product_name, document_url, content_text, embedding FROM central_cg WHERE id = $1',
      [cgId]
    );

    if (result.rows.length === 0) {
      console.error(`❌ Aucune CG trouvée avec l'ID ${cgId}`);
      process.exit(1);
    }

    const cg = result.rows[0];
    console.log(`✅ CG trouvée: ${cg.insurer} - ${cg.product_name}`);
    console.log(`   - Content text: ${cg.content_text ? 'Présent' : 'NULL'}`);
    console.log(`   - Embedding: ${cg.embedding ? 'Présent' : 'NULL'}`);
    console.log(`   - Document URL: ${cg.document_url ? cg.document_url.substring(0, 60) + '...' : 'NULL'}`);

    if (!cg.document_url) {
      console.error('❌ Pas de document_url, impossible de vectoriser');
      process.exit(1);
    }

    // Étape 1: Extraire le texte du PDF
    if (!cg.content_text) {
      console.log('\n📄 Extraction du texte du PDF...');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      let pdfBase64;
      if (cg.document_url.startsWith('data:application/pdf;base64,')) {
        pdfBase64 = cg.document_url.split(',')[1];
        console.log('   PDF déjà en base64');
      } else {
        console.log('   Téléchargement depuis URL...');
        const response = await fetch(cg.document_url);
        if (!response.ok) {
          throw new Error(`Échec téléchargement: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        pdfBase64 = Buffer.from(arrayBuffer).toString('base64');
      }

      console.log(`   Taille: ${Math.round(pdfBase64.length / 1024)}KB`);

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        },
        "Extrais tout le texte de ce document PDF en français, mot pour mot, sans résumé."
      ]);

      const pdfText = result.response.text();
      console.log(`✅ Texte extrait: ${pdfText.length} caractères`);

      // Sauvegarder le texte
      await query(
        'UPDATE central_cg SET content_text = $1 WHERE id = $2',
        [pdfText, cgId]
      );
      console.log('✅ Texte sauvegardé en DB');

      cg.content_text = pdfText;
    } else {
      console.log('\n✅ Texte déjà présent, passage à la vectorisation');
    }

    // Étape 2: Vectoriser
    if (!cg.embedding && cg.content_text) {
      console.log('\n🔢 Vectorisation...');
      await storage.vectorizeCentralCg(cgId, cg.content_text);
      console.log('✅ Vectorisation terminée !');
    } else if (cg.embedding) {
      console.log('\n✅ Déjà vectorisé !');
    }

    // Vérifier le résultat final
    const finalResult = await query(
      'SELECT content_text IS NOT NULL as has_text, embedding IS NOT NULL as has_embedding FROM central_cg WHERE id = $1',
      [cgId]
    );

    const final = finalResult.rows[0];
    console.log('\n📊 État final:');
    console.log(`   - Content text: ${final.has_text ? '✅' : '❌'}`);
    console.log(`   - Embedding: ${final.has_embedding ? '✅' : '❌'}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
}

const cgId = process.argv[2];
if (!cgId) {
  console.error('Usage: node force-vectorize-cg.js <id>');
  process.exit(1);
}

console.log('🚀 Forcer la vectorisation de la CG...\n');
forceVectorize(parseInt(cgId));
