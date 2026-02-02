/**
 * Script simple pour vérifier l'état d'une CG
 */
const { query } = require('./dist/db');

async function checkStatus(cgId) {
  try {
    const result = await query(
      `SELECT 
        id, insurer, product_name, 
        content_text IS NOT NULL as has_text,
        embedding IS NOT NULL as has_embedding,
        LENGTH(content_text) as text_length,
        created_at, updated_at
       FROM central_cg 
       WHERE id = $1`,
      [cgId]
    );

    if (result.rows.length === 0) {
      console.log(`❌ Aucune CG trouvée avec l'ID ${cgId}`);
      process.exit(1);
    }

    const cg = result.rows[0];
    console.log('\n📊 État de la vectorisation:');
    console.log('─────────────────────────────────');
    console.log(`ID: ${cg.id}`);
    console.log(`Assureur: ${cg.insurer}`);
    console.log(`Produit: ${cg.product_name}`);
    console.log(`Texte extrait: ${cg.has_text ? '✅ Oui' : '❌ Non'} ${cg.text_length ? `(${cg.text_length} caractères)` : ''}`);
    console.log(`Vectorisé: ${cg.has_embedding ? '✅ Oui' : '⏳ En attente/En cours'}`);
    console.log(`Créé: ${cg.created_at}`);
    console.log(`Mis à jour: ${cg.updated_at}`);
    console.log('─────────────────────────────────\n');

    if (!cg.has_text && !cg.has_embedding) {
      console.log('⚠️  La vectorisation en arrière-plan n\'a pas encore commencé ou a échoué.');
      console.log('💡 Vérifiez les logs du backend.');
    } else if (cg.has_text && !cg.has_embedding) {
      console.log('⏳ Le texte a été extrait, mais la vectorisation est en cours...');
    } else if (cg.has_embedding) {
      console.log('✅ La vectorisation est complète !');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

const cgId = process.argv[2] || 91;
console.log(`🔍 Vérification de la CG ID: ${cgId}...\n`);
checkStatus(cgId);
