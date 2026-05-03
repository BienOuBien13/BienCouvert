/**
 * Types partagés pour le module Catalogue documentaire
 */

// ─── Statuts de la matrice ────────────────────────────────────────────────────

export type MatrixStatus = 'indexed' | 'missing' | 'outdated' | 'discovered' | 'error' | 'unknown';
export type DocType = 'CG' | 'IPID' | 'notice' | 'tableau_garanties';

// ─── Entrée catalogue (table document_catalogue) ──────────────────────────────

export interface CatalogueEntry {
  id: number;
  insurer_code: string;
  insurance_type_code: string;
  doc_type: DocType;
  matrix_status: MatrixStatus;

  // Document indexé
  central_cg_id: number | null;
  current_url: string | null;
  current_version: string | null;
  current_sha256: string | null;
  indexed_at: string | null;

  // Dernière découverte
  discovered_url: string | null;
  discovered_version: string | null;
  discovered_sha256: string | null;
  discovered_at: string | null;

  // Planification
  last_checked_at: string | null;
  next_check_at: string | null;
  check_frequency_days: number;

  // Métadonnées
  classifier_result: any;
  formula_hints: string[] | null;
  auto_ingest: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Résultats du CatalogueAgent ──────────────────────────────────────────────

export interface MatrixCell {
  id: number;
  insurer_code: string;
  insurer_label: string;
  insurance_type_code: string;
  insurance_type_label: string;
  insurance_sub_type_code: string | null;
  doc_type: DocType;
  matrix_status: MatrixStatus;
  central_cg_id: number | null;
  current_url: string | null;
  indexed_at: string | null;
  last_checked_at: string | null;
}

export interface MatrixStats {
  total: number;
  indexed: number;
  missing: number;
  outdated: number;
  discovered: number;
  error: number;
  unknown: number;
  coverage_percent: number;
}

export interface MatrixResult {
  cells: MatrixCell[];
  stats: MatrixStats;
  insurers: { code: string; label: string }[];
  insurance_types: { code: string; label: string }[];
}

// ─── Résultats du VersionTrackerAgent ─────────────────────────────────────────

export interface DiscoveryResult {
  catalogue_id: number;
  insurer_code: string;
  insurance_type_code: string;
  found_url: string | null;
  found_sha256: string | null;
  is_new_version: boolean;
  status: 'discovered' | 'unchanged' | 'error';
  message: string;
}

export interface CheckResult {
  catalogue_id: number;
  insurer_code: string;
  insurance_type_code: string;
  previous_sha256: string | null;
  current_sha256: string | null;
  changed: boolean;
  status: 'up_to_date' | 'outdated' | 'error' | 'unreachable';
  message: string;
}
