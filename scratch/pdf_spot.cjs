// Spot-check a PDF page's link annotations and their destination pages.
// Usage: node scratch/pdf_spot.cjs <pdf> page <N>
// Prints each link annotation on page N with its rect (PDF coords, origin
// bottom-left) plus the top-left y for easy comparison with template layout,
// and the 1-based destination page (or URL).
const { readFileSync } = require('fs');

(async () => {
  const [, , pdfPath, keyword, pageArg] = process.argv;
  if (!pdfPath || keyword !== 'page' || !pageArg) {
    console.error('Usage: node scratch/pdf_spot.cjs <pdf> page <N>');
    process.exit(1);
  }
  const pageNumber = parseInt(pageArg, 10);
  // pdfjs-dist 5.x expects browser/Node20 globals; annotation parsing never
  // touches them, so inert stubs are enough on Node 18.
  for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) {
    if (typeof globalThis[name] === 'undefined') globalThis[name] = class {};
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  console.log(`${pdfPath}: ${doc.numPages} pages; inspecting page ${pageNumber}`);
  const page = await doc.getPage(pageNumber);
  const pageHeight = page.view[3] - page.view[1];
  const annotations = await page.getAnnotations();
  const links = annotations.filter(a => a.subtype === 'Link');
  if (links.length === 0) {
    console.log('no link annotations');
    return;
  }
  for (const link of links) {
    let destination = link.dest;
    if (typeof destination === 'string') destination = await doc.getDestination(destination);
    let target = link.url ? `url ${link.url}` : 'unresolved';
    if (Array.isArray(destination) && destination[0]) {
      try {
        target = `page ${(await doc.getPageIndex(destination[0])) + 1}`;
      } catch {
        target = 'bad destination ref';
      }
    }
    const rect = link.rect.map(v => Math.round(v));
    const topY = Math.round(pageHeight - link.rect[3]);
    console.log(`link rect=[${rect.join(',')}] topY=${topY} -> ${target}`);
  }
})();
