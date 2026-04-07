/**
 * SmartSearchService.ts — Recherche intelligente d'URLs de PDF d'assurance
 *
 * Stratégies en cascade (la première réussie l'emporte) :
 *   1. Gemini + Google Search grounding  (recherche web en temps réel)
 *   2. Gemini knowledge (URL patterns connus, sans grounding — validés HTTP)
 *   3. HTTP crawl des pages de téléchargement communes
 *
 * Résultat : l'URL du PDF (ou de la page contenant le PDF) avec un score
 * de confiance. Le téléchargement réel est délégué à agentFetcher.
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { getAiClient } from '../services/geminiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartSearchResult {
  pdf_url:    string | null;
  page_url:   string | null;
  confidence: number;
  strategy:   'gemini_grounding' | 'gemini_knowledge' | 'http_crawl' | 'not_found';
  notes:      string;
}

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.get(
        url,
        { timeout, headers: { 'User-Agent': 'AssurClair-Bot/1.0 (contact@assurclair.fr)' } },
        (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
            req.destroy();
            return resolve(fetchHtml(res.headers.location, timeout));
          }
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout HTTP')); });
    } catch (e) {
      reject(e);
    }
  });
}

function extractPdfLinks(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const seen  = new Set<string>();
  const rgx   = /href=["']([^"']+\.pdf[^"']{0,100})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rgx.exec(html)) !== null) {
    try {
      const full = new URL(m[1], baseUrl).toString();
      if (!seen.has(full)) { seen.add(full); found.push(full); }
    } catch { /* URL invalide */ }
  }
  return found;
}

async function isValidPdf(url: string, timeout = 8000): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.get(
        url,
        { timeout, headers: { 'User-Agent': 'AssurClair-Bot/1.0', Range: 'bytes=0-4' } },
        (res) => {
          req.destroy();
          const ct = (res.headers['content-type'] ?? '').toLowerCase();
          const code = res.statusCode ?? 0;
          resolve(
            (code === 200 || code === 206) &&
            (ct.includes('pdf') || ct.includes('octet-stream') || url.toLowerCase().endsWith('.pdf'))
          );
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch { resolve(false); }
  });
}

// ─── Stratégie 1 : Gemini + Google Search grounding ──────────────────────────

async function tryGeminiGrounding(params: {
  insurer_full_name: string;
  website_url: string | null;
  insurance_type_label: string;
  doc_type_label: string;
}): Promise<SmartSearchResult | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const siteHint = params.website_url ? `\n- Site officiel : ${params.website_url}` : '';
  const prompt   = `Recherche sur internet l'URL exacte du PDF officiel en français "${params.doc_type_label}" pour :
- Assureur : ${params.insurer_full_name}${siteHint}
- Type d'assurance : ${params.insurance_type_label}

Règles :
- Recherche EN PRIORITÉ sur le site officiel de l'assureur
- L'URL doit pointer vers un fichier PDF téléchargeable (.pdf)
- Document actuellement en vigueur (date récente si possible)
- Si tu trouves l'URL, fournis-la exactement telle qu'elle apparaît

Réponds UNIQUEMENT en JSON valide, rien d'autre :
{"pdf_url": "https://... ou null", "page_url": "https://... ou null", "confidence": 0.85, "notes": "explication courte"}`;

  try {
    const model = ai.getGenerativeModel(
      { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] as any },
      'catalogue_grounding_search'
    );

    const result = await model.generateContent([prompt]);
    const text   = result.response.text().trim();

    // Extraire le JSON (peut être entouré de texte ou de backticks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.pdf_url && !parsed.page_url) return null;

    return {
      pdf_url:    parsed.pdf_url    || null,
      page_url:   parsed.page_url   || null,
      confidence: parsed.confidence || 0.70,
      strategy:   'gemini_grounding',
      notes:      parsed.notes      || 'URL trouvée par Gemini + Google Search',
    };
  } catch (e: any) {
    console.warn('[SmartSearch] Grounding failed:', (e.message || '').slice(0, 100));
    return null;
  }
}

// ─── Stratégie 2 : Gemini knowledge (URL patterns connus) ────────────────────

async function tryGeminiKnowledge(params: {
  insurer_full_name: string;
  website_url: string | null;
  insurance_type_label: string;
  doc_type_label: string;
}): Promise<SmartSearchResult | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const siteHint = params.website_url ? ` (${params.website_url})` : '';
  const prompt   = `Tu connais la structure des sites des assureurs français.
Pour ${params.insurer_full_name}${siteHint}, propose jusqu'à 4 URLs vraisemblables pour le PDF "${params.doc_type_label}" en assurance ${params.insurance_type_label}.
Ne génère QUE des URLs basées sur des patterns réels que tu connais. Ne génère pas d'URLs inventées.
JSON : {"candidates": [{"url": "https://...", "confidence": 0.7}, ...]}`;

  try {
    const model  = ai.getGenerativeModel(
      { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
      'catalogue_knowledge_search'
    );
    const result = await model.generateContent([prompt]);
    const parsed = JSON.parse(result.response.text());
    const candidates: { url: string; confidence: number }[] = parsed.candidates ?? [];

    for (const c of candidates.slice(0, 4)) {
      if (!c.url || c.confidence < 0.5) continue;
      if (await isValidPdf(c.url)) {
        return {
          pdf_url:    c.url,
          page_url:   null,
          confidence: Math.min(c.confidence * 0.85, 0.80),   // légère décote sans grounding
          strategy:   'gemini_knowledge',
          notes:      'URL issue de la connaissance Gemini, validée HTTP',
        };
      }
    }
    return null;
  } catch { return null; }
}

// ─── Stratégie 3 : HTTP crawl des pages de téléchargement ────────────────────

async function tryHttpCrawl(websiteUrl: string, insuranceTypeLabel: string): Promise<SmartSearchResult | null> {
  try {
    const base   = new URL(websiteUrl);
    const origin = `${base.protocol}//${base.host}`;

    // Chemins courants sur les sites d'assureurs français
    const paths = [
      '/aide/documents-contractuels.html',
      '/aide/documents-contractuels',
      '/aide/telechargements',
      '/telechargements',
      '/documents-contractuels',
      '/conditions-generales',
      '/nos-contrats/conditions-generales',
      '/espace-client/telechargements',
    ];

    const typeKw = insuranceTypeLabel.toLowerCase();
    const cgKeywords = [
      'conditions-generales', 'conditions_generales', '/cg-', '_cg_', '/cg/', '-cg.', 'ipid',
      typeKw.split(' ')[0],   // premier mot du type (ex: "habitation", "auto")
    ];

    for (const path of paths) {
      try {
        const pageUrl = `${origin}${path}`;
        const html    = await fetchHtml(pageUrl, 8000);
        const pdfs    = extractPdfLinks(html, pageUrl);
        if (pdfs.length === 0) continue;

        const best =
          pdfs.find(p => cgKeywords.some(k => k.length > 2 && p.toLowerCase().includes(k))) ??
          pdfs[0];

        return {
          pdf_url:    best,
          page_url:   pageUrl,
          confidence: 0.55,
          strategy:   'http_crawl',
          notes:      `PDF trouvé par crawl sur ${path}`,
        };
      } catch { /* page absente */ }
    }
    return null;
  } catch { return null; }
}

// ─── Fonction publique ────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  CG:               'Conditions Générales',
  IPID:             "Document d'Information Standardisé (IPID)",
  notice:           "Notice d'Information",
  tableau_garanties:'Tableau de Garanties',
};

export async function smartSearchForDocument(params: {
  insurer_code:          string;
  insurance_type_code:   string;
  insurer_full_name:     string;
  website_url:           string | null;
  insurance_type_label:  string;
  doc_type:              string;
}): Promise<SmartSearchResult> {
  const doc_type_label = DOC_TYPE_LABELS[params.doc_type] ?? params.doc_type;
  const p2 = { ...params, doc_type_label };

  console.log(`[SmartSearch] ${params.insurer_code}/${params.insurance_type_code}/${params.doc_type} — grounding first`);

  // 1. Gemini + Google Search
  const grounding = await tryGeminiGrounding(p2);
  if (grounding && (grounding.pdf_url || grounding.page_url)) return grounding;

  // 2. Gemini knowledge + validation HTTP
  const knowledge = await tryGeminiKnowledge(p2);
  if (knowledge) return knowledge;

  // 3. HTTP crawl du site officiel
  if (params.website_url) {
    const crawl = await tryHttpCrawl(params.website_url, params.insurance_type_label);
    if (crawl) return crawl;
  }

  return {
    pdf_url: null, page_url: null, confidence: 0,
    strategy: 'not_found',
    notes:    "Aucune URL trouvée automatiquement. Ajoutez-la manuellement dans le catalogue.",
  };
}
