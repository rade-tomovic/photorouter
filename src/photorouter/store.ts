import { create } from 'zustand';
import { TRIP, setTrip } from './lib/data';
import { importResponse, type ImportResult } from './lib/byoai';
import { DEMOS, defaultDemo, type Demo } from './lib/demos';
import { DEFAULT_PROMPT, type PromptConfig } from './lib/prompt';
import type { Brief, Light, Plan, Trip } from './lib/types';

export type Theme = 'light' | 'dark';
export type Basemap = 'detailed' | 'clean';
export type Tab = 'day' | 'plan' | 'spots' | 'kit' | 'info';

interface State {
  brief: Brief;
  /** The demo the brief started from; its trip is shown on the map until a plan loads. */
  demo: string | null;
  /** The active trip, mirrored from `lib/data` so components and the map can subscribe to it. */
  trip: Trip;
  plan: Plan | null;

  day: number | null;
  spot: string | null;
  activeStep: number | null;
  playing: boolean;
  speed: 1 | 2;
  progress: number;

  theme: Theme;
  basemap: Basemap;
  /** Prompt builder settings. */
  prompt: PromptConfig;
  terrain: boolean;
  lights: Light[];
  tab: Tab;

  // The plan panel moves between columns at the wide breakpoint, so the pasted
  // answer and its check result live here rather than in the component.
  answer: string;
  result: ImportResult | null;

  set: (p: Partial<State>) => void;
  setBrief: (b: Partial<Brief>) => void;
  toggle: (key: 'gear' | 'styles' | 'lights', id: string) => void;
}

const TEMPLATE_KEY = 'photorouter:prompt-template';

/** A prompt template the viewer saved in this browser, if any. */
export function savedTemplate(): PromptConfig | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw ? { ...DEFAULT_PROMPT, ...(JSON.parse(raw) as Partial<PromptConfig>) } : null;
  } catch {
    return null;
  }
}

export function saveTemplate(cfg: PromptConfig): boolean {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('photorouter:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked: fall back to the system preference */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const EMPTY_BRIEF: Brief = {
  destination: '',
  start: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  days: 10,
  text: '',
  gear: ['ff-body', 'std-24-70'],
  styles: ['street', 'cityscape'],
  pace: 'balanced',
  walking: 'medium',
  work: false,
  fridayEarly: false,
  avoidCrowds: false,
  must: [],
  avoid: [],
};

/** A demo's trip without its plan: the cities and spots to show before anything is loaded. */
function preview(demo: Demo | undefined): Trip {
  const plan = demo ? importResponse(JSON.stringify(demo.answer), demo.brief).plan : null;
  return plan?.trip ?? { title: '', summary: '', tz: 'UTC', cities: {}, legs: {}, days: [], spots: [], arrival: null };
}

/** A demo named in the URL (`/app/?demo=asia-tokyo-kyoto`), as the home page links do. */
function requestedDemo(): Demo | undefined {
  if (typeof location === 'undefined') return undefined;
  const id = new URLSearchParams(location.search).get('demo');
  return id ? DEMOS.find((d) => d.id === id) : undefined;
}

const linked = requestedDemo();
const firstDemo = linked ?? defaultDemo();
setTrip(preview(firstDemo));

export const useStore = create<State>((set) => ({
  brief: structuredClone(firstDemo?.brief ?? EMPTY_BRIEF),
  demo: firstDemo?.id ?? null,
  trip: TRIP,
  plan: null,
  day: null,
  spot: null,
  activeStep: null,
  playing: false,
  speed: 1,
  progress: 0,
  theme: initialTheme(),
  basemap: 'detailed',
  prompt: (typeof localStorage !== 'undefined' && savedTemplate()) || DEFAULT_PROMPT,
  terrain: false,
  lights: ['dawn', 'day', 'golden', 'night'],
  tab: 'plan',
  answer: '',
  result: null,
  set: (p) => set(p),
  setBrief: (b) => set((s) => ({ brief: { ...s.brief, ...b } })),
  toggle: (key, id) =>
    set((s) => {
      if (key === 'lights') {
        const cur = s.lights as string[];
        return { lights: (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) as Light[] };
      }
      const cur: string[] = s.brief[key];
      return { brief: { ...s.brief, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
    }),
}));

const RESET = { day: null, spot: null, progress: 0, activeStep: null, playing: false } as const;

/** Make a trip active: the data module first, then the store, so every reader sees it on the same update. */
function show(trip: Trip, plan: Plan | null, extra: Partial<State> = {}) {
  setTrip(trip);
  useStore.setState({ trip, plan, ...RESET, ...extra });
}

/** Check the pasted answer and, when it passes, load it as the plan. Errors leave the current plan alone. */
export function importPlan(): ImportResult {
  const s = useStore.getState();
  const result = importResponse(s.answer, s.brief, s.prompt.rules);
  if (result.plan) show(result.plan.trip, result.plan, { result });
  else useStore.setState({ result });
  return result;
}

/** Start from a demo: its brief goes into the form and its trip onto the map, with no plan loaded. */
export function chooseDemo(id: string) {
  const demo = DEMOS.find((d) => d.id === id);
  if (!demo) return;
  show(preview(demo), null, { demo: id, brief: structuredClone(demo.brief), answer: '', result: null });
}

/**
 * Load the current demo's ready-made answer with the brief it was written for,
 * so the map and playback can be tried before running a prompt anywhere.
 */
export function loadExample(): ImportResult | null {
  const s = useStore.getState();
  const demo = DEMOS.find((d) => d.id === s.demo) ?? defaultDemo();
  if (!demo) return null;
  const brief = structuredClone(demo.brief);
  const answer = JSON.stringify(demo.answer, null, 2);
  const result = importResponse(answer, brief);
  if (result.plan) show(result.plan.trip, result.plan, { demo: demo.id, brief, answer, result, tab: 'plan' });
  return result;
}

/** Drop the plan and the pasted answer and go back to the demo's map. The brief and prompt settings stay. */
export function clearPlan() {
  const s = useStore.getState();
  show(preview(DEMOS.find((d) => d.id === s.demo)), null, { answer: '', result: null });
}

// Arriving from a demo link: open that demo with its route already loaded.
if (linked) {
  loadExample();
  useStore.setState({ tab: 'day' });
}
