#!/usr/bin/env node
/**
 * scrape-to-pdf.mjs — Scrape une ou plusieurs pages web → PDF structuré
 *
 * Génère un PDF à partir d'une ou plusieurs pages web.
 * Chaque page scrappée inclut l'URL en en-tête, la structure web est
 * préservée via le moteur de rendu Chrome (puppeteer).
 *
 * Usage:
 *   node scrape-to-pdf.mjs \
 *     --insurer-code ABA01 \
 *     --insurance-type AUT01 \
 *     [--sub-type auto_pro] \
 *     --output-name "abeille-auto-garanties" \
 *     --urls "https://..." "https://..." \
 *     [--output-dir /opt/assurclair/scraped-cg]
 *
 * Répertoire de sortie par défaut :
 *   VM  → /opt/assurclair/scraped-cg/
 *   Dev → ./scripts/web-scraper/output/
 */

import puppeteer      from 'puppeteer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import path           from 'path';
import fs             from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  const urls = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--urls') {
      i++;
      while (i < argv.length && !argv[i].startsWith('--')) {
        urls.push(argv[i]);
        i++;
      }
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = argv[i + 1] ?? '';
      i += 2;
    } else {
      i++;
    }
  }
  args.urls = urls;
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ── Validation ────────────────────────────────────────────────────────────────

const required = ['insurerCode', 'insuranceType', 'outputName'];
for (const field of required) {
  if (!args[field]) {
    const flag = '--' + field.replace(/([A-Z])/g, '-$1').toLowerCase();
    console.error(`❌ Argument manquant : ${flag}`);
    console.error(`
Usage:
  node scrape-to-pdf.mjs \\
    --insurer-code  ABA01            (code assureur) \\
    --insurance-type AUT01           (code type d'assurance) \\
    [--sub-type auto_pro]            (sous-type optionnel) \\
    --output-name "abeille-auto"     (nom du PDF sans extension) \\
    --urls "https://..." "https://..." \\
    [--output-dir /opt/assurclair/scraped-cg] \\
    [--timeout 30000]                (timeout par page en ms)
`);
    process.exit(1);
  }
}

if (!args.urls || args.urls.length === 0) {
  console.error('❌ Au moins une URL est requise (--urls "https://...")');
  process.exit(1);
}

// ── Configuration ─────────────────────────────────────────────────────────────

const insurerCode   = args.insurerCode.toUpperCase();
const insuranceType = args.insuranceType.toUpperCase();
const subType       = args.subType ?? null;
const outputName    = args.outputName.replace(/\.pdf$/i, '');
const urls          = args.urls;
const timeout       = parseInt(args.timeout ?? '30000', 10);

// Répertoire de sortie : VM ou développement local
const isVM           = fs.existsSync('/opt/assurclair');
const defaultOutDir  = isVM
  ? '/opt/assurclair/scraped-cg'
  : path.join(__dirname, 'output');
const outputDir      = args.outputDir || defaultOutDir;
const outputPath     = path.join(outputDir, `${outputName}.pdf`);

fs.mkdirSync(outputDir, { recursive: true });

const scrapedAt = new Date().toISOString();
const meta = { insurerCode, insuranceType, subType, scrapedAt, urls };

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           AssurClair — Web Scraper → PDF                 ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  Assureur      : ${insurerCode}`);
console.log(`  Type          : ${insuranceType}`);
if (subType) console.log(`  Sous-type     : ${subType}`);
console.log(`  URL(s)        : ${urls.length}`);
urls.forEach((u, i) => console.log(`    ${i + 1}. ${u}`));
console.log(`  Sortie        : ${outputPath}`);
console.log('');
// ── Évasion détection bot : script injecté avant tout code de la page ────────────────────
// Reproduit les propriétés d'un vrai navigateur Chrome pour tromper les détecteurs
// (fingerprintjs, Cloudflare Challenge, PerimeterX, DataDome, etc.)
const BOT_EVASION_SCRIPT = `
  // 1. Masquer webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // 2. Simuler des plugins Chrome réels
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }];
      arr.__proto__ = PluginArray.prototype;
      return arr;
    }
  });

  // 3. Langues réalistes
  Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] });

  // 4. Masquer les traces Headless
  window.chrome = {
    runtime: {},
    loadTimes: function() {},
    csi: function() {},
    app: {}
  };

  // 5. isHeadless = false
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 });

  // 6. Permissions API (les vrais Chrome retournent 'prompt', pas 'denied')
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);

  // 7. Masquer automation dans le user-agent
  Object.defineProperty(navigator, 'userAgent', {
    get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });
`;

// ── Sélecteurs CSS de consentement cookies ────────────────────────────────────────────
const COOKIE_BUTTON_SELECTORS = [
  // Textes français / anglais
  'button[id*="accept"]',
  'button[id*="accepter"]',
  'button[id*="agree"]',
  'button[id*="consent"]',
  'button[class*="accept"]',
  'button[class*="accepter"]',
  'button[class*="consent"]',
  'button[class*="agree"]',
  '[data-testid*="accept"]',
  '[data-cy*="accept"]',
  // Axeptio / Didomi / OneTrust / TrustArc / Cookiebot (solutions FR courantes)
  '#axeptio_btn_acceptAll',
  '.axeptio_btn--accept',
  '#didomi-notice-agree-button',
  '.didomi-continue-without-agreeing',
  '#onetrust-accept-btn-handler',
  '.onetrust-accept-btn-handler',
  '#truste-consent-button',
  'button.cc-accept',
  '.cc-btn.cc-allow',
  '#cookiescript_accept',
  '#cookiescript_acceptall',
  '.cookie-consent-accept',
  '[aria-label*="Accept"]',
  '[aria-label*="Accepter"]',
  '[aria-label*="Tout accepter"]',
  // Boutons génériques avec texte
  'button::-p-text(Accepter)',
  'button::-p-text(Tout accepter)',
  'button::-p-text(Accept all)',
  'button::-p-text(I agree)',
  'button::-p-text(J\'accepte)',
];

// ── Fermer les popups par clic sur boutons de fermeture ───────────────────────────
const POPUP_CLOSE_SELECTORS = [
  'button[aria-label*="close" i]',
  'button[aria-label*="fermer" i]',
  'button[class*="close" i]:not([class*="disclose"])',
  '[class*="modal"] button[class*="close" i]',
  '[class*="popup"] button[class*="close" i]',
  '[data-dismiss="modal"]',
  '.modal .btn-close',
  '.popup .close',
  'button.close',
];

/**
 * Tente d'accepter le bandeau de cookies en cliquant sur le bouton adéquat.
 * Retourne true si un bouton a été cliqué.
 */
async function acceptCookies(page) {
  for (const sel of COOKIE_BUTTON_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible();
        if (visible) {
          await el.click({ delay: 50 });
          await new Promise(r => setTimeout(r, 600));
          console.log(`   🍪 Cookies acceptés via : ${sel}`);
          return true;
        }
      }
    } catch { /* sélecteur invalide ou élément disparu */ }
  }

  // Fallback : chercher par texte visible dans les boutons
  try {
    const clicked = await page.evaluate(() => {
      const keywords = [
        'tout accepter', 'accepter tout', 'accepter', 'tout acc',
        'accept all', 'accept cookies', 'i agree', 'j\'accepte',
        'okay', 'ok', 'got it', "j'ai compris", "je comprends",
      ];
      for (const el of document.querySelectorAll('button, a[role="button"], [class*="cookie"] a')) {
        const txt = el.textContent.trim().toLowerCase();
        if (keywords.some(k => txt.includes(k))) {
          el.click();
          return txt;
        }
      }
      return null;
    });
    if (clicked) {
      await new Promise(r => setTimeout(r, 600));
      console.log(`   🍪 Cookies acceptés (fallback texte) : "${clicked}"`);
      return true;
    }
  } catch { /* */ }

  return false;
}

/**
 * Ferme les popups/modales parasites (chat, newsletter, promotions…)
 */
async function closePopups(page) {
  let closed = 0;
  for (const sel of POPUP_CLOSE_SELECTORS) {
    try {
      const els = await page.$$(sel);
      for (const el of els) {
        if (await el.isVisible()) {
          await el.click({ delay: 30 });
          closed++;
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch { /* */ }
  }

  // Aussi : appuyer sur Escape (ferme la plupart des modales)
  try { await page.keyboard.press('Escape'); } catch { /* */ }

  if (closed > 0) console.log(`   🚫 ${closed} popup(s) fermé(s)`);
  return closed;
}

/**
 * Masque (CSS display:none) tous les éléments résiduels qui gênent le rendu PDF.
 */
async function cleanupPage(page) {
  await page.addStyleTag({
    content: `
      /* ─ Bandeaux cookies résiduels ─ */
      [id*="cookie" i], [class*="cookie" i],
      [id*="consent" i], [class*="consent" i],
      [id*="gdpr" i], [class*="gdpr" i],
      #axeptio_overlay, .axeptio_mount,
      #didomi-host, #onetrust-consent-sdk,
      .cc-window, #cookiescript_injected,
      /* ─ Chats & widgets flottants ─ */
      [id*="chat" i]:not(article), [class*="chat" i]:not(article):not(section),
      [id*="intercom" i], [class*="intercom" i],
      [id*="zendesk" i], [class*="zendesk" i],
      .crisp-client, #hubspot-messages-iframe-container,
      /* ─ Popups / modales ─ */
      [class*="popup" i], [class*="overlay" i],
      [id*="popup" i], [id*="overlay" i],
      [class*="modal" i]:not([class*="modali" i]),
      /* ─ Sticky / fixed ─ */
      [style*="position: fixed"]:not(header):not(#root):not([class*="header"]),
      [style*="position:fixed"]:not(header):not(#root),
      /* ─ Newsletters / pubs ─ */
      [class*="newsletter" i], [class*="subscribe" i],
      [class*="promo" i]:not([class*="promise" i]),
      /* ─ Iframes parasites ─ */
      iframe:not([title*="assur" i]):not([title*="garantie" i]),
      /* ─ Animations qui empêchent le rendu ─ */
      *, *::before, *::after { animation: none !important; transition: none !important; }

      /* ─ Amélioration rendu PDF ─ */
      @media print {
        body { font-size: 11pt !important; color: #111 !important; }
        h1, h2, h3 { page-break-after: avoid; }
        table, .card, article, .garantie { page-break-inside: avoid; }
        a { color: inherit !important; }
        a[href]:after { content: none !important; }
      }
    `
  });

  // Supprimer également les éléments fixed/sticky via JS (au cas où le CSS ne suffit pas)
  await page.evaluate(() => {
    const removeFixedEls = () => {
      document.querySelectorAll('*').forEach(el => {
        try {
          const s = window.getComputedStyle(el);
          if (s.position === 'fixed' || s.position === 'sticky') {
            // Garder les headers principaux (contiennent souvent le logo / titre)
            const tag = el.tagName.toLowerCase();
            if (tag === 'header' || el.id === 'header' || el.id === 'main-header') return;
            // Garder si c'est ≊ large (= layout général, pas un bandeau)
            if (el.offsetWidth > window.innerWidth * 0.9 && el.offsetHeight > 200) return;
            el.style.setProperty('display', 'none', 'important');
          }
        } catch { /* lecture style inaccessible */ }
      });
    };
    removeFixedEls();
  });
}
// ── Scraping d'une URL → Buffer PDF ──────────────────────────────────────────

async function scrapeUrlToPdf(browser, url, index) {
  console.log(`\n📄 [${index + 1}/${urls.length}] Scraping : ${url.slice(0, 80)}${url.length > 80 ? '…' : ''}`);

  const page = await browser.newPage();
  try {
    // ─ Évasion bot : injecter le script AVANT que la page ne charge ─
    await page.evaluateOnNewDocument(BOT_EVASION_SCRIPT);

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    // User-agent Chrome 124 Windows réaliste
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36'
    );

    // En-têtes HTTP réalistes
    await page.setExtraHTTPHeaders({
      'Accept-Language':            'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept':                     'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Cache-Control':              'no-cache',
      'Sec-Ch-Ua':                  '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':           '?0',
      'Sec-Ch-Ua-Platform':         '"Windows"',
      'Sec-Fetch-Dest':             'document',
      'Sec-Fetch-Mode':             'navigate',
      'Sec-Fetch-Site':             'none',
      'Upgrade-Insecure-Requests':  '1',
    });

    // Intercepter les ressources inutiles (pub, tracking) pour accélérer
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type   = req.resourceType();
      const reqUrl = req.url();
      const blockDomains = [
        'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
        'googletagmanager.com', 'facebook.net', 'connect.facebook.net',
        'hotjar.com', 'mouseflow.com', 'contentsquare', 'tagcommander', 'eulerian',
      ];
      if (blockDomains.some(d => reqUrl.includes(d))) { req.abort(); return; }
      if (['media', 'websocket'].includes(type))       { req.abort(); return; }
      req.continue();
    });

    // Navigation
    console.log(`   ↳ Navigation…`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {});
    } catch (navErr) {
      console.warn(`   ⚠️ Navigation lente (${navErr.message.slice(0, 60)}) — on continue`);
    }

    // ─ Phase 1 : accepter les cookies dès l'apparition ─
    console.log(`   ↳ Gestion des cookies & popups…`);
    await acceptCookies(page);
    await closePopups(page);

    // ─ Phase 2 : scroll complet pour déclencher le lazy-loading ─
    console.log(`   ↳ Chargement du contenu dynamique…`);
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance  = 500;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });

    await new Promise(r => setTimeout(r, 1800));

    // ─ Phase 3 : 2e passe (certains bandeaux apparaissent après scroll) ─
    await acceptCookies(page);
    await closePopups(page);

    // ─ Phase 4 : nettoyage CSS des éléments résiduels ─
    await cleanupPage(page);
    await new Promise(r => setTimeout(r, 500));

    // Générer le PDF avec l'URL en en-tête
    const dateStr    = new Date().toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const timeStr    = new Date().toLocaleTimeString('fr-FR');
    const urlDisplay = url.length > 110 ? url.slice(0, 107) + '…' : url;
    const label      = [insurerCode, insuranceType, subType].filter(Boolean).join(' / ');

    const pdfBuffer = await page.pdf({
      format:              'A4',
      printBackground:     true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          font-size: 8px;
          color: #444;
          width: 100%;
          padding: 6px 20px 4px 20px;
          border-bottom: 1px solid #ccc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-sizing: border-box;
        ">
          <span style="font-weight: bold; color: #1a3a6c; white-space: nowrap;">
            ${label}
          </span>
          <span style="
            flex: 1;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0 12px;
            color: #0055a4;
          ">
            🔗 ${urlDisplay}
          </span>
          <span style="white-space: nowrap; color: #888;">
            ${dateStr} ${timeStr}
          </span>
        </div>`,
      footerTemplate: `
        <div style="
          font-family: Arial, Helvetica, sans-serif;
          font-size: 8px;
          color: #aaa;
          width: 100%;
          padding: 4px 20px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          box-sizing: border-box;
        ">
          <span>AssurClair — Web Scraper</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '50px', bottom: '35px', left: '10mm', right: '10mm' },
    });

    const pagePdf = await PDFDocument.load(pdfBuffer);
    console.log(`   ✅ OK — ${pagePdf.getPageCount()} page(s), ${(pdfBuffer.length / 1024).toFixed(0)} KB`);
    return pdfBuffer;

  } finally {
    await page.close();
  }
}

// ── Page de couverture ────────────────────────────────────────────────────────

async function buildCoverPage(mergedPdf, meta) {
  const page          = mergedPdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const fontBold      = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
  const fontRegular   = await mergedPdf.embedFont(StandardFonts.Helvetica);

  // Titre
  page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: rgb(0.1, 0.22, 0.5) });
  page.drawText('DONNÉES CONTRACTUELLES EXTRAITES', {
    x: 40, y: height - 55, size: 16, font: fontBold, color: rgb(1, 1, 1),
  });
  page.drawText('AssurClair — Web Scraper', {
    x: 40, y: height - 78, size: 10, font: fontRegular, color: rgb(0.7, 0.8, 1),
  });

  // Bloc métadonnées
  const drawField = (label, value, y) => {
    page.drawText(label, { x: 40, y, size: 10, font: fontBold,    color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: 200, y, size: 10, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  };

  const dateLabel = new Date(meta.scrapedAt).toLocaleString('fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let y = height - 140;
  drawField('Assureur :', meta.insurerCode, y);
  drawField("Type d'assurance :", meta.insuranceType, y -= 22);
  if (meta.subType) { drawField('Sous-type :', meta.subType, y -= 22); }
  drawField('Date d\'extraction :', dateLabel, y -= 22);
  drawField('Nombre de sources :', String(meta.urls.length), y -= 22);

  // Séparateur
  y -= 20;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  // Liste des URLs
  page.drawText('Sources scrapées :', { x: 40, y, size: 11, font: fontBold, color: rgb(0.1, 0.22, 0.5) });
  y -= 20;

  for (let i = 0; i < meta.urls.length; i++) {
    const u = meta.urls[i];
    // Numéro
    page.drawText(`${i + 1}.`, { x: 40, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    // URL (tronquée sur 2 lignes si nécessaire)
    const maxChars = 80;
    const lines    = [];
    for (let start = 0; start < u.length; start += maxChars) {
      lines.push(u.slice(start, start + maxChars));
    }
    for (const line of lines.slice(0, 3)) {
      page.drawText(line, { x: 60, y, size: 8, font: fontRegular, color: rgb(0, 0.3, 0.7) });
      y -= 14;
    }
    y -= 4;
    if (y < 80) break; // sécurité débordement page
  }
}

// ── Fusion PDF ────────────────────────────────────────────────────────────────

async function mergePdfs(pdfBuffers, meta) {
  const mergedPdf = await PDFDocument.create();

  // Page de couverture
  await buildCoverPage(mergedPdf, meta);

  // Pages scrappées
  for (let i = 0; i < pdfBuffers.length; i++) {
    const srcDoc = await PDFDocument.load(pdfBuffers[i]);
    const copied = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    copied.forEach(p => mergedPdf.addPage(p));
    console.log(`   📎 Source ${i + 1}/${pdfBuffers.length} — ${srcDoc.getPageCount()} page(s) ajoutée(s)`);
  }

  // Métadonnées du PDF
  mergedPdf.setTitle(`${meta.insurerCode} / ${meta.insuranceType} — Données contractuelles`);
  mergedPdf.setAuthor('AssurClair — Web Scraper');
  mergedPdf.setSubject(`${meta.insurerCode} ${meta.insuranceType}${meta.subType ? ' ' + meta.subType : ''}`);
  mergedPdf.setKeywords([meta.insurerCode, meta.insuranceType, meta.subType, 'assurance', 'CG'].filter(Boolean));
  mergedPdf.setCreationDate(new Date());

  return Buffer.from(await mergedPdf.save());
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let browser;
  const startTime = Date.now();

  try {
    console.log('🚀 Lancement de Chromium…');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--lang=fr-FR',
        // Anti-détection supplémentaire
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1440,900',
        '--disable-extensions',
        '--no-first-run',
        '--disable-default-apps',
        '--mute-audio',
      ],
      ignoreHTTPSErrors: true,
    });

    // Scraper chaque URL
    const pdfBuffers = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const buf = await scrapeUrlToPdf(browser, urls[i], i);
        pdfBuffers.push(buf);
      } catch (err) {
        console.error(`   ❌ Échec scraping URL ${i + 1} : ${err.message}`);
        // Continuer avec les autres URLs
      }
    }

    if (pdfBuffers.length === 0) {
      throw new Error('Aucune URL n\'a pu être scrapée avec succès.');
    }

    // Fusion
    console.log('\n📚 Fusion des PDFs…');
    const merged = await mergePdfs(pdfBuffers, meta);

    // Sauvegarde
    fs.writeFileSync(outputPath, merged);

    const elapsed  = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalPagesDoc = await PDFDocument.load(merged);
    const totalPages = totalPagesDoc.getPageCount();

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                     ✅ SUCCÈS                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Fichier      : ${outputPath}`);
    console.log(`  Taille       : ${(merged.length / 1024).toFixed(0)} KB`);
    console.log(`  Pages        : ${totalPages} (dont 1 de couverture)`);
    console.log(`  Sources      : ${pdfBuffers.length}/${urls.length} URL(s) scrapées`);
    console.log(`  Durée        : ${elapsed}s`);
    console.log('');

  } finally {
    if (browser) await browser.close();
  }
}

main().catch(err => {
  console.error('\n❌ Erreur fatale :', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
