/**
 * Script de migration : Ajout du lien policies <-> central_cg
 * Usage : node migrate-add-cg-link.js
 */

const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'assurclair',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });

  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL');

    // 1. Ajouter la colonne central_cg_id
    console.log('\n📝 Ajout de la colonne central_cg_id...');
    await client.query(`
      ALTER TABLE policies 
      ADD COLUMN IF NOT EXISTS central_cg_id INTEGER REFERENCES central_cg(id) ON DELETE SET NULL
    `);
    console.log('✅ Colonne central_cg_id ajoutée');

    // 2. Créer l'index
    console.log('\n📝 Création de l\'index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_policies_central_cg_id ON policies(central_cg_id)
    `);
    console.log('✅ Index créé');

    // 3. Populer central_cg avec des données de base (si vide)
    const countResult = await client.query('SELECT COUNT(*) FROM central_cg');
    const count = parseInt(countResult.rows[0].count);

    if (count === 0) {
      console.log('\n📝 Population de la table central_cg...');
      
      const products = [
        ['Allianz', 'Habitation Essentielle', '2024', 'https://www.allianz.fr/cg-habitation-essentielle.pdf', 'habitation'],
        ['AXA', 'Habitation Confort', '2024', 'https://www.axa.fr/cg-habitation-confort.pdf', 'habitation'],
        ['MAIF', 'Rythme Habitation', '2024', 'https://www.maif.fr/cg-habitation.pdf', 'habitation'],
        ['Allianz', 'Auto Tous Risques', '2024', 'https://www.allianz.fr/cg-auto-tous-risques.pdf', 'auto'],
        ['AXA', 'Auto Premium', '2024', 'https://www.axa.fr/cg-auto-premium.pdf', 'auto'],
        ['MAIF', 'Auto Protection Juridique', '2024', 'https://www.maif.fr/cg-auto.pdf', 'auto'],
        ['Harmonie Mutuelle', 'Santé Modulaire', '2024', 'https://www.harmonie-mutuelle.fr/cg-sante.pdf', 'sante'],
        ['MGEN', 'Santé Active', '2024', 'https://www.mgen.fr/cg-sante-active.pdf', 'sante'],
      ];

      for (const [insurer, productName, version, url, type] of products) {
        const metadata = JSON.stringify({
          type,
          validFrom: '2024-01-01',
          indexedFormulas: [],
          indexedOptions: [],
          semanticSummary: `Conditions générales du produit ${productName} de ${insurer}`
        });

        await client.query(`
          INSERT INTO central_cg (insurer, product_name, version, document_url, metadata)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `, [insurer, productName, version, url, metadata]);
        
        console.log(`  ✅ ${insurer} - ${productName}`);
      }
      
      console.log(`✅ ${products.length} produits ajoutés au référentiel`);
    } else {
      console.log(`\n✅ La table central_cg contient déjà ${count} entrée(s)`);
    }

    // 4. Afficher les produits disponibles
    console.log('\n📋 Produits disponibles dans central_cg :');
    const cgResult = await client.query(`
      SELECT id, insurer, product_name, version 
      FROM central_cg 
      ORDER BY insurer, product_name
    `);
    
    console.table(cgResult.rows);

    // 5. Afficher les policies sans lien central_cg
    console.log('\n📋 Policies sans lien vers central_cg :');
    const policiesResult = await client.query(`
      SELECT id, policy_number, insurer, type, user_id 
      FROM policies 
      WHERE central_cg_id IS NULL
      ORDER BY id
    `);
    
    if (policiesResult.rows.length > 0) {
      console.table(policiesResult.rows);
      console.log('\n💡 Pour lier une policy à un produit central :');
      console.log('   UPDATE policies SET central_cg_id = <ID_CENTRAL_CG> WHERE id = <ID_POLICY>;');
      console.log('\n💡 Exemple pour POL-1769196850479 avec AXA Habitation :');
      console.log('   const cgId = await query("SELECT id FROM central_cg WHERE insurer = \'AXA\' AND product_name = \'Habitation Confort\'");');
      console.log('   await query("UPDATE policies SET central_cg_id = $1 WHERE policy_number = \'POL-1769196850479\'", [cgId.rows[0].id]);');
    } else {
      console.log('✅ Toutes les policies sont liées à un produit central');
    }

    console.log('\n✅ Migration terminée avec succès !');

  } catch (error) {
    console.error('\n❌ Erreur durant la migration :', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
