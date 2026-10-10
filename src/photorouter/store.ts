import { create } from 'zustand';
import { TRIP } from './lib/data';
import { importResponse, type ImportResult } from './lib/byoai';
import example from './data/example-plan.json';
import { DEFAULT_PROMPT, inScopeDates, type PromptConfig } from './lib/prompt';
import type { Brief, Light, Plan } from './lib/types';

export type Theme = 'light' | 'dark';
export type Basemap = 'detailed' | 'clean';
export type Tab = 'day' | 'plan' | 'spots' | 'kit' | 'info';

interface State {
  brief: Brief;
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

export const useStore = create<State>((set) => ({
  brief: structuredClone(TRIP.brief),
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

/** Check the pasted answer and, when it passes, load it as the plan. Errors leave the current plan alone. */
export function importPlan(): ImportResult {
  const s = useStore.getState();
  const result = importResponse(s.answer, s.brief, { dates: inScopeDates(s.prompt), cities: s.prompt.cities, rules: s.prompt.rules });
  useStore.setState(result.plan ? { result, plan: result.plan, day: null, spot: null, progress: 0, activeStep: null } : { result });
  return result;
}

/**
 * Load the bundled example answer with the brief it was written for, so the
 * map and playback can be tried before running a prompt anywhere.
 */
export function loadExample(): ImportResult {
  const brief = structuredClone(TRIP.brief);
  const answer = JSON.stringify(example, null, 2);
  const result = importResponse(answer, brief);
  useStore.setState({ brief, answer, result, tab: 'plan', ...(result.plan ? { plan: result.plan, day: null, spot: null, progress: 0, activeStep: null } : {}) });
  return result;
}

/** Drop the plan and the pasted answer. The brief and prompt settings stay. */
export function clearPlan() {
  useStore.setState({ plan: null, answer: '', result: null, day: null, spot: null, playing: false, progress: 0, activeStep: null });
}
