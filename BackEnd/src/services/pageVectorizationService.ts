/**
 * Service de vectorisation page par page des CG
 * Remplace la vectorisation monolithique par une approche granulaire
 */

import { Pool } from 'pg';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { createCanvas } from 'canvas';
import { generateEmbedding } from './geminiService';
import { extractTableFromPageImage, tableToFacts, saveCoverageFacts } from './tableExtractionService';

// Configuration pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry');

// ─────────────────────────────────────────────────────────────
// Mécanisme de STOP : permet d'annuler une vectorisation en cours
// ─────────────────────────────────────────────────────────────
const stopRequests = new Map<number, boolean>();

/** Demande l'arrêt de la vectorisation d'un CG. */
export function requestStopVectorization(cgId: number): void {
  stopRequests.set(cgId, true);
}

/** Annule le flag de stop (nettoyage après arrêt). */
export function clearStopVectorization(cgId: number): void {
  stopRequests.delete(cgId);
}

/** Retourne true si l'arrêt a été demandé. */
export function isStopRequested(cgId: number): boolean {
  return stopRequests.get(cgId) === true;
}

// Délai minimum entre deux appels embedding (évite les 429 Gemini)
const EMBED_RATE_DELAY_MS = 1200; // ~50 req/min max

interface PageData {
  pageNumber: number;
  contentText: string;
  layoutText: string;
  imageBase64: string;
  width: number;
  height: number;
}

/**
 * Extrait une page de PDF en texte + image
 */
async function extractPage(pdfData: Uint8Array, pageNum: number): Promise<PageData | null> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDoc = await loadingTask.promise;
    
    if (pageNum > pdfDoc.numPages) {
      return null;
    }
    
    const page = await pdfDoc.getPage(pageNum);
    
    // Extraction texte
    const textContent = await page.getTextContent();
    const contentText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    // Layout text (préserve position relative)
    const layoutText = textContent.items
      .map((item: any) => {
        const transform = item.transform;
        const y = transform[5]; // Position Y
        return { text: item.str, y };
      })
      .sort((a: any, b: any) => b.y - a.y) // Trier de haut en bas
      .map((item: any) => item.text)
      .join('\n');
    
    // Render page en image PNG
    const viewport = page.getViewport({ scale: 2.0 }); // 2x pour meilleure qualité
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context as any,
      viewport: viewport
    }).promise;
    
    const imageBase64 = canvas.toBuffer('image/png').toString('base64');
    
    return {
      pageNumber: pageNum,
      contentText,
      layoutText,
      imageBase64,
      width: Math.floor(viewport.width),
      height: Math.floor(viewport.height)
    };
    
  } catch (error) {
    console.error(`❌ Erreur extraction page ${pageNum}:`, error);
    return null;
  }
}

/**
 * Codes de garanties connus (assurance auto + habitation + santé)
 */
const GUARANTEE_PATTERNS: { code: string; keywords: RegExp }[] = [
  { code: 'RC',                keywords: /responsabilit[eé]\s+civile|r\.c\./i },
  { code: 'DOMMAGES',         keywords: /dommages\s+(tous|collision|accident)|tous\s+risques/i },
  { code: 'VOL',              keywords: /\bvol\b|tentative\s+de\s+vol/i },
  { code: 'INCENDIE',         keywords: /incendie|explosion|attentat/i },
  { code: 'BRIS_GLACE',       keywords: /bris\s+de\s+glaces?|vitrage|pare-?brise/i },
  { code: 'ASSISTANCE',       keywords: /assistance|d[eé]pannage|remorquage/i },
  { code: 'PJ',               keywords: /protection\s+juridique|d[eé]fense.+recours/i },
  { code: 'CONDUCTEUR',       keywords: /conducteur|corporels?\s+du\s+conducteur/i },
  { code: 'CAT_NAT',          keywords: /catastrophes?\s+naturelles?|cat\s*nat/i },
  { code: 'FRANCHISE',        keywords: /franchise|participation/i },
  { code: 'PLAFOND',          keywords: /plafond|limite\s+de\s+garantie|montant\s+maximum/i },
];

/**
 * Classification sémantique d'une page de CG
 * Retourne le chunk_type, les codes garanties détectés et la référence article
 */
function classifyPage(text: string, hasTable: boolean): {
  chunkType: string;
  guaranteeCodes: string[];
  articleRef: string | null;
  confidence: number;
} {
  if (!text || text.trim().length < 20) {
    return { chunkType: 'inconnu', guaranteeCodes: [], articleRef: null, confidence: 0 };
  }

  // Si c'est un tableau de garanties, classification prioritaire
  if (hasTable) {
    return { chunkType: 'tableau', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.95 };
  }

  // Détection d'exclusions (forte spécificité)
  const isExclusion = /\b(ne\s+(pas|point)\s+(couvrir|garantir|inclure)|exclusion|exclu[se]?|non\s+garanti|ne\s+sont\s+pas\s+couverts?)\b/i.test(text)
    && !/article\s+\d/i.test(text.substring(0, 50));  // Pas juste un titre
  if (isExclusion && text.length > 200) {
    return { chunkType: 'exclusion', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.85 };
  }

  // Détection de restrictions (franchise, plafond, seuil)
  const isRestriction = /\b(franchise|plafond|seuil|limite|jusqu\'[àa]|maximum|minimum|\d+\s*€|\d+\s*eur)/i.test(text)
    && !/\bné(cessaire|faste)|franchir\b/i.test(text);
  if (isRestriction && text.length > 150) {
    return { chunkType: 'restriction', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.80 };
  }

  // Détection de garanties
  const isGarantie = /\bgaranti[et]|\bcouverture|\bprise\s+en\s+charge|\bcoverage\b/i.test(text)
    && !/définition|définit/i.test(text);
  if (isGarantie && text.length > 200) {
    return { chunkType: 'garantie', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.75 };
  }

  // Détection de définitions
  const isDefinition = /\b(au\s+sens\s+du\s+présent|on\s+entend\s+par|désigne|signifie|s\'entend\s+comme)\b/i.test(text);
  if (isDefinition) {
    return { chunkType: 'definition', guaranteeCodes: [], articleRef: extractArticleRef(text), confidence: 0.80 };
  }

  // Contenu général
  return { chunkType: 'general', guaranteeCodes: extractGuaranteeCodes(text), articleRef: extractArticleRef(text), confidence: 0.60 };
}

/**
 * Extrait les codes de garanties détectés dans un texte
 */
function extractGuaranteeCodes(text: string): string[] {
  return GUARANTEE_PATTERNS
    .filter(p => p.keywords.test(text))
    .map(p => p.code);
}

/**
 * Extrait la référence article (ex: "Article 12", "Art. 3.2", "§ 5")
 */
function extractArticleRef(text: string): string | null {
  const match = text.match(/\b(art(?:icle|\.)?\s*[\d.]+[A-Za-z]?|§\s*\d+[\d.]*)/i);
  return match ? match[0].trim() : null;
}

/**
 * Détecte si une page contient un tableau de garanties
 */
function detectTable(text: string): boolean {
  // Heuristiques améliorées: plus permissives pour capturer plus de pages avec tableau
  const hasFormulas = /tiers[\s-]*(eco|essentiel|\+)?|tous[\s-]*risques|confort|essentiel\+?|leasing|integral|plenitude|plénitude|bronze|silver|gold/i.test(text);
  const hasGuarantees = /responsabilit|bris[\s-]*de[\s-]*glac|vitrage|pare[\s-]*brise|\bvol\b|incendie|dommages|assistance|conducteur/i.test(text);
  const hasSymbols = /[\u2713\u2714\u25cb\u25cf\u2022]/g.test(text) || /\b(inclus|option|exclu|oui|non)\b/i.test(text);
  const hasMultipleLines = text.split('\n').length > 5;

  return hasFormulas && hasGuarantees && (hasSymbols || hasMultipleLines);
}

/**
 * Vectorise un CG page par page avec extraction de tableaux
 */
export async function vectorizeCgByPages(
  pool: Pool,
  centralCgId: number,
  pdfUrl: string,
  pdfBase64?: string
): Promise<{ pagesProcessed: number; tablesExtracted: number; factsCreated: number }> {
  console.log(`\n🔄 Vectorisation page par page du CG ${centralCgId}...`);

  // Marquer comme "en cours" dès le début (ignore l'erreur si colonne absente)
  try {
    await pool.query(
      `UPDATE central_cg SET vectorization_status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [centralCgId]
    );
  } catch (_) { /* colonne pas encore en DB */ }
  
  try {
    // Nettoyage préalable pour garantir un état cohérent en cas de re-traitement
    await pool.query('DELETE FROM coverage_facts WHERE central_cg_id = $1', [centralCgId]);
    await pool.query('DELETE FROM central_cg_pages WHERE central_cg_id = $1', [centralCgId]);

    // Récupérer les infos du CG
    const cgResult = await pool.query(
      'SELECT insurer_code, insurance_type_code, pdf_base64 FROM central_cg WHERE id = $1',
      [centralCgId]
    );
    
    if (cgResult.rows.length === 0) {
      throw new Error(`CG ${centralCgId} introuvable`);
    }
    
    const cg = cgResult.rows[0];
    const effectivePdfBase64 = pdfBase64 || cg.pdf_base64;

    if (!effectivePdfBase64) {
      throw new Error(`Aucun PDF disponible pour le CG ${centralCgId}`);
    }

    const pdfBuffer = Buffer.from(effectivePdfBase64, 'base64');
    const pdfUint8Array = new Uint8Array(pdfBuffer);
    
    // Compter les pages
    const loadingTask = pdfjsLib.getDocument({ data: pdfUint8Array });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    
    console.log(`📄 ${numPages} pages à traiter`);

    // Enregistrer le total de pages
    try {
      await pool.query(
        `UPDATE central_cg SET pages_total = $1 WHERE id = $2`,
        [numPages, centralCgId]
      );
    } catch (_) { /* colonne pas encore en DB */ }
    
    let pagesProcessed = 0;
    let tablesExtracted = 0;
    let factsCreated = 0;

    // Nettoyer un éventuel flag stop résiduel
    clearStopVectorization(centralCgId);

    // Traiter chaque page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {

      // ── Vérifier si un stop a été demandé ──
      if (isStopRequested(centralCgId)) {
        console.warn(`⛔ Vectorisation CG ${centralCgId} arrêtée à la page ${pageNum}/${numPages}`);
        clearStopVectorization(centralCgId);
        try {
          await pool.query(
            `UPDATE central_cg
             SET vectorization_status = 'partial',
                 pages_processed = $1,
                 vectorization_error = 'Arrêtée manuellement à la page ' || $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [pagesProcessed, pageNum, centralCgId]
          );
        } catch (_) {}
        return { pagesProcessed, tablesExtracted, factsCreated };
      }

      console.log(`\n📄 Page ${pageNum}/${numPages}...`);

      const pageData = await extractPage(pdfUint8Array, pageNum);
      if (!pageData) {
        console.warn(`⚠️ Échec extraction page ${pageNum}`);
        continue;
      }

      // Rate-limit : pause entre chaque appel embedding
      if (pageNum > 1) {
        await new Promise(r => setTimeout(r, EMBED_RATE_DELAY_MS));
      }

      // Générer embedding (peut retourner null si indisponible — non fatal)
      const embeddingValues = await generateEmbedding(pageData.contentText);
      // pgvector accepte NULL — la page est quand même indexée en texte
      const embedding = embeddingValues;
      
      // Détecter tableau
      const hasTable = detectTable(pageData.contentText);

      // ── Phase 1 : Classification sémantique du chunk ──
      const classification = classifyPage(pageData.contentText, hasTable);
      console.log(`   🏷️  Type: ${classification.chunkType} | Garanties: [${classification.guaranteeCodes.join(', ')}] | Art: ${classification.articleRef || '-'}`);
      
      let tableJson = null;
      let extractionConfidence = null;
      
      if (hasTable) {
        console.log(`   📊 Tableau détecté, extraction Vision...`);
        const table = await extractTableFromPageImage(
          pageData.imageBase64,
          cg.insurer_code,
          cg.insurance_type_code
        );
        
        if (table) {
          tableJson = table;
          extractionConfidence = table.confidence;
          tablesExtracted++;
          
          console.log(`   ✅ Tableau extrait: ${table.rows.length} garanties × ${table.headers.length - 1} formules`);
        }
      }
      
      // Sauvegarder la page avec les nouvelles colonnes de classification
      const pageInsert = await pool.query(
        `INSERT INTO central_cg_pages (
          central_cg_id, page_number, content_text, layout_text,
          embedding, page_image_base64, page_width, page_height,
          has_table, table_json, table_extraction_confidence,
          chunk_type, guarantee_codes, article_ref, classification_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (central_cg_id, page_number) DO UPDATE SET
          content_text = EXCLUDED.content_text,
          layout_text = EXCLUDED.layout_text,
          embedding = COALESCE(EXCLUDED.embedding, central_cg_pages.embedding),
          page_image_base64 = EXCLUDED.page_image_base64,
          page_width = EXCLUDED.page_width,
          page_height = EXCLUDED.page_height,
          has_table = EXCLUDED.has_table,
          table_json = EXCLUDED.table_json,
          table_extraction_confidence = EXCLUDED.table_extraction_confidence,
          chunk_type = EXCLUDED.chunk_type,
          guarantee_codes = EXCLUDED.guarantee_codes,
          article_ref = EXCLUDED.article_ref,
          classification_confidence = EXCLUDED.classification_confidence,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          centralCgId,
          pageNum,
          pageData.contentText,
          pageData.layoutText,
          embedding ? JSON.stringify(embedding) : null,  // NULL si pas d'embedding dispo
          pageData.imageBase64,
          pageData.width,
          pageData.height,
          hasTable,
          tableJson ? JSON.stringify(tableJson) : null,
          extractionConfidence,
          classification.chunkType,
          classification.guaranteeCodes,    // TEXT[] — PostgreSQL accepte un tableau JS
          classification.articleRef,
          classification.confidence
        ]
      );
      
      const pageId = pageInsert.rows[0].id;
      
      // Si tableau extrait, créer les faits de couverture
      if (tableJson) {
        const facts = tableToFacts(
          tableJson,
          cg.insurer_code,
          cg.insurance_type_code,
          centralCgId,
          pageId,
          pageNum
        );
        
        await saveCoverageFacts(
          pool,
          facts,
          cg.insurer_code,
          cg.insurance_type_code,
          centralCgId,
          pageId,
          pageNum
        );
        
        factsCreated += facts.length;
      }
      
      pagesProcessed++;
      console.log(`   ✅ Page ${pageNum} sauvegardée (${classification.chunkType})`);
    }
    
    // Marquer la vectorisation comme terminée
    try {
      await pool.query(
        `UPDATE central_cg
         SET vectorization_status = 'done',
             pages_processed = $1,
             tables_extracted = $2,
             vectorized_at = CURRENT_TIMESTAMP,
             vectorization_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [pagesProcessed, tablesExtracted, centralCgId]
      );
    } catch (_) { /* colonne pas encore en DB */ }

    console.log(`\n✅ Vectorisation terminée:`);
    console.log(`   - ${pagesProcessed} pages traitées`);
    console.log(`   - ${tablesExtracted} tableaux extraits`);
    console.log(`   - ${factsCreated} faits de couverture créés`);
    
    return { pagesProcessed, tablesExtracted, factsCreated };
    
  } catch (error: any) {
    console.error('❌ Erreur vectorisation par pages:', error);
    // Marquer l'erreur en base
    try {
      await pool.query(
        `UPDATE central_cg
         SET vectorization_status = 'failed',
             vectorization_error = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [error?.message || 'Erreur inconnue', centralCgId]
      );
    } catch (_) { /* colonne pas encore en DB */ }
    throw error;
  }
}

/**
 * Requête les faits de couverture pour une garantie × formule
 */
export async function queryCoverageFact(
  pool: Pool,
  insurerCode: string,
  insuranceTypeCode: string,
  guaranteeKey: string,
  formulaKey: string
): Promise<any> {
  const result = await pool.query(
    `SELECT 
      cf.*,
      cgp.content_text as page_text,
      cgp.page_image_base64
    FROM coverage_facts cf
    LEFT JOIN central_cg_pages cgp ON cf.source_page_id = cgp.id
    WHERE cf.insurer_code = $1 
      AND cf.insurance_type_code = $2
      AND cf.guarantee_key = $3
      AND cf.formula_key = $4
    LIMIT 1`,
    [insurerCode, insuranceTypeCode, guaranteeKey, formulaKey]
  );
  
  return result.rows[0] || null;
}

/**
 * Requête tous les faits pour une garantie (toutes formules)
 */
export async function queryCoverageByGuarantee(
  pool: Pool,
  insurerCode: string,
  insuranceTypeCode: string,
  guaranteeKey: string
): Promise<any[]> {
  const result = await pool.query(
    `SELECT *
    FROM coverage_facts
    WHERE insurer_code = $1 
      AND insurance_type_code = $2
      AND guarantee_key = $3
    ORDER BY formula_key`,
    [insurerCode, insuranceTypeCode, guaranteeKey]
  );
  
  return result.rows;
}
