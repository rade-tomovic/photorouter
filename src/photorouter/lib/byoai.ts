import { CITY_IDS, GEAR_BY_ID, LIGHT_LABEL, SPOT, SPOTS, TRIP, weekday } from './data';
import { SLOT, allowedLabels, assemble, effectiveKind, gearProfile, slotCity, slotLabels, type Pick } from './planner';
import type { Brief, CityId, Plan } from './types';

// PhotoRouter writes a prompt with the whole request in it and a JSON Schema
// for the answer. The user's own AI plans the trip; the app validates the JSON
// it returns and turns it into the route.
// The schema keeps to the subset that the structured-output modes of the major
// AI APIs accept: closed objects, every key required, nullable fields as anyOf
// with null, enums instead of numeric or length limits.

export const PLAN_VERSION = 'photorouter.plan/v1';
export const SCHEMA_PATH = '/plan.schema.json';
export const SCHEMA_URL = `https://photorouter.pages.dev${SCHEMA_PATH}`;

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });

export const PLAN_SCHEMA = {
  title: 'PhotoRouter plan',
  description: 'A day-by-day photo route: which spot to shoot in each time slot.',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'summary', 'days', 'skipped'],
  properties: {
    version: { type: 'string', const: PLAN_VERSION },
    summary: { type: 'string', description: 'Two or three sentences to the photographer about the route.' },
    days: {
      type: 'array',
      description: 'One entry per trip day, in date order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'title', 'slots'],
        properties: {
          date: { type: 'string', enum: TRIP.days.map((d) => d.date) },
          title: nullable({ type: 'string', description: 'A short headline for the day.' }),
          slots: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'spotId', 'why', 'note'],
              properties: {
                label: { type: 'string', enum: Object.keys(SLOT) },
                spotId: { type: 'string', enum: SPOTS.map((s) => s.id) },
                why: { type: 'string', description: 'One sentence: why this spot, in this slot, for this photographer.' },
                note: nullable({ type: 'string', description: 'An optional practical tip.' }),
              },
            },
          },
        },
      },
    },
    skipped: {
      type: 'array',
      description: 'Notable spots left out, with the reason.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['spotId', 'reason'],
        properties: {
          spotId: { type: 'string', enum: SPOTS.map((s) => s.id) },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface PlanResponse {
  version: string;
  summary: string;
  days: { date: string; title: string | null; slots: { label: string; spotId: string; why: string; note: string | null }[] }[];
  skipped: { spotId: string; reason: string }[];
}

/** Everything the AI needs, as one JSON document. */
export function buildRequest(brief: Brief, opts: { cities?: CityId[]; tips?: boolean } = {}) {
  const cities = opts.cities ?? CITY_IDS;
  const tips = opts.tips ?? true;
  return {
    version: 'photorouter.request/v1',
    trip: {
      region: TRIP.region,
      dates: TRIP.dates,
      timezone: `UTC+${TRIP.tz}`,
      cities: Object.fromEntries(
        Object.entries(TRIP.cities).map(([id, c]) => [id, { name: c.name, base: `${c.baseLabel}`, lngLat: c.base }]),
      ),
    },
    brief: {
      text: brief.text,
      gear: brief.gear.map((id) => ({ id, label: GEAR_BY_ID[id]?.label ?? id, focal: GEAR_BY_ID[id]?.focal ?? null })),
      styles: brief.styles,
      pace: brief.pace,
      walking: brief.walking,
      worksWeekdays: brief.work ? '09:00–18:00' : null,
      fridayFinishesEarly: brief.work && brief.fridayEarly,
      avoidCrowds: brief.avoidCrowds,
      mustSee: brief.must,
      skip: brief.avoid,
    },
    slotTypes: Object.fromEntries(Object.entries(SLOT).map(([label, d]) => [label, { lights: d.lights, order: d.order }])),
    days: TRIP.days.flatMap((d, i) => {
      if (![d.city, ...(d.from ? [d.from] : [])].some((c) => cities.includes(c))) return [];
      const kind = effectiveKind(d, brief);
      const leg = d.leg ? TRIP.legs[d.leg]! : null;
      return [{
        date: d.date,
        weekday: weekday(d.date),
        kind,
        city: d.city,
        from: d.from ?? null,
        train: leg ? `${leg.from} → ${leg.to}, ${leg.minutes} min` : null,
        allowedSlots: allowedLabels(d, brief),
        suggestedSlots: slotLabels(d, i, brief),
      }];
    }),
    spots: SPOTS.filter((s) => cities.includes(s.city)).map((s) => ({
      id: s.id,
      city: s.city,
      name: s.name,
      lights: s.lights,
      bestTime: s.when,
      styles: s.styles,
      focal: s.focal,
      tripod: s.tripod,
      minutes: s.minutes,
      effort: s.effort,
      crowd: s.crowd,
      droneFriendly: s.drone,
      hike: !!s.hike,
      lngLat: s.ll,
      ...(tips ? { tip: s.tip } : {}),
    })),
  };
}

/** The current plan in the response format: an example answer, and a way to take a plan elsewhere. */
export function toResponse(plan: Plan, summary: string): PlanResponse {
  return {
    version: PLAN_VERSION,
    summary,
    days: plan.days.map((d) => ({
      date: d.date,
      title: d.title,
      slots: d.slots.map((s) => ({ label: s.label, spotId: s.spotId, why: s.why, note: s.note ?? null })),
    })),
    skipped: plan.skipped,
  };
}

export interface ImportResult {
  plan: Plan | null;
  summary: string;
  errors: string[];
  warnings: string[];
}

/** Pull a JSON object out of whatever was pasted: fences, chatter around it, a trailing note. */
function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const text = (fenced ? fenced[1]! : raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found in the pasted text.');
  return JSON.parse(text.slice(start, end + 1));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Validate a pasted response against the schema and the trip's own rules.
 * Errors block the import; warnings are shown but the plan still loads.
 */
/** What the prompt asked for: days that touch these cities, and only slots in them. */
export interface ImportScope {
  dates: Set<string>;
  cities: CityId[];
  /** Scheduling rules the prompt switched on; both default to on, as in the built-in planner. */
  rules?: Partial<Record<'workHours' | 'halfDay', boolean>>;
}

export function importResponse(raw: string, brief: Brief, scope?: ImportScope): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (e: string): ImportResult => ({ plan: null, summary: '', errors: [e], warnings });

  let data: unknown;
  try {
    data = extractJson(raw);
  } catch (e) {
    return fail(e instanceof SyntaxError ? `Not valid JSON: ${e.message}` : (e as Error).message);
  }
  if (!isObj(data)) return fail('The response must be a JSON object.');
  if (data.version !== PLAN_VERSION) warnings.push(`"version" should be "${PLAN_VERSION}".`);
  if (!Array.isArray(data.days)) return fail('"days" must be an array.');

  const index = new Map(TRIP.days.map((d, i) => [d.date, i]));
  const days: { picks: Pick[]; title?: string }[] = TRIP.days.map(() => ({ picks: [] }));
  const seenDates = new Set<string>();
  const used = new Map<string, string>();
  const gear = gearProfile(brief);

  for (const [di, d] of data.days.entries()) {
    const at = `days[${di}]`;
    if (!isObj(d)) { errors.push(`${at} must be an object.`); continue; }
    const date = str(d.date);
    const i = date ? index.get(date) : undefined;
    if (i == null) { errors.push(`${at}.date "${String(d.date)}" is not a trip date (${TRIP.days[0]!.date} to ${TRIP.days.at(-1)!.date}).`); continue; }
    if (seenDates.has(date!)) { errors.push(`${at}: ${date} appears twice.`); continue; }
    seenDates.add(date!);
    if (scope && !scope.dates.has(date!)) { warnings.push(`${date} is outside the cities the prompt covered, so it was ignored.`); continue; }
    const frame = TRIP.days[i]!;
    const kind = effectiveKind(frame, brief);
    const title = str(d.title);
    if (title) days[i]!.title = title;
    if (!Array.isArray(d.slots)) { errors.push(`${at}.slots must be an array.`); continue; }
    const labels = new Set<string>();
    const orders = new Map<number, string>();

    for (const [si, s] of d.slots.entries()) {
      const where = `${date} slot ${si + 1}`;
      if (!isObj(s)) { errors.push(`${where} must be an object.`); continue; }
      const label = str(s.label);
      const spotId = str(s.spotId);
      if (!label || !SLOT[label]) { errors.push(`${where}: unknown slot label "${String(s.label)}".`); continue; }
      if (!spotId || !SPOT[spotId]) { errors.push(`${where}: unknown spotId "${String(s.spotId)}".`); continue; }
      if (kind === 'depart') { errors.push(`${where}: ${date} is a travel day with no slots.`); continue; }
      if (labels.has(label)) { errors.push(`${where}: "${label}" is used twice on ${date}.`); continue; }
      const same = orders.get(SLOT[label]!.order);
      if (same) { errors.push(`${where}: "${label}" and "${same}" are the same time of day; use one of them on ${date}.`); continue; }
      if (!allowedLabels(frame, brief).includes(label)) {
        errors.push(`${where}: "${label}" doesn't fit ${date} (${kind === 'work' ? 'a 09:00–18:00 work day' : `a ${kind} day`}). Allowed: ${allowedLabels(frame, brief).join(', ')}.`);
        continue;
      }
      labels.add(label);
      orders.set(SLOT[label]!.order, label);
      const spot = SPOT[spotId]!;
      const city = slotCity(frame, kind, label);
      if (spot.city !== city) {
        errors.push(`${where}: ${spot.name} is in ${TRIP.cities[spot.city].name}, but that slot is in ${TRIP.cities[city].name}.`);
        continue;
      }
      if (scope && !scope.cities.includes(city)) {
        warnings.push(`${where}: ${TRIP.cities[city].name} is outside the cities the prompt covered, so ${spot.name} was ignored.`);
        continue;
      }
      if (!spot.lights.some((l) => SLOT[label]!.lights.includes(l))) {
        errors.push(`${where}: ${spot.name} is shot at ${LIGHT_LABEL[spot.light].toLowerCase()}, which a "${label}" slot doesn't have.`);
        continue;
      }
      if (brief.avoid.includes(spotId)) { errors.push(`${where}: ${spot.name} is on your skip list.`); continue; }
      // The same hard limits the built-in planner applies; a must-see overrides them.
      const must = brief.must.includes(spotId);
      if (!must && spot.tripod === 'needed' && !gear.tripod && !gear.clamp) {
        errors.push(`${where}: ${spot.name} needs a tripod, and the kit has neither a tripod nor a clamp.`);
        continue;
      }
      if (!must && spot.hike && brief.walking === 'low') {
        errors.push(`${where}: ${spot.name} is a real hike, and the brief asks for easy walking.`);
        continue;
      }
      if (!must && spot.crowd === 3 && brief.avoidCrowds) {
        errors.push(`${where}: ${spot.name} is one of the busiest spots, and the brief avoids crowds.`);
        continue;
      }
      const workish = kind === 'work' || kind === 'arrive' || kind === 'movework';
      if (scope?.rules?.workHours !== false && workish && spot.effort > 1) {
        errors.push(`${where}: ${spot.name} is a ${Math.round(spot.minutes / 60)}-hour outing, too long for a work day.`);
        continue;
      }
      if (scope?.rules?.workHours !== false && label === 'Before work' && spot.minutes > 90) {
        errors.push(`${where}: ${spot.name} takes ${spot.minutes} minutes; a "Before work" stop gets 90.`);
        continue;
      }
      if (!must && kind === 'movefree' && label === 'Morning' && spot.minutes > 120) {
        errors.push(`${where}: ${spot.name} takes ${spot.minutes} minutes; the morning before the train gets 120.`);
        continue;
      }
      if (scope?.rules?.halfDay !== false && spot.effort === 3 && !(kind === 'free' && (label === 'Morning' || label === 'Midday'))) {
        errors.push(`${where}: ${spot.name} is a half-day trip; it only fits a "Morning" or "Midday" slot on a free day.`);
        continue;
      }
      if (used.has(spotId)) { errors.push(`${where}: ${spot.name} is already planned on ${used.get(spotId)}; each spot can appear once.`); continue; }
      used.set(spotId, date!);
      const note = str(s.note);
      days[i]!.picks.push({ label, city, spotId, score: 0, why: str(s.why) ?? '', ...(note ? { note } : {}) });
    }
    // Pace, as the prompt defines it: relaxed is one stop on a work day and two on a free one,
    // balanced uses the suggested slots, packed may add one more.
    const workDay = kind === 'work' || kind === 'arrive' || kind === 'movework';
    const suggested = slotLabels(frame, i, brief).length;
    const cap = brief.pace === 'relaxed' ? (workDay ? 1 : 2) : brief.pace === 'packed' ? suggested + 1 : suggested;
    if (days[i]!.picks.length > cap) {
      errors.push(`${date}: ${days[i]!.picks.length} stops, but a ${brief.pace} pace allows ${cap} that day.`);
    }
  }

  const skipped = Array.isArray(data.skipped)
    ? data.skipped.flatMap((x) => {
        const id = isObj(x) ? str(x.spotId) : undefined;
        // A planned spot can't also be "left out", and spots outside the prompt's cities were never offered.
        return id && SPOT[id] && !used.has(id) && (!scope || scope.cities.includes(SPOT[id]!.city)) ? [{ spotId: id, reason: str((x as Record<string, unknown>).reason) ?? '' }] : [];
      })
    : [];

  // Every must-see in scope is planned, or explained in "skipped".
  for (const id of brief.must) {
    const spot = SPOT[id];
    if (!spot || used.has(id) || (scope && !scope.cities.includes(spot.city))) continue;
    const left = skipped.find((x) => x.spotId === id);
    if (left) warnings.push(`Must-see ${spot.name} was left out${left.reason ? `: ${left.reason}` : '.'}`);
    else errors.push(`Must-see ${spot.name} is missing. Plan it, or list it in "skipped" with the reason it can't fit.`);
  }

  const missing = TRIP.days.filter((d) => !seenDates.has(d.date) && d.kind !== 'depart' && (!scope || scope.dates.has(d.date))).length;
  if (missing) warnings.push(`${missing} trip day${missing > 1 ? 's are' : ' is'} missing and will be left empty.`);
  if (errors.length) return { plan: null, summary: '', errors, warnings };
  return { plan: assemble(brief, days, skipped), summary: str(data.summary) ?? '', errors, warnings };
}
