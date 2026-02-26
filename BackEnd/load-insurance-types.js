const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

const rows = [
  ['AUT01','Automobile','Auto','Assurance automobile et deux-roues','Car','from-red-500 to-orange-500',1],
  ['HAB01','Habitation','Home','Assurance habitation, logement et résidence','Home','from-blue-500 to-cyan-500',2],
  ['SAN01','Santé','Health','Mutuelle santé et complémentaire santé','Heart','from-pink-500 to-rose-500',3],
  ['PRE01','Prévoyance','Provident','Prévoyance individuelle et collective','Shield','from-green-500 to-emerald-500',4],
  ['PRO01','Professionnelle','Professional','Assurance professionnelle (RC Pro, multirisque)','Briefcase','from-purple-500 to-indigo-500',5],
  ['EMP01','Emprunteur','Borrower','Assurance emprunteur et crédit','CreditCard','from-amber-500 to-yellow-500',6],
  ['BAN01','Carte Bancaire','Banking','Assurances liées aux cartes bancaires','CreditCard','from-indigo-500 to-purple-500',7],
  ['APP01','Appareils Électroniques','Electronics','Assurance appareils et équipements électroniques','Smartphone','from-slate-500 to-slate-600',8],
  ['JUR01','Protection Juridique','Legal','Protection et défense juridique','Scale','from-slate-600 to-slate-700',9],
  ['VOY01','Voyage','Travel','Assurance voyage et assistance rapatriement','Package','from-cyan-500 to-blue-500',10],
  ['ANI01','Animaux','Pets','Assurance animaux de compagnie','Heart','from-orange-500 to-red-500',11],
  ['VIE01','Assurance Vie','Life','Assurance vie et épargne','Heart','from-purple-500 to-pink-500',12],
  ['LOI01','Équipements Sportifs & Loisir','Sport','Assurance Équipements Sportifs / Loisir','Sport','from-blue-500 to-cyan-500',13],
  ['AUTRE','Autre','Other',"Autre type d'assurance",'Shield','from-slate-500 to-slate-600',99],
];

const ts = '2026-02-02 21:06:57.323215';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check columns
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='insurance_types' ORDER BY ordinal_position"
    );
    console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

    for (const row of rows) {
      await client.query(
        `INSERT INTO insurance_types(code,label_fr,label_en,description,icon,color,display_order,is_active,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
         ON CONFLICT(code) DO UPDATE SET
           label_fr=EXCLUDED.label_fr, label_en=EXCLUDED.label_en, description=EXCLUDED.description,
           icon=EXCLUDED.icon, color=EXCLUDED.color, display_order=EXCLUDED.display_order,
           is_active=true, updated_at=EXCLUDED.updated_at`,
        [...row, ts, ts]
      );
    }
    console.log(`UPSERT ${rows.length} rows OK`);

    await client.query('COMMIT');

    const count = await client.query('SELECT COUNT(*) FROM insurance_types');
    console.log('Total insurance_types now:', count.rows[0].count);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
