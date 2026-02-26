/**
 * Diagnostic: vérifie le schéma de coverage_facts et tente un INSERT test
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.production') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // 1. La table existe ?
    const exists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables WHERE schemaname='public' AND tablename='coverage_facts'
      ) AS exists
    `);
    console.log('Table coverage_facts existe:', exists.rows[0].exists);
    if (!exists.rows[0].exists) {
      console.log('❌ La table n\'existe pas ! Migrations manquantes.');
      return;
    }

    // 2. Colonnes
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'coverage_facts'
      ORDER BY ordinal_position
    `);
    console.log('\nColonnes:');
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    // 3. Contraintes uniques
    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'coverage_facts'::regclass AND contype IN ('u', 'p')
    `);
    console.log('\nContraintes unique/PK:');
    constraints.rows.forEach(c => console.log(`  ${c.conname}: ${c.def}`));

    // 4. Nombre de lignes
    const count = await pool.query('SELECT COUNT(*) FROM coverage_facts');
    console.log('\nNombre de lignes:', count.rows[0].count);

    // 5. Récupérer un central_cg_id et page_id valides pour test
    const sample = await pool.query(`
      SELECT p.id AS page_id, p.central_cg_id
      FROM central_cg_pages p
      LIMIT 1
    `);
    if (sample.rows.length === 0) {
      console.log('\n⚠️  Aucune page dans central_cg_pages pour tester');
      return;
    }
    const { page_id, central_cg_id } = sample.rows[0];

    // 6. Test INSERT direct (sans ON CONFLICT)
    console.log(`\nTest INSERT avec central_cg_id=${central_cg_id}, page_id=${page_id}...`);
    try {
      const res = await pool.query(`
        INSERT INTO coverage_facts (
          insurer_code, insurance_type_code, central_cg_id,
          guarantee_key, guarantee_label, formula_key, formula_label,
          coverage_status, coverage_amount, franchise,
          source_page_id, source_page_number, extraction_confidence, extracted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        RETURNING id
      `, ['TEST', 'TEST', central_cg_id, 'test_key', 'Test', 'form_key', 'Formule Test',
          'included', null, null, page_id, 1, 0.9]);
      console.log('✅ INSERT réussi, id:', res.rows[0].id);
      // Nettoyer
      await pool.query("DELETE FROM coverage_facts WHERE insurer_code='TEST'");
      console.log('✅ Nettoyage OK');
    } catch (e) {
      console.log('❌ INSERT échoué:', e.message);
    }

  } catch (err) {
    console.error('Erreur:', err.message);
  } finally {
    await pool.end();
  }
}

run();
