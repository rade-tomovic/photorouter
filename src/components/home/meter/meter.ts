// The light meter's model, shared by the build and the browser: the sun's true altitude
// from the date and the place, an approximate scene brightness from it (EV at ISO 100)
// and the exposure the camera's dials turn to for that brightness.
import { needsSupport } from '../daylight';
import { avOfF, firstLens, parseLens } from './lens';

const R = Math.PI / 180;

/** What the browser needs to place the sun: solar noon in local minutes, latitude and declination in degrees. */
export interface Solar {
  noon: number;
  lat: number;
  decl: number;
}

function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

/** Solar noon and declination for a date and place, with the same NOAA terms as the planner's sun model. */
export function solarFor(iso: string, lat: number, lon: number, tz: number): Solar {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(iso) - 1);
  const eqt =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { noon: 720 - 4 * lon - eqt + tz * 60, lat, decl: decl / R };
}

/** The sun's altitude above the horizon in degrees at a local minute, negative below it. */
export function altitude(m: number, s: Solar): number {
  const h = ((m - s.noon) / 4) * R;
  const sin = Math.sin(s.lat * R) * Math.sin(s.decl * R) + Math.cos(s.lat * R) * Math.cos(s.decl * R) * Math.cos(h);
  return Math.asin(Math.max(-1, Math.min(1, sin))) / R;
}

/**
 * Scene brightness against sun altitude, as a photographer's rule of thumb rather than a
 * measurement: EV 15 in full sun from about 30 degrees up (sunny 16), EV 13 when the sun is
 * 6 degrees up and the golden hour starts, about EV 10 at sunset, EV 5 at the end of the
 * blue hour (6 degrees below) and EV 3 for floodlit streets and buildings at night.
 */
const KNOTS: [number, number][] = [
  [-12, 3],
  [-6, 5],
  [-3, 7.5],
  [0, 10.5],
  [6, 13],
  [15, 14.4],
  [30, 15],
];

// Monotone cubic tangents (weighted harmonic means of the slopes), so the curve between the
// knots is smooth and never overshoots them.
const TANGENTS = (() => {
  const h = KNOTS.slice(1).map(([x], i) => x - KNOTS[i]![0]);
  const d = KNOTS.slice(1).map(([, y], i) => (y - KNOTS[i]![1]) / h[i]!);
  return KNOTS.map((_, i) => {
    if (i === 0) return d[0]!;
    if (i === KNOTS.length - 1) return d.at(-1)!;
    const [a, b] = [d[i - 1]!, d[i]!];
    if (a * b <= 0) return 0;
    const w1 = 2 * h[i]! + h[i - 1]!;
    const w2 = h[i]! + 2 * h[i - 1]!;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
})();

/** Approximate scene brightness in EV at ISO 100 for a sun altitude in degrees (see KNOTS). */
export function sceneEv(alt: number): number {
  const first = KNOTS[0]!;
  const last = KNOTS.at(-1)!;
  if (alt <= first[0]) return first[1];
  if (alt >= last[0]) return last[1];
  const i = KNOTS.findIndex(([x], j) => alt >= x && alt < KNOTS[j + 1]![0]);
  const [x0, y0] = KNOTS[i]!;
  const [x1, y1] = KNOTS[i + 1]!;
  const h = x1 - x0;
  const t = (alt - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * TANGENTS[i]! + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * TANGENTS[i + 1]!
  );
}

/** Apertures by their APEX value (Av = log2 N²): f/1 is 0, f/2.8 is 3, f/4 is 4, and so on. */
export const F_STOPS = ['1', '1.4', '2', '2.8', '4', '5.6', '8', '11', '16', '22'] as const;

/** The shutter dial, clockwise from the top: bulb, the full seconds, then fractions of a second. */
export const DIAL = ['B', '2s', '1s', '2', '4', '8', '15', '30', '60', '125', '250', '500'] as const;
/** A shutter time 2^k seconds as its dial position; anything from 4 seconds up is on bulb. */
export const dialIndex = (k: number) => 2 - Math.min(k, 2);

/** The ISO dial's full stops from 100, as Sv = log2(ISO / 100): 0 to 6, ISO 100 to 6400. */
export const ISO_MAX_SV = 6;

/** What the exposure program needs to know about the camera at a stop. */
export interface Setup {
  /** On a tripod or clamp, so the shutter may run long. */
  tripod: boolean;
  /** Focal length of the mounted lens in mm, for the handheld shutter limit. */
  focal: number;
  /** The lens's widest aperture as Av, and as marked. */
  open: number;
  openF: string;
}

/** A camera with no lens in the kit: a standard f/2.8 lens, handheld. */
export const DEFAULT_SETUP: Setup = { tripod: false, focal: 50, open: 3, openF: '2.8' };

/** The setup for a stop's kit with a lens on the camera, by default the first lens it lists. */
export function setupFor(kit: string[], lens?: string): Setup {
  const spec = parseLens(lens ?? firstLens(kit) ?? '');
  const tripod = needsSupport(kit);
  if (!spec) return { ...DEFAULT_SETUP, tripod };
  return { tripod, focal: spec.min, open: avOfF(spec.f), openF: String(Math.round(spec.f * 10) / 10) };
}

export interface Reading {
  ev: number;
  f: string;
  av: number;
  /** Shutter time as 2^k seconds. */
  k: number;
  shutter: string;
  /** ISO as full stops from 100. */
  sv: number;
  iso: number;
}

/**
 * The exposure program for a brightness, in whole stops, from EV + Sv = Av + Tv. On a tripod
 * it keeps ISO 100 and f/8, or f/11 in bright sun, for depth through a scene, and lets the
 * shutter run long. Handheld it takes f/11 in bright sun, f/8 through most of the day and
 * f/5.6 to f/4 as the light falls; when the shutter would drop below the handheld limit,
 * 1/(2 x focal length) but never slower than 1/60, it opens up to the lens's widest aperture
 * and then raises ISO a stop at a time up to 6400.
 */
export function exposure(evRaw: number, setup: Setup = DEFAULT_SETUP): Reading {
  const ev = Math.round(evRaw);
  const bright = ev >= 14 ? 7 : 6;
  let av = Math.max(setup.open, setup.tripod ? bright : ev >= 11 ? bright : ev >= 8 ? 5 : 4);
  let sv = 0;
  if (!setup.tripod) {
    const slowest = -Math.ceil(Math.log2(Math.max(60, 2 * setup.focal)));
    const over = Math.round(av - ev) - slowest;
    if (over > 0) {
      av = Math.max(setup.open, av - over);
      sv = Math.min(ISO_MAX_SV, Math.max(0, Math.round(av - ev) - slowest));
    }
  }
  const k = Math.max(-9, Math.min(5, Math.round(av - ev) - sv));
  const shutter = k >= 0 ? `${2 ** k}s` : `1/${DIAL[dialIndex(k)]}`;
  const f = Number.isInteger(av) ? F_STOPS[av]! : setup.openF;
  return { ev, f, av, k, shutter, sv, iso: 100 * 2 ** sv };
}

export const readingText = (r: Reading) => `about EV ${r.ev} · f/${r.f} · ${r.shutter}`;
