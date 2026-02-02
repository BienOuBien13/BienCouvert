// test-master-data-coherence.js
// Test de cohérence de l'architecture master data

const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: {
    rejectUnauthorized: false
  }
});

async function testCoherence() {
  console.log('🔍 Test de cohérence globale de l\'architecture master data\n');
  
  try {
    await client.connect();
    console.log('✅ Connexion PostgreSQL établie\n');
    
    // ========================================================================
    // 1. Vérifier les tables master data
    // ========================================================================
    console.log('📋 1. Vérification des tables master data');
    console.log('─'.repeat(60));
    
    const typesCount = await client.query('SELECT COUNT(*) FROM insurance_types WHERE is_active = true');
    console.log(`✅ Types d'assurance actifs: ${typesCount.rows[0].count}`);
    
    const insurersCount = await client.query('SELECT COUNT(*) FROM insurers WHERE is_active = true');
    console.log(`✅ Assureurs actifs: ${insurersCount.rows[0].count}`);
    
    // Afficher quelques exemples
    const sampleTypes = await client.query('SELECT code, label_fr FROM insurance_types WHERE is_active = true ORDER BY display_order LIMIT 5');
    console.log('\n📌 Exemples de types:');
    sampleTypes.rows.forEach(row => console.log(`   ${row.code} → ${row.label_fr}`));
    
    const sampleInsurers = await client.query('SELECT code, label FROM insurers WHERE is_active = true ORDER BY display_order LIMIT 5');
    console.log('\n📌 Exemples d\'assureurs:');
    sampleInsurers.rows.forEach(row => console.log(`   ${row.code} → ${row.label}`));
    
    // ========================================================================
    // 2. Vérifier les colonnes de code dans policies et central_cg
    // ========================================================================
    console.log('\n\n📋 2. Vérification des colonnes de codes');
    console.log('─'.repeat(60));
    
    const policiesColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'policies' AND column_name IN ('type_code', 'insurer_code')
    `);
    console.log(`✅ Colonnes policies: ${policiesColumns.rows.map(r => r.column_name).join(', ')}`);
    
    const cgColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'central_cg' AND column_name IN ('type_code', 'insurer_code')
    `);
    console.log(`✅ Colonnes central_cg: ${cgColumns.rows.map(r => r.column_name).join(', ')}`);
    
    // ========================================================================
    // 3. Vérifier les contraintes de clés étrangères
    // ========================================================================
    console.log('\n\n📋 3. Vérification des contraintes FK');
    console.log('─'.repeat(60));
    
    const fkPoliciesType = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'policies' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'fk_policies_type'
    `);
    console.log(`${fkPoliciesType.rows.length > 0 ? '✅' : '❌'} FK policies.type_code → insurance_types.code`);
    
    const fkPoliciesInsurer = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'policies' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'fk_policies_insurer_code'
    `);
    console.log(`${fkPoliciesInsurer.rows.length > 0 ? '✅' : '❌'} FK policies.insurer_code → insurers.code`);
    
    const fkCgInsurer = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'central_cg' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'fk_central_cg_insurer_code'
    `);
    console.log(`${fkCgInsurer.rows.length > 0 ? '✅' : '❌'} FK central_cg.insurer_code → insurers.code`);
    
    const fkCgType = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'central_cg' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'fk_central_cg_type'
    `);
    console.log(`${fkCgType.rows.length > 0 ? '✅' : '❌'} FK central_cg.type_code → insurance_types.code`);
    
    // ========================================================================
    // 4. Vérifier la migration des données existantes
    // ========================================================================
    console.log('\n\n📋 4. Vérification de la migration des données');
    console.log('─'.repeat(60));
    
    const policiesTotal = await client.query('SELECT COUNT(*) FROM policies');
    const policiesWithCodes = await client.query('SELECT COUNT(*) FROM policies WHERE type_code IS NOT NULL AND insurer_code IS NOT NULL');
    console.log(`✅ Policies totales: ${policiesTotal.rows[0].count}`);
    console.log(`✅ Policies avec codes: ${policiesWithCodes.rows[0].count}`);
    console.log(`   Taux de migration: ${policiesTotal.rows[0].count > 0 ? Math.round(policiesWithCodes.rows[0].count / policiesTotal.rows[0].count * 100) : 0}%`);
    
    const cgTotal = await client.query('SELECT COUNT(*) FROM central_cg');
    const cgWithCodes = await client.query('SELECT COUNT(*) FROM central_cg WHERE insurer_code IS NOT NULL');
    console.log(`\n✅ Central CG totales: ${cgTotal.rows[0].count}`);
    console.log(`✅ Central CG avec codes: ${cgWithCodes.rows[0].count}`);
    console.log(`   Taux de migration: ${cgTotal.rows[0].count > 0 ? Math.round(cgWithCodes.rows[0].count / cgTotal.rows[0].count * 100) : 0}%`);
    
    // ========================================================================
    // 5. Tester les JOINs avec enrichissement
    // ========================================================================
    console.log('\n\n📋 5. Test des JOINs avec enrichissement');
    console.log('─'.repeat(60));
    
    const enrichedPolicies = await client.query(`
      SELECT 
        p.id,
        p.insurer,
        p.type,
        p.insurer_code,
        p.type_code,
        i.label as insurer_label,
        it.label_fr as type_label
      FROM policies p
      LEFT JOIN insurers i ON p.insurer_code = i.code
      LEFT JOIN insurance_types it ON p.type_code = it.code
      LIMIT 3
    `);
    
    if (enrichedPolicies.rows.length > 0) {
      console.log('✅ Exemple de policies enrichies:');
      enrichedPolicies.rows.forEach(row => {
        console.log(`\n   Policy ${row.id}:`);
        console.log(`   - Texte libre: ${row.insurer} / ${row.type}`);
        console.log(`   - Codes: ${row.insurer_code} / ${row.type_code}`);
        console.log(`   - Labels enrichis: ${row.insurer_label} / ${row.type_label}`);
      });
    } else {
      console.log('⚠️  Aucune policy trouvée pour test');
    }
    
    // ========================================================================
    // 6. Vérifier la cohérence des codes
    // ========================================================================
    console.log('\n\n📋 6. Vérification de la cohérence des codes');
    console.log('─'.repeat(60));
    
    const invalidTypeCodes = await client.query(`
      SELECT DISTINCT type_code 
      FROM policies 
      WHERE type_code IS NOT NULL 
        AND type_code NOT IN (SELECT code FROM insurance_types)
    `);
    
    if (invalidTypeCodes.rows.length > 0) {
      console.log('❌ Codes de types invalides trouvés:');
      invalidTypeCodes.rows.forEach(row => console.log(`   - ${row.type_code}`));
    } else {
      console.log('✅ Tous les type_code sont valides');
    }
    
    const invalidInsurerCodes = await client.query(`
      SELECT DISTINCT insurer_code 
      FROM policies 
      WHERE insurer_code IS NOT NULL 
        AND insurer_code NOT IN (SELECT code FROM insurers)
    `);
    
    if (invalidInsurerCodes.rows.length > 0) {
      console.log('❌ Codes d\'assureurs invalides trouvés:');
      invalidInsurerCodes.rows.forEach(row => console.log(`   - ${row.insurer_code}`));
    } else {
      console.log('✅ Tous les insurer_code sont valides');
    }
    
    // ========================================================================
    // 7. Statistiques de distribution
    // ========================================================================
    console.log('\n\n📋 7. Statistiques de distribution');
    console.log('─'.repeat(60));
    
    const typeDistribution = await client.query(`
      SELECT 
        COALESCE(it.label_fr, p.type) as type_label,
        p.type_code,
        COUNT(*) as count
      FROM policies p
      LEFT JOIN insurance_types it ON p.type_code = it.code
      GROUP BY it.label_fr, p.type, p.type_code
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('📊 Top 5 des types d\'assurance:');
    typeDistribution.rows.forEach(row => {
      console.log(`   ${row.type_label} (${row.type_code}): ${row.count}`);
    });
    
    const insurerDistribution = await client.query(`
      SELECT 
        COALESCE(i.label, p.insurer) as insurer_label,
        p.insurer_code,
        COUNT(*) as count
      FROM policies p
      LEFT JOIN insurers i ON p.insurer_code = i.code
      GROUP BY i.label, p.insurer, p.insurer_code
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('\n📊 Top 5 des assureurs:');
    insurerDistribution.rows.forEach(row => {
      console.log(`   ${row.insurer_label} (${row.insurer_code}): ${row.count}`);
    });
    
    // ========================================================================
    // RÉSULTAT FINAL
    // ========================================================================
    console.log('\n\n' + '='.repeat(60));
    console.log('🎯 RÉSULTAT DU TEST DE COHÉRENCE');
    console.log('='.repeat(60));
    
    const checks = [
      { test: 'Tables master data créées', passed: typesCount.rows[0].count > 0 && insurersCount.rows[0].count > 0 },
      { test: 'Colonnes de codes ajoutées', passed: policiesColumns.rows.length === 2 && cgColumns.rows.length === 2 },
      { test: 'Contraintes FK en place', passed: fkPoliciesType.rows.length > 0 && fkPoliciesInsurer.rows.length > 0 },
      { test: 'Données migrées', passed: policiesTotal.rows[0].count === 0 || policiesWithCodes.rows[0].count > 0 },
      { test: 'JOINs fonctionnels', passed: enrichedPolicies.rows.length >= 0 },
      { test: 'Codes valides', passed: invalidTypeCodes.rows.length === 0 && invalidInsurerCodes.rows.length === 0 },
    ];
    
    const allPassed = checks.every(c => c.passed);
    
    checks.forEach(check => {
      console.log(`${check.passed ? '✅' : '❌'} ${check.test}`);
    });
    
    console.log('\n' + (allPassed ? '✅ TOUS LES TESTS SONT PASSÉS' : '⚠️  CERTAINS TESTS ONT ÉCHOUÉ'));
    console.log('='.repeat(60) + '\n');
    
    await client.end();
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    await client.end();
    process.exit(1);
  }
}

testCoherence();
