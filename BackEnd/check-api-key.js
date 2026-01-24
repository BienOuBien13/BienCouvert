const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = 'AIzaSyAXg17dXuPMN4RfDWBRNDyQ-lrcKoKOjso';
const ai = new GoogleGenerativeAI(apiKey);

async function checkApiKey() {
  console.log('🔍 Vérification de votre clé API Gemini\n');
  console.log('🔑 Clé:', apiKey.substring(0, 20) + '...\n');

  const modelsToTest = [
    { name: 'gemini-2.5-flash', quota: '20 requêtes/jour' },
    { name: 'gemini-1.5-flash', quota: '1,500 requêtes/jour' },
    { name: 'gemini-1.5-pro', quota: '50 requêtes/jour' }
  ];

  console.log('📋 Test des modèles disponibles:\n');

  for (const { name, quota } of modelsToTest) {
    try {
      const model = ai.getGenerativeModel({ model: name });
      
      const result = await model.generateContent('Réponds juste "OK"');
      const response = await result.response;
      
      console.log(`✅ ${name}`);
      console.log(`   Statut: DISPONIBLE`);
      console.log(`   Quota gratuit: ${quota}`);
      console.log(`   Réponse: "${response.text().trim()}"\n`);
      
    } catch (err) {
      if (err.message.includes('429')) {
        console.log(`⚠️  ${name}`);
        console.log(`   Statut: QUOTA DÉPASSÉ`);
        console.log(`   Message: Limite de ${quota} atteinte\n`);
      } else if (err.message.includes('404') || err.message.includes('models/')) {
        console.log(`❌ ${name}`);
        console.log(`   Statut: NON DISPONIBLE avec cette clé API\n`);
      } else if (err.message.includes('403')) {
        console.log(`🔒 ${name}`);
        console.log(`   Statut: ACCÈS REFUSÉ\n`);
      } else {
        console.log(`❌ ${name}`);
        console.log(`   Erreur: ${err.message}\n`);
      }
    }
    
    // Pause entre requêtes pour éviter rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n📚 Pour gérer vos quotas:');
  console.log('   🔗 https://aistudio.google.com/apikey');
  console.log('   🔗 https://ai.google.dev/pricing');
}

checkApiKey();
