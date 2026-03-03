/**
 * Script de chargement en masse avec vectorisation page par page
 * Lit liste_pdf.xlsx, traite les PDFs et alimente toutes les tables (central_cg, central_cg_pages, coverage_facts)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import pkg from 'pg';
const _require = createRequire(import.meta.url);
const _nodeFetch = _require('node-fetch');
const _https = _require('https');
const _insecureAgent = new _https.Agent({ rejectUnauthorized: false });
// Local PDF parsing via pdfjs-dist only (zero Gemini tokens for text extraction)
const pdfjsLib = _require('pdfjs-dist/legacy/build/pdf.js');

// ─── Token tracking (bulk script) ────────────────────────────────────────────
const tokenStats = {
  tableExtraction: { calls: 0, inputTokens: 0, outputTokens: 0 },
};

function recordTokens(category, usageMetadata) {
  if (!usageMetadata) return;
  const input  = usageMetadata.promptTokenCount    || 0;
  const output = usageMetadata.candidatesTokenCount || 0;
  if (!tokenStats[category]) tokenStats[category] = { calls: 0, inputTokens: 0, outputTokens: 0 };
  tokenStats[category].calls        += 1;
  tokenStats[category].inputTokens  += input;
  tokenStats[category].outputTokens += output;
}

function logTokenSummary() {
  log('\n📊 BILAN TOKENS GEMINI');
  let totalIn = 0, totalOut = 0, totalCalls = 0;
  for (const [fn, s] of Object.entries(tokenStats)) {
    if (s.calls === 0) continue;
    log(`   ${fn}: ${s.calls} appels — in=${s.inputTokens.toLocaleString()} out=${s.outputTokens.toLocaleString()}`);
    totalIn    += s.inputTokens;
    totalOut   += s.outputTokens;
    totalCalls += s.calls;
  }
  // Tarif Gemini 2.5 Flash (estimatif Mars 2026)
  const costEur = ((totalIn / 1e6) * 0.075 + (totalOut / 1e6) * 0.30) * 0.92;
  log(`   ─────────────────────────────────────────────────`);
  log(`   TOTAL : ${totalCalls} appels — in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()} tokens`);
  log(`   Coût estimé : ${costEur.toFixed(4)} EUR (tarif Flash 2.5)`);
  log('');
}
const { Pool } = pkg;
import { GoogleGenerativeAI } from '@google/generative-ai';
import xlsx from 'xlsx';
import { PDFDocument } from 'pdf-lib';

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

/**
 * Réessaie une opération DB si la base est en mode recovery (redémarrage en cours)
 */
async function retryDbOperation(fn, retries = 12, delayMs = 60000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRecovery = err.message && (
        err.message.includes('recovery mode') ||
        err.message.includes('recovery') ||
        err.message.includes('starting up') ||
        err.message.includes('Connection terminated')
      );
      if (isRecovery && attempt < retries) {
        log(`  ⏳ DB en recovery, attente ${delayMs / 1000}s avant tentative ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Attend que la base de données ne soit plus en mode recovery
 */
async function waitForDbReady() {
  const maxWait = 30; // max 30 minutes
  for (let i = 0; i < maxWait; i++) {
    try {
      const res = await pool.query('SELECT pg_is_in_recovery() AS recovery');
      if (res.rows[0].recovery === false) return; // DB prête
      log(`  ⏳ DB en recovery, attente 60s... (${i + 1}/${maxWait})`);
    } catch (err) {
      log(`  ⏳ DB inaccessible (${err.message.slice(0, 60)}), attente 60s... (${i + 1}/${maxWait})`);
    }
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
  throw new Error('DB toujours en recovery apres 30 minutes');
}

// Chemins
const EXCEL_FILE = process.platform === 'win32' 
  ? 'C:\\biencouvert\\liste_pdf.xlsx' 
  : '/home/VMRemi19821982/AssurClair/liste_pdf.xlsx';
const PDF_FOLDER = process.platform === 'win32' 
  ? 'C:\\biencouvert\\cdg' 
  : '/home/VMRemi19821982/AssurClair/pdfs';

// Répertoire de stockage centralisé des PDFs (configuré via PDF_STORAGE_DIR)
// Linux fallback : ~/AssurClair/pdf-storage (toujours accessible, ne nécessite pas mkdir sudo)
const PDF_STORAGE_DIR = process.env.PDF_STORAGE_DIR
  || (process.platform === 'win32'
    ? 'C:\\biencouvert\\pdf-storage'
    : path.join(process.env.HOME || '/home/VMRemi19821982', 'AssurClair', 'pdf-storage'));

/**
 * Extrait le texte complet d'un PDF localement via pdfjs-dist (0 token Gemini).
 * Concatène le texte de toutes les pages.
 */
async function extractFullTextFromPdf(pdfBuffer) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdfDoc = await loadingTask.promise;
    const texts = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        texts.push(content.items.map(item => item.str).join(' '));
      } catch (_) { /* page illisible, on passe */ }
    }
    return texts.join('\n');
  } catch (error) {
    console.error('❌ Erreur extraction texte locale (pdfjs):', error.message);
    return '';
  }
}

/**
 * Extrait le texte de toutes les pages localement via pdfjs-dist (0 token Gemini)
 * Retourne un tableau [{pageNumber, text}]
 */
async function extractAllPagesByGemini(pdfBuffer, pageCount) {
  try {
    // Désactiver le worker (environnement Node.js)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdfDoc = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        pages.push({ pageNumber: i, text });
      } catch (pageErr) {
        log(`      ⚠️  Erreur page ${i} (pdfjs): ${pageErr.message}`);
        pages.push({ pageNumber: i, text: '' });
      }
    }
    return pages;
  } catch (error) {
    log(`  ⚠️  Erreur pdfjs extractAllPagesByGemini: ${error.message} — retour tableau vide`);
    return Array.from({ length: pageCount }, (_, i) => ({ pageNumber: i + 1, text: '' }));
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
 * Extrait la structure d'un tableau depuis le texte d'une page via Gemini
 */
async function extractTableFromPageText(pageText, insurerCode, insuranceTypeCode) {
  try {
    log(`      📝 Texte page (${pageText.length} chars): ${pageText.slice(0, 150).replace(/\n/g, ' ')}...`);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Voici le texte d'une page d'un document d'assurance (assureur: ${insurerCode}, type: ${insuranceTypeCode}).\nAnalyse ce texte et extrais le tableau de garanties/formules si présent.\n\nTexte:\n${pageText.slice(0, 4000)}\n\nRéponds UNIQUEMENT avec un JSON valide (pas de markdown, pas d'explication) de cette structure exacte :\n{"headers":["Garantie","Formule1","Formule2"],"rows":[["Nom garantie","valeur1","valeur2"]],"confidence":0.8}\n- "headers" : première colonne = "Garantie", suivantes = noms des formules\n- "rows" : chaque ligne = [nom garantie, valeur formule1, valeur formule2, ...]\n- "confidence" : entre 0.0 et 1.0 selon la qualité de l'extraction\n- Si aucun tableau de garanties n'est présent, retourne : {"headers":[],"rows":[],"confidence":0.0}`;
    const result = await model.generateContent(prompt);
    recordTokens('tableExtraction', result?.response?.usageMetadata);
    const responseText = result.response.text().trim();
    log(`      🤖 Réponse Gemini: ${responseText.slice(0, 200)}`);
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let tableData;
    try {
      tableData = JSON.parse(jsonText);
    } catch (parseErr) {
      log(`  ⚠️  JSON invalide pour tableau: ${jsonText.slice(0, 200)}`);
      return null;
    }
    log(`      📊 Table parsée: headers=${tableData.headers?.length || 0}, rows=${tableData.rows?.length || 0}, confidence=${tableData.confidence}`);
    if (!tableData.headers || tableData.headers.length === 0) return null;
    if ((tableData.confidence || 0) < 0.3) return null;
    log(`      ✅ Tableau extrait (${tableData.rows?.length || 0} lignes, confidence: ${tableData.confidence})`);
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
        coverage_notes: null,
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

// ─── Classification sémantique des pages ────────────────────────────────────
const GUARANTEE_PATTERNS = [
  { code: 'RC',         keywords: /responsabilit[eé]\s+civile|r\.c\./i },
  { code: 'DOMMAGES',   keywords: /dommages\s+(tous|collision|accident)|tous\s+risques/i },
  { code: 'VOL',        keywords: /\bvol\b|tentative\s+de\s+vol/i },
  { code: 'INCENDIE',   keywords: /incendie|explosion|attentat/i },
  { code: 'BRIS_GLACE', keywords: /bris\s+de\s+glaces?|vitrage|pare-?brise/i },
  { code: 'ASSISTANCE', keywords: /assistance|d[eé]pannage|remorquage/i },
  { code: 'PJ',         keywords: /protection\s+juridique|d[eé]fense.+recours/i },
  { code: 'CONDUCTEUR', keywords: /conducteur|corporels?\s+du\s+conducteur/i },
  { code: 'CAT_NAT',    keywords: /catastrophes?\s+naturelles?|cat\s*nat/i },
  { code: 'FRANCHISE',  keywords: /franchise|participation/i },
  { code: 'PLAFOND',    keywords: /plafond|limite\s+de\s+garantie|montant\s+maximum/i },
];

function extractGuaranteeCodes(text) {
  return GUARANTEE_PATTERNS.filter(p => p.keywords.test(text)).map(p => p.code);
}

function extractArticleRef(text) {
  const match = text.match(/\b(art(?:icle|\.)?\s*[\d.]+[A-Za-z]?|§\s*\d+[\d.]*)/i);
  return match ? match[0].trim() : null;
}

function classifyPageType(text, hasTable) {
  if (!text || text.trim().length < 20)
    return { chunkType: 'inconnu', guaranteeCodes: [], articleRef: null, confidence: 0 };
  if (hasTable)
    return { chunkType: 'tableau', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.95 };
  if (/\b(ne\s+(pas|point)\s+(couvrir|garantir|inclure)|exclusion|exclu[se]?|non\s+garanti)\b/i.test(text) && text.length > 200)
    return { chunkType: 'exclusion', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.85 };
  if (/\b(franchise|plafond|seuil|limite|jusqu'[àa]|maximum|\d+\s*€)\b/i.test(text) && text.length > 150)
    return { chunkType: 'restriction', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.80 };
  if (/\bgaranti[et]|\bcouverture|\bprise\s+en\s+charge\b/i.test(text) && text.length > 200)
    return { chunkType: 'garantie', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.75 };
  if (/\b(au\s+sens\s+du\s+présent|on\s+entend\s+par|désigne|signifie)\b/i.test(text))
    return { chunkType: 'definition', guaranteeCodes: [], articleRef: extractArticleRef(text), confidence: 0.80 };
  return { chunkType: 'general', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.60 };
}

/**
 * Génère un embedding pour un texte via l'API REST Gemini
 */
async function generateEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:embedContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await _nodeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8192) }] }, outputDimensionality: 768 }),
        agent: _insecureAgent
      });

      if (res.status === 404 || res.status === 400) {
        const b = await res.text();
        // Erreur permanente (texte vide, modèle absent) → ne pas retenter
        throw new Error(`PERMANENT:HTTP ${res.status}: ${b.slice(0, 120)}`);
      }

      if (!res.ok) {
        const b = await res.text();
        const waitSec = attempt * 20;
        log(`  ⏳ Embedding HTTP ${res.status} (tentative ${attempt}/8), attente ${waitSec}s... [${b.slice(0, 80)}]`);
        await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
        continue;
      }

      const data = await res.json();
      const values = data.embedding?.values;
      if (values && values.length > 0) {
        return values;
      }
      throw new Error('Réponse vide');

    } catch (err) {
      if (err.message.startsWith('PERMANENT:') || attempt >= 8) {
        throw new Error(`❌ Aucun modèle embedding disponible (${err.message})`);
      }
      const waitSec = attempt * 20;
      log(`  ⏳ Embedding erreur (tentative ${attempt}/8), attente ${waitSec}s... [${err.message.slice(0, 80)}]`);
      await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
    }
  }
  throw new Error('❌ Aucun modèle embedding disponible');
}

/**
 * Insère un document dans central_cg (identique au comportement de la page Admin)
 */
async function insertCentralCg(data) {
  const query = `
    INSERT INTO central_cg (
      insurer_code,
      insurance_type_code,
      insurance_sub_type_code,
      document_type_code,
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
      pdf_base64,
      vectorization_status,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'processing', NOW(), NOW())
    RETURNING id
  `;

  const values = [
    data.insurer_code,
    data.insurance_type_code,
    data.insurance_sub_type_code || null,
    data.document_type_code || data.type || 'CG',
    data.version || '001',
    data.document_type_code || data.type || 'CG',
    data.owner || 'system_bulk_upload',
    data.detail || '',
    data.url || '',
    data.target_filename,
    data.status || 'active',
    data.content_text,
    data.embedding ? JSON.stringify(data.embedding) : null,
    JSON.stringify(data.metadata || {}),
    data.pdf_base64 || null
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}

/**
 * Insère une page dans central_cg_pages (schema identique à la page Admin)
 */
async function insertCgPage(pageData) {
  const query = `
    INSERT INTO central_cg_pages (
      central_cg_id,
      page_number,
      content_text,
      layout_text,
      embedding,
      page_image_base64,
      has_table,
      table_json,
      table_extraction_confidence,
      chunk_type,
      guarantee_codes,
      article_ref,
      classification_confidence,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    ON CONFLICT (central_cg_id, page_number) DO UPDATE SET
      content_text = EXCLUDED.content_text,
      layout_text  = EXCLUDED.layout_text,
      embedding    = COALESCE(EXCLUDED.embedding, central_cg_pages.embedding),
      has_table    = EXCLUDED.has_table,
      table_json   = EXCLUDED.table_json,
      table_extraction_confidence = EXCLUDED.table_extraction_confidence,
      chunk_type   = EXCLUDED.chunk_type,
      guarantee_codes = EXCLUDED.guarantee_codes,
      article_ref  = EXCLUDED.article_ref,
      classification_confidence = EXCLUDED.classification_confidence,
      updated_at   = CURRENT_TIMESTAMP
    RETURNING id
  `;

  const values = [
    pageData.central_cg_id,
    pageData.page_number,
    pageData.content_text,
    pageData.layout_text || pageData.content_text,   // layout_text = même texte si pas de rendu canvas
    pageData.embedding ? JSON.stringify(pageData.embedding) : null,
    pageData.page_image_base64 || null,
    pageData.has_table,
    pageData.table_json ? JSON.stringify(pageData.table_json) : null,
    pageData.confidence || null,
    pageData.chunk_type || 'general',
    pageData.guarantee_codes || [],
    pageData.article_ref || null,
    pageData.classification_confidence || null
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
      coverage_notes,
      franchise,
      source_page_id,
      source_page_number,
      extraction_confidence,
      extracted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (insurer_code, insurance_type_code, central_cg_id, guarantee_key, formula_key) 
    DO UPDATE SET
      guarantee_label = EXCLUDED.guarantee_label,
      formula_label = EXCLUDED.formula_label,
      coverage_status = EXCLUDED.coverage_status,
      coverage_amount = EXCLUDED.coverage_amount,
      coverage_notes  = EXCLUDED.coverage_notes,
      franchise = EXCLUDED.franchise,
      source_page_id = EXCLUDED.source_page_id,
      source_page_number = EXCLUDED.source_page_number,
      extraction_confidence = EXCLUDED.extraction_confidence,
      updated_at = NOW()
  `;

  let insertedCount = 0;
  for (const fact of facts) {
    try {
      await retryDbOperation(() => pool.query(query, [
        fact.insurer_code,
        fact.insurance_type_code,
        fact.central_cg_id,
        fact.guarantee_key,
        fact.guarantee_label,
        fact.formula_key,
        fact.formula_label,
        fact.coverage_status,
        fact.coverage_amount,
        fact.coverage_notes || null,
        fact.franchise,
        fact.source_page_id,
        fact.source_page_number,
        fact.extraction_confidence
      ]));
      insertedCount++;
    } catch (error) {
      log(`  ⚠️  Erreur insertion fact [${fact.guarantee_key}×${fact.formula_key}]: ${error.message}`);
      // Si contrainte unique manquante, tenter sans ON CONFLICT
      if (error.message.includes('constraint') || error.message.includes('does not exist')) {
        try {
          const simpleQuery = query.replace(/ON CONFLICT[\s\S]*$/, '');
          await pool.query(simpleQuery, [
            fact.insurer_code, fact.insurance_type_code, fact.central_cg_id,
            fact.guarantee_key, fact.guarantee_label, fact.formula_key, fact.formula_label,
            fact.coverage_status, fact.coverage_amount, fact.coverage_notes || null, fact.franchise,
            fact.source_page_id, fact.source_page_number, fact.extraction_confidence
          ]);
          insertedCount++;
        } catch (e2) {
          log(`  ❌ Echec fallback: ${e2.message}`);
        }
      }
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
    const pdfBase64 = pdfBuffer.toString('base64'); // stocker en DB comme la page Admin

    // Extraire le texte complet pour central_cg (LOCAL - 0 token Gemini)
    log(`  📄 Extraction du texte complet (locale, sans Gemini)...`);
    const fullText = await extractFullTextFromPdf(pdfBuffer);
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
      // Support des variantes de nommage de colonne dans l'Excel
      insurance_sub_type_code: row.insurance_sub_type || row.Insurance_sub_type_code || row.Sub_type || null,
      document_type_code: row.Document_type_code || row.Type || 'CG',
      version: version,
      type: row.Document_type_code || row.Type || 'CG',
      owner: 'system_bulk_upload',
      detail: row['Détail'] || row.detail || '',
      url: row.URL || '',
      target_filename: row['nom fichier cible'],
      status: 'active',
      content_text: fullText,
      embedding: fullEmbedding,
      pdf_base64: pdfBase64,         // identique à la page Admin
      metadata: {
        productName:          row.Product_name || row.Insurer_name || '',
        insurer_name:         row.Insurer_name || row.Insurer || '',
        insurance_type_name:  row.Insurance_type_name || row.Insurance_type || '',
        formula:              row.formula || row.Formula || row.Formule || null,
        description:          row.description || row.Description || row.Sous_produit || null,
        indexedFormulas:      [],
        indexedOptions:       {},
        source: 'excel_bulk_upload_with_pages'
      }
    };
    
    const cgId = await retryDbOperation(() => insertCentralCg(cgData));
    log(`  ✅ Document central_cg créé avec ID ${cgId}`);

    // Copier le PDF dans le répertoire de stockage centralisé
    try {
      const targetDir = path.join(PDF_STORAGE_DIR, 'central', row.Insurer);
      fs.mkdirSync(targetDir, { recursive: true });
      const safeName = `${Date.now()}_${row['nom fichier cible'].replace(/[^a-zA-Z0-9_\-.]/g, '_')}`;
      const targetPath = path.join(targetDir, safeName);
      fs.copyFileSync(pdfPath, targetPath);
      const relPath = `central/${row.Insurer}/${safeName}`;
      await pool.query('UPDATE central_cg SET pdf_file_path = $1 WHERE id = $2', [relPath, cgId]);
      log(`  ✅ PDF copié: ${relPath}`);
    } catch (copyErr) {
      log(`  ⚠️  Copie PDF échouée (non bloquant): ${copyErr.message}`);
    }
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    log(`  📄 ${pageCount} pages à traiter`);

    // Extraire toutes les pages localement via pdfjs-dist (LOCAL - 0 token Gemini)
    log(`  📄 Extraction du texte page par page (locale, sans Gemini)...`);
    const allPages = await extractAllPagesByGemini(pdfBuffer, pageCount);

    let pagesProcessed = 0;
    let tablesFound = 0;
    let factsCreated = 0;

    // Traiter chaque page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      log(`    Page ${pageNum}/${pageCount}...`);
      
      try {
        const pageData = allPages[pageNum - 1] || { text: '' };
        
        // Générer embedding de la page (pause 1s pour éviter rate limit)
        await new Promise(resolve => setTimeout(resolve, 1000));
        let pageEmbedding = null;
        if (pageData.text && pageData.text.trim().length > 10) {
          pageEmbedding = await generateEmbedding(pageData.text);
        } else {
          log(`      ⚠️  Page ${pageNum} vide, embedding ignoré`);
        }
        
        // Détecter si la page contient un tableau
        const hasTable = detectTableInPage(pageData.text);
        
        let tableJson = null;
        let confidence = 0.0;
        let pageId = null;
        
        // Si tableau détecté, extraire via texte (sans image)
        if (hasTable) {
          log(`      🔍 Tableau détecté, extraction texte...`);
          tableJson = await extractTableFromPageText(
            pageData.text,
            row.Insurer,
            row.Insurance_type
          );
          
          if (tableJson && tableJson.rows && tableJson.rows.length > 0) {
            confidence = tableJson.confidence || 0;
            tablesFound++;
          }
        }
        
        // Insérer la page dans central_cg_pages (schema complet = page Admin)
        const classification = classifyPageType(pageData.text, hasTable && tableJson !== null);
        const pageRecord = {
          central_cg_id: cgId,
          page_number: pageNum,
          content_text: pageData.text,
          layout_text: pageData.text,   // pas de rendu canvas → même texte
          embedding: pageEmbedding,
          page_image_base64: null,
          has_table: hasTable && tableJson !== null,
          table_json: tableJson,
          confidence: confidence,
          chunk_type: classification.chunkType,
          guarantee_codes: classification.guaranteeCodes,
          article_ref: classification.articleRef,
          classification_confidence: classification.confidence
        };
        
        pageId = await retryDbOperation(() => insertCgPage(pageRecord));
        
        // Si tableau valide, créer les coverage_facts
        if (tableJson && tableJson.rows && tableJson.rows.length > 0) {
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

    // Marquer la vectorisation comme terminée (identique à pageVectorizationService)
    try {
      await pool.query(
        `UPDATE central_cg
         SET vectorization_status = 'done',
             pages_total     = $1,
             pages_processed = $2,
             tables_extracted = $3,
             vectorized_at   = NOW(),
             updated_at      = NOW()
         WHERE id = $4`,
        [pageCount, pagesProcessed, tablesFound, cgId]
      );
      log(`  ✅ Statut central_cg mis à jour: done (${pagesProcessed}/${pageCount} pages, ${tablesFound} tableaux)`);
    } catch (updErr) {
      log(`  ⚠️  Mise à jour statut CG (non bloquant): ${updErr.message}`);
    }

    // Mettre à jour le statut Excel
    row.Status = 'done';
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
      // Vérifier que la DB est prête avant chaque document
      await waitForDbReady();
      const result = await processDocument(row, i, rowsToProcess.length);

      if (result.success) {
        successCount++;
        totalPages += result.pages || 0;
        totalTables += result.tables || 0;
        totalFacts += result.facts || 0;
      } else {
        errorCount++;
      }

      // Pause entre documents + CHECKPOINT pour libérer la mémoire PostgreSQL
      if (i < rowsToProcess.length - 1) {
        try {
          await pool.query('CHECKPOINT');
          log(`  🧹 CHECKPOINT effectué`);
        } catch (e) { /* ignore */ }
        log(`\n  ⏳ Pause de 15 secondes...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
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
    logTokenSummary();

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
