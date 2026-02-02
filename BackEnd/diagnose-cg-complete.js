const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function diagnoseCG() {
  try {
    await client.connect();
    console.log('🔍 DIAGNOSTIC COMPLET DES CONDITIONS GÉNÉRALES\n');
    console.log('═'.repeat(70));
    
    // 1. Toutes les CG
    console.log('\n1️⃣  LISTE DES CG INDEXÉES\n' + '─'.repeat(70));
    const allCg = await client.query(`
      SELECT 
        id, 
        insurer,
        insurer_code,
        product_name,
        (embedding IS NOT NULL) as has_embedding,
        LENGTH(content_text) as content_length,
        created_at
      FROM central_cg
      ORDER BY id
    `);
    
    if (allCg.rows.length === 0) {
      console.log('❌ AUCUNE CG trouvée dans la base !');
      console.log('   → Il faut indexer des CG via /api/ai/index-cg ou /api/policies/central-cg');
    } else {
      console.log(`✅ ${allCg.rows.length} CG trouvées:\n`);
      allCg.rows.forEach(cg => {
        console.log(`   ${cg.id}. ${cg.insurer || cg.insurer_code} - ${cg.product_name}`);
        console.log(`      Embedding: ${cg.has_embedding ? '✅' : '❌ MANQUANT'}`);
        console.log(`      Contenu: ${cg.content_length ? cg.content_length + ' chars' : '❌ VIDE'}`);
        console.log(`      Date: ${cg.created_at.toISOString().split('T')[0]}`);
        console.log('');
      });
    }
    
    // 2. Vérifier spécifiquement MAIF
    console.log('2️⃣  CG MAIF SPÉCIFIQUES\n' + '─'.repeat(70));
    const maifCg = await client.query(`
      SELECT 
        id, 
        insurer,
        insurer_code,
        product_name,
        (embedding IS NOT NULL) as has_embedding,
        LENGTH(content_text) as content_length,
        LEFT(content_text, 200) as content_preview
      FROM central_cg
      WHERE LOWER(insurer) LIKE '%maif%' 
         OR insurer_code = 'MAIF'
    `);
    
    if (maifCg.rows.length === 0) {
      console.log('❌ Aucune CG MAIF trouvée !');
      console.log('   Vérifier les noms exacts dans la colonne insurer:');
      const distinctInsurers = await client.query('SELECT DISTINCT insurer, insurer_code FROM central_cg');
      distinctInsurers.rows.forEach(r => {
        console.log(`      - "${r.insurer}" (code: ${r.insurer_code})`);
      });
    } else {
      console.log(`✅ ${maifCg.rows.length} CG MAIF trouvées:\n`);
      maifCg.rows.forEach(cg => {
        console.log(`   ${cg.id}. ${cg.product_name}`);
        console.log(`      Assureur: ${cg.insurer} (${cg.insurer_code})`);
        console.log(`      Embedding: ${cg.has_embedding ? '✅' : '❌'}`);
        console.log(`      Contenu: ${cg.content_length} chars`);
        if (cg.content_preview) {
          console.log(`      Preview: "${cg.content_preview.substring(0, 100)}..."`);
        }
        console.log('');
      });
    }
    
    // 3. Vérifier les policies MAIF
    console.log('3️⃣  POLICIES MAIF ET LEURS LIENS CG\n' + '─'.repeat(70));
    const maifPolicies = await client.query(`
      SELECT 
        p.id,
        p.insurer,
        p.insurer_code,
        p.type,
        p.type_code,
        p.central_cg_id,
        cg.product_name as linked_cg
      FROM policies p
      LEFT JOIN central_cg cg ON p.central_cg_id = cg.id
      WHERE LOWER(p.insurer) LIKE '%maif%' 
         OR p.insurer_code = 'MAIF'
    `);
    
    if (maifPolicies.rows.length === 0) {
      console.log('❌ Aucune policy MAIF trouvée !');
    } else {
      console.log(`✅ ${maifPolicies.rows.length} policies MAIF:\n`);
      maifPolicies.rows.forEach(p => {
        console.log(`   Policy ${p.id}: ${p.insurer || p.insurer_code} - ${p.type || p.type_code}`);
        if (p.central_cg_id) {
          console.log(`      ✅ Liée à CG: ${p.linked_cg} (ID ${p.central_cg_id})`);
        } else {
          console.log(`      ❌ AUCUNE CG LIÉE`);
        }
      });
    }
    
    // 4. Test de recherche vectorielle simulée
    console.log('\n4️⃣  TEST DE RECHERCHE VECTORIELLE\n' + '─'.repeat(70));
    const testSearch = await client.query(`
      SELECT 
        id,
        insurer,
        product_name,
        (embedding IS NOT NULL) as has_embedding
      FROM central_cg
      WHERE embedding IS NOT NULL
        AND (LOWER(insurer) LIKE '%maif%' OR insurer_code = 'MAIF')
      LIMIT 3
    `);
    
    if (testSearch.rows.length === 0) {
      console.log('❌ Aucune CG MAIF avec embedding trouvée');
      console.log('   → Les embeddings doivent être générés pour que le RAG fonctionne');
    } else {
      console.log(`✅ ${testSearch.rows.length} CG MAIF prêtes pour la recherche vectorielle`);
      testSearch.rows.forEach(cg => {
        console.log(`   - ${cg.insurer} - ${cg.product_name}`);
      });
    }
    
    // 5. Statistiques globales
    console.log('\n5️⃣  STATISTIQUES GLOBALES\n' + '─'.repeat(70));
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_cg,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as cg_with_embedding,
        COUNT(CASE WHEN content_text IS NOT NULL AND LENGTH(content_text) > 100 THEN 1 END) as cg_with_content,
        AVG(LENGTH(content_text)) as avg_content_length
      FROM central_cg
    `);
    
    const s = stats.rows[0];
    console.log(`Total CG: ${s.total_cg}`);
    console.log(`Avec embedding: ${s.cg_with_embedding} (${Math.round(s.cg_with_embedding/s.total_cg*100)}%)`);
    console.log(`Avec contenu: ${s.cg_with_content} (${Math.round(s.cg_with_content/s.total_cg*100)}%)`);
    console.log(`Longueur moyenne: ${Math.round(s.avg_content_length)} chars`);
    
    console.log('\n' + '═'.repeat(70));
    console.log('🎯 DIAGNOSTIC TERMINÉ\n');
    
    // Recommandations
    if (allCg.rows.length === 0) {
      console.log('⚠️  RECOMMANDATION: Indexer des CG via l\'interface ou l\'API');
    } else if (maifCg.rows.length === 0) {
      console.log('⚠️  RECOMMANDATION: Vérifier l\'orthographe de "MAIF" dans la base');
    } else if (stats.rows[0].cg_with_embedding < stats.rows[0].total_cg) {
      console.log('⚠️  RECOMMANDATION: Générer les embeddings manquants');
    } else {
      console.log('✅ Tout semble OK côté base de données');
      console.log('   → Vérifier les logs du backend lors d\'une requête chat');
      console.log('   → Chercher les logs: "🔍 Recherche CG pour assureurs"');
    }
    
    await client.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
    await client.end();
    process.exit(1);
  }
}

diagnoseCG();
