const https = require('https');

// Désactiver vérification SSL pour Let's Encrypt
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('🔍 DIAGNOSTIC Backend biencouvert.fr (ANCIEN CODE)\n');
console.log('=' .repeat(60));

// Test 1: Health check
function testHealth() {
  return new Promise((resolve) => {
    console.log('\n1️⃣  Test GET / (health check)...');
    
    const req = https.request({
      hostname: 'biencouvert.fr',
      path: '/',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Backend répond');
          console.log('   📊 Response:', body);
        } else {
          console.log('   ⚠️  Status inattendu');
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

    req.end();
  });
}

// Test 2: Register avec données valides
function testRegister() {
  return new Promise((resolve) => {
    console.log('\n2️⃣  Test POST /api/auth/register...');
    
    const testEmail = `test${Date.now()}@test.com`;
    const data = JSON.stringify({
      email: testEmail,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    });

    const req = https.request({
      hostname: 'biencouvert.fr',
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Origin': 'https://biencouvert.fr'
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        console.log(`   📋 Headers:`, JSON.stringify(res.headers, null, 2));
        console.log(`   📊 Response:`, body.substring(0, 1000));
        
        if (res.statusCode === 500) {
          console.log('   ❌ ERREUR 500 - Regarder détails ci-dessus');
        } else if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('   ✅ Register fonctionne !');
        } else if (res.statusCode === 400) {
          console.log('   ⚠️  Validation échouée');
        }
        
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur connexion:', err.message);
      resolve(null);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout (10s)');
      req.destroy();
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

// Test 3: CORS Preflight (OPTIONS)
function testCORS() {
  return new Promise((resolve) => {
    console.log('\n3️⃣  Test OPTIONS /api/auth/register (CORS preflight)...');
    
    const req = https.request({
      hostname: 'biencouvert.fr',
      path: '/api/auth/register',
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://biencouvert.fr',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      },
      timeout: 5000
    }, (res) => {
      console.log(`   📡 Status: ${res.statusCode}`);
      console.log('   📋 CORS Headers:');
      console.log('      Allow-Origin:', res.headers['access-control-allow-origin'] || '❌ ABSENT');
      console.log('      Allow-Methods:', res.headers['access-control-allow-methods'] || '❌ ABSENT');
      console.log('      Allow-Headers:', res.headers['access-control-allow-headers'] || '❌ ABSENT');
      
      resolve(res.headers);
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

// Test 4: Login avec compte existant
function testLogin() {
  return new Promise((resolve) => {
    console.log('\n4️⃣  Test POST /api/auth/login...');
    
    const data = JSON.stringify({
      email: 'remi@test.com',
      password: 'test123'
    });

    const req = https.request({
      hostname: 'biencouvert.fr',
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Login fonctionne');
        } else {
          console.log('   📊 Response:', body.substring(0, 300));
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

// Résumé et recommandations
function printSummary(results) {
  console.log('\n' + '=' .repeat(60));
  console.log('📊 DIAGNOSTIC RÉSUMÉ\n');
  
  console.log('Health Check:', results.health ? '✅' : '❌');
  console.log('Register:', results.register?.status === 500 ? '❌ ERREUR 500' : results.register?.status || 'N/A');
  console.log('CORS:', results.cors?.['access-control-allow-origin'] ? '✅' : '❌');
  console.log('Login:', results.login ? '✅' : '⚠️');
  
  console.log('\n🔧 CAUSES POSSIBLES ERREUR 500:\n');
  
  if (results.register?.body) {
    console.log('1. Message d\'erreur du backend:');
    try {
      const json = JSON.parse(results.register.body);
      console.log('   ', json.message || json.error || 'Pas de message');
    } catch (e) {
      console.log('   ', results.register.body.substring(0, 200));
    }
    console.log('');
  }
  
  console.log('2. Problèmes potentiels:');
  console.log('   - Connexion PostgreSQL échouée');
  console.log('   - Variable d\'environnement manquante sur VM');
  console.log('   - CORS mal configuré pour HTTPS');
  console.log('   - Backend pas redémarré après changement HTTPS');
  console.log('');
  
  console.log('3. Actions à faire sur VM:');
  console.log('   ssh azureuser@52.143.159.51');
  console.log('   pm2 logs backend --lines 100');
  console.log('   pm2 restart backend');
  console.log('');
  
  console.log('4. Vérifier variables .env sur VM:');
  console.log('   cat /home/azureuser/AssurClair/BackEnd/.env');
  console.log('   FRONTEND_ORIGIN doit inclure: https://biencouvert.fr');
  console.log('');
  
  console.log('=' .repeat(60));
}

// Exécution
async function runDiagnostic() {
  const results = {};
  
  results.health = await testHealth();
  results.register = await testRegister();
  results.cors = await testCORS();
  results.login = await testLogin();
  
  printSummary(results);
}

runDiagnostic().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
