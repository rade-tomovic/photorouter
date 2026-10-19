// Plays the hero day: the card's sun crosses its arc on a loop while the card is on
// screen, and once the visitor scrolls, the header's day track follows the page from
// dawn at the top to night at the bottom.
import { hhmm } from '@/photorouter/lib/sun';
import { PHASE_LABEL, elevation, lensKind, mountedLens, needsSupport, phaseAt, type PlayDay, type PlayStop } from './daylight';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dayOf = (el: HTMLElement): PlayDay => JSON.parse(el.dataset.day ?? '{}');

/** The stop being shot at a time, or failing that the last one passed. */
const lastStop = (day: PlayDay, m: number): PlayStop | undefined =>
  day.stops.find((s) => m >= s.from && m <= s.to) ?? day.stops.filter((s) => s.t <= m).at(-1);

/** The stop being shot at a time, or failing that the next one; the day's end has none. */
const focusStop = (day: PlayDay, m: number) => {
  const now = day.stops.find((s) => m >= s.from && m <= s.to);
  return { now, shown: now ?? day.stops.find((s) => s.from > m) };
};

/** Mount the lens for a time and show the tripod when the stop needs one. */
function setCamera(camera: Element | null, stop: PlayStop | undefined, m: number) {
  if (!camera) return undefined;
  const lens = stop && mountedLens(stop, m);
  const kind = lens && lensKind(lens);
  if (kind) camera.setAttribute('data-lens', kind);
  camera.toggleAttribute('data-tripod', !!stop && needsSupport(stop.kit));
  return lens;
}

function playCard(card: HTMLElement) {
  const day = dayOf(card);
  const svg = card.querySelector<SVGSVGElement>('svg[data-geo]');
  if (!svg) return;
  const geo: { W: number; horizon: number; peak: number } = JSON.parse(svg.dataset.geo ?? '{}');
  const x = (m: number) => 14 + ((m - day.start) / (day.end - day.start)) * (geo.W - 28);
  const y = (m: number) => geo.horizon - (geo.horizon - geo.peak) * elevation(m, day.sun);
  const sun = svg.querySelector('[data-sun]');
  const trail = svg.querySelector('[data-trail]');
  const clock = card.querySelector('[data-clock]');
  const stops = [...svg.querySelectorAll<SVGElement>('[data-stop]')];
  const rows = [...card.querySelectorAll<HTMLElement>('[data-row]')];
  const camera = card.querySelector('[data-camera]');
  const dims = [...card.querySelectorAll<HTMLElement>('[data-rail-dim]')];
  const bagTitle = card.querySelector('[data-bag-title]');
  const bagLens = card.querySelector('[data-bag-lens]');
  const bagKit = card.querySelector('[data-bag-kit]');

  const render = (m: number) => {
    card.dataset.phase = phaseAt(m, day.sun);
    for (const dim of dims) dim.style.left = `${((m - day.start) / (day.end - day.start)) * 100}%`;
    const below = Math.min(0, elevation(m, day.sun));
    sun?.setAttribute('transform', `translate(${x(m).toFixed(1)} ${Math.min(y(m), geo.horizon + 6).toFixed(1)})`);
    sun?.setAttribute('opacity', String(Math.max(0, 1 + below * 8)));
    const from = day.sun.sunrise;
    const steps = 48;
    const d =
      m <= from
        ? ''
        : Array.from({ length: steps + 1 }, (_, i) => from + ((Math.min(m, day.sun.sunset) - from) * i) / steps)
            .map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(t).toFixed(1)}`)
            .join(' ');
    trail?.setAttribute('d', d);
    if (clock) clock.textContent = ` · ${hhmm(m)}`;
    const current = lastStop(day, m);
    day.stops.forEach((s, i) => {
      stops[i]?.toggleAttribute('data-lit', s.t <= m);
      rows[i]?.toggleAttribute('data-lit', s.t <= m);
      rows[i]?.toggleAttribute('data-current', s === current);
    });
    const { shown } = focusStop(day, m);
    const bag = shown ?? day.stops.at(-1);
    const lens = setCamera(camera, bag, m);
    if (bagTitle) bagTitle.textContent = `In the bag · ${bag?.name ?? ''}`;
    if (bagLens && bagLens.textContent !== (lens ?? '')) bagLens.textContent = lens ?? '';
    if (bagKit) bagKit.textContent = bag?.kit.join(' · ') ?? '';
  };

  const DURATION = 7000;
  const PAUSE = 2600;
  let raf = 0;
  let wait = 0;
  let t0 = 0;
  const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / DURATION);
    render(day.start + (day.end - day.start) * ease(p));
    if (p < 1) raf = requestAnimationFrame(frame);
    else
      wait = window.setTimeout(() => {
        t0 = 0;
        raf = requestAnimationFrame(frame);
      }, PAUSE);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    clearTimeout(wait);
  };

  card.toggleAttribute('data-playing', true);
  new IntersectionObserver(([e]) => {
    stop();
    if (e?.isIntersecting) {
      t0 = 0;
      raf = requestAnimationFrame(frame);
    }
  }, { threshold: 0.35 }).observe(card);
}

function followScroll(header: HTMLElement) {
  const track = header.querySelector<HTMLElement>('[data-track]');
  if (!track) return;
  const day = dayOf(track);
  const suns = [...header.querySelectorAll<HTMLElement>('[data-track-sun]')];
  const ticks = [...track.querySelectorAll<HTMLElement>('[data-tick]')];
  const dims = [...header.querySelectorAll<HTMLElement>('[data-rail-dim]')];
  const camera = track.querySelector('[data-camera]');
  const time = header.querySelector('[data-time]');
  const phaseLabel = header.querySelector('[data-phase-label]');
  const what = header.querySelector('[data-what]');
  const lensLabel = header.querySelector('[data-lens-label]');
  const kit = header.querySelector('[data-kit]');
  const START = 64;
  // Matches DayTrack.astro: the horizon at 48px, noon 40px above it.
  const HORIZON = 48;
  let pending = false;

  const update = () => {
    pending = false;
    const tracking = scrollY > START;
    header.toggleAttribute('data-tracking', tracking);
    if (!tracking) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight - START);
    const p = Math.min(1, Math.max(0, (scrollY - START) / max));
    const m = day.start + (day.end - day.start) * p;
    const phase = phaseAt(m, day.sun);
    header.dataset.phase = phase;
    for (const dim of dims) dim.style.left = `${p * 100}%`;
    for (const sun of suns) {
      sun.style.left = `${p * 100}%`;
      if (sun.hasAttribute('data-arc')) sun.style.top = `${HORIZON - 40 * elevation(m, day.sun)}px`;
    }
    ticks.forEach((t, i) => t.toggleAttribute('data-lit', (day.stops[i]?.t ?? Infinity) <= m));
    const { now, shown } = focusStop(day, m);
    const lens = setCamera(camera, shown, m);
    if (time) time.textContent = hhmm(m);
    if (phaseLabel) phaseLabel.textContent = PHASE_LABEL[phase];
    if (what) what.textContent = now ? `At ${now.name}` : shown ? `Next: ${shown.name} at ${hhmm(shown.from)}` : 'Back at the base';
    if (lensLabel) lensLabel.textContent = lens ?? 'Day done';
    if (kit) kit.textContent = shown ? shown.kit.filter((k) => k !== lens).join(' · ') || 'Nothing else' : 'Camera away until tomorrow';
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

const header = document.querySelector<HTMLElement>('[data-header]');
if (header) followScroll(header);
if (!reduce) document.querySelectorAll<HTMLElement>('[data-lightday]').forEach(playCard);
