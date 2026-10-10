import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import type { Basemap, Theme } from '../store';

// OpenFreeMap: keyless vector tiles, glyphs and sprites. Mapterhorn: keyless
// terrain. Both hosts are whitelisted in this page's CSP (public/_headers).
// "Detailed" is Liberty (streets, POIs, transit, 3D buildings); "Clean" is
// Positron or Dark, recoloured to the app palette.
const STYLE_URL = (name: string) => `https://tiles.openfreemap.org/styles/${name}`;
const DEM_TILES = ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'];
const DEM_ATTR = '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>';

export const PALETTE = {
  light: {
    land: '#F4F2EB', water: '#C7DAE6', building: '#E4E1D8', shadow: '#5B6B78', highlight: '#FFFFFF',
    route: '#7A8794', accent: '#B45C17', surface: '#FFFFFF', ink: '#14202C', muted: '#56636F',
  },
  dark: {
    land: '#16202B', water: '#0A1620', building: '#24313F', shadow: '#000000', highlight: '#3A4B5C',
    route: '#7F8E9D', accent: '#F29E4C', surface: '#131C26', ink: '#E3E9EF', muted: '#94A1AE',
  },
} as const;

const cache = new Map<string, StyleSpecification>();

async function fetchStyle(name: string): Promise<StyleSpecification> {
  const hit = cache.get(name);
  if (hit) return structuredClone(hit);
  const res = await fetch(STYLE_URL(name));
  if (!res.ok) throw new Error(`Map style failed to load (${res.status})`);
  const json = (await res.json()) as StyleSpecification;
  cache.set(name, json);
  return structuredClone(json);
}

export async function baseStyle(basemap: Basemap, theme: Theme): Promise<StyleSpecification> {
  if (basemap === 'clean') return fetchStyle(theme === 'dark' ? 'dark' : 'positron');
  const style = await fetchStyle('liberty');
  if (theme === 'dark') nightify(style);
  return style;
}

// ---------- night variant of Liberty ----------

function parseColor(c: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/i.exec(c.replace(/\s+/g, ' ').trim());
  if (!fn) return null;
  const parts = fn[2]!.split(/[ ,/]+/).filter(Boolean).map((v) => parseFloat(v));
  const a = parts[3] ?? 1;
  if (fn[1]!.toLowerCase().startsWith('rgb')) return [parts[0]! / 255, parts[1]! / 255, parts[2]! / 255, a];
  const [h, sat, l] = [parts[0]! / 360, parts[1]! / 100, parts[2]! / 100];
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const t = (x: number) => {
    x = (x + 1) % 1;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  return [t(h + 1 / 3), t(h), t(h - 1 / 3), a];
}

/** Flip lightness and mute saturation, keeping hue: light fills turn dark, dark text turns light. */
function night(c: string, mute = 0.55): string {
  const rgb = parseColor(c);
  if (!rgb) return c;
  const [r, g, b, a] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const L = 0.06 + (1 - l) * 0.8;
  const S = sat * mute;
  return `hsla(${Math.round(((h * 60) + 360) % 360)}, ${Math.round(S * 100)}%, ${Math.round(L * 100)}%, ${a})`;
}

function walk(v: unknown, mute: number): unknown {
  if (typeof v === 'string') return night(v, mute);
  if (Array.isArray(v)) return v.map((x) => walk(x, mute));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, mute)]));
  return v;
}

function nightify(style: StyleSpecification) {
  for (const l of style.layers) {
    const paint = (l as { paint?: Record<string, unknown> }).paint;
    if (!paint) continue;
    // Roads keep only a hint of colour so the orange route stays the loudest line.
    const mute = l.type === 'line' ? 0.25 : 0.55;
    for (const k of Object.keys(paint)) if (k.endsWith('-color')) paint[k] = walk(paint[k], mute);
    if (l.type === 'raster') Object.assign(paint, { 'raster-brightness-max': 0.3, 'raster-saturation': -0.6 });
  }
}

const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection;

/** Recolour the base map to the app palette and add the trip's own sources and layers. */
export function decorate(style: StyleSpecification, theme: Theme, basemap: Basemap, data: Record<string, GeoJSON.GeoJSON>): StyleSpecification {
  const p = PALETTE[theme];
  const layers = style.layers;
  // Liberty keeps its own colours in light mode; everything else takes the app palette.
  const recolour = basemap === 'clean' || theme === 'dark';

  for (const l of layers) {
    if (!recolour) break;
    if (l.id === 'background' && l.type === 'background') l.paint = { ...l.paint, 'background-color': p.land };
    if (l.id === 'water' && l.type === 'fill') l.paint = { ...l.paint, 'fill-color': p.water };
    if (l.id === 'building' && l.type === 'fill' && basemap === 'clean') {
      l.paint = { ...l.paint, 'fill-color': p.building };
      l.maxzoom = 14.5;
    }
    if (l.type === 'fill-extrusion') l.paint = { ...l.paint, 'fill-extrusion-color': p.building };
  }

  style.sources['pr-hill'] = { type: 'raster-dem', tiles: DEM_TILES, tileSize: 512, encoding: 'terrarium', maxzoom: 12, attribution: DEM_ATTR };
  style.sources['pr-terrain'] = { type: 'raster-dem', tiles: DEM_TILES, tileSize: 512, encoding: 'terrarium', maxzoom: 13 };
  for (const id of ['pr-legs', 'pr-trail', 'pr-walk', 'pr-walk-active', 'pr-leg-active', 'pr-stations']) {
    style.sources[id] = { type: 'geojson', data: data[id] ?? empty, lineMetrics: id === 'pr-leg-active' };
  }

  const firstLine = layers.findIndex((l) => l.type === 'line');

  const hill: LayerSpecification = {
    id: 'pr-hillshade', type: 'hillshade', source: 'pr-hill',
    paint: {
      'hillshade-shadow-color': p.shadow,
      'hillshade-highlight-color': p.highlight,
      'hillshade-accent-color': p.shadow,
      'hillshade-exaggeration': theme === 'dark' ? 0.45 : 0.3,
    },
  };

  const buildings: LayerSpecification = {
    id: 'pr-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    paint: {
      'fill-extrusion-color': p.building,
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 8]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  };

  const overlay: LayerSpecification[] = [
    {
      id: 'pr-trail', type: 'line', source: 'pr-trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', ['get', 'state'], 'done'], p.accent, p.route],
        'line-width': 1.5,
        'line-opacity': ['case', ['==', ['get', 'state'], 'done'], 0.55, 0.3],
        'line-dasharray': [1, 2],
      },
    },
    {
      id: 'pr-legs-casing', type: 'line', source: 'pr-legs', filter: ['!=', ['get', 'state'], 'todo'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.surface, 'line-width': 7, 'line-opacity': 0.9 },
    },
    {
      id: 'pr-legs-todo', type: 'line', source: 'pr-legs', filter: ['==', ['get', 'state'], 'todo'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.route, 'line-width': 2.5, 'line-dasharray': [1, 2.5], 'line-opacity': 0.9 },
    },
    {
      id: 'pr-legs-done', type: 'line', source: 'pr-legs', filter: ['==', ['get', 'state'], 'done'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.accent, 'line-width': 3 },
    },
    {
      id: 'pr-leg-active-glow', type: 'line', source: 'pr-leg-active',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.accent, 'line-width': 14, 'line-blur': 8, 'line-opacity': 0.45 },
    },
    {
      id: 'pr-leg-active', type: 'line', source: 'pr-leg-active',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': 4.5,
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, p.route, 0.6, p.accent, 1, p.accent],
      },
    },
    {
      id: 'pr-walk', type: 'line', source: 'pr-walk',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.accent, 'line-width': 2.5, 'line-dasharray': [1, 1.8], 'line-opacity': 0.85 },
    },
    {
      id: 'pr-walk-active', type: 'line', source: 'pr-walk-active',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.accent, 'line-width': 4 },
    },
  ];

  const stations: LayerSpecification[] = [
    {
      id: 'pr-stations-dot', type: 'circle', source: 'pr-stations', minzoom: 7.5,
      paint: { 'circle-radius': 4, 'circle-color': p.surface, 'circle-stroke-color': p.ink, 'circle-stroke-width': 1.5 },
    },
    {
      id: 'pr-stations-label', type: 'symbol', source: 'pr-stations', minzoom: 8.5,
      layout: {
        'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-offset': [0.8, 0], 'text-anchor': 'left', 'text-optional': true,
      },
      paint: { 'text-color': p.muted, 'text-halo-color': p.land, 'text-halo-width': 1.5 },
    },
  ];

  layers.splice(firstLine >= 0 ? firstLine : 1, 0, hill);
  // Routes go above every road, bridge and building but under the labels.
  let top = layers.length;
  while (top > 0 && layers[top - 1]!.type === 'symbol') top--;
  const hasBuildings = layers.some((l) => l.type === 'fill-extrusion');
  layers.splice(top, 0, ...(hasBuildings ? [] : [buildings]), ...overlay);
  layers.push(...stations);
  return style;
}
