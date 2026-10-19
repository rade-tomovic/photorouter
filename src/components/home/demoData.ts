// Build-time helpers for the home page. Everything shown about the demo trips
// (routes, counts, the day sheet, the import report) is derived here from the
// bundled demos and the planner's own importer, so the page follows the demos
// when they change.
import { CONTINENT_LABEL, DEMOS, continentFromTimeZone, type Continent, type Demo } from '@/photorouter/lib/demos';
import { importResponse, type PlanResponse } from '@/photorouter/lib/byoai';
import { LIGHT_LABEL, dayLabel, monthName, dayNum } from '@/photorouter/lib/data';
import type { Brief, Light, TravelMode } from '@/photorouter/lib/types';

export { CONTINENT_LABEL, DEMOS };
export type { Continent, Demo };

/** Gear labels use typographic dashes between numbers; the home page keeps to plain hyphens. */
export const plain = (s: string) => s.replace(/[\u2012-\u2015]/g, '-');

export const MODE_LABEL: Record<TravelMode, string> = {
  train: 'Train',
  flight: 'Flight',
  ferry: 'Ferry',
  bus: 'Bus',
  car: 'Car',
};

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
export const countWord = (n: number) => WORDS[n] ?? String(n);

type Answer = PlanResponse;

export interface RouteLeg {
  from: string;
  to: string;
  mode: TravelMode;
}

/** Cities in visiting order (a city visited twice appears twice) and the legs between them. */
export function routeOf(answer: Answer) {
  const stops: string[] = [];
  const legs: RouteLeg[] = [];
  for (const d of answer.days) {
    const prev = stops.at(-1);
    if (prev && prev !== d.cityId) legs.push({ from: prev, to: d.cityId, mode: d.travel?.mode ?? 'train' });
    if (prev !== d.cityId) stops.push(d.cityId);
  }
  return { stops, legs };
}

export function statsOf(demo: Demo) {
  const { answer } = demo;
  const modes = [...new Set(answer.days.flatMap((d) => (d.travel ? [d.travel.mode] : [])))];
  const { stops } = routeOf(answer);
  const name = (id: string) => answer.cities.find((c) => c.id === id)?.name ?? id;
  return {
    days: answer.days.length,
    cities: answer.cities.length,
    spots: answer.spots.length,
    modes: modes.map((m) => MODE_LABEL[m]),
    path: stops.map(name),
    month: monthName(answer.days[0]!.date),
  };
}

function run(answer: Answer, brief: Brief) {
  return importResponse(JSON.stringify(answer), brief);
}

/** The demo as the planner loads it. A demo that fails its own import is a bug, so the build stops. */
export function loadDemo(demo: Demo) {
  const result = run(demo.answer, demo.brief);
  if (!result.plan) throw new Error(`Demo "${demo.label}" does not import: ${result.errors.join(' ')}`);
  return { ...result, plan: result.plan };
}

export const demoFor = (continent: Continent) => DEMOS.find((d) => d.continent === continent) ?? DEMOS[0]!;

/** One day of a demo as its day sheet shows it: slots with light windows, kit and local names. */
export function daySheet(demo: Demo, index: number) {
  const { plan } = loadDemo(demo);
  const day = plan.days[Math.min(index, plan.days.length - 1)]!;
  const city = plan.trip.cities[day.city]!;
  const spot = (id: string) => plan.trip.spots.find((s) => s.id === id)!;
  return {
    number: day.index + 1,
    total: plan.days.length,
    label: dayLabel(day.date),
    date: day.date,
    longDate: `${dayNum(day.date)} ${monthName(day.date)} ${day.date.slice(0, 4)}`,
    title: day.title,
    city: city.name,
    ll: city.ll,
    cityColor: city.color % 6,
    tz: plan.trip.tz,
    stops: day.slots.map((slot) => {
      const s = spot(slot.spotId);
      return {
        label: slot.label,
        window: slot.window,
        light: s.light,
        lightLabel: LIGHT_LABEL[s.light],
        name: s.name,
        local: s.local,
        kit: slot.kit.map((k) => plain(k.label)),
        warnings: slot.warnings,
      };
    }),
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface ReportLine {
  level: 'error' | 'warning';
  text: string;
}

/**
 * Real importer messages for broken copies of a demo: a missing travel leg, a
 * spot filed under the wrong city, a night spot in a morning slot and a
 * must-see left out. Each edit is made on a fresh copy so the importer reaches
 * the check it targets.
 */
export function importReport(demo: Demo): ReportLine[] {
  const lines: ReportLine[] = [];
  const pick = (answer: Answer, brief: Brief, level: ReportLine['level'], pattern: RegExp) => {
    const r = run(answer, brief);
    const text = (level === 'error' ? r.errors : r.warnings).find((m) => pattern.test(m));
    if (text) lines.push({ level, text });
  };
  const copy = () => structuredClone(demo.answer);

  const noTravel = copy();
  const moving = noTravel.days.find((d, i) => i > 0 && d.travel?.fromCityId);
  if (moving) {
    moving.travel = null;
    pick(noTravel, demo.brief, 'error', /with no "travel" between them/);
  }

  const farSpot = copy();
  const first = farSpot.cities[0]!.id;
  const away = farSpot.spots.find((s) => s.cityId !== first);
  if (away) {
    away.cityId = first;
    pick(farSpot, demo.brief, 'error', /km from .*check its coordinates/);
  }

  const wrongLight = copy();
  const late = (l: Light) => l === 'golden' || l === 'night';
  for (const d of wrongLight.days.slice(1)) {
    const morning = d.slots.find((s) => s.label === 'Morning');
    if (!morning) continue;
    const city = d.travel?.fromCityId ?? d.cityId;
    const evening = wrongLight.spots.find((s) => s.cityId === city && s.lights.every(late));
    if (!evening) continue;
    morning.spotId = evening.id;
    pick(wrongLight, demo.brief, 'error', /slot doesn't have/);
    break;
  }

  const must = demo.brief.must[0];
  if (must) {
    const dropped = copy();
    const ids = new Set(dropped.spots.filter((s) => norm(s.name).includes(norm(must)) || norm(must).includes(norm(s.name))).map((s) => s.id));
    dropped.days.forEach((d) => { d.slots = d.slots.filter((s) => !ids.has(s.spotId)); });
    dropped.skipped = dropped.skipped.filter((x) => !(norm(x.name).includes(norm(must)) || norm(must).includes(norm(x.name))));
    pick(dropped, demo.brief, 'warning', /^Must-see/);
  }
  return lines;
}

/** Which demo a time zone opens, as the planner decides it. */
export const demoForZone = (tz: string) => demoFor(continentFromTimeZone(tz));
