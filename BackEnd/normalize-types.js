const { Pool } = require('pg');

const pool = new Pool({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982',
  ssl: false
});

// Mapping des anciens noms vers les IDs standards
const typeNormalization = {
  'Auto': 'auto',
  'Automobile': 'auto',
  'Habitation': 'habitation',
  'Santé': 'sante',
  'Sante': 'sante',
  'Prévoyance': 'prevoyance',
  'Prevoyance': 'prevoyance',
  'Professionnelle': 'pro',
  'Pro': 'pro',
  'Emprunteur/Crédit': 'emprunteur',
  'Emprunteur': 'emprunteur',
  'Carte Bancaire': 'bancaire',
  'Bancaire': 'bancaire',
  'Appareils Électroniques': 'appareils',
  'Appareils': 'appareils',
  'Juridique': 'juridique',
  'Voyage': 'voyage',
  'Animaux': 'animaux',
  'Autre': 'autre'
};

async function normalizeTypes() {
  try {
    console.log('🔧 Normalisation des types dans central_cg...\n');

    // 1. Lire toutes les entrées
    const result = await pool.query('SELECT id, metadata FROM central_cg');
    console.log(`📋 ${result.rows.length} entrée(s) trouvée(s)\n`);

    let updated = 0;
    let unchanged = 0;

    for (const row of result.rows) {
      const metadata = row.metadata || {};
      const oldType = metadata.type;
      
      if (oldType && typeNormalization[oldType]) {
        const newType = typeNormalization[oldType];
        metadata.type = newType;
        
        await pool.query(
          'UPDATE central_cg SET metadata = $1 WHERE id = $2',
          [JSON.stringify(metadata), row.id]
        );
        
        console.log(`✅ ID ${row.id}: "${oldType}" → "${newType}"`);
        updated++;
      } else if (oldType) {
        console.log(`ℹ️  ID ${row.id}: "${oldType}" (déjà normalisé ou inconnu)`);
        unchanged++;
      } else {
        console.log(`⚠️  ID ${row.id}: pas de type défini`);
        unchanged++;
      }
    }

    console.log(`\n📊 Résumé:`);
    console.log(`  - Mis à jour: ${updated}`);
    console.log(`  - Inchangés: ${unchanged}`);
    console.log(`  - Total: ${result.rows.length}`);

    // 2. Vérifier les types dans policies
    console.log('\n🔍 Vérification des types dans policies...');
    const policiesTypes = await pool.query(`
      SELECT DISTINCT type, COUNT(*) as count 
      FROM policies 
      GROUP BY type 
      ORDER BY count DESC
    `);
    
    console.log('\nTypes utilisés dans policies:');
    policiesTypes.rows.forEach(row => {
      console.log(`  - ${row.type || '(null)'}: ${row.count} contrat(s)`);
    });

    console.log('\n✅ Normalisation terminée!');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

normalizeTypes();
