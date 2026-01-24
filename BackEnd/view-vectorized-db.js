const { Client } = require('pg');

const client = new Client({
  host: '52.143.159.51',
  port: 5432,
  database: 'assurclair',
  user: 'remijolivalt',
  password: 'Remi1982'
});

async function viewVectorizedDb() {
  try {
    await client.connect();
    console.log('✅ Connecté à PostgreSQL\n');

    // Afficher la structure de la table central_cg
    console.log('📋 STRUCTURE DE LA TABLE central_cg:\n');
    const structure = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        CASE 
          WHEN character_maximum_length IS NOT NULL 
          THEN data_type || '(' || character_maximum_length || ')'
          ELSE data_type 
        END as full_type
      FROM information_schema.columns
      WHERE table_name = 'central_cg'
      ORDER BY ordinal_position;
    `);
    
    console.table(structure.rows.map(r => ({
      Colonne: r.column_name,
      Type: r.full_type,
      Nullable: r.is_nullable
    })));

    // Compter les entrées
    const count = await client.query('SELECT COUNT(*) as total FROM central_cg');
    console.log(`\n📊 Total d'entrées vectorisées: ${count.rows[0].total}\n`);

    // Afficher toutes les entrées avec détails
    const entries = await client.query(`
      SELECT 
        id,
        insurer,
        product_name,
        version,
        document_url,
        metadata,
        created_at,
        updated_at,
        CASE 
          WHEN embedding IS NOT NULL THEN 'OUI (vectorisé)'
          ELSE 'NON'
        END as has_embedding
      FROM central_cg
      ORDER BY id
    `);

    if (entries.rows.length === 0) {
      console.log('⚠️  Aucune entrée dans la base vectorisée\n');
    } else {
      console.log('📄 CONTENU DE LA BASE VECTORISÉE:\n');
      entries.rows.forEach((entry, i) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📌 Entrée #${i + 1} (ID: ${entry.id})`);
        console.log(`   Assureur: ${entry.insurer}`);
        console.log(`   Produit: ${entry.product_name}`);
        console.log(`   Version: ${entry.version}`);
        console.log(`   URL: ${entry.document_url || 'N/A'}`);
        console.log(`   Embedding: ${entry.has_embedding}`);
        console.log(`   Créé: ${entry.created_at}`);
        console.log(`   MAJ: ${entry.updated_at}`);
        
        if (entry.metadata) {
          console.log(`   Metadata:`);
          const meta = entry.metadata;
          if (meta.type) console.log(`      Type: ${meta.type}`);
          if (meta.indexedFormulas) {
            console.log(`      Formules (${meta.indexedFormulas.length}): ${meta.indexedFormulas.join(', ')}`);
          }
          if (meta.indexedOptions) {
            console.log(`      Options (${meta.indexedOptions.length}): ${meta.indexedOptions.join(', ')}`);
          }
          if (meta.semanticSummary) {
            console.log(`      Résumé: ${meta.semanticSummary.substring(0, 80)}...`);
          }
        }
        console.log('');
      });
    }

    // Statistiques par assureur
    console.log('\n📈 STATISTIQUES PAR ASSUREUR:\n');
    const stats = await client.query(`
      SELECT 
        insurer,
        COUNT(*) as nb_documents,
        COUNT(embedding) as nb_with_vectors
      FROM central_cg
      GROUP BY insurer
      ORDER BY nb_documents DESC
    `);
    
    if (stats.rows.length > 0) {
      console.table(stats.rows.map(s => ({
        Assureur: s.insurer,
        'Nb Documents': s.nb_documents,
        'Avec Vecteurs': s.nb_with_vectors
      })));
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.end();
    console.log('\n👋 Déconnecté de PostgreSQL');
  }
}

viewVectorizedDb();
