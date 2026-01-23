async function testApi() {
  try {
    console.log('🔍 Test de l\'API /api/policies/central-cg...\n');
    
    const response = await fetch('http://localhost:4000/api/policies/central-cg');
    const data = await response.json();
    
    console.log(`✅ Réponse reçue: ${data.length} entrées\n`);
    
    data.forEach((entry, i) => {
      console.log(`📄 Entrée ${i + 1}:`);
      console.log(`   Provider: ${entry.provider}`);
      console.log(`   Policy Name: ${entry.policyName}`);
      console.log(`   Type: ${entry.type}`);
      console.log(`   Formulas: ${entry.indexedFormulas?.length || 0} (${entry.indexedFormulas?.join(', ') || 'aucune'})`);
      console.log(`   Options: ${entry.indexedOptions?.length || 0} (${entry.indexedOptions?.join(', ') || 'aucune'})`);
      console.log(`   Summary: ${entry.semanticSummary?.substring(0, 60) || 'N/A'}...`);
      console.log('');
    });
    
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') {
      console.error('❌ Impossible de se connecter au backend sur localhost:4000');
      console.error('   Le serveur backend est-il démarré ?');
    } else {
      console.error('❌ Erreur:', error.message);
    }
  }
}

testApi();
