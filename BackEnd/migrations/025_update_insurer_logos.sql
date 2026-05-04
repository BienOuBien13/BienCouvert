-- Migration 025 : Mise à jour des logo_url pour 24 assureurs
-- Date : 2026-05-04

UPDATE insurers SET logo_url = 'https://www.planetecsca.fr/app/uploads/2024/04/43-abeille-assurance.jpg',          updated_at = NOW() WHERE code = 'ABE01';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/6/69/Logo_AESIO_MUTUELLE.png',     updated_at = NOW() WHERE code = 'AES01';
UPDATE insurers SET logo_url = 'https://consent.trustarc.com/get?name=unofficial_logo_AIG.png',                   updated_at = NOW() WHERE code = 'AIG01';
UPDATE insurers SET logo_url = 'https://logos-marques.com/wp-content/uploads/2020/12/Allianz-logo.png',           updated_at = NOW() WHERE code = 'ALL01';
UPDATE insurers SET logo_url = 'https://mon-assurance-obseques.fr/wp-content/uploads/2021/03/apivia-300x154.jpg', updated_at = NOW() WHERE code = 'API01';
UPDATE insurers SET logo_url = 'https://www.umassstore.com/site/product-images/2007819_1.default.jpg?resizeid=13&resizeh=600&resizew=600', updated_at = NOW() WHERE code = 'APP01';
UPDATE insurers SET logo_url = 'https://cmentreprise.fr/wp-content/uploads/2017/05/logo-april.png',               updated_at = NOW() WHERE code = 'APR01';
UPDATE insurers SET logo_url = 'https://strossburi.eu/wp-content/uploads/2023/12/boursorama-logo.png',            updated_at = NOW() WHERE code = 'BOU02';
-- BOU02 peut ne pas exister : upsert pour garantir la présence de l'entrée
INSERT INTO insurers (code, label, full_name, description, logo_url, website_url, phone, email, color, display_order, is_active, created_at, updated_at)
VALUES ('BOU02', 'Boursorama', 'Boursorama', 'Banque en ligne', 'https://strossburi.eu/wp-content/uploads/2023/12/boursorama-logo.png', '', '', '', '', 98, true, NOW(), NOW())
ON CONFLICT (code) DO UPDATE SET logo_url = EXCLUDED.logo_url, updated_at = NOW();
UPDATE insurers SET logo_url = 'https://xwiki.com/fr/download/societe/references/fidelia-assistance/fidelia-assistance.jpg?rev=1.1', updated_at = NOW() WHERE code = 'FID01';
UPDATE insurers SET logo_url = 'https://www.generali.fr/agence/sites/default/files-agences-digitales/2025-05/logo-orizzontale.2020-07-16-17-41-47.jpg', updated_at = NOW() WHERE code = 'GEN01';
UPDATE insurers SET logo_url = 'https://d1p2aimeyx6kdr.cloudfront.net/wp-content/uploads/2024/09/23104124/GMF.jpg', updated_at = NOW() WHERE code = 'GMF01';
UPDATE insurers SET logo_url = 'https://d1p2aimeyx6kdr.cloudfront.net/wp-content/uploads/2011/07/12220236/Gras-Savoye.jpg', updated_at = NOW() WHERE code = 'GRA01';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/fr/thumb/7/78/Logo_Groupama_2024.svg/1280px-Logo_Groupama_2024.svg.png', updated_at = NOW() WHERE code = 'GRO01';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/fr/3/37/Groupe-vyv_logo.jpg',              updated_at = NOW() WHERE code = 'GRO02';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/1/13/Logo_Harmonie_Mutuelle_2.jpg', updated_at = NOW() WHERE code = 'HAR01';
UPDATE insurers SET logo_url = 'https://d1p2aimeyx6kdr.cloudfront.net/wp-content/uploads/2020/01/28140109/la-mutuelle-generale.jpg', updated_at = NOW() WHERE code = 'LAM01';
UPDATE insurers SET logo_url = 'https://www.prevoir.com/Areas/SitePrevoir/content-imgs/logo/logo-big.png',        updated_at = NOW() WHERE code = 'PRE01';
UPDATE insurers SET logo_url = 'https://www.sbm.lu/sites/default/files/products/23e6a43d8bc83bab8983fc4b401b49e228be67c6.jpg', updated_at = NOW() WHERE code = 'SAM01';
UPDATE insurers SET logo_url = 'https://www.lapapatte.fr/wp-content/uploads/2020/06/logo-santevet.jpg',           updated_at = NOW() WHERE code = 'SAN01';
UPDATE insurers SET logo_url = 'https://www.hyperassur.com/web/app/uploads/2024/06/selfassurance.png',            updated_at = NOW() WHERE code = 'SEL01';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/SFR-2022-logo.svg/250px-SFR-2022-logo.svg.png', updated_at = NOW() WHERE code = 'SFR01';
UPDATE insurers SET logo_url = 'https://www.simplesurance.com/wp-content/uploads/main_header.png',                updated_at = NOW() WHERE code = 'SIM01';
UPDATE insurers SET logo_url = 'https://www.pimpmyapp.fr/wp-content/uploads/2022/01/SOCIETE-GENERALE-ASSURANCES-104_RGB.png', updated_at = NOW() WHERE code = 'SOC01';
UPDATE insurers SET logo_url = 'https://upload.wikimedia.org/wikipedia/fr/thumb/e/e8/Logo_Swiss_Life.svg/1280px-Logo_Swiss_Life.svg.png', updated_at = NOW() WHERE code = 'SWI01';
