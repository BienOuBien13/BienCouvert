const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://remijolivalt:Remi1982@52.143.159.51:5432/assurclair',
  ssl: { rejectUnauthorized: false }
});

const rows = [
  ['AG201','AG2R La Mondiale','AG2R La Mondiale','Groupe majeur en protection sociale : santé, prévoyance, retraite, épargne.','https://www.ag2rlamondiale.fr/files/live/sites/portail/files/images/Headers/logo-2018.png','https://www.ag2rlamondiale.fr/','09 69 32 20 00','info@ag2rlamondiale.fr','',1],
  ['AGP01','AGPM','AGPM','Mutuelle historique pour les forces armées et leurs familles.','https://commons.wikimedia.org/wiki/Special:FilePath/Logo-groupe-Agpm.png','https://www.agpm.fr/','32 22','','',2],
  ['ANI01','Animaux Santé','Animaux Santé','Assurance santé pour chiens et chats.','https://www.animauxsante.com/wp-content/uploads/2023/08/logo-animaux-sante.png.webp','https://www.animauxsante.com','','','',3],
  ['AXA01','AXA','AXA','Leader mondial en assurances dommages, santé, vie, entreprises.','https://commons.wikimedia.org/wiki/Special:FilePath/AXA_Logo.svg','https://www.axa.com/','01 55 92 26 92','','',4],
  ['BAN01','Banque Populaire Assurances','Banque Populaire Assurances','Assurances auto, habitation, prévoyance pour clients Banque Populaire.','https://www.groupebpce.com/app/uploads/2024/03/fond-transparent-312x351px-BANQUE_POPULAIRE_LOGO_2LG_QUAD.png','https://www.banquepopulaire.fr','','','',5],
  ['BAN02','Banque Postale','Banque Postale','Assurances auto, habitation, santé, emprunteur liées à La Poste.','https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Logo_La_Banque_postale_2022.svg/250px-Logo_La_Banque_postale_2022.svg.png','https://www.labanquepostale.fr','','','',6],
  ['BNP01','BNP Paribas Assurances (Cardif)','BNP Paribas Assurances (Cardif)','Assurance emprunteur, vie, épargne, prévoyance.','https://www.logotypes101.com/logos/244/6388FB2FA8FF831E09790CB07CF84B69/bnppcardifblq.png','https://www.bnpparibascardif.com','','','',7],
  ['BOU01','Boulanger Assurance','Boulanger Assurance','Extensions de garantie et assurances affinitaire pour appareils.','https://www.resilier.fr/images/logo-boulanger.png','https://www.boulanger.com','','','',8],
  ['CNP01','CNP Assurances','CNP Assurances','Leader français en assurance vie et emprunteur.','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRAuVYJS0eEtj83ZDdn5iJVCUt-Hw4WSYgGqA&s','https://www.cnp.fr/','','','',9],
  ['CRE01','Crédit Agricole Assurances','Crédit Agricole Assurances','Assurances générales du Crédit Agricole.','https://upload.wikimedia.org/wikipedia/commons/2/21/Caa-com_rvb.png','https://www.ca-assurances.com/','','','',10],
  ['DIR01','Direct Assurance (AXA)','Direct Assurance (AXA)','Assurance en ligne à bas coût (auto, habitation).','https://upload.wikimedia.org/wikipedia/fr/4/45/Direct_Assurance_logo_2009.png','https://www.direct-assurance.fr/','','','',11],
  ['FNA01','Fnac / Darty (assurances appareils)','Fnac / Darty (assurances appareils)','Assurances appareils et extensions de garantie.','https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Logo_Fnac_Darty.svg/3840px-Logo_Fnac_Darty.svg.png','https://www.fnacdarty.com/','','','',12],
  ['MAA01','MAAF','MAAF','Assureur généraliste du groupe Covéa.','https://upload.wikimedia.org/wikipedia/fr/thumb/a/ab/Logo_MAAF_2007.svg/1280px-Logo_MAAF_2007.svg.png','https://www.maaf.fr/','','','',13],
  ['MAC01','Macif','Macif','Assureur mutualiste (auto, habitation, santé).','https://upload.wikimedia.org/wikipedia/fr/2/2a/Logo_Macif.svg','https://www.macif.fr/','','','',14],
  ['MAI01','MAIF','MAIF','Assureur mutualiste (auto, habitation, protection juridique).','https://upload.wikimedia.org/wikipedia/commons/9/97/Logo_Maif_2019.svg','https://www.maif.fr/','','','',15],
  ['MAL01','Malakoff Humanis','Malakoff Humanis','Mutuelle/prévoyance entreprises et particuliers.','https://www.malakoffhumanis.com/sites/smile/files/styles/header_image/public/images/malakoffhumanis-2025-070-logo-malakoff-humanis-400x255.png.webp?itok=Fi6oF3_i','https://www.malakoffhumanis.com/','','','',16],
  ['MAS01','Mastercard (assurances de carte)','Mastercard (assurances de carte)','Assurances liées aux cartes bancaires.','https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png','https://www.mastercard.com/fr/fr/personal/trouver-une-carte/card-benefits.html','','','',17],
  ['MAT01','Matmut','Matmut','Assureur mutualiste : auto, habitation, santé.','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTpYKeud0pnK05Me8m-gHy94QP_AnFjhp-1BA&s','https://www.matmut.fr/','','','',18],
  ['MGE01','MGEN','MGEN',"Mutuelle du personnel de l'Éducation nationale (groupe VYV).",'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmQG-VhsGDR53iyzgaY-0kD-D_InqaGftUsA&s','https://www.mgen.fr','','','',19],
  ['MMA01','MMA','MMA','Assureur généraliste du groupe Covéa.','https://upload.wikimedia.org/wikipedia/commons/2/26/Logo_MMA.jpg','https://www.mma.fr','','','',20],
  ['SOL01','Solly Azar (courtier)','Solly Azar (courtier)','Courtier multirisques (auto, deux roues, animaux).','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQow0NbFbStLlYd_U7X5uqDbaXj4lIUnXSxCw&s','https://www.sollyazar.com','','','',21],
  ['VIS01','Visa (assurances de carte)','Visa (assurances de carte)','Assurances liées aux cartes bancaires.','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIO4Zr16aiL2HFOy4P0CQ9JVvRFE1XZLcYiQ&s','https://www.visa.fr','','','',22],
  ['AME01','American Express Assurances','American Express Assurances','Assurances voyage et achats liées aux cartes AMEX.','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSJ3bPf4Xrj8S5rIj6fOysQAlYlF-frvYEtxQ&s','https://www.americanexpress.com','','','',23],
  ['ABE01','Abeille Assurances','Abeille Assurances','Assureur français multisectoriel (auto, habitation, prévoyance), appartenant au groupe Macif/Covéa.','','','','','',24],
  ['ACE01','ACE / Chubb','ACE / Chubb','Compagnie internationale spécialisée en assurances dommages, responsabilité, et affinitaire.','','','','','',25],
  ['ACH01','Acheel','Acheel','Assurtech française proposant mutuelle santé, chien/chat et habitation 100 % digitale.','','','','','',26],
  ['ACS01','ACS (Assurance pour expatriés & voyage)','ACS (Assurance pour expatriés & voyage)','Courtier spécialiste des assurances voyage et expatriés.','','','','','',27],
  ['ACT01','Active Assurances','Active Assurances','Courtier proposant des assurances auto et habitation à bas coût.','','','','','',28],
  ['AES01','Aésio Mutuelle','Aésio Mutuelle','Grande mutuelle française spécialisée en santé et prévoyance.','','','','','',29],
  ['AIG01','AIG','AIG','Assureur international spécialisé en entreprises, RC, cyber, voyages.','','','','','',30],
  ['ALA01','Alan','Alan','Assurtech française spécialisée en mutuelle santé 100 % digitale.','','','','','',31],
  ['ALL01','Allianz','Allianz','Un des plus grands assureurs mondiaux : auto, habitation, santé, entreprises.','','','','','',32],
  ['AMA01','Amaguiz','Amaguiz',"Filiale d'AXA spécialisée en assurance auto/habitation en ligne.",'','','','','',33],
  ['AMT01','AmTrust','AmTrust','Assureur spécialisé en PME et niches assurantielles.','','','','','',34],
  ['API01','Apivia','Apivia','Mutuelle du groupe Macif (Covéa), spécialisée en santé et prévoyance.','','','','','',35],
  ['APP01','AppleCare','AppleCare','Assurance/réparation proposée par Apple pour ses appareils.','','','','','',36],
  ['APR01','April','April','Courtier français en assurance santé, emprunteur et voyage.','','','','','',37],
  ["ASS01","Assur O'Poil","Assur O'Poil",'Assurance santé pour chiens/chats.','','','','','',38],
  ['ASS02','Assur Travel','Assur Travel','Assurances voyage et assistance internationale.','','','','','',39],
  ['AVA01','AVA','AVA','Spécialiste assurances voyage et étudiants internationaux.','','','','','',40],
  ['BPC01','BPCE Assurances','BPCE Assurances',"Assure le réseau Banque Populaire + Caisse d'Épargne.",'','','','','',41],
  ['BTP01','BTP Banque Assurances','BTP Banque Assurances','Solutions assurantielles pour le secteur du BTP.','','','','','',42],
  ['BUL01','Bulle Bleue','Bulle Bleue','Mutuelle santé haut de gamme pour animaux.','','','','','',43],
  ['CAR01','Carac','Carac',"Mutuelle d'épargne, retraite, prévoyance.",'','','','','',44],
  ['CAR02','Cardif','Cardif','Voir BNP Paribas Cardif.','','','','','',45],
  ['CAR03','Carrefour Assurance','Carrefour Assurance','Assurances auto, habitation, animaux, scolaire, mobile.','','','','','',46],
  ['CFD01','CFDP','CFDP','Spécialisé en protection juridique.','','','','','',47],
  ['CHA01','Chapka','Chapka','Courtier spécialisé en assurances voyage.','','','','','',48],
  ['CHU01','Chubb','Chubb','Assureur international (affinitaire, entreprises, biens).','','','','','',49],
  ['COO01','Coover','Coover','Néo-courtier spécialisé en assurances professionnelles.','','','','','',50],
  ['COV01','Covéa PJ','Covéa PJ','Protection juridique du groupe Covéa (MAAF, MMA, GMF).','','','','','',51],
  ['DAL01','Dalma','Dalma','Assurance santé pour chiens et chats, 100 % digitale.','','','','','',52],
  ['DAS01','D.A.S. Protection Juridique','D.A.S. Protection Juridique','Spécialiste de la protection juridique.','','','','','',53],
  ['ECA01','ECA Assurances (courtier)','ECA Assurances (courtier)','Courtier multirisques : animaux, habitation, emprunteur.','','','','','',54],
  ['EUR01','Eurofil (Allianz Direct)','Eurofil (Allianz Direct)',"Assurance directe d'Allianz (auto, habitation).",'','','','','',55],
  ['FID01','Fidélia Assistance (Covéa)','Fidélia Assistance (Covéa)',"Plateforme d'assistance du groupe Covéa.",'','','','','',56],
  ['FMA01','FMA Assurances (courtier)','FMA Assurances (courtier)','Courtier spécialisé auto, moto, santé internationale.','','','','','',57],
  ['GEN01','Generali France','Generali France','Grand assureur généraliste européen.','','','','','',58],
  ['GMF01','GMF (Covéa)','GMF (Covéa)',"Mutuelle d'assurance du groupe Covéa (auto, habitation, PJ).",'','','','','',59],
  ['GRA01','Gras Savoye / WTW (courtier)','Gras Savoye / WTW (courtier)','Courtier international pour entreprises.','','','','','',60],
  ['GRO01','Groupama','Groupama','Assureur mutualiste multisectoriel.','','','','','',61],
  ['GRO02','Groupe VYV','Groupe VYV','Groupe mutualiste majeur (Harmonie, MGEN, etc.).','','','','','',62],
  ['HAR01','Harmonie Mutuelle (Groupe VYV)','Harmonie Mutuelle (Groupe VYV)','Mutuelle santé du groupe VYV.','','','','','',63],
  ['HEY01','Heymondo (assurance voyage)','Heymondo (assurance voyage)','Assurances voyage et assistance.','','','','','',64],
  ['HIS01','Hiscox France','Hiscox France','Spécialiste RC pro, cyber, entreprises et professions libérales.','','','','','',65],
  ['IDE01','Identités Mutuelle','Identités Mutuelle','Mutuelle santé indépendante.','','','','','',66],
  ['JUR01','Juridica (AXA)','Juridica (AXA)',"Protection juridique d'AXA.",'','','','','',67],
  ['KOZ01','Kozoo (animaux)','Kozoo (animaux)','Assurance santé pour animaux.','','','','','',68],
  ['LAM01','La Mutuelle Générale','La Mutuelle Générale','Mutuelle santé et prévoyance.','','','','','',69],
  ['LEM01','Lemonade (France)','Lemonade (France)','Assurtech internationale (habitation, animaux).','','','','','',70],
  ["LOL01","L'olivier Assurance (Admiral)","L'olivier Assurance (Admiral)",'Assurance auto en ligne (groupe Admiral).','','','','','',71],
  ['LOV01','Lovys (néo-courtier)','Lovys (néo-courtier)','Néo-courtier en assurances digitales (habitation, auto, animaux).','','','','','',72],
  ['MAG01','Magnolia (courtier emprunteur)','Magnolia (courtier emprunteur)','Courtier spécialisé en assurance emprunteur.','https://upload.wikimedia.org/wikipedia/fr/thumb/2/2a/Logo_Macif.svg/960px-Logo_Macif.svg.png?20191211002907','https://www.macif.fr/','','','',73],
  ['MET01','MetLife France','MetLife France','Assurance emprunteur et prévoyance.','','','','','',74],
  ['MUT01','Mutuaide (Groupama)','Mutuaide (Groupama)','Assistance du groupe Groupama.','','','','','',75],
  ['ORA01','Orange Assurance mobile','Orange Assurance mobile','Assurances pour smartphones.','','','','','',76],
  ['OTH01','Otherwise','Otherwise','Assurtech collaborative (santé, animaux).','','','','','',77],
  ['PRE01','PRÉVOIR','PRÉVOIR',"Spécialiste de la prévoyance et de l'assurance vie.",'','','','','',78],
  ['QBE01','QBE France (entreprises)','QBE France (entreprises)','Assureur entreprise international.','','','','','',79],
  ['SAM01','Samsung Care+','Samsung Care+','Assurance/réparation pour appareils Samsung.','','','','','',80],
  ['SAN01','SantéVet','SantéVet','Assurance santé pour animaux.','','','','','',81],
  ["SEL01",'Selfassurance (marque ECA)','Selfassurance (marque ECA)',"Marque digitale d'ECA.",'','','','','',82],
  ['SFA01','SFAM (affinitaire)','SFAM (affinitaire)','Assurance affinitaire (smartphones, appareils).','','','','','',83],
  ['SFR01','SFR Assurance (by Chubb)','SFR Assurance (by Chubb)','Assurance mobile proposée avec SFR.','','','','','',84],
  ['SIM01','simplesurance','simplesurance',"Assurances d'appareils et ecommerce.",'','','','','',85],
  ['SIM02','Simplis (assurances pros)','Simplis (assurances pros)','Assurances professionnelles.','','','','','',86],
  ['SMA01','SMABTP (et SMAvie BTP)','SMABTP (et SMAvie BTP)','Assurances dédiées au BTP.','','','','','',87],
  ['SMA02','Smatis','Smatis','Mutuelle santé.','','','','','',88],
  ['SOC01','Société Générale Assurances','Société Générale Assurances','Assurance auto/habitation/vie pour clients SG.','','','','','',89],
  ['SPB01','SPB (assurance affinitaire)','SPB (assurance affinitaire)','Assurance affinitaire (smartphones, appareils).','','','','','',90],
  ['STE01','Stello (assurances pros)','Stello (assurances pros)','Assurances professionnelles digitales.','','','','','',91],
  ['SWI01','Swiss Life France','Swiss Life France','Santé, prévoyance, épargne haut de gamme.','','','','','',92],
  ['THE01','Thélem Assurances','Thélem Assurances','Assureur régional (auto, habitation, RC).','','','','','',93],
  ['UNE01','Unéo (mutuelle des forces armées)','Unéo (mutuelle des forces armées)','Mutuelle des forces armées.','','','','','',94],
  ['UTW01','Utwin (emprunteur)','Utwin (emprunteur)','Assurance emprunteur distribuée via courtiers.','','','','','',95],
  ["ZEN01","Zen'Up (emprunteur)","Zen'Up (emprunteur)",'Assurance emprunteur 100 % en ligne.','','','','','',96],
  ['ZUR01','Zurich France (entreprises)','Zurich France (entreprises)','Assureur entreprise international.','','','','','',97],
];

const ts = '2026-02-02 21:06:57.736411';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete insurers not referenced by policies
    const codes = rows.map(r => r[0]);
    // First: delete rows from insurers that are NOT in the new list and NOT referenced by policies
    await client.query(
      `DELETE FROM insurers WHERE code NOT IN (${codes.map((_, i) => '$' + (i + 1)).join(',')})
       AND code NOT IN (SELECT DISTINCT insurer_code FROM policies WHERE insurer_code IS NOT NULL)`,
      codes
    );
    console.log('DELETE old insurers OK');

    // Upsert all rows
    for (const row of rows) {
      await client.query(
        `INSERT INTO insurers(code,label,full_name,description,logo_url,website_url,phone,email,color,display_order,is_active,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12)
         ON CONFLICT(code) DO UPDATE SET
           label=EXCLUDED.label, full_name=EXCLUDED.full_name, description=EXCLUDED.description,
           logo_url=EXCLUDED.logo_url, website_url=EXCLUDED.website_url, phone=EXCLUDED.phone,
           email=EXCLUDED.email, color=EXCLUDED.color, display_order=EXCLUDED.display_order,
           is_active=true, updated_at=EXCLUDED.updated_at`,
        [...row, ts, ts]
      );
    }
    console.log(`UPSERT ${rows.length} rows OK`);

    await client.query('COMMIT');

    const count = await client.query('SELECT COUNT(*) FROM insurers');
    console.log('Total insurers now:', count.rows[0].count);
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
