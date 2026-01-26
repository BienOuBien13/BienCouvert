const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ Error: GEMINI_API_KEY must be set in environment or .env file');
  process.exit(1);
}

const ai = new GoogleGenerativeAI(apiKey);

async function checkApiKey() {
  console.log('🔍 Vérification détaillée de votre clé API Gemini\n');
  console.log('🔑 Clé:', apiKey.substring(0, 20) + '...\n');

  const modelsToTest = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-1.0-pro'
  ];

  console.log('📋 Test des modèles:\n');

  for (const name of modelsToTest) {
    try {
      const model = ai.getGenerativeModel({ model: name });
      
      const result = await model.generateContent('Réponds juste "OK"');
      const response = await result.response;
      
      console.log(`✅ ${name}: FONCTIONNE`);
      console.log(`   Réponse: "${response.text().trim()}"\n`);
      
    } catch (err) {
      console.log(`❌ ${name}: ERREUR`);
      console.log(`   Code: ${err.status || 'N/A'}`);
      console.log(`   Message: ${err.message}`);
      
      // Afficher plus de détails si disponible
      if (err.response) {
        console.log(`   Détails:`, JSON.stringify(err.response, null, 2));
      }
      console.log('');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('\n🔧 Actions à prendre:');
  console.log('1. Vérifiez que votre clé est valide sur https://aistudio.google.com/apikey');
  console.log('2. Si la clé est expirée, créez-en une nouvelle');
  console.log('3. Vérifiez que l\'API Generative Language est activée sur votre projet Google Cloud');
}

checkApiKey();
