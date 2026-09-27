import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const out = process.argv[3] ?? null;
const mode = process.argv[4] ?? 'layout';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(readFileSync(file));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

let output = '';

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  output += `\n===== SEITE ${p} =====\n`;
  if (mode === 'text') {
    for (const item of content.items) {
      if (item.str && item.str.trim()) output += item.str + '\n';
    }
  } else {
    const lines = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      const arr = lines.get(y) ?? [];
      arr.push({ x, str: item.str });
      lines.set(y, arr);
    }
    const sortedY = [...lines.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const items = lines.get(y).sort((a, b) => a.x - b.x);
      const line = items.map((i) => `[${i.x}] ${i.str.trim()}`).join('   ');
      output += `y=${y}  ${line}\n`;
    }
  }
}

if (out) writeFileSync(out, output, 'utf8');
else console.log(output);
