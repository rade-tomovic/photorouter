import spotsJson from '../data/spots.json';
import gearJson from '../data/gear.json';
import tripJson from '../data/trip.json';
import type { CityId, GearItem, Light, Spot, StyleDef, Trip } from './types';

// No backend: the catalog, gear list and trip frame ship as JSON. They go into
// the prompt for the user's AI and back the checks on its answer.
export const SPOTS = spotsJson as Spot[];
export const SPOT: Record<string, Spot> = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
export const GEAR = gearJson.items as GearItem[];
export const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));
export const GEAR_GROUPS = gearJson.groups as { kind: GearItem['kind']; label: string }[];
export const STYLES = gearJson.styles as StyleDef[];
export const TRIP = tripJson as unknown as Trip;

export const CITY_IDS: CityId[] = ['gz', 'sz', 'hk'];

export const LIGHT_LABEL: Record<Light, string> = {
  dawn: 'Dawn',
  day: 'Daylight',
  golden: 'Golden / blue hour',
  night: 'Night',
};

export const KIND_LABEL: Record<string, string> = {
  arrive: 'Arrival',
  work: 'Work day',
  free: 'Free day',
  movefree: 'Travel + free day',
  movework: 'Travel + work day',
  depart: 'Travel day',
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (iso: string) => WD[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
export const dayNum = (iso: string) => Number(iso.slice(8, 10));
export const dayLabel = (iso: string) => `${weekday(iso)} ${dayNum(iso)} Nov`;
