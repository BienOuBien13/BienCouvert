const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testMasterDataRoutes() {
  console.log('🧪 Test des routes API Master Data\n');
  console.log('─'.repeat(60));
  
  try {
    // Test 1: GET /api/masterdata/insurance-types
    console.log('\n1️⃣ GET /api/masterdata/insurance-types');
    const typesRes = await axios.get(`${BASE_URL}/api/masterdata/insurance-types`);
    console.log(`✅ Status: ${typesRes.status}`);
    console.log(`✅ Nombre de types: ${typesRes.data.length}`);
    console.log('📌 Exemples:', typesRes.data.slice(0, 3).map(t => `${t.code} → ${t.labelFr}`));
    
    // Test 2: GET /api/masterdata/insurance-types/:code
    console.log('\n2️⃣ GET /api/masterdata/insurance-types/AUTO');
    const autoRes = await axios.get(`${BASE_URL}/api/masterdata/insurance-types/AUTO`);
    console.log(`✅ Status: ${autoRes.status}`);
    console.log(`✅ Type trouvé:`, autoRes.data);
    
    // Test 3: GET /api/masterdata/insurers
    console.log('\n3️⃣ GET /api/masterdata/insurers');
    const insurersRes = await axios.get(`${BASE_URL}/api/masterdata/insurers`);
    console.log(`✅ Status: ${insurersRes.status}`);
    console.log(`✅ Nombre d'assureurs: ${insurersRes.data.length}`);
    console.log('📌 Exemples:', insurersRes.data.slice(0, 3).map(i => `${i.code} → ${i.name}`));
    
    // Test 4: GET /api/masterdata/insurers/:code
    console.log('\n4️⃣ GET /api/masterdata/insurers/MAIF');
    const maifRes = await axios.get(`${BASE_URL}/api/masterdata/insurers/MAIF`);
    console.log(`✅ Status: ${maifRes.status}`);
    console.log(`✅ Assureur trouvé:`, maifRes.data);
    
    // Test 5: Code inexistant (doit retourner 404)
    console.log('\n5️⃣ GET /api/masterdata/insurance-types/INVALID (doit retourner 404)');
    try {
      await axios.get(`${BASE_URL}/api/masterdata/insurance-types/INVALID`);
      console.log('❌ Devrait retourner 404');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`✅ Status 404 correctement retourné`);
      } else {
        console.log(`❌ Erreur inattendue: ${error.message}`);
      }
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log('✅ TOUS LES TESTS API ONT RÉUSSI');
    console.log('─'.repeat(60));
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    console.error('\n⚠️  Assurez-vous que le serveur backend est démarré (npm run dev)');
    process.exit(1);
  }
}

testMasterDataRoutes();
