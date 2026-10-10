import type { CityId, Light, Spot, Trip } from './types';

// No backend: gear and styles ship as JSON (see ./gear). The trip itself
// (cities, spots, travel, days) comes from the user's AI or a bundled demo.
export { GEAR, GEAR_GROUPS, STYLES, gearItem } from './gear';

// The active trip. One trip is shown at a time, and the map, panels and
// timeline all read it, so it lives here as live module bindings rather than
// being threaded through every component. `setTrip` swaps it; the store does
// that together with the plan, so React re-renders on the same update.
export let TRIP: Trip = { title: '', summary: '', tz: 'UTC', cities: {}, legs: {}, days: [], spots: [], arrival: null };
export let SPOTS: Spot[] = [];
export let SPOT: Record<string, Spot> = {};
export let CITY_IDS: CityId[] = [];

export function setTrip(trip: Trip) {
  TRIP = trip;
  SPOTS = trip.spots;
  SPOT = Object.fromEntries(trip.spots.map((s) => [s.id, s]));
  CITY_IDS = Object.values(trip.cities).sort((a, b) => a.color - b.color).map((c) => c.id);
}

/** CSS custom properties that colour an element by city (`text-(--c)`, `bg-(--c)`). */
export const cityStyle = (id: CityId) =>
  ({ '--c': TRIP.cities[id] ? `var(--city-${TRIP.cities[id]!.color % 6})` : 'var(--muted)' }) as React.CSSProperties;

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
  daytrip: 'Day trip',
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const weekday = (iso: string) => WD[at(iso).getUTCDay()]!;
export const dayNum = (iso: string) => Number(iso.slice(8, 10));
export const monthName = (iso: string) => MO[at(iso).getUTCMonth()]!;
export const dayLabel = (iso: string) => `${weekday(iso)} ${dayNum(iso)} ${monthName(iso)}`;

/** The trip's dates from a start date and a day count. */
export function tripDates(start: string, days: number): string[] {
  const t0 = at(start).getTime();
  if (Number.isNaN(t0)) return [];
  return Array.from({ length: Math.max(0, Math.min(days, 31)) }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
}
