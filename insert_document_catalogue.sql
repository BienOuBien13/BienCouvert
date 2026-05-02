-- ============================================================================
-- Alimentation du catalogue de documents (document_catalogue)
-- 128 lignes couvrant 16 assureurs × plusieurs types × variantes
--
-- Prérequis : migrations 023 + 024 déjà appliquées
--
-- matrix_status = 'discovered' : URL connue, document pas encore ingéré
-- matrix_status conservé s'il est déjà 'indexed'
--
-- Colonnes mappées depuis le fichier source :
--   Insurer           → insurer_code
--   Insurance_type    → insurance_type_code
--   sub_type          → insurance_sub_type_code
--   Type              → doc_type  (défaut 'CG' si vide)
--   Détail            → notes  (+ formula_hints quand nom court de formule/produit)
--   URL               → current_url
-- ============================================================================

BEGIN;

INSERT INTO document_catalogue
    (insurer_code, insurance_type_code, insurance_sub_type_code, doc_type,
     current_url, notes, formula_hints, matrix_status)
VALUES

-- ── Abeille Assurances ──────────────────────────────────────────────────────
('ABE01','VIE01', NULL,              'IPID', 'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2023/12/Assurance_obseques_abeille-assurances.pdf',                                                      NULL, NULL, 'discovered'),
('ABE01','EMP01', NULL,              'CG',   'https://www.abeille-vie-partenaires.fr/wprev/app/httpproxy/BaseDoc/NAEV3777F',                                                                                    NULL, NULL, 'discovered'),
('ABE01','HAB01', NULL,              'IPID', 'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2023/11/assurance_habitation_abeille_assurances.pdf',                                                    NULL, NULL, 'discovered'),
('ABE01','PRE01', 'PREV_INDIV',      'NI',   'https://www.abeille-vie-partenaires.fr/wprev/app/httpproxy/BaseDoc/V5409',                                                                                       NULL, NULL, 'discovered'),
('ABE01','PRE01', 'PREV_TNS',        'NI',   'https://www.abeille-vie-partenaires.fr/wprev/app/httpproxy/BaseDoc/V5411',                                                                                       NULL, NULL, 'discovered'),
-- Deux CG pro distinctes → sous-types dérivés du détail pour éviter le conflit d'unicité
('ABE01','PRO01', 'PRO_CONSTRUCTION','CG',   'https://imentreprises.fr/ime/services-en-ligne/doc/CG/RCDCGPRO2024_PROXIA_ABEILLE.pdf',                                                                         'Pro-construction', ARRAY['Pro-construction'], 'discovered'),
('ABE01','PRO01', 'PRO_APICOLES',    'CG',   'https://www.abeille-finisterienne.com/wp-content/uploads/2025/01/cg_apico_2025_vf.pdf',                                                                         'Activités Apicoles', ARRAY['Activités Apicoles'], 'discovered'),

-- ── Aésio Mutuelle ───────────────────────────────────────────────────────────
('AES01','PRO01', NULL,              'IPID', 'https://mutuelle.fr/61-aesio-mutuelle/856-aesio-sante-pro-niveau-1/conditions_generales.pdf',                                                                    NULL, NULL, 'discovered'),
('AES01','SAN01', NULL,              'CG',   'https://www.aesio.fr/sites/default/files/2021-10/R%C3%A8glement%20mutualiste%20particulier%20-%20AESIO%20Sante%20Particuliers.pdf',                              NULL, NULL, 'discovered'),

-- ── AG2R La Mondiale ─────────────────────────────────────────────────────────
('AG201','SAN01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2016/06/conditions-generales-mutuelle-sante-ag2r.pdf',                                                   'Obligatoire', ARRAY['Obligatoire'], 'discovered'),
('AG201','PRE01', 'PREV_INDIV',      'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/07/ag2r-prevoyance-tns-plaquette.pdf',                                                             NULL, NULL, 'discovered'),
('AG201','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2016/04/conditions-generales-assurance-habitation-ag2r-la-mondiale.pdf',                                'habitation DOMÉA', ARRAY['DOMÉA'], 'discovered'),
('AG201','PRE01', NULL,              'NI',   'https://comparateur-prevoyance.com/wp-content/themes/twentyseventeen-child/CGV/LA-MONDIALE-Individuel-Majo.pdf',                                                 NULL, NULL, 'discovered'),
('AG201','PRE01', NULL,              'CG',   'https://www.cnptp66.fr/wp-content/uploads/2023/07/ag2r-vf-cg-ccn-66-synd-version-juillet-2023.pdf',                                                             NULL, NULL, 'discovered'),

-- ── AGPM ─────────────────────────────────────────────────────────────────────
('AGP01','AUT01', NULL,              'NI',   'https://www.agpm.fr/pdf/assurance/auto/agpm-auto-notice-information.pdf',                                                                                        NULL, NULL, 'discovered'),
('AGP01','AUT01', NULL,              'IPID', 'https://www.agpm.fr/pdf/din/agpm-auto-din.pdf',                                                                                                                  NULL, NULL, 'discovered'),
('AGP01','AUT01', NULL,              'CG',   'https://www.mutuelledesmotards.fr/sites/default/files/conditiongenerales-produit/Conditions%20g%C3%A9n%C3%A9rales%20-Assurance-Automobile-Tego_AMDM.pdf',       'Tego', ARRAY['Tego'], 'discovered'),
('AGP01','VIE01', NULL,              'NI',   'https://www.agpm.fr/pdf/prevoyance/assurance-vie-entiere/agpm-assurance-vie-entiere-notice.pdf',                                                                 NULL, NULL, 'discovered'),
('AGP01','EMP01', NULL,              'NI',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2015/05/Conditions-generales-AGPM.pdf',                                                                  NULL, NULL, 'discovered'),
('AGP01','HAB01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/09/conditions-generales-assurance-habitation-agpm.pdf',                                             'Tego', ARRAY['Tego'], 'discovered'),
('AGP01','JUR01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2018/12/conditions-generales-assurance-protection-juridique-agpm.pdf',                                   NULL, NULL, 'discovered'),
('AGP01','PRE01', NULL,              'NI',   'https://www.agpm.fr/pdf/prevoyance/objectif-prevoyance/agpm-op-dispositions-generales.pdf',                                                                      NULL, NULL, 'discovered'),
('AGP01','SAN01', NULL,              'IPID', 'https://www.agpm.fr/pdf/din/agpm-objectif-sante-din.pdf',                                                                                                        NULL, NULL, 'discovered'),

-- ── AIG ──────────────────────────────────────────────────────────────────────
('AIG01','PRO01', NULL,              'CG',   'https://www.coover.fr/wp-content/uploads/2022/02/Conditions-G%C3%A9n%C3%A9rales-AIG.pdf',                                                                       NULL, NULL, 'discovered'),
('AIG01','VOY01', NULL,              'CG',   'https://www.ava.fr/wp-content/uploads/2023/01/CG-PLAN-SANTE-AU-PAIR.pdf',                                                                                        NULL, NULL, 'discovered'),

-- ── Allianz ───────────────────────────────────────────────────────────────────
('ALL01','ANI01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/09/allianz-sante-chiens-chats-cg.pdf',                                                             NULL, NULL, 'discovered'),
('ALL01','AUT01', NULL,              'CG',   'https://www.sosmalus.eu/app/uploads/2025/09/conidtions_generales_allianz_com01755-v1021-bd.pdf',                                                                 NULL, NULL, 'discovered'),
('ALL01','VIE01', NULL,              'CG',   'https://www.allianzcare.com/content/dam/onemarketing/azcare/allianzcare/fr/docs/DOC-IBG-Flexicare-fr-FR-0524.pdf',                                               NULL, NULL, 'discovered'),
('ALL01','EMP01', NULL,              'CG',   'https://static.lesfurets.com/conditionsGenerales/CG_EMPRUNTEUR_ALLIANZ.pdf',                                                                                     NULL, NULL, 'discovered'),
('ALL01','HAB01', NULL,              'CG',   'https://www.retro.fr/sites/default/files/2022-11/dispositions-generales-contrat-habitation.pdf',                                                                 NULL, NULL, 'discovered'),
('ALL01','JUR01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2018/12/conditions-generales-assurance-protection-juridique-allianz.pdf',                                NULL, NULL, 'discovered'),
('ALL01','PRE01', 'PREV_ENT',        'CG',   'https://www.allianzcare.com/content/dam/onemarketing/azcare/allianzcare/fr/docs/DOC-LDADD-CBG-FR-1018.pdf',                                                     NULL, NULL, 'discovered'),
('ALL01','PRE01', 'PREV_TNS',        'CG',   'https://comparateur-prevoyance.com/wp-content/themes/twentyseventeen-child/CGV/CG-Allianz-Juin-2017.pdf',                                                       NULL, NULL, 'discovered'),
('ALL01','PRE01', 'PREV_INDIV',      'CG',   'https://www.allianzcare.com/content/dam/onemarketing/azcare/allianzcare/fr/docs/DOC-LDADD-FS-FR-1016.pdf',                                                      NULL, NULL, 'discovered'),
('ALL01','PRO01', NULL,              'CG',   'https://www.allianzcare.com/content/dam/onemarketing/azcare/allianzcare/fr/docs/DOC-Embrace-CBG-FR-0624.pdf',                                                   NULL, NULL, 'discovered'),
('ALL01','SAN01', NULL,              'IPID', 'https://www.allianz.fr/content/dam/onemarketing/azfr/common/particuliers/sante-et-prevoyance/pdf-sante-prevoyance/sante-hospi-complementaire-sante-individuelle.PDF', NULL, NULL, 'discovered'),
('ALL01','VOY01', NULL,              'CG',   'https://odysseevoyages.com/rtefiles/fichier/Allianz_Forfait_assurance_Voyage_Classic_280421.pdf',                                                                NULL, NULL, 'discovered'),

-- ── Animaux Santé ─────────────────────────────────────────────────────────────
('ANI01','ANI01', NULL,              'CG',   'https://www.animauxsante.com/wp-content/uploads/2017/06/Conditions_generales_AXA-SERENITE-CONFORT_0617.pdf',                                                    'FORMULES SERENITE (CHAT), CONFORT (CHIEN)', ARRAY['SERENITE','CONFORT'], 'discovered'),

-- ── Apivia ────────────────────────────────────────────────────────────────────
('API01','AUT01', NULL,              'CG',   'https://aic-giovannetti.info/wp-content/uploads/2020/04/APIVIA-AUTO-CGE-02-0518.pdf',                                                                            NULL, NULL, 'discovered'),
('API01','HAB01', NULL,              'CG',   'https://aic-giovannetti.info/wp-content/uploads/2020/04/APIVIA-MRH-CGE-02-1118.pdf',                                                                            NULL, NULL, 'discovered'),
('API01','PRE01', NULL,              'CG',   'https://www.assureurprevoyance.com/userfiles/file/mutuellesante/CG_FRAIS_DOBSEQUES_APIVIA.pdf',                                                                  NULL, NULL, 'discovered'),
('API01','SAN01', NULL,              'CG',   'https://bonne-assurance.com/wp-content/uploads/2021/04/apivia_vitamin2_conditions_generales.pdf',                                                               NULL, NULL, 'discovered'),

-- ── AppleCare ─────────────────────────────────────────────────────────────────
('APP01','APP01', NULL,              'CG',   'https://www.apple.com/legal/sales-support/applecare/applecareplus/2203/220308_applecareplusmac_fr_tc.pdf',                                                       NULL, NULL, 'discovered'),

-- ── April ─────────────────────────────────────────────────────────────────────
('APR01','AUT01', NULL,              'CG',   'https://assets.april.fr/prismic/doc-pro-april-activite-professionnelle-auto-pro-conditions-generales.pdf?vh=34c708&func=proxy',                                  NULL, NULL, 'discovered'),
('APR01','EMP01', NULL,              'CG',   'https://assets.april.fr/prismic/doc-part-april-adp-optimum-plus-livret-garanties.pdf',                                                                          NULL, NULL, 'discovered'),
('APR01','HAB01', NULL,              'CG',   'https://www.april-partenaires.fr/sites/default/files/documents/CG%20Habitation%20Premium_avr16_HD_0.pdf',                                                       NULL, NULL, 'discovered'),
('APR01','PRE01', 'PREV_ENT',        'CG',   'https://www.tousmescontrats.com/wp-content/uploads/2020/01/Conditions-g%C3%A9n%C3%A9rales-Pr%C3%A9voyance-Pro-APRIL.pdf',                                       NULL, NULL, 'discovered'),
('APR01','PRE01', 'PREV_TNS',        'CG',   'https://assets.april.fr/prismic/documents/pro/prevoyance-pro-premium/doc-pro-prevoyance-premium-exemples-remboursements-ssi-fevrier-2025.pdf?vh=6125c1&func=proxy', NULL, NULL, 'discovered'),
('APR01','PRO01', 'PRO_MRP',         'CG',   'https://www.tousmescontrats.com/wp-content/uploads/2020/01/Conditions-g%C3%A9n%C3%A9rales-Pr%C3%A9voyance-G%C3%A9rant-Majoritaire-Profession-Lib%C3%A9rale.pdf', NULL, NULL, 'discovered'),
('APR01','SAN01', NULL,              'CG',   'https://assets.april.fr/prismic/documents/particuliers/doc-part-april-sante-notice-garanties.pdf?vh=76bb0b&func=proxy',                                         NULL, NULL, 'discovered'),
('APR01','VOY01', NULL,              'CG',   'https://assets.april.fr/prismic/documents/particuliers/doc-part-april-international-my-tempo-cover-conditions-generales.pdf?vh=2553da&func=proxy',               NULL, NULL, 'discovered'),

-- ── AXA ───────────────────────────────────────────────────────────────────────
('AXA01','ANI01', NULL,              'CG',   'https://www.yesassurances.fr/wp-content/uploads/2020/04/cg-sante-animale.pdf',                                                                                   'Animax', ARRAY['Animax'], 'discovered'),
('AXA01','AUT01', 'AUTO',            'CG',   'https://espaceclient.axa.fr/content/dam/axa/ecc/pdf/Espace%20Documentaire/CG/AUTO/972115D.pdf',                                                                 NULL, NULL, 'discovered'),
('AXA01','AUT01', 'MOTO',            'CG',   'https://www.yesassurances.fr/wp-content/uploads/2015/02/AXA_Conditions_Generales_Assurance_moto.pdf',                                                           NULL, NULL, 'discovered'),
('AXA01','VIE01', 'VIE',             'CG',   'https://luxembourg-axa.cdn.axa-contento-118412.eu/luxembourg-axa/38af0543-eca3-41b4-91ce-24ae614e42a0_CG_BILProtectionPretImmobyAXA_W12_18_Fr.pdf',            NULL, NULL, 'discovered'),
('AXA01','EMP01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/08/assurance-pret-immobilier-conditions-generales-axa.pdf',                                        NULL, NULL, 'discovered'),
('AXA01','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://aic-giovannetti.info/wp-content/uploads/2016/01/AXA-HABITATION-2016-01-150101M.pdf',                                                                    NULL, NULL, 'discovered'),
('AXA01','JUR01', NULL,              'CG',   'https://www.yesassurances.fr/wp-content/uploads/2015/02/Conditions-Generales-ma-protection-juridique-AXA.pdf',                                                  NULL, NULL, 'discovered'),
('AXA01','LOI01', NULL,              'CG',   'https://passion.axa.fr/contents/dipa-cg/2024-10-cg-assurance-plaisance.pdf',                                                                                    NULL, NULL, 'discovered'),
('AXA01','PRO01', NULL,              'CG',   'https://aic-giovannetti.info/wp-content/uploads/2021/07/AXA-Atouts-Pro-06-2021.pdf',                                                                            NULL, NULL, 'discovered'),
('AXA01','SAN01', NULL,              'CG',   'https://www.yesassurances.fr/wp-content/uploads/2015/02/AXA_Conditions_Generales_Assurance_Sante.pdf',                                                         NULL, NULL, 'discovered'),
('AXA01','VOY01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2018/06/conditions-generales-voyageo-axa.pdf',                                                         'Voyageo', ARRAY['Voyageo'], 'discovered'),

-- ── Banque Populaire Assurances ───────────────────────────────────────────────
('BAN01','AUT01', NULL,              'CG',   'https://www.img.banquepopulaire.fr/app/uploads/sites/5/2021/10/21165536/7494-cg-auto-natixis-bp-v6-060320-compressed.pdf',                                      NULL, NULL, 'discovered'),
('BAN01','VIE01', NULL,              'CG',   'https://www.img.banquepopulaire.fr/app/uploads/sites/22/2022/10/28080533/cg-multirisque-des-accidents-de-la-vie-2019-03.pdf',                                   NULL, NULL, 'discovered'),
('BAN01','HAB01', NULL,              'CG',   'https://www.img.banquepopulaire.fr/app/uploads/sites/5/2022/11/04154904/7880-cg-mrh-rprs-maj2022-bp-compressed.pdf',                                           NULL, NULL, 'discovered'),

-- ── Banque Postale ────────────────────────────────────────────────────────────
('BAN02','AUT01', NULL,              'CG',   'https://www.index-assurance.fr/fichiers/cg/conditions-generales-la-banque-postale-auto-fevrier-2023.pdf',                                                       NULL, NULL, 'discovered'),
('BAN02','PRO01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/12/assurance-multirisque-pro-banque-postale-conditions-generales.pdf',                             NULL, NULL, 'discovered'),
('BAN02','HAB01', NULL,              'CG',   'https://www.immobilier-danger.com/dl/mrh/assurance-habitation-banque-postale-conditions-generales.pdf',                                                         NULL, NULL, 'discovered'),
('BAN02','SAN01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/07/mutuelle-sante-banque-postale-cg.pdf',                                                         NULL, NULL, 'discovered'),

-- ── BNP Paribas Assurances (Cardif) ──────────────────────────────────────────
('BNP01','AUT01', NULL,              'CG',   'https://mabanque.bnpparibas/content/dam/mabanque/rsc/contrib/pdf/CG_ASSURANCE_AUTO_BNPP.pdf',                                                                   NULL, NULL, 'discovered'),
('BNP01','HAB01', NULL,              'CG',   'https://mabanque.bnpparibas/content/dam/mabanque/rsc/contrib/pdf/CG_ASSURANCE_HABITATION_BNPP.pdf',                                                            NULL, NULL, 'discovered'),
('BNP01','VIE01', NULL,              'CG',   'https://www.assurancevie.com/assets/files/web/documents/assurance_vie/lucya_cardif/gestion_profilee_vie/dic_bnp_equilibre.pdf',                                 NULL, NULL, 'discovered'),
('BNP01','EMP01', NULL,              'CG',   'https://mabanquepro.bnpparibas/content/dam/mabanque/rsc/contrib/pdf/IPID-assurance-emprunteur.pdf',                                                             NULL, NULL, 'discovered'),
('BNP01','PRE01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2016/06/conditions-generales-protection-accidents-de-la-vie-bnp-paribas.pdf',                          NULL, NULL, 'discovered'),
('BNP01','SAN01', NULL,              'CG',   'https://mabanque.bnpparibas/content/dam/mabanque/rsc/contrib/pdf/noticeinfosante.pdf',                                                                          NULL, NULL, 'discovered'),

-- ── Boulanger Assurance ───────────────────────────────────────────────────────
('BOU01','APP01', NULL,              'CG',   'https://www.boulanger.com/content/dam/Boulanger/direction-marketing/infinity/cgu---notice---infinity-smartphone/Infinitysmartphone-cgu-04092024.pdf',           'INFINITY', ARRAY['INFINITY'], 'discovered'),

-- ── Boursorama ────────────────────────────────────────────────────────────────
('BOU02','BAN01', NULL,              'NI',   'https://api.boursobank.com/services/api/files/public-legal-insurance-document.phtml?type=protection-public-cg',                                                  'BoursoProtect', ARRAY['BoursoProtect'], 'discovered'),

-- ── Direct Assurance (AXA) ────────────────────────────────────────────────────
('DIR01','AUT01', NULL,              'CG',   'https://www.direct-assurance.fr/img/Pdf/cg_auto.pdf',                                                                                                           NULL, NULL, 'discovered'),
-- CG Moto distincte → sous-type pour éviter le conflit d'unicité
('DIR01','AUT01', 'MOTO',            'CG',   'https://directassurance.cdn.axa-contento-118412.eu/directassurance/a7966465-2398-4184-8659-2cf7ee534a00_CG-Ma-Moto-Mon-Cyclo-981029-0324.pdf',                  'Moto', ARRAY['Moto'], 'discovered'),
('DIR01','HAB01', NULL,              'CG',   'https://directassurance.cdn.prismic.io/directassurance/aHi1eUMqNJQqIBEz_HABITATION_MRH_07.25.pdf',                                                              NULL, NULL, 'discovered'),
('DIR01','JUR01', NULL,              'CG',   'https://directassurance.cdn.axa-contento-118412.eu/directassurance/40913234-c7d6-4764-bfc6-536f0b9736bc_CG+Direct+Assurance+Protection+juridique+-+072022.pdf', NULL, NULL, 'discovered'),
('DIR01','SAN01', NULL,              'IPID', 'https://directassurance.cdn.axa-contento-118412.eu/directassurance/87725143-170d-4a82-877c-17943adafa40_fiche-ipid-sante-responsable.pdf',                      NULL, NULL, 'discovered'),
('DIR01','SAN01', NULL,              'CG',   'https://www.direct-assurance.fr/img/Pdf/cg_sante.pdf',                                                                                                          NULL, NULL, 'discovered'),

-- ── MAAF ──────────────────────────────────────────────────────────────────────
('MAA01','VIE01', NULL,              'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Vie_quotidienne/CG/MAAF_Conditions_generales_Assurance_deces_2313.pdf',                            NULL, NULL, 'discovered'),
('MAA01','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Habitation/CG/MAAF_Conditions_generales_Assurance_Tempo_habitation_2339.pdf',                     NULL, NULL, 'discovered'),
('MAA01','HAB01', 'PNO',             'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Habitation/CG/MAAF_Conditions_generales_Assurance_PNO_2341.pdf',                                  'PNO', ARRAY['PNO'], 'discovered'),
('MAA01','PRE01', NULL,              'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Vie_quotidienne/CG/MAAF_Conditions_generales-Plan_prevoyance_Horizon_2178.pdf',                   'Prévoyance professionnels indépendants', ARRAY['Horizon'], 'discovered'),
('MAA01','PRO01', NULL,              'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Professionnels/CG/MAAF_Conditions_generales_Multirisque_pro_11031.pdf',                           'Multirisque professionnel', NULL, 'discovered'),
('MAA01','SAN01', NULL,              'CG',   'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Sante/CG/MAAF_conditions_generales_contrat_complementaire_sante_vivazen_2542.pdf',                NULL, NULL, 'discovered'),

-- ── Macif ─────────────────────────────────────────────────────────────────────
('MAC01','ANI01', 'ANIMAUX',         'CG',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_habitation/CG_macif_assurance_chien_chat.pdf',                                        NULL, NULL, 'discovered'),
('MAC01','AUT01', 'AUTO',            'CG',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_vehicules/CG_Auto.pdf',                                                               NULL, NULL, 'discovered'),
('MAC01','PRE01', 'PREV_INDIV',      'NI',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_prevoyance/NID-Garantie_deces.pdf',                                                   NULL, NULL, 'discovered'),
('MAC01','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_habitation/CG-Macif-Habitation.pdf',                                                  NULL, NULL, 'discovered'),
('MAC01','JUR01', 'JUR_PRO',         'CG',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_professionnel_entreprise/CG-protection-juridique-professionnels.pdf',                 NULL, NULL, 'discovered'),
('MAC01','PRE01', 'PREV_TNS',        'CG',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_professionnel_entreprise/CG_Prevoyance_Entreprises.pdf',                              'Prévoyance Entreprises', ARRAY['Prévoyance Entreprises'], 'discovered'),
('MAC01','SAN01', 'SANTE_INDIV',     'NI',   'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_prevoyance/NID/NID_assurance_sante.pdf',                                              NULL, NULL, 'discovered'),

-- ── MAIF ──────────────────────────────────────────────────────────────────────
('MAI01','AUT01', 'AUTO',            'CG',   'https://www.index-assurance.fr/fichiers/cg/conditions-generales-maif-auto-janvier-2023.pdf',                                                                   NULL, NULL, 'discovered'),
('MAI01','AUT01', 'AUTO_CORP',       'NI',   'https://www.maif.fr/files/live/sites/maif-fr/files/pdf/documentation-contractuelle/mobilite/document-information-accidents-corporels-pacs.pdf',               NULL, NULL, 'discovered'),
('MAI01','VIE01', NULL,              'IPID', 'https://entreprise.maif.fr/files/live/sites/maif-fr/files/pdf/documentation-contractuelle/famille-vie-quotidienne/document-information-deces-rassurcap-solutions.pdf', NULL, NULL, 'discovered'),
-- Deux CG habitation MAIF sans sous-type explicite → sous-types dérivés du nom de formule
('MAI01','HAB01', 'RAQVAM2',         'CG',   'https://www.maif.fr/content/documents/public/maif-fr/pdf/services-en-ligne/devis/raqvam/conditionsGeneralesRAQVAM.pdf',                                        'RAQVAM2', ARRAY['RAQVAM2'], 'discovered'),
('MAI01','HAB01', 'RAQVAM',          'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/10/assurance-habitation-responsabilite-civile-maif-conditions-generales.pdf',                    'RAQVAM', ARRAY['RAQVAM'], 'discovered'),
('MAI01','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://philtr.fr/static/pdf/insurance/habitation/maif_assurance_habitation.pdf',                                                                             NULL, NULL, 'discovered'),
('MAI01','HAB01', NULL,              'IPID', 'https://entreprise.maif.fr/files/live/sites/maif-fr/files/pdf/documentation-contractuelle/habitation/document-information-assurance-habitation.pdf',          NULL, NULL, 'discovered'),
('MAI01','JUR01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2018/12/conditions-generales-assurance-protection-juridique-maif.pdf',                                NULL, NULL, 'discovered'),
('MAI01','PRE01', NULL,              'IPID', 'https://entreprise.maif.fr/files/live/sites/maif-fr/files/pdf/documentation-contractuelle/famille-vie-quotidienne/document-information-deces-rassurcap-solutions.pdf', NULL, NULL, 'discovered'),
-- Deux CG pro MAIF sans sous-type explicite → sous-types dérivés du métier
('MAI01','PRO01', 'PRO_EDUCATION',   'CG',   'https://www.maif.fr/content/documents/public/maif-fr/pdf/contrat/pp//CGOME.pdf',                                                                               'Offre Métiers de l''Éducation', ARRAY['Métiers de l''Éducation'], 'discovered'),
('MAI01','PRO01', 'PRO_MRP',         'CG',   'https://philtr.fr/static/pdf/insurance/mrp/maif_mrp.pdf',                                                                                                     'Assurance Multirisque Professionnelle (MAIF Entreprises)', ARRAY['MRP'], 'discovered'),
('MAI01','SAN01', NULL,              'IPID', 'https://entreprise.maif.fr/files/live/sites/maif-fr/files/pdf/documentation-contractuelle/famille-vie-quotidienne/efficience-sante/document-information-efficience-sante.pdf', NULL, NULL, 'discovered'),

-- ── Matmut ────────────────────────────────────────────────────────────────────
('MAT01','ANI01', 'ANIMAUX',         'CG',   'https://www.matmut.fr/services-en-ligne/doc/Matmut-And-Co/cg-assur4pattes.pdf',                                                                                NULL, NULL, 'discovered'),
('MAT01','AUT01', NULL,              'CG',   'https://www.matmut.fr/services-en-ligne/doc/CG/cgauto4dmatmut.pdf',                                                                                            'Auto 4D', ARRAY['Auto 4D'], 'discovered'),
('MAT01','VIE01', NULL,              'CG',   'https://www.matmut.fr/services-en-ligne/cg/cgmav.pdf',                                                                                                         NULL, NULL, 'discovered'),
('MAT01','HAB01', NULL,              'CG',   'https://www.matmut.fr/services-en-ligne/doc/cg/cgmgarrp.pdf',                                                                                                  NULL, NULL, 'discovered'),
-- CG PNO distincte → sous-type pour éviter le conflit d'unicité
('MAT01','HAB01', 'PNO',             'CG',   'https://www.matmut.fr/services-en-ligne/doc/CG/pjpnepni.pdf',                                                                                                  'PNO', ARRAY['PNO'], 'discovered'),
('MAT01','JUR01', NULL,              'CG',   'https://www.matmut.fr/services-en-ligne/doc/CG/AMF/GPMT10.pdf',                                                                                                NULL, NULL, 'discovered'),
('MAT01','PRE01', NULL,              'NI',   'https://www.matmut.fr/prevoyance/pdf/Notice-CPM.pdf',                                                                                                          NULL, NULL, 'discovered'),
('MAT01','PRO01', NULL,              'CG',   'https://www.matmut.fr/services-en-ligne/CG/CGMPRO.pdf',                                                                                                        NULL, NULL, 'discovered'),
('MAT01','SAN01', NULL,              'NI',   'https://www.matmut.fr/services-en-ligne/doc/cg/cgsante.pdf',                                                                                                   NULL, NULL, 'discovered'),

-- ── MGEN ──────────────────────────────────────────────────────────────────────
-- doc_type absent dans la source → défaut 'CG'
('MGE01','ANI01', NULL,              'CG',   'https://www.mgen.fr/fileadmin/user_upload/documents/2411-NIV-DEP-105x210-3V-SANTE_ANIMALE-BD.pdf',                                                             NULL, NULL, 'discovered'),
('MGE01','VIE01', NULL,              'NI',   'https://agents-territoriaux.mgen.fr/wp-content/uploads/2023/02/Notice-dinformation-Pr%C3%A9voyance_R%C3%A9gion-Occitanie_2022_VF.pdf',                        NULL, NULL, 'discovered'),
('MGE01','SAN01', NULL,              'CG',   'https://my.mgen.pt/reports/files/CG2024FR.pdf',                                                                                                                NULL, NULL, 'discovered'),
('MGE01','VOY01', NULL,              'CG',   'https://guide.reassurez-moi.fr/guide/wp-content/uploads/2019/02/conditions-generales-assurance-voyage-mgen.pdf',                                              NULL, NULL, 'discovered'),

-- ── MMA ───────────────────────────────────────────────────────────────────────
('MMA01','AUT01', 'AUTO',            'CG',   'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg614/cg-auto-614.pdf',                                                                          NULL, NULL, 'discovered'),
('MMA01','VIE01', NULL,              'CG',   'https://espace-client.mma.fr/files/live/sites/mmafr/files/documents-cg/vm712/vm712_201312.pdf',                                                               NULL, NULL, 'discovered'),
('MMA01','HAB01', 'HAB_PRINCIPALE',  'CG',   'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg410/Habitation_MMA_410q.pdf',                                                                 NULL, NULL, 'discovered'),
('MMA01','JUR01', NULL,              'CG',   'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg400/PJ_MMA_400f..pdf',                                                                        NULL, NULL, 'discovered'),
('MMA01','PRE01', NULL,              'CG',   'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg088/AM6088_e.pdf',                                                                            NULL, NULL, 'discovered'),
-- doc_type absent dans la source → défaut 'CG'
('MMA01','PRO01', NULL,              'CG',   'https://philtr.fr/static/pdf/insurance/mrp/mma_mrp.pdf',                                                                                                      NULL, NULL, 'discovered'),
('MMA01','SAN01', NULL,              'CG',   'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg379/cg-sante-vitale-379.pdf',                                                                 NULL, NULL, 'discovered')

ON CONFLICT (insurer_code, insurance_type_code, (COALESCE(insurance_sub_type_code, '')), doc_type)
DO UPDATE SET
    current_url   = EXCLUDED.current_url,
    notes         = EXCLUDED.notes,
    formula_hints = EXCLUDED.formula_hints,
    matrix_status = CASE
                        WHEN document_catalogue.matrix_status = 'indexed' THEN 'indexed'
                        ELSE 'discovered'
                    END,
    updated_at    = NOW();

COMMIT;

SELECT
    insurer_code,
    COUNT(*) AS nb_docs,
    COUNT(*) FILTER (WHERE matrix_status = 'indexed')    AS indexed,
    COUNT(*) FILTER (WHERE matrix_status = 'discovered') AS discovered
FROM document_catalogue
WHERE insurer_code IN (
    'ABE01','AES01','AG201','AGP01','AIG01','ALL01','ANI01','API01',
    'APP01','APR01','AXA01','BAN01','BAN02','BNP01','BOU01','BOU02',
    'DIR01','MAA01','MAC01','MAI01','MAT01','MGE01','MMA01'
)
GROUP BY insurer_code
ORDER BY insurer_code;
