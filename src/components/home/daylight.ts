// The light over one day, shared by the hero card, the header day track and the script
// that plays them. Times are minutes after local midnight.
import type { SunDay } from '@/photorouter/lib/sun';

export type Phase = 'night' | 'blue' | 'golden' | 'day';

export const PHASE_LABEL: Record<Phase, string> = {
  night: 'Night',
  blue: 'Blue hour',
  golden: 'Golden hour',
  day: 'Daylight',
};

export interface PlayStop {
  n: number;
  name: string;
  from: number;
  to: number;
  t: number;
  kit: string[];
}

/** What the browser needs to play a day, serialised into a data-day attribute. */
export interface PlayDay {
  sun: SunDay;
  start: number;
  end: number;
  stops: PlayStop[];
}

export function phaseAt(m: number, sun: SunDay): Phase {
  if (m < sun.dawnBlue || m > sun.blueEnd) return 'night';
  if (m < sun.sunrise || m > sun.sunset) return 'blue';
  if (m < sun.goldenAmEnd || m > sun.goldenPmStart) return 'golden';
  return 'day';
}

/** The sun's height as a share of its noon height: 0 on the horizon, negative below it. */
export const elevation = (m: number, sun: SunDay) =>
  Math.max(-0.35, Math.sin((Math.PI * (m - sun.sunrise)) / (sun.sunset - sun.sunrise)));

/** The day split into its light phases between two times, for drawing bands and rails. */
export function phases(sun: SunDay, start: number, end: number): { from: number; to: number; phase: Phase }[] {
  const marks = [start, sun.dawnBlue, sun.sunrise, sun.goldenAmEnd, sun.goldenPmStart, sun.sunset, sun.blueEnd, end]
    .map((m) => Math.min(end, Math.max(start, m)));
  return marks
    .slice(0, -1)
    .map((from, i) => ({ from, to: marks[i + 1]!, phase: phaseAt((from + marks[i + 1]!) / 2, sun) }))
    .filter((p) => p.to > p.from);
}

export type LensKind = 'wide' | 'standard' | 'tele';

/** A kit label as a lens type, from its longest focal length; null for anything else. */
export function lensKind(label: string): LensKind | null {
  const m = label.match(/^(\d+)(?:-(\d+))?(?:mm)?\s+f\//);
  if (!m) return null;
  const longest = Number(m[2] ?? m[1]);
  return longest <= 35 ? 'wide' : longest <= 105 ? 'standard' : 'tele';
}

export const needsSupport = (kit: string[]) => kit.some((k) => /tripod|clamp/i.test(k));

/**
 * The lens on the camera at a time. The kit lists lenses in the order the spot uses them,
 * so a stop's window is shared between them; before a stop its first lens is mounted.
 */
export function mountedLens(stop: PlayStop, m: number): string | undefined {
  const lenses = stop.kit.filter((k) => lensKind(k));
  if (lenses.length < 2 || m <= stop.from) return lenses[0];
  const share = (Math.min(m, stop.to) - stop.from) / Math.max(1, stop.to - stop.from);
  return lenses[Math.min(lenses.length - 1, Math.floor(share * lenses.length))];
}
