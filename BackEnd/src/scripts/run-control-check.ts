#!/usr/bin/env ts-node
// src/scripts/run-control-check.ts
// Script de vérification de non-régression des coverage_facts extraits par ingestion PDF.
//
// Usage:
//   npx ts-node -e "require('dotenv').config({path:'.env.production'})" src/scripts/run-control-check.ts
//   npx ts-node -e "require('dotenv').config({path:'.env.production'})" src/scripts/run-control-check.ts -- --insurer MAAF01
//   npx ts-node -e "require('dotenv').config({path:'.env.production'})" src/scripts/run-control-check.ts -- --type AUT01
//   npx ts-node -e "require('dotenv').config({path:'.env.production'})" src/scripts/run-control-check.ts -- --insurer MAAF01 --type AUT01
//
// Utilisé par le workflow GitHub Actions "non-regression-coverage.yml".
// Sort avec exit code 1 si des contrôles échouent ou ne sont pas trouvés.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { runControlCheck, ControlCheckReport } from '../services/controlCheckService';

// ─────────────────────────────────────────────────────────────────────────────
// Parsing des arguments CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { insurer_code?: string; insurance_type_code?: string } {
  const args = process.argv.slice(2);
  const result: { insurer_code?: string; insurance_type_code?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--insurer' || args[i] === '-i') && args[i + 1]) {
      result.insurer_code = args[++i];
    } else if ((args[i] === '--type' || args[i] === '-t') && args[i + 1]) {
      result.insurance_type_code = args[++i];
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Affichage du rapport
// ─────────────────────────────────────────────────────────────────────────────

function printReport(report: ControlCheckReport): void {
  const SEP = '─'.repeat(80);
  console.log(`\n${SEP}`);
  console.log(`  RAPPORT DE NON-RÉGRESSION — COVERAGE FACTS`);
  console.log(`  Run at : ${report.run_at}`);
  if (report.filters.insurer_code) console.log(`  Filtre assureur     : ${report.filters.insurer_code}`);
  if (report.filters.insurance_type_code) console.log(`  Filtre type         : ${report.filters.insurance_type_code}`);
  console.log(SEP);
  console.log(`  Total contrôles : ${report.total}`);
  console.log(`  ✅ Passed       : ${report.passed}`);
  console.log(`  ❌ Failed       : ${report.failed}`);
  console.log(`  ⚠️  Not found   : ${report.not_found}`);
  console.log(`  Taux de succès  : ${report.success_rate}`);
  console.log(SEP);

  if (report.failures.length > 0) {
    console.log('\n  DÉTAIL DES ÉCHECS :\n');
    for (const f of report.failures) {
      const icon = f.result === 'not_found' ? '⚠️ ' : '❌';
      console.log(`  ${icon} [${f.insurer_code} / ${f.insurance_type_code}]`);
      console.log(`     Formule  : ${f.formula_label} (${f.formula_key})`);
      console.log(`     Garantie : ${f.guarantee_label} (${f.guarantee_key})`);
      console.log(`     Attendu  : ${f.expected_status}${f.expected_amount_pattern ? ` (pattern montant: ${f.expected_amount_pattern})` : ''}`);
      console.log(`     Obtenu   : ${f.actual_status ?? '—'} ${f.actual_amount ? `/ ${f.actual_amount}` : ''}`);
      if (f.source_doc_hint) console.log(`     Source   : ${f.source_doc_hint}`);
      if (f.error) console.log(`     Erreur   : ${f.error}`);
      console.log('');
    }
  } else if (report.total > 0) {
    console.log('\n  ✅ Tous les contrôles sont passés.\n');
  }

  console.log(SEP + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Export JSON (pour artefact CI)
// ─────────────────────────────────────────────────────────────────────────────

function saveJsonReport(report: ControlCheckReport): void {
  const outputDir = path.resolve(__dirname, '..', '..', 'reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filename = `control-check-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  Rapport JSON exporté : ${outputPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const filters = parseArgs();

  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error('❌ Variables d\'environnement DB manquantes (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)');
    console.error('   Assurez-vous que .env.production est chargé ou que les variables sont définies.');
    process.exit(2);
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('\n  Connexion à la base de données...');
    const report = await runControlCheck(pool, filters);

    printReport(report);

    // Sauvegarde JSON pour les artefacts CI
    saveJsonReport(report);

    const hasFailures = report.failed > 0 || report.not_found > 0;

    if (hasFailures) {
      console.error(`\n  ❌ ${report.failed + report.not_found} contrôle(s) en échec — exit code 1\n`);
      process.exit(1);
    } else if (report.total === 0) {
      console.warn('\n  ⚠️  Aucun contrôle trouvé pour les filtres donnés.\n');
      process.exit(0);
    } else {
      console.log(`\n  ✅ Tous les contrôles sont passés (${report.passed}/${report.total})\n`);
      process.exit(0);
    }
  } catch (err) {
    console.error('\n  ❌ Erreur inattendue lors du run de non-régression :');
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

main();
