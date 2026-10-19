// Where things sit on the drawn camera, shared by the components that draw it and the
// script that plays it, so the still drawing and the first played frame agree.
import { dialIndex } from './meter';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The meter's EV scale: EV 2 to 17 across a swing of 2 × sweep degrees. */
export const EV_MIN = 2;
export const EV_MAX = 17;

/** The needle's angle from upright, in degrees, for a brightness on a scale swinging ±sweep. */
export const needleAngle = (ev: number, sweep: number) =>
  -sweep + ((clamp(ev, EV_MIN, EV_MAX) - EV_MIN) / (EV_MAX - EV_MIN)) * 2 * sweep;

/** A point on an arc around a pivot, at an angle from upright in degrees. */
export const polar = (cx: number, cy: number, r: number, deg: number) => ({
  x: cx + r * Math.sin((deg * Math.PI) / 180),
  y: cy - r * Math.cos((deg * Math.PI) / 180),
});

/** The hero meter: pivot below the window, scale swinging ±45 degrees. */
export const HERO_METER = { cx: 230, cy: 108, sweep: 45 };

/** The sun window: the sun crosses it with the day and stands as high as its altitude. */
export const SUN_WINDOW = { x0: 100, x1: 142, horizon: 66, top: 44 };
export function sunInWindow(p: number, alt: number) {
  const w = SUN_WINDOW;
  return { x: w.x0 + (w.x1 - w.x0) * p, y: w.horizon - (w.horizon - w.top) * clamp(alt / 60, -0.4, 1) };
}

/** The shutter dial turns 30 degrees per stop, so the set speed faces the index mark. */
export const dialTurn = (k: number) => -dialIndex(k) * 30;

/** The aperture ring's numbers are this far apart; the set one sits under the index. */
export const APERTURE_STEP = 17;
export const apertureShift = (av: number, maxAv: number) => -(av - maxAv) * APERTURE_STEP;

/** The iris opening against f/4: its diameter is the focal length over N, and N = 2^(Av/2). */
export const irisScale = (av: number) => 2 ** ((4 - av) / 2);

/** The sun's altitude as the window's engraving reads it. */
export const altText = (alt: number) =>
  Math.abs(alt) < 0.5 ? 'Sun on horizon' : `Sun ${Math.round(Math.abs(alt))}° ${alt >= 0 ? 'up' : 'down'}`;
