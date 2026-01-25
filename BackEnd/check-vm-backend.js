const https = require('https');
const http = require('http');

const VM_IP = '52.143.159.51';
const BACKEND_PORT = 4000;

console.log('🔍 DIAGNOSTIC VM BACKEND - AssurClair\n');
console.log('=' .repeat(60));

// 1. Check si le backend répond
function checkBackendHealth() {
  return new Promise((resolve) => {
    console.log('\n1️⃣  Vérification Backend Health...');
    
    const req = http.request({
      hostname: VM_IP,
      port: BACKEND_PORT,
      path: '/health',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('   ✅ Backend répond (status 200)');
          console.log('   📊 Response:', data);
          resolve(true);
        } else {
          console.log(`   ❌ Backend répond mais status ${res.statusCode}`);
          console.log('   📊 Response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Backend ne répond pas');
      console.log('   🔴 Error:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout (5s)');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// 2. Test la route register avec données valides
function testRegister() {
  return new Promise((resolve) => {
    console.log('\n2️⃣  Test Route /api/auth/register...');
    
    const testData = JSON.stringify({
      firstName: 'Test',
      lastName: 'User',
      email: `test${Date.now()}@test.com`,
      password: 'TestPassword123!',
      profile: 'client'
    });

    const req = http.request({
      hostname: VM_IP,
      port: BACKEND_PORT,
      path: '/api/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData),
        'Origin': 'http://52.143.159.51:8080'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        console.log(`   📋 Headers:`, JSON.stringify(res.headers, null, 2));
        
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log('   ✅ Register fonctionne');
          try {
            const json = JSON.parse(data);
            console.log('   👤 User créé:', json.user?.email);
          } catch (e) {
            console.log('   📊 Response:', data.substring(0, 200));
          }
          resolve(true);
        } else if (res.statusCode === 500) {
          console.log('   ❌ ERREUR 500 - Internal Server Error');
          console.log('   📊 Response:', data);
          resolve(false);
        } else if (res.statusCode === 400) {
          console.log('   ⚠️  Erreur 400 - Données invalides');
          console.log('   📊 Response:', data);
          resolve(false);
        } else {
          console.log('   ⚠️  Status inattendu');
          console.log('   📊 Response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur connexion');
      console.log('   🔴 Error:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout (10s)');
      req.destroy();
      resolve(false);
    });

    req.write(testData);
    req.end();
  });
}

// 3. Test la route login
function testLogin() {
  return new Promise((resolve) => {
    console.log('\n3️⃣  Test Route /api/auth/login...');
    
    const testData = JSON.stringify({
      email: 'remi@test.com',
      password: 'test123'
    });

    const req = http.request({
      hostname: VM_IP,
      port: BACKEND_PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData)
      },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   📡 Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('   ✅ Login fonctionne');
          resolve(true);
        } else {
          console.log(`   ⚠️  Status ${res.statusCode}`);
          console.log('   📊 Response:', data.substring(0, 200));
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout');
      req.destroy();
      resolve(false);
    });

    req.write(testData);
    req.end();
  });
}

// 4. Check CORS headers
function checkCORS() {
  return new Promise((resolve) => {
    console.log('\n4️⃣  Vérification CORS...');
    
    const req = http.request({
      hostname: VM_IP,
      port: BACKEND_PORT,
      path: '/api/auth/login',
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://52.143.159.51:8080',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      },
      timeout: 5000
    }, (res) => {
      console.log(`   📡 Status: ${res.statusCode}`);
      console.log('   📋 CORS Headers:');
      console.log('      Access-Control-Allow-Origin:', res.headers['access-control-allow-origin'] || '❌ ABSENT');
      console.log('      Access-Control-Allow-Methods:', res.headers['access-control-allow-methods'] || '❌ ABSENT');
      console.log('      Access-Control-Allow-Headers:', res.headers['access-control-allow-headers'] || '❌ ABSENT');
      
      if (res.headers['access-control-allow-origin']) {
        console.log('   ✅ CORS configuré');
        resolve(true);
      } else {
        console.log('   ❌ CORS manquant');
        resolve(false);
      }
    });

    req.on('error', (err) => {
      console.log('   ❌ Erreur:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('   ❌ Timeout');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// 5. Résumé et recommandations
function printSummary(results) {
  console.log('\n' + '=' .repeat(60));
  console.log('📊 RÉSUMÉ DES CHECKS\n');
  
  console.log('Backend Health:', results.health ? '✅' : '❌');
  console.log('Route Register:', results.register ? '✅' : '❌');
  console.log('Route Login:   ', results.login ? '✅' : '❌');
  console.log('CORS:          ', results.cors ? '✅' : '❌');
  
  console.log('\n🔧 ACTIONS À FAIRE SUR LA VM:\n');
  
  if (!results.health) {
    console.log('1. Vérifier si le backend tourne:');
    console.log('   ssh azureuser@52.143.159.51');
    console.log('   pm2 list');
    console.log('   pm2 logs backend');
    console.log('');
  }
  
  if (!results.register) {
    console.log('2. Vérifier les logs backend pour l\'erreur 500:');
    console.log('   pm2 logs backend --lines 50');
    console.log('   Chercher l\'erreur qui se produit dans /api/auth/register');
    console.log('');
  }
  
  console.log('3. Vérifier PostgreSQL:');
  console.log('   psql -h 52.143.159.51 -U remijolivalt -d assurclair');
  console.log('   \\dt  -- Liste les tables');
  console.log('   SELECT * FROM users LIMIT 1;');
  console.log('');
  
  console.log('4. Redémarrer le backend si nécessaire:');
  console.log('   pm2 restart backend');
  console.log('   pm2 logs backend');
  console.log('');
  
  if (!results.cors) {
    console.log('5. Vérifier la configuration CORS dans index.ts');
    console.log('');
  }
  
  console.log('=' .repeat(60));
}

// Exécution des checks
async function runDiagnostics() {
  const results = {
    health: await checkBackendHealth(),
    register: await testRegister(),
    login: await testLogin(),
    cors: await checkCORS()
  };
  
  printSummary(results);
}

runDiagnostics().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
