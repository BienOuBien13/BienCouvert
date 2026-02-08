// Script de diagnostic pour vérifier l'extraction RAG des CG
const { storage } = require('./dist/storage');
const { generateEmbedding } = require('./dist/services/geminiService');

async function diagnoseCgExtraction() {
  try {
    console.log('🔍 Diagnostic RAG pour central_cg id=100\n');
    
    // 1. Vérifier que le CG existe et a un embedding
    const cgCheck = await storage.query(
      `SELECT id, insurer_code, insurance_type_code, 
              LENGTH(content_text) as text_length,
              embedding IS NOT NULL as has_embedding
       FROM central_cg 
       WHERE id = 100`
    );
    
    if (cgCheck.rows.length === 0) {
      console.log('❌ CG id=100 introuvable dans la base');
      process.exit(1);
    }
    
    const cg = cgCheck.rows[0];
    console.log('✅ CG trouvé:');
    console.log(`   - ID: ${cg.id}`);
    console.log(`   - Assureur: ${cg.insurer_code}`);
    console.log(`   - Type: ${cg.insurance_type_code}`);
    console.log(`   - Taille texte: ${cg.text_length} caractères`);
    console.log(`   - Embedding: ${cg.has_embedding ? 'OUI' : 'NON'}`);
    
    if (!cg.has_embedding) {
      console.log('\n❌ Pas d\'embedding - le CG doit être vectorisé');
      process.exit(1);
    }
    
    // 2. Tester la recherche par similarité avec une question typique
    console.log('\n🔍 Test recherche similarité avec "bris de glace"...');
    const questionEmbedding = await generateEmbedding('bris de glace garantie couverture');
    
    const similarityResult = await storage.query(
      `SELECT 
        cg.id,
        i.label as insurer_label,
        it.label_fr as type_label,
        LENGTH(cg.content_text) as text_length,
        1 - (cg.embedding <=> $1::vector) as similarity
       FROM central_cg cg
       LEFT JOIN insurers i ON cg.insurer_code = i.code
       LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
       WHERE cg.id = 100
         AND cg.embedding IS NOT NULL`,
      [JSON.stringify(questionEmbedding)]
    );
    
    if (similarityResult.rows.length > 0) {
      const result = similarityResult.rows[0];
      console.log(`✅ Similarité: ${result.similarity.toFixed(4)}`);
      console.log(`   ${result.insurer_label} - ${result.type_label}`);
    }
    
    // 3. Extraire le contenu et chercher "bris de glace"
    const contentResult = await storage.query(
      'SELECT content_text FROM central_cg WHERE id = 100'
    );
    
    const fullText = contentResult.rows[0].content_text;
    console.log(`\n📄 Contenu CG: ${fullText.length} caractères`);
    
    // Chercher les occurrences
    const keywords = ['bris de glace', 'bris glace', 'pare-brise', 'vitrage', 'formule'];
    console.log('\n🔎 Recherche des mots-clés dans le texte:');
    
    keywords.forEach(kw => {
      const regex = new RegExp(kw, 'gi');
      const matches = fullText.match(regex);
      if (matches) {
        console.log(`   ✅ "${kw}": ${matches.length} occurrence(s)`);
        
        // Trouver la première position
        const firstMatch = fullText.search(regex);
        if (firstMatch !== -1) {
          const context = fullText.substring(Math.max(0, firstMatch - 100), firstMatch + 200);
          console.log(`      Position: ${firstMatch} / ${fullText.length}`);
          console.log(`      Contexte: ...${context}...`);
        }
      } else {
        console.log(`   ❌ "${kw}": non trouvé`);
      }
    });
    
    // 4. Tester l'extraction multi-zones
    console.log('\n📍 Test extraction multi-zones avec keywords ["bris", "glace", "formule"]:');
    const testKeywords = ['bris', 'glace', 'formule', 'tiers', 'essentiel'];
    
    const keywordPositions = new Map();
    testKeywords.forEach(kw => {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      const positions = [];
      while ((match = regex.exec(fullText)) !== null) {
        positions.push(match.index);
      }
      if (positions.length > 0) {
        keywordPositions.set(kw, positions);
      }
    });
    
    console.log(`   Mots-clés trouvés: ${keywordPositions.size}`);
    keywordPositions.forEach((positions, kw) => {
      console.log(`   - "${kw}": ${positions.length} occurrences`);
      console.log(`     Positions: ${positions.slice(0, 5).join(', ')}${positions.length > 5 ? '...' : ''}`);
    });
    
    if (keywordPositions.size > 0) {
      const allPositions = Array.from(keywordPositions.values()).flat().sort((a, b) => a - b);
      
      // Grouper en zones
      const zones = [];
      allPositions.forEach(pos => {
        const hasNearbyZone = zones.some(z => Math.abs(z - pos) < 10000);
        if (!hasNearbyZone) zones.push(pos);
      });
      
      console.log(`\n   📊 Zones identifiées: ${zones.length}`);
      zones.slice(0, 3).forEach((centerPos, idx) => {
        const start = Math.max(0, centerPos - 5000);
        const end = Math.min(fullText.length, centerPos + 15000);
        const extract = fullText.substring(start, end);
        console.log(`   Zone ${idx + 1}: caractères ${start}-${end} (${extract.length} chars)`);
        console.log(`   Aperçu: ${extract.substring(0, 200).replace(/\n/g, ' ')}...`);
      });
    }
    
    console.log('\n✅ Diagnostic terminé');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

diagnoseCgExtraction();
