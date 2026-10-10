export type CityId = string;
export type Light = 'dawn' | 'day' | 'golden' | 'night';
export type Focal = 'ultrawide' | 'wide' | 'standard' | 'tele';
export type StyleId =
  | 'street'
  | 'night'
  | 'cityscape'
  | 'architecture'
  | 'heritage'
  | 'people'
  | 'long-exposure'
  | 'landscape'
  | 'aerial';
export type LngLat = [number, number];
export type Pace = 'relaxed' | 'balanced' | 'packed';
export type Walking = 'low' | 'medium' | 'high';
export type TravelMode = 'train' | 'ferry' | 'flight' | 'bus' | 'car';
/**
 * Derived per day from the date, the brief's working hours and the day's travel:
 * `arrive` is the first day of the trip (coming from home), `move*` days travel
 * between two cities, `work` and `free` stay put.
 */
export type DayKind = 'arrive' | 'work' | 'free' | 'movefree' | 'movework';

export interface Spot {
  id: string;
  city: CityId;
  name: string;
  /** Name in the local script or language, for taxis and signs; null when it is the same. */
  local: string | null;
  ll: LngLat;
  light: Light;
  lights: Light[];
  when: string;
  tip: string;
  styles: StyleId[];
  focal: Focal[];
  tripod: 'needed' | 'helps' | 'no' | 'banned';
  minutes: number;
  /** 1 walk-up, 2 a climb or a ride out, 3 half-day trip */
  effort: 1 | 2 | 3;
  crowd: 1 | 2 | 3;
  drone: boolean;
  /** Getting there means a real hike, not a short climb or a bus ride. */
  hike: boolean;
}

export interface GearItem {
  id: string;
  kind: 'body' | 'lens' | 'support' | 'filter' | 'drone' | 'light';
  label: string;
  short: string;
  /** Fixed-lens bodies: the focal classes they cover. */
  focal?: Focal[];
  /** Interchangeable-lens bodies: crop factor against full frame. */
  crop?: number;
}

export interface StyleDef {
  id: StyleId;
  label: string;
}

export interface City {
  id: CityId;
  name: string;
  local: string | null;
  ll: LngLat;
  base: LngLat;
  baseLabel: string;
  /** Index into the city palette (`--city-0` …), in order of first appearance. */
  color: number;
}

export interface Leg {
  mode: TravelMode;
  label: string;
  from: CityId;
  to: CityId;
  minutes: number | null;
  pts: LngLat[];
}

export interface DayFrame {
  date: string;
  city: CityId;
  /** The city left in the morning on a travel day. */
  from?: CityId;
  kind: DayKind;
  /** Key into `Trip.legs` when the day travels between two cities. */
  leg?: string;
  title: string;
  /** Short description of the day's travel. */
  move?: string;
}

/** A whole trip as the user's AI described it, after validation. */
export interface Trip {
  title: string;
  summary: string;
  /** IANA time zone of the destination, used for light windows. */
  tz: string;
  cities: Record<CityId, City>;
  legs: Record<string, Leg>;
  days: DayFrame[];
  spots: Spot[];
  /** How the first day arrives from home, as the AI described it. */
  arrival: { mode: TravelMode; label: string; minutes: number | null } | null;
}

export interface Brief {
  /** Where to go, in the photographer's words: a country, a region or a list of cities. */
  destination: string;
  /** First day of the trip, YYYY-MM-DD. */
  start: string;
  /** Number of days, arrival day included. */
  days: number;
  text: string;
  gear: string[];
  styles: StyleId[];
  pace: Pace;
  walking: Walking;
  work: boolean;
  fridayEarly: boolean;
  avoidCrowds: boolean;
  /** Places the photographer names, matched against spot names in the answer. */
  must: string[];
  avoid: string[];
}

export interface KitItem {
  id: string;
  label: string;
}

export interface PlannedSlot {
  label: string;
  window: string;
  spotId: string;
  city: CityId;
  note?: string;
  kit: KitItem[];
  warnings: string[];
  why: string;
}

export type DayStep = { type: 'leg'; leg: string } | { type: 'stop'; slot: number };

export interface PlannedDay extends DayFrame {
  index: number;
  slots: PlannedSlot[];
  steps: DayStep[];
  /** Distance between stops that is walkable; longer hops are transit and not counted. */
  walkKm: number;
}

export interface Plan {
  trip: Trip;
  days: PlannedDay[];
  stops: number;
  spots: number;
  walkKm: number;
  skipped: { name: string; reason: string }[];
}
