// The light meter's model, shared by the build and the browser: the sun's true altitude
// from the date and the place, an approximate scene brightness from it (EV at ISO 100)
// and the exposure the camera's dials turn to for that brightness.
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

/** Apertures by their APEX value (Av = log2 N²): f/2.8 is 3, f/4 is 4, and so on. */
export const F_STOPS = ['2.8', '4', '5.6', '8', '11', '16', '22'] as const;

/** The shutter dial, clockwise from the top: bulb, the full seconds, then fractions of a second. */
export const DIAL = ['B', '2s', '1s', '2', '4', '8', '15', '30', '60', '125', '250', '500'] as const;
/** A shutter time 2^k seconds as its dial position. */
export const dialIndex = (k: number) => 2 - k;

export interface Reading {
  ev: number;
  f: string;
  av: number;
  k: number;
  shutter: string;
}

/**
 * The exposure for a brightness, read in whole stops: stop down to f/11 in bright sun, f/8
 * through most of the day, open up as the light falls, then let the shutter run long on a
 * tripod. The shutter time follows from EV = Av + Tv, so it always lands on a full stop.
 */
export function exposure(evRaw: number): Reading {
  const ev = Math.round(evRaw);
  const av = ev >= 14 ? 7 : ev >= 11 ? 6 : ev >= 8 ? 5 : 4;
  const k = Math.max(-9, Math.min(1, av - ev));
  const shutter = k >= 0 ? `${2 ** k}s` : `1/${DIAL[dialIndex(k)]}`;
  return { ev, f: F_STOPS[av - 3]!, av, k, shutter };
}

export const readingText = (r: Reading) => `about EV ${r.ev} · f/${r.f} · ${r.shutter}`;
