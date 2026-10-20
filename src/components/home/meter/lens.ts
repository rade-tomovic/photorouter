// A lens as the hero camera draws it: read from a kit label, sized like a real full-frame
// mirrorless lens of that focal length and aperture, and engraved the way lenses are.
// Sizes are in millimetres, the same unit as the drawn camera body.

export interface LensSpec {
  /** Focal length in mm; equal to `max` for a prime. */
  min: number;
  max: number;
  /** Maximum aperture as an f-number, at the wide end for a variable-aperture zoom. */
  f: number;
  /** Maximum aperture at the long end, when it differs. */
  fTele?: number;
  special?: 'macro' | 'fisheye' | 'tilt-shift';
}

export interface LensSize {
  /** From the mount face to the front of the filter ring. */
  length: number;
  /** Barrel diameter. */
  dia: number;
  /** Filter thread diameter; 0 for a lens with a bulging front element and no thread. */
  filter: number;
}

const NUM = String.raw`\d{1,4}(?:\.\d{1,2})?`;
const LABEL = new RegExp(
  String.raw`^\s*(${NUM})(?:\s*-\s*(${NUM}))?\s*(?:mm)?\s+(?:f\s*\/\s*|1\s*:\s*)(${NUM})(?:\s*-\s*(${NUM}))?\b(.*)$`,
  'i',
);

/**
 * A kit label as a lens, or null for anything that is not one. Reads "24mm f/1.8",
 * "85 f/1.4", "16-35 f/4", "100-400mm f/4.5-5.6", "24mm 1:1.8" and a trailing
 * "macro", "fisheye" or "tilt-shift". "Tripod", "6-stop ND" or "FF body" give null.
 */
export function parseLens(label: string): LensSpec | null {
  const m = LABEL.exec(label.replace(/[‒-―]/g, '-'));
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const f = Number(m[3]);
  const fTele = m[4] ? Number(m[4]) : undefined;
  if (!a || b < a || b > 2000 || f < 0.7 || f > 32 || (fTele !== undefined && fTele < f)) return null;
  const rest = m[5] ?? '';
  const special = /macro/i.test(rest) ? 'macro' : /fish/i.test(rest) ? 'fisheye' : /tilt|shift/i.test(rest) ? 'tilt-shift' : undefined;
  return { min: a, max: b, f, ...(fTele && fTele !== f ? { fTele } : {}), ...(special ? { special } : {}) };
}

const num = (n: number) => String(Math.round(n * 10) / 10);

/** The first lens a kit lists, which the hero camera mounts for the stop. */
export const firstLens = (kit: string[]) => kit.find((k) => parseLens(k));

/** How far right of the lens axis the mounting index dots sit, on the lens and on the mount, in mm. */
export const MOUNT_DOT = 19;

/** The engraving on the barrel: "35mm 1:1.8", "24-70mm 1:2.8", "100-400mm 1:4.5-5.6". */
export const engraving = (l: LensSpec) =>
  `${l.min === l.max ? num(l.min) : `${num(l.min)}-${num(l.max)}`}mm 1:${num(l.f)}${l.fTele ? `-${num(l.fTele)}` : ''}`;

/**
 * Typical full-frame mirrorless lenses: focal range, maximum aperture, length, diameter
 * and filter thread in mm, rounded from makers' published figures. A lens is drawn at the
 * size of the nearest one here, scaled for focal length where it differs.
 */
type Ref = [min: number, max: number, f: number, length: number, dia: number, filter: number, special?: LensSpec['special']];
const PRIMES: Ref[] = [
  [14, 14, 1.8, 100, 83, 0],
  [20, 20, 1.8, 88, 76, 67],
  [24, 24, 1.4, 92, 76, 67],
  [24, 24, 1.8, 66, 68, 55],
  [24, 24, 2.8, 45, 68, 49],
  [28, 28, 2, 60, 64, 49],
  [28, 28, 2.8, 43, 70, 52],
  [35, 35, 1.2, 131, 88, 82],
  [35, 35, 1.4, 96, 76, 67],
  [35, 35, 1.8, 73, 66, 55],
  [40, 40, 2, 45, 70, 52],
  [50, 50, 1.2, 108, 87, 72],
  [50, 50, 1.4, 96, 81, 67],
  [50, 50, 1.8, 60, 68, 49],
  [85, 85, 1.2, 142, 103, 82],
  [85, 85, 1.4, 107, 90, 77],
  [85, 85, 1.8, 82, 78, 67],
  [105, 105, 1.4, 131, 93, 82],
  [135, 135, 1.8, 127, 90, 82],
  [200, 200, 2, 203, 125, 0],
  [300, 300, 2.8, 266, 128, 0],
  [400, 400, 2.8, 359, 158, 0],
  [600, 600, 4, 449, 163, 0],
  [800, 800, 5.6, 460, 165, 0],
  [15, 15, 2.8, 64, 72, 0, 'fisheye'],
  [60, 60, 2.8, 71, 70, 55, 'macro'],
  [100, 100, 2.8, 130, 79, 62, 'macro'],
  [24, 24, 3.5, 109, 82, 77, 'tilt-shift'],
];
const ZOOMS: Ref[] = [
  [14, 24, 2.8, 125, 89, 0],
  [16, 35, 4, 99, 80, 72],
  [16, 35, 2.8, 122, 89, 82],
  [24, 70, 4, 89, 77, 72],
  [24, 70, 2.8, 120, 88, 82],
  [24, 105, 4, 113, 84, 77],
  [24, 200, 4, 115, 77, 67],
  [28, 75, 2.8, 118, 75, 67],
  [70, 200, 4, 175, 82, 72],
  [70, 200, 2.8, 210, 89, 77],
  [100, 400, 4.5, 205, 93, 77],
  [200, 600, 5.6, 318, 112, 95],
];

const ln = Math.log;

/** The drawn size of a lens: the nearest typical lens, scaled for focal length. */
export function lensSize(l: LensSpec): LensSize {
  const zoom = l.max > l.min;
  const cost = ([min, max, f, , , , sp]: Ref) =>
    2 * Math.abs(ln(l.min / min)) + 2 * Math.abs(ln(l.max / max)) + Math.abs(ln(l.f / f)) + (sp === l.special ? 0 : 3);
  const [, rmax, rf, length, dia, filter] = (zoom ? ZOOMS : PRIMES).reduce((a, b) => (cost(b) < cost(a) ? b : a));
  // Longer lenses grow with focal length, wider front elements with the entrance pupil.
  const k = l.max / rmax;
  const tele = rmax >= 85;
  const grow = (tele ? k ** 0.85 : k ** 0.2) * (rf / l.f) ** 0.25;
  const widen = tele ? (k * (rf / l.f)) ** 0.4 : 1;
  const d = Math.max(56, Math.min(170, dia * widen));
  return {
    length: Math.max(28, Math.min(600, length * grow)),
    dia: d,
    filter: filter ? Math.min(d - 3, Math.max(40, filter * widen)) : 0,
  };
}

/** An f-number as APEX aperture value, Av = log2 N², on the marked full stops where it is one. */
const FULL = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32];
export const avOfF = (n: number) => {
  const i = FULL.indexOf(n);
  return i >= 0 ? i : 2 * Math.log2(n);
};

/** The numbers on an aperture ring: the lens's maximum aperture, then the full stops down to f/16 or f/22. */
export function ringStops(l: LensSpec): { label: string; av: number }[] {
  const open = avOfF(l.f);
  const last = l.f >= 2.8 ? 22 : 16;
  return [
    { label: num(l.f), av: open },
    ...FULL.filter((n) => avOfF(n) > open + 0.4 && n <= last).map((n) => ({ label: num(n), av: avOfF(n) })),
  ];
}
