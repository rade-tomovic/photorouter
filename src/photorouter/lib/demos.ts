import type { Brief } from './types';
import type { PlanResponse } from './byoai';

// Ready-made answers, one per continent, so the map and playback can be tried
// before running a prompt anywhere. Each pairs a brief with the JSON an AI
// returned for it; both go through the same importer as a pasted answer.

export type Continent = 'europe' | 'north-america' | 'south-america' | 'africa' | 'asia' | 'oceania';

export interface Demo {
  id: string;
  continent: Continent;
  /** Short name, e.g. "Lisbon and Porto". */
  label: string;
  /** One line for the picker, e.g. "10 days in April: tiled streets and river light". */
  blurb: string;
  brief: Brief;
  answer: PlanResponse;
}

export const CONTINENT_LABEL: Record<Continent, string> = {
  europe: 'Europe',
  'north-america': 'North America',
  'south-america': 'South America',
  africa: 'Africa',
  asia: 'Asia',
  oceania: 'Oceania',
};

const ORDER = Object.keys(CONTINENT_LABEL) as Continent[];

export const DEMOS: Demo[] = Object.values(import.meta.glob<Demo>('../data/demos/*.json', { eager: true, import: 'default' }))
  .sort((a, b) => ORDER.indexOf(a.continent) - ORDER.indexOf(b.continent));

const SOUTH_AMERICA = /^America\/(Argentina|Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Maceio|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Araguaina|Santarem|Noronha|Bogota|Lima|Santiago|Caracas|La_Paz|Asuncion|Montevideo|Guayaquil|Cayenne|Paramaribo|Guyana|Punta_Arenas)/;

/**
 * The visitor's continent from the browser's time zone. No network request:
 * the zone name ("Europe/Belgrade", "America/Sao_Paulo") is enough to pick a
 * nearby demo, and the picker lets anyone switch.
 */
export function continentFromTimeZone(tz: string): Continent {
  if (tz.startsWith('Europe/') || tz === 'Atlantic/Reykjavik' || tz === 'Atlantic/Canary' || tz === 'Atlantic/Madeira') return 'europe';
  if (SOUTH_AMERICA.test(tz) || tz === 'Atlantic/Stanley') return 'south-america';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz.startsWith('Canada/')) return 'north-america';
  if (tz.startsWith('Africa/')) return 'africa';
  if (tz.startsWith('Australia/') || tz.startsWith('Pacific/')) return 'oceania';
  if (tz.startsWith('Asia/') || tz.startsWith('Indian/')) return 'asia';
  return 'europe';
}

export function defaultDemo(): Demo | undefined {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch { /* old browser: fall back to the first demo */ }
  const continent = continentFromTimeZone(tz);
  return DEMOS.find((d) => d.continent === continent) ?? DEMOS[0];
}
