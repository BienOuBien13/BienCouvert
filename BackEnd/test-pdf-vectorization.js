const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const GEMINI_API_KEY = 'AIzaSyCPV3dky8oIny2ZYClo6lOi4V-BIlYvaqY';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function testPDFVectorization() {
  const pdfUrl = "https://www.maif.fr/content/documents/public/maif-fr/pdf/services-en-ligne/devis/raqvam/conditionsGeneralesRAQVAM.pdf";
  
  console.log('🚀 Test de vectorisation PDF\n');
  console.log(`📄 URL: ${pdfUrl}\n`);
  
  try {
    // 1. Télécharger le PDF
    console.log('⏳ Téléchargement du PDF...');
    const response = await fetch(pdfUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const sizeKB = (buffer.byteLength / 1024).toFixed(2);
    console.log(`✅ PDF téléchargé: ${sizeKB} KB\n`);
    
    // 2. Convertir en base64
    console.log('⏳ Conversion en base64...');
    const base64 = Buffer.from(buffer).toString('base64');
    console.log(`✅ Base64 créé: ${base64.length} caractères\n`);
    
    // 3. Extraire le texte avec Gemini
    console.log('⏳ Extraction du texte avec Gemini (cela peut prendre 30-60s)...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: 'application/pdf'
        }
      },
      `Extrait le contenu complet de ce document PDF.
      Liste toutes les formules d'assurance et options mentionnées.
      Donne un résumé structuré.`
    ]);
    
    const text = result.response.text();
    console.log(`✅ Texte extrait: ${text.length} caractères\n`);
    console.log('📄 APERÇU DU CONTENU:\n');
    console.log(text.substring(0, 1000) + '...\n');
    
    // 4. Générer l'embedding
    console.log('⏳ Génération de l\'embedding vectoriel...');
    const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const truncatedText = text.substring(0, 10000);
    const embedResult = await embedModel.embedContent(truncatedText);
    const embedding = embedResult.embedding.values;
    
    console.log(`✅ Embedding généré: ${embedding.length} dimensions`);
    console.log(`   Exemple: [${embedding.slice(0, 5).join(', ')}...]\n`);
    
    console.log('🎉 TEST RÉUSSI!\n');
    console.log('Le PDF peut être vectorisé avec succès.');
    console.log('Pour sauvegarder dans la base, utilisez:');
    console.log(`node vectorize-pdf.js "MAIF" "Auto RAQVAM" "auto" "${pdfUrl}"`);
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

testPDFVectorization();
