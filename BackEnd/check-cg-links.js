const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function checkCgAndPolicies() {
  try {
    await client.connect();
    console.log('🔍 Vérification des CG et liaisons avec policies\n');
    
    // 1. Vérifier les CG dans central_cg
    console.log('1️⃣ CG indexées dans central_cg:');
    console.log('─'.repeat(60));
    const cgResult = await client.query(`
      SELECT 
        id, 
        insurer, 
        insurer_code,
        product_name, 
        type_code,
        (embedding IS NOT NULL) as has_embedding,
        LENGTH(content_text) as content_length
      FROM central_cg
      ORDER BY id
    `);
    
    if (cgResult.rows.length === 0) {
      console.log('❌ Aucune CG trouvée dans central_cg');
    } else {
      console.log(`✅ ${cgResult.rows.length} CG trouvées:`);
      cgResult.rows.forEach(cg => {
        console.log(`   ID ${cg.id}: ${cg.insurer || cg.insurer_code} - ${cg.product_name}`);
        console.log(`      Type: ${cg.type_code || 'N/A'}`);
        console.log(`      Embedding: ${cg.has_embedding ? '✅' : '❌'}`);
        console.log(`      Contenu: ${cg.content_length ? cg.content_length + ' chars' : '❌ vide'}`);
      });
    }
    
    // 2. Vérifier les policies
    console.log('\n2️⃣ Policies avec leur lien CG:');
    console.log('─'.repeat(60));
    const policiesResult = await client.query(`
      SELECT 
        p.id,
        p.insurer,
        p.insurer_code,
        p.type,
        p.type_code,
        p.policy_number,
        p.central_cg_id,
        cg.product_name as cg_product
      FROM policies p
      LEFT JOIN central_cg cg ON p.central_cg_id = cg.id
      ORDER BY p.id
    `);
    
    console.log(`📋 ${policiesResult.rows.length} policies trouvées:`);
    policiesResult.rows.forEach(p => {
      const hasLink = p.central_cg_id !== null;
      console.log(`   Policy ${p.id}: ${p.insurer || p.insurer_code} - ${p.type || p.type_code}`);
      console.log(`      CG liée: ${hasLink ? '✅ ID ' + p.central_cg_id + ' (' + p.cg_product + ')' : '❌ Aucune'}`);
    });
    
    // 3. Statistiques
    console.log('\n3️⃣ Statistiques:');
    console.log('─'.repeat(60));
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_policies,
        COUNT(central_cg_id) as policies_avec_cg,
        COUNT(*) - COUNT(central_cg_id) as policies_sans_cg
      FROM policies
    `);
    
    const stats = statsResult.rows[0];
    console.log(`Total policies: ${stats.total_policies}`);
    console.log(`Avec CG liée: ${stats.policies_avec_cg} (${Math.round(stats.policies_avec_cg / stats.total_policies * 100)}%)`);
    console.log(`Sans CG: ${stats.policies_sans_cg} (${Math.round(stats.policies_sans_cg / stats.total_policies * 100)}%)`);
    
    // 4. Recherche de correspondances potentielles
    console.log('\n4️⃣ Correspondances potentielles non liées:');
    console.log('─'.repeat(60));
    const matchResult = await client.query(`
      SELECT 
        p.id as policy_id,
        p.insurer as p_insurer,
        p.type as p_type,
        cg.id as cg_id,
        cg.insurer as cg_insurer,
        cg.product_name
      FROM policies p
      CROSS JOIN central_cg cg
      WHERE p.central_cg_id IS NULL
        AND (
          LOWER(p.insurer) = LOWER(cg.insurer) 
          OR p.insurer_code = cg.insurer_code
        )
    `);
    
    if (matchResult.rows.length > 0) {
      console.log(`⚠️  ${matchResult.rows.length} correspondances potentielles trouvées:`);
      matchResult.rows.forEach(m => {
        console.log(`   Policy ${m.policy_id} (${m.p_insurer}/${m.p_type}) ↔ CG ${m.cg_id} (${m.cg_insurer}/${m.product_name})`);
      });
    } else {
      console.log('✅ Aucune correspondance non liée');
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await client.end();
    process.exit(1);
  }
}

checkCgAndPolicies();
