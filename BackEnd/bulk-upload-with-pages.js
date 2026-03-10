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
// Rendu page PDF → image PNG base64 (identique à pageVectorizationService.ts)
const { createCanvas } = _require('canvas');

// ─── Token tracking (bulk script) ────────────────────────────────────────────
const tokenStats = {
  tableExtraction:    { calls: 0, inputTokens: 0, outputTokens: 0 },
  metadataExtraction: { calls: 0, inputTokens: 0, outputTokens: 0 },
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
  // Tarif Gemini 2.5 Flash (estimatif 2026)
  // - Input  : $0.075/1M tokens (≤200k tokens par appel ; $0.15/1M au-delà — nos appels sont bien en dessous)
  // - Output : $0.30/1M tokens
  // - Note   : pour les appels Vision, les tokens image sont inclus dans promptTokenCount
  //            (l'API Gemini les reporte déjà dans ce champ, donc la formule est correcte).
  // - Taux EUR/USD : 0.92 (approximation mars 2026 — à ajuster selon le cours réel)
  const costUsd = (totalIn / 1e6) * 0.075 + (totalOut / 1e6) * 0.30;
  const costEur = costUsd * 0.92;
  log(`   ─────────────────────────────────────────────────`);
  log(`   TOTAL : ${totalCalls} appels — in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()} tokens`);
  log(`   Coût estimé : $${costUsd.toFixed(4)} USD ≈ ${costEur.toFixed(4)} EUR (tarif Flash 2.5, taux 0.92)`);
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
 * Détecte si une page contient un tableau de garanties.
 * Logique alignée sur detectTable() de pageVectorizationService.ts
 * pour une détection robuste identique entre bulk-upload et Admin.
 */
function detectTableInPage(pageText) {
  const text = pageText;
  const t = text.toLowerCase();

  // ── Colonnes de formules (noms de formules / niveaux / options) ──
  const hasFormulas =
    // Auto : tiers, tous risques, confort, etc.
    /tiers[\s-]*(eco|essentiel|\+)?|tous[\s-]*risques|leasing|confort|int[eé]gral|pl[eé]nitude/i.test(text)
    // Habitation : formule 1/2/3, essentiel, premium, intégral
    || /formule\s*\d|formule\s+[a-z]/i.test(text)
    || /niveau\s*\d|option\s*\d|pack\s/i.test(text)
    || /\bessentiel\b|\bconfort\b|\bpremium\b|\boptimum\b|\bzenith\b|\bs[eé]r[eé]nit[eé]\b/i.test(text)
    // Bancaire / protection
    || /bourso\s*protect|visa\s|mastercard|formule\s*(plus|\+)/i.test(text)
    // Santé, prévoyance
    || /\bbase\b.*\brenforcé|\brenforcé\b.*\bbase\b|\bsurcompl[eé]mentaire\b/i.test(text)
    // Générique : bronze/silver/gold, économique/standard/premium, protectrice, élargie
    || /bronze|silver|gold|platinum|standard|[eé]conomique|[eé]largie|protectrice/i.test(text)
    // Au moins 2 colonnes nommées
    || (text.match(/formule/gi) || []).length >= 2;

  // ── Lignes de garanties ──
  const hasGuarantees =
    /responsabilit[eé]|bris[\s-]*de[\s-]*glac|vitrage|pare[\s-]*brise/i.test(text)
    || /\bvol\b|incendie|dommages|assistance|conducteur/i.test(text)
    || /d[eé]g[aâ]ts?\s*des\s*eaux|catastrophe|tempête|grêle|neige|foudre/i.test(text)
    || /serrurerie|plomberie|[eé]lectricit[eé]|chauffage/i.test(text)
    || /d[eé]pannage|relogement|gardiennage|objets\s*de\s*valeur/i.test(text)
    || /protection.*paiement|moyens?\s*de\s*paiement|vol\s*d.esp[eè]ces/i.test(text)
    || /cl[eé]s|papiers|maroquinerie|spectacle|voyage/i.test(text)
    || /hospitalisation|optique|dentaire|consultation|m[eé]decine/i.test(text)
    || /garantie|couverture|franchise|plafond|sinistre/i.test(text);

  // ── Symboles visuels OR mots-clés de statut ──
  const hasSymbols =
    /[\u2713\u2714\u25cb\u25cf\u2022\u2717\u2718\u00d7\u25a0\u25a1\u25aa\u25ab\u25c6\u25c7\u25b3]/g.test(text)
    || /\b(inclus|option|exclu|oui|non|garanti|non garanti)\b/i.test(text);

  // ── Structure tabulaire ──
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const hasMultipleLines = lines.length > 5;
  const hasTableStructure = lines.filter(l => l.trim().length < 80).length > 8;

  // Détection principale : formules + garanties + (symboles OU structure)
  if (hasFormulas && hasGuarantees && (hasSymbols || hasMultipleLines)) return true;
  // Détection secondaire : beaucoup de garanties + structure tabulaire
  if (hasGuarantees && hasTableStructure && hasSymbols) return true;
  // Détection tertiaire : légende explicite
  if (/l[eé]gende|symbole.*:|correspond/i.test(text) && hasGuarantees) return true;

  return false;
}

/**
 * Détection secondaire : pages avec mots-clés de garantie → tenter Vision
 * même si pas sûr (identique à maybeTable dans pageVectorizationService.ts)
 */
function detectMaybeTable(pageText) {
  return /garantie|formule|couverture|franchise|plafond/i.test(pageText)
    && pageText.split('\n').filter(l => l.trim().length > 0).length > 8;
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
  
  const formulas = tableData.headers.slice(1);
  const legend = tableData.legend || null;
  
  tableData.rows.forEach(row => {
    const guaranteeLabel = row[0] ? String(row[0]).trim() : '';
    if (!guaranteeLabel) return; // ignorer lignes vides / titres de section
    const guaranteeKey = normalizeKey(guaranteeLabel);
    
    formulas.forEach((formulaLabel, idx) => {
      const cellValue = row[idx + 1];
      const formulaKey = normalizeKey(formulaLabel);
      
      const coverageInfo = parseStatus(cellValue, legend);
      if (coverageInfo.status === 'excluded') {
        log(`      ⚠️  [tableToFacts] "${guaranteeLabel}" × "${formulaLabel}" : cellule="${cellValue}" → ${coverageInfo.status}`);
      }
      
      facts.push({
        insurer_code: insurerCode,
        insurance_type_code: insuranceTypeCode,
        central_cg_id: centralCgId,
        guarantee_key:   truncate(guaranteeKey,   200),
        guarantee_label: truncate(guaranteeLabel, 500),
        formula_key:     truncate(formulaKey,     200),
        formula_label:   truncate(formulaLabel,   500),
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
 * Tronque une chaîne à max caractères (sécurité DB).
 * Migration 019 a élargi les colonnes en TEXT, mais on garde
 * des clés courtes pour la contrainte UNIQUE et la lisibilité.
 */
function truncate(s, max) {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
}

/**
 * Parse le statut d'une cellule de tableau
 * Supporte les symboles Unicode, la légende optionnelle, et tous les formats Gemini
 */
function parseStatus(cellValue, legend) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return { status: 'not_applicable', amount: null, franchise: null };
  }

  const raw = cellValue.toString().trim();
  const s   = raw.toLowerCase();

  if (!raw) return { status: 'not_applicable', amount: null, franchise: null };

  // 1. Légende prioritaire
  if (legend) {
    const legendVal = legend[raw] || legend[s] || legend[raw.toUpperCase()];
    if (legendVal) {
      const lv = legendVal.toLowerCase();
      if (/inclu|garanti|compris|couvert|oui|yes|included/.test(lv))
        return { status: 'included', amount: extractAmount(s), franchise: extractFranchise(s) };
      if (/exclu|non|no|néant|neant|excluded/.test(lv))
        return { status: 'excluded', amount: null, franchise: null };
      if (/option|en sus|optionnel|optional/.test(lv))
        return { status: 'optional', amount: extractAmount(s), franchise: extractFranchise(s) };
      if (/n\/a|sans objet|not.applicable/.test(lv))
        return { status: 'not_applicable', amount: null, franchise: null };
    }
  }

  // 2. Symboles inclus (Unicode + texte)
  if (/[\u2713\u2714\u25cb\u25cf\u2022\u221a\u25a0\u25aa\u25c6]/.test(raw)
      || /^(oui|inclus|included|compris|couvert|garanti)$/i.test(s)) {
    return { status: 'included', amount: extractAmount(s), franchise: extractFranchise(s) };
  }

  // 3. Symboles exclus
  if (/[\u2717\u2718\u00d7\u2715\u25a1\u25ab]/.test(raw) // ✗✘×✕□▫
      || /^(-|−|–|—|\.\.\.|--)$/.test(raw)         // tirets seuls
      || /^x$/.test(s)                                    // lettre x seule
      || /^(non|no|exclu|excluded|néant|neant|nul|nulle)$/i.test(s)) {
    return { status: 'excluded', amount: null, franchise: null };
  }

  // 4. Symboles option
  if (/[\u25cb\u25ef\u2299\u25b3]/.test(raw)
      || /^(option|opt\.|en option|en sus|sur option|optionnel)$/i.test(s)) {
    return { status: 'optional', amount: extractAmount(s), franchise: extractFranchise(s) };
  }

  // 5. N/A
  if (/^(n\/a|na|s\.o\.|sans objet|so|n\.a\.)$/i.test(s))
    return { status: 'not_applicable', amount: null, franchise: null };

  // Exclus — catch-all textuel AVANT le fallback inclusif
  // Patterns explicites d'exclusion en texte long
  if (/\b(non\s+inclus|non\s+couvert|non\s+compris|non\s+garanti|non\s+pris\s+en\s+charge|pas\s+inclus|pas\s+couvert|exclue?|exclusion)\b/i.test(s))
    return { status: 'excluded', amount: null, franchise: null };
  if (/^non[\s.,;:!]*$/i.test(s))
    return { status: 'excluded', amount: null, franchise: null };
  // Dash/tiret seul = non couvert pour cette formule
  if (/^[-–—.]{1,5}$/.test(raw))
    return { status: 'excluded', amount: null, franchise: null };

  // 6. Montant ou texte positif (plafond, capital, remboursement…) → inclus
  const amount = extractAmount(s);
  if (amount && !/\b(non|exclu|sans)\b/i.test(s)) return { status: 'included', amount, franchise: extractFranchise(s) };
  if (/\b(jusqu'?à|jusqu.a|plafond|forfait|capital|rente|indemnit|prise\s+en\s+charge|remboursement)\b/i.test(s))
    return { status: 'included', amount: null, franchise: extractFranchise(s) };

  return { status: 'not_applicable', amount: null, franchise: null };
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

// ─── Helpers d'alignement Admin ↔ Bulk ────────────────────────────────────────

/**
 * Lookup case-insensitive d'une valeur dans une row Excel.
 * Essaie les clés exactes puis insensible à la casse + trim.
 */
function getColValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  const rowLow = {};
  for (const [k, v] of Object.entries(row)) rowLow[k.trim().toLowerCase()] = v;
  for (const key of keys) {
    const v = rowLow[key.trim().toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/**
 * Extrait le texte ET rend la page en image PNG via canvas (identique à extractPage() de
 * pageVectorizationService.ts). Prend un document pdfjs déjà chargé pour éviter le rechargement.
 */
async function extractPageWithCanvas(pdfDoc, pageNum) {
  try {
    const page = await pdfDoc.getPage(pageNum);

    // ── Texte ──────────────────────────────────────────────────────────────────
    const textContent = await page.getTextContent();
    const contentText = textContent.items.map(item => item.str).join(' ');
    const layoutText  = textContent.items
      .map(item => ({ text: item.str, y: (item.transform ? item.transform[5] : 0) }))
      .sort((a, b) => b.y - a.y)
      .map(item => item.text)
      .join('\n');

    // ── Image canvas ──────────────────────────────────────────────────────────
    let imageBase64 = null, width = null, height = null;
    try {
      const viewport = page.getViewport({ scale: 2.0 }); // 2× pour meilleure qualité
      const canvas   = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context  = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      imageBase64 = canvas.toBuffer('image/png').toString('base64');
      width  = Math.floor(viewport.width);
      height = Math.floor(viewport.height);
    } catch (renderErr) {
      // Non bloquant — la page sera insérée sans image
    }

    return { contentText, layoutText, imageBase64, width, height };
  } catch (err) {
    log(`      ⚠️  extractPageWithCanvas p.${pageNum}: ${err.message}`);
    return { contentText: '', layoutText: '', imageBase64: null, width: null, height: null };
  }
}

/**
 * Extraction tableau via Vision Gemini — identique à extractTableFromPageImage()
 * dans tableExtractionService.ts.
 * Retourne au format Vision : { headers, rows: [{guarantee, formulas{}}], confidence, legend, _isVision:true }
 */
async function extractTableFromPageVision(imageBase64, insurerCode, insuranceTypeCode) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Tu es un expert en analyse de tableaux de garanties d'assurance français.
Analyse cette image de page PDF et extrait la matrice complète garanties × formules.

═══ ÉTAPE 1 — LÉGENDE (CRITIQUE — faire AVANT toute extraction) ═══
Cherche PARTOUT sur la page une légende, un encadré "Légende", "Symboles", une note de bas de page ou un texte explicatif des symboles.
Exemples fréquents :
- "● = garanti" / "○ = en option" / "— = non garanti"
- "G = garanti" / "O = option" / "E = exclu"
- Icones colorées, symboles géométriques, chiffres codés

Reporte la légende dans le champ "legend" : { "symbole_brut": "included|excluded|optional" }
Si aucune légende trouvée : "legend": null

═══ ÉTAPE 2 — EXTRACTION DU TABLEAU ═══
Pour chaque cellule, APPLIQUE la légende pour déterminer le statut et normalise la valeur :
- Inclus (légende = "garanti"/"inclus"/"oui") → mettre "✓"
- Exclu (légende = "non garanti"/"exclu"/"non") → mettre "✗"
- Option (légende = "en option"/"sur option"/"optionnel") → mettre "○"
- Cellule VIDE (vraiment vide) → mettre ""
- Montant ou texte descriptif → mettre le texte exact ("1 500 €", "Jusqu'à 3000 €")

Si PAS de légende :
- ✓ ✔ ● • √ ■ ▪ ◆ "Oui" "Inclus" "Garanti" → "✓"
- ✗ ✘ × "Non" "Exclu" "Néant" □ ▫ → "✗"
- X ou x seul (lettre) → "✗"
- – — - (tiret seul) → "✗"
- ○ ◯ "Option" "En option" "En sus" △ → "○"

⚠️ RÈGLES :
1. LÉGENDE = PRIORITÉ ABSOLUE.
2. Cellule VIDE (pas de symbole) ≠ exclu : mets "".
3. Identifie TOUTES les lignes (y compris sous-garanties en retrait).
4. Identifie TOUTES les colonnes de formules.

FORMAT JSON STRICT (aucun autre texte) :
{
  "has_table": true,
  "legend": { "●": "included", "○": "optional", "—": "excluded" },
  "headers": ["Garanties", "FORMULE 1", "FORMULE 2", "FORMULE 3"],
  "rows": [
    { "guarantee": "Responsabilité civile", "formulas": { "formule_1": "✓", "formule_2": "✓", "formule_3": "✓" } }
  ],
  "confidence": 0.95
}

CLÉS DE FORMULES en snake_case : espaces → "_", "+" → "_plus", majuscules → minuscules, accents supprimés.
Si aucun tableau visible : {"has_table": false, "confidence": 1.0}
RÉPONDS UNIQUEMENT AVEC LE JSON.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/png', data: imageBase64 } }
    ]);
    recordTokens('tableExtraction', result?.response?.usageMetadata);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.has_table || !parsed.rows || parsed.rows.length === 0) return null;

    // Capturer la légende
    const legend = (parsed.legend && typeof parsed.legend === 'object' && Object.keys(parsed.legend).length > 0)
      ? parsed.legend : null;
    if (legend) log(`      📖 Légende détectée: ${JSON.stringify(legend)}`);

    const headers = parsed.headers || [];
    const formulaHeaders = headers.slice(1);

    // Normaliser les lignes : array ou objet → toujours objet {guarantee, formulas}
    const rows = (parsed.rows || [])
      .filter(r => r !== null && r !== undefined)
      .map(r => {
        if (Array.isArray(r)) {
          const guarantee = String(r[0] || '');
          const formulas = {};
          formulaHeaders.forEach((h, i) => {
            const fk = normalizeKey(h.replace(/\+/g, '_plus'));
            formulas[fk] = String(r[i + 1] ?? '');
          });
          return { guarantee, formulas };
        }
        return r;
      })
      .filter(r => r.guarantee && r.guarantee.trim());

    log(`      📊 Vision: ${headers.length} colonnes × ${rows.length} lignes`);
    rows.slice(0, 3).forEach(r => {
      const cells = Object.entries(r.formulas || {}).map(([k, v]) => `${k}="${v}"`).join(', ');
      log(`         • "${r.guarantee}" → {${cells}}`);
    });
    if (rows.length > 3) log(`         ... (${rows.length - 3} lignes supplémentaires)`);

    return { headers, rows, confidence: parsed.confidence || 0.5, legend, _isVision: true };
  } catch (err) {
    log(`      ⚠️  Vision table: ${err.message}`);
    return null;
  }
}

/**
 * Convertit un tableau Vision (rows = objets {guarantee, formulas}) en coverage_facts.
 * Miroir de tableToFacts() dans tableExtractionService.ts.
 */
function tableToFactsVision(tableData, centralCgId, pageId, pageNumber, insurerCode, insuranceTypeCode) {
  const facts = [];
  if (!tableData?.headers || !tableData?.rows) return facts;
  const formulaHeaders = tableData.headers.slice(1); // ignorer la 1ère colonne "Garanties"
  const legend = tableData.legend || null;
  tableData.rows.forEach(row => {
    // Support des deux formats : objet {guarantee, formulas} ET tableau [label, sym1, sym2]
    const isArrayRow = Array.isArray(row);
    const guaranteeLabel = isArrayRow ? String(row[0] || '') : (row.guarantee || '');
    if (!guaranteeLabel.trim()) return;
    const guaranteeKey = normalizeKey(guaranteeLabel);
    formulaHeaders.forEach((formulaLabel, idx) => {
      const formulaKey = normalizeKey(formulaLabel.replace(/\+/g, '_plus'));
      let symbol = '';
      if (isArrayRow) {
        symbol = row[idx + 1] !== undefined ? String(row[idx + 1]) : '';
      } else {
        const fmls = row.formulas || {};
        if (fmls[formulaKey] !== undefined) {
          symbol = String(fmls[formulaKey]);
        } else {
          const geminiKeys = Object.keys(fmls);
          const matchKey = geminiKeys.find(gk => normalizeKey(gk.replace(/\+/g, '_plus')) === formulaKey);
          symbol = matchKey !== undefined
            ? String(fmls[matchKey])
            : (idx < geminiKeys.length ? String(fmls[geminiKeys[idx]]) : '');
        }
      }
      const coverageInfo = parseStatus(symbol, legend);
      if (coverageInfo.status === 'excluded') {
        log(`      ⚠️  [tableToFactsVision] "${guaranteeLabel}" × "${formulaLabel}" : symbole="${symbol}" → ${coverageInfo.status}`);
      }
      facts.push({
        insurer_code:        insurerCode,
        insurance_type_code: insuranceTypeCode,
        central_cg_id:       centralCgId,
        guarantee_key:       truncate(guaranteeKey,   200),
        guarantee_label:     truncate(guaranteeLabel, 500),
        formula_key:         truncate(formulaKey,     200),
        formula_label:       truncate(formulaLabel,   500),
        coverage_status:     coverageInfo.status,
        coverage_amount:     coverageInfo.amount,
        coverage_notes:      null,
        franchise:           coverageInfo.franchise,
        source_page_id:      pageId,
        source_page_number:  pageNumber,
        extraction_confidence: tableData.confidence
      });
    });
  });
  return facts;
}

/**
 * Extraction de métadonnées enrichies via Gemini (formules, options, résumé sémantique).
 * Identique à extractEnrichedMetadata() dans cg.ts / indexCgDocument() dans ai.ts.
 */
async function extractEnrichedMetadataBulk(text, insurerCode, insuranceTypeCode) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Analyse ce texte extrait de Conditions Générales ${insuranceTypeCode} de chez ${insurerCode}.

IMPORTANT: Base-toi UNIQUEMENT sur le contenu fourni. N'invente AUCUNE information.

Extrais du texte :
1. Les formules commerciales du contrat (les niveaux de couverture vendus par l'assureur).
   RÈGLES STRICTES — une formule est un EN-TÊTE DE COLONNE dans le tableau principal des garanties :
   • Exemples valides : Économique, Élargie, Confort, Tiers, Tous Risques, Essentiel, Gold, Premium, Bronze, Silver
   • NOMS COURTS : 1 à 5 mots maximum.
   • Si la formule s'appelle "Formule Économique", retourne "Économique" (sans le préfixe "Formule").
   • EXCLURE absolument : zones géographiques (France métropolitaine, Monaco, Corse, DROM, COM…)
   • EXCLURE : catégories produit ou segments clients (Appareils neufs, reconditionnés, Individu, Famille…)
   • EXCLURE : noms de garanties = lignes du tableau (Responsabilité Civile, Vol, Incendie, Bris de glace…)
   • EXCLURE : combinaisons avec "/" (ex : "Éco/Éq/Confort", "Standard / Autres Formules")
   • MAXIMUM 8 formules. En cas de doute, ne PAS inclure l'élément. Tableau vide [] si aucune formule certaine.
2. Les options complémentaires listées (ex: Assistance 0km, Protection du conducteur, Bris de glace).
3. Un résumé sémantique concis des garanties principales (max 200 mots).

Réponds UNIQUEMENT en JSON strict, sans texte ni markdown supplémentaire :
{"indexedFormulas":["Économique","Confort"],"indexedOptions":["Option 1"],"semanticSummary":"Résumé..."}

Texte (tronqué à 25 000 chars) :
${text.slice(0, 25000)}`;

    const result = await model.generateContent([{ text: prompt }]);
    recordTokens('metadataExtraction', result?.response?.usageMetadata);
    let jsonText = result.response.text().trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const fb = jsonText.indexOf('{'), lb = jsonText.lastIndexOf('}');
    if (fb !== -1 && lb !== -1) jsonText = jsonText.substring(fb, lb + 1);
    const parsed = JSON.parse(jsonText);
    return {
      indexedFormulas: Array.isArray(parsed.indexedFormulas) ? parsed.indexedFormulas : [],
      indexedOptions:  Array.isArray(parsed.indexedOptions)  ? parsed.indexedOptions  : [],
      semanticSummary: parsed.semanticSummary || ''
    };
  } catch (err) {
    log(`  ⚠️  Extraction métadonnées enrichies échouée: ${err.message}`);
    return { indexedFormulas: [], indexedOptions: [], semanticSummary: '' };
  }
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
      page_width,
      page_height,
      has_table,
      table_json,
      table_extraction_confidence,
      chunk_type,
      guarantee_codes,
      article_ref,
      classification_confidence,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
    ON CONFLICT (central_cg_id, page_number) DO UPDATE SET
      content_text = EXCLUDED.content_text,
      layout_text  = EXCLUDED.layout_text,
      embedding    = COALESCE(EXCLUDED.embedding, central_cg_pages.embedding),
      page_image_base64 = EXCLUDED.page_image_base64,
      page_width   = EXCLUDED.page_width,
      page_height  = EXCLUDED.page_height,
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
    pageData.layout_text || pageData.content_text,
    pageData.embedding ? JSON.stringify(pageData.embedding) : null,
    pageData.page_image_base64 || null,
    pageData.page_width  || null,
    pageData.page_height || null,
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
      -- Stratégie : la dernière extraction valide l'emporte.
      -- Exception : not_applicable ne peut pas écraser un statut réel (inclus/optionnel/exclu).
      coverage_status = CASE
        WHEN EXCLUDED.coverage_status = 'not_applicable'
          AND coverage_facts.coverage_status != 'not_applicable'
          THEN coverage_facts.coverage_status
        ELSE EXCLUDED.coverage_status
      END,
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
    let fullEmbedding = null;
    try {
      fullEmbedding = await generateEmbedding(fullText);
      log(`  ✅ Embedding généré (${fullEmbedding ? fullEmbedding.length + ' dims' : 'null'})`);
    } catch (embErr) {
      log(`  ⚠️  Embedding document indisponible (non bloquant): ${embErr.message}`);
    }

    // Extraire la version du nom de fichier
    const versionMatch = row['nom fichier cible'].match(/_(\d+)\.pdf$/);
    const version = versionMatch ? versionMatch[1] : '001';

    // Insérer dans central_cg
    log(`  💾 Insertion dans central_cg...`);
    const cgData = {
      insurer_code: row.Insurer,
      insurance_type_code: row.Insurance_type,
      // Support des variantes de nommage de colonne dans l'Excel (insensible à la casse)
      insurance_sub_type_code: getColValue(row, 'insurance_sub_type', 'Insurance_sub_type',
        'insurance_sub_type_code', 'Insurance_sub_type_code', 'Sub_type', 'sub_type'),
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
    // Charger pdfjs ONCE pour texte + rendu canvas (identique à pageVectorizationService.ts)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const pdfDocLoaded = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    const pageCount = pdfDocLoaded.numPages;
    log(`  📄 ${pageCount} pages à traiter`);

    // Extraction des métadonnées enrichies via Gemini (formules, options, résumé)
    log(`  🤖 Extraction métadonnées enrichies (Gemini)...`);
    const enrichedMeta = await extractEnrichedMetadataBulk(fullText, row.Insurer, row.Insurance_type);
    log(`  ✅ ${enrichedMeta.indexedFormulas.length} formules, ${enrichedMeta.indexedOptions.length} options indexées`);
    try {
      await pool.query(
        `UPDATE central_cg SET metadata = metadata || $1::jsonb WHERE id = $2`,
        [JSON.stringify({
          indexedFormulas: enrichedMeta.indexedFormulas,
          indexedOptions:  enrichedMeta.indexedOptions,
          semanticSummary: enrichedMeta.semanticSummary
        }), cgId]
      );
    } catch (metaErr) { log(`  ⚠️  Update metadata enrichi (non bloquant): ${metaErr.message}`); }

    let pagesProcessed = 0;
    let tablesFound = 0;
    let factsCreated = 0;
    const discoveredFormulaLabels = new Map(); // label → nb de pages où il apparaît comme en-tête tableau

    // Traiter chaque page : texte + canvas image + Vision/texte table + embedding
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      log(`    Page ${pageNum}/${pageCount}...`);
      
      try {
        // Extraction texte + rendu canvas (image base64) — identique à pageVectorizationService
        const { contentText, layoutText, imageBase64, width, height } =
          await extractPageWithCanvas(pdfDocLoaded, pageNum);
        
        // Embedding page (1.2s de pause pour respecter le rate-limit Gemini)
        await new Promise(r => setTimeout(r, 1200));
        let pageEmbedding = null;
        try {
          if (contentText && contentText.trim().length > 10) {
            pageEmbedding = await generateEmbedding(contentText);
          } else {
            log(`      ⚠️  Page ${pageNum} vide, embedding ignoré`);
          }
        } catch (embErr) { log(`      ⚠️  Embedding p.${pageNum}: ${embErr.message}`); }
        
        // Détection tableau (logique alignée sur pageVectorizationService.ts)
        const hasTable = detectTableInPage(contentText);
        const maybeTable = !hasTable && detectMaybeTable(contentText);
        let tableJson = null, confidence = 0.0, tableIsVision = false;
        
        if (hasTable || maybeTable) {
          if (imageBase64) {
            // Vision extraction — identique Admin (plus précise)
            log(`      📊 ${hasTable ? 'Tableau détecté' : 'Possible tableau'}, extraction Vision (image)...`);
            tableJson = await extractTableFromPageVision(imageBase64, row.Insurer, row.Insurance_type);
            if (tableJson && tableJson.rows && tableJson.rows.length > 0) {
              confidence = tableJson.confidence || 0;
              tablesFound++;
              tableIsVision = true;
              log(`      ✅ Vision: ${tableJson.rows.length} garanties`);
            } else if (maybeTable) {
              log(`      ℹ️ Pas de tableau trouvé par Vision (faux positif maybe-table)`);
            }
          }
          if (!tableJson && hasTable) {
            // Fallback texte si image indisponible ou Vision insuffisante
            log(`      🔍 Fallback extraction texte...`);
            tableJson = await extractTableFromPageText(contentText, row.Insurer, row.Insurance_type);
            if (tableJson && tableJson.rows && tableJson.rows.length > 0) {
              confidence = tableJson.confidence || 0;
              tablesFound++;
            }
          }
        }
        
        const classification = classifyPageType(contentText, hasTable && tableJson !== null);
        const pageRecord = {
          central_cg_id:          cgId,
          page_number:            pageNum,
          content_text:           contentText,
          layout_text:            layoutText || contentText,
          embedding:              pageEmbedding,
          page_image_base64:      imageBase64,    // ← rempli via canvas
          page_width:             width,
          page_height:            height,
          has_table:              hasTable && tableJson !== null,
          table_json:             tableJson,
          confidence:             confidence,
          chunk_type:             classification.chunkType,
          guarantee_codes:        classification.guaranteeCodes,
          article_ref:            classification.articleRef,
          classification_confidence: classification.confidence
        };
        
        const pageId = await retryDbOperation(() => insertCgPage(pageRecord));
        
        // Coverage facts
        if (tableJson) {
          // Capturer les labels de formules depuis les en-têtes du tableau
          if (tableJson.headers && tableJson.headers.length > 1) {
            tableJson.headers.slice(1).forEach(h => {
              if (h && h.trim().length > 1) {
                const label = h.trim();
                discoveredFormulaLabels.set(label, (discoveredFormulaLabels.get(label) || 0) + 1);
              }
            });
          }
          // Capturer aussi depuis les clés de formulas dans les rows (Vision)
          if (tableJson._isVision || tableIsVision) {
            (tableJson.rows || []).forEach(r => {
              if (r && r.formulas && typeof r.formulas === 'object') {
                // Les clés sont normalisées, utiliser plutôt les en-têtes originaux
                // Mais si headers ne contient pas assez d'info, extraire depuis formulas
              }
            });
          }
          const facts = tableIsVision
            ? tableToFactsVision(tableJson, cgId, pageId, pageNum, row.Insurer, row.Insurance_type)
            : tableToFacts(tableJson, cgId, pageId, pageNum, row.Insurer, row.Insurance_type);
          if (facts.length > 0) {
            factsCreated += await insertCoverageFacts(facts);
            log(`      ✅ ${facts.length} faits de couverture créés`);
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

    // Mettre à jour indexedFormulas : les formules Vision (en-têtes de tableaux) sont
    // la source la plus fiable — elles ont priorité sur l'extraction Gemini par texte seul
    // qui peut rater des formules quand le texte pdfjs est incomplet (accents, styling…)
    {
      const geminiFormulas = enrichedMeta.indexedFormulas || [];

      // Filtrer les en-têtes non-formule :
      // - mots de structure du tableau (Garanties, Prestations…)
      // - zones géographiques (France métropol, Monaco, DROM, Corse…)
      // - entrées trop longues (> 55 car.) = descriptions
      // - combinaisons multi-slash (Éco/Éq/Confort, ...)
      const isNotFormulaName = (f) => {
        const s = f.trim();
        if (s.length < 2 || s.length > 55) return true;
        if (/^(garanties?|prestations?|coverage|guarantee|nature|objet|description|montant|plafond|franchise)$/i.test(s)) return true;
        if (/\b(france\s+m[eé]trop|m[eé]tropol|corse|monaco|drom|com\s*\d|\bdom\b|antill|r[eé]union|martiniq|guadeloup|guyane|polyn[eé]sie|nouvelle[\s-]?cal|outre[\s-]?mer|m[eé]tropolitaine)\b/i.test(s)) return true;
        if (/\b(appareils?\s+(?:neufs?|reconditionn[eé]s?)|individu\b|famille\b)\b/i.test(s)) return true;
        if (/\w{2,}\s*\/\s*\w{2,}\s*\/\s*\w{2,}/.test(s)) return true;
        return false;
      };
      // Normalisation : retirer le préfixe "Formule " avant comparaison 
      const canonicalize = (f) => f.trim().replace(/^formules?\s+/i, '').replace(/\s+/g, ' ').toLowerCase();
      // Noms canoniques trouvés par Gemini texte (pour cross-validation Vision 1 occurrence)
      const geminiCanonicals = new Set(geminiFormulas.map(canonicalize));

      const cleanVisionFormulas = [...discoveredFormulaLabels.entries()]
        .filter(([label, count]) => !isNotFormulaName(label) && (count >= 2 || geminiCanonicals.has(canonicalize(label))))
        .map(([label]) => label);
      const cleanGeminiFormulas = geminiFormulas.filter(f => !isNotFormulaName(f));

      // Fusionner : Vision prioritaire, Gemini en complément — dédoublonnage canonique
      const seen = new Map(); // canonical key -> preferred label
      const allFormulas = [];
      for (const f of [...cleanVisionFormulas, ...cleanGeminiFormulas]) {
        const key = canonicalize(f);
        if (key.length > 1 && !seen.has(key)) {
          seen.set(key, f.trim());
          allFormulas.push(f.trim());
        }
      }

      if (allFormulas.length > 0) {
        log(`  🔄 Mise à jour indexedFormulas: ${allFormulas.length} formules (${cleanVisionFormulas.length} Vision + ${cleanGeminiFormulas.length} Gemini filtrés, dédoublonné)`);
        log(`     Vision (filtré): [${cleanVisionFormulas.join(', ')}]`);
        log(`     Gemini (filtré): [${cleanGeminiFormulas.join(', ')}]`);
        log(`     Final:           [${allFormulas.join(', ')}]`);
        try {
          await pool.query(
            `UPDATE central_cg SET metadata = metadata || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ indexedFormulas: allFormulas }), cgId]
          );
          log(`  ✅ indexedFormulas mis à jour: ${allFormulas.join(', ')}`);
        } catch (fErr) { log(`  ⚠️  Mise à jour indexedFormulas (non bloquant): ${fErr.message}`); }
      } else if (cleanGeminiFormulas.length > 0 || geminiFormulas.length > 0) {
        // Tous filtrés ou aucun passé — log uniquement
        log(`  ⚠️  Aucune formule retenue après filtrage (Vision: ${cleanVisionFormulas.length}, Gemini brut: ${geminiFormulas.length})`);
      } else {
        log(`  ⚠️  Aucune formule détectée (ni Vision, ni Gemini)`);
      }
    }

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
