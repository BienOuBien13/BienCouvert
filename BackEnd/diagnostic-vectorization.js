/**
 * Diagnostic complet de la vectorisation
 */

require('dotenv').config();
const { query } = require('./dist/db');

async function diagnostic() {
  try {
    console.log('🔍 Diagnostic de la vectorisation...\n');

    // Test 1: Vérifier la connexion à Gemini
    console.log('1️⃣ Test de connexion à l\'API Gemini...');
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const result = await model.generateContent(['Test de connexion']);
      console.log('   ✅ API Gemini accessible\n');
    } catch (e) {
      console.log('   ❌ API Gemini INACCESSIBLE');
      console.log('   💡 Cause probable: Proxy/Firewall/ZScaler bloque generativelanguage.googleapis.com');
      console.log('   📝 Erreur:', e.message.substring(0, 100) + '...\n');
    }

    // Test 2: État des CG
    console.log('2️⃣ État des CG dans la base...');
    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN content_text IS NOT NULL THEN 1 END) as with_text,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
      FROM central_cg
    `);

    const stats = result.rows[0];
    console.log(`   Total CG: ${stats.total}`);
    console.log(`   Avec texte: ${stats.with_text} (${Math.round(stats.with_text/stats.total*100)}%)`);
    console.log(`   Avec embedding: ${stats.with_embedding} (${Math.round(stats.with_embedding/stats.total*100)}%)`);
    console.log(`   ⚠️  Manquant texte: ${stats.total - stats.with_text}`);
    console.log(`   ⚠️  Manquant embedding: ${stats.total - stats.with_embedding}\n`);

    // Test 3: Lister celles qui ont besoin de vectorisation
    const needVectorization = await query(`
      SELECT id, insurer, product_name, created_at
      FROM central_cg
      WHERE content_text IS NULL OR embedding IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (needVectorization.rows.length > 0) {
      console.log('3️⃣ CG nécessitant une vectorisation:');
      needVectorization.rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.insurer} - ${row.product_name} (${new Date(row.created_at).toLocaleDateString()})`);
      });
      console.log('\n💡 Pour forcer la vectorisation depuis un réseau avec accès à l\'API:');
      needVectorization.rows.forEach(row => {
        console.log(`   node force-vectorize-cg.js ${row.id}`);
      });
    } else {
      console.log('3️⃣ ✅ Toutes les CG sont vectorisées!\n');
    }

    console.log('\n📊 DIAGNOSTIC:');
    console.log('   La vectorisation en arrière-plan échoue probablement à cause d\'un blocage réseau.');
    console.log('   Les CG sont sauvegardées mais le texte et embedding restent NULL.');
    console.log('   Solution: Exécuter depuis un réseau autorisant l\'accès à Google Cloud API.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

diagnostic();
