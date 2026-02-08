/**
 * Script de chargement en masse avec vectorisation page par page
 * Lit liste_pdf.xlsx, traite les PDFs et alimente toutes les tables (central_cg, central_cg_pages, coverage_facts)
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
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '.env.production') });

// Configuration des logs
const LOG_FILE = path.join(__dirname, 'bulk-upload-pages.log');
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

// Chemins
const EXCEL_FILE = process.platform === 'win32' 
  ? 'C:\\biencouvert\\liste_pdf.xlsx' 
  : '/home/VMRemi19821982/AssurClair/liste_pdf.xlsx';
const PDF_FOLDER = process.platform === 'win32' 
  ? 'C:\\biencouvert\\cdg' 
  : '/home/VMRemi19821982/AssurClair/pdfs';

/**
 * Extrait le texte complet d'un PDF (pour central_cg)
 */
async function extractFullTextFromPdf(base64Pdf) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
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
 * Extrait une page spécifique d'un PDF en texte et image PNG
 */
async function extractPage(pdfBuffer, pageNumber) {
  try {
    // Charger le PDF avec pdf.js
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdfDoc = await loadingTask.promise;
    
    // Obtenir la page
    const page = await pdfDoc.getPage(pageNumber);
    
    // Extraire le texte
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    
    // Rendre la page en image
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Convertir le canvas en PNG base64
    const pngBuffer = canvas.toBuffer('image/png');
    const base64Image = pngBuffer.toString('base64');
    
    return {
      text: pageText,
      image: base64Image,
      width: viewport.width,
      height: viewport.height
    };
  } catch (error) {
    console.error(`❌ Erreur extraction page ${pageNumber}:`, error.message);
    throw error;
  }
}

/**
 * Détecte si une page contient un tableau de garanties
 */
function detectTableInPage(pageText) {
  const tableKeywords = [
    'garanties',
    'formule',
    'option',
    'couverture',
    'inclus',
    'exclu',
    'franchise',
    'plafond',
    'tiers',
    'tous risques',
    'intermédiaire'
  ];
  
  const lowerText = pageText.toLowerCase();
  const keywordCount = tableKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  // Si au moins 3 mots-clés sont présents, on considère qu'il y a probablement un tableau
  return keywordCount >= 3;
}

/**
 * Extrait la structure d'un tableau depuis une image avec Gemini Vision
 */
async function extractTableFromPageImage(base64Image, insurerCode, insuranceTypeCode) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
    const prompt = `Analyse ce tableau de garanties d'assurance et extrais les informations structurées.

Réponds UNIQUEMENT avec un JSON au format suivant (pas de markdown, juste le JSON) :

{
  "headers": ["colonne1", "colonne2", ...],
  "rows": [
    ["valeur1", "valeur2", ...],
    ["valeur3", "valeur4", ...]
  ],
  "confidence": 0.0-1.0
}

Instructions :
- Les headers sont généralement les noms de formules (ex: "Tiers", "Intermédiaire", "Tous Risques")
- Chaque ligne représente une garantie (ex: "Responsabilité civile", "Bris de glaces")
- Pour les valeurs des cellules, utilise :
  * "✓" ou "included" pour garantie incluse
  * "○" ou "optional" pour option payante
  * "-" ou "excluded" pour non couvert
  * Un montant si présent (ex: "5000€", "illimité")
- Si tu ne trouves pas de tableau de garanties, retourne confidence: 0.0`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image
        }
      },
      { text: prompt }
    ]);

    const responseText = result.response.text().trim();
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const tableData = JSON.parse(jsonText);
    
    // Si confidence trop faible, on ignore
    if (tableData.confidence < 0.5) {
      return null;
    }
    
    return tableData;
  } catch (error) {
    log(`  ⚠️  Erreur extraction tableau: ${error.message}`);
    return null;
  }
}

/**
 * Convertit un tableau extrait en faits de couverture (coverage_facts)
 */
function tableToFacts(tableData, centralCgId, pageId, pageNumber, insurerCode, insuranceTypeCode) {
  const facts = [];
  
  if (!tableData || !tableData.headers || !tableData.rows) {
    return facts;
  }
  
  // Les headers sont les formules (sauf la première colonne qui contient les garanties)
  const formulas = tableData.headers.slice(1); // Ignorer la première colonne
  
  // Parcourir chaque ligne (garantie)
  tableData.rows.forEach(row => {
    const guaranteeLabel = row[0]; // Première colonne = nom de la garantie
    const guaranteeKey = normalizeKey(guaranteeLabel);
    
    // Parcourir chaque formule
    formulas.forEach((formulaLabel, idx) => {
      const cellValue = row[idx + 1]; // +1 car on a ignoré la première colonne
      const formulaKey = normalizeKey(formulaLabel);
      
      // Analyser la valeur de la cellule
      const coverageInfo = parseStatus(cellValue);
      
      facts.push({
        insurer_code: insurerCode,
        insurance_type_code: insuranceTypeCode,
        central_cg_id: centralCgId,
        guarantee_key: guaranteeKey,
        guarantee_label: guaranteeLabel,
        formula_key: formulaKey,
        formula_label: formulaLabel,
        coverage_status: coverageInfo.status,
        coverage_amount: coverageInfo.amount,
        franchise: coverageInfo.franchise,
        source_page_id: pageId,
        source_page_number: pageNumber,
        extraction_confidence: tableData.confidence
      });
    });
  });
  
  return facts;
}

/**
 * Normalise un label en snake_case key
 */
function normalizeKey(label) {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse le statut d'une cellule de tableau
 */
function parseStatus(cellValue) {
  if (!cellValue) {
    return { status: 'excluded', amount: null, franchise: null };
  }
  
  const value = cellValue.toString().toLowerCase();
  
  // Inclus
  if (value.includes('✓') || value.includes('included') || value.includes('oui')) {
    return { status: 'included', amount: extractAmount(value), franchise: extractFranchise(value) };
  }
  
  // Option
  if (value.includes('○') || value.includes('optional') || value.includes('option')) {
    return { status: 'optional', amount: extractAmount(value), franchise: extractFranchise(value) };
  }
  
  // Exclu
  if (value.includes('-') || value.includes('excluded') || value.includes('non')) {
    return { status: 'excluded', amount: null, franchise: null };
  }
  
  // Si montant présent, considéré comme inclus
  const amount = extractAmount(value);
  if (amount) {
    return { status: 'included', amount, franchise: extractFranchise(value) };
  }
  
  return { status: 'excluded', amount: null, franchise: null };
}

/**
 * Extrait un montant d'une chaîne
 */
function extractAmount(text) {
  const amountMatch = text.match(/(\d[\d\s]*(?:\.\d+)?)\s*(?:€|euros?|eur)/i);
  if (amountMatch) {
    return amountMatch[1].replace(/\s/g, '');
  }
  
  if (text.includes('illimité') || text.includes('unlimited')) {
    return 'illimité';
  }
  
  return null;
}

/**
 * Extrait une franchise d'une chaîne
 */
function extractFranchise(text) {
  const franchiseMatch = text.match(/franchise[:\s]*(\d[\d\s]*(?:\.\d+)?)\s*(?:€|euros?|eur)/i);
  if (franchiseMatch) {
    return franchiseMatch[1].replace(/\s/g, '');
  }
  return null;
}

/**
 * Génère un embedding pour un texte
 */
async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('❌ Erreur génération embedding:', error.message);
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
 * Insère une page dans central_cg_pages
 */
async function insertCgPage(pageData) {
  const query = `
    INSERT INTO central_cg_pages (
      central_cg_id,
      page_number,
      content_text,
      embedding,
      page_image_base64,
      has_table,
      table_json,
      confidence,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id
  `;

  const values = [
    pageData.central_cg_id,
    pageData.page_number,
    pageData.content_text,
    JSON.stringify(pageData.embedding),
    pageData.page_image_base64,
    pageData.has_table,
    pageData.table_json ? JSON.stringify(pageData.table_json) : null,
    pageData.confidence
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}

/**
 * Insère des faits de couverture dans coverage_facts
 */
async function insertCoverageFacts(facts) {
  if (facts.length === 0) return 0;
  
  const query = `
    INSERT INTO coverage_facts (
      insurer_code,
      insurance_type_code,
      central_cg_id,
      guarantee_key,
      guarantee_label,
      formula_key,
      formula_label,
      coverage_status,
      coverage_amount,
      franchise,
      source_page_id,
      source_page_number,
      extraction_confidence,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    ON CONFLICT (central_cg_id, guarantee_key, formula_key) 
    DO UPDATE SET
      guarantee_label = EXCLUDED.guarantee_label,
      formula_label = EXCLUDED.formula_label,
      coverage_status = EXCLUDED.coverage_status,
      coverage_amount = EXCLUDED.coverage_amount,
      franchise = EXCLUDED.franchise,
      source_page_id = EXCLUDED.source_page_id,
      source_page_number = EXCLUDED.source_page_number,
      extraction_confidence = EXCLUDED.extraction_confidence,
      updated_at = NOW()
  `;

  let insertedCount = 0;
  for (const fact of facts) {
    try {
      await pool.query(query, [
        fact.insurer_code,
        fact.insurance_type_code,
        fact.central_cg_id,
        fact.guarantee_key,
        fact.guarantee_label,
        fact.formula_key,
        fact.formula_label,
        fact.coverage_status,
        fact.coverage_amount,
        fact.franchise,
        fact.source_page_id,
        fact.source_page_number,
        fact.extraction_confidence
      ]);
      insertedCount++;
    } catch (error) {
      log(`  ⚠️  Erreur insertion fact ${fact.guarantee_key}×${fact.formula_key}: ${error.message}`);
    }
  }
  
  return insertedCount;
}

/**
 * Lit le fichier Excel
 */
function readExcelFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
}

/**
 * Met à jour le fichier Excel
 */
function updateExcelFile(filePath, data) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = xlsx.utils.json_to_sheet(data);
  workbook.Sheets[sheetName] = worksheet;
  xlsx.writeFile(workbook, filePath);
}

/**
 * Formate la date
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
 * Traite un document avec vectorisation page par page
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

    // Extraire le texte complet pour central_cg
    log(`  📄 Extraction du texte complet...`);
    const fullText = await extractFullTextFromPdf(base64Pdf);
    log(`  ✅ ${fullText.length} caractères extraits`);

    // Générer l'embedding du document complet
    log(`  🔮 Génération de l'embedding du document...`);
    const fullEmbedding = await generateEmbedding(fullText);
    log(`  ✅ Embedding généré (${fullEmbedding.length} dimensions)`);

    // Extraire la version du nom de fichier
    const versionMatch = row['nom fichier cible'].match(/_(\d+)\.pdf$/);
    const version = versionMatch ? versionMatch[1] : '001';

    // Insérer dans central_cg
    log(`  💾 Insertion dans central_cg...`);
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
      content_text: fullText,
      embedding: fullEmbedding,
      metadata: {
        insurer_name: row.Insurer_name,
        insurance_type_name: row.Insurance_type_name,
        source: 'excel_bulk_upload_with_pages'
      }
    };
    
    const cgId = await insertCentralCg(cgData);
    log(`  ✅ Document central_cg créé avec ID ${cgId}`);

    // Charger le PDF pour compter les pages
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    log(`  📄 ${pageCount} pages à traiter`);

    let pagesProcessed = 0;
    let tablesFound = 0;
    let factsCreated = 0;

    // Traiter chaque page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      log(`    Page ${pageNum}/${pageCount}...`);
      
      try {
        // Extraire la page (texte + image)
        const pageData = await extractPage(pdfBuffer, pageNum);
        
        // Générer embedding de la page
        const pageEmbedding = await generateEmbedding(pageData.text);
        
        // Détecter si la page contient un tableau
        const hasTable = detectTableInPage(pageData.text);
        
        let tableJson = null;
        let confidence = 0.0;
        let pageId = null;
        
        // Si tableau détecté, extraire avec Vision
        if (hasTable) {
          log(`      🔍 Tableau détecté, extraction Vision...`);
          tableJson = await extractTableFromPageImage(
            pageData.image,
            row.Insurer,
            row.Insurance_type
          );
          
          if (tableJson && tableJson.confidence >= 0.5) {
            confidence = tableJson.confidence;
            tablesFound++;
            log(`      ✅ Tableau extrait (confidence: ${confidence.toFixed(2)})`);
          }
        }
        
        // Insérer la page dans central_cg_pages
        const pageRecord = {
          central_cg_id: cgId,
          page_number: pageNum,
          content_text: pageData.text,
          embedding: pageEmbedding,
          page_image_base64: pageData.image,
          has_table: hasTable && tableJson !== null,
          table_json: tableJson,
          confidence: confidence
        };
        
        pageId = await insertCgPage(pageRecord);
        
        // Si tableau valide, créer les coverage_facts
        if (tableJson && tableJson.confidence >= 0.5) {
          const facts = tableToFacts(
            tableJson,
            cgId,
            pageId,
            pageNum,
            row.Insurer,
            row.Insurance_type
          );
          
          if (facts.length > 0) {
            const inserted = await insertCoverageFacts(facts);
            factsCreated += inserted;
            log(`      ✅ ${inserted} faits de couverture créés`);
          }
        }
        
        pagesProcessed++;
        
      } catch (pageError) {
        log(`      ⚠️  Erreur page ${pageNum}: ${pageError.message}`);
      }
    }

    log(`  ✅ Vectorisation page par page terminée:`);
    log(`     - ${pagesProcessed} pages traitées`);
    log(`     - ${tablesFound} tableaux extraits`);
    log(`     - ${factsCreated} faits de couverture créés`);

    // Mettre à jour le statut
    row.Status = 'vectorisé+pages';
    row['Date de chargement'] = formatDate();

    return { 
      success: true, 
      id: cgId, 
      pages: pagesProcessed,
      tables: tablesFound,
      facts: factsCreated
    };

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
  log('🚀 Chargement en masse avec vectorisation page par page');
  log('============================================================');

  try {
    // Vérifications
    if (!fs.existsSync(EXCEL_FILE)) {
      throw new Error(`Fichier Excel non trouvé: ${EXCEL_FILE}`);
    }
    if (!fs.existsSync(PDF_FOLDER)) {
      throw new Error(`Dossier PDFs non trouvé: ${PDF_FOLDER}`);
    }

    // Lire Excel
    log(`\n📋 Lecture du fichier Excel: ${EXCEL_FILE}`);
    let excelData = readExcelFile(EXCEL_FILE);
    
    // Filtrer les documents à traiter
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
    let totalPages = 0;
    let totalTables = 0;
    let totalFacts = 0;

    // Traiter chaque document
    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const result = await processDocument(row, i, rowsToProcess.length);

      if (result.success) {
        successCount++;
        totalPages += result.pages || 0;
        totalTables += result.tables || 0;
        totalFacts += result.facts || 0;
      } else {
        errorCount++;
      }

      // Pause entre documents
      if (i < rowsToProcess.length - 1) {
        log(`\n  ⏳ Pause de 3 secondes...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Mettre à jour Excel
    log(`\n💾 Mise à jour du fichier Excel...`);
    updateExcelFile(EXCEL_FILE, excelData);
    log(`✅ Fichier Excel mis à jour`);

    // Résumé
    log('\n============================================================');
    log('✨ RÉSUMÉ');
    log(`   ✅ Réussis : ${successCount}`);
    log(`   ❌ Échoués : ${errorCount}`);
    log(`   📄 Pages traitées : ${totalPages}`);
    log(`   📊 Tableaux extraits : ${totalTables}`);
    log(`   💎 Faits de couverture : ${totalFacts}`);
    log(`   📊 Total documents : ${rowsToProcess.length}`);
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
