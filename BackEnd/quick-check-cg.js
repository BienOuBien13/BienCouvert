// Vérifier simplement si le CG id=100 a du contenu
const { pool } = require('./dist/db');

async function quickCheck() {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        insurer_code,
        insurance_type_code,
        LENGTH(content_text) as text_length,
        embedding IS NOT NULL as has_embedding,
        SUBSTRING(content_text, 1, 500) as preview
      FROM central_cg
      WHERE id = 100
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ CG id=100 introuvable');
      process.exit(1);
    }
    
    const cg = result.rows[0];
    console.log('\n📄 CG id=100:');
    console.log(`Assureur: ${cg.insurer_code}`);
    console.log(`Type: ${cg.insurance_type_code}`);
    console.log(`Taille: ${cg.text_length} caractères`);
    console.log(`Embedding: ${cg.has_embedding ? 'OUI ✅' : 'NON ❌'}`);
    console.log(`\nAperçu:\n${cg.preview}...\n`);
    
    // Chercher "bris de glace"
    const searchResult = await pool.query(`
      SELECT 
        content_text ~* 'bris.*glace' as has_bris_glace,
        content_text ~* 'formule' as has_formule,
        content_text ~* 'tiers.*essentiel' as has_tiers_essentiel
      FROM central_cg
      WHERE id = 100
    `);
    
    console.log('Recherche de mots-clés:');
    console.log(`  "bris de glace": ${searchResult.rows[0].has_bris_glace ? '✅' : '❌'}`);
    console.log(`  "formule": ${searchResult.rows[0].has_formule ? '✅' : '❌'}`);
    console.log(`  "tiers essentiel": ${searchResult.rows[0].has_tiers_essentiel ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌', error.message);
  } finally {
    await pool.end();
  }
}

quickCheck();
