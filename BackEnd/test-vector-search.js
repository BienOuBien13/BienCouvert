const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function testVectorSearch() {
  try {
    await client.connect();
    console.log('🧪 TEST DE RECHERCHE VECTORIELLE\n');
    
    // Test 1: Vérifier qu'un embedding existe
    const embeddingCheck = await client.query(`
      SELECT 
        id, 
        insurer, 
        product_name,
        (embedding IS NOT NULL) as has_embedding
      FROM central_cg 
      WHERE id = 94
    `);
    
    console.log('1️⃣  Vérification de l\'embedding CG 94:');
    const cg = embeddingCheck.rows[0];
    console.log(`   Embedding présent: ${cg.has_embedding ? '✅' : '❌'}`);
    console.log(`   ${cg.insurer} - ${cg.product_name}\n`);
    
    // Test 2: Recherche avec un vecteur de zéros (mode dégradé Zscaler)
    console.log('2️⃣  Test avec vecteur zéro (mode dégradé):');
    const zeroVector = new Array(768).fill(0);
    const zeroResult = await client.query(`
      SELECT 
        id,
        insurer,
        product_name,
        1 - (embedding <=> $1::vector) as similarity
      FROM central_cg
      WHERE embedding IS NOT NULL
        AND insurer = 'MAIF'
      ORDER BY embedding <=> $1::vector
      LIMIT 3
    `, [JSON.stringify(zeroVector)]);
    
    if (zeroResult.rows.length > 0) {
      console.log(`   ✅ ${zeroResult.rows.length} résultats:`);
      zeroResult.rows.forEach(r => {
        console.log(`      ${r.insurer} - ${r.product_name}: similarité = ${r.similarity.toFixed(4)}`);
      });
    } else {
      console.log('   ❌ Aucun résultat');
    }
    
    // Test 3: Recherche simple sans filtre assureur
    console.log('\n3️⃣  Test SANS filtre assureur:');
    const noFilterResult = await client.query(`
      SELECT 
        id,
        insurer,
        product_name,
        1 - (embedding <=> $1::vector) as similarity
      FROM central_cg
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 3
    `, [JSON.stringify(zeroVector)]);
    
    if (noFilterResult.rows.length > 0) {
      console.log(`   ✅ ${noFilterResult.rows.length} résultats:`);
      noFilterResult.rows.forEach(r => {
        console.log(`      ${r.insurer} - ${r.product_name}: similarité = ${r.similarity.toFixed(4)}`);
      });
    }
    
    // Test 4: Que se passe-t-il si l'embedding de la question est NULL ?
    console.log('\n4️⃣  Impact du vecteur zéro:');
    if (zeroResult.rows.length > 0 && zeroResult.rows[0].similarity < 0.7) {
      console.log(`   ⚠️  PROBLÈME IDENTIFIÉ:`);
      console.log(`   La similarité avec vecteur zéro est ${zeroResult.rows[0].similarity.toFixed(4)} < 0.7`);
      console.log(`   → Le code de geminiService rejette les résultats < 0.7`);
      console.log(`   → Zscaler bloque l'embedding, donc vecteur = [0,0,0...]`);
      console.log(`   → La recherche vectorielle échoue silencieusement\n`);
      console.log('   💡 SOLUTION:');
      console.log('   - Soit désactiver Zscaler temporairement');
      console.log('   - Soit baisser le seuil de similarité de 0.7 à 0.0');
      console.log('   - Soit utiliser un fallback sur le texte si embedding échoue');
    } else {
      console.log('   ✅ La similarité est acceptable');
    }
    
    // Test 5: Vérifier le code exact de searchCentralCg
    console.log('\n5️⃣  Simulation du code backend searchCentralCg:');
    const insurers = ['MAIF'];
    const questionEmbedding = zeroVector;
    
    let queryText = `
      SELECT 
        cg.insurer,
        cg.product_name, 
        cg.content_text,
        COALESCE(i.name, cg.insurer) as insurer_label,
        COALESCE(it.label_fr, cg.metadata->>'type') as type,
        1 - (cg.embedding <=> $1::vector) as similarity
      FROM central_cg cg
      LEFT JOIN insurers i ON cg.insurer_code = i.code
      LEFT JOIN insurance_types it ON cg.type_code = it.code
      WHERE cg.embedding IS NOT NULL
        AND (cg.insurer = ANY($2) OR cg.insurer_code = ANY($2))
      ORDER BY cg.embedding <=> $1::vector
      LIMIT 3
    `;
    
    const backendResult = await client.query(queryText, [JSON.stringify(questionEmbedding), insurers]);
    
    console.log(`   Requête backend retourne: ${backendResult.rows.length} résultats`);
    if (backendResult.rows.length > 0) {
      backendResult.rows.forEach(r => {
        console.log(`      ${r.insurer_label || r.insurer} - ${r.product_name}`);
        console.log(`         Similarité: ${r.similarity.toFixed(4)}`);
        console.log(`         Contenu: ${r.content_text?.length || 0} chars`);
      });
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await client.end();
    process.exit(1);
  }
}

testVectorSearch();
