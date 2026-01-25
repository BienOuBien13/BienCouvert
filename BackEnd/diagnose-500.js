const https = require('https');

const DOMAIN = 'biencouvert.fr';

console.log('🔍 DIAGNOSTIC ERREUR 500 /api/auth/register\n');
console.log('=' .repeat(60));

// Test 1: Register SANS token CSRF (attendu: erreur)
function testRegisterWithoutCSRF() {
  return new Promise((resolve) => {
    console.log('\n1️⃣  Test Register SANS token CSRF...');
    
    const data = JSON.stringify({
      email: `test${Date.now()}@test.com`,
      password: 'TestPassword123!@#'
    });

    const req = https.request({
      hostname: DOMAIN,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        console.log(`   📋 Response:`, body.substring(0, 500));
        
        if (res.statusCode === 403) {
          console.log('   ✅ CSRF fonctionne (403 attendu sans token)');
        } else if (res.statusCode === 500) {
          console.log('   ❌ ERREUR 500 - Problème serveur backend');
        }
        resolve(res.statusCode);
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur:', err.message);
      resolve(null);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout');
      req.destroy();
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

// Test 2: Récupérer token CSRF
function getCSRFToken() {
  return new Promise((resolve) => {
    console.log('\n2️⃣  Test GET /api/csrf-token...');
    
    const req = https.request({
      hostname: DOMAIN,
      path: '/api/csrf-token',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(body);
            console.log('   ✅ Token CSRF récupéré');
            console.log('   🔑 Token:', json.csrfToken?.substring(0, 20) + '...');
            resolve(json.csrfToken);
          } catch (e) {
            console.log('   ❌ Erreur parsing JSON:', body);
            resolve(null);
          }
        } else {
          console.log('   ❌ Erreur:', body);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur:', err.message);
      resolve(null);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout');
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// Test 3: Register AVEC token CSRF
function testRegisterWithCSRF(csrfToken) {
  return new Promise((resolve) => {
    console.log('\n3️⃣  Test Register AVEC token CSRF...');
    
    if (!csrfToken) {
      console.log('   ⚠️  Pas de token CSRF, skip test');
      resolve(null);
      return;
    }
    
    const data = JSON.stringify({
      email: `test${Date.now()}@test.com`,
      password: 'TestPassword123!@#'
    });

    const req = https.request({
      hostname: DOMAIN,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-CSRF-Token': csrfToken
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        console.log(`   📋 Response:`, body.substring(0, 500));
        
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('   ✅ Register fonctionne avec CSRF token !');
        } else if (res.statusCode === 400) {
          console.log('   ⚠️  Erreur 400 - Vérifier validation inputs');
        } else if (res.statusCode === 500) {
          console.log('   ❌ ERREUR 500 - Problème backend persistant');
        }
        resolve(res.statusCode);
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur:', err.message);
      resolve(null);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout');
      req.destroy();
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

// Résumé
function printSummary(results) {
  console.log('\n' + '=' .repeat(60));
  console.log('📊 DIAGNOSTIC RÉSUMÉ\n');
  
  if (results.withoutCSRF === 403) {
    console.log('✅ Protection CSRF active (403 sans token)');
  } else if (results.withoutCSRF === 500) {
    console.log('❌ Erreur 500 même sans CSRF → Problème backend');
  }
  
  if (results.csrfToken) {
    console.log('✅ Route /api/csrf-token fonctionne');
  } else {
    console.log('❌ Route /api/csrf-token ne répond pas');
  }
  
  if (results.withCSRF === 200 || results.withCSRF === 201) {
    console.log('✅ Register fonctionne avec token CSRF');
  } else if (results.withCSRF === 500) {
    console.log('❌ Register échoue même avec token CSRF');
  }
  
  console.log('\n🔧 ACTIONS RECOMMANDÉES:\n');
  
  if (results.withoutCSRF === 500) {
    console.log('1. Vérifier logs backend:');
    console.log('   ssh azureuser@52.143.159.51');
    console.log('   pm2 logs backend --lines 100');
    console.log('');
    console.log('2. Vérifier que backend a redémarré après changements:');
    console.log('   pm2 restart backend');
    console.log('');
  }
  
  if (!results.csrfToken) {
    console.log('3. Route /api/csrf-token non accessible');
    console.log('   → Vérifier que le backend a bien compilé');
    console.log('');
  }
  
  if (results.withCSRF === 500) {
    console.log('4. Problème validation ou base de données');
    console.log('   → Vérifier PostgreSQL: psql -h 52.143.159.51 -U remijolivalt -d assurclair');
    console.log('');
  }
  
  console.log('=' .repeat(60));
}

// Exécution
async function runDiagnostic() {
  const results = {};
  
  results.withoutCSRF = await testRegisterWithoutCSRF();
  results.csrfToken = await getCSRFToken();
  results.withCSRF = await testRegisterWithCSRF(results.csrfToken);
  
  printSummary(results);
}

runDiagnostic().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
