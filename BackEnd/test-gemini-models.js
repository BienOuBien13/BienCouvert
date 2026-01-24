const { GoogleGenerativeAI } = require('@google/generative-ai');

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAXg17dXuPMN4RfDWBRNDyQ-lrcKoKOjso');

async function testModels() {
  console.log('🔑 Clé API utilisée:', process.env.GEMINI_API_KEY ? 'depuis .env' : 'hardcodée');
  console.log('\n📋 Test des différents modèles Gemini:\n');

  const modelsToTest = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-1.0-pro'
  ];

  for (const modelName of modelsToTest) {
    try {
      console.log(`\n🧪 Test ${modelName}...`);
      const model = ai.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent('Réponds juste "OK" si tu fonctionnes');
      const response = await result.response;
      const text = response.text();
      
      console.log(`  ✅ ${modelName} fonctionne !`);
      console.log(`  📝 Réponse: "${text.trim()}"`);
      
    } catch (err) {
      if (err.message.includes('429')) {
        console.log(`  ⚠️  ${modelName}: Quota dépassé (20 requêtes/jour atteintes)`);
      } else if (err.message.includes('404')) {
        console.log(`  ❌ ${modelName}: Modèle non disponible avec cette clé API`);
      } else if (err.message.includes('403')) {
        console.log(`  🔒 ${modelName}: Accès refusé (clé API invalide ou modèle non autorisé)`);
      } else {
        console.log(`  ❌ ${modelName}: ${err.message}`);
      }
    }
  }

  console.log('\n\n📊 Résumé:');
  console.log('Pour vérifier vos quotas et modèles autorisés:');
  console.log('  🔗 https://aistudio.google.com/apikey');
  console.log('  🔗 https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com');
}

testModels().catch(console.error);
