const f = require('node-fetch');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const key = process.env.GEMINI_API_KEY;
const agent = new https.Agent({ rejectUnauthorized: false });

(async () => {
  console.log('API Key:', key ? key.slice(0, 10) + '...' : 'MANQUANTE');
  console.log('');

  // Lister tous les modèles disponibles pour cette clé
  for (const ver of ['v1', 'v1beta']) {
    const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${key}`;
    try {
      const r = await f(url, { agent });
      const data = await r.json();
      const models = data.models || [];
      const embedModels = models.filter(m =>
        (m.supportedGenerationMethods || []).includes('embedContent')
      );
      console.log(`=== ${ver} : ${models.length} modèles total, ${embedModels.length} supportent embedContent ===`);
      embedModels.forEach(m => console.log(' -', m.name));
      if (embedModels.length === 0) {
        console.log('  (aucun modèle embedding disponible)');
        // Afficher tous les modèles pour référence
        models.forEach(m => console.log('  [all]', m.name, m.supportedGenerationMethods?.join(',')));
      }
    } catch (e) {
      console.log(`[${ver}] listModels ERREUR:`, e.message);
    }
  }
})();
