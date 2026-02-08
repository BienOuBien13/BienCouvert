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
async function extractPage(pdfBuffer: Buffer, pageNum: number): Promise<PageData | null> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
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
 * Détecte si une page contient un tableau de garanties
 */
function detectTable(text: string): boolean {
  // Heuristiques simples
  const hasFormulas = /tiers|tous risques|confort|essentiel|leasing/i.test(text);
  const hasGuarantees = /responsabilit|bris|vol|incendie|dommages|assistance/i.test(text);
  const hasSymbols = /[✓✔○●•]/g.test(text) || /\b(inclus|option|exclu)\b/i.test(text);
  
  return hasFormulas && hasGuarantees && (hasSymbols || text.split('\n').length > 10);
}

/**
 * Vectorise un CG page par page avec extraction de tableaux
 */
export async function vectorizeCgByPages(
  pool: Pool,
  centralCgId: number,
  pdfUrl: string
): Promise<{ pagesProcessed: number; tablesExtracted: number; factsCreated: number }> {
  console.log(`\n🔄 Vectorisation page par page du CG ${centralCgId}...`);
  
  try {
    // Récupérer les infos du CG
    const cgResult = await pool.query(
      'SELECT insurer_code, insurance_type_code, pdf_base64 FROM central_cg WHERE id = $1',
      [centralCgId]
    );
    
    if (cgResult.rows.length === 0) {
      throw new Error(`CG ${centralCgId} introuvable`);
    }
    
    const cg = cgResult.rows[0];
    const pdfBuffer = Buffer.from(cg.pdf_base64, 'base64');
    
    // Compter les pages
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    
    console.log(`📄 ${numPages} pages à traiter`);
    
    let pagesProcessed = 0;
    let tablesExtracted = 0;
    let factsCreated = 0;
    
    // Traiter chaque page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      console.log(`\n📄 Page ${pageNum}/${numPages}...`);
      
      const pageData = await extractPage(pdfBuffer, pageNum);
      if (!pageData) {
        console.warn(`⚠️ Échec extraction page ${pageNum}`);
        continue;
      }
      
      // Générer embedding
      const embedding = await generateEmbedding(pageData.contentText);
      
      // Détecter tableau
      const hasTable = detectTable(pageData.contentText);
      
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
      
      // Sauvegarder la page
      const pageInsert = await pool.query(
        `INSERT INTO central_cg_pages (
          central_cg_id, page_number, content_text, layout_text,
          embedding, page_image_base64, page_width, page_height,
          has_table, table_json, table_extraction_confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (central_cg_id, page_number) DO UPDATE SET
          content_text = EXCLUDED.content_text,
          layout_text = EXCLUDED.layout_text,
          embedding = EXCLUDED.embedding,
          page_image_base64 = EXCLUDED.page_image_base64,
          page_width = EXCLUDED.page_width,
          page_height = EXCLUDED.page_height,
          has_table = EXCLUDED.has_table,
          table_json = EXCLUDED.table_json,
          table_extraction_confidence = EXCLUDED.table_extraction_confidence,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [
          centralCgId,
          pageNum,
          pageData.contentText,
          pageData.layoutText,
          JSON.stringify(embedding),
          pageData.imageBase64,
          pageData.width,
          pageData.height,
          hasTable,
          tableJson ? JSON.stringify(tableJson) : null,
          extractionConfidence
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
      console.log(`   ✅ Page ${pageNum} sauvegardée`);
    }
    
    console.log(`\n✅ Vectorisation terminée:`);
    console.log(`   - ${pagesProcessed} pages traitées`);
    console.log(`   - ${tablesExtracted} tableaux extraits`);
    console.log(`   - ${factsCreated} faits de couverture créés`);
    
    return { pagesProcessed, tablesExtracted, factsCreated };
    
  } catch (error) {
    console.error('❌ Erreur vectorisation par pages:', error);
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
