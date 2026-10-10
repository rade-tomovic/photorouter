import { LIGHT_LABEL, STYLES, tripDates } from './data';
import { SCHEMA_URL, buildRequest, planSchema } from './byoai';
import type { Brief } from './types';

// The prompt builder. Required rules keep the answer importable and cannot be
// switched off; everything else is the photographer's call: voice,
// priorities, optional rules and style.

export type Weight = 0 | 1 | 2;
export type PriorityId = 'light' | 'style' | 'walking' | 'crowds' | 'variety' | 'icons';
export type RuleId = 'workHours' | 'halfDay' | 'together' | 'variety' | 'skipped';

export interface PromptConfig {
  target: 'chat' | 'api';
  persona: 'guide' | 'planner' | 'scout';
  priorities: Record<PriorityId, Weight>;
  rules: Record<RuleId, boolean>;
  why: 'short' | 'detailed';
  language: string;
  extra: string;
}

export const PERSONAS: Record<PromptConfig['persona'], { label: string; text: string }> = {
  guide: {
    label: 'Local guide',
    text: 'You are a local photo guide who knows the destination well, planning a trip for a visiting photographer.',
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
  'Plan a real trip to the destination over exactly the dates in "trip.dates". Choose the cities, a base in each, and real photo spots with accurate coordinates (the viewpoint, not the city centre). Every spot used in "days" must be listed in "spots", and every spot must be within 150 km of its city.',
  'Return one "days" entry per date, in order. "cityId" is where the photographer sleeps. The first day is the arrival from home: its "travel" has "fromCityId": null. Any later day that changes city has a "travel" from the previous night\'s city; a day without "travel" stays in the same city. For a day trip (out to another city and back the same day, which is often better than an extra hotel night), keep "cityId" as the city slept in and set "dayTrip" to the city visited, listed in "cities" with the station or centre as its base; that day\'s slots can be in either city. A day has "travel" or "dayTrip", never both.',
  'Each date lists the day kinds it can be, with "allowedSlots" and "maxStops" for each: "arrival" for the first day, "stayDay" without travel, "travelDay" with it and "dayTripDay" for a day trip. Use only the allowed slot labels, at most "maxStops" slots, and each label once per day. On a "movefree" travel day the "Morning" slot is in the city being left and takes 120 minutes or less unless the spot is a must-see; every other slot is in "cityId".',
  `A spot fits a slot when one of the spot's "lights" is in the slot type's "lights" (${LIGHTS}). "Blue hour" and "Sunset" are the same time of day, so use at most one of them per day.`,
  'Use each spot at most once in the whole trip.',
  'The brief\'s "text" is the photographer\'s own description: use it for taste and context. Where it disagrees with the structured brief fields, the fields win.',
  `Follow the brief. Prefer spots whose "styles" match the brief's styles (${STYLE_NAMES}) and whose "focal" ranges the photographer's lenses cover (each lens lists its focal classes on this body; a fast lens, f/2 or brighter, makes handheld night spots realistic). Never use a "tripod": "needed" spot when the gear has neither a tripod nor a clamp, unless it is a must-see. Plan every place in "mustSee"; if one truly cannot fit, list it in "skipped" with the reason. Never plan a place in "skip". With "avoidCrowds", never use a crowd-3 spot unless it is a must-see. Walking "low" means avoid effort-2 and effort-3 spots and never use a "hike": true spot.`,
];

export const OPTIONAL_RULES: Record<RuleId, { label: string; text: string }> = {
  workHours: {
    label: 'Respect working hours',
    text: 'On working weekdays (when "worksWeekdays" is set) the photographer works 09:00-18:00: on "work", "movework" and working-day arrivals use only effort-1 spots, and a "Before work" spot takes 90 minutes or less.',
  },
  halfDay: {
    label: 'Half-day trips only on free mornings',
    text: 'Effort-3 spots are half-day trips: only in a "Morning" or "Midday" slot on a "free" day.',
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
    text: 'In "skipped", list up to five notable places you left out, each with a one-line reason. Never list a place you planned.',
  },
};

export const DEFAULT_PROMPT: PromptConfig = {
  target: 'chat',
  persona: 'guide',
  priorities: { light: 2, style: 2, walking: 1, crowds: 1, variety: 1, icons: 1 },
  rules: { workHours: true, halfDay: true, together: true, variety: false, skipped: true },
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

export function buildPrompt(brief: Brief, cfg: PromptConfig = DEFAULT_PROMPT): string {
  const rules = [
    ...REQUIRED_RULES,
    ...(Object.keys(OPTIONAL_RULES) as RuleId[]).filter((r) => cfg.rules[r] && r !== 'skipped').map((r) => OPTIONAL_RULES[r].text),
  ];

  const ranked = (Object.keys(PRIORITIES) as PriorityId[])
    .filter((p) => cfg.priorities[p] > 0)
    .sort((a, b) => cfg.priorities[b] - cfg.priorities[a]);
  const priorities = ranked.map((p) => `- ${PRIORITIES[p]} (${WEIGHT_WORD[cfg.priorities[p]]})`).join('\n');
  const ignored = (Object.keys(PRIORITIES) as PriorityId[]).filter((p) => cfg.priorities[p] === 0).map((p) => PRIORITIES[p]);

  const why = cfg.why === 'detailed'
    ? 'Write "why" as two or three sentences per slot: what to shoot, from where, and which lens or setting.'
    : 'Write "why" as one short sentence per slot.';
  const skipped = cfg.rules.skipped ? OPTIONAL_RULES.skipped.text : 'Return "skipped" as an empty array, except for any must-see place that could not fit.';
  const language = cfg.language.trim()
    ? `Write every text value ("title", "summary", "when", "tip", "why", "note", "reason") in ${cfg.language.trim()}. Keep ids, labels, dates, enum values and keys exactly as given.`
    : '';

  const request = buildRequest(brief);
  const schema = planSchema(tripDates(brief.start, brief.days));
  const output = cfg.target === 'api'
    ? `Return the plan as the JSON object the response format requires (schema: ${SCHEMA_URL}).`
    : 'Return only one JSON object matching the response schema. No markdown fences, no text before or after it.';

  return [
    `${PERSONAS[cfg.persona].text} Plan a photo trip to ${brief.destination || 'the destination in the request'}: pick the cities and photo spots, decide which spot to shoot in each time slot of each day, and return the plan as JSON for PhotoRouter.`,
    '',
    '## Rules',
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    '',
    '## Priorities, most important first',
    priorities || '- none beyond the rules',
    ...(ignored.length ? [`Don't optimise for: ${ignored.join('; ')}.`] : []),
    '',
    '## Writing',
    `${why} Give each spot a "when" of a few words and a "tip" of one or two sentences on where to stand. Write the day "title" as a short headline and "summary" as two or three sentences to the photographer. Use null for "note", "title" and "localName" when you have nothing to add. ${skipped}`,
    ...(language ? [language] : []),
    ...(cfg.extra.trim() ? ['', '## Extra instructions from the photographer', cfg.extra.trim()] : []),
    '',
    output,
    '',
    '## Request',
    JSON.stringify(request),
    ...(cfg.target === 'chat' ? ['', `## Response schema (JSON Schema; generic form at ${SCHEMA_URL})`, JSON.stringify(schema)] : []),
    '',
  ].join('\n');
}

export const estimateTokens = (text: string) => Math.round(text.length / 3.6);
