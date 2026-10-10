// Validates demo trips with the app's own importer. Run with bun:
//   bun scripts/check-demo.ts src/photorouter/data/demos/europe.json
// Exits 1 when a demo has import errors, warnings, or em dashes in its text.
import { readFileSync } from 'node:fs';
import { importResponse } from '../src/photorouter/lib/byoai';

let failed = false;
for (const file of process.argv.slice(2)) {
  const raw = readFileSync(file, 'utf8');
  const demo = JSON.parse(raw);
  const r = importResponse(JSON.stringify(demo.answer), demo.brief);
  const dashes = raw.includes('—') || raw.includes('–');
  const ok = r.plan && !r.errors.length && !r.warnings.length && !dashes;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}${r.plan ? `: ${r.plan.stops} stops, ${r.plan.trip.spots.length} spots, ${Object.keys(r.plan.trip.cities).length} cities, ${r.plan.days.length} days` : ''}`);
  for (const e of r.errors) console.log(`  error: ${e}`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
  if (dashes) console.log('  error: em or en dash in the text; use a hyphen, comma or full stop');
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
