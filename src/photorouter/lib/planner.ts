import { GEAR_BY_ID, dayLabel, weekday } from './data';
import { km } from './geo';
import { hhmm, sunDay, tzOffset } from './sun';
import type { Brief, CityId, DayFrame, DayKind, DayStep, Focal, KitItem, Light, Plan, PlannedDay, PlannedSlot, Spot, Trip } from './types';

// The trip calendar and plan assembly. PhotoRouter does not plan: the user's
// own AI picks the cities, spots and travel days. This module knows which
// slots each kind of day allows, and turns validated picks into planned days
// with kit, light windows, travel order and walking distance.

interface SlotDef {
  order: number;
  lights: Light[];
  /** Work-day slot that has to fit around 09:00 to 18:00. */
  tight?: boolean;
}

export const SLOT: Record<string, SlotDef> = {
  'Before work': { order: 0, lights: ['dawn'], tight: true },
  Morning: { order: 1, lights: ['dawn', 'day'] },
  Midday: { order: 2, lights: ['day'] },
  Afternoon: { order: 3, lights: ['day'] },
  'Late afternoon': { order: 4, lights: ['golden', 'day'] },
  'Blue hour': { order: 5, lights: ['golden'] },
  Sunset: { order: 5, lights: ['golden'] },
  'After work': { order: 6, lights: ['night'], tight: true },
  Night: { order: 7, lights: ['night'] },
  Late: { order: 8, lights: ['night'] },
};

const FREE = Object.keys(SLOT).filter((l) => !SLOT[l]!.tight);
const AFTERNOON_ON = ['Afternoon', 'Late afternoon', 'Blue hour', 'Sunset', 'Night', 'Late'];
const EVENING = ['After work', 'Night', 'Late'];

const isWeekday = (iso: string) => !['Sat', 'Sun'].includes(weekday(iso));

/**
 * A day's kind from its date and travel. The first day is the arrival from
 * home; a day with travel moves between two cities; working weekdays come from
 * the brief.
 */
export function dayKind(date: string, travels: boolean, first: boolean, brief: Brief): DayKind {
  const working = brief.work && isWeekday(date);
  if (first) return 'arrive';
  if (travels) return working ? 'movework' : 'movefree';
  return working ? 'work' : 'free';
}

/** Slot labels that fit a kind of day at all. The importer holds answers to this calendar. */
export function labelsFor(kind: DayKind, date: string, brief: Brief): string[] {
  const working = brief.work && isWeekday(date);
  switch (kind) {
    case 'work': {
      const friday = weekday(date) === 'Fri';
      return ['Before work', ...(friday && brief.fridayEarly ? ['Blue hour'] : []), ...EVENING];
    }
    case 'arrive': return working ? EVENING : AFTERNOON_ON;
    case 'movework': return EVENING;
    case 'movefree': return FREE.filter((l) => l !== 'Midday');
    default: return FREE;
  }
}

export const allowedLabels = (day: DayFrame, brief: Brief) => labelsFor(day.kind, day.date, brief);

/** How many stops a kind of day takes at a balanced pace. */
const SUGGESTED: Record<DayKind, number> = { free: 4, work: 2, arrive: 2, movefree: 3, movework: 1 };

/** The stop limit per day for the brief's pace: relaxed is one on a work day and two otherwise, packed adds one. */
export function stopCap(kind: DayKind, brief: Brief): number {
  const workish = kind === 'work' || kind === 'movework';
  if (brief.pace === 'relaxed') return workish ? 1 : 2;
  return SUGGESTED[kind] + (brief.pace === 'packed' ? 1 : 0);
}

/** Where a slot happens: a travel day's morning is shot before leaving. */
export function slotCity(frame: DayFrame, label: string): CityId {
  return frame.kind === 'movefree' && frame.from && label === 'Morning' ? frame.from : frame.city;
}

function slotWindow(trip: Trip, label: string, date: string, city: CityId): string {
  const c = trip.cities[city]!;
  const s = sunDay(date, c.ll[1], c.ll[0], tzOffset(date, trip.tz));
  switch (label) {
    case 'Before work': return `${hhmm(s.dawnBlue)}-08:15`;
    case 'Morning': return `${hhmm(s.sunrise)}-11:00`;
    case 'Midday': return '11:30-14:30';
    case 'Afternoon': return '13:00-16:00';
    case 'Late afternoon': return `15:30-${hhmm(s.sunset)}`;
    case 'Blue hour':
    case 'Sunset': return `${hhmm(s.goldenPmStart)}-${hhmm(s.blueEnd)}`;
    case 'After work': return '18:15-20:00';
    case 'Night': return `${hhmm(Math.max(s.blueEnd, 19 * 60))}-21:30`;
    default: return '21:00-23:00';
  }
}

/** Hops longer than this between stops are a bus, ferry or taxi, not a walk. */
export const WALKABLE_KM = 3;

export interface GearProfile {
  focals: Set<Focal>;
  tripod: boolean;
  clamp: boolean;
  nd: string | null;
  cpl: boolean;
  drone: boolean;
  lenses: string[];
}

export function gearProfile(brief: Brief): GearProfile {
  const focals = new Set<Focal>();
  const lenses: string[] = [];
  for (const id of brief.gear) {
    const g = GEAR_BY_ID[id];
    if (!g) continue;
    g.focal?.forEach((f) => focals.add(f));
    if (g.kind === 'lens') lenses.push(id);
  }
  const hasBody = brief.gear.some((id) => GEAR_BY_ID[id]?.kind === 'body');
  // An interchangeable body with no lens listed: assume a kit zoom.
  if (hasBody && !lenses.length && !focals.size) { focals.add('wide'); focals.add('standard'); }
  return {
    focals,
    tripod: brief.gear.includes('tripod'),
    clamp: brief.gear.includes('clamp'),
    nd: brief.gear.includes('nd10') ? 'nd10' : brief.gear.includes('nd6') ? 'nd6' : null,
    cpl: brief.gear.includes('cpl'),
    drone: brief.gear.includes('drone'),
    lenses,
  };
}

interface Ctx {
  brief: Brief;
  gear: GearProfile;
}

function buildKit(spot: Spot, label: string, ctx: Ctx): { kit: KitItem[]; warnings: string[] } {
  const { brief, gear } = ctx;
  const kit: KitItem[] = [];
  const warnings: string[] = [];
  const add = (id: string) => {
    const g = GEAR_BY_ID[id];
    if (g && !kit.some((k) => k.id === id)) kit.push({ id, label: g.short });
  };
  for (const f of spot.focal) {
    const lens = gear.lenses.find((id) => GEAR_BY_ID[id]!.focal?.includes(f));
    if (lens) add(lens);
    if (kit.length >= 2) break;
  }
  if (!kit.length) {
    const body = brief.gear.find((id) => GEAR_BY_ID[id]?.focal);
    if (body) add(body);
  }
  const window = SLOT[label]!.lights[0];
  if (spot.tripod === 'banned') {
    if (gear.tripod) warnings.push('No tripods here. Leave it at the hotel.');
  } else if (spot.tripod === 'needed' || spot.tripod === 'helps') {
    if (gear.tripod) add('tripod');
    else if (gear.clamp) add('clamp');
    else if (spot.tripod === 'needed') warnings.push('Wants a tripod: brace on a railing and raise ISO.');
  }
  if (gear.nd && spot.styles.includes('long-exposure') && (window === 'golden' || window === 'day')) add(gear.nd);
  if (gear.cpl && spot.styles.includes('landscape') && window !== 'night') add('cpl');
  if (gear.drone && spot.drone) {
    add('drone');
    warnings.push('Check the local drone rules and no-fly zones before flying.');
  }
  if (!spot.focal.some((f) => gear.focals.has(f))) warnings.push(`Best shot at ${spot.focal[0]}; work with what you have.`);
  return { kit, warnings };
}

function phrase(label: string, spot: Spot): string {
  const o = SLOT[label]!.order;
  if (o <= 1) return spot.light === 'dawn' ? 'at dawn' : 'in the morning';
  if (o <= 3) return '';
  if (label === 'Blue hour') return 'at blue hour';
  if (o <= 5) return 'at sunset';
  return 'by night';
}

const shortName = (s: Spot) => s.name.split(/,| & /)[0]!.replace(/^The /, '');

function titleFor(frame: DayFrame, slots: PlannedSlot[], spot: (id: string) => Spot): string {
  if (!slots.length) return frame.move ?? `${dayLabel(frame.date)}, a day off`;
  const a = slots[0]!;
  const sa = spot(a.spotId);
  const first = `${shortName(sa)} ${phrase(a.label, sa)}`.trim();
  if (slots.length === 1) return first;
  const b = slots[slots.length - 1]!;
  const sb = spot(b.spotId);
  return `${first}, ${shortName(sb)} ${phrase(b.label, sb)}`.trim();
}

export interface Pick {
  label: string;
  city: CityId;
  spotId: string;
  why: string;
  note?: string;
}

/** Turn a day's picks into a planned day: kit, light windows, travel order, distance. */
function finishDay(trip: Trip, frame: DayFrame, index: number, picks: Pick[], ctx: Ctx, spot: (id: string) => Spot): PlannedDay {
  const slots: PlannedSlot[] = picks
    .slice()
    .sort((a, b) => SLOT[a.label]!.order - SLOT[b.label]!.order)
    .map((p) => {
      const s = spot(p.spotId);
      const { kit, warnings } = buildKit(s, p.label, ctx);
      return {
        label: p.label,
        window: slotWindow(trip, p.label, frame.date, p.city),
        spotId: s.id,
        city: p.city,
        ...(p.note ? { note: p.note } : {}),
        kit,
        warnings,
        why: p.why,
      };
    });

  const steps: DayStep[] = [];
  const before = frame.kind === 'movefree' ? slots.filter((s) => s.city === frame.from) : [];
  before.forEach((s) => steps.push({ type: 'stop', slot: slots.indexOf(s) }));
  if (frame.leg) steps.push({ type: 'leg', leg: frame.leg });
  slots.forEach((s, i) => { if (!before.includes(s)) steps.push({ type: 'stop', slot: i }); });

  let walkKm = 0;
  for (let i = 1; i < slots.length; i++) {
    if (slots[i]!.city !== slots[i - 1]!.city) continue;
    const hop = km(spot(slots[i - 1]!.spotId).ll, spot(slots[i]!.spotId).ll);
    if (hop <= WALKABLE_KM) walkKm += hop;
  }

  return { ...frame, index, title: frame.title || titleFor(frame, slots, spot), slots, steps, walkKm };
}

/** Build a plan from validated picks. Kit, light windows and travel order are computed here. */
export function assemble(trip: Trip, brief: Brief, picks: Pick[][], skipped: Plan['skipped'] = []): Plan {
  const ctx: Ctx = { brief, gear: gearProfile(brief) };
  const byId = new Map(trip.spots.map((s) => [s.id, s]));
  const spot = (id: string) => byId.get(id)!;
  const days = trip.days.map((frame, i) => finishDay(trip, frame, i, picks[i] ?? [], ctx, spot));
  const used = new Set(days.flatMap((d) => d.slots.map((s) => s.spotId)));
  return {
    trip,
    days,
    stops: days.reduce((n, d) => n + d.slots.length, 0),
    spots: used.size,
    walkKm: days.reduce((n, d) => n + d.walkKm, 0),
    skipped,
  };
}

