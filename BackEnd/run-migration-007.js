// Script pour appliquer la migration 007 - Vectorisation page par page
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  try {
    console.log('🚀 Application de la migration 007 - Vectorisation page par page\n');
    
    // Lire le fichier SQL
    const migrationPath = path.join(__dirname, 'migrations', '007_vectorisation_page_par_page.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Exécuter
    console.log('📝 Exécution du SQL...');
    await pool.query(sql);
    
    console.log('\n✅ Migration 007 appliquée avec succès !');
    console.log('\nTables créées:');
    console.log('  - central_cg_pages (pages avec embeddings)');
    console.log('  - coverage_facts (faits garanties×formules)');
    console.log('  - guarantee_catalog (référentiel garanties)');
    console.log('  - formula_catalog (référentiel formules)');
    console.log('\nNote: Les packages canvas, pdf-lib et pdfjs-dist doivent être installés');
    console.log('      npm install canvas pdf-lib pdfjs-dist');
    console.log('\nProchaines étapes:');
    console.log('  1. Installer dépendances: npm install canvas pdf-lib pdfjs-dist');
    console.log('  2. Build TypeScript: npm run build');
    console.log('  3. Vectoriser un CG: node vectorize-cg-pages.js <central_cg_id>');
    console.log('  4. Vérifier: SELECT * FROM v_coverage_matrix WHERE central_cg_id = 100;');
    
  } catch (error) {
    console.error('❌ Erreur migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
