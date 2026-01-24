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

async function normalizePoliciesTypes() {
  try {
    console.log('🔧 Normalisation des types dans policies...\n');

    // Lire tous les types distincts
    const result = await pool.query('SELECT DISTINCT type FROM policies WHERE type IS NOT NULL');
    console.log(`📋 ${result.rows.length} type(s) distinct(s) trouvé(s)\n`);

    for (const row of result.rows) {
      const oldType = row.type;
      const newType = typeNormalization[oldType] || oldType.toLowerCase();
      
      if (oldType !== newType) {
        const updateResult = await pool.query(
          'UPDATE policies SET type = $1 WHERE type = $2 RETURNING id',
          [newType, oldType]
        );
        console.log(`✅ "${oldType}" → "${newType}" (${updateResult.rowCount} contrat(s))`);
      } else {
        console.log(`ℹ️  "${oldType}" déjà normalisé`);
      }
    }

    console.log('\n✅ Normalisation terminée!');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

normalizePoliciesTypes();
