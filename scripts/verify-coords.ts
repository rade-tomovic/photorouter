// Checks demo spot coordinates against OpenStreetMap. Run with bun:
//   bun scripts/verify-coords.ts src/photorouter/data/demos/europe.json
// Geocodes every spot by name and city through Nominatim (at most one request
// per second, per its usage policy) and lists spots whose coordinates are more
// than 2 km from every match, or that OpenStreetMap cannot find. A flagged spot
// is not necessarily wrong (a viewpoint can sit across a river from what it
// shows), but it needs a look.
import { readFileSync } from 'node:fs';

const LIMIT_KM = 2;
const km = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RateLimited extends Error {}

/** One Nominatim search. Backs off on a rate limit, and gives up loudly rather than reporting "not found". */
async function search(q: string): Promise<[number, number][]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
  for (const wait of [0, 30_000, 90_000]) {
    if (wait) await sleep(wait);
    const res = await fetch(url, { headers: { 'User-Agent': 'photorouter-demo-check (https://github.com/rade-tomovic/photorouter)' } });
    await sleep(1100);
    if (res.status === 429 || res.status === 403) continue;
    if (!res.ok) return [];
    const rows = (await res.json()) as { lat: string; lon: string }[];
    return rows.map((r) => [Number(r.lon), Number(r.lat)]);
  }
  throw new RateLimited(q);
}

let flagged = 0;
for (const file of process.argv.slice(2)) {
  const { answer } = JSON.parse(readFileSync(file, 'utf8'));
  const city = Object.fromEntries(answer.cities.map((c: { id: string; name: string }) => [c.id, c.name]));
  console.log(file);
  for (const s of answer.spots) {
    const at: [number, number] = [s.lng, s.lat];
    let hits: [number, number][];
    try {
      hits = await search(`${s.name}, ${city[s.cityId]}`);
      if (!hits.length && s.localName) hits = await search(`${s.localName}, ${city[s.cityId]}`);
      if (!hits.length) hits = await search(s.name);
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      console.log('  Nominatim is rate limiting this address; stopping. Try again later.');
      process.exit(2);
    }
    const best = hits.length ? Math.min(...hits.map((h) => km(at, h))) : Infinity;
    if (best > LIMIT_KM) {
      flagged++;
      console.log(`  ${best === Infinity ? 'NOT FOUND' : `${best.toFixed(1)} km off`}  ${s.id} (${s.name})${hits[0] ? `  nearest match ${hits.sort((a, b) => km(at, a) - km(at, b))[0]!.map((v) => v.toFixed(4)).reverse().join(', ')}` : ''}`);
    }
  }
}
console.log(flagged ? `${flagged} spot(s) to review` : 'All spots within 2 km of an OpenStreetMap match');
