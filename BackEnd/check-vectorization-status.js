/**
 * Script pour vérifier l'état de la vectorisation d'une CG
 * Usage: node check-vectorization-status.js <id>
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

async function checkVectorizationStatus(cgId) {
  try {
    const result = await pool.query(
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
      return;
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
      console.log('💡 Vérifiez les logs du backend pour voir s\'il y a des erreurs.');
    } else if (cg.has_text && !cg.has_embedding) {
      console.log('⏳ Le texte a été extrait, mais la vectorisation est en cours...');
      console.log('💡 Attendez quelques secondes/minutes selon la taille du document.');
    } else if (cg.has_embedding) {
      console.log('✅ La vectorisation est complète ! Le document est prêt pour la recherche sémantique.');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

// Récupérer l'ID depuis les arguments
const cgId = process.argv[2] || 91; // Par défaut 91 (dernier ID de l'utilisateur)

console.log(`🔍 Vérification de la CG ID: ${cgId}...\n`);
checkVectorizationStatus(cgId);
