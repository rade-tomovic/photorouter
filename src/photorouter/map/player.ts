import { SPOT, TRIP } from '../lib/data';
import type { LngLat } from '../lib/types';
import { useStore } from '../store';
import type { TripMap } from './engine';

// Sequences the trip on the map: which leg rides when, where the walker goes,
// and what the panels highlight. One run at a time; any new action cancels it.

let engine: TripMap | null = null;
let seq = 0;
/** A day selection is animating (train ride, framing, route drawing) outside playback. */
let running = false;
/** Where playback is: Pause keeps it so Play picks up there; any other navigation clears it. */
let cursor: { day: number; step: number } | null = null;
let resumeAt: { day: number; step: number } | null = null;

export const setEngine = (e: TripMap | null) => { engine = e; };

// A new plan (replan, chat change or import) replaces what is being animated.
useStore.subscribe((now, prev) => {
  if (now.plan !== prev.plan) {
    stop();
    resumeAt = null;
  }
});
export const getEngine = () => engine;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const speed = () => useStore.getState().speed;
const dur = (ms: number) => ms / speed();

/** On the stacked phone layout the map can be scrolled away; bring it back for map actions. */
function reveal() {
  const el = engine?.map.getContainer();
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 120 || r.top > innerHeight * 0.5) {
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function begin(): number {
  engine?.cancel();
  return ++seq;
}

/** Pick a day: ride its leg, then frame its stops and draw the route between them. */
export async function selectDay(i: number) {
  stop();
  resumeAt = null;
  const tok = begin();
  const { plan } = useStore.getState();
  if (!engine || !plan) return;
  const day = plan.days[i]!;
  reveal();
  running = true;
  useStore.setState({ day: i, spot: null, activeStep: null, progress: 0 });
  engine.setSelected(null);
  engine.setDay(i, { walkDrawn: false });
  try {
    if (day.leg) {
      const L = TRIP.legs[day.leg]!;
      await engine.approach(L.pts[0]!);
      if (tok !== seq) return;
      await engine.runLeg(day.leg, 2600);
      if (tok !== seq) return;
    }
    useStore.setState({ progress: 1 });
    await engine.fitDay(i, 1100);
    if (tok !== seq) return;
    await engine.drawDay(900);
  } finally {
    if (tok === seq) running = false;
  }
}

/** Where the traveller stands after a step: the end of a rail leg, or the stop itself. */
function after(i: number, k: number): LngLat | null {
  const day = useStore.getState().plan?.days[i];
  const step = day?.steps[k];
  if (!day || !step) return null;
  if (step.type === 'leg') return TRIP.legs[step.leg]!.pts.at(-1)!;
  return SPOT[day.slots[step.slot]!.spotId]!.ll;
}

async function playDay(i: number, tok: number, from = 0): Promise<boolean> {
  const { plan } = useStore.getState();
  if (!engine || !plan) return false;
  const day = plan.days[i]!;
  const n = day.steps.length || 1;
  useStore.setState({ day: i, spot: null, activeStep: null, progress: from / n });
  engine.setSelected(null);
  engine.setDay(i, { walkDrawn: false });

  let prev: LngLat | null = from > 0 ? after(i, from - 1) : null;
  for (const [k, step] of day.steps.entries()) {
    if (k < from) continue;
    cursor = { day: i, step: k };
    if (tok !== seq) return false;
    if (step.type === 'leg') {
      useStore.setState({ activeStep: -1 });
      const L = TRIP.legs[step.leg]!;
      await engine.approach(L.pts[0]!);
      if (tok !== seq) return false;
      if (!(await engine.runLeg(step.leg, dur(3600)))) return false;
      prev = L.pts[L.pts.length - 1]!;
    } else {
      const slot = day.slots[step.slot]!;
      const from: LngLat = prev ?? TRIP.cities[slot.city]!.base;
      if (!(await engine.walkTo(from, slot.spotId, dur(1300)))) return false;
      useStore.setState({ activeStep: step.slot });
      engine.setCurrent(slot.spotId);
      if (!(await engine.arrive(slot.spotId, dur(1000), dur(1500)))) return false;
      prev = SPOT[slot.spotId]!.ll;
    }
    useStore.setState({ progress: (k + 1) / n });
  }
  if (!day.steps.length) await sleep(dur(800));
  engine.setCurrent(null);
  cursor = { day: i + 1, step: 0 };
  return tok === seq;
}

export async function play() {
  const s = useStore.getState();
  if (!s.plan || !engine) return;
  const tok = begin();
  // After a pause, pick up at the step that was playing; otherwise start at the selected day.
  const resume = resumeAt && resumeAt.day < s.plan.days.length ? resumeAt : null;
  resumeAt = null;
  const start = resume ? resume.day : s.day == null || s.day >= s.plan.days.length - 1 ? 0 : s.day;
  cursor = { day: start, step: resume?.step ?? 0 };
  useStore.setState({ playing: true });
  if (s.day == null && !resume) {
    await engine.overview(900);
    if (tok !== seq) return;
  }
  for (let i = start; i < s.plan.days.length; i++) {
    if (!(await playDay(i, tok, i === start ? resume?.step ?? 0 : 0))) return;
    await sleep(dur(350));
    if (tok !== seq) return;
  }
  cursor = null;
  useStore.setState({ playing: false, activeStep: null });
  await engine.fitDay(s.plan.days.length - 1, 1000);
}

export function stop() {
  if (!useStore.getState().playing && !running) return;
  // Pausing (or grabbing the map) mid-playback remembers the step for the next Play.
  if (useStore.getState().playing) resumeAt = cursor;
  running = false;
  seq++;
  engine?.cancel();
  useStore.setState({ playing: false });
}

export function togglePlay() {
  if (useStore.getState().playing) stop();
  else void play();
}

export async function overview() {
  stop();
  resumeAt = null;
  begin();
  useStore.setState({ day: null, spot: null, activeStep: null, progress: 0 });
  engine?.setSelected(null);
  engine?.setDay(null);
  await engine?.overview(1000);
}

export function step(delta: number) {
  const { plan, day } = useStore.getState();
  if (!plan) return;
  const next = day == null ? (delta > 0 ? 0 : plan.days.length - 1) : Math.max(0, Math.min(plan.days.length - 1, day + delta));
  void selectDay(next);
}

export function selectSpot(id: string | null) {
  stop();
  useStore.setState({ spot: id });
  engine?.setSelected(id);
  if (id) {
    reveal();
    void engine?.focusSpot(id);
  }
}
