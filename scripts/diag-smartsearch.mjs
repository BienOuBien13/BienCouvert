import https from 'https';

function fetchRaw(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      }
    }, res => {
      // follow redirects
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location) {
        req.destroy();
        return resolve(fetchRaw(new URL(res.headers.location, url).toString()));
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ code: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
  });
}

const insurer = 'MAIF';
const type = 'automobile';
const q = encodeURIComponent(`${insurer} conditions generales ${type} PDF`);

console.log('=== DDG ===');
const ddg = await fetchRaw(`https://html.duckduckgo.com/html/?q=${q}`);
if (ddg.error) { console.log('ERROR:', ddg.error); }
else {
  console.log('Status:', ddg.code, '| Body len:', ddg.body.length);
  const pdfs = (ddg.body.match(/https?:\/\/[^ "'<>]+\.pdf/gi) || []).slice(0,5);
  const links = (ddg.body.match(/href="(https?:\/\/[^"]+)"/gi) || []).slice(0,5);
  console.log('PDF URLs directly:', pdfs);
  console.log('First links:', links);
}

console.log('\n=== index-assurance.fr listing CG ===');
const idx = await fetchRaw('https://www.index-assurance.fr/fichiers/cg/');
console.log('Status:', idx.code, '| Body len:', idx.body?.length, idx.error || '');
if (idx.body) {
  const pdfs = (idx.body.match(/href="([^"]+\.pdf)"/gi) || []).slice(0,10);
  console.log('PDF links:', pdfs);
}

console.log('\n=== index-assurance.fr page MAIF ===');
const idx2 = await fetchRaw('https://www.index-assurance.fr/?s=maif');
console.log('Status:', idx2.code, '| Body len:', idx2.body?.length, idx2.error || '');
if (idx2.body) {
  const pdfs = (idx2.body.match(/https?:\/\/[^ "'<>]+\.pdf/gi) || []).slice(0,10);
  console.log('PDF URLs:', pdfs);
}

console.log('\n=== Direct PDF test ===');
const pdf = await fetchRaw('https://www.index-assurance.fr/fichiers/cg/conditions-generales-maif-auto-janvier-2023.pdf');
console.log('Status:', pdf.code, '| Body len:', pdf.body?.length, pdf.error || '');
console.log('Is PDF?', pdf.body?.startsWith('%PDF') || false);

console.log('\n=== Bing ===');
const bing = await fetchRaw(`https://www.bing.com/search?q=${q}&setlang=fr&count=10`);
if (bing.error) { console.log('ERROR:', bing.error); }
else {
  console.log('Status:', bing.code, '| Body len:', bing.body.length);
  const pdfs = (bing.body.match(/https?:\/\/[^ "'<>]+\.pdf/gi) || []).slice(0,5);
  console.log('PDF URLs:', pdfs);
}
