import gearJson from '../data/gear.json';
import type { Focal, GearItem, StyleDef } from './types';

// The gear a photographer can bring. Lenses are generic and brand-agnostic:
// what matters to the plan is the focal range, the maximum aperture and
// whether it is a macro, fisheye or tilt-shift. Anything missing from the
// catalog can be added as a custom lens, stored as an id like "lens:z:24-105:4".

export interface Lens {
  id: string;
  type: 'prime' | 'zoom';
  /** Focal length in mm as marked on the lens; equal to `max` for a prime. */
  min: number;
  max: number;
  /** Maximum aperture, at the wide end for a variable-aperture zoom. */
  f: number;
  /** Maximum aperture at the long end, when it differs. */
  fTele?: number;
  special?: 'macro' | 'fisheye' | 'tilt-shift';
  /** Made for a smaller sensor; full frame when absent. */
  format?: 'apsc' | 'mft';
}

export const GEAR = gearJson.items as GearItem[];
export const GEAR_GROUPS = gearJson.groups as { kind: GearItem['kind']; label: string }[];
export const LENSES = gearJson.lenses as Lens[];
export const STYLES = gearJson.styles as StyleDef[];

const ITEM = new Map(GEAR.map((g) => [g.id, g]));
const LENS = new Map(LENSES.map((l) => [l.id, l]));

const num = (n: number) => String(n);
const mm = (l: Lens) => (l.type === 'prime' ? `${num(l.min)}mm` : `${num(l.min)}-${num(l.max)}mm`);
const aperture = (l: Lens) => `f/${num(l.f)}${l.fTele && l.fTele !== l.f ? `-${num(l.fTele)}` : ''}`;
const SPECIAL = { macro: 'macro', fisheye: 'fisheye', 'tilt-shift': 'tilt-shift' } as const;

export const lensLabel = (l: Lens) => `${mm(l)} ${aperture(l)}${l.special ? ` ${SPECIAL[l.special]}` : ''}`;
export const lensShort = (l: Lens) => `${l.type === 'prime' ? `${num(l.min)}mm` : `${num(l.min)}-${num(l.max)}`} ${aperture(l)}`;

/** A custom lens id: "lens:p:85:1.4" for a prime, "lens:z:24-105:4" for a zoom. */
export const customLensId = (type: Lens['type'], min: number, max: number, f: number) =>
  type === 'prime' ? `lens:p:${min}:${f}` : `lens:z:${min}-${max}:${f}`;

function parseCustomLens(id: string): Lens | undefined {
  const m = /^lens:(p|z):(\d{1,4})(?:-(\d{1,4}))?:(\d{1,2}(?:\.\d)?)$/.exec(id);
  if (!m) return undefined;
  const min = Number(m[2]);
  const max = m[1] === 'z' ? Number(m[3] ?? m[2]) : min;
  const f = Number(m[4]);
  if (!min || max < min || max > 2000 || f < 0.7 || f > 32) return undefined;
  return { id, type: m[1] === 'p' ? 'prime' : 'zoom', min, max, f };
}

export const lensFor = (id: string): Lens | undefined => LENS.get(id) ?? parseCustomLens(id);

/** Any gear id, lens or not, as a display item. */
export function gearItem(id: string): GearItem | undefined {
  const item = ITEM.get(id);
  if (item) return item;
  const lens = lensFor(id);
  return lens ? { id, kind: 'lens', label: lensLabel(lens), short: lensShort(lens) } : undefined;
}

/** The crop factor of the first interchangeable-lens body in the kit; full frame when there is none. */
export function cropFactor(gear: string[]): number {
  for (const id of gear) {
    const crop = ITEM.get(id)?.crop;
    if (crop) return crop;
  }
  return 1;
}

/** Focal classes on a full-frame-equivalent scale, as spots describe them. */
const CLASSES: [Focal, number, number][] = [
  ['ultrawide', 0, 20],
  ['wide', 21, 35],
  ['standard', 36, 70],
  ['tele', 71, Infinity],
];

export function lensFocals(l: Lens, crop: number): Focal[] {
  const lo = l.min * crop;
  const hi = l.max * crop;
  return CLASSES.filter(([, a, b]) => hi >= a && lo <= b).map(([f]) => f);
}

/** Filter buckets for the lens picker, on the focal length as marked. */
export const FOCAL_BUCKETS = [
  { id: 'ultrawide', label: 'Ultra wide', a: 0, b: 20 },
  { id: 'wide', label: 'Wide', a: 21, b: 35 },
  { id: 'standard', label: 'Standard', a: 36, b: 70 },
  { id: 'short-tele', label: 'Short tele', a: 71, b: 135 },
  { id: 'tele', label: 'Telephoto', a: 136, b: 300 },
  { id: 'super-tele', label: 'Super tele', a: 301, b: Infinity },
] as const;

export const inBucket = (l: Lens, bucket: (typeof FOCAL_BUCKETS)[number]) => l.max >= bucket.a && l.min <= bucket.b;

export const FORMAT_LABEL = { apsc: 'APS-C', mft: 'MFT' } as const;
