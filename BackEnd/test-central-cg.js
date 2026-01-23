const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function testCentralCg() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');

    // Vérifier la structure de la table
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Structure de la table central_cg:');
    console.table(tableInfo.rows);

    // Lire les données existantes
    const existing = await client.query('SELECT * FROM central_cg');
    console.log(`\n📊 Nombre d'entrées actuelles: ${existing.rows.length}`);
    
    if (existing.rows.length > 0) {
      console.log('\n📄 Données existantes:');
      existing.rows.forEach(row => {
        console.log(`  - ID: ${row.id}, Insurer: ${row.insurer}, Product: ${row.product_name}`);
        console.log(`    Metadata:`, row.metadata);
      });
    } else {
      console.log('\n⚠️  Aucune donnée dans central_cg');
      
      // Insérer des données de test
      console.log('\n🔄 Insertion de données de test...');
      
      const testData = [
        {
          insurer: 'MAIF',
          product_name: 'Auto Zen',
          type: 'Auto',
          document_url: 'https://www.maif.fr/documents/cg-auto-zen.pdf',
          indexedFormulas: ['Tiers', 'Intermédiaire', 'Tous Risques'],
          indexedOptions: ['Assistance 0km', 'Garantie conducteur', 'Protection juridique'],
          semanticSummary: 'Contrat auto MAIF avec 3 formules adaptées aux besoins de chaque conducteur.'
        },
        {
          insurer: 'AXA',
          product_name: 'Habitation Confort',
          type: 'Habitation',
          document_url: 'https://www.axa.fr/documents/cg-habitation.pdf',
          indexedFormulas: ['Essentiel', 'Confort', 'Premium'],
          indexedOptions: ['Dégât des eaux +', 'Vol étendu', 'Objets de valeur'],
          semanticSummary: 'Assurance habitation AXA couvrant locataires et propriétaires avec options personnalisables.'
        },
        {
          insurer: 'Allianz',
          product_name: 'Santé Plus',
          type: 'Santé',
          document_url: 'https://www.allianz.fr/documents/cg-sante.pdf',
          indexedFormulas: ['Base', 'Confort', 'Excellence'],
          indexedOptions: ['Optique renforcée', 'Dentaire premium', 'Médecines douces'],
          semanticSummary: 'Complémentaire santé Allianz avec remboursements optimisés et accès au tiers payant.'
        }
      ];

      for (const data of testData) {
        const metadata = {
          type: data.type,
          indexedFormulas: data.indexedFormulas,
          indexedOptions: data.indexedOptions,
          semanticSummary: data.semanticSummary
        };

        await client.query(
          `INSERT INTO central_cg (insurer, product_name, version, document_url, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [data.insurer, data.product_name, '1.0', data.document_url, JSON.stringify(metadata)]
        );
        
        console.log(`  ✅ Inséré: ${data.insurer} - ${data.product_name}`);
      }

      // Relire les données
      const newData = await client.query('SELECT * FROM central_cg');
      console.log(`\n✅ ${newData.rows.length} entrées maintenant dans la base`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.end();
    console.log('\n👋 Déconnecté');
  }
}

testCentralCg();
