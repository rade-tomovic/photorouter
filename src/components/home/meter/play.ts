// The "Light meter" theme in the browser: the hero camera plays the day on a loop while it
// is on screen, and the header track follows the page scroll. Both read the light at a
// minute from the sun's altitude and turn the same parts to it; the hero also swaps the
// lens on its mount for the one each stop uses.
import { hhmm } from '@/photorouter/lib/sun';
import { PHASE_LABEL, mountedLens, needsSupport, phaseAt, type PlayDay } from '../daylight';
import { autoplay, focusStop, followScroll, lastStop, readDay } from '../dayclock';
import { altitude, exposure, readingText, sceneEv, type Solar } from './meter';
import { dialTurn, irisScale, needleAngle } from './plate';

const readSolar = (el: HTMLElement): Solar => JSON.parse(el.dataset.solar ?? '{}');

/** How long a lens swap takes on the hero camera, in ms (see the .cam-lens transitions). */
const SWAP_MS = 1100;

const setText = (el: Element | null, text: string) => {
  if (el && el.textContent !== text) el.textContent = text;
};
const setStyle = (el: HTMLElement | SVGElement | null, prop: 'transform', value: string) => {
  if (el && el.style[prop] !== value) el.style[prop] = value;
};

/**
 * Bind the moving parts under a root to a day and return its draw(minute). Every part is
 * optional, so the hero and the track share it: each has the parts it draws.
 */
function meter(root: HTMLElement, day: PlayDay, solar: Solar, lensOf: 'camera' | 'stop') {
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T & (HTMLElement | SVGElement)>(s);
  const all = (s: string) => [...root.querySelectorAll<HTMLElement | SVGElement>(s)];
  const needle = q('[data-needle]');
  const sweep = Number(needle?.dataset.sweep ?? 45);
  const dial = q('[data-dial]');
  const fring = q('[data-fring]');
  const iris = q('[data-iris]');
  const rings = all('[data-ring]');
  const lenses = all('[data-lens-label]');
  const follow = all('[data-follow]');
  const notches = all('[data-notch]');
  const clock = q('[data-clock]');
  const reading = q('[data-reading]');
  const phaseLabel = q('[data-phase-label]');
  const stopTag = q('[data-stop-tag]');
  const stopName = q('[data-stop-name]');
  const aperture = q('[data-aperture]');
  const shutter = q('[data-shutter]');
  const support = q('[data-support]');
  const lensName = q('[data-lens-name]');
  const lcd = q('[data-lcd]');
  let mounted: string | undefined;
  let swapEnds = 0;

  return (m: number) => {
    const a = altitude(m, solar);
    const ev = sceneEv(a);
    const r = exposure(ev);
    const p = (m - day.start) / (day.end - day.start);
    setStyle(needle, 'transform', `rotate(${needleAngle(ev, sweep).toFixed(2)}deg)`);
    setStyle(dial, 'transform', `rotate(${dialTurn(r.k)}deg)`);
    setStyle(fring, 'transform', `rotate(${-(r.av - 4) * 36}deg)`);
    setStyle(iris, 'transform', `scale(${irisScale(r.av).toFixed(3)})`);
    for (const ring of rings) setStyle(ring, 'transform', `translateX(${(-r.av * Number(ring.dataset.ring)).toFixed(2)}px)`);
    for (const f of follow) setStyle(f, 'transform', `translateX(${(p * 100).toFixed(2)}%)`);
    notches.forEach((n, i) => n.toggleAttribute('data-lit', (day.stops[i]?.t ?? Infinity) <= m));

    // The stop named is the one being shot, else the next, else the last. The camera keeps
    // the lens of the last stop it reached until the next stop starts; the track lists the
    // lens the named stop calls for.
    const { now, shown } = focusStop(day, m);
    const named = now ?? shown ?? day.stops.at(-1);
    const stop = lensOf === 'camera' ? (lastStop(day, m) ?? day.stops[0]) : named;
    // A drawn lens finishes its swap before the next one starts, so a quick change of lens
    // shows a little late rather than as two lenses crossing on the mount.
    const lens = stop && mountedLens(stop, m);
    const t = performance.now();
    if (lenses.length && lens !== mounted && t >= swapEnds) {
      if (mounted !== undefined) swapEnds = t + SWAP_MS;
      mounted = lens;
      for (const el of lenses) el.toggleAttribute('data-on', el.dataset.lensLabel === lens);
    }

    setText(clock, hhmm(m));
    setText(reading, readingText(r));
    setText(phaseLabel, PHASE_LABEL[phaseAt(m, day.sun)]);
    if (lensOf === 'camera') setText(stopTag, named ? `Stop ${named.n} · ${now ? 'now' : shown ? `at ${hhmm(shown.from)}` : 'done'}` : '');
    else setText(stopTag, now ? 'Now · ' : shown ? `Next ${hhmm(shown.from)} · ` : 'Done · ');
    setText(stopName, named?.name ?? '');
    setText(aperture, `f/${r.f}`);
    setText(shutter, r.shutter);
    setText(lcd, `F${r.f}`);
    setText(support, stop && needsSupport(stop.kit) ? 'On a tripod' : 'Handheld');
    setText(lensName, (lenses.length ? mounted : lens) ?? '');
    return now;
  };
}

function playHero(root: HTMLElement) {
  const day = readDay(root);
  const draw = meter(root, day, readSolar(root), 'camera');
  let wound: number | undefined;
  let last = -Infinity;
  const render = (m: number) => {
    root.dataset.phase = phaseAt(m, day.sun);
    const now = draw(m);
    if (m < last) wound = undefined;
    last = m;
    // Wind on when a stop starts: the advance lever swings out and back.
    if (now && now.n !== wound) {
      wound = now.n;
      root.dataset.wind = root.dataset.wind === 'a' ? 'b' : 'a';
    }
  };
  if (autoplay(root, day, render, { duration: 9000 })) root.toggleAttribute('data-playing', true);
}

function followTrack(track: HTMLElement) {
  const day = readDay(track);
  const row = track.closest<HTMLElement>('[data-track-row]') ?? track;
  const draw = meter(row, day, readSolar(track), 'stop');
  followScroll(day, (m) => draw(m));
}

document.querySelectorAll<HTMLElement>('[data-meter]').forEach(playHero);
document.querySelectorAll<HTMLElement>('[data-mtrack]').forEach(followTrack);
