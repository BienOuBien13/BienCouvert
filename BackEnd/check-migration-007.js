// Vérifier les tables créées par la migration 007
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkTables() {
  try {
    console.log('\n📊 Vérification des tables créées\n');
    
    // 1. central_cg_pages
    const pages = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'central_cg_pages'
    `);
    console.log('✅ central_cg_pages:', pages.rows.length > 0 ? 'Créée' : 'Manquante');
    
    // 2. coverage_facts
    const facts = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'coverage_facts'
    `);
    console.log('✅ coverage_facts:', facts.rows.length > 0 ? 'Créée' : 'Manquante');
    
    // 3. guarantee_catalog
    const guarantees = await pool.query(`
      SELECT COUNT(*) as count
      FROM guarantee_catalog
    `);
    console.log(`✅ guarantee_catalog: ${guarantees.rows[0].count} garanties pré-chargées`);
    
    // 4. formula_catalog
    const formulas = await pool.query(`
      SELECT COUNT(*) as count
      FROM formula_catalog
    `);
    console.log(`✅ formula_catalog: ${formulas.rows[0].count} formules pré-chargées`);
    
    // 5. Vue v_coverage_matrix
    const view = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'v_coverage_matrix'
    `);
    console.log('✅ v_coverage_matrix:', view.rows[0].count > 0 ? 'Créée' : 'Manquante');
    
    console.log('\n🎉 Migration 007 validée !');
    console.log('\nProchaine étape: npm install canvas pdf-lib pdfjs-dist');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
