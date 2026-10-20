// The clocks the hero day runs on, in the browser: an autoplay loop or the hero's own pass
// through the screen for the hero drawing, and the page scroll for the header track.
// Themes only draw a minute.
import { phaseAt, type PlayDay, type PlayStop } from './daylight';

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The PlayDay serialised into an element's data-day attribute. */
export const readDay = (el: HTMLElement): PlayDay => JSON.parse(el.dataset.day ?? '{}');

/** The stop being shot at a time, and failing that the next one; after the last stop, none. */
export function focusStop(day: PlayDay, m: number): { now: PlayStop | undefined; shown: PlayStop | undefined } {
  const now = day.stops.find((s) => m >= s.from && m <= s.to);
  return { now, shown: now ?? day.stops.find((s) => s.from > m) };
}

/** The stop being shot at a time, or failing that the last one passed. */
export const lastStop = (day: PlayDay, m: number): PlayStop | undefined =>
  day.stops.find((s) => m >= s.from && m <= s.to) ?? day.stops.filter((s) => s.t <= m).at(-1);

/**
 * Play a day on a loop while an element is on screen: from day.start to day.end over
 * `duration` ms with an ease in and out, then a pause. Does nothing with reduced motion,
 * so the element keeps its static drawing. Returns whether it plays.
 */
export function autoplay(
  el: Element,
  day: PlayDay,
  draw: (m: number) => void,
  { duration = 7000, pause = 2600 }: { duration?: number; pause?: number } = {},
): boolean {
  if (reduceMotion()) return false;
  let raf = 0;
  let wait = 0;
  let t0 = 0;
  const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / duration);
    draw(day.start + (day.end - day.start) * ease(p));
    if (p < 1) raf = requestAnimationFrame(frame);
    else
      wait = window.setTimeout(() => {
        t0 = 0;
        raf = requestAnimationFrame(frame);
      }, pause);
  };
  new IntersectionObserver(
    ([e]) => {
      cancelAnimationFrame(raf);
      clearTimeout(wait);
      if (e?.isIntersecting) {
        t0 = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    { threshold: 0.35 },
  ).observe(el);
  return true;
}

const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

/**
 * Play a day as an element scrolls up the screen: dawn while its top is in the lower part
 * of the screen, night once its top reaches the header, so the whole day plays while the
 * element is in view. Does nothing with reduced motion, so the element keeps its static
 * drawing. Returns whether it plays.
 */
export function scrollPlay(el: Element, day: PlayDay, draw: (m: number) => void): boolean {
  if (reduceMotion()) return false;
  let pending = false;
  const update = () => {
    pending = false;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const from = innerHeight * 0.6;
    const p = clamp01((from - r.top) / Math.max(1, from - TRACK_START));
    draw(day.start + (day.end - day.start) * p);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  update();
  return true;
}

/** The height of the header's link row, in px: the track never starts above it. */
export const TRACK_START = 64;

/**
 * Follow the page scroll as one day: dawn where the track starts, night at the bottom. The
 * track starts once `after` (the hero drawing) has gone under the header, or just past the
 * header without it. Sets data-tracking on the header from there, which swaps the links for
 * the track, and data-phase for the light at that minute. `draw` gets the minute and the
 * scroll progress from 0 to 1, only while the track shows.
 */
export function followScroll(day: PlayDay, draw: (m: number, p: number) => void, after?: Element | null) {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  let pending = false;
  const update = () => {
    pending = false;
    const start = after ? Math.max(TRACK_START, after.getBoundingClientRect().bottom + scrollY - TRACK_START) : TRACK_START;
    const tracking = scrollY > start;
    header.toggleAttribute('data-tracking', tracking);
    if (!tracking) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight - start);
    const p = clamp01((scrollY - start) / max);
    const m = day.start + (day.end - day.start) * p;
    header.dataset.phase = phaseAt(m, day.sun);
    draw(m, p);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  update();
}
