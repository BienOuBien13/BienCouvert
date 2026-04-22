/**
 * SmartSearchService.ts — Recherche intelligente d'URLs de PDF d'assurance
 *
 * Stratégies en cascade (la première réussie l'emporte) :
 *   1. Google Custom Search API          (recherche Google directe via REST)
 *   2. Gemini + Google Search grounding  (IA + recherche web temps réel)
 *   3. Exploration intelligente du site   (sitemap, 30+ chemins, suivi de liens)
 *   4. Gemini knowledge                  (patterns URL connus, validés HTTP)
 *
 * Chaque PDF candidat est **scoré par pertinence** (type doc, type assurance,
 * nom assureur, année) au lieu d'être sélectionné au hasard.
 *
 * Résultat : l'URL du PDF (ou de la page contenant le PDF) avec un score
 * de confiance. Le téléchargement réel est délégué à l'ingestion.
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
  strategy:   'google_cse' | 'web_search' | 'gemini_grounding' | 'site_crawl' | 'gemini_knowledge' | 'not_found';
  notes:      string;
}

interface SearchParams {
  insurer_code:         string;
  insurance_type_code:  string;
  insurer_full_name:    string;
  website_url:          string | null;
  insurance_type_label: string;
  doc_type:             string;
  doc_type_label:       string;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_API_KEY ?? '';
const GOOGLE_CSE_CX  = process.env.GOOGLE_CSE_CX ?? '';
const USER_AGENT     = 'Mozilla/5.0 (compatible; AssurClair-Bot/2.0; +https://assurclair.fr/bot)';
const MAX_REDIRECTS  = 5;

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

async function fetchRaw(url: string, timeout = 12_000, redirectsLeft = MAX_REDIRECTS): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
    try {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.get(
        url,
        {
          timeout,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
          },
        },
        (res) => {
          const code = res.statusCode ?? 0;
          if ([301, 302, 307, 308].includes(code) && res.headers.location) {
            req.destroy();
            const next = new URL(res.headers.location, url).toString();
            return resolve(fetchRaw(next, timeout, redirectsLeft - 1));
          }
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (code < 200 || code >= 400) return reject(new Error(`HTTP ${code}: ${data.slice(0, 300)}`));
            resolve(data);
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    } catch (e) { reject(e); }
  });
}

function extractPdfLinks(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const seen  = new Set<string>();
  // href, src, data attributes pointing to .pdf
  const rgx = /(?:href|src|data)=["']([^"']*\.pdf[^"']{0,120})["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rgx.exec(html)) !== null) {
    try {
      const full = new URL(m[1], baseUrl).toString();
      if (!seen.has(full)) { seen.add(full); found.push(full); }
    } catch { /* URL invalide */ }
  }
  return found;
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const found: string[] = [];
  const seen  = new Set<string>();
  const rgx   = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rgx.exec(html)) !== null) {
    try {
      const full = new URL(m[1], baseUrl);
      if (full.origin !== base.origin) continue;
      if (/\.(pdf|jpg|png|gif|svg|css|js|ico|woff2?)$/i.test(full.pathname)) continue;
      const norm = `${full.origin}${full.pathname}`;
      if (!seen.has(norm)) { seen.add(norm); found.push(norm); }
    } catch { /* */ }
  }
  return found;
}

async function isValidPdf(url: string, timeout = 10_000, redirectsLeft = MAX_REDIRECTS): Promise<boolean> {
  return new Promise(resolve => {
    if (redirectsLeft <= 0) return resolve(false);
    try {
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.get(url, { timeout, headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-4' } }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode ?? 0) && res.headers.location) {
          req.destroy();
          return resolve(isValidPdf(new URL(res.headers.location, url).toString(), timeout, redirectsLeft - 1));
        }
        req.destroy();
        const ct   = (res.headers['content-type'] ?? '').toLowerCase();
        const code = res.statusCode ?? 0;
        resolve(
          (code >= 200 && code < 400) &&
          (ct.includes('pdf') || ct.includes('octet-stream') || url.toLowerCase().endsWith('.pdf')),
        );
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    } catch { resolve(false); }
  });
}

// ─── PDF Candidate Scoring ────────────────────────────────────────────────────

const DOC_KW: Record<string, string[]> = {
  CG:                ['conditions-generales', 'conditions_generales', 'cg-', '-cg-', '_cg_', '/cg/', '-cg.', 'cg_', 'conditions-gen'],
  IPID:              ['ipid', 'document-information', 'fiche-information', 'dip-', '-dip-'],
  notice:            ['notice-information', 'notice_information', 'notice-info', 'ni-'],
  tableau_garanties: ['tableau-garanties', 'tableau_garanties', 'garanties-', '-garanties'],
};

// Mots-clés positifs par type d'assurance (URL)
const TYPE_KW: Record<string, string[]> = {
  auto:       ['auto', 'automobile', 'vehicule', 'voiture', 'moto'],
  hab:        ['habitation', 'habitat', 'maison', 'mrh', 'multirisque', 'logement'],
  sante:      ['sante', 'mutuelle', 'complementaire', 'medicale', 'hospitalisation'],
  vie:        ['vie', 'deces', 'epargne', 'prevoyance'],
  animaux:    ['animaux', 'animal', 'chien', 'chat', 'nac'],
  scolaire:   ['scolaire', 'extrascolaire'],
  protection: ['protection-juridique', 'pj', 'juridique'],
  mobile:     ['mobile', 'telephone', 'smartphone', 'electronique', 'appareil', 'high-tech'],
  voyage:     ['voyage', 'rapatriement', 'annulation'],
  emprunteur: ['emprunteur', 'credit', 'pret', 'immobilier'],
  carte:      ['carte', 'bancaire', 'visa', 'mastercard'],
};

// ─── Mapping type d'assurance → catégorie de mots-clés ────────────────────────

/** Retourne la catégorie TYPE_KW qui correspond au `insurance_type_label` ou `insurance_type_code` */
function getTypeCategory(label: string, code: string): string | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const l = norm(label);
  const c = norm(code);
  for (const [cat, kws] of Object.entries(TYPE_KW)) {
    if (kws.some(k => l.includes(k) || c.includes(k))) return cat;
  }
  return null;
}

/** Score a PDF URL by keyword relevance — higher = more likely the right doc. */
function scorePdf(url: string, p: SearchParams): number {
  const u = decodeURIComponent(url).toLowerCase();
  let s = 0;

  // Document-type keywords (+30)
  const docKws = DOC_KW[p.doc_type] ?? [p.doc_type.toLowerCase()];
  if (docKws.some(k => u.includes(k))) s += 30;

  // Insurance-type keywords (+25)
  const typeL    = p.insurance_type_label.toLowerCase();
  const typeCode = p.insurance_type_code.toLowerCase();
  const typeCategory = getTypeCategory(typeL, typeCode);

  let typeKws: string[] = typeCategory ? (TYPE_KW[typeCategory] ?? []) : [];
  if (typeKws.length === 0) typeKws = [typeL.split(' ')[0]];
  if (typeKws.some(k => k.length > 2 && u.includes(k))) s += 25;

  // ── Pénalité forte : mots-clés d'un AUTRE type d'assurance dans l'URL ──────
  // Ex : CG auto dans une URL "/habitation/conditions..." → pénalité -40
  for (const [cat, kws] of Object.entries(TYPE_KW)) {
    if (cat === typeCategory) continue;   // même catégorie → pas de pénalité
    if (kws.some(k => k.length > 3 && u.includes(k))) {
      s -= 40;
      break;   // une seule pénalité suffit (l'URL est déjà disqualifiée)
    }
  }

  // Insurer name or code in URL (+15)
  if (u.includes(p.insurer_code.toLowerCase())) s += 15;

  // URL on insurer's official domain (+20) or penalty on wrong domain (-30)
  if (p.website_url) {
    try {
      const insurerDomain = new URL(p.website_url).hostname.toLowerCase().replace(/^www\./, '');
      const pdfDomain     = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (pdfDomain === insurerDomain || pdfDomain.endsWith('.' + insurerDomain)) {
        s += 20;  // same official domain
      } else if (!u.includes(p.insurer_code.toLowerCase()) && !u.includes(insurerDomain.split('.')[0])) {
        s -= 30;  // not on insurer domain and insurer not mentioned in URL
      }
    } catch { /* URL parse error — ignore */ }
  }

  // Pénalité forte : URL contient des mots-clés d'un autre type de document
  // (ex : cherche CG mais URL contient "document-information", "ipid", "notice", "dip")
  if (p.doc_type === 'CG') {
    const NON_CG_KW = [
      'document-information', 'document_information', 'fiche-information',
      'ipid', 'dip-', '-dip-', '_dip_', '/dip/',
      'notice-information', 'notice_information', 'notice-info',
      'notice-ipid', 'fiche-conseil',
    ];
    if (NON_CG_KW.some(k => u.includes(k))) s -= 35;
  }

  // Recent year in URL (+10)
  if (/20(2[4-9]|3[0-9])/.test(u)) s += 10;

  // Direct .pdf (+5)
  if (u.endsWith('.pdf')) s += 5;

  // Penalty for overly long URLs (probably deep / unrelated)
  if (url.length > 200) s -= 5;

  return s;
}

/** Pick the best-scored PDF from a list, validate it, return url+score or null. */
async function pickBestPdf(urls: string[], p: SearchParams, minScore = 10): Promise<{ url: string; score: number } | null> {
  const scored = urls.map(u => ({ url: u, score: scorePdf(u, p) })).sort((a, b) => b.score - a.score);
  for (const c of scored.slice(0, 8)) {
    if (c.score < minScore) break;
    if (await isValidPdf(c.url)) return c;
  }
  return null;
}

// ─── Stratégie 1 : Google Custom Search API ──────────────────────────────────

async function tryGoogleCSE(p: SearchParams): Promise<SmartSearchResult | null> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return null;

  let siteHost: string | null = null;
  try { if (p.website_url) siteHost = new URL(p.website_url).hostname; } catch { /* */ }

  const queries = [
    `${p.insurer_full_name} "${p.doc_type_label}" ${p.insurance_type_label} filetype:pdf${siteHost ? ` site:${siteHost}` : ''}`,
    `${p.insurer_full_name} ${p.doc_type_label} ${p.insurance_type_label} PDF`,
  ];

  for (const q of queries) {
    try {
      const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_CSE_KEY)}&cx=${encodeURIComponent(GOOGLE_CSE_CX)}&q=${encodeURIComponent(q)}&num=10`;
      const raw  = await fetchRaw(apiUrl, 15_000);
      const json = JSON.parse(raw);
      const items: any[] = json.items ?? [];
      if (items.length === 0) continue;

      // Direct PDF results
      const pdfItems = items.filter((it: any) =>
        it.link?.toLowerCase().endsWith('.pdf') ||
        it.mime === 'application/pdf' ||
        (it.fileFormat ?? '').includes('PDF'),
      );
      if (pdfItems.length > 0) {
        const best = await pickBestPdf(pdfItems.map((it: any) => it.link), p);
        if (best) {
          return {
            pdf_url: best.url, page_url: null, confidence: 0.92, strategy: 'google_cse',
            notes: `Google CSE direct hit (score ${best.score})`,
          };
        }
      }

      // Non-PDF results → crawl them for PDFs
      for (const it of items.filter((it: any) => !it.link?.toLowerCase().endsWith('.pdf')).slice(0, 4)) {
        try {
          const html = await fetchRaw(it.link, 8_000);
          const pdfs = extractPdfLinks(html, it.link);
          const best = await pickBestPdf(pdfs, p, 15);
          if (best) {
            return {
              pdf_url: best.url, page_url: it.link, confidence: 0.88, strategy: 'google_cse',
              notes: `PDF extrait de page Google CSE (score ${best.score})`,
            };
          }
        } catch { /* page inaccessible */ }
      }
    } catch (e: any) {
      const msg = (e.message || '').slice(0, 300);
      if (msg.includes('403')) {
        console.error(`[SmartSearch] ⚠️  CSE 403 — Enable "Custom Search API" at https://console.cloud.google.com/apis/library/customsearch.googleapis.com | Details: ${msg}`);
      } else {
        console.warn(`[SmartSearch] CSE query failed: ${msg}`);
      }
    }
  }
  return null;
}

// ─── Stratégie 1b : Web search multi-moteur (sans API key) ───────────────────

/** Extract all URLs from raw HTML using multiple heuristics */
function extractAllUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  // Generic href extraction
  const rx = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html)) !== null) {
    let href = m[1];
    // DuckDuckGo redirect unwrap
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    // Bing redirect unwrap
    const bingR = href.match(/[?&]r=([^&]+)/);
    if (bingR && href.includes('bing.com/ck')) { try { href = decodeURIComponent(bingR[1]); } catch {} }
    if (href.startsWith('http') && !seen.has(href)) { seen.add(href); urls.push(href); }
  }
  return urls;
}

async function searchGoogle(query: string): Promise<string[]> {
  try {
    // Google search with french locale — browser-like request
    const url = `https://www.google.fr/search?q=${encodeURIComponent(query)}&hl=fr&num=15`;
    const html = await fetchRaw(url, 12_000);

    const urls: string[] = [];
    const seen = new Set<string>();
    // Google wraps results in <a href="/url?q=ENCODED_URL&..."> or direct links
    const rx = /\/url\?q=(https?[^&"]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) {
      try {
        let href = decodeURIComponent(m[1]);
        // Remove tracking fragments
        href = href.split('#')[0];
        if (!seen.has(href) && !href.includes('google.') && !href.includes('youtube.') && !href.includes('webcache.')) {
          seen.add(href);
          urls.push(href);
        }
      } catch { /* */ }
    }
    // Also extract any direct PDF links
    const pdfRx = /href="(https?[^"]+\.pdf[^"]*)"/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pdfRx.exec(html)) !== null) {
      try {
        const href = decodeURIComponent(pm[1]);
        if (!seen.has(href)) { seen.add(href); urls.push(href); }
      } catch { /* */ }
    }
    console.log(`[SmartSearch]    Google scrape: ${urls.length} URLs found`);
    return urls;
  } catch (e: any) {
    console.log(`[SmartSearch]    Google scrape failed: ${(e.message || '').slice(0, 100)}`);
    return [];
  }
}

async function searchDDG(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await fetchRaw(url, 12_000);
    const urls = extractAllUrls(html).filter(u => !u.includes('duckduckgo.com'));
    console.log(`[SmartSearch]    DDG: ${urls.length} URLs found`);
    return urls;
  } catch (e: any) {
    console.log(`[SmartSearch]    DDG failed: ${(e.message || '').slice(0, 100)}`);
    return [];
  }
}

async function searchBing(query: string): Promise<string[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&count=15`;
    const html = await fetchRaw(url, 12_000);

    const urls: string[] = [];
    const seen = new Set<string>();
    // Bing result links are in <a href="https://..."> or redirect via /ck/a
    const rx = /href="(https?:\/\/(?!www\.bing\.com)[^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) !== null) {
      let href = m[1];
      // Bing redirect unwrap
      const bingR = href.match(/[?&]r=(https?[^&]+)/);
      if (bingR) { try { href = decodeURIComponent(bingR[1]); } catch {} }
      if (!seen.has(href) && !href.includes('bing.com') && !href.includes('microsoft.com')) {
        seen.add(href);
        urls.push(href);
      }
    }
    console.log(`[SmartSearch]    Bing: ${urls.length} URLs found`);
    return urls;
  } catch (e: any) {
    console.log(`[SmartSearch]    Bing failed: ${(e.message || '').slice(0, 100)}`);
    return [];
  }
}

async function tryWebSearch(p: SearchParams): Promise<SmartSearchResult | null> {
  let siteHost: string | null = null;
  try { if (p.website_url) siteHost = new URL(p.website_url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* */ }

  // Build search queries — domain-constrained first when possible
  const queries: string[] = siteHost
    ? [
        // Priorité 1 : contraint au domaine officiel
        `${p.insurer_full_name} ${p.doc_type_label} ${p.insurance_type_label} PDF site:${siteHost}`,
        `${p.insurer_full_name} conditions générales ${p.insurance_type_label} PDF site:${siteHost}`,
      ]
    : [
        `${p.insurer_full_name} "${p.doc_type_label}" ${p.insurance_type_label} PDF`,
        `${p.insurer_full_name} conditions générales ${p.insurance_type_label} PDF`,
      ];

  for (const q of queries) {
    console.log(`[SmartSearch]    query: "${q}"`);

    // Try all search engines in parallel
    const [googleUrls, ddgUrls, bingUrls] = await Promise.all([
      searchGoogle(q),
      searchDDG(q),
      searchBing(q),
    ]);

    // Merge and deduplicate, keeping order (Google first as most reliable)
    const seen = new Set<string>();
    const allUrls: string[] = [];
    for (const u of [...googleUrls, ...ddgUrls, ...bingUrls]) {
      if (!seen.has(u)) { seen.add(u); allUrls.push(u); }
    }

    console.log(`[SmartSearch]    Total unique URLs: ${allUrls.length}`);
    if (allUrls.length === 0) continue;

    // ─────────────────────────────────────────────────────────────────────────────
    // Filtre domaine : si on connaît le site officiel, rejeter les URLs d'autres domaines
    // sauf si le score URL seul est très bon (fallback pour redirecteurs, CDNs assureurs)
    const filteredUrls = siteHost
      ? allUrls.filter(u => {
          try {
            const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
            return host === siteHost || host.endsWith('.' + siteHost);
          } catch { return false; }
        })
      : allUrls;

    // Utiliser les URLs filtrées si disponibles, sinon toutes (domain inconnu)
    const candidateUrls = filteredUrls.length > 0 ? filteredUrls : allUrls;
    console.log(`[SmartSearch]    Candidates after domain filter: ${candidateUrls.length}/${allUrls.length}`);

    // Direct PDF hits from search results
    const directPdfs = candidateUrls.filter(u => u.toLowerCase().includes('.pdf'));
    console.log(`[SmartSearch]    Direct PDFs: ${directPdfs.length}`);
    if (directPdfs.length > 0) {
      const best = await pickBestPdf(directPdfs, p);
      if (best) {
        return { pdf_url: best.url, page_url: null, confidence: 0.90, strategy: 'web_search',
          notes: `PDF trouvé via recherche web (score ${best.score})` };
      }
    }

    // Follow top result pages → extract PDFs
    const pagesToCrawl = candidateUrls.filter(u => !u.toLowerCase().includes('.pdf')).slice(0, 8);
    console.log(`[SmartSearch]    Following ${pagesToCrawl.length} pages for PDFs…`);
    for (const pageUrl of pagesToCrawl) {
      try {
        const pageHtml = await fetchRaw(pageUrl, 8_000);
        const pdfs = extractPdfLinks(pageHtml, pageUrl);
        const best = await pickBestPdf(pdfs, p, 15);
        if (best) {
          return { pdf_url: best.url, page_url: pageUrl, confidence: 0.85, strategy: 'web_search',
            notes: `PDF extrait de ${pageUrl.slice(0, 60)} (score ${best.score})` };
        }
      } catch { /* page inaccessible */ }
    }
  }

  console.log('[SmartSearch]    Web search: no PDF found across all engines');
  return null;
}

// ─── Stratégie 2 : Gemini + Google Search grounding ─────────────────────────

async function tryGeminiGrounding(p: SearchParams): Promise<SmartSearchResult | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const site = p.website_url ?? '';

  // Prompts designed to force Gemini to actually search and return URLs.
  // Key constraint: ONLY URLs from the target insurer's official website.
  const siteConstraint = site ? `UNIQUEMENT sur le site ${site}` : `UNIQUEMENT du site officiel de ${p.insurer_full_name}`;
  const prompts = [
    // Prompt A: short, direct, triggers Google Search grounding immediately
    `Search: "${p.insurer_full_name} ${p.doc_type_label} ${p.insurance_type_label} filetype:pdf site:${site || p.insurer_full_name.toLowerCase().replace(/\s+/g, '')+'.fr'}"

IMPORTANT: Liste ${siteConstraint}. N'inclus JAMAIS d'URLs d'autres assureurs. Une URL par ligne.`,
    // Prompt B: French phrasing with explicit site + type constraint
    `Trouve le PDF "${p.doc_type_label}" pour l'assurance "${p.insurance_type_label}" de ${p.insurer_full_name}${site ? ` (${site})` : ''}.
CONTRAINTE STRICTE: retourne ${siteConstraint}. Le document doit concerner uniquement "${p.insurance_type_label}", pas un autre type d'assurance.
Liste toutes les URLs (PDF et pages de téléchargement), une par ligne.`,
    // Prompt C: broader fallback — still insurer-constrained
    `${p.insurer_full_name} "${p.insurance_type_label}" "conditions générales" PDF télécharger. Retourne ${siteConstraint}. Liste les URLs trouvées.`,
  ];

  for (const [pi, prompt] of prompts.entries()) {
    try {
      console.log(`[SmartSearch]    Grounding prompt ${pi + 1}/${prompts.length}`);
      const model  = ai.getGenerativeModel(
        { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] as any },
        'catalogue_grounding_search',
      );
      const result = await model.generateContent([prompt]);
      const resp   = result.response;
      const text   = resp.text().trim();
      console.log(`[SmartSearch]    Grounding text (${text.length} chars): ${text.slice(0, 200)}`);

      // ── A. Extract URLs from grounding metadata (most reliable) ─────────
      const groundingUrls: string[] = [];
      try {
        const cand = resp.candidates?.[0];
        const gm   = cand?.groundingMetadata as any;
        // Log the full metadata keys to diagnose empty responses
        if (gm) console.log(`[SmartSearch]    Grounding metadata keys: ${Object.keys(gm).join(', ')}`);
        else     console.log('[SmartSearch]    Grounding metadata: NONE');
        if (gm?.groundingChunks) {
          for (const ch of gm.groundingChunks) {
            if (ch?.web?.uri) groundingUrls.push(ch.web.uri);
          }
        }
        if (gm?.groundingSupports) {
          for (const gs of gm.groundingSupports) {
            if (gs?.web?.uri) groundingUrls.push(gs.web.uri);
          }
        }
        if (gm?.supportingSearchResults) {
          for (const sr of gm.supportingSearchResults) {
            if (sr?.uri) groundingUrls.push(sr.uri);
          }
        }
        if (gm?.searchEntryPoint?.renderedContent) {
          // sometimes PDFs are embedded in the rendered HTML
          const rcPdfs = (gm.searchEntryPoint.renderedContent.match(/https?:\/\/[^\s"'<>]+\.pdf/gi) || []);
          groundingUrls.push(...rcPdfs);
        }
        console.log(`[SmartSearch]    Grounding URLs from metadata: ${groundingUrls.length} → ${groundingUrls.slice(0, 3).join(' | ')}`);
      } catch { /* metadata missing */ }

      // Check grounding URLs (PDF direct hits)
      const gPdfs = groundingUrls.filter(u => u.toLowerCase().includes('.pdf'));
      if (gPdfs.length > 0) {
        const best = await pickBestPdf(gPdfs, p);
        if (best) {
          return { pdf_url: best.url, page_url: null, confidence: 0.88, strategy: 'gemini_grounding',
            notes: `PDF dans sources Google grounding (score ${best.score})` };
        }
      }

      // Follow grounding page URLs → extract PDFs
      // Slice extended to 6 to cover all grounding URLs returned by Gemini
      for (const gu of groundingUrls.filter(u => !u.toLowerCase().includes('.pdf')).slice(0, 6)) {
        try {
          // A. Check if this URL directly resolves to a PDF (handles redirect→direct-PDF case,
          //    e.g. vertexaisearch.cloud.google.com/grounding-api-redirect/... → PDF)
          if (await isValidPdf(gu, 10_000)) {
            console.log(`[SmartSearch]    Grounding redirect → PDF direct: ${gu.slice(0, 80)}`);
            return { pdf_url: gu, page_url: null, confidence: 0.86, strategy: 'gemini_grounding',
              notes: `PDF direct via URL grounding résolue` };
          }
          // B. Crawl the final page for PDF links
          const html = await fetchRaw(gu, 8_000);
          const pdfs = extractPdfLinks(html, gu);
          const best = await pickBestPdf(pdfs, p, 15);
          if (best) {
            return { pdf_url: best.url, page_url: gu, confidence: 0.83, strategy: 'gemini_grounding',
              notes: `PDF extrait de page grounding ${gu.slice(0, 60)} (score ${best.score})` };
          }
        } catch { /* page inaccessible */ }
      }

      // ── B. Parse JSON from response text ────────────────────────────────
      const jsonM = text.match(/\{[\s\S]*?\}/);
      if (jsonM) {
        try {
          const parsed = JSON.parse(jsonM[0]);
          if (parsed.pdf_url && await isValidPdf(parsed.pdf_url)) {
            return { pdf_url: parsed.pdf_url, page_url: parsed.page_url || null, confidence: 0.80,
              strategy: 'gemini_grounding', notes: parsed.notes || 'URL Gemini + Google Search' };
          }
          if (parsed.page_url) {
            try {
              const html = await fetchRaw(parsed.page_url, 8_000);
              const pdfs = extractPdfLinks(html, parsed.page_url);
              const best = await pickBestPdf(pdfs, p, 10);
              if (best) {
                return { pdf_url: best.url, page_url: parsed.page_url, confidence: 0.78,
                  strategy: 'gemini_grounding', notes: `PDF extrait de page Gemini (score ${best.score})` };
              }
            } catch { /* */ }
          }
        } catch { /* JSON invalide */ }
      }

      // ── C. Extract raw URLs from text ───────────────────────────────────
      // Normalise les retours à la ligne dans les URLs (Gemini les coupe parfois)
      const normalizedText = text.replace(/\n(\s{0,4})(https?:)/g, ' $2').replace(/\*\s+/g, '');
      const urlRegex = /https?:\/\/[^\s"'<>\])}]+/gi;
      const textUrls: string[] = [...new Set<string>((normalizedText.match(urlRegex) || []))];
      const textPdfs = textUrls.filter(u => u.toLowerCase().endsWith('.pdf'));
      for (const pdfUrl of textPdfs.slice(0, 5)) {
        if (await isValidPdf(pdfUrl)) {
          return { pdf_url: pdfUrl, page_url: null, confidence: 0.75, strategy: 'gemini_grounding',
            notes: 'PDF URL extraite du texte Gemini' };
        }
      }
      for (const pageUrl of textUrls.filter(u => !u.toLowerCase().endsWith('.pdf')).slice(0, 3)) {
        try {
          const html = await fetchRaw(pageUrl, 8_000);
          const pdfs = extractPdfLinks(html, pageUrl);
          const best = await pickBestPdf(pdfs, p, 10);
          if (best) {
            return { pdf_url: best.url, page_url: pageUrl, confidence: 0.72, strategy: 'gemini_grounding',
              notes: `PDF trouvé via lien Gemini (score ${best.score})` };
          }
        } catch { /* */ }
      }
    } catch (e: any) {
      console.warn('[SmartSearch] Grounding attempt failed:', (e.message || '').slice(0, 150));
    }
  }
  return null;
}

// ─── Stratégie 3 : Exploration intelligente du site ──────────────────────────

async function trySiteCrawl(p: SearchParams): Promise<SmartSearchResult | null> {
  if (!p.website_url) return null;
  let origin: string;
  try { const u = new URL(p.website_url); origin = `${u.protocol}//${u.host}`; } catch { return null; }

  // A. Sitemap scan
  for (const smPath of ['/sitemap.xml', '/sitemap_index.xml', '/sitemaps/sitemap.xml']) {
    try {
      const xml = await fetchRaw(`${origin}${smPath}`, 10_000);
      const locs: string[] = [];
      let m: RegExpExecArray | null;
      const rx = /<loc>([^<]+)<\/loc>/gi;
      while ((m = rx.exec(xml)) !== null) locs.push(m[1]);

      // Direct PDF in sitemap
      const pdfLocs = locs.filter(l => l.toLowerCase().endsWith('.pdf'));
      if (pdfLocs.length > 0) {
        const best = await pickBestPdf(pdfLocs, p, 20);
        if (best) {
          return { pdf_url: best.url, page_url: `${origin}${smPath}`, confidence: 0.70, strategy: 'site_crawl',
            notes: `PDF sitemap.xml (score ${best.score})` };
        }
      }

      // Sub-sitemaps
      const subSm = locs.filter(l => /sitemap.*\.xml$/i.test(l));
      for (const sub of subSm.slice(0, 3)) {
        try {
          const subXml  = await fetchRaw(sub, 8_000);
          const subLocs: string[] = [];
          const rx2 = /<loc>([^<]+)<\/loc>/gi;
          let m2: RegExpExecArray | null;
          while ((m2 = rx2.exec(subXml)) !== null) subLocs.push(m2[1]);
          const subPdfs = subLocs.filter(l => l.toLowerCase().endsWith('.pdf'));
          const best    = await pickBestPdf(subPdfs, p, 20);
          if (best) {
            return { pdf_url: best.url, page_url: sub, confidence: 0.68, strategy: 'site_crawl',
              notes: `PDF sous-sitemap (score ${best.score})` };
          }
        } catch { /* */ }
      }

      // Document-related pages in sitemap → crawl for PDF links
      const docKw = ['conditions-generales', 'documents', 'telechargement', 'contractuel', 'mentions', 'legal'];
      const docPages = locs.filter(l => docKw.some(k => l.toLowerCase().includes(k)));
      for (const pg of docPages.slice(0, 5)) {
        try {
          const html = await fetchRaw(pg, 8_000);
          const pdfs = extractPdfLinks(html, pg);
          const best = await pickBestPdf(pdfs, p, 15);
          if (best) {
            return { pdf_url: best.url, page_url: pg, confidence: 0.65, strategy: 'site_crawl',
              notes: `PDF via page sitemap ${pg.slice(0, 60)} (score ${best.score})` };
          }
        } catch { /* */ }
      }
    } catch { /* sitemap absent */ }
  }

  // B. Common document pages (expanded list)
  const paths = [
    '/aide/documents-contractuels.html', '/aide/documents-contractuels',
    '/documents/conditions-generales', '/documents-contractuels',
    '/conditions-generales', '/nos-documents',
    '/telechargements', '/aide/telechargements', '/espace-telechargement',
    '/mentions-legales/conditions-generales', '/informations-legales',
    '/mentions-legales', '/nos-contrats/conditions-generales', '/nos-contrats',
    '/espace-client/documents', '/espace-client/telechargements',
    '/assurance-auto/conditions-generales', '/assurance-auto/documents',
    '/assurance-automobile/conditions-generales', '/auto/conditions-generales',
    '/auto/documents-contractuels',
    '/assurance-habitation/conditions-generales', '/assurance-habitation/documents',
    '/habitation/conditions-generales', '/habitation/documents-contractuels',
    '/assurance-sante/conditions-generales', '/sante/conditions-generales',
    '/mutuelle/conditions-generales',
    '/aide', '/aide/documents', '/faq', '/mediatheque',
  ];

  for (const path of paths) {
    try {
      const pageUrl = `${origin}${path}`;
      const html    = await fetchRaw(pageUrl, 8_000);
      const pdfs    = extractPdfLinks(html, pageUrl);
      const best    = await pickBestPdf(pdfs, p, 15);
      if (best) {
        return { pdf_url: best.url, page_url: pageUrl, confidence: 0.60, strategy: 'site_crawl',
          notes: `PDF crawl ${path} (score ${best.score})` };
      }
    } catch { /* page absente */ }
  }

  // C. Homepage → follow promising internal links → find PDFs
  try {
    const homeHtml = await fetchRaw(origin, 10_000);
    const homePdfs = extractPdfLinks(homeHtml, origin);
    const homeBest = await pickBestPdf(homePdfs, p, 25);
    if (homeBest) {
      return { pdf_url: homeBest.url, page_url: origin, confidence: 0.55, strategy: 'site_crawl',
        notes: `PDF sur homepage (score ${homeBest.score})` };
    }

    const docKwLink = ['document', 'telecharg', 'condition', 'contrat', 'legal', 'mention', 'aide', 'auto', 'habitation', 'sante'];
    const promising = extractInternalLinks(homeHtml, origin)
      .filter(l => docKwLink.some(k => l.toLowerCase().includes(k)))
      .slice(0, 10);

    for (const link of promising) {
      try {
        const html = await fetchRaw(link, 8_000);
        const pdfs = extractPdfLinks(html, link);
        const best = await pickBestPdf(pdfs, p, 20);
        if (best) {
          return { pdf_url: best.url, page_url: link, confidence: 0.55, strategy: 'site_crawl',
            notes: `PDF via lien homepage ${link.slice(0, 60)} (score ${best.score})` };
        }
      } catch { /* */ }
    }
  } catch { /* homepage inaccessible */ }

  return null;
}

// ─── Stratégie 4 : Gemini knowledge (fallback amélioré) ──────────────────────

async function tryGeminiKnowledge(p: SearchParams): Promise<SmartSearchResult | null> {
  const ai = getAiClient();
  if (!ai) return null;

  const siteHint = p.website_url ? ` (${p.website_url})` : '';
  const prompt   = `Tu connais la structure des sites web des assureurs français.
Pour ${p.insurer_full_name}${siteHint}, propose jusqu'à 6 URLs vraisemblables pour le PDF "${p.doc_type_label}" en assurance "${p.insurance_type_label}".

CONTRAINTES IMPÉRATIVES :
1. Toutes les URLs DOIVENT être sur le domaine officiel de ${p.insurer_full_name}${p.website_url ? ` (${p.website_url})` : ''}.
2. Le document doit concerner UNIQUEMENT le type d'assurance "${p.insurance_type_label}" — ne propose pas de CG pour un autre type.
3. Ne génère QUE des URLs basées sur des patterns réels connus. Confidence < 0.5 si tu n'es pas sûr.
JSON: {"candidates":[{"url":"https://...","confidence":0.7,"is_page":false},...]}`;

  try {
    const model  = ai.getGenerativeModel(
      { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
      'catalogue_knowledge_search',
    );
    const result = await model.generateContent([prompt]);
    const parsed = JSON.parse(result.response.text());
    const cands: { url: string; confidence: number; is_page?: boolean }[] = parsed.candidates ?? [];

    // Direct PDF URLs first
    for (const c of cands.filter(c => !c.is_page).slice(0, 5)) {
      if (!c.url || c.confidence < 0.4) continue;
      if (await isValidPdf(c.url)) {
        return { pdf_url: c.url, page_url: null, confidence: Math.min(c.confidence * 0.85, 0.65),
          strategy: 'gemini_knowledge', notes: 'URL Gemini knowledge, validée HTTP' };
      }
    }

    // Page URLs → extract PDFs
    for (const c of cands.filter(c => c.is_page).slice(0, 4)) {
      if (!c.url) continue;
      try {
        const html = await fetchRaw(c.url, 8_000);
        const pdfs = extractPdfLinks(html, c.url);
        const best = await pickBestPdf(pdfs, p, 10);
        if (best) {
          return { pdf_url: best.url, page_url: c.url, confidence: 0.60,
            strategy: 'gemini_knowledge', notes: `PDF extrait de page Gemini knowledge (score ${best.score})` };
        }
      } catch { /* page inaccessible */ }
    }
    return null;
  } catch { return null; }
}

// ─── Validation de pertinence (assureur + type) ───────────────────────────────

/**
 * Vérifie via Gemini que le PDF trouvé correspond bien à l'assureur ET au type
 * d'assurance attendu.  En cas d'indisponibilité de l'IA ou d'inaccessibilité
 * de l'URL, la validation est ignorée (fail-open) pour ne pas bloquer l'ingestion.
 */
async function validateCgRelevance(
  url: string,
  p: SearchParams,
): Promise<{ valid: boolean; reason: string }> {

  // ── Étape 1 : vérification rapide par domaine (sans Gemini) ─────────────────────────────
  if (p.website_url) {
    try {
      const insurerDomain = new URL(p.website_url).hostname.toLowerCase().replace(/^www\./, '');
      const urlDomain     = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (urlDomain !== insurerDomain && !urlDomain.endsWith('.' + insurerDomain)) {
        // L'URL n'est pas sur le domaine officiel de l'assureur — rejet immédiat, sans Gemini
        return { valid: false, reason: `Domaine ${urlDomain} ≠ domaine officiel ${insurerDomain}` };
      }
    } catch { /* URL parse error — ignore */ }
  }

  // ── Étape 2 : vérification rapide par mots-clés de type dans l'URL ────────────────────
  // Si l'URL contient clairement les mots-clés d'un AUTRE type d'assurance, on rejette sans Gemini
  {
    const typeL    = p.insurance_type_label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const typeCode = p.insurance_type_code.toLowerCase();
    const typeCategory = getTypeCategory(typeL, typeCode);
    const urlNorm = decodeURIComponent(url).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [cat, kws] of Object.entries(TYPE_KW)) {
      if (cat === typeCategory) continue;
      const wrongKwsInUrl = kws.filter(k => k.length > 4 && urlNorm.includes(k));
      if (wrongKwsInUrl.length >= 2) {
        // Deux mots-clés d'un autre type dans l'URL — rejet
        return { valid: false, reason: `URL contient des mots-clés du type "${cat}" (${wrongKwsInUrl.join(', ')}) alors qu'on cherche "${typeL}"` };
      }
    }
  }

  // ── Étape 3 : validation Gemini sur le contenu texte de la PAGE (pas du PDF binaire) ──────
  const ai = getAiClient();
  if (!ai) return { valid: true, reason: 'IA indisponible — validation ignorée (domaine OK)' };

  // Pour les PDFs directs, utiliser uniquement l'URL (le contenu est binaire = inutile pour Gemini)
  const isPdf = url.toLowerCase().includes('.pdf');

  let pageText = '';
  if (!isPdf) {
    // Pour les pages HTML, récupérer le contenu texte
    try {
      const html    = await fetchRaw(url, 6_000);
      // Extraire le texte visible (supprimer les balises HTML)
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 1500);
    } catch { /* page inaccessible — on se base uniquement sur l'URL */ }
  }

  // Construire le contexte à analyser : URL + contenu texte (si disponible)
  const context = isPdf
    ? `URL du PDF : "${url}"\n\n(Document PDF — analyse basée sur l'URL uniquement)`
    : `URL : "${url}"\n\nContenu de la page :\n${pageText || '(contenu non disponible)'}` ;

  const prompt = `Tu vérifie qu'un document trouvé correspond exactement à ce qu'on cherche.

Assureur attendu : "${p.insurer_full_name}" (code : "${p.insurer_code}")
Type d'assurance attendu : "${p.insurance_type_label}" (code : "${p.insurance_type_code}")

${context}

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "insurer_match": true,
  "type_match": true,
  "reason": "explication courte"
}

Règles STRICTES :
- insurer_match = true UNIQUEMENT si le nom "${p.insurer_full_name}" (ou une filiale/marque connue, ou le code "${p.insurer_code}") est CLAIREMENT présent dans l'URL ou le contenu
- insurer_match = false si l'URL ou le contenu mentionne un AUTRE assureur à la place
- insurer_match = false si NI l'URL NI le contenu ne confirment l'assureur attendu
- type_match = true si le document concerne le type d'assurance "${p.insurance_type_label}", OU si le type ne peut pas être déterminé avec certitude
- type_match = false UNIQUEMENT si le document concerne CLAIREMENT un type d'assurance DIFFÉRENT`;

  try {
    const model = ai.getGenerativeModel(
      { model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
    );
    const result = await model.generateContent([prompt]);
    const text   = result.response.text().trim();
    const parsed = JSON.parse(text);
    // insurer_match must be explicitly true — type_match fails only if explicitly false
    const valid  = parsed.insurer_match === true && parsed.type_match !== false;
    return { valid, reason: parsed.reason ?? '' };
  } catch (e) {
    // En cas d'erreur Gemini, on accepte si le domaine était déjà valide (étape 1)
    return { valid: true, reason: `Erreur validation Gemini (${(e as Error).message?.slice(0, 60)}) — accepté (domaine OK)` };
  }
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
  const p: SearchParams = { ...params, doc_type_label };

  const t0 = Date.now();
  console.log(`[SmartSearch] 🔍 ${p.insurer_code}/${p.insurance_type_code}/${p.doc_type}`);

  /** Valide un résultat et retourne null s'il est rejeté */
  async function validate(result: SmartSearchResult | null, label: string): Promise<SmartSearchResult | null> {
    if (!result) return null;
    // Valider le PDF en priorité, sinon la page si elle est présente
    const urlToCheck = result.pdf_url ?? result.page_url;
    if (!urlToCheck) return result;
    const check = await validateCgRelevance(urlToCheck, p);
    if (!check.valid) {
      console.warn(`[SmartSearch] ⛔ Résultat rejeté (${label}): ${check.reason} — ${urlToCheck.slice(0, 80)}`);
      return null;
    }
    if (check.reason) console.log(`[SmartSearch]    ✔ Validation OK (${label}): ${check.reason}`);
    return result;
  }

  // 1b. DuckDuckGo web search (no API key needed — mimics "Googling it")
  console.log('[SmartSearch]  → Strat 1b: DuckDuckGo web search');
  const webSearch = await validate(await tryWebSearch(p), 'web_search');
  if (webSearch?.pdf_url) { console.log(`[SmartSearch]  ✅ WebSearch ${Date.now() - t0}ms`); return webSearch; }

  // 2. Gemini + Google Search grounding
  console.log('[SmartSearch]  → Strat 2: Gemini + grounding');
  const grounding = await validate(await tryGeminiGrounding(p), 'grounding');
  if (grounding?.pdf_url || grounding?.page_url) { console.log(`[SmartSearch]  ✅ Grounding ${Date.now() - t0}ms`); return grounding; }

  // 3. Smart site crawl (sitemap + 30 paths + homepage links)
  if (p.website_url) {
    console.log('[SmartSearch]  → Strat 3: Site crawl');
    const crawl = await validate(await trySiteCrawl(p), 'site_crawl');
    if (crawl) { console.log(`[SmartSearch]  ✅ Crawl ${Date.now() - t0}ms`); return crawl; }
  }

  // 4. Gemini knowledge (URL pattern guessing)
  console.log('[SmartSearch]  → Strat 4: Gemini knowledge');
  const knowledge = await validate(await tryGeminiKnowledge(p), 'knowledge');
  if (knowledge) { console.log(`[SmartSearch]  ✅ Knowledge ${Date.now() - t0}ms`); return knowledge; }

  console.log(`[SmartSearch]  ❌ Not found ${Date.now() - t0}ms`);
  return {
    pdf_url: null, page_url: null, confidence: 0,
    strategy: 'not_found',
    notes: 'Aucune URL trouvée. Renseignez-la manuellement.',
  };
}
