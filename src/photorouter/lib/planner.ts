import { GEAR_BY_ID, SPOT, TRIP } from './data';
import { km } from './geo';
import { hhmm, sunDay } from './sun';
import type {
  Brief,
  CityId,
  DayFrame,
  DayStep,
  Focal,
  KitItem,
  Light,
  Plan,
  PlannedDay,
  PlannedSlot,
  Spot,
} from './types';

// The trip calendar and plan assembly. PhotoRouter does not plan: the user's
// own AI picks the spots. This module knows which slots each day allows and
// turns validated picks into a planned day with kit, light windows, travel
// order and walking distance.

interface SlotDef {
  order: number;
  lights: Light[];
  /** Work-day slot that has to fit around 09:00–18:00. */
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

const FREE_LABELS = ['Morning', 'Midday', 'Sunset', 'Night'];

function slotWindow(label: string, date: string, city: CityId): string {
  const c = TRIP.cities[city];
  const s = sunDay(date, c.ll[1], c.ll[0], TRIP.tz);
  switch (label) {
    case 'Before work': return `${hhmm(s.dawnBlue)}–08:15`;
    case 'Morning': return `${hhmm(s.sunrise)}–11:00`;
    case 'Midday': return '11:30–14:30';
    case 'Afternoon': return '13:00–16:00';
    case 'Late afternoon': return `15:30–${hhmm(s.sunset)}`;
    case 'Blue hour':
    case 'Sunset': return `${hhmm(s.goldenPmStart)}–${hhmm(s.blueEnd)}`;
    case 'After work': return '18:15–20:00';
    case 'Night': return '19:30–21:30';
    default: return '21:00–23:00';
  }
}

export function effectiveKind(day: DayFrame, brief: Brief): DayFrame['kind'] {
  if (brief.work) return day.kind;
  if (day.kind === 'work') return 'free';
  if (day.kind === 'movework') return 'movefree';
  return day.kind;
}

export function slotLabels(day: DayFrame, index: number, brief: Brief): string[] {
  const kind = effectiveKind(day, brief);
  if (kind === 'depart') return [];
  let labels = day.seed.map((s) => s[0]);
  if (kind !== day.kind) labels = kind === 'free' ? FREE_LABELS.slice() : ['Afternoon', 'Sunset', 'Night'];
  if (!brief.fridayEarly) labels = labels.map((l) => (l === 'Blue hour' ? 'After work' : l));
  labels = [...new Set(labels)];

  const workish = kind === 'work' || kind === 'arrive' || kind === 'movework';
  if (brief.pace === 'relaxed') {
    if (workish) {
      const nightFirst = brief.styles.some((s) => s === 'night' || s === 'cityscape');
      const evening = labels.find((l) => SLOT[l]!.order >= 5);
      const morning = labels.find((l) => SLOT[l]!.order < 5);
      const pick = (index % 2 === 0) === nightFirst ? evening ?? morning : morning ?? evening;
      labels = pick ? [pick] : [];
    } else if (labels.length > 2) {
      labels = [labels[0]!, labels[labels.length - 1]!];
    }
  } else if (brief.pace === 'packed') {
    if (kind === 'work') {
      if (!labels.includes('Before work')) labels.push('Before work');
      if (!labels.includes('Night')) labels.push('Night');
    } else if (kind === 'free' || kind === 'movefree') {
      for (const l of ['Sunset', 'Night']) if (!labels.includes(l)) labels.push(l);
    } else if (kind === 'movework' || kind === 'arrive') {
      if (!labels.includes('Late')) labels.push('Late');
    }
  }
  return labels.sort((a, b) => SLOT[a]!.order - SLOT[b]!.order);
}

/** Slot labels that fit a day at all, whatever the pace: the importer holds outside answers to the same calendar. */
export function allowedLabels(day: DayFrame, brief: Brief): string[] {
  const kind = effectiveKind(day, brief);
  if (kind === 'depart') return [];
  if (kind === 'work') {
    const friday = new Date(`${day.date}T12:00:00Z`).getUTCDay() === 5;
    return ['Before work', ...(friday && brief.fridayEarly ? ['Blue hour'] : []), 'After work', 'Night', 'Late'];
  }
  // Arrival and travel-then-work days only have the evening left.
  if (kind === 'arrive' || kind === 'movework') return ['After work', 'Night', 'Late'];
  return Object.keys(SLOT).filter((l) => !SLOT[l]!.tight);
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
  used: Set<string>;
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
    warnings.push('Check the CAD drone map for restricted zones before flying.');
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

function titleFor(frame: DayFrame, slots: PlannedSlot[]): string {
  const seedIds = frame.seed.map((s) => s[1]).join();
  if (slots.map((s) => s.spotId).join() === seedIds) return frame.title;
  if (!slots.length) return frame.kind === 'depart' ? frame.title : 'A night off';
  const a = slots[0]!;
  const sa = SPOT[a.spotId]!;
  const first = `${shortName(sa)} ${phrase(a.label, sa)}`.trim();
  if (slots.length === 1) return first;
  const b = slots[slots.length - 1]!;
  const sb = SPOT[b.spotId]!;
  return `${first}, ${shortName(sb)} ${phrase(b.label, sb)}`.trim();
}

const totals = (days: PlannedDay[], spots: number, skipped: Plan['skipped']): Plan => ({
  days,
  stops: days.reduce((n, d) => n + d.slots.length, 0),
  spots,
  walkKm: days.reduce((n, d) => n + d.walkKm, 0),
  skipped,
});

export interface Pick {
  label: string;
  city: CityId;
  spotId: string;
  score: number;
  why: string;
  note?: string;
}

/** Turn a day's picks into a planned day: kit, light windows, travel order, distance. */
function finishDay(frame: DayFrame, index: number, kind: DayFrame['kind'], picks: Pick[], ctx: Ctx, title?: string): PlannedDay {
  const slots: PlannedSlot[] = picks
    .slice()
    .sort((a, b) => SLOT[a.label]!.order - SLOT[b.label]!.order)
    .map((p) => {
      const spot = SPOT[p.spotId]!;
      const { kit, warnings } = buildKit(spot, p.label, ctx);
      const note = p.note ?? frame.seed.find((s) => s[1] === spot.id)?.[2];
      return {
        label: p.label,
        window: slotWindow(p.label, frame.date, p.city),
        spotId: spot.id,
        city: p.city,
        ...(note ? { note } : {}),
        kit,
        warnings,
        score: p.score,
        why: p.why,
      };
    });

  const steps: DayStep[] = [];
  const before = kind === 'movefree' ? slots.filter((s) => s.city === frame.from) : [];
  before.forEach((s) => steps.push({ type: 'stop', slot: slots.indexOf(s) }));
  if (frame.leg) steps.push({ type: 'leg', leg: frame.leg });
  slots.forEach((s, i) => { if (!before.includes(s)) steps.push({ type: 'stop', slot: i }); });

  let walkKm = 0;
  for (let i = 1; i < slots.length; i++) {
    if (slots[i]!.city !== slots[i - 1]!.city) continue;
    const hop = km(SPOT[slots[i - 1]!.spotId]!.ll, SPOT[slots[i]!.spotId]!.ll);
    if (hop <= WALKABLE_KM) walkKm += hop;
  }

  const { seed: _seed, ...rest } = frame;
  return { ...rest, kind, index, title: title || titleFor(frame, slots), slots, steps, walkKm };
}

/** Build a plan from picks made elsewhere, e.g. by the user's own AI. Kit and windows are still computed here. */
export function assemble(
  brief: Brief,
  days: { picks: Pick[]; title?: string }[],
  skipped: Plan['skipped'] = [],
): Plan {
  const ctx: Ctx = { brief, gear: gearProfile(brief), used: new Set() };
  const planned = TRIP.days.map((frame, index) => {
    const d = days[index] ?? { picks: [] };
    d.picks.forEach((p) => ctx.used.add(p.spotId));
    return finishDay(frame, index, effectiveKind(frame, brief), d.picks, ctx, d.title);
  });
  return totals(planned, ctx.used.size, skipped);
}

/** Where a slot happens: a travel day's morning is shot before the train leaves. */
export function slotCity(frame: DayFrame, kind: DayFrame['kind'], label: string): CityId {
  return kind === 'movefree' && frame.from && label === 'Morning' ? frame.from : frame.city;
}
