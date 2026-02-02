const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: { rejectUnauthorized: false }
});

async function addMissingFKs() {
  try {
    await client.connect();
    console.log('✅ Connexion établie\n');
    
    // Vérifier d'abord si les FK existent
    console.log('🔍 Vérification des FK existantes...');
    const existingFKs = await client.query(`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname IN ('fk_policies_type', 'fk_central_cg_type')
    `);
    
    console.log('FK trouvées:', existingFKs.rows.map(r => r.conname));
    console.log();
    
    // Ajouter FK pour policies.type_code si manquante
    if (!existingFKs.rows.find(r => r.conname === 'fk_policies_type')) {
      console.log('➕ Ajout de la FK policies.type_code → insurance_types.code');
      await client.query(`
        ALTER TABLE policies 
        ADD CONSTRAINT fk_policies_type 
        FOREIGN KEY (type_code) 
        REFERENCES insurance_types(code)
      `);
      console.log('✅ FK policies.type_code créée');
    } else {
      console.log('✓ FK policies.type_code existe déjà');
    }
    
    // Ajouter FK pour central_cg.type_code si manquante
    if (!existingFKs.rows.find(r => r.conname === 'fk_central_cg_type')) {
      console.log('➕ Ajout de la FK central_cg.type_code → insurance_types.code');
      await client.query(`
        ALTER TABLE central_cg 
        ADD CONSTRAINT fk_central_cg_type 
        FOREIGN KEY (type_code) 
        REFERENCES insurance_types(code)
      `);
      console.log('✅ FK central_cg.type_code créée');
    } else {
      console.log('✓ FK central_cg.type_code existe déjà');
    }
    
    console.log('\n✅ Toutes les FK sont en place');
    
    await client.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await client.end();
    process.exit(1);
  }
}

addMissingFKs();
