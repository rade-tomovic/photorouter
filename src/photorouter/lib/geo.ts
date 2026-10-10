import type { LngLat } from './types';

const R = Math.PI / 180;

export function km(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * R;
  const dLon = (b[0] - a[0]) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R);
  const x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}

/** Centripetal-ish Catmull-Rom through the control points, so hand-placed rail lines read as track. */
export function smooth(pts: LngLat[], perSeg = 12): LngLat[] {
  if (pts.length < 3) return pts.slice();
  const out: LngLat[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** A gentle arc between two stops, bowed to one side, for walking legs. */
export function arc(a: LngLat, b: LngLat, bow = 0.18, n = 40): LngLat[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: LngLat = [mx - dy * bow, my + dx * bow];
  const out: LngLat[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export interface Measured {
  pts: LngLat[];
  acc: number[];
  total: number;
}

export function measure(pts: LngLat[]): Measured {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + km(pts[i - 1]!, pts[i]!));
  return { pts, acc, total: acc[acc.length - 1]! };
}

/** Point at fraction t of the line, plus everything drawn so far. */
export function along(m: Measured, t: number): { at: LngLat; head: LngLat[]; dir: number } {
  const target = m.total * Math.min(1, Math.max(0, t));
  let i = 1;
  while (i < m.acc.length - 1 && m.acc[i]! < target) i++;
  const a = m.pts[i - 1]!;
  const b = m.pts[i]!;
  const seg = m.acc[i]! - m.acc[i - 1]! || 1;
  const u = (target - m.acc[i - 1]!) / seg;
  const at: LngLat = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  return { at, head: [...m.pts.slice(0, i), at], dir: bearing(a, b) };
}

export function bounds(pts: LngLat[]): [LngLat, LngLat] {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of pts) {
    w = Math.min(w, x); e = Math.max(e, x);
    s = Math.min(s, y); n = Math.max(n, y);
  }
  return [[w, s], [e, n]];
}
