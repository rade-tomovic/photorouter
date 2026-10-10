// NOAA solar approximations: good to a minute or two, which is all a shoot plan needs.
const R = Math.PI / 180;

export interface SunDay {
  dawnBlue: number;
  sunrise: number;
  goldenAmEnd: number;
  goldenPmStart: number;
  sunset: number;
  blueEnd: number;
}

function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86400000);
}

/** Minutes after local midnight for the sun at each altitude that matters to a photographer. */
export function sunDay(iso: string, lat: number, lon: number, tz: number): SunDay {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(iso) - 1);
  const eqt =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const noon = 720 - 4 * lon - eqt + tz * 60;
  const half = (alt: number) => {
    const c = (Math.sin(alt * R) - Math.sin(lat * R) * Math.sin(decl)) / (Math.cos(lat * R) * Math.cos(decl));
    return (4 * Math.acos(Math.max(-1, Math.min(1, c)))) / R;
  };
  return {
    dawnBlue: noon - half(-6),
    sunrise: noon - half(-0.833),
    goldenAmEnd: noon - half(6),
    goldenPmStart: noon + half(6),
    sunset: noon + half(-0.833),
    blueEnd: noon + half(-6),
  };
}

export const hhmm = (m: number) => {
  const r = Math.round(m);
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
};

/** Hours east of UTC for an IANA time zone on a date, daylight saving included. */
export function tzOffset(iso: string, tz: string): number {
  try {
    const d = new Date(`${iso}T12:00:00Z`);
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round(((local.getTime() - utc.getTime()) / 3600000) * 4) / 4;
  } catch {
    return 0;
  }
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
