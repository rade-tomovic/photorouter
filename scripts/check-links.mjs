// Post-build internal link checker: every root-relative href in dist/**/*.html
// must resolve to a built file. Run after `bun run build`; exits 1 on breakage.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (entry.endsWith('.html')) yield p;
  }
}

const hrefRe = /(?:href|src)="(\/[^"#?]*)/g;
const broken = [];
let pages = 0;
let checked = 0;

for (const file of htmlFiles(DIST)) {
  pages++;
  const html = readFileSync(file, 'utf8');
  for (const [, target] of html.matchAll(hrefRe)) {
    checked++;
    const clean = decodeURIComponent(target);
    const isFile = (p) => existsSync(p) && statSync(p).isFile();
    const resolves =
      isFile(join(DIST, clean)) ||
      isFile(join(DIST, clean, 'index.html')) ||
      isFile(join(DIST, `${clean.replace(/\/$/, '')}.html`));
    if (!resolves) broken.push({ page: file.slice(DIST.length), target });
  }
}

if (broken.length) {
  console.error(`✗ ${broken.length} broken internal link(s) across ${pages} pages:`);
  for (const b of broken) console.error(`  ${b.page} → ${b.target}`);
  process.exit(1);
}
console.log(`✓ ${checked} internal refs across ${pages} pages: all resolve`);
