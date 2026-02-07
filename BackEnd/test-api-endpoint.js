// Test direct de l'endpoint backend
const fetch = require('node-fetch');
const https = require('https');

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function testEndpoint() {
  try {
    console.log('Test 1: GET /api/cg/central/by-type-and-insurer');
    const url = 'https://52.143.159.51/api/cg/central/by-type-and-insurer?insurance_type_code=AUTO&insurer_code=MAA01';
    console.log('URL:', url);
    
    const response = await fetch(url, { agent });
    const text = await response.text();
    
    console.log('Status:', response.status);
    console.log('Response:', text);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log('\nData parsed:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Erreur:', error.message);
  }
}

testEndpoint();
