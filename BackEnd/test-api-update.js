/**
 * Test de l'API PUT /auth/me
 * Teste la mise à jour d'utilisateur via l'API REST
 */

const API_URL = 'http://52.143.159.51';  // Test sur la VM Azure

async function testUpdateUser() {
  try {
    console.log('🔐 Test de l\'API PUT /auth/me\n');

    // 1. Login pour obtenir un token
    console.log('1️⃣ Login...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'az@az.az',
        password: 'az'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    const user = loginData.user;

    console.log('✅ Login réussi');
    console.log('   User:', user);
    console.log('   Token:', token.substring(0, 20) + '...\n');

    // 2. Afficher l'état actuel
    console.log('2️⃣ État actuel de l\'utilisateur:');
    console.log('   ID:', user.id);
    console.log('   Name:', user.name);
    console.log('   Email:', user.email);
    console.log('   Profile:', user.profile);
    console.log('');

    // 3. Tenter une mise à jour du nom
    const newName = `Test Name ${Date.now()}`;
    console.log('3️⃣ Mise à jour du nom...');
    console.log('   Nouveau nom:', newName);
    
    const updateResponse = await fetch(`${API_URL}/api/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newName,
        email: user.email,
        profile: user.profile
      })
    });

    console.log('   Status:', updateResponse.status);

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
    }

    const updateData = await updateResponse.json();
    console.log('✅ Mise à jour réussie');
    console.log('   Réponse:', updateData);
    console.log('');

    // 4. Vérifier avec GET /me
    console.log('4️⃣ Vérification avec GET /auth/me...');
    const getMeResponse = await fetch(`${API_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!getMeResponse.ok) {
      throw new Error(`GET /me failed: ${getMeResponse.status}`);
    }

    const getMeData = await getMeResponse.json();
    console.log('✅ GET /me réussi');
    console.log('   User:', getMeData.user);
    console.log('');

    // 5. Comparaison
    console.log('5️⃣ Comparaison:');
    console.log('   Nom envoyé:', newName);
    console.log('   Nom reçu (UPDATE):', updateData.user.name);
    console.log('   Nom reçu (GET):', getMeData.user.name);
    
    if (getMeData.user.name === newName) {
      console.log('\n✅✅✅ SUCCÈS ! Le nom a bien été mis à jour.');
    } else {
      console.log('\n❌ ÉCHEC ! Le nom n\'a pas été mis à jour.');
      console.log('   Attendu:', newName);
      console.log('   Reçu:', getMeData.user.name);
    }

    // 6. Test de mise à jour du profil
    console.log('\n6️⃣ Test de mise à jour du profil...');
    const newProfile = {
      adultsCount: 3,
      childrenCount: 2,
      testTimestamp: Date.now()
    };

    const profileUpdateResponse = await fetch(`${API_URL}/api/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: newName,
        email: user.email,
        profile: newProfile
      })
    });

    if (!profileUpdateResponse.ok) {
      throw new Error(`Profile update failed: ${profileUpdateResponse.status}`);
    }

    const profileUpdateData = await profileUpdateResponse.json();
    console.log('✅ Profil mis à jour');
    console.log('   Profile envoyé:', newProfile);
    console.log('   Profile reçu:', profileUpdateData.user.profile);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Exécution
console.log('================================================');
console.log('   TEST API - PUT /auth/me');
console.log('================================================\n');
console.log('API URL:', API_URL);
console.log('');

testUpdateUser().catch(console.error);
