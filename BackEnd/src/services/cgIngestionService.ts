/**
 * cgIngestionService.ts — Pipeline agentique d'ingestion automatique de CG
 *
 * Architecture : 4 agents orchestrés en séquence
 *
 *   HUNTER     — Découvre les URLs de PDFs sur le site de l'assureur
 *   FETCHER    — Télécharge le PDF, extrait le texte et calcule le SHA-256
 *   CLASSIFIER — Identifie assureur/type/formules via Gemini Vision
 *   VECTORIZER — Réutilise vectorizeCgByPages (service existant)
 *
 * Périmètre d'entrée :
 *   { insurers: string[], insurance_types: string[], max_docs_per_combo: number }
 */

import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Pool } from 'pg';
import pool from '../db';
import { getAiClient } from './geminiService';
import { vectorizeCgByPages } from './pageVectorizationService';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestionScope {
  scope?: 'targeted' | 'all_active';
  insurers?: string[];
  insurance_types?: string[];
  max_docs_per_combo?: number;
  confidence_threshold?: number;  // défaut : 0.7
}

export interface IngestionJob {
  id: number;
  run_id: string;
  insurer_code: string;
  insurance_type_code: string;
  source_url: string | null;
  status: 'pending' | 'fetching' | 'classifying' | 'vectorizing' | 'done' | 'skipped' | 'error';
  confidence: number | null;
  classifier_result: any;
  error_message: string | null;
  central_cg_id: number | null;
  pdf_sha256: string | null;
  pages_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClassifierResult {
  insurer_code: string;
  insurer_name: string;
  insurance_type_code: string;
  insurance_sub_type_code?: string | null;  // Sous-type spécifique (ex: 'raqvam2', 'pno')
  document_type: string;     // 'CG' | 'notice' | 'ipid' | 'autre'
  formula_hints: string[];
  confidence: number;        // 0-1
  language: string;
  is_cg: boolean;
  detail?: string;
}

interface HunterCandidate {
  url: string;
  probable_type: string;
  confidence: number;
}

// ─── Singleton état run en cours ─────────────────────────────────────────────

let currentRunId: string | null = null;
const stopRequested = { value: false };

export function requestStopIngestion() { stopRequested.value = true; }
export function getCurrentRunId()      { return currentRunId; }

// ─── Seed URLs connues par assureur ───────────────────────────────────────────
/**
 * Pages ou PDFs de référence pour les assureurs FR majeurs.
 * Utilisées en priorité quand aucune cg_page_urls n'est configurée.
 *
 * Format des clés :
 *   'CODE'        → pages génériques (tous types)
 *   'CODE:TYPE'   → URL spécifique à un type d'assurance (priorité max)
 *
 * ⚠️  Mettre à jour quand un assureur change l'emplacement de ses CG.
 * Sources vérifiées manuellement - confidence 0.95.
 */
const INSURER_SEED: Record<string, string[]> = {
  // ── MMA (Covéa) ───────────────────────────────────────────────────────────
  'MMA01:HAB01': [
    'https://www.mma.fr/files/live/sites/mmafr/files/documents-cg/cg410/Habitation_MMA_410q.pdf',
  ],
  'MMA01': [
    'https://www.mma.fr/vos-assurances/habitation.html',
    'https://www.mma.fr/vos-assurances/auto.html',
    'https://www.mma.fr/vos-assurances/sante.html',
  ],

  // ── MAAF (Covéa) ──────────────────────────────────────────────────────────
  'MAA01': [
    'https://www.maaf.fr/assurances/habitation/multirisques-habitation/conditions-generales.html',
    'https://www.maaf.fr/assurances/auto/conditions-generales.html',
    'https://www.maaf.fr/espace-client/telechargements.html',
  ],

  // ── Matmut ────────────────────────────────────────────────────────────────
  'MAT01': [
    'https://www.matmut.fr/assurance-habitation/conditions-generales/',
    'https://www.matmut.fr/assurance-auto/conditions-generales/',
    'https://www.matmut.fr/telechargements/',
  ],

  // ── Macif ─────────────────────────────────────────────────────────────────
  'MAC01': [
    'https://www.macif.fr/assurance/particuliers/assurances-habitation/documents',
    'https://www.macif.fr/assurance/particuliers/assurances-auto/documents',
    'https://www.macif.fr/assurance/particuliers/documents-contractuels',
  ],

  // ── MAIF ──────────────────────────────────────────────────────────────────
  'MAI01': [
    'https://www.maif.fr/assurances-auto/documents-contractuels.html',
    'https://www.maif.fr/assurances-habitation/documents-contractuels.html',
  ],

  // ── AXA ───────────────────────────────────────────────────────────────────
  'AXA01': [
    'https://www.axa.fr/aide/documents-contractuels.html',
    'https://www.axa.fr/aide/centre-de-telechargement.html',
  ],

  // ── Allianz ───────────────────────────────────────────────────────────────
  'ALL01': [
    'https://www.allianz.fr/aide/documents-contractuels.html',
    'https://www.allianz.fr/aide/telechargements.html',
  ],

  // ── AG2R La Mondiale ──────────────────────────────────────────────────────
  'AG201': [
    'https://www.ag2rlamondiale.fr/aide/documents-contractuels',
    'https://www.ag2rlamondiale.fr/telechargements',
  ],

  // ── Groupama ──────────────────────────────────────────────────────────────
  'GRP01': [
    'https://www.groupama.fr/votre-espace/documents/',
  ],

  // ── GMF ───────────────────────────────────────────────────────────────────
  'GMF01': [
    'https://www.gmf.fr/votre-assurance/documents-contractuels.html',
  ],

  // ── Direct Assurance ──────────────────────────────────────────────────────
  'DIR01': [
    'https://www.direct-assurance.fr/aide/documents-contractuels.html',
  ],

  // ── Crédit Agricole Assurances ────────────────────────────────────────────
  'CRE01': [
    'https://www.ca-assurances.com/documents-contractuels',
  ],

  // ── Malakoff Humanis ──────────────────────────────────────────────────────
  'MAL01': [
    'https://www.malakoffhumanis.com/telechargements/conditions-generales/',
  ],
};

// ─── Helpers internes ─────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Met à jour le statut d'un job en base */
async function updateJob(jobId: number, fields: Partial<IngestionJob>) {
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = $${idx++}`);
    vals.push(v != null && typeof v === 'object' ? JSON.stringify(v) : v);
  }
  vals.push(jobId);
  await pool.query(
    `UPDATE cg_ingestion_jobs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    vals
  );
}

/** Crée un job en base et retourne son id */
async function createJob(
  runId: string,
  insurerCode: string,
  insuranceTypeCode: string,
  sourceUrl?: string
): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO cg_ingestion_jobs (run_id, insurer_code, insurance_type_code, source_url, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
    [runId, insurerCode, insuranceTypeCode, sourceUrl ?? null]
  );
  return res.rows[0].id;
}

// ─── AGENT 1 : HUNTER ─────────────────────────────────────────────────────────
/**
 * Découvre les URLs de PDFs de CG sur le site de l'assureur.
 *
 * Stratégies utilisées dans l'ordre :
 *   1. cg_page_urls explicites dans cg_search_patterns
 *        → si URL se termine par .pdf : ajouté directement comme candidat
 *        → sinon : crawl de la page HTML pour extraire les liens PDF
 *   2. Sitemap.xml de website_url  →  filtrage des entrées PDF
 *   3. Crawl de la page d'accueil  → liens href contenant "condition" / "/cg"
 *
 * Respect systématique de robots.txt (disallow détecté, pas traversé).
 */
async function agentHunter(
  insurerCode: string,
  insuranceTypeCode: string,
  websiteUrl: string,
  patterns: {
    cg_page_urls?: string[];
    pdf_url_patterns?: string[];
    exclude_patterns?: string[];
  },
  maxDocs: number
): Promise<HunterCandidate[]> {
  // pdfPatterns : si une URL matche, confiance boostée à 0.85. Sinon on garde 0.55.
  // Le filtre n'est PAS exclusif : tous les PDFs du domaine passent, seul excludePatterns bloque.
  const pdfPatterns = patterns.pdf_url_patterns ?? [
    'conditions-generales', 'conditions_generales',
    'notice-d-information', 'notice_information',
    'documents-cg', 'documents_cg',
    '/cg-', '_cg_', '/cg/', '-cg_', '-cg.',
    'ipid', 'notice-ipid',
    'habitation_', 'auto_', 'sante_', 'prevoyance_',
    'multirisque', 'garantie', 'contrat',
  ];
  const excludePatterns = patterns.exclude_patterns ?? [
    'bulletin-adhesion', 'formulaire', 'mandat', 'charte',
    'cgv', 'mentions-legales', 'politique-cookies', 'plan-du-site',
  ];
  const candidates: HunterCandidate[] = [];

  // Helper : fetch HTML avec timeout
  const fetchHtml = (url: string): Promise<string> => new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.get(
      parsedUrl.href,
      {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        }
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) return resolve(fetchHtml(location));
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });

  // Helper : extraire TOUS les liens PDF depuis HTML brut.
  // Logique : accept all PDFs du domaine, seuls les excludePatterns bloquent.
  // Le CLASSIFIER Gemini décide si c'est une CG — pas le HUNTER.
  const extractPdfLinks = (html: string, baseUrl: string): HunterCandidate[] => {
    const found: HunterCandidate[] = [];
    const linkRegex = /href=["']([^"']+\.pdf[^"']*?)["']/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const fullUrl = new URL(match[1], baseUrl).toString();
        const lower = fullUrl.toLowerCase();
        // Seul filtre : patterns explicitement exclus
        if (excludePatterns.some(p => lower.includes(p.toLowerCase()))) continue;
        // Confidence boostée si l'URL ressemble à une CG, sinon neutre (CLASSIFIER juge)
        const boosted = pdfPatterns.some(p => lower.includes(p.toLowerCase()))
          || lower.includes('condition') || lower.includes('/cg/') || lower.includes('ipid');
        found.push({ url: fullUrl, probable_type: 'CG', confidence: boosted ? 0.75 : 0.55 });
      } catch { /* URL invalide, ignorée */ }
    }
    return found;
  };

  // ── Étape -1 : Seed URLs codées en dur (assureurs FR connus) ────────────
  // Priorité : CODE:TYPE (spécifique) > CODE (générique)
  // Utilisé quand aucune cg_page_urls n'est configurée, avant tout crawl.
  const seedKey   = `${insurerCode}:${insuranceTypeCode}`;
  const seedUrls  = [...(INSURER_SEED[seedKey] ?? []), ...(INSURER_SEED[insurerCode] ?? [])];
  for (const seedUrl of seedUrls) {
    if (seedUrl.toLowerCase().endsWith('.pdf')) {
      candidates.push({ url: seedUrl, probable_type: 'CG', confidence: 0.95 });
      console.log(`[HUNTER/${insurerCode}] ✔ PDF seed (${seedKey}): ${seedUrl}`);
    } else {
      try {
        const html = await fetchHtml(seedUrl);
        const links = extractPdfLinks(html, seedUrl);
        if (links.length > 0) {
          candidates.push(...links.map(c => ({ ...c, confidence: 0.85 })));
          console.log(`[HUNTER/${insurerCode}] Page seed: ${links.length} PDFs sur ${seedUrl}`);
        }
      } catch (e: any) {
        console.log(`[HUNTER/${insurerCode}] Seed ${seedUrl} inaccessible: ${e.message}`);
      }
    }
  }

  // ── Étape 0 : cg_page_urls TOUJOURS traitées, robots.txt ignoré ──────────
  // L'admin a explicitement fourni ces URLs → confiance totale, pas de filtre robots.
  const explicitUrls = patterns.cg_page_urls ?? [];
  for (const pageUrl of explicitUrls.slice(0, 20)) {
    // Cas A : URL directe vers un PDF
    if (pageUrl.toLowerCase().endsWith('.pdf')) {
      candidates.push({ url: pageUrl, probable_type: 'CG', confidence: 0.95 });
      console.log(`[HUNTER/${insurerCode}] ✔ PDF direct (admin): ${pageUrl}`);
      continue;
    }
    // Cas B : Page HTML à crawler
    try {
      const html = await fetchHtml(pageUrl);
      const links = extractPdfLinks(html, pageUrl);
      candidates.push(...links.map(c => ({ ...c, confidence: 0.85 })));
      console.log(`[HUNTER/${insurerCode}] Page admin: ${links.length} PDFs trouvés sur ${pageUrl}`);
    } catch (e: any) {
      console.warn(`[HUNTER/${insurerCode}] Échec page admin ${pageUrl}: ${e.message}`);
    }
  }

  // ── Étapes 1-N : découverte automatique ──────────────────────────────────
  if (candidates.length < maxDocs) {
    try {
      const base = new URL(websiteUrl);
      const origin = `${base.protocol}//${base.host}`;

      // robots.txt — non bloquant
      let disallowedPaths: string[] = [];
      try {
        const robotsTxt = await fetchHtml(`${origin}/robots.txt`);
        disallowedPaths = robotsTxt
          .split('\n')
          .filter(l => /^disallow:/i.test(l.trim()))
          .map(l => l.replace(/^disallow:\s*/i, '').trim().toLowerCase())
          .filter(Boolean);
        console.log(`[HUNTER/${insurerCode}] robots.txt: ${disallowedPaths.length} Disallow`);
      } catch {
        console.log(`[HUNTER/${insurerCode}] robots.txt inaccessible — on continue quand même`);
      }

      const isAllowed = (url: string) => {
        try {
          const p = new URL(url).pathname.toLowerCase();
          return !disallowedPaths.some(d => p.startsWith(d));
        } catch { return true; }
      };

      // ── Stratégie 1 : Sitemap(s) — avec support sitemap index ───────────
      // On essaie plusieurs emplacements courants + on descend dans les sous-sitemaps
      const sitemapCandidates = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemap-index.xml`,
        `${origin}/sitemaps/sitemap.xml`,
        `${origin}/sitemap-documents.xml`,
        `${origin}/sitemap-pdfs.xml`,
      ];

      const parsedSitemaps = new Set<string>();

      const parseSitemap = async (url: string): Promise<void> => {
        if (parsedSitemaps.has(url)) return;
        parsedSitemaps.add(url);
        try {
          const xml = await fetchHtml(url);

          // Sitemap index → descendre dans les sous-sitemaps
          const subSitemaps = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi)]
            .map(m => m[1].trim());
          if (subSitemaps.length > 0) {
            console.log(`[HUNTER/${insurerCode}] Sitemap index: ${subSitemaps.length} sous-sitemaps`);
            for (const sub of subSitemaps.slice(0, 20)) {
              await parseSitemap(sub);
            }
            return;
          }

          // Sitemap classique → extraire les PDFs
          const urlMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
          let count = 0;
          for (const u of urlMatches) {
            if (!u.toLowerCase().endsWith('.pdf')) continue;
            if (!isAllowed(u)) continue;
            const lower = u.toLowerCase();
            if (excludePatterns.some(p => lower.includes(p.toLowerCase()))) continue;
            const boosted = pdfPatterns.some(p => lower.includes(p.toLowerCase())) || lower.includes('condition');
            candidates.push({ url: u, probable_type: 'CG', confidence: boosted ? 0.75 : 0.55 });
            count++;
          }
          if (count > 0) console.log(`[HUNTER/${insurerCode}] Sitemap ${url}: ${count} PDFs`);
        } catch { /* sitemap absent ou inaccessible */ }
      };

      for (const sm of sitemapCandidates) {
        await parseSitemap(sm);
        if (candidates.length >= maxDocs) break;
      }

      // ── Stratégie 2 : pages de documents communes (assureurs FR) ─────────
      // La majorité des sites d'assureurs rangent leurs CG dans des paths connus.
      // On tente de les crawler directement sans passer par le JS.
      if (candidates.length < maxDocs) {
        const commonDocPaths = [
          '/aide/documents-contractuels.html',
          '/aide/documents-contractuels',
          '/nous-connaitre/documents-legaux',
          '/espace-client/documents',
          '/documents-contractuels',
          '/telechargements',
          '/download',
          '/conditions-generales',
          '/nos-contrats/conditions-generales',
          '/documents/conditions-generales',
          '/documents-legaux',
          '/informations-legales/conditions-generales',
          '/nos-offres',
          '/particuliers/nos-offres',
          '/assurances/conditions-generales',
        ];

        for (const docPath of commonDocPaths) {
          if (candidates.length >= maxDocs) break;
          const docUrl = `${origin}${docPath}`;
          if (!isAllowed(docUrl)) continue;
          try {
            const html = await fetchHtml(docUrl);
            const links = extractPdfLinks(html, docUrl).filter(c => isAllowed(c.url));
            if (links.length > 0) {
              candidates.push(...links.map(c => ({ ...c, confidence: 0.75 })));
              console.log(`[HUNTER/${insurerCode}] Page doc ${docPath}: ${links.length} PDFs`);
            }
          } catch { /* page absente */ }
        }
      }

      // ── Stratégie 3 : page d'accueil (fallback) ───────────────────────────
      if (candidates.length < maxDocs && isAllowed(websiteUrl)) {
        try {
          const html = await fetchHtml(websiteUrl);
          const links = extractPdfLinks(html, websiteUrl).filter(c => isAllowed(c.url));
          if (links.length > 0) {
            candidates.push(...links);
            console.log(`[HUNTER/${insurerCode}] Homepage: ${links.length} PDFs trouvés`);
          }
        } catch (e: any) { console.log(`[HUNTER/${insurerCode}] Homepage inaccessible: ${e.message}`); }
      }

    } catch (e: any) {
      console.warn(`[HUNTER/${insurerCode}] Erreur crawl auto: ${e.message}`);
    }
  }

  // Déduplication et limitation
  const seen = new Set<string>();
  return candidates
    .filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; })
    .slice(0, maxDocs);
}

// ─── AGENT 2 : FETCHER ────────────────────────────────────────────────────────
/**
 * Télécharge un PDF depuis une URL et retourne son Buffer + hash SHA-256.
 * Respecte un timeout de 30s. Vérifie que le content-type est bien PDF.
 */
async function agentFetcher(url: string): Promise<{
  buffer: Buffer;
  sha256: string;
  pages?: number;
} | null> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    // parsedUrl.href is percent-encoded (handles accented chars like "Générales" → "G%C3%A9n%C3%A9rales")
    const req = lib.get(
      parsedUrl.href,
      {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        }
      },
      async (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          req.destroy();
          if (location) return resolve(agentFetcher(location));
          return resolve(null);
        }
        if (res.statusCode !== 200) {
          req.destroy();
          return resolve(null);
        }
        const ct = res.headers['content-type'] ?? '';
        if (!ct.includes('pdf') && !ct.includes('octet-stream')) {
          req.destroy();
          return resolve(null);
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Vérifier magic bytes PDF (%PDF-)
          if (buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
            return resolve(null);
          }
          const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
          resolve({ buffer, sha256 });
        });
        res.on('error', () => resolve(null));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Fallback curl pour les sites avec TLS fingerprinting (WAF Cloudflare/Akamai).
 * curl utilise un JA3 différent de Node.js — souvent accepté là où https.get est bloqué.
 * Retourne null si curl n'est pas disponible ou si le téléchargement échoue.
 */
async function agentFetcherCurl(url: string): Promise<{ buffer: Buffer; sha256: string } | null> {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `cg-fetch-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    const encodedUrl = new URL(url).href;
    const args = [
      '-L', '-s', '--fail',
      '--max-time', '30',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-H', 'Accept: application/pdf,*/*',
      '-H', 'Accept-Language: fr-FR,fr;q=0.9',
      '-o', tmpFile,
      encodedUrl,
    ];
    execFile('curl', args, { timeout: 35000 }, (err) => {
      if (err) {
        fs.unlink(tmpFile, () => {});
        return resolve(null);
      }
      try {
        const buffer = fs.readFileSync(tmpFile);
        fs.unlink(tmpFile, () => {});
        if (buffer.length < 10 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') return resolve(null);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        resolve({ buffer, sha256 });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Télécharge un PDF : essaie d'abord https.get (Node), puis curl en fallback (TLS fingerprint différent).
 */
async function fetchPdf(url: string): Promise<{ buffer: Buffer; sha256: string } | null> {
  const result = await agentFetcher(url);
  if (result) return result;
  console.log(`[FETCHER] https.get échoué → fallback curl pour ${url}`);
  return agentFetcherCurl(url);
}

// ─── AGENT 3 : CLASSIFIER ─────────────────────────────────────────────────────
/**
 * Analyse les 3 premières pages du PDF avec Gemini Vision pour identifier :
 * - Assureur (code + nom)
 * - Type d'assurance (code)
 * - Type de document (CG / notice / IPID)
 * - Formules présentes
 * - Score de confiance
 *
 * Les référentiels assureurs et types sont passés en contexte pour guider Gemini.
 */
async function agentClassifier(
  pdfBuffer: Buffer,
  knownInsurers: { code: string; full_name: string }[],
  knownTypes: { code: string; label_fr: string }[],
  hintInsurer?: string,
  hintType?: string
): Promise<ClassifierResult | null> {
  const ai = getAiClient();
  if (!ai) {
    console.warn('[CLASSIFIER] Gemini non disponible');
    return null;
  }

  // Extraire la première page en base64 pour Gemini Vision
  // On envoie uniquement les ~3 premières pages (max 512KB) pour économiser les tokens
  const pdfBase64 = pdfBuffer.slice(0, 500 * 1024).toString('base64');

  const insurerList = knownInsurers.map(i => `${i.code}: ${i.full_name}`).join('\n');
  const typeList    = knownTypes.map(t => `${t.code}: ${t.label_fr}`).join('\n');

  const prompt = `Tu es un expert en classification de documents d'assurance français.
Analyse ce document PDF et identifie :

1. L'assureur (utilise EXACTEMENT un des codes suivants si possible) :
${insurerList}

2. Le type d'assurance (utilise EXACTEMENT un des codes suivants) :
${typeList}

3. Le type de document — utilise EXACTEMENT un de ces codes : CG (conditions générales), NI (notice d'information), IPID (document info produit européen), DIP (devoir d'information et conseil), FIC (fiche info et conseil), TABLEAU (tableau de garanties), GLOSSAIRE, AUTRE

4. Les noms COMMERCIAUX des formules/offres souscriptibles par le client.
   Règles strictes :
   - INCLURE : noms propres de formule (ex: "Formule Tous Risques", "Confort+", "ESSENTIEL", "NIVEAU 1")
   - EXCLURE : pronoms ("Nous", "Vous"), prépositions ("De plein droit"), déscriptions de valeur ou de montant ("Valeur du véhicule..."), en-têtes de colonne, intitulés de ligne de tableau, notes de bas de page
   - Si aucune formule commerciale identifiable : retourner tableau vide []

5. Le sous-type spécifique du contrat, si la page de garde l'identifie explicitement (ex: "RAQVAM", "RAQVAM2", "PNO", "Résidence Principale", "Locataire", "Propriétaire Occupant").
   - Retourne null si le document couvre le type en général (pas de sous-produit identifiable).
   - Format : courte étiquette en minuscules snake_case telle qu'elle identifie le produit (ex: "raqvam2", "pno", "residence_principale").

6. Ton score de confiance de 0 à 1.

${hintInsurer ? `Indice : l'assureur probable est "${hintInsurer}"` : ''}
${hintType ? `Indice : le type d'assurance probable est "${hintType}"` : ''}

Réponds UNIQUEMENT avec un JSON valide, sans commentaire :
{
  "insurer_code": "CODE",
  "insurer_name": "Nom complet",
  "insurance_type_code": "CODE",
  "insurance_sub_type_code": null,
  "document_type": "CG",
  "formula_hints": ["Formule1", "Formule2"],
  "confidence": 0.85,
  "language": "fr",
  "is_cg": true,
  "detail": "sous-formule ou remarque optionnelle"
}`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' }, 'cgClassifier');
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64,
        },
      },
      prompt,
    ]);
    const text  = result.response.text().trim();
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    const parsed: ClassifierResult = JSON.parse(clean);
    // Vérifications minimales
    if (!parsed.insurer_code || !parsed.insurance_type_code) return null;
    // Filtre post-traitement : supprimer les faux positifs formula_hints
    if (Array.isArray(parsed.formula_hints)) {
      const REJECT_PATTERN = /^(nous|vous|de plein droit|valeur|montant|inférieure|supérieure|égale|garantie|option|\d+[€%]?|à dire|au jour|par|en cas|sous|avec|sans|hors|autres|si)/i;
      const seen = new Map<string, string>(); // normalizedKey → best label
      for (const f of parsed.formula_hints) {
        if (!f || typeof f !== 'string') continue;
        const trimmed = f.trim();
        if (trimmed.length < 4 || trimmed.length > 60) continue;
        if (REJECT_PATTERN.test(trimmed)) continue;
        if (/^\d/.test(trimmed)) continue;
        if ((trimmed.match(/,/g) || []).length > 2) continue;
        // Strip option-qualified suffixes before deduplication
        const stripped = trimmed
          .replace(/\s*\(\s*(avec|sans)\s+options?[^)]*\)\s*$/i, '')
          .replace(/\s*\[\s*(avec|sans)\s+options?[^\]]*\]\s*$/i, '')
          .replace(/\s*[—–-]\s*(avec|sans)\s+options?.*$/i, '')
          .trim();
        if (stripped.length < 3) continue;
        const key = stripped.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        // Prefer the shorter/cleaner label (base name without suffix)
        if (!seen.has(key) || seen.get(key)!.length > stripped.length) {
          seen.set(key, stripped);
        }
      }
      parsed.formula_hints = [...seen.values()];
    }
    // Normalise document_type vers les codes valides de la table document_types
    const VALID_DOC_TYPES: Record<string, string> = {
      cg: 'CG', 'conditions-générales': 'CG', 'conditions generales': 'CG',
      ni: 'NI', notice: 'NI', 'notice-information': 'NI', 'notice d\'information': 'NI',
      ipid: 'IPID', dip: 'DIP', fic: 'FIC', tableau: 'TABLEAU', glossaire: 'GLOSSAIRE', autre: 'AUTRE',
    };
    const rawType = (parsed.document_type || 'CG').toLowerCase().trim();
    parsed.document_type = VALID_DOC_TYPES[rawType] ?? VALID_DOC_TYPES[rawType.toUpperCase() as string] ?? 'CG';
    // Normalize insurance_sub_type_code: lowercase snake_case, null if absent/generic
    if (parsed.insurance_sub_type_code && typeof parsed.insurance_sub_type_code === 'string') {
      const sub = parsed.insurance_sub_type_code.trim().toLowerCase()
        .replace(/\s+/g, '_').replace(/[^a-z0-9_]+/g, '').replace(/^_+|_+$/g, '');
      parsed.insurance_sub_type_code = sub.length >= 2 ? sub : null;
    } else {
      parsed.insurance_sub_type_code = null;
    }
    return parsed;
  } catch (e: any) {
    console.error('[CLASSIFIER] Erreur Gemini:', e.message);
    return null;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Valide insurance_sub_type_code contre la table insurance_sub_types.
 * Retourne le code s'il existe (case-insensitive), null sinon.
 * Évite la FK constraint violation "central_cg_insurance_sub_type_code_fkey".
 */
async function resolveSubTypeCode(dbPool: any, code: string | null | undefined): Promise<string | null> {
  if (!code) return null;
  try {
    const res = await dbPool.query(
      `SELECT code FROM insurance_sub_types WHERE LOWER(code) = LOWER($1) LIMIT 1`,
      [code]
    );
    if (res.rows.length > 0) return res.rows[0].code as string;
    console.warn(`[CLASSIFIER] insurance_sub_type_code "${code}" inconnu dans insurance_sub_types — mis à null`);
    return null;
  } catch {
    return null;
  }
}

// ─── ORCHESTRATEUR ────────────────────────────────────────────────────────────

/**
 * Lance le pipeline complet pour un scope donné.
 * Retourne le run_id et la liste des job ids créés.
 */
export async function runIngestion(scope: IngestionScope): Promise<{
  run_id: string;
  jobs_created: number;
  message: string;
}> {
  if (currentRunId) {
    throw new Error(`Un job est déjà en cours (run_id: ${currentRunId}). Attendez sa fin ou arrêtez-le.`);
  }

  stopRequested.value = false;
  const runId = crypto.randomUUID();
  currentRunId = runId;

  const maxDocs       = scope.max_docs_per_combo ?? 2;
  const confThreshold = scope.confidence_threshold ?? 0.70;

  try {
    // ─ Charger référentiels ─────────────────────────────────────────────────
    const [insurerRows, typeRows] = await Promise.all([
      pool.query<{ code: string; full_name: string; website_url: string; cg_search_patterns: any }>(
        `SELECT code, full_name, website_url, cg_search_patterns
         FROM insurers
         WHERE is_active = true
           AND (cg_search_enabled = true OR $1 = 'targeted')
         ORDER BY display_order`,
        [scope.scope ?? 'targeted']
      ),
      pool.query<{ code: string; label_fr: string }>(
        `SELECT code, label_fr FROM insurance_types WHERE is_active = true ORDER BY display_order`
      ),
    ]);

    const allInsurers = insurerRows.rows;
    const allTypes    = typeRows.rows;

    // ─ Filtrer selon le scope ────────────────────────────────────────────────
    const targetInsurers = scope.scope === 'all_active'
      ? allInsurers
      : allInsurers.filter(i => (scope.insurers ?? []).includes(i.code));

    const targetTypes = scope.scope === 'all_active'
      ? allTypes
      : allTypes.filter(t => (scope.insurance_types ?? []).includes(t.code));

    if (targetInsurers.length === 0) throw new Error('Aucun assureur sélectionné / activé');
    if (targetTypes.length === 0)    throw new Error('Aucun type d\'assurance sélectionné');

    console.log(`\n🚀 Ingestion démarrée (run_id: ${runId})`);
    console.log(`   ${targetInsurers.length} assureurs × ${targetTypes.length} types = ${targetInsurers.length * targetTypes.length} combos`);

    let jobsCreated = 0;

    // ─ Boucle combos ─────────────────────────────────────────────────────────
    for (const insurer of targetInsurers) {
      if (stopRequested.value) { console.warn('⛔ Ingestion arrêtée par l\'admin'); break; }

      if (!insurer.website_url) {
        console.warn(`[${insurer.code}] Pas de website_url → skip`);
        continue;
      }

      const patterns = insurer.cg_search_patterns ?? {};

      for (const type of targetTypes) {
        if (stopRequested.value) break;

        console.log(`\n── [${insurer.code} × ${type.code}] ──────────────────────────────`);

        // ── Agent HUNTER ──────────────────────────────────────────────────
        let candidates: HunterCandidate[] = [];
        try {
          candidates = await agentHunter(
            insurer.code,
            type.code,
            insurer.website_url,
            patterns,
            maxDocs
          );
          console.log(`[HUNTER] ${candidates.length} candidat(s) trouvé(s)`);
        } catch (e: any) {
          console.error(`[HUNTER/${insurer.code}/${type.code}] Erreur:`, e.message);
          const jobId = await createJob(runId, insurer.code, type.code);
          await updateJob(jobId, { status: 'error', error_message: `HUNTER: ${e.message}` });
          jobsCreated++;
          continue;
        }

        if (candidates.length === 0) {
          const jobId = await createJob(runId, insurer.code, type.code);
          await updateJob(jobId, { status: 'skipped', error_message: 'Aucun PDF trouvé par HUNTER' });
          jobsCreated++;
          continue;
        }

        // Traiter chaque candidat (limité à maxDocs)
        for (const candidate of candidates.slice(0, maxDocs)) {
          if (stopRequested.value) break;

          const jobId = await createJob(runId, insurer.code, type.code, candidate.url);
          jobsCreated++;

          try {
            // ── Agent FETCHER ────────────────────────────────────────────
            console.log(`[FETCHER] Téléchargement: ${candidate.url}`);
            await updateJob(jobId, { status: 'fetching' });
            const fetched = await fetchPdf(candidate.url);

            if (!fetched) {
              await updateJob(jobId, { status: 'error', error_message: 'Téléchargement échoué ou non-PDF' });
              continue;
            }

            // Vérifier doublon par SHA-256
            const dedupCheck = await pool.query(
              `SELECT id FROM cg_ingestion_jobs WHERE pdf_sha256 = $1 AND status = 'done' LIMIT 1`,
              [fetched.sha256]
            );
            if (dedupCheck.rows.length > 0) {
              console.log(`[FETCHER] Doublon SHA-256 détecté → skip`);
              await updateJob(jobId, {
                status: 'skipped',
                pdf_sha256: fetched.sha256,
                error_message: 'Doublon — PDF déjà ingéré',
              });
              continue;
            }

            // ── Agent CLASSIFIER ─────────────────────────────────────────
            console.log(`[CLASSIFIER] Classification...`);
            await updateJob(jobId, { status: 'classifying', pdf_sha256: fetched.sha256 });
            await sleep(1000); // rate-limit Gemini

            const classif = await agentClassifier(
              fetched.buffer,
              allInsurers,
              allTypes,
              insurer.full_name,
              type.label_fr
            );

            if (!classif) {
              await updateJob(jobId, {
                status: 'error',
                error_message: 'CLASSIFIER: réponse Gemini invalide',
              });
              continue;
            }

            console.log(`[CLASSIFIER] ${classif.insurer_code}/${classif.insurance_type_code} | confiance: ${classif.confidence} | CG: ${classif.is_cg}`);

            if (!classif.is_cg || classif.confidence < confThreshold) {
              await updateJob(jobId, {
                status: 'skipped',
                confidence: classif.confidence,
                classifier_result: classif,
                error_message: `Seuil ou type non validé (is_cg=${classif.is_cg}, conf=${classif.confidence})`,
              });
              continue;
            }

            // Mismatch guard : le document détecté ne correspond pas au type demandé
            if (classif.insurance_type_code !== type.code) {
              console.warn(`[CLASSIFIER] Mismatch ${classif.insurance_type_code} ≠ ${type.code} — document ignoré`);
              await updateJob(jobId, {
                status: 'skipped',
                confidence: classif.confidence,
                classifier_result: classif,
                error_message: `Type détecté "${classif.insurance_type_code}" ≠ attendu "${type.code}" — document ignoré`,
              });
              continue;
            }

            // ── Insérer dans central_cg ──────────────────────────────────
            const fileName = `${classif.insurer_code}_${classif.insurance_type_code}_${Date.now()}.pdf`;
            const pdfBase64 = fetched.buffer.toString('base64');
            // Valider le sub_type_code (FK constraint) — null si code inconnu en DB
            classif.insurance_sub_type_code = await resolveSubTypeCode(pool, classif.insurance_sub_type_code);

            const insertResult = await pool.query<{ id: number }>(
              `INSERT INTO central_cg
                 (insurer_code, insurance_type_code, insurance_sub_type_code, document_type_code,
                  url, target_filename, pdf_base64, status, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
               RETURNING id`,
              [
                classif.insurer_code,
                classif.insurance_type_code,
                classif.insurance_sub_type_code ?? null,
                classif.document_type.toUpperCase(),
                candidate.url,
                fileName,
                pdfBase64,
                JSON.stringify({
                  indexedFormulas:    classif.formula_hints ?? [],
                  formula_hints:      classif.formula_hints ?? [],
                  insurance_sub_type: classif.insurance_sub_type_code ?? null,
                  detail:             classif.detail,
                  ingested_at:        new Date().toISOString(),
                  source_url:         candidate.url,
                  ingestion_run_id:   runId,
                }),
              ]
            );
            const centralCgId = insertResult.rows[0].id;

            await updateJob(jobId, {
              status: 'vectorizing',
              confidence: classif.confidence,
              classifier_result: classif,
              central_cg_id: centralCgId,
            });

            // ── Agent VECTORIZER ─────────────────────────────────────────
            console.log(`[VECTORIZER] Vectorisation central_cg#${centralCgId}...`);
            const vecResult = await vectorizeCgByPages(pool as Pool, centralCgId, candidate.url, pdfBase64);

            await updateJob(jobId, {
              status: 'done',
              pages_count: vecResult.pagesProcessed,
            });

            console.log(`✅ [${insurer.code}/${type.code}] Done — ${vecResult.pagesProcessed} pages, ${vecResult.factsCreated} faits`);

            // ── Mettre à jour document_catalogue ─────────────────────────
            // ⚠ Filtrer aussi par insurance_sub_type_code pour ne pas écraser
            //   d'autres lignes du même (insurer, type, doc_type) avec un subtype différent.
            try {
              await pool.query(
                `UPDATE document_catalogue
                 SET matrix_status           = 'indexed',
                     central_cg_id           = $1,
                     current_url             = $2,
                     current_sha256          = $3,
                     indexed_at              = NOW(),
                     classifier_result       = $4,
                     formula_hints           = $5,
                     insurance_sub_type_code = $6,
                     last_checked_at         = NOW(),
                     next_check_at           = NOW() + (check_frequency_days || ' days')::INTERVAL
                 WHERE insurer_code        = $7
                   AND insurance_type_code = $8
                   AND doc_type            = $9
                   AND insurance_sub_type_code IS NOT DISTINCT FROM $6`,
                [
                  centralCgId,
                  candidate.url,
                  fetched.sha256,
                  JSON.stringify(classif),
                  classif.formula_hints ?? [],
                  classif.insurance_sub_type_code ?? null,
                  classif.insurer_code,
                  classif.insurance_type_code,
                  (classif.document_type ?? 'CG').toUpperCase(),
                ]
              );
            } catch (catErr: any) {
              console.warn(`[CATALOGUE] Erreur mise à jour catalogue: ${catErr.message}`);
            }

            // Pause inter-document pour ne pas saturer Gemini
            await sleep(3000);

          } catch (e: any) {
            console.error(`[ORCHESTRATOR] Erreur job ${jobId}:`, e.message);
            await updateJob(jobId, { status: 'error', error_message: e.message.slice(0, 500) });
          }
        }

        // Pause inter-combo
        await sleep(2000);
      }
    }

    console.log(`\n🏁 Ingestion terminée (run_id: ${runId}) — ${jobsCreated} jobs créés`);
    return { run_id: runId, jobs_created: jobsCreated, message: 'Ingestion terminée' };

  } finally {
    currentRunId = null;
    stopRequested.value = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestion ciblée depuis le Catalogue documentaire
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestCatalogueResult {
  success:        boolean;
  central_cg_id?: number;
  pages?:         number;
  sha256?:        string;
  error?:         string;
}

/**
 * Ingère un document depuis une URL connue, vers une entrée spécifique du catalogue.
 * Réutilise les agents FETCHER + CLASSIFIER + VECTORIZER (privés au fichier).
 *
 * Différences vs runIngestion :
 *  - Pas de HUNTER (URL fournie directement)
 *  - Seuil de confiance abaissé à 0.4 (entrée sélectionnée manuellement)
 *  - Force les codes assureur/type depuis le catalogue (hints prioritaires)
 */
export async function ingestDocumentForCatalogue(params: {
  catalogueId:            number;
  insurerCode:            string;
  insuranceTypeCode:      string;
  insuranceSubTypeCode?:  string | null; // sous-type depuis document_catalogue — prioritaire sur le classifier
  pdfUrl:                 string;
  onProgress?:            (step: string, message: string) => void;
  onCgIdCreated?:         (cgId: number) => void;
}): Promise<IngestCatalogueResult> {
  const { catalogueId, insurerCode, insuranceTypeCode, pdfUrl, onProgress, onCgIdCreated } = params;
  // Le sous-type catalogue est transmis explicitement OU relu depuis la DB si absent
  let catalogueSubType: string | null | undefined = params.insuranceSubTypeCode;
  const progress = (step: string, msg: string) => { if (onProgress) onProgress(step, msg); };

  try {
    // ── Charger les référentiels ─────────────────────────────────────────────
    const [insurerRows, typeRows] = await Promise.all([
      pool.query<{ code: string; full_name: string }>(
        `SELECT code, full_name FROM insurers WHERE is_active = true ORDER BY display_order`
      ),
      pool.query<{ code: string; label_fr: string }>(
        `SELECT code, label_fr FROM insurance_types WHERE is_active = true ORDER BY display_order`
      ),
    ]);

    // ── FETCHER ──────────────────────────────────────────────────────────────
    progress('fetching', `Téléchargement du PDF : ${pdfUrl.slice(0, 70)}…`);
    const fetched = await fetchPdf(pdfUrl);

    if (!fetched) {
      await pool.query(
        `UPDATE document_catalogue SET matrix_status = 'error', notes = $1, updated_at = NOW() WHERE id = $2`,
        ['PDF inaccessible ou invalide', catalogueId]
      );
      return { success: false, error: 'Téléchargement échoué — vérifiez l\'URL et que le fichier est un PDF valide' };
    }

    // ── Dédup SHA-256 ────────────────────────────────────────────────────────
    const dupCheck = await pool.query<{ id: number; central_cg_id: number | null }>(
      `SELECT j.id, j.central_cg_id
       FROM cg_ingestion_jobs j
       WHERE j.pdf_sha256 = $1 AND j.status = 'done' AND j.central_cg_id IS NOT NULL
       LIMIT 1`,
      [fetched.sha256]
    );
    if (dupCheck.rows.length > 0) {
      const existingCgId = dupCheck.rows[0].central_cg_id!;
      await pool.query(
        `UPDATE document_catalogue
         SET matrix_status = 'indexed', central_cg_id = $1, current_sha256 = $2,
             current_url = $3, indexed_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [existingCgId, fetched.sha256, pdfUrl, catalogueId]
      );
      progress('done', `Document déjà indexé (SHA-256 identique) → central_cg #${existingCgId}`);
      return { success: true, central_cg_id: existingCgId, sha256: fetched.sha256 };
    }

    // ── CLASSIFIER ───────────────────────────────────────────────────────────
    progress('classifying', 'Identification du document par Gemini…');
    await sleep(500); // rate-limit Gemini

    const insurer = insurerRows.rows.find(i => i.code === insurerCode);
    const type    = typeRows.rows.find(t => t.code === insuranceTypeCode);

    let classif = await agentClassifier(
      fetched.buffer,
      insurerRows.rows,
      typeRows.rows,
      insurer?.full_name ?? insurerCode,
      type?.label_fr    ?? insuranceTypeCode
    );

    // Si le classifier échoue ou retourne une très faible confiance,
    // on synthétise un résultat minimal à partir des hints (l'utilisateur a sélectionné explicitement)
    if (!classif || classif.confidence < 0.35) {
      console.warn(`[CATALOGUE/CLASSIFIER] Confiance faible (${classif?.confidence ?? 0}) → fallback sur hints`);
      classif = {
        insurer_code:         insurerCode,
        insurer_name:         insurer?.full_name ?? insurerCode,
        insurance_type_code:  insuranceTypeCode,
        document_type:        'CG',
        formula_hints:        [],
        confidence:           classif?.confidence ?? 0.30,
        language:             'fr',
        is_cg:                true,
        detail:               'Classifié par hints catalogue (faible confiance)',
      };
    }

    // Mismatch guard : si le classifier identifie un type différent avec suffisamment de confiance,
    // le document ne correspond pas à ce contrat — ne pas charger
    if (classif.confidence >= 0.50 && classif.insurance_type_code !== insuranceTypeCode) {
      const msg = `Contrat non disponible pour ${insurerCode}/${insuranceTypeCode} : `
        + `document identifié comme "${classif.insurance_type_code}" (conf=${classif.confidence.toFixed(2)}). `
        + 'Aucun document trouvé pour ce type auprès de cet assureur.';
      console.warn(`[CATALOGUE/CLASSIFIER] ⛔ ${msg}`);
      await pool.query(
        `UPDATE document_catalogue SET matrix_status = 'missing', notes = $1, updated_at = NOW() WHERE id = $2`,
        [msg.slice(0, 500), catalogueId]
      );
      return { success: false, error: msg };
    }

    // Forcer les codes depuis le catalogue (l'utilisateur sait ce qu'il ingère)
    classif.insurer_code        = insurerCode;
    classif.insurance_type_code = insuranceTypeCode;
    // ⚠ Forcer le sous-type depuis la DB pour éviter que le classifier ne change le subtype
    // d'une ligne et crée un doublon avec une autre ligne du même (insurer, type, doc_type).
    if (catalogueSubType === undefined) {
      // Pas transmis par l'appelant → relire depuis la DB
      const subRow = await pool.query<{ insurance_sub_type_code: string | null }>(
        `SELECT insurance_sub_type_code FROM document_catalogue WHERE id = $1`,
        [catalogueId]
      );
      catalogueSubType = subRow.rows[0]?.insurance_sub_type_code ?? null;
    }
    // Le sous-type catalogue est prioritaire sur la détection Gemini
    classif.insurance_sub_type_code = catalogueSubType ?? classif.insurance_sub_type_code ?? null;

    // ── INSERT central_cg ─────────────────────────────────────────────────────
    const fileName   = `${insurerCode}_${insuranceTypeCode}_${Date.now()}.pdf`;
    const pdfBase64  = fetched.buffer.toString('base64');
    // Valider le sub_type_code (FK constraint) — null si code inconnu en DB
    classif.insurance_sub_type_code = await resolveSubTypeCode(pool, classif.insurance_sub_type_code);
    const insertRes  = await pool.query<{ id: number }>(
      `INSERT INTO central_cg
         (insurer_code, insurance_type_code, insurance_sub_type_code, document_type_code,
          url, target_filename, pdf_base64, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING id`,
      [
        classif.insurer_code,
        classif.insurance_type_code,
        classif.insurance_sub_type_code ?? null,
        (classif.document_type ?? 'CG').toUpperCase(),
        pdfUrl,
        fileName,
        pdfBase64,
        JSON.stringify({
          indexedFormulas:    classif.formula_hints ?? [],
          formula_hints:      classif.formula_hints ?? [],
          insurance_sub_type: classif.insurance_sub_type_code ?? null,
          detail:             classif.detail,
          confidence:         classif.confidence,
          ingested_at:        new Date().toISOString(),
          source_url:         pdfUrl,
          catalogue_id:       catalogueId,
        }),
      ]
    );
    const centralCgId = insertRes.rows[0].id;

    // ── VECTORIZER ───────────────────────────────────────────────────────────
    progress('vectorizing', `Vectorisation page par page (central_cg #${centralCgId})…`);
    // Notifier le job de l'ID créé pour permettre la propagation d'un stop
    if (onCgIdCreated) onCgIdCreated(centralCgId);
    const vecResult = await vectorizeCgByPages(pool as Pool, centralCgId, pdfUrl, pdfBase64);

    // ── Mettre à jour document_catalogue ─────────────────────────────────────
    await pool.query(
      `UPDATE document_catalogue
       SET matrix_status           = 'indexed',
           central_cg_id           = $1,
           current_url             = $2,
           current_sha256          = $3,
           indexed_at              = NOW(),
           classifier_result       = $4,
           formula_hints           = $5,
           insurance_sub_type_code = $6,
           last_checked_at         = NOW(),
           next_check_at           = NOW() + (check_frequency_days || ' days')::INTERVAL,
           updated_at              = NOW()
       WHERE id = $7`,
      [
        centralCgId,
        pdfUrl,
        fetched.sha256,
        JSON.stringify(classif),
        classif.formula_hints ?? [],
        classif.insurance_sub_type_code ?? null,
        catalogueId,
      ]
    );

    progress('done', `Vectorisé — ${vecResult.pagesProcessed} pages, ${vecResult.factsCreated} faits`);

    return {
      success:        true,
      central_cg_id:  centralCgId,
      pages:          vecResult.pagesProcessed,
      sha256:         fetched.sha256,
    };

  } catch (err: any) {
    console.error(`[ingestDocumentForCatalogue] Erreur pour catalogue#${catalogueId}:`, err.message);
    try {
      await pool.query(
        `UPDATE document_catalogue SET matrix_status = 'error', notes = $1, updated_at = NOW() WHERE id = $2`,
        [err.message?.slice(0, 500), catalogueId]
      );
    } catch { /* silencieux */ }
    return { success: false, error: err.message };
  }
}
