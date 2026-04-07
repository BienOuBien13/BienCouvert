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

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntryStep =
  | 'pending'
  | 'searching'
  | 'fetching'
  | 'classifying'
  | 'vectorizing'
  | 'done'
  | 'error';

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
  statuses:   EntryJobStatus[];
  completed:  boolean;
}

// ─── Registre en mémoire (max 10 jobs conservés) ─────────────────────────────

const jobRegistry = new Map<string, CatalogueJob>();
const MAX_JOBS_KEPT = 10;

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

// ─── Lancement du job ─────────────────────────────────────────────────────────

/**
 * Lance un job d'ingestion pour une liste d'IDs catalogue.
 * Retourne immédiatement le job_id ; le traitement se fait en arrière-plan.
 */
export async function launchSmartIngestion(catalogueIds: number[]): Promise<string> {
  if (catalogueIds.length === 0) throw new Error('Aucun ID catalogue fourni');

  // Charger les entrées catalogue depuis la DB
  const placeholders = catalogueIds.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: entries } = await pool.query<{
    id: number;
    insurer_code: string;
    insurer_label: string;
    insurance_type_code: string;
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
    statuses,
    completed:  false,
  };

  jobRegistry.set(jobId, job);
  pruneOldJobs();

  // Traitement asynchrone
  runJob(job, entries).catch(e => {
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
    type_label: string;
    doc_type: string;
    current_url: string | null;
    discovered_url: string | null;
  }[]
) {
  for (let i = 0; i < entries.length; i++) {
    const e   = entries[i];
    const ejs = job.statuses[i];

    ejs.started_at = new Date().toISOString();
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
          ejs.message    = `URL trouvée (${searchRes.strategy}, confiance ${Math.round(searchRes.confidence * 100)}%)`;

          // Mettre à jour discovered_url dans la DB
          await pool.query(
            `UPDATE document_catalogue SET discovered_url = $1, discovered_at = NOW(), matrix_status = 'discovered', updated_at = NOW() WHERE id = $2`,
            [targetUrl, e.id]
          );
        } else {
          ejs.step         = 'error';
          ejs.message      = 'Aucune URL trouvée. Renseignez-la manuellement.';
          ejs.completed_at = new Date().toISOString();
          job.errors++;
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
        catalogueId:         e.id,
        insurerCode:         e.insurer_code,
        insuranceTypeCode:   e.insurance_type_code,
        pdfUrl:              targetUrl,
        onProgress:          (step, msg) => {
          ejs.step    = step as EntryStep;
          ejs.message = msg;
        },
      });

      if (result.success) {
        ejs.step          = 'done';
        ejs.message       = `Vectorisé — ${result.pages ?? 0} pages, ID central #${result.central_cg_id}`;
        ejs.central_cg_id = result.central_cg_id;
        ejs.pages_count   = result.pages;
        job.done++;
      } else {
        ejs.step    = 'error';
        ejs.message = result.error ?? 'Erreur inconnue';
        job.errors++;
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

    // Petit délai entre documents pour éviter le rate limiting
    if (i < entries.length - 1) await sleep(3000);
  }

  job.completed = true;
}
