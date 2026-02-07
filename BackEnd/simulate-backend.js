// Simuler exactement ce que fait le backend
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

async function simulateBackend() {
  try {
    const insurance_type_code = 'AUTO';
    const insurer_code = 'MAA01';

    const result = await pool.query(
      `SELECT 
        id,
        insurer_code,
        insurance_type_code,
        version,
        type,
        detail,
        url,
        target_filename,
        status,
        metadata,
        created_at
      FROM central_cg
      WHERE insurance_type_code = $1 
        AND insurer_code = $2 
        AND status = 'active'
      ORDER BY version DESC
      LIMIT 1`,
      [insurance_type_code, insurer_code]
    );

    console.log('Rows found:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('404: Aucune CG trouvée');
      return;
    }

    const cg = result.rows[0];
    console.log('\nCG found:', { id: cg.id, insurer_code: cg.insurer_code });
    console.log('\nMetadata type:', typeof cg.metadata);
    console.log('Has formules?', cg.metadata && 'formules' in cg.metadata);

    const response = {
      id: cg.id,
      insurer_code: cg.insurer_code,
      insurance_type_code: cg.insurance_type_code,
      version: cg.version,
      detail: cg.detail,
      url: cg.url,
      formules: cg.metadata?.formules || [],
      options: cg.metadata?.options || { toutes_formules: [] },
      resume_court: cg.metadata?.resume_court || '',
      insurer_name: cg.metadata?.insurer_name || '',
      insurance_type_name: cg.metadata?.insurance_type_name || ''
    };

    console.log('\nResponse OK!');
    console.log(JSON.stringify(response, null, 2));

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

simulateBackend();
