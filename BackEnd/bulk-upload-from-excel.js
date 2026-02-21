/**
 * Script de chargement en masse depuis un fichier Excel
 * Lit liste_pdf.xlsx, traite les PDFs et met à jour les statuts
 *
 * ─────────────────────────────────────────────────────────────
 * STRUCTURE DU FICHIER EXCEL ATTENDU (liste_pdf.xlsx)
 * ─────────────────────────────────────────────────────────────
 * Le fichier Excel doit comporter UN onglet (feuille 1) avec
 * les colonnes suivantes (noms exacts, sensibles à la casse) :
 *
 * Colonne              | Exemple             | Description
 * ---------------------|---------------------|------------------------------------------
 * Insurer              | AXA                 | Code assureur (doit exister dans DB)
 * Insurer_name         | AXA France          | Nom complet de l'assureur
 * Insurance_type       | SAN                 | Code type d'assurance (doit exister dans DB)
 * Insurance_type_name  | Santé               | Libellé du type d'assurance
 * nom fichier cible    | AXA_SAN_001.pdf     | Nom du fichier PDF (dans PDF_FOLDER)
 * Type                 | CG                  | (optionnel) Type de document – défaut : CG
 * Détail               | Formule Confort     | (optionnel) Détail / sous-formule
 * URL                  | https://...         | (optionnel) Lien vers le document en ligne
 * Status               | téléchargé          | État de la ligne :
 *                      |                     |   téléchargé → sera traité par ce script
 *                      |                     |   vectorisé  → déjà traité (ignoré)
 *                      |                     |   erreur vectorisation → échec à relancer
 *                      |                     |   fichier manquant → PDF absent sur disque
 * Date de chargement   | 25/06/2025 14:30    | (auto) Horodatage mis à jour par le script
 *
 * Notes :
 *  - Seules les lignes avec Status = "téléchargé" sont traitées.
 *  - Le script lit le PDF depuis PDF_FOLDER/nom_fichier_cible.
 *  - Après traitement, Status passe à "vectorisé" et la date est mise à jour.
 *  - La version est extraite du nom du fichier (ex: _001.pdf → version "001").
 *  - Les codes Insurer / Insurance_type doivent correspondre aux codes dans
 *    les tables `insurers` et `insurance_types` de la base de données.
 * ─────────────────────────────────────────────────────────────
 *
 * Usage :
 *   node bulk-upload-from-excel.js
 *
 * Chemins configurables en haut du fichier :
 *   EXCEL_FILE  : chemin absolu vers liste_pdf.xlsx
 *   PDF_FOLDER  : chemin absolu vers le dossier contenant les PDFs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;
import { GoogleGenerativeAI } from '@google/generative-ai';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '.env.production') });

// Configuration des logs
const LOG_FILE = path.join(__dirname, 'bulk-upload.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// Désactiver la vérification SSL pour Zscaler
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Configuration PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
});

// Configuration Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Chemin vers le fichier Excel et le dossier des PDFs
// Sur VM : '/home/VMRemi19821982/AssurClair/liste_pdf.xlsx' et '/home/VMRemi19821982/AssurClair/pdfs'
// Sur Windows : 'C:\\biencouvert\\liste_pdf.xlsx' et 'C:\\biencouvert\\cdg'
const EXCEL_FILE = process.platform === 'win32' 
  ? 'C:\\biencouvert\\liste_pdf.xlsx' 
  : '/home/VMRemi19821982/AssurClair/liste_pdf.xlsx';
const PDF_FOLDER = process.platform === 'win32' 
  ? 'C:\\biencouvert\\cdg' 
  : '/home/VMRemi19821982/AssurClair/pdfs';

/**
 * Extrait le texte d'un PDF en base64
 */
async function extractTextFromPdf(base64Pdf) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf
        }
      },
      {
        text: 'Extract all text from this PDF document. Return only the raw text content without any formatting or explanations.'
      }
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('❌ Erreur lors de l\'extraction du texte:', error.message);
    throw error;
  }
}

/**
 * Extrait les métadonnées enrichies (formules, options, résumé)
 */
async function extractEnrichedMetadata(text, insuranceTypeName) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const prompt = `Tu es un expert en assurance. Analyse ce document de conditions générales d'assurance ${insuranceTypeName}.

DOCUMENT:
${text.substring(0, 50000)}

Extrais et structure les informations suivantes au format JSON strict (pas de markdown, juste le JSON) :

{
  "formules": ["liste des formules/niveaux de garantie proposés, ex: Tiers, Intermédiaire, Tous risques"],
  "options": {
    "formule1": ["options spécifiques à cette formule"],
    "toutes_formules": ["options communes à toutes les formules"]
  },
  "resume_court": "résumé en 2-3 phrases des garanties principales"
}

Réponds UNIQUEMENT avec le JSON, sans aucun texte avant ou après.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    // Nettoyer la réponse (enlever les balises markdown si présentes)
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      log(`  ⚠️  Impossible de parser le JSON des métadonnées: ${jsonText.substring(0, 200)}`);
      return {
        formules: [],
        options: { toutes_formules: [] },
        resume_court: "Métadonnées non disponibles"
      };
    }
  } catch (error) {
    log(`  ⚠️  Erreur extraction métadonnées: ${error.message}`);
    return {
      formules: [],
      options: { toutes_formules: [] },
      resume_court: "Métadonnées non disponibles"
    };
  }
}

/**
 * Génère un embedding à partir du texte
 */
async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('❌ Erreur lors de la génération de l\'embedding:', error.message);
    throw error;
  }
}

/**
 * Insère un document dans central_cg
 */
async function insertCentralCg(data) {
  const query = `
    INSERT INTO central_cg (
      insurer_code,
      insurance_type_code,
      version,
      type,
      owner,
      detail,
      url,
      target_filename,
      status,
      content_text,
      embedding,
      metadata,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    RETURNING id
  `;

  const values = [
    data.insurer_code,
    data.insurance_type_code,
    data.version || '001',
    data.type || 'CG',
    data.owner || 'system_bulk_upload',
    data.detail || '',
    data.url || '',
    data.target_filename,
    data.status || 'active',
    data.content_text,
    JSON.stringify(data.embedding),
    data.metadata || {}
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}

/**
 * Lit le fichier Excel et retourne les données
 */
function readExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
}

/**
 * Met à jour le fichier Excel avec les nouveaux statuts
 */
function updateExcelFile(filePath, data) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = xlsx.utils.json_to_sheet(data);
  workbook.Sheets[sheetName] = worksheet;
  xlsx.writeFile(workbook, filePath);
}

/**
 * Formate la date au format français
 */
function formatDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Traite un document
 */
async function processDocument(row, index, total) {
  log(`\n[${index + 1}/${total}] ────────────────────────────────`);
  log(`📥 Traitement de ${row['nom fichier cible']}...`);

  try {
    // Vérifier si le fichier existe
    const pdfPath = path.join(PDF_FOLDER, row['nom fichier cible']);
    if (!fs.existsSync(pdfPath)) {
      log(`  ⚠️  Fichier non trouvé: ${pdfPath}`);
      row.Status = 'fichier manquant';
      return { success: false, error: 'Fichier non trouvé' };
    }

    // Lire le fichier PDF
    log(`  📄 Lecture du fichier...`);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    // Extraire le texte
    log(`  📄 Extraction du texte...`);
    const text = await extractTextFromPdf(base64Pdf);
    log(`  ✅ ${text.length} caractères extraits`);

    // Extraire les métadonnées enrichies (formules, options, résumé)
    log(`  🔍 Extraction des métadonnées enrichies...`);
    const enrichedMetadata = await extractEnrichedMetadata(text, row.Insurance_type_name);
    log(`  ✅ Métadonnées extraites: ${enrichedMetadata.formules.length} formules`);

    // Générer l'embedding
    log(`  🔮 Génération de l'embedding...`);
    const embedding = await generateEmbedding(text);
    log(`  ✅ Embedding généré (${embedding.length} dimensions)`);

    // Extraire la version du nom de fichier (ex: AES01_SAN01_001.pdf -> 001)
    const versionMatch = row['nom fichier cible'].match(/_(\d+)\.pdf$/);
    const version = versionMatch ? versionMatch[1] : '001';

    // Préparer les données pour l'insertion
    const cgData = {
      insurer_code: row.Insurer,
      insurance_type_code: row.Insurance_type,
      version: version,
      type: row.Type || 'CG',
      owner: 'system_bulk_upload',
      detail: row['Détail'] || '',
      url: row.URL || '',
      target_filename: row['nom fichier cible'],
      status: 'active',
      content_text: text,
      embedding: embedding,
      metadata: {
        insurer_name: row.Insurer_name,
        insurance_type_name: row.Insurance_type_name,
        source: 'excel_bulk_upload',
        original_status: row.Status,
        formules: enrichedMetadata.formules,
        options: enrichedMetadata.options,
        resume_court: enrichedMetadata.resume_court
      }
    };

    // Insérer dans la base de données
    log(`  💾 Insertion dans la base de données...`);
    const id = await insertCentralCg(cgData);
    log(`  ✅ Document enregistré avec l'ID ${id}`);

    // Mettre à jour le statut dans la ligne Excel
    row.Status = 'vectorisé';
    row['Date de chargement'] = formatDate();

    return { success: true, id };

  } catch (error) {
    console.error(`  ❌ Erreur: ${error.message}`);
    row.Status = 'erreur vectorisation';
    return { success: false, error: error.message };
  }
}

/**
 * Fonction principale
 */
async function main() {
  log('🚀 Chargement en masse depuis fichier Excel');
  log('============================================================');

  try {
    // Vérifier que le fichier Excel existe
    if (!fs.existsSync(EXCEL_FILE)) {
      throw new Error(`Fichier Excel non trouvé: ${EXCEL_FILE}`);
    }

    // Vérifier que le dossier des PDFs existe
    if (!fs.existsSync(PDF_FOLDER)) {
      throw new Error(`Dossier PDFs non trouvé: ${PDF_FOLDER}`);
    }

    // Lire le fichier Excel
    log(`\n📋 Lecture du fichier Excel: ${EXCEL_FILE}`);
    let excelData = readExcelFile(EXCEL_FILE);
    
    // Filtrer uniquement les lignes avec statut "téléchargé"
    const rowsToProcess = excelData.filter(row => 
      row.Status && row.Status.toLowerCase() === 'téléchargé'
    );

    log(`📊 ${rowsToProcess.length} document(s) à vectoriser`);
    log(`📂 Dossier PDFs: ${PDF_FOLDER}`);

    if (rowsToProcess.length === 0) {
      log('\n✨ Aucun document à traiter.');
      return;
    }

    // Statistiques
    let successCount = 0;
    let errorCount = 0;

    // Traiter chaque document
    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const result = await processDocument(row, i, rowsToProcess.length);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      // Pause entre chaque document pour éviter de surcharger l'API
      if (i < rowsToProcess.length - 1) {
        log(`\n  ⏳ Pause de 2 secondes...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Mettre à jour le fichier Excel avec les nouveaux statuts
    log(`\n💾 Mise à jour du fichier Excel...`);
    updateExcelFile(EXCEL_FILE, excelData);
    log(`✅ Fichier Excel mis à jour`);

    // Afficher le résumé
    log('\n============================================================');
    log('✨ RÉSUMÉ');
    log(`   ✅ Réussis : ${successCount}`);
    log(`   ❌ Échoués : ${errorCount}`);
    log(`   📊 Total   : ${rowsToProcess.length}`);
    log('============================================================\n');

  } catch (error) {
    log('\n❌ Erreur fatale: ' + error.message);
    log(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Lancer le script
main();
