import { CITY_IDS, LIGHT_LABEL, STYLES, TRIP } from './data';
import { PLAN_SCHEMA, SCHEMA_URL, buildRequest } from './byoai';
import type { Brief, CityId } from './types';

// The prompt builder behind "Your own AI". Required rules keep the answer
// importable and cannot be switched off; everything else is the
// photographer's call: voice, priorities, optional rules, scope and style.

export type Weight = 0 | 1 | 2;
export type PriorityId = 'light' | 'style' | 'walking' | 'crowds' | 'variety' | 'icons';
export type RuleId = 'workHours' | 'halfDay' | 'together' | 'variety' | 'skipped';

export interface PromptConfig {
  target: 'chat' | 'api';
  persona: 'guide' | 'planner' | 'scout';
  priorities: Record<PriorityId, Weight>;
  rules: Record<RuleId, boolean>;
  cities: CityId[];
  tips: boolean;
  why: 'short' | 'detailed';
  language: string;
  extra: string;
}

export const PERSONAS: Record<PromptConfig['persona'], { label: string; text: string }> = {
  guide: {
    label: 'Local guide',
    text: 'You are a local photo guide who knows the Pearl River Delta well, planning a trip for a visiting photographer.',
  },
  planner: {
    label: 'Planner',
    text: 'You are a meticulous trip planner. You optimise for a schedule that works: realistic timing, short transfers and no wasted mornings.',
  },
  scout: {
    label: 'Scout',
    text: 'You are an adventurous location scout. You favour unusual viewpoints and the best light, even when that means early starts and longer walks.',
  },
};

export const PRIORITIES: Record<PriorityId, string> = {
  light: 'shooting each spot in its best light',
  style: 'matching the styles the photographer loves',
  walking: 'short walks and few transfers',
  crowds: 'quiet spots over busy ones',
  variety: 'a different kind of picture at each stop',
  icons: 'the famous views a first-time visitor expects',
};

const LIGHTS = Object.entries(LIGHT_LABEL).map(([k, v]) => `${k} = ${v}`).join(', ');
const STYLE_NAMES = STYLES.map((s) => `${s.id} (${s.label})`).join(', ');

/** Rules the importer depends on. Shown in the builder, never optional. */
export const REQUIRED_RULES = [
  'Use only spot ids from "spots", and on each day only the slot labels in that day\'s "allowedSlots".',
  'A slot\'s spot must be in that day\'s city. On a "movefree" day the "Morning" slot happens in the "from" city before the train and takes 120 minutes or less unless the spot is in "mustSee"; every other slot is in "city". "depart" days have no slots.',
  `A spot fits a slot when one of the spot's "lights" is in the slot type's "lights" (${LIGHTS}).`,
  'Use each spot at most once in the whole trip. "Blue hour" and "Sunset" are the same time of day, so use at most one of them per day.',
  'The brief\'s "text" is the photographer\'s own description: use it for taste and context. Where it disagrees with the structured brief fields, the fields win.',
  `Follow the brief. Prefer spots whose "styles" match the brief's styles (${STYLE_NAMES}) and whose "focal" ranges the photographer's lenses cover. Never use a "tripod": "needed" spot when the gear has neither a tripod nor a clamp, unless it is in "mustSee". Plan every "mustSee" spot; if one truly cannot fit, list it in "skipped" with the reason. Honour "skip" and "avoidCrowds" (crowd 3 is busiest). Pace: "relaxed" means one slot on work days and two on free days, "balanced" means use "suggestedSlots", "packed" means add a slot. Walking "low" means avoid effort-2 and effort-3 spots and never use a "hike": true spot.`,
];

export const OPTIONAL_RULES: Record<RuleId, { label: string; text: string }> = {
  workHours: {
    label: 'Respect working hours',
    text: 'On "work", "arrive" and "movework" days the photographer works 09:00–18:00 (unless "worksWeekdays" is null): use only effort-1 spots, and a "Before work" spot must take 90 minutes or less.',
  },
  halfDay: {
    label: 'Half-day trips only on free mornings',
    text: 'Effort-3 spots are half-day trips: only in a "Morning" or "Midday" slot on a free day.',
  },
  together: {
    label: 'Keep each day compact',
    text: 'Keep each day\'s stops close together, and list them in time order (slotTypes "order").',
  },
  variety: {
    label: 'Vary styles within a day',
    text: 'Avoid two stops of the same main style on the same day when a good alternative exists.',
  },
  skipped: {
    label: 'Explain what was left out',
    text: 'In "skipped", list up to five notable spots you left out, each with a one-line reason. Never list a spot you planned.',
  },
};

export const DEFAULT_PROMPT: PromptConfig = {
  target: 'chat',
  persona: 'guide',
  priorities: { light: 2, style: 2, walking: 1, crowds: 1, variety: 1, icons: 1 },
  rules: { workHours: true, halfDay: true, together: true, variety: false, skipped: true },
  cities: [...CITY_IDS],
  tips: true,
  why: 'short',
  language: '',
  extra: '',
};

export const PRESETS: { id: string; label: string; config: PromptConfig }[] = [
  { id: 'default', label: 'Balanced', config: DEFAULT_PROMPT },
  {
    id: 'lean',
    label: 'Lean & strict',
    config: {
      ...DEFAULT_PROMPT,
      persona: 'planner',
      priorities: { light: 1, style: 2, walking: 2, crowds: 1, variety: 0, icons: 0 },
      rules: { workHours: true, halfDay: true, together: true, variety: false, skipped: false },
      tips: false,
    },
  },
  {
    id: 'scout',
    label: 'Adventurous',
    config: {
      ...DEFAULT_PROMPT,
      persona: 'scout',
      priorities: { light: 2, style: 1, walking: 0, crowds: 2, variety: 2, icons: 0 },
      rules: { workHours: true, halfDay: false, together: false, variety: true, skipped: true },
      why: 'detailed',
    },
  },
];

const WEIGHT_WORD = ['low', 'normal', 'high'] as const;

/** Cities a day touches; a day is in scope when any of them is selected. */
const dayCities = (d: (typeof TRIP.days)[number]): CityId[] => (d.from ? [d.from, d.city] : [d.city]);

export function inScopeDates(cfg: PromptConfig): Set<string> {
  return new Set(TRIP.days.filter((d) => dayCities(d).some((c) => cfg.cities.includes(c))).map((d) => d.date));
}

export function buildPrompt(brief: Brief, cfg: PromptConfig = DEFAULT_PROMPT): string {
  const rules = [
    ...REQUIRED_RULES,
    ...(Object.keys(OPTIONAL_RULES) as RuleId[]).filter((r) => cfg.rules[r] && r !== 'skipped').map((r) => OPTIONAL_RULES[r].text),
  ];
  const partial = cfg.cities.length < CITY_IDS.length;
  if (partial) {
    const names = cfg.cities.map((c) => TRIP.cities[c].name).join(' and ');
    rules.push(`Plan only slots in ${names}. Leave the other days and slots out of "days".`);
  }

  const ranked = (Object.keys(PRIORITIES) as PriorityId[])
    .filter((p) => cfg.priorities[p] > 0)
    .sort((a, b) => cfg.priorities[b] - cfg.priorities[a]);
  const priorities = ranked.map((p) => `- ${PRIORITIES[p]} (${WEIGHT_WORD[cfg.priorities[p]]})`).join('\n');
  const ignored = (Object.keys(PRIORITIES) as PriorityId[]).filter((p) => cfg.priorities[p] === 0).map((p) => PRIORITIES[p]);

  const why = cfg.why === 'detailed'
    ? 'Write "why" as two or three sentences per slot: what to shoot, from where, and which lens or setting.'
    : 'Write "why" as one short sentence per slot.';
  const skipped = cfg.rules.skipped ? OPTIONAL_RULES.skipped.text : 'Return "skipped" as an empty array, except for any must-see spot that could not fit.';
  const language = cfg.language.trim()
    ? `Write every text value ("summary", "title", "why", "note", "reason") in ${cfg.language.trim()}. Keep ids, labels, dates and keys exactly as given.`
    : '';

  const request = buildRequest(brief, { cities: cfg.cities, tips: cfg.tips });
  const output = cfg.target === 'api'
    ? `Return the plan as the JSON object the response format requires (schema: ${SCHEMA_URL}).`
    : 'Return only one JSON object matching the response schema. No markdown fences, no text before or after it.';

  return [
    `${PERSONAS[cfg.persona].text} Choose which photo spot to shoot in each time slot of each day, then return the plan as JSON for PhotoRouter.`,
    '',
    '## Rules',
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    '',
    '## Priorities, most important first',
    priorities || '- none beyond the rules',
    ...(ignored.length ? [`Don't optimise for: ${ignored.join('; ')}.`] : []),
    '',
    '## Writing',
    `${why} Write the day "title" as a short headline and "summary" as two or three sentences to the photographer. Use null for "note" and "title" when you have nothing to add. ${skipped}`,
    ...(language ? [language] : []),
    ...(cfg.extra.trim() ? ['', '## Extra instructions from the photographer', cfg.extra.trim()] : []),
    '',
    output,
    '',
    '## Request',
    JSON.stringify(request),
    ...(cfg.target === 'chat' ? ['', `## Response schema (JSON Schema; also at ${SCHEMA_URL})`, JSON.stringify(PLAN_SCHEMA)] : []),
    '',
  ].join('\n');
}

export const estimateTokens = (text: string) => Math.round(text.length / 3.6);
