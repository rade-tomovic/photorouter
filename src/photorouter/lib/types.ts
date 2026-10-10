export type CityId = 'gz' | 'sz' | 'hk';
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
export type DayKind = 'arrive' | 'work' | 'free' | 'movefree' | 'movework' | 'depart';

export interface Spot {
  id: string;
  city: CityId;
  name: string;
  zh: string;
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
  hike?: boolean;
}

export interface GearItem {
  id: string;
  kind: 'body' | 'lens' | 'support' | 'filter' | 'other';
  label: string;
  short: string;
  focal?: Focal[];
}

export interface StyleDef {
  id: StyleId;
  label: string;
  words: string[];
}

export interface City {
  name: string;
  zh: string;
  ll: LngLat;
  base: LngLat;
  baseLabel: string;
  tagline: string;
}

export interface Leg {
  mode: 'metro' | 'rail';
  label: string;
  from: string;
  to: string;
  minutes: number;
  pts: LngLat[];
}

export type SeedSlot = [label: string, spotId: string, note?: string];

export interface DayFrame {
  date: string;
  city: CityId;
  from?: CityId;
  kind: DayKind;
  leg?: string;
  title: string;
  move?: string;
  seed: SeedSlot[];
}

export interface Trip {
  id: string;
  region: string;
  title: string;
  dates: string;
  month: string;
  tz: number;
  cities: Record<CityId, City>;
  stations: { id: string; name: string; ll: LngLat }[];
  legs: Record<string, Leg>;
  days: DayFrame[];
  logistics: { title: string; body: string[] }[];
  brief: Brief;
}

export interface Brief {
  text: string;
  gear: string[];
  styles: StyleId[];
  pace: Pace;
  walking: Walking;
  work: boolean;
  fridayEarly: boolean;
  avoidCrowds: boolean;
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
  score: number;
  why: string;
}

export type DayStep = { type: 'leg'; leg: string } | { type: 'stop'; slot: number };

export interface PlannedDay extends Omit<DayFrame, 'seed'> {
  index: number;
  slots: PlannedSlot[];
  steps: DayStep[];
  /** Distance between stops that is walkable; longer hops are transit and not counted. */
  walkKm: number;
}

export interface Plan {
  days: PlannedDay[];
  stops: number;
  spots: number;
  walkKm: number;
  skipped: { spotId: string; reason: string }[];
}
