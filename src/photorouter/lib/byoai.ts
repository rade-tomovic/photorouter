import { GEAR_BY_ID, LIGHT_LABEL, STYLES, tripDates, weekday } from './data';
import { arc, km } from './geo';
import { SLOT, assemble, dayKind, gearProfile, labelsFor, slotCity, stopCap, type Pick } from './planner';
import { validTimeZone } from './sun';
import type { Brief, City, DayFrame, Focal, Leg, Light, LngLat, Plan, Spot, StyleId, TravelMode, Trip } from './types';

// PhotoRouter writes a prompt with the whole request in it and a JSON Schema
// for the answer. The user's own AI plans the trip: it picks the cities, the
// photo spots with their coordinates and light, the travel days and the slot
// for each spot. The app validates the JSON it returns and turns it into the
// route. The schema keeps to the subset that the structured-output modes of
// the major AI APIs accept: closed objects, every key required, nullable
// fields as anyOf with null, enums instead of numeric or length limits.

export const PLAN_VERSION = 'photorouter.plan/v2';
export const SCHEMA_PATH = '/plan.schema.json';
export const SCHEMA_URL = `https://photorouter.pages.dev${SCHEMA_PATH}`;

const LIGHTS: Light[] = ['dawn', 'day', 'golden', 'night'];
const FOCALS: Focal[] = ['ultrawide', 'wide', 'standard', 'tele'];
const MODES: TravelMode[] = ['train', 'ferry', 'flight', 'bus', 'car'];
const STYLE_IDS = STYLES.map((s) => s.id);

/** How far a spot may sit from its city's centre before the coordinates are taken to be wrong. */
const MAX_SPOT_KM = 150;

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

/** The response schema. With dates it pins the answer to one trip; without, it is the published generic form. */
export function planSchema(dates?: string[]) {
  return {
    title: 'PhotoRouter plan',
    description: 'A photo trip: cities, photo spots with coordinates and light, and which spot to shoot in each time slot of each day.',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'title', 'summary', 'timezone', 'cities', 'spots', 'days', 'skipped'],
    properties: {
      version: { type: 'string', const: PLAN_VERSION },
      title: str('A short name for the trip, e.g. "Lisbon and Porto in spring".'),
      summary: str('Two or three sentences to the photographer about the route.'),
      timezone: str('IANA time zone of the destination, e.g. "Europe/Lisbon".'),
      cities: {
        type: 'array',
        description: 'Every city the trip stays in, in the order they are first visited.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'localName', 'lat', 'lng', 'base'],
          properties: {
            id: str('Short lowercase id, e.g. "lis".'),
            name: str('City name in English.'),
            localName: nullable(str('Name in the local language or script, when it differs.')),
            lat: num('Latitude of the city centre.'),
            lng: num('Longitude of the city centre.'),
            base: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'lat', 'lng'],
              properties: {
                label: str('Where to stay, e.g. "near Rossio".'),
                lat: num('Latitude of the suggested base.'),
                lng: num('Longitude of the suggested base.'),
              },
            },
          },
        },
      },
      spots: {
        type: 'array',
        description: 'Every photo spot used in "days". Real places with accurate coordinates.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'cityId', 'name', 'localName', 'lat', 'lng', 'light', 'lights', 'when', 'tip', 'styles', 'focal', 'tripod', 'minutes', 'effort', 'crowd', 'drone', 'hike'],
          properties: {
            id: str('Short lowercase id, unique in the trip, e.g. "belem-tower".'),
            cityId: str('Id of the city the spot belongs to.'),
            name: str('Name in English.'),
            localName: nullable(str('Name in the local language or script, for taxis and signs, when it differs.')),
            lat: num('Latitude of the viewpoint.'),
            lng: num('Longitude of the viewpoint.'),
            light: { type: 'string', enum: LIGHTS, description: 'The best light for this spot.' },
            lights: { type: 'array', items: { type: 'string', enum: LIGHTS }, description: 'Every light that works here, including "light".' },
            when: str('Best time in a few words, e.g. "Sunrise, from the river side".'),
            tip: str('One or two sentences: where to stand and what to shoot.'),
            styles: { type: 'array', items: { type: 'string', enum: STYLE_IDS } },
            focal: { type: 'array', items: { type: 'string', enum: FOCALS }, description: 'Focal ranges that work, best first.' },
            tripod: { type: 'string', enum: ['needed', 'helps', 'no', 'banned'] },
            minutes: { type: 'integer', description: 'Time to give the spot, travel to it excluded.' },
            effort: { type: 'integer', enum: [1, 2, 3], description: '1 walk-up, 2 a climb or a ride out, 3 a half-day trip.' },
            crowd: { type: 'integer', enum: [1, 2, 3], description: '1 quiet, 3 one of the busiest places in the city.' },
            drone: { type: 'boolean', description: 'Drones are allowed and it is worth flying.' },
            hike: { type: 'boolean', description: 'Getting there is a real hike, not a short climb.' },
          },
        },
      },
      days: {
        type: 'array',
        description: 'One entry per trip date, in date order, including days with no slots.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'cityId', 'title', 'travel', 'slots'],
          properties: {
            date: dates ? { type: 'string', enum: dates } : str('YYYY-MM-DD'),
            cityId: str('The city slept in that night.'),
            title: nullable(str('A short headline for the day.')),
            travel: nullable({
              type: 'object',
              additionalProperties: false,
              required: ['fromCityId', 'mode', 'label', 'minutes'],
              properties: {
                fromCityId: nullable(str('City left that morning; null on the first day, arriving from home.')),
                mode: { type: 'string', enum: MODES },
                label: str('E.g. "Alfa Pendular train" or "Flight from home".'),
                minutes: nullable({ type: 'integer', description: 'Door-to-door time, roughly.' }),
              },
            }),
            slots: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'spotId', 'why', 'note'],
                properties: {
                  label: { type: 'string', enum: Object.keys(SLOT) },
                  spotId: str('Id of a spot in "spots".'),
                  why: str('Why this spot, in this slot, for this photographer.'),
                  note: nullable(str('An optional practical tip.')),
                },
              },
            },
          },
        },
      },
      skipped: {
        type: 'array',
        description: 'Notable places left out, with the reason.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'reason'],
          properties: { name: { type: 'string' }, reason: { type: 'string' } },
        },
      },
    },
  } as const;
}

export const PLAN_SCHEMA = planSchema();

export interface PlanResponse {
  version: string;
  title: string;
  summary: string;
  timezone: string;
  cities: { id: string; name: string; localName: string | null; lat: number; lng: number; base: { label: string; lat: number; lng: number } }[];
  spots: {
    id: string; cityId: string; name: string; localName: string | null; lat: number; lng: number; light: Light; lights: Light[];
    when: string; tip: string; styles: StyleId[]; focal: Focal[]; tripod: Spot['tripod']; minutes: number; effort: 1 | 2 | 3;
    crowd: 1 | 2 | 3; drone: boolean; hike: boolean;
  }[];
  days: {
    date: string; cityId: string; title: string | null;
    travel: { fromCityId: string | null; mode: TravelMode; label: string; minutes: number | null } | null;
    slots: { label: string; spotId: string; why: string; note: string | null }[];
  }[];
  skipped: { name: string; reason: string }[];
}

/** Everything the AI needs, as one JSON document. */
export function buildRequest(brief: Brief) {
  const dates = tripDates(brief.start, brief.days);
  const kind = (date: string, travels: boolean, first: boolean) => {
    const k = dayKind(date, travels, first, brief);
    return { kind: k, allowedSlots: labelsFor(k, date, brief), maxStops: stopCap(k, brief) };
  };
  return {
    version: 'photorouter.request/v2',
    trip: {
      destination: brief.destination,
      startDate: brief.start,
      days: dates.length,
      dates: dates.map((date, i) =>
        i === 0
          ? { date, weekday: weekday(date), arrival: kind(date, true, true) }
          : { date, weekday: weekday(date), stayDay: kind(date, false, false), travelDay: kind(date, true, false) },
      ),
    },
    brief: {
      text: brief.text,
      gear: brief.gear.map((id) => ({ id, label: GEAR_BY_ID[id]?.label ?? id, focal: GEAR_BY_ID[id]?.focal ?? null })),
      styles: brief.styles,
      pace: brief.pace,
      walking: brief.walking,
      worksWeekdays: brief.work ? '09:00-18:00' : null,
      fridayFinishesEarly: brief.work && brief.fridayEarly,
      avoidCrowds: brief.avoidCrowds,
      mustSee: brief.must,
      skip: brief.avoid,
    },
    slotTypes: Object.fromEntries(Object.entries(SLOT).map(([label, d]) => [label, { lights: d.lights, order: d.order }])),
    lights: LIGHT_LABEL,
  };
}

/** A loaded plan back in the response format: to share, edit, or hand back to an AI for changes. */
export function toResponse(plan: Plan): PlanResponse {
  const { trip } = plan;
  return {
    version: PLAN_VERSION,
    title: trip.title,
    summary: trip.summary,
    timezone: trip.tz,
    cities: Object.values(trip.cities)
      .sort((a, b) => a.color - b.color)
      .map((c) => ({ id: c.id, name: c.name, localName: c.local, lat: c.ll[1], lng: c.ll[0], base: { label: c.baseLabel, lat: c.base[1], lng: c.base[0] } })),
    spots: trip.spots.map((s) => ({
      id: s.id, cityId: s.city, name: s.name, localName: s.local, lat: s.ll[1], lng: s.ll[0], light: s.light, lights: s.lights,
      when: s.when, tip: s.tip, styles: s.styles, focal: s.focal, tripod: s.tripod, minutes: s.minutes, effort: s.effort,
      crowd: s.crowd, drone: s.drone, hike: s.hike,
    })),
    days: plan.days.map((d, i) => ({
      date: d.date,
      cityId: d.city,
      title: d.title || null,
      travel: d.leg
        ? { fromCityId: d.from ?? null, mode: trip.legs[d.leg]!.mode, label: trip.legs[d.leg]!.label, minutes: trip.legs[d.leg]!.minutes }
        : i === 0 && trip.arrival ? { fromCityId: null, ...trip.arrival } : null,
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const lngLat = (o: Obj): LngLat | null =>
  isNum(o.lat) && isNum(o.lng) && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180 ? [o.lng, o.lat] : null;

/** Loose name match for must-see and skip lists: case, accents and punctuation ignored, either name inside the other. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameName = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

export interface ImportRules {
  /** Work days take only walk-up spots, and a "Before work" stop gets 90 minutes. */
  workHours?: boolean;
  /** Half-day trips only on free mornings. */
  halfDay?: boolean;
}

/**
 * Validate a pasted answer against the schema and the trip rules, and build the
 * trip and plan from it. Errors block the import; warnings are shown but the
 * plan still loads.
 */
export function importResponse(raw: string, brief: Brief, rules: ImportRules = {}): ImportResult {
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
  const tz = text(data.timezone) ?? '';
  if (!validTimeZone(tz)) errors.push(`"timezone" must be an IANA time zone such as "Europe/Lisbon", not "${String(data.timezone)}".`);
  if (!Array.isArray(data.cities) || !data.cities.length) return fail('"cities" must list at least one city.');
  if (!Array.isArray(data.spots)) return fail('"spots" must be an array.');
  if (!Array.isArray(data.days)) return fail('"days" must be an array.');

  // Cities
  const cities: Record<string, City> = {};
  for (const [i, c] of data.cities.entries()) {
    const at = `cities[${i}]`;
    if (!isObj(c)) { errors.push(`${at} must be an object.`); continue; }
    const id = text(c.id);
    const name = text(c.name);
    const ll = lngLat(c);
    const base = isObj(c.base) ? lngLat(c.base) : null;
    if (!id || !name) { errors.push(`${at} needs an "id" and a "name".`); continue; }
    if (cities[id]) { errors.push(`${at}: city id "${id}" is used twice.`); continue; }
    if (!ll) { errors.push(`${at} (${name}): "lat" and "lng" must be valid coordinates.`); continue; }
    if (!base) { errors.push(`${at} (${name}): "base" needs valid "lat" and "lng".`); continue; }
    if (km(ll, base) > 40) warnings.push(`${name}: the suggested base is ${Math.round(km(ll, base))} km from the city centre.`);
    cities[id] = { id, name, local: text(c.localName) ?? null, ll, base, baseLabel: text((c.base as Obj).label) ?? name, color: Object.keys(cities).length };
  }

  // Spots
  const spots: Spot[] = [];
  const spotById = new Map<string, Spot>();
  for (const [i, s] of data.spots.entries()) {
    const at = `spots[${i}]`;
    if (!isObj(s)) { errors.push(`${at} must be an object.`); continue; }
    const id = text(s.id);
    const name = text(s.name) ?? id;
    const where = `${at} (${name ?? '?'})`;
    if (!id) { errors.push(`${where} needs an "id".`); continue; }
    if (spotById.has(id)) { errors.push(`${where}: spot id "${id}" is used twice.`); continue; }
    const city = text(s.cityId);
    if (!city || !cities[city]) { errors.push(`${where}: unknown "cityId" "${String(s.cityId)}".`); continue; }
    const ll = lngLat(s);
    if (!ll) { errors.push(`${where}: "lat" and "lng" must be valid coordinates.`); continue; }
    const far = km(ll, cities[city]!.ll);
    if (far > MAX_SPOT_KM) { errors.push(`${where} is ${Math.round(far)} km from ${cities[city]!.name}; check its coordinates or its city.`); continue; }
    const light = s.light as Light;
    const lights = Array.isArray(s.lights) ? (s.lights.filter((l) => LIGHTS.includes(l as Light)) as Light[]) : [];
    if (!LIGHTS.includes(light)) { errors.push(`${where}: "light" must be one of ${LIGHTS.join(', ')}.`); continue; }
    if (!lights.includes(light)) lights.unshift(light);
    const styles = Array.isArray(s.styles) ? (s.styles.filter((x) => STYLE_IDS.includes(x as StyleId)) as StyleId[]) : [];
    const focal = Array.isArray(s.focal) ? (s.focal.filter((x) => FOCALS.includes(x as Focal)) as Focal[]) : [];
    if (!focal.length) { errors.push(`${where}: "focal" needs at least one of ${FOCALS.join(', ')}.`); continue; }
    const tripod = ['needed', 'helps', 'no', 'banned'].includes(s.tripod as string) ? (s.tripod as Spot['tripod']) : null;
    if (!tripod) { errors.push(`${where}: "tripod" must be needed, helps, no or banned.`); continue; }
    const effort = [1, 2, 3].includes(s.effort as number) ? (s.effort as 1 | 2 | 3) : null;
    const crowd = [1, 2, 3].includes(s.crowd as number) ? (s.crowd as 1 | 2 | 3) : null;
    if (!effort || !crowd) { errors.push(`${where}: "effort" and "crowd" must be 1, 2 or 3.`); continue; }
    const minutes = isNum(s.minutes) ? Math.round(s.minutes) : 0;
    if (minutes < 10 || minutes > 720) { errors.push(`${where}: "minutes" must be between 10 and 720.`); continue; }
    const spot: Spot = {
      id, city, name: name!, local: text(s.localName) ?? null, ll, light, lights, when: text(s.when) ?? '', tip: text(s.tip) ?? '',
      styles, focal, tripod, minutes, effort, crowd, drone: s.drone === true, hike: s.hike === true,
    };
    spots.push(spot);
    spotById.set(id, spot);
  }

  // Days: every requested date, in order, with a consistent chain of cities.
  const dates = tripDates(brief.start, brief.days);
  const byDate = new Map<string, Obj>();
  for (const [i, d] of data.days.entries()) {
    if (!isObj(d)) { errors.push(`days[${i}] must be an object.`); continue; }
    const date = text(d.date);
    if (!date || !dates.includes(date)) { errors.push(`days[${i}]: "${String(d.date)}" is not a trip date (${dates[0]} to ${dates.at(-1)}).`); continue; }
    if (byDate.has(date)) { errors.push(`${date} appears twice in "days".`); continue; }
    byDate.set(date, d);
  }
  const missing = dates.filter((d) => !byDate.has(d));
  if (missing.length) errors.push(`Every trip date needs an entry in "days", even with no slots. Missing: ${missing.join(', ')}.`);
  if (errors.length) return { plan: null, summary: '', errors, warnings };

  const frames: DayFrame[] = [];
  const legs: Record<string, Leg> = {};
  let arrival: Trip['arrival'] = null;
  for (const [i, date] of dates.entries()) {
    const d = byDate.get(date)!;
    const city = text(d.cityId);
    if (!city || !cities[city]) { errors.push(`${date}: unknown "cityId" "${String(d.cityId)}".`); continue; }
    const prev = frames.at(-1)?.city;
    const t = isObj(d.travel) ? d.travel : null;
    const from = t ? text(t.fromCityId) : undefined;
    const mode = t && MODES.includes(t.mode as TravelMode) ? (t.mode as TravelMode) : 'train';
    const label = (t && text(t.label)) ?? mode;
    const minutes = t && isNum(t.minutes) ? Math.round(t.minutes) : null;
    let leg: string | undefined;
    let move: string | undefined;
    if (i === 0) {
      if (from) warnings.push(`${date}: the first day arrives from home, so "fromCityId" should be null.`);
      if (t) arrival = { mode, label, minutes };
      move = t ? `${label} to ${cities[city]!.name}` : `Arrive in ${cities[city]!.name}`;
    } else if (t && from) {
      if (!cities[from]) { errors.push(`${date}: unknown travel "fromCityId" "${from}".`); continue; }
      if (from !== prev) { errors.push(`${date}: travel leaves ${cities[from]!.name}, but the night before was in ${cities[prev!]!.name}.`); continue; }
      if (from === city) { errors.push(`${date}: travel goes from ${cities[city]!.name} to itself.`); continue; }
      leg = `leg${i}`;
      const a = cities[from]!.base;
      const b = cities[city]!.base;
      legs[leg] = { mode, label, from, to: city, minutes, pts: arc(a, b, mode === 'flight' ? 0.18 : 0.06, 48) };
      move = `${label}: ${cities[from]!.name} to ${cities[city]!.name}${minutes ? `, about ${minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 30) / 2} h`}` : ''}`;
    } else if (city !== prev) {
      errors.push(`${date}: the night is in ${cities[city]!.name} but the day before was in ${cities[prev!]!.name}, with no "travel" between them.`);
      continue;
    }
    frames.push({
      date,
      city,
      ...(leg ? { from: legs[leg]!.from, leg } : {}),
      kind: dayKind(date, !!leg, i === 0, brief),
      title: text(d.title) ?? '',
      ...(move ? { move } : {}),
    });
  }
  if (errors.length) return { plan: null, summary: '', errors, warnings };

  // Slots
  const gear = gearProfile(brief);
  const used = new Map<string, string>();
  const isMust = (s: Spot) => brief.must.some((m) => sameName(m, s.name) || (!!s.local && sameName(m, s.local)));
  const picks: Pick[][] = frames.map(() => []);
  for (const [i, frame] of frames.entries()) {
    const d = byDate.get(frame.date)!;
    const slots = Array.isArray(d.slots) ? d.slots : [];
    const labels = new Set<string>();
    const orders = new Map<number, string>();
    const allowed = labelsFor(frame.kind, frame.date, brief);
    const workish = frame.kind === 'work' || frame.kind === 'movework' || (frame.kind === 'arrive' && allowed.includes('After work'));
    for (const [si, s] of slots.entries()) {
      const where = `${frame.date} slot ${si + 1}`;
      if (!isObj(s)) { errors.push(`${where} must be an object.`); continue; }
      const label = text(s.label);
      const spot = spotById.get(text(s.spotId) ?? '');
      if (!label || !SLOT[label]) { errors.push(`${where}: unknown slot label "${String(s.label)}".`); continue; }
      if (!spot) { errors.push(`${where}: "${String(s.spotId)}" is not in "spots".`); continue; }
      if (!allowed.includes(label)) { errors.push(`${where}: "${label}" doesn't fit ${frame.date}, a ${frame.kind} day. Allowed: ${allowed.join(', ')}.`); continue; }
      if (labels.has(label)) { errors.push(`${where}: "${label}" is used twice on ${frame.date}.`); continue; }
      const same = orders.get(SLOT[label]!.order);
      if (same) { errors.push(`${where}: "${label}" and "${same}" are the same time of day; use one of them on ${frame.date}.`); continue; }
      const city = slotCity(frame, label);
      if (spot.city !== city) { errors.push(`${where}: ${spot.name} is in ${cities[spot.city]!.name}, but that slot is in ${cities[city]!.name}.`); continue; }
      if (!spot.lights.some((l) => SLOT[label]!.lights.includes(l))) {
        errors.push(`${where}: ${spot.name} is shot at ${LIGHT_LABEL[spot.light].toLowerCase()}, which a "${label}" slot doesn't have.`);
        continue;
      }
      if (brief.avoid.some((a) => sameName(a, spot.name))) { errors.push(`${where}: ${spot.name} is on the skip list.`); continue; }
      if (used.has(spot.id)) { errors.push(`${where}: ${spot.name} is already planned on ${used.get(spot.id)}; each spot appears once.`); continue; }
      // Hard limits; a must-see overrides them.
      const must = isMust(spot);
      if (!must && spot.tripod === 'needed' && !gear.tripod && !gear.clamp) { errors.push(`${where}: ${spot.name} needs a tripod, and the kit has neither a tripod nor a clamp.`); continue; }
      if (!must && spot.hike && brief.walking === 'low') { errors.push(`${where}: ${spot.name} is a real hike, and the brief asks for easy walking.`); continue; }
      if (!must && spot.crowd === 3 && brief.avoidCrowds) { errors.push(`${where}: ${spot.name} is one of the busiest spots, and the brief avoids crowds.`); continue; }
      if (rules.workHours !== false && workish && spot.effort > 1) { errors.push(`${where}: ${spot.name} is a ${Math.round(spot.minutes / 60)}-hour outing, too long for a work day.`); continue; }
      if (rules.workHours !== false && label === 'Before work' && spot.minutes > 90) { errors.push(`${where}: ${spot.name} takes ${spot.minutes} minutes; a "Before work" stop gets 90.`); continue; }
      if (!must && frame.kind === 'movefree' && label === 'Morning' && spot.minutes > 120) { errors.push(`${where}: ${spot.name} takes ${spot.minutes} minutes; the morning before travelling gets 120.`); continue; }
      if (rules.halfDay !== false && spot.effort === 3 && !(frame.kind === 'free' && (label === 'Morning' || label === 'Midday'))) {
        errors.push(`${where}: ${spot.name} is a half-day trip; it only fits a "Morning" or "Midday" slot on a free day.`);
        continue;
      }
      labels.add(label);
      orders.set(SLOT[label]!.order, label);
      used.set(spot.id, frame.date);
      const note = text(s.note);
      picks[i]!.push({ label, city, spotId: spot.id, why: text(s.why) ?? '', ...(note ? { note } : {}) });
    }
    const cap = stopCap(frame.kind, brief);
    if (picks[i]!.length > cap) errors.push(`${frame.date}: ${picks[i]!.length} stops, but a ${brief.pace} pace allows ${cap} on a ${frame.kind} day.`);
  }

  const plannedNames = [...used.keys()].map((id) => spotById.get(id)!);
  const skipped = Array.isArray(data.skipped)
    ? data.skipped.flatMap((x) => {
        const name = isObj(x) ? text(x.name) : undefined;
        return name && !plannedNames.some((s) => sameName(name, s.name)) ? [{ name, reason: text((x as Obj).reason) ?? '' }] : [];
      })
    : [];
  for (const m of brief.must) {
    if (plannedNames.some((s) => sameName(m, s.name) || (!!s.local && sameName(m, s.local)))) continue;
    const left = skipped.find((x) => sameName(m, x.name));
    warnings.push(left ? `Must-see "${m}" was left out${left.reason ? `: ${left.reason}` : '.'}` : `Must-see "${m}" is not in the plan.`);
  }
  const unused = spots.filter((s) => !used.has(s.id)).length;
  if (unused) warnings.push(`${unused} spot${unused > 1 ? 's are' : ' is'} listed but not planned on any day.`);
  if (errors.length) return { plan: null, summary: '', errors, warnings };

  const trip: Trip = {
    title: text(data.title) ?? brief.destination,
    summary: text(data.summary) ?? '',
    tz,
    cities,
    legs,
    days: frames,
    spots: spots.filter((s) => used.has(s.id)),
    arrival,
  };
  return { plan: assemble(trip, brief, picks, skipped), summary: trip.summary, errors, warnings };
}
