// Test de l'API GET /api/policies
const { query } = require('./dist/db');

async function testReadPolicies() {
  console.log('🧪 Test readPolicies depuis storage.ts...\n');
  
  try {
    // Simulation de la fonction readPolicies
    const userId = 50;
    let queryText = `
      SELECT 
        p.*,
        it.label_fr as type_label,
        i.label as insurer_label,
        i.logo_url as insurer_logo
      FROM policies p
      LEFT JOIN insurance_types it ON p.insurance_type_code = it.code
      LEFT JOIN insurers i ON p.insurer_code = i.code
    `;
    const params = [];
    
    if (userId) {
      queryText += ' WHERE p.user_id = $1';
      params.push(userId);
    }
    
    queryText += ' ORDER BY p.created_at DESC';
    
    console.log('📝 Requête SQL:', queryText);
    console.log('📝 Paramètres:', params);
    
    const result = await query(queryText, params);
    console.log(`\n✅ Nombre de résultats: ${result.rows.length}\n`);
    
    // Mapper les résultats comme dans storage.ts
    const policies = result.rows.map(row => {
      const metadata = row.metadata || {};
      return {
        id: row.id.toString(),
        userId: row.user_id.toString(),
        name: metadata.name || 'Contrat sans nom',
        insurer: row.insurer_label || 'Non spécifié',
        insurerCode: row.insurer_code,
        insurerLogo: row.insurer_logo,
        type: row.type_label || 'Autre',
        typeCode: row.insurance_type_code,
        formula: metadata.formula || null,
        options: metadata.options || [],
        premium: metadata.premium ? parseFloat(metadata.premium) : null,
        coverage: metadata.coverage ? parseFloat(metadata.coverage) : null,
        sourceUrl: row.document_url || null,
        summary: metadata.summary || null,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        centralCgId: row.central_cg_id,
        userCgId: row.user_cg_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
    
    console.log('📦 Policies mappées:');
    policies.forEach((p, idx) => {
      console.log(`\n${idx + 1}. Policy ID: ${p.id}`);
      console.log(`   Name: ${p.name}`);
      console.log(`   Insurer: ${p.insurer} (${p.insurerCode})`);
      console.log(`   Type: ${p.type} (${p.typeCode})`);
      console.log(`   Formula: ${p.formula}`);
      console.log(`   Options: ${p.options.join(', ')}`);
      console.log(`   CentralCgId: ${p.centralCgId}`);
      console.log(`   Status: ${p.status}`);
    });
    
    console.log('\n✅ Test réussi! Les policies sont correctement mappées.');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
  
  process.exit(0);
}

testReadPolicies();
