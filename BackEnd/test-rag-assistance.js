const { generateEmbedding } = require('./dist/services/geminiService');
const { storage } = require('./dist/storage');

async function testRagAssistance() {
  console.log('🔍 Test RAG pour "détail assistance déplacement"...\n');
  
  // 1. Générer l'embedding de la question
  const question = "donne moi le détail de la garantie Assistance déplacement avec ma formule";
  console.log(`Question: "${question}"\n`);
  
  const embedding = await generateEmbedding(question);
  console.log(`✅ Embedding généré (${embedding.length} dimensions)\n`);
  
  // 2. Rechercher dans central_cg pour MAIF
  console.log('🔍 Recherche dans central_cg pour MAIF...');
  const cgResults = await storage.searchCentralCg(embedding, ['MAIF'], 3);
  
  console.log(`\n✅ Résultats trouvés: ${cgResults.length}\n`);
  
  cgResults.forEach((cg, idx) => {
    console.log(`\n📄 Document ${idx + 1}:`);
    console.log(`   Assureur: ${cg.insurer_label || cg.insurer}`);
    console.log(`   Produit: ${cg.product_name}`);
    console.log(`   Type: ${cg.type}`);
    console.log(`   Similarité: ${cg.similarity.toFixed(4)}`);
    console.log(`   Contenu (200 premiers chars):`);
    console.log(`   ${cg.content_text?.substring(0, 200)}...`);
    
    // Chercher "assistance" dans le contenu
    const assistanceIndex = cg.content_text?.toLowerCase().indexOf('assistance');
    if (assistanceIndex > -1) {
      console.log(`\n   ✅ Mot "assistance" trouvé à la position ${assistanceIndex}`);
      console.log(`   Extrait autour de "assistance":`);
      const start = Math.max(0, assistanceIndex - 100);
      const end = Math.min(cg.content_text.length, assistanceIndex + 300);
      console.log(`   ...${cg.content_text.substring(start, end)}...`);
    } else {
      console.log(`\n   ⚠️ Mot "assistance" NON trouvé dans le contenu`);
    }
  });
  
  process.exit(0);
}

testRagAssistance().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
