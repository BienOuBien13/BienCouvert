#!/usr/bin/env node
// =============================================================================
// scripts/sync-mobile.js
// Synchronise les fichiers partagés FrontEnd → BienCouvert (React Native / Expo)
//
// Usage:
//   node scripts/sync-mobile.js            → sync complète
//   node scripts/sync-mobile.js --dry-run  → affiche ce qui serait copié sans écrire
//   node scripts/sync-mobile.js --types    → sync uniquement les types
//   node scripts/sync-mobile.js --services → sync uniquement les services
// =============================================================================

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_TYPES = process.argv.includes('--types');
const ONLY_SERVICES = process.argv.includes('--services');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'FrontEnd');
const MOBILE = path.join(ROOT, 'BienCouvert');

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

let syncCount = 0;
let skipCount = 0;

// =============================================================================
// Règles de synchronisation
// Chaque règle définit :
//   - source: fichier FrontEnd à lire
//   - dest: fichier BienCouvert à écrire
//   - transform (optionnel): fonction de transformation du contenu
// =============================================================================

const SYNC_RULES = [
  // ── TYPES ──────────────────────────────────────────────────────────────────
  {
    group: 'types',
    source: 'types.ts',
    dest: 'types/index.ts',
    transform: (content) => {
      // Ajouter un header de désambiguïsation
      const header = `// =============================================================================
// TYPES PARTAGÉS — BienCouvert (React Native)
// Auto-synchronisé depuis FrontEnd/types.ts via scripts/sync-mobile.js
// NE PAS MODIFIER MANUELLEMENT
// Synchronisé le : ${new Date().toISOString()}
// =============================================================================\n\n`;
      // Supprimer les imports qui n'existent pas en RN
      let result = content
        .replace(/^import\s+.*from\s+['"]lucide-react['"]\s*;?\s*\n/gm, '')
        .replace(/^import\s+.*from\s+['"]react-dom['"]\s*;?\s*\n/gm, '');
      return header + result;
    },
  },

  // ── UTILS ──────────────────────────────────────────────────────────────────
  {
    group: 'utils',
    source: 'utils/uuid.ts',
    dest: 'utils/uuid.ts',
    transform: null, // Identique, pas de transformation
  },

  // ── SERVICES ───────────────────────────────────────────────────────────────
  // masterDataService : adapter les URL env vars (import.meta.env → process.env)
  {
    group: 'services',
    source: 'services/masterDataService.ts',
    dest: 'services/masterDataService.ts',
    transform: transformServiceForRN,
    mergeComment: '// Adapté automatiquement pour React Native',
  },
];

// =============================================================================
// Transformation générique : convertit le code web en code React Native
// =============================================================================
function transformServiceForRN(content) {
  return content
    // import.meta.env.VITE_* → process.env.EXPO_PUBLIC_*
    .replace(/import\.meta\.env\.VITE_API_URL/g, "process.env.EXPO_PUBLIC_API_URL")
    .replace(/import\.meta\.env\.VITE_API_BASE_URL/g, "process.env.EXPO_PUBLIC_API_URL")
    .replace(/import\.meta\.env\.VITE_(\w+)/g, "process.env.EXPO_PUBLIC_$1")
    // localStorage → AsyncStorage (marqueur pour révision manuelle)
    .replace(/localStorage\.getItem\(/g, '/* AsyncStorage */ SecureStore.getItemAsync(')
    .replace(/localStorage\.setItem\(/g, '/* AsyncStorage */ SecureStore.setItemAsync(')
    .replace(/localStorage\.removeItem\(/g, '/* AsyncStorage */ SecureStore.deleteItemAsync(')
    // window.* → commentaires
    .replace(/window\.location\.\w+/g, '/* window.location non disponible en RN */')
    .replace(/window\.history\./g, '/* window.history non disponible en RN */')
    // Lucide icons → commentaire
    .replace(/from 'lucide-react'/g, "/* lucide-react non disponible, utiliser @expo/vector-icons */")
    .replace(/from \"lucide-react\"/g, "/* lucide-react non disponible, utiliser @expo/vector-icons */")
    // className → commentaire
    .replace(/className=/g, '{/* className → utiliser style= en RN */}style=');
}

// =============================================================================
// Utilitaires
// =============================================================================
function log(symbol, color, msg) {
  console.log(`${color}${symbol}${RESET} ${msg}`);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log('📁', CYAN, `Dossier créé : ${path.relative(ROOT, dir)}`);
  }
}

function syncFile(rule) {
  const srcPath = path.join(FRONTEND, rule.source);
  const destPath = path.join(MOBILE, rule.dest);

  if (!fs.existsSync(srcPath)) {
    log('⚠️ ', YELLOW, `Source introuvable : ${rule.source}`);
    return false;
  }

  let content = fs.readFileSync(srcPath, 'utf-8');

  // Appliquer la transformation si définie
  if (rule.transform) {
    content = rule.transform(content);
  }

  // Comparer avec le fichier existant pour ne pas réécrire inutilement
  if (fs.existsSync(destPath)) {
    const existing = fs.readFileSync(destPath, 'utf-8');
    const existingWithoutHeader = stripSyncHeader(existing);
    const newWithoutHeader = stripSyncHeader(content);
    if (existingWithoutHeader === newWithoutHeader) {
      log('─', YELLOW, `Unchanged : ${rule.dest}`);
      skipCount++;
      return false;
    }
  }

  if (DRY_RUN) {
    log('🔍', CYAN, `[DRY-RUN] Would sync : ${rule.source} → ${rule.dest}`);
    return true;
  }

  ensureDir(destPath);
  fs.writeFileSync(destPath, content, 'utf-8');
  log('✅', GREEN, `Synced : ${rule.source} → ${rule.dest}`);
  syncCount++;
  return true;
}

function stripSyncHeader(content) {
  // Ignorer les lignes de header de synchronisation pour la comparaison
  return content.replace(/\/\/ Synchronisé le : .+\n/, '// Synchronisé le : <date>\n');
}

// =============================================================================
// Point d'entrée
// =============================================================================
function main() {
  console.log(`\n${BOLD}${CYAN}🔄  Sync FrontEnd → BienCouvert (Expo)${RESET}`);
  if (DRY_RUN) console.log(`${YELLOW}Mode DRY-RUN activé — aucun fichier ne sera écrit${RESET}\n`);

  const rules = SYNC_RULES.filter(r => {
    if (ONLY_TYPES) return r.group === 'types';
    if (ONLY_SERVICES) return r.group === 'services';
    return true;
  });

  let changed = false;
  for (const rule of rules) {
    const result = syncFile(rule);
    if (result) changed = true;
  }

  // Mise à jour du versionCode si les types ont changé
  if (!DRY_RUN && changed && !ONLY_SERVICES) {
    updateMobileVersion();
  }

  console.log(`\n${BOLD}Résultat : ${GREEN}${syncCount} fichier(s) synchronisé(s)${RESET}, ${YELLOW}${skipCount} inchangé(s)${RESET}`);

  if (changed && !DRY_RUN) {
    console.log(`\n${YELLOW}⚠️  N'oubliez pas de vérifier les composants adaptés manuellement dans BienCouvert/components/${RESET}`);
    console.log(`${CYAN}   → Certaines transformations (AsyncStorage, icons) nécessitent une revue manuelle.${RESET}\n`);
  }
}

/**
 * Incrémente automatiquement le versionCode Android dans app.json
 * si des fichiers essentiels (types, services) ont été modifiés.
 */
function updateMobileVersion() {
  const appJsonPath = path.join(MOBILE, 'app.json');
  if (!fs.existsSync(appJsonPath)) return;

  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    if (appJson?.expo?.android?.versionCode != null) {
      const oldCode = appJson.expo.android.versionCode;
      // Ne pas auto-incrémenter — juste signaler
      log('ℹ️ ', CYAN, `versionCode actuel : ${oldCode} (incrémenter manuellement avant release)`);
    }
  } catch {
    // Ignore
  }
}

main();
