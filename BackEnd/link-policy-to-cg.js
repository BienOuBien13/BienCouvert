/**
 * Script pour lier une policy à un produit central_cg
 * Usage : node link-policy-to-cg.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function linkPolicy() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'assurclair',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL\n');

    // 1. Afficher les policies sans lien
    console.log('📋 Policies à lier :');
    const policiesResult = await client.query(`
      SELECT p.id, p.policy_number, p.insurer, p.type, p.central_cg_id
      FROM policies p
      WHERE p.central_cg_id IS NULL
      ORDER BY p.id
    `);
    
    if (policiesResult.rows.length === 0) {
      console.log('✅ Toutes les policies sont déjà liées !');
      return;
    }

    console.table(policiesResult.rows);

    // 2. Pour chaque policy, chercher un produit correspondant
    for (const policy of policiesResult.rows) {
      console.log(`\n🔍 Recherche d'un produit pour Policy #${policy.id} (${policy.insurer} - ${policy.type})...`);
      
      // Chercher un produit correspondant dans central_cg
      const cgResult = await client.query(`
        SELECT id, insurer, product_name, document_url 
        FROM central_cg 
        WHERE LOWER(insurer) = LOWER($1)
        AND metadata->>'type' = LOWER($2)
        LIMIT 1
      `, [policy.insurer, policy.type]);

      if (cgResult.rows.length > 0) {
        const cg = cgResult.rows[0];
        console.log(`  ✅ Produit trouvé : ${cg.product_name} (ID: ${cg.id})`);
        console.log(`  📄 URL CG : ${cg.document_url}`);
        
        // Lier la policy au produit
        await client.query(`
          UPDATE policies 
          SET central_cg_id = $1 
          WHERE id = $2
        `, [cg.id, policy.id]);
        
        console.log(`  ✅ Policy #${policy.id} liée avec succès !`);
      } else {
        console.log(`  ⚠️ Aucun produit correspondant trouvé pour ${policy.insurer} - ${policy.type}`);
        console.log(`  💡 Ajoutez le produit avec : INSERT INTO central_cg...`);
      }
    }

    // 3. Vérification finale
    console.log('\n📊 Résultat final :');
    const finalResult = await client.query(`
      SELECT 
        p.id,
        p.policy_number,
        p.insurer as policy_insurer,
        p.type,
        c.id as cg_id,
        c.product_name,
        c.document_url
      FROM policies p
      LEFT JOIN central_cg c ON p.central_cg_id = c.id
      ORDER BY p.id
    `);
    
    console.table(finalResult.rows);

    // 4. Stats
    const linkedCount = finalResult.rows.filter(r => r.cg_id !== null).length;
    const totalCount = finalResult.rows.length;
    console.log(`\n✅ ${linkedCount}/${totalCount} policies liées au référentiel central`);

  } catch (error) {
    console.error('\n❌ Erreur :', error);
    throw error;
  } finally {
    await client.end();
  }
}

linkPolicy().catch(console.error);
