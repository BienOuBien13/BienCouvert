const f = require('node-fetch');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.production') });

const key = process.env.GEMINI_API_KEY;
const agent = new https.Agent({ rejectUnauthorized: false });

const models = [
  'text-embedding-004',
  'text-multilingual-embedding-002',
  'gemini-embedding-exp-03-07',
];

(async () => {
  console.log('API Key:', key ? key.slice(0, 10) + '...' : 'MANQUANTE');
  console.log('');

  for (const m of models) {
    for (const ver of ['v1', 'v1beta']) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:embedContent?key=${key}`.replace('v1beta', ver);
      try {
        const r = await f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text: 'test' }] } }),
          agent,
        });
        const body = await r.text();
        const preview = body.slice(0, 120).replace(/\n/g, ' ');
        console.log(`[${ver}] ${m}: HTTP ${r.status} → ${preview}`);
      } catch (e) {
        console.log(`[${ver}] ${m}: ERREUR RESEAU → ${e.message}`);
      }
    }
  }
})();
