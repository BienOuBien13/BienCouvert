/**
 * CatalogueIngestionService.ts — Orchestration des jobs d'ingestion ciblée
 *
 * Pipeline par entrée catalogue :
 *   1. Vérifier si une URL est déjà connue (catalogue.current_url ou discovered_url)
 *   2. Sinon → SmartSearchService pour trouver l'URL (Gemini + Google Search)
 *   3. ingestDocumentForCatalogue → fetch + classify + vectorize + update catalogue
 *
 * Les jobs sont suivis en mémoire (Map) avec un statut par entrée.
 * L'API expose GET /catalogue/job/:job_id pour le polling frontend.
 */

import crypto from 'crypto';
import pool from '../db';
import { smartSearchForDocument } from './SmartSearchService';
import { ingestDocumentForCatalogue } from '../services/cgIngestionService';
import { requestStopVectorization } from '../services/pageVectorizationService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntryStep =
  | 'pending'
  | 'searching'
  | 'fetching'
  | 'classifying'
  | 'vectorizing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface EntryJobStatus {
  catalogue_id:         number;
  insurer_code:         string;
  insurer_label:        string;
  insurance_type_code:  string;
  type_label:           string;
  doc_type:             string;
  step:                 EntryStep;
  message:              string;
  started_at:           string;
  completed_at?:        string;
  found_url?:           string;
  central_cg_id?:       number;
  pages_count?:         number;
}

export interface CatalogueJob {
  job_id:     string;
  started_at: string;
  total:      number;
  done:       number;
  errors:     number;
  cancelled:  number;   // entrées annulées (unitaire ou arrêt total)
  statuses:   EntryJobStatus[];
  completed:  boolean;
  delay_ms:   number;   // délai inter-documents (ms) pour séquencer la charge
}

// ─── Registre en mémoire (max 10 jobs conservés) ─────────────────────────────

const jobRegistry    = new Map<string, CatalogueJob>();
const MAX_JOBS_KEPT  = 10;

// Registres de demandes d'arrêt/annulation (nettoyés en fin de job)
const stopRegistry   = new Set<string>();                    // job_ids → arrêt total
const cancelRegistry = new Map<string, Set<number>>();       // job_id → catalogue_ids à sauter
const activeVecRegistry = new Map<string, number>();         // job_id → centralCgId en cours de vectorisation

function pruneOldJobs() {
  if (jobRegistry.size <= MAX_JOBS_KEPT) return;
  // Supprimer les jobs complétés les plus anciens
  const completed = [...jobRegistry.entries()]
    .filter(([, j]) => j.completed)
    .sort((a, b) => a[1].started_at.localeCompare(b[1].started_at));
  for (const [id] of completed.slice(0, jobRegistry.size - MAX_JOBS_KEPT)) {
    jobRegistry.delete(id);
  }
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export function getJobStatus(jobId: string): CatalogueJob | null {
  return jobRegistry.get(jobId) ?? null;
}

export function listRecentJobs(): CatalogueJob[] {
  return [...jobRegistry.values()]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, MAX_JOBS_KEPT);
}

/**
 * Demande l'arrêt total d'un job (toutes les entrées pending seront marquées 'cancelled').
 * L'entrée en cours de traitement finit normalement, puis le job s'arrête.
 */
export function requestStopJob(jobId: string): boolean {
  if (!jobRegistry.has(jobId)) return false;
  stopRegistry.add(jobId);
  // Propager l'arrêt à la vectorisation en cours (si présente)
  const activeCgId = activeVecRegistry.get(jobId);
  if (activeCgId !== undefined) {
    requestStopVectorization(activeCgId);
    console.log(`[CatalogueJob] Stop propagé à la vectorisation CG #${activeCgId}`);
  }
  return true;
}

/**
 * Demande l'annulation d'une seule entrée catalogue dans un job actif.
 * L'entrée sera sautée avant son traitement (si elle n'a pas encore démarré).
 */
export function requestCancelEntry(jobId: string, catalogueId: number): boolean {
  if (!jobRegistry.has(jobId)) return false;
  if (!cancelRegistry.has(jobId)) cancelRegistry.set(jobId, new Set());
  cancelRegistry.get(jobId)!.add(catalogueId);
  return true;
}

// ─── Lancement du job ─────────────────────────────────────────────────────────

/**
 * Lance un job d'ingestion pour une liste d'IDs catalogue.
 * Retourne immédiatement le job_id ; le traitement se fait en arrière-plan.
 *
 * @param options.delay_between_entries_ms Délai (ms) entre deux documents (1 000–30 000, défaut 3 000).
 *   Augmenter cette valeur pour réduire la charge sur la base de données lors de gros batchs.
 */
export async function launchSmartIngestion(
  catalogueIds: number[],
  options?: { delay_between_entries_ms?: number }
): Promise<string> {
  if (catalogueIds.length === 0) throw new Error('Aucun ID catalogue fourni');

  // Charger les entrées catalogue depuis la DB
  const placeholders = catalogueIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: entries } = await pool.query<{
    id: number;
    insurer_code: string;
    insurer_label: string;
    insurance_type_code: string;
    insurance_sub_type_code: string | null;
    type_label: string;
    doc_type: string;
    current_url: string | null;
    discovered_url: string | null;
    insurer_full_name: string;
    website_url: string | null;
  }>(
    `SELECT
       dc.id,
       dc.insurer_code,
       i.label  AS insurer_label,
       dc.insurance_type_code,
       dc.insurance_sub_type_code,
       it.label_fr AS type_label,
       dc.doc_type,
       dc.current_url,
       dc.discovered_url,
       i.full_name  AS insurer_full_name,
       i.website_url
     FROM document_catalogue dc
     JOIN insurers       i  ON i.code  = dc.insurer_code
     JOIN insurance_types it ON it.code = dc.insurance_type_code
     WHERE dc.id IN (${placeholders})`,
    catalogueIds
  );

  const jobId    = crypto.randomUUID();
  const now      = new Date().toISOString();
  const delayMs  = Math.min(Math.max(options?.delay_between_entries_ms ?? 3000, 1000), 30000);

  const statuses: EntryJobStatus[] = entries.map(e => ({
    catalogue_id:        e.id,
    insurer_code:        e.insurer_code,
    insurer_label:       e.insurer_label,
    insurance_type_code: e.insurance_type_code,
    type_label:          e.type_label,
    doc_type:            e.doc_type,
    step:                'pending',
    message:             'En attente',
    started_at:          now,
    found_url:           e.current_url ?? e.discovered_url ?? undefined,
  }));

  const job: CatalogueJob = {
    job_id:     jobId,
    started_at: now,
    total:      entries.length,
    done:       0,
    errors:     0,
    cancelled:  0,
    statuses,
    completed:  false,
    delay_ms:   delayMs,
  };

  jobRegistry.set(jobId, job);
  pruneOldJobs();

  // Traitement asynchrone
  runJob(job, entries, delayMs).catch(e => {
    console.error(`[CatalogueJob ${jobId}] Erreur critique:`, e.message);
    job.completed = true;
  });

  return jobId;
}

// ─── Traitement asynchrone du job ─────────────────────────────────────────────

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runJob(
  job: CatalogueJob,
  entries: {
    id: number;
    insurer_code: string;
    insurer_full_name: string;
    website_url: string | null;
    insurance_type_code: string;
    insurance_sub_type_code: string | null;
    type_label: string;
    doc_type: string;
    current_url: string | null;
    discovered_url: string | null;
  }[],
  delayMs: number
) {
  for (let i = 0; i < entries.length; i++) {
    const e   = entries[i];
    const ejs = job.statuses[i];

    // ── Vérifier arrêt total du job ────────────────────────────────────────────
    if (stopRegistry.has(job.job_id)) {
      const ts = new Date().toISOString();
      for (let j = i; j < job.statuses.length; j++) {
        if (!['done', 'error', 'cancelled'].includes(job.statuses[j].step)) {
          job.statuses[j].step         = 'cancelled';
          job.statuses[j].message      = 'Arrêt demandé par l’administrateur';
          job.statuses[j].completed_at = ts;
          job.cancelled++;
        }
      }
      break;
    }

    // ── Vérifier annulation unitaire ─────────────────────────────────────────────
    const cancelSet = cancelRegistry.get(job.job_id);
    if (cancelSet?.has(e.id)) {
      cancelSet.delete(e.id);
      ejs.step         = 'cancelled';
      ejs.message      = 'Annulé manuellement';
      ejs.completed_at = new Date().toISOString();
      job.cancelled++;
      continue;
    }

    ejs.step       = 'pending';
    ejs.message    = 'Démarrage…';

    // ── Étape 1 : trouver l'URL ────────────────────────────────────────────
    let targetUrl = e.current_url || e.discovered_url || null;

    if (!targetUrl) {
      ejs.step    = 'searching';
      ejs.message = 'Recherche de l\'URL avec Gemini + Google Search…';

      try {
        const searchRes = await smartSearchForDocument({
          insurer_code:         e.insurer_code,
          insurance_type_code:  e.insurance_type_code,
          insurer_full_name:    e.insurer_full_name,
          website_url:          e.website_url,
          insurance_type_label: e.type_label,
          doc_type:             e.doc_type,
        });

        if (searchRes.pdf_url || searchRes.page_url) {
          targetUrl      = searchRes.pdf_url || searchRes.page_url!;
          ejs.found_url  = targetUrl;
          ejs.message    = `URL trouvée via "${searchRes.strategy}" (confiance ${Math.round(searchRes.confidence * 100)}%) — ${searchRes.notes}`;

          // Mettre à jour discovered_url dans la DB
          await pool.query(
            `UPDATE document_catalogue SET discovered_url = $1, discovered_at = NOW(), matrix_status = 'discovered',
             notes = $2, updated_at = NOW() WHERE id = $3`,
            [targetUrl, `Stratégie: ${searchRes.strategy} | Confiance: ${Math.round(searchRes.confidence * 100)}% | ${searchRes.notes}`, e.id]
          );
        } else {
          const noFoundReason = searchRes.notes || 'Aucune stratégie n\'a trouvé de PDF';
          ejs.step         = 'error';
          ejs.message      = `Aucune URL trouvée. ${noFoundReason}. Renseignez-la manuellement.`;
          ejs.completed_at = new Date().toISOString();
          job.errors++;
          // Persister la raison en DB
          await pool.query(
            `UPDATE document_catalogue SET matrix_status = 'missing', notes = $1, updated_at = NOW() WHERE id = $2`,
            [ejs.message.slice(0, 500), e.id]
          ).catch(() => {});
          continue;
        }
      } catch (err: any) {
        ejs.step         = 'error';
        ejs.message      = `Erreur recherche : ${err.message}`;
        ejs.completed_at = new Date().toISOString();
        job.errors++;
        continue;
      }
    } else {
      ejs.found_url = targetUrl;
      ejs.message   = `URL existante : ${targetUrl.slice(0, 60)}…`;
    }

    // ── Étape 2 : ingestion (fetch + classify + vectorize) ─────────────────
    ejs.step    = 'fetching';
    ejs.message = 'Téléchargement du PDF…';

    try {
      const result = await ingestDocumentForCatalogue({
        catalogueId:            e.id,
        insurerCode:            e.insurer_code,
        insuranceTypeCode:      e.insurance_type_code,
        insuranceSubTypeCode:   e.insurance_sub_type_code,
        pdfUrl:                 targetUrl,
        onProgress:          (step, msg) => {
          ejs.step    = step as EntryStep;
          ejs.message = msg;
        },
        onCgIdCreated: (cgId: number) => {
          // Enregistrer le cgId actif pour pouvoir propager un stop pendant la vectorisation
          activeVecRegistry.set(job.job_id, cgId);
          // Si un stop a déjà été demandé, le propager immédiatement
          if (stopRegistry.has(job.job_id)) requestStopVectorization(cgId);
        },
      });
      activeVecRegistry.delete(job.job_id);

      if (result.success) {
        ejs.step          = 'done';
        ejs.message       = `Vectorisé — ${result.pages ?? 0} pages, ID central #${result.central_cg_id}`;
        ejs.central_cg_id = result.central_cg_id;
        ejs.pages_count   = result.pages;
        job.done++;

        // ── Mettre à jour indexedFormulas depuis les vrais labels de coverage_facts ──
        // Le CLASSIFIER voit parfois des en-têtes de prix (ex: "Montant T.T.C.") au lieu
        // des noms de formules. Les vrais labels sont extraits par le VECTORIZER depuis
        // les tableaux de garanties → on les lit et on met à jour metadata.indexedFormulas.
        if (result.central_cg_id) {
          try {
            const formulasRes = await pool.query<{ formula_label: string }>(
              `SELECT DISTINCT formula_label
               FROM coverage_facts
               WHERE central_cg_id = $1
                 AND formula_label IS NOT NULL
                 AND formula_label <> ''
               ORDER BY formula_label`,
              [result.central_cg_id]
            );
            const extractedFormulas = formulasRes.rows.map(r => r.formula_label);
            if (extractedFormulas.length > 0) {
              await pool.query(
                `UPDATE central_cg
                 SET metadata = jsonb_set(
                       jsonb_set(metadata, '{indexedFormulas}', $1::jsonb, true),
                       '{formula_hints}', $1::jsonb, true
                     ),
                     updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify(extractedFormulas), result.central_cg_id]
              );
              ejs.message += ` — ${extractedFormulas.length} formule(s): ${extractedFormulas.join(', ')}`;
              console.log(`[CatalogueJob] indexedFormulas mis à jour pour CG #${result.central_cg_id}: [${extractedFormulas.join(', ')}]`);
            }
          } catch (fErr: any) {
            console.warn(`[CatalogueJob] Impossible de mettre à jour indexedFormulas:`, fErr.message);
          }
        }

        // Persister le succès dans cg_ingestion_jobs
        await pool.query(
          `INSERT INTO cg_ingestion_jobs (run_id, insurer_code, insurance_type_code, source_url, status, pages_count, result_central_cg_id, completed_at)
           VALUES ($1, $2, $3, $4, 'done', $5, $6, NOW())
           ON CONFLICT DO NOTHING`,
          [job.job_id, e.insurer_code, e.insurance_type_code, targetUrl, result.pages ?? 0, result.central_cg_id ?? null]
        ).catch(() => {});
      } else {
        ejs.step    = 'error';
        ejs.message = result.error ?? 'Erreur inconnue';
        job.errors++;
        await pool.query(
          `INSERT INTO cg_ingestion_jobs (run_id, insurer_code, insurance_type_code, source_url, status, error_message, completed_at)
           VALUES ($1, $2, $3, $4, 'error', $5, NOW())
           ON CONFLICT DO NOTHING`,
          [job.job_id, e.insurer_code, e.insurance_type_code, targetUrl, (result.error ?? '').slice(0, 500)]
        ).catch(() => {});
      }
    } catch (err: any) {
      ejs.step    = 'error';
      ejs.message = `Erreur critique : ${err.message}`;
      job.errors++;

      // Marquer la DB en erreur
      try {
        await pool.query(
          `UPDATE document_catalogue SET matrix_status = 'error', notes = $1, updated_at = NOW() WHERE id = $2`,
          [err.message?.slice(0, 500), e.id]
        );
      } catch { /* silencieux */ }
    }

    ejs.completed_at = new Date().toISOString();

    // Délai séquenceur inter-documents (contrôle la charge DB/Gemini)
    if (i < entries.length - 1) await sleep(delayMs);
  }

  // Nettoyage des registres de contrôle
  stopRegistry.delete(job.job_id);
  cancelRegistry.delete(job.job_id);
  activeVecRegistry.delete(job.job_id);
  job.completed = true;
}
