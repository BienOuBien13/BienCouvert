/**
 * VersionTrackerAgent — Découverte et vérification de versions documentaires
 *
 * Responsabilités :
 *   - Découvrir les URLs de nouveaux documents (réutilise la logique HUNTER)
 *   - Vérifier si un document indexé a changé (SHA-256)
 *   - Mettre à jour document_catalogue avec les résultats
 */

import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import pool from '../db';
import { updateEntryStatus } from './CatalogueAgent';
import type { CatalogueEntry, DiscoveryResult, CheckResult } from './types';

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

function fetchBuffer(url: string): Promise<{ buffer: Buffer; sha256: string } | null> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      { timeout: 30000, headers: { 'User-Agent': 'AssurClair-Catalogue-Bot/1.0 (contact@assurclair.fr)' } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          req.destroy();
          if (location) return resolve(fetchBuffer(location));
          return resolve(null);
        }
        if (res.statusCode !== 200) { req.destroy(); return resolve(null); }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
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

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      { timeout: 15000, headers: { 'User-Agent': 'AssurClair-Catalogue-Bot/1.0 (contact@assurclair.fr)' } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) return resolve(fetchHtml(location));
        }
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Découverte d'URL pour une entrée catalogue ──────────────────────────────

/**
 * Tente de trouver un PDF pour une entrée catalogue donnée.
 * Utilise les seed URLs et le site web de l'assureur.
 */
export async function discoverForEntry(entry: CatalogueEntry): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    catalogue_id: entry.id,
    insurer_code: entry.insurer_code,
    insurance_type_code: entry.insurance_type_code,
    found_url: null,
    found_sha256: null,
    is_new_version: false,
    status: 'error',
    message: '',
  };

  try {
    // Charger l'assureur pour obtenir le website_url et patterns
    const insurerRes = await pool.query(
      `SELECT website_url, cg_search_patterns FROM insurers WHERE code = $1`,
      [entry.insurer_code]
    );
    const insurer = insurerRes.rows[0];
    if (!insurer?.website_url) {
      result.message = 'Assureur sans website_url';
      return result;
    }

    const patterns = insurer.cg_search_patterns ?? {};
    const explicitUrls: string[] = patterns.cg_page_urls ?? [];

    // Chercher des PDFs sur les pages connues
    const candidates: string[] = [];

    for (const pageUrl of explicitUrls.slice(0, 10)) {
      if (pageUrl.toLowerCase().endsWith('.pdf')) {
        candidates.push(pageUrl);
        continue;
      }
      try {
        const html = await fetchHtml(pageUrl);
        const linkRegex = /href=["']([^"']+\.pdf[^"']*?)["']/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          try {
            candidates.push(new URL(match[1], pageUrl).toString());
          } catch { /* URL invalide */ }
        }
      } catch { /* page inaccessible */ }
    }

    // Fallback: chercher sur les pages de documents courantes
    if (candidates.length === 0) {
      const base = new URL(insurer.website_url);
      const origin = `${base.protocol}//${base.host}`;
      const commonPaths = [
        '/aide/documents-contractuels.html',
        '/documents-contractuels',
        '/conditions-generales',
        '/telechargements',
      ];
      for (const path of commonPaths) {
        try {
          const html = await fetchHtml(`${origin}${path}`);
          const linkRegex = /href=["']([^"']+\.pdf[^"']*?)["']/gi;
          let match;
          while ((match = linkRegex.exec(html)) !== null) {
            try { candidates.push(new URL(match[1], `${origin}${path}`).toString()); } catch {}
          }
          if (candidates.length > 0) break;
        } catch { /* page absente */ }
      }
    }

    if (candidates.length === 0) {
      result.message = 'Aucun PDF trouvé';
      await updateEntryStatus(entry.id, 'missing', {
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + entry.check_frequency_days * 86400000).toISOString(),
      } as any);
      return result;
    }

    // Prendre le premier candidat et vérifier le SHA-256
    const pdfUrl = candidates[0];
    const fetched = await fetchBuffer(pdfUrl);
    if (!fetched) {
      result.message = `PDF inaccessible: ${pdfUrl}`;
      return result;
    }

    result.found_url = pdfUrl;
    result.found_sha256 = fetched.sha256;

    // Comparer avec le SHA-256 actuel
    if (entry.current_sha256 && entry.current_sha256 === fetched.sha256) {
      result.status = 'unchanged';
      result.is_new_version = false;
      result.message = 'Document identique (même SHA-256)';
      await updateEntryStatus(entry.id, entry.matrix_status as any, {
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + entry.check_frequency_days * 86400000).toISOString(),
      } as any);
    } else {
      result.status = 'discovered';
      result.is_new_version = true;
      result.message = entry.current_sha256
        ? 'Nouvelle version détectée (SHA-256 différent)'
        : 'Document trouvé pour la première fois';
      await updateEntryStatus(entry.id, 'discovered', {
        discovered_url: pdfUrl,
        discovered_sha256: fetched.sha256,
        discovered_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + entry.check_frequency_days * 86400000).toISOString(),
      } as any);
    }

    return result;
  } catch (e: any) {
    result.message = `Erreur: ${e.message}`;
    await updateEntryStatus(entry.id, 'error', {
      last_checked_at: new Date().toISOString(),
      notes: `Erreur discover: ${e.message}`,
    } as any);
    return result;
  }
}

// ─── Vérification d'un document déjà indexé ──────────────────────────────────

/**
 * Vérifie si un document déjà indexé a changé en re-téléchargeant et comparant le SHA-256.
 */
export async function checkForUpdate(entry: CatalogueEntry): Promise<CheckResult> {
  const result: CheckResult = {
    catalogue_id: entry.id,
    insurer_code: entry.insurer_code,
    insurance_type_code: entry.insurance_type_code,
    previous_sha256: entry.current_sha256,
    current_sha256: null,
    changed: false,
    status: 'error',
    message: '',
  };

  if (!entry.current_url) {
    result.status = 'error';
    result.message = 'Pas d\'URL à vérifier';
    return result;
  }

  try {
    const fetched = await fetchBuffer(entry.current_url);
    if (!fetched) {
      result.status = 'unreachable';
      result.message = `URL inaccessible: ${entry.current_url}`;
      await updateEntryStatus(entry.id, 'error', {
        last_checked_at: new Date().toISOString(),
        notes: `URL inaccessible lors du check`,
      } as any);
      return result;
    }

    result.current_sha256 = fetched.sha256;

    if (entry.current_sha256 === fetched.sha256) {
      result.changed = false;
      result.status = 'up_to_date';
      result.message = 'Document inchangé';
      await updateEntryStatus(entry.id, 'indexed', {
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + entry.check_frequency_days * 86400000).toISOString(),
      } as any);
    } else {
      result.changed = true;
      result.status = 'outdated';
      result.message = 'Document modifié — nouvelle version disponible';
      await updateEntryStatus(entry.id, 'outdated', {
        discovered_url: entry.current_url,
        discovered_sha256: fetched.sha256,
        discovered_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + entry.check_frequency_days * 86400000).toISOString(),
      } as any);
    }

    return result;
  } catch (e: any) {
    result.message = `Erreur: ${e.message}`;
    return result;
  }
}

// ─── Batch discovery sur les entrées "unknown" ou "missing" ──────────────────

export async function discoverBatch(limit: number = 20): Promise<DiscoveryResult[]> {
  const entries = await pool.query<CatalogueEntry>(
    `SELECT * FROM document_catalogue
     WHERE matrix_status IN ('unknown', 'missing')
     ORDER BY next_check_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );

  const results: DiscoveryResult[] = [];
  for (const entry of entries.rows) {
    const r = await discoverForEntry(entry);
    results.push(r);
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return results;
}

// ─── Batch check sur les entrées "indexed" échues ────────────────────────────

export async function checkBatch(limit: number = 20): Promise<CheckResult[]> {
  const entries = await pool.query<CatalogueEntry>(
    `SELECT * FROM document_catalogue
     WHERE matrix_status = 'indexed'
       AND next_check_at <= NOW()
       AND current_url IS NOT NULL
     ORDER BY next_check_at ASC
     LIMIT $1`,
    [limit]
  );

  const results: CheckResult[] = [];
  for (const entry of entries.rows) {
    const r = await checkForUpdate(entry);
    results.push(r);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return results;
}
