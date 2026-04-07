/**
 * WatchdogScheduler — Planification des vérifications automatiques du catalogue
 *
 * Utilise setInterval (pas de dépendance externe type node-cron).
 * Déclenché au démarrage du serveur via startWatchdog().
 *
 * Tâches planifiées :
 *   - Toutes les 6h : vérifier les documents indexés dont next_check_at est dépassé
 *   - Toutes les 12h : découvrir des documents pour les entrées unknown/missing
 *   - Au démarrage : synchroniser la matrice (nouvelles combinaisons)
 */

import { syncMatrix, getEntriesDueForCheck } from './CatalogueAgent';
import { discoverBatch, checkBatch } from './VersionTrackerAgent';
import { sendEmail } from '../services/emailService';

let checkInterval: ReturnType<typeof setInterval> | null = null;
let discoveryInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

const SIX_HOURS = 6 * 60 * 60 * 1000;
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

// ─── Tâche de vérification (documents indexés) ───────────────────────────────

async function runCheckTask(): Promise<void> {
  if (running) return;
  running = true;
  try {
    console.log('[WatchdogScheduler] Vérification des documents indexés...');
    const results = await checkBatch(30);
    const outdated = results.filter(r => r.changed);
    console.log(`[WatchdogScheduler] Check terminé — ${results.length} vérifiés, ${outdated.length} obsolètes`);

    if (outdated.length > 0) {
      await notifyOutdated(outdated.map(r => `${r.insurer_code}/${r.insurance_type_code}`));
    }
  } catch (e: any) {
    console.error('[WatchdogScheduler] Erreur check:', e.message);
  } finally {
    running = false;
  }
}

// ─── Tâche de découverte (entrées sans document) ─────────────────────────────

async function runDiscoveryTask(): Promise<void> {
  if (running) return;
  running = true;
  try {
    console.log('[WatchdogScheduler] Découverte de nouveaux documents...');
    const results = await discoverBatch(15);
    const discovered = results.filter(r => r.status === 'discovered');
    console.log(`[WatchdogScheduler] Découverte terminée — ${results.length} scannés, ${discovered.length} trouvés`);

    if (discovered.length > 0) {
      await notifyDiscovered(discovered.map(r => `${r.insurer_code}/${r.insurance_type_code}: ${r.found_url}`));
    }
  } catch (e: any) {
    console.error('[WatchdogScheduler] Erreur discover:', e.message);
  } finally {
    running = false;
  }
}

// ─── Notifications par email ─────────────────────────────────────────────────

async function notifyOutdated(entries: string[]): Promise<void> {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    await sendEmail({
      to: adminEmail,
      subject: `[AssurClair] ${entries.length} document(s) obsolète(s) détecté(s)`,
      text: `Les documents suivants ont changé depuis la dernière indexation :\n\n${entries.join('\n')}\n\nConnectez-vous à l'admin pour mettre à jour.`,
      html: `<h3>Documents obsolètes détectés</h3>
<ul>${entries.map(e => `<li>${e}</li>`).join('')}</ul>
<p>Connectez-vous à l'interface admin pour lancer une ré-indexation.</p>`,
    });
  } catch (e: any) {
    console.error('[WatchdogScheduler] Erreur envoi email:', e.message);
  }
}

async function notifyDiscovered(entries: string[]): Promise<void> {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    await sendEmail({
      to: adminEmail,
      subject: `[AssurClair] ${entries.length} nouveau(x) document(s) découvert(s)`,
      text: `Nouveaux documents trouvés :\n\n${entries.join('\n')}\n\nConnectez-vous à l'admin pour lancer l'ingestion.`,
      html: `<h3>Nouveaux documents découverts</h3>
<ul>${entries.map(e => `<li>${e}</li>`).join('')}</ul>
<p>Connectez-vous à l'interface admin pour lancer l'ingestion.</p>`,
    });
  } catch (e: any) {
    console.error('[WatchdogScheduler] Erreur envoi email:', e.message);
  }
}

// ─── Démarrage / Arrêt ───────────────────────────────────────────────────────

export async function startWatchdog(): Promise<void> {
  console.log('[WatchdogScheduler] Démarrage du watchdog catalogue');

  // Sync matrice au démarrage
  try {
    const added = await syncMatrix();
    if (added > 0) console.log(`[WatchdogScheduler] ${added} nouvelles combinaisons dans la matrice`);
  } catch (e: any) {
    console.error('[WatchdogScheduler] Erreur sync matrice:', e.message);
  }

  // Planifier les tâches
  checkInterval = setInterval(runCheckTask, SIX_HOURS);
  discoveryInterval = setInterval(runDiscoveryTask, TWELVE_HOURS);

  console.log('[WatchdogScheduler] Tâches planifiées — check: 6h, discovery: 12h');
}

export function stopWatchdog(): void {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
  if (discoveryInterval) { clearInterval(discoveryInterval); discoveryInterval = null; }
  console.log('[WatchdogScheduler] Watchdog arrêté');
}

export function isWatchdogRunning(): boolean {
  return checkInterval !== null || discoveryInterval !== null;
}
