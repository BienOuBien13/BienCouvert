/**
 * Liste les dernières CG ajoutées
 */

require('dotenv').config();
const { query } = require('./dist/db');

async function listRecentCg() {
  try {
    const result = await query(
      `SELECT 
        id, insurer, product_name, 
        content_text IS NOT NULL as has_text,
        embedding IS NOT NULL as has_embedding,
        created_at
       FROM central_cg 
       ORDER BY id DESC 
       LIMIT 10`
    );

    console.log('\n📋 Dernières CG ajoutées:\n');
    console.log('ID  | Assureur | Produit | Texte | Embed | Date');
    console.log('----+----------+---------+-------+-------+-----');
    
    result.rows.forEach(row => {
      const textIcon = row.has_text ? '✅' : '❌';
      const embedIcon = row.has_embedding ? '✅' : '❌';
      console.log(`${row.id.toString().padEnd(3)} | ${row.insurer.padEnd(8)} | ${row.product_name.padEnd(7)} | ${textIcon}   | ${embedIcon}   | ${new Date(row.created_at).toLocaleString()}`);
    });
    
    console.log('\n💡 Pour forcer la vectorisation: node force-vectorize-cg.js <id>\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

listRecentCg();
