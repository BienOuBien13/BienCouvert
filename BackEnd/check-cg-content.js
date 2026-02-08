// Vérifier le contenu textuel du CG id=100
const dotenv = require('dotenv');
dotenv.config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkContent() {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        insurer_code,
        insurance_type_code,
        LENGTH(content_text) as text_length,
        content_text
      FROM central_cg
      WHERE id = 100
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ CG id=100 introuvable');
      process.exit(1);
    }
    
    const cg = result.rows[0];
    const text = cg.content_text;
    
    console.log('\n📄 CG id=100:');
    console.log(`Assureur: ${cg.insurer_code}`);
    console.log(`Type: ${cg.insurance_type_code}`);
    console.log(`Taille: ${cg.text_length} caractères\n`);
    
    // Rechercher les mots-clés importants
    const keywords = [
      'bris de glace',
      'bris glace',
      'pare-brise',
      'vitrage',
      'TIERS ESSENTIEL',
      'TIERS CONFORT',
      'TOUS RISQUES',
      'formule'
    ];
    
    console.log('🔎 Recherche de mots-clés:\n');
    
    keywords.forEach(kw => {
      const regex = new RegExp(kw, 'gi');
      const matches = text.match(regex);
      
      if (matches) {
        console.log(`✅ "${kw}": ${matches.length} occurrence(s)`);
        
        // Trouver les 3 premières positions
        let lastIndex = 0;
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const index = text.indexOf(matches[i], lastIndex);
          if (index !== -1) {
            const start = Math.max(0, index - 80);
            const end = Math.min(text.length, index + 150);
            const context = text.substring(start, end).replace(/\n/g, ' ');
            console.log(`   Position ${index}: ...${context}...`);
            lastIndex = index + matches[i].length;
          }
        }
        console.log('');
      } else {
        console.log(`❌ "${kw}": non trouvé\n`);
      }
    });
    
    // Montrer un extrait du début
    console.log('📝 Extrait du début (500 premiers caractères):');
    console.log(text.substring(0, 500));
    console.log('...\n');
    
    // Montrer un extrait du milieu
    const middle = Math.floor(text.length / 2);
    console.log('📝 Extrait du milieu:');
    console.log(text.substring(middle, middle + 500));
    console.log('...\n');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
}

checkContent();
