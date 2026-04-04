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
      url,
      { timeout: 15000, headers: { 'User-Agent': 'AssurClair-Ingestion-Bot/1.0 (contact@assurclair.fr)' } },
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

  // ── Étapes 1-3 : crawl automatique (avec respect robots.txt) ─────────────
  // Seulement si on n'a pas encore assez de candidats
  if (candidates.length < maxDocs) {
    try {
      const base = new URL(websiteUrl);
      const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
      let disallowedPaths: string[] = [];
      try {
        const robotsTxt = await fetchHtml(robotsUrl);
        disallowedPaths = robotsTxt
          .split('\n')
          .filter(l => /^disallow:/i.test(l.trim()))
          .map(l => l.replace(/^disallow:\s*/i, '').trim().toLowerCase())
          .filter(Boolean);
        console.log(`[HUNTER/${insurerCode}] robots.txt: ${disallowedPaths.length} règles Disallow`);
      } catch {
        console.log(`[HUNTER/${insurerCode}] robots.txt inaccessible (on continue quand même)`);
      }

      const isAllowed = (url: string) => {
        try {
          const path = new URL(url).pathname.toLowerCase();
          return !disallowedPaths.some(d => path.startsWith(d));
        } catch { return true; }
      };

      // Stratégie 1 : Sitemap
      try {
        const sitemapUrl = `${base.protocol}//${base.host}/sitemap.xml`;
        const sitemap = await fetchHtml(sitemapUrl);
        const urlMatches = sitemap.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
        let sitemapCount = 0;
        for (const m of urlMatches) {
          const u = m.replace(/<\/?loc>/gi, '').trim();
          if (!u.toLowerCase().endsWith('.pdf')) continue;
          if (!isAllowed(u)) { console.log(`[HUNTER/${insurerCode}] robots.txt bloque: ${u}`); continue; }
          const lower = u.toLowerCase();
          if (excludePatterns.some(p => lower.includes(p.toLowerCase()))) continue;
          const boosted = pdfPatterns.some(p => lower.includes(p.toLowerCase())) || lower.includes('condition');
          candidates.push({ url: u, probable_type: 'CG', confidence: boosted ? 0.75 : 0.55 });
          sitemapCount++;
        }
        console.log(`[HUNTER/${insurerCode}] Sitemap: ${sitemapCount} PDFs ajoutés`);
      } catch { console.log(`[HUNTER/${insurerCode}] Sitemap absent/inaccessible`); }

      // Stratégie 2 : crawl page d'accueil
      if (candidates.length < maxDocs && isAllowed(websiteUrl)) {
        try {
          const html = await fetchHtml(websiteUrl);
          const links = extractPdfLinks(html, websiteUrl).filter(c => isAllowed(c.url));
          candidates.push(...links);
          console.log(`[HUNTER/${insurerCode}] Homepage: ${links.length} PDFs trouvés`);
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
    const req = lib.get(
      url,
      { timeout: 30000, headers: { 'User-Agent': 'AssurClair-Ingestion-Bot/1.0 (contact@assurclair.fr)' } },
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

3. Le type de document parmi : CG (conditions générales), notice, ipid, autre

4. Les noms de formules/offres présents (uniquement les noms commerciaux des formules)

5. Ton score de confiance de 0 à 1.

${hintInsurer ? `Indice : l'assureur probable est "${hintInsurer}"` : ''}
${hintType ? `Indice : le type d'assurance probable est "${hintType}"` : ''}

Réponds UNIQUEMENT avec un JSON valide, sans commentaire :
{
  "insurer_code": "CODE",
  "insurer_name": "Nom complet",
  "insurance_type_code": "CODE",
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
    return parsed;
  } catch (e: any) {
    console.error('[CLASSIFIER] Erreur Gemini:', e.message);
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
            const fetched = await agentFetcher(candidate.url);

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

            // ── Insérer dans central_cg ──────────────────────────────────
            const fileName = `${classif.insurer_code}_${classif.insurance_type_code}_${Date.now()}.pdf`;
            const pdfBase64 = fetched.buffer.toString('base64');

            const insertResult = await pool.query<{ id: number }>(
              `INSERT INTO central_cg
                 (insurer_code, insurance_type_code, document_type_code,
                  url, target_filename, pdf_base64, status, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
               RETURNING id`,
              [
                classif.insurer_code,
                classif.insurance_type_code,
                classif.document_type.toUpperCase(),
                candidate.url,
                fileName,
                pdfBase64,
                JSON.stringify({
                  formula_hints: classif.formula_hints,
                  detail: classif.detail,
                  ingested_at: new Date().toISOString(),
                  source_url: candidate.url,
                  ingestion_run_id: runId,
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
