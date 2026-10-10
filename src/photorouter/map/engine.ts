import { Map as MLMap, Marker, setWorkerUrl, type LngLatBoundsLike, type PaddingOptions, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { SPOT, SPOTS, TRIP, CITY_IDS } from '../lib/data';
import { along, arc, bearing, bounds, km, measure, smooth, type Measured } from '../lib/geo';
import type { Light, LngLat, Plan } from '../lib/types';
import { WALKABLE_KM } from '../lib/planner';
import type { Basemap, Theme } from '../store';
import { PALETTE, baseStyle, decorate } from './style';

// Serve the worker from our own origin so the page CSP can keep worker-src 'self'.
setWorkerUrl(workerUrl);

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;
const smoothstep = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

const TRAIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8a4 4 0 0 1 4 4v8a3 3 0 0 1-2.2 2.9L19.5 21h-2.3l-1.4-2.6H8.2L6.8 21H4.5l1.7-3.1A3 3 0 0 1 4 15V7a4 4 0 0 1 4-4Zm-1.5 5v3.5h11V8Zm1.8 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm7.4 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/></svg>';
const METRO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4.4 0 8 .9 8 4v10a3 3 0 0 1-2 2.8l1.6 2.2h-2.4l-1.4-2H8.2l-1.4 2H4.4L6 18.8A3 3 0 0 1 4 16V6c0-3.1 3.6-4 8-4Zm-6 6v4h12V8Zm2 6.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm8 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"/></svg>';
const BED_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h2v7h6V8h7a3 3 0 0 1 3 3v8h-2v-3H5v3H3Zm5 1.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z"/></svg>';

interface Mk {
  marker: Marker;
  el: HTMLButtonElement;
  num: HTMLElement;
}

export interface EngineHandlers {
  onSpot: (id: string) => void;
  onUserMove: () => void;
  onError: (message: string) => void;
}

const LEG_DAY: Record<string, number> = Object.fromEntries(
  TRIP.days.flatMap((d, i) => (d.leg ? [[d.leg, i]] : [])),
);

export class TripMap {
  readonly map: MLMap;
  private theme: Theme;
  private basemap: Basemap;
  private plan: Plan | null = null;
  private day: number | null = null;
  private selected: string | null = null;
  private current: string | null = null;
  private visited = new Set<string>();
  private fresh = new Set<string>();
  private lights = new Set<Light>(['dawn', 'day', 'golden', 'night']);
  private legProgress: Record<string, number> = {};
  private walkDrawn = 1;
  private terrain = false;
  private token = 0;
  /** Bumped per rail run, so a cancelled run never cleans up the train its successor is using. */
  private legRun = 0;
  private markers = new Map<string, Mk>();
  private hotels: Marker[] = [];
  private train: Marker;
  private trainEl: HTMLElement;
  private walker: Marker;
  private legs: Record<string, Measured>;
  private styleSeq = 0;

  constructor(container: HTMLElement, theme: Theme, basemap: Basemap, private readonly on: EngineHandlers) {
    this.theme = theme;
    this.basemap = basemap;
    this.legs = Object.fromEntries(Object.entries(TRIP.legs).map(([id, l]) => [id, measure(smooth(l.pts, 14))]));
    const [sw, ne] = this.allBounds();
    this.map = new MLMap({
      container,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': PALETTE[theme].land } }] },
      bounds: [sw, ne],
      fitBoundsOptions: { padding: 40 },
      maxPitch: 75,
      attributionControl: { compact: true },
      dragRotate: true,
    });
    this.map.on('dragstart', (e) => { if (e.originalEvent) this.on.onUserMove(); });
    this.map.on('wheel', () => this.on.onUserMove());
    this.map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      if (/style|Failed to fetch|NetworkError/i.test(msg)) this.on.onError('Map tiles could not load. Check your connection.');
    });

    for (const s of SPOTS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `pr-mk c-${s.city}`;
      el.setAttribute('aria-label', s.name);
      el.innerHTML = '<span class="pr-mk-ring"></span><span class="pr-mk-dot"><span class="pr-mk-num"></span></span><span class="pr-mk-tag"></span>';
      el.querySelector('.pr-mk-tag')!.textContent = s.name;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); this.on.onSpot(s.id); });
      // One tab stop for all markers; arrow keys move between the visible ones.
      el.tabIndex = s === SPOTS[0] ? 0 : -1;
      el.addEventListener('keydown', (ev) => this.markerKeys(ev, s.id));
      el.addEventListener('focus', () => {
        for (const m of this.markers.values()) m.el.tabIndex = -1;
        el.tabIndex = 0;
      });
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(s.ll).addTo(this.map);
      this.markers.set(s.id, { marker, el, num: el.querySelector('.pr-mk-num')! });
    }
    for (const c of CITY_IDS) {
      const el = document.createElement('div');
      el.className = 'pr-hotel';
      el.innerHTML = BED_SVG;
      el.title = `Base ${TRIP.cities[c].baseLabel}`;
      this.hotels.push(new Marker({ element: el, anchor: 'center' }).setLngLat(TRIP.cities[c].base));
    }

    this.trainEl = document.createElement('div');
    this.trainEl.className = 'pr-train';
    this.train = new Marker({ element: this.trainEl, anchor: 'center' }).setLngLat(TRIP.cities.gz.base);
    const w = document.createElement('div');
    w.className = 'pr-walker';
    this.walker = new Marker({ element: w, anchor: 'center' }).setLngLat(TRIP.cities.gz.base);

    void this.applyStyle();
    this.refresh();
  }

  destroy() {
    this.token++;
    this.map.remove();
  }

  // ---------- style and data ----------

  private async applyStyle() {
    const seq = ++this.styleSeq;
    try {
      const style = decorate(await baseStyle(this.basemap, this.theme), this.theme, this.basemap, this.geo());
      if (seq !== this.styleSeq) return;
      this.map.setStyle(style, { diff: false });
      this.map.once('style.load', () => this.applyTerrain());
    } catch {
      this.on.onError('Map tiles could not load. Check your connection.');
    }
  }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    void this.applyStyle();
  }

  setBasemap(basemap: Basemap) {
    if (basemap === this.basemap) return;
    this.basemap = basemap;
    void this.applyStyle();
  }

  setTerrain(on: boolean) {
    this.terrain = on;
    this.applyTerrain();
  }

  private applyTerrain() {
    if (!this.map.getSource('pr-terrain')) return;
    this.map.setTerrain(this.terrain ? { source: 'pr-terrain', exaggeration: 1.35 } : null);
  }

  setPlan(plan: Plan | null) {
    this.plan = plan;
    this.visited.clear();
    this.hotels.forEach((h) => (plan ? h.addTo(this.map) : h.remove()));
    this.refresh();
  }

  setFresh(ids: string[]) {
    this.fresh = new Set(ids);
    this.refreshMarkers();
    if (ids.length) setTimeout(() => { this.fresh.clear(); this.refreshMarkers(); }, 4000);
  }

  setLights(lights: Light[]) {
    this.lights = new Set(lights);
    this.refreshMarkers();
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.refreshMarkers();
  }

  /** Put the map in a day's state without animating: legs before it done, its own path drawn. */
  setDay(day: number | null, opts: { legsDrawn?: boolean; walkDrawn?: boolean } = {}) {
    this.day = day;
    this.current = null;
    this.visited.clear();
    for (const [id, d] of Object.entries(LEG_DAY)) {
      this.legProgress[id] = day == null ? 0 : d < day ? 1 : d === day ? (opts.legsDrawn ? 1 : 0) : 0;
    }
    this.walkDrawn = opts.walkDrawn === false ? 0 : 1;
    this.setLine('pr-leg-active', []);
    this.setLine('pr-walk-active', []);
    this.refresh();
  }

  setCurrent(id: string | null) {
    if (this.current) this.visited.add(this.current);
    this.current = id;
    this.refreshMarkers();
  }

  private refresh() {
    this.refreshMarkers();
    this.pushData();
  }

  private planned(): Map<string, number> {
    const m = new Map<string, number>();
    this.plan?.days.forEach((d, i) => d.slots.forEach((s) => m.set(s.spotId, i)));
    return m;
  }

  private refreshMarkers() {
    const planned = this.planned();
    const today = this.day != null && this.plan ? this.plan.days[this.day] : null;
    const order = new Map<string, number>();
    today?.slots.forEach((s, i) => order.set(s.spotId, i + 1));
    for (const [id, { el, num }] of this.markers) {
      const s = SPOT[id]!;
      const inDay = order.has(id);
      const isPlanned = planned.has(id);
      const keep = inDay || this.selected === id;
      el.classList.toggle('is-planned', isPlanned);
      el.classList.toggle('is-candidate', !isPlanned);
      el.classList.toggle('is-inday', inDay);
      el.classList.toggle('is-dim', !!today && !keep);
      el.classList.toggle('is-sel', this.selected === id);
      el.classList.toggle('is-current', this.current === id);
      el.classList.toggle('is-visited', this.visited.has(id));
      el.classList.toggle('is-fresh', this.fresh.has(id));
      el.classList.toggle('is-off', !keep && !s.lights.some((l) => this.lights.has(l)));
      el.classList.toggle('is-past', this.day != null && isPlanned && planned.get(id)! < this.day && !keep);
      num.textContent = inDay ? String(order.get(id)) : '';
      el.style.zIndex = this.current === id ? '4' : this.selected === id ? '3' : inDay ? '2' : isPlanned ? '1' : '0';
      el.setAttribute('aria-label', `${s.name}${inDay ? `, stop ${order.get(id)}` : ''}`);
    }
    // Keep the markers' one tab stop on a marker that is still shown.
    const all = [...this.markers.values()];
    const stop = all.find((m) => m.el.tabIndex === 0);
    if (!stop || stop.el.classList.contains('is-off')) {
      for (const m of all) m.el.tabIndex = -1;
      const first = all.find((m) => !m.el.classList.contains('is-off'));
      if (first) first.el.tabIndex = 0;
    }
  }

  private dayPath(i: number): LngLat[][] {
    const d = this.plan?.days[i];
    if (!d) return [];
    const runs: LngLat[][] = [];
    let prev: LngLat | null = null;
    let city: string | null = null;
    for (const step of d.steps) {
      if (step.type === 'leg') {
        const L = TRIP.legs[step.leg]!;
        prev = L.pts[L.pts.length - 1]!;
        city = d.city;
        continue;
      }
      const slot = d.slots[step.slot]!;
      const at = SPOT[slot.spotId]!.ll;
      const from: LngLat = prev && city === slot.city ? prev : TRIP.cities[slot.city].base;
      runs.push(arc(from, at, 0.16, km(from, at) > 4 ? 48 : 28));
      prev = at;
      city = slot.city;
    }
    return runs;
  }

  private geo(): Record<string, GeoJSON.GeoJSON> {
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
    const line = (coordinates: LngLat[], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({
      type: 'Feature', properties, geometry: { type: 'LineString', coordinates },
    });
    const legs = Object.entries(this.legs).map(([id, m]) =>
      line(m.pts, { id, state: (this.legProgress[id] ?? 0) >= 1 ? 'done' : (this.legProgress[id] ?? 0) > 0 ? 'active' : 'todo' }),
    );
    const trail = this.plan
      ? this.plan.days.flatMap((_, i) => this.dayPath(i).map((r) => line(r, { state: this.day != null && i < this.day ? 'done' : 'todo' })))
      : [];
    let walk: GeoJSON.Feature[] = [];
    if (this.day != null && this.walkDrawn > 0) {
      walk = this.dayPath(this.day).map((r) => line(r));
    }
    return {
      'pr-legs': fc(this.plan ? legs.filter((f) => f.properties!.state !== 'active') : []),
      'pr-trail': fc(trail),
      'pr-walk': fc(walk),
      'pr-stations': fc(TRIP.stations.map((s) => ({ type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: s.ll } }))),
    };
  }

  private pushData() {
    const data = this.geo();
    for (const [id, d] of Object.entries(data)) (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(d);
  }

  private setLine(id: string, coords: LngLat[]) {
    const src = this.map.getSource(id) as GeoJSONSource | undefined;
    src?.setData(coords.length > 1
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
      : { type: 'FeatureCollection', features: [] });
  }

  // ---------- camera ----------

  private padding(): PaddingOptions {
    const r = this.map.getContainer().getBoundingClientRect();
    const narrow = r.width < 560;
    return { top: narrow ? 64 : 80, bottom: narrow ? 56 : 90, left: narrow ? 32 : 56, right: narrow ? 48 : 64 };
  }

  private allBounds(): [LngLat, LngLat] {
    return bounds([...SPOTS.map((s) => s.ll), TRIP.stations[0]!.ll]);
  }

  private camera(kind: 'fly' | 'ease', opts: Parameters<MLMap['flyTo']>[0]): Promise<boolean> {
    const tok = this.token;
    if (reduced()) {
      this.map.jumpTo(opts as Parameters<MLMap['jumpTo']>[0]);
      return Promise.resolve(true);
    }
    return new Promise((res) => {
      const done = () => res(tok === this.token);
      this.map.once('moveend', done);
      if (kind === 'fly') this.map.flyTo({ ...opts, essential: true });
      else this.map.easeTo({ ...opts, essential: true });
    });
  }

  private fit(b: LngLatBoundsLike, opts: { pitch?: number; bearing?: number; maxZoom?: number; duration: number }) {
    const cam = this.map.cameraForBounds(b, { padding: this.padding(), maxZoom: opts.maxZoom ?? 15, bearing: opts.bearing ?? 0 });
    if (!cam) return Promise.resolve(true);
    return this.camera('fly', { ...cam, pitch: opts.pitch ?? 0, bearing: opts.bearing ?? 0, duration: opts.duration, curve: 1.3 });
  }

  overview(duration = 1100) {
    this.token++;
    this.hideMovers();
    return this.fit(this.allBounds(), { duration, maxZoom: 11 });
  }

  fitDay(i: number, duration = 1100) {
    const d = this.plan?.days[i];
    if (!d) return Promise.resolve(true);
    const pts: LngLat[] = d.slots.map((s) => SPOT[s.spotId]!.ll);
    if (d.leg) {
      const L = TRIP.legs[d.leg]!;
      if (!pts.length) pts.push(...L.pts);
      // A move-free day's morning stop is in the origin city; frame the destination too unless a stop is already there.
      else if (d.kind !== 'movefree' || !d.slots.some((s) => s.city === d.city)) pts.push(L.pts[L.pts.length - 1]!);
    }
    // An empty day (nothing fitted, or left out of an imported plan) frames the city base.
    if (!pts.length) pts.push(TRIP.cities[d.city].base);
    if (pts.length === 1) pts.push(TRIP.cities[d.slots[0]?.city ?? d.city].base);
    return this.fit(bounds(pts), { duration, pitch: 38, bearing: -12, maxZoom: 14.6 });
  }

  focusSpot(id: string, duration = 800) {
    const s = SPOT[id]!;
    const r = this.map.getContainer().getBoundingClientRect();
    // Sit the spot above the card, which covers the bottom of the map. Offset
    // rather than padding: padding on a camera call sticks to the map.
    const card = Math.min(r.height * 0.45, 250);
    return this.camera('ease', {
      center: s.ll,
      zoom: Math.max(this.map.getZoom(), 14.2),
      offset: [0, -card / 2],
      duration,
    });
  }

  zoomBy(delta: number) {
    this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: 300 });
  }

  resetNorth() {
    this.map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
  }

  cancel() {
    this.token++;
    this.map.stop();
    this.hideMovers();
  }

  private hideMovers() {
    this.train.remove();
    this.walker.remove();
    this.trainEl.classList.remove('on');
  }

  private tween(ms: number, fn: (u: number) => void): Promise<boolean> {
    const tok = this.token;
    return new Promise((res) => {
      if (ms <= 0 || reduced()) { fn(1); res(true); return; }
      const t0 = performance.now();
      const step = (now: number) => {
        if (tok !== this.token) { res(false); return; }
        const u = Math.min(1, (now - t0) / ms);
        fn(u);
        if (u < 1) requestAnimationFrame(step);
        else res(true);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- travel animations ----------

  /** Bring a leg's start into view first if the camera is somewhere else. */
  approach(at: LngLat): Promise<boolean> {
    const c = this.map.getCenter();
    if (km([c.lng, c.lat], at) < 12 && this.map.getZoom() > 9.5) return Promise.resolve(true);
    return this.camera('fly', { center: at, zoom: 11, pitch: 30, bearing: this.map.getBearing(), duration: 1000 });
  }

  /** Ride a leg with a chase camera that settles in behind the train. */
  private markerKeys(ev: KeyboardEvent, id: string) {
    const visible = SPOTS.filter((s) => !this.markers.get(s.id)!.el.classList.contains('is-off'));
    const i = visible.findIndex((s) => s.id === id);
    const n = visible.length;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[ev.key];
    if (to == null || !n) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.markers.get(visible[(to + n) % n]!.id)!.el.focus();
  }

  async runLeg(id: string, ms: number, chase = true): Promise<boolean> {
    const run = ++this.legRun;
    const L = this.legs[id]!;
    const leg = TRIP.legs[id]!;
    this.legProgress[id] = 0.001;
    this.pushData();
    this.trainEl.innerHTML = `<span class="pr-train-pulse"></span><span class="pr-train-body">${leg.mode === 'metro' ? METRO_SVG : TRAIN_SVG}</span>`;
    this.train.setLngLat(L.pts[0]!).addTo(this.map);
    requestAnimationFrame(() => this.trainEl.classList.add('on'));

    const c0 = this.map.getCenter();
    const z0 = this.map.getZoom();
    const p0 = this.map.getPitch();
    const b0 = this.map.getBearing();
    const ride = Math.max(9.6, Math.min(11.6, 13.4 - Math.log2(L.total / 6)));
    let heading = bearing(L.pts[0]!, L.pts[Math.min(8, L.pts.length - 1)]!);

    const ok = await this.tween(ms, (u) => {
      const e = easeSine(u);
      const { at, head, dir } = along(L, e);
      this.setLine('pr-leg-active', head);
      this.train.setLngLat(at);
      if (!chase) return;
      heading = lerpAngle(heading, dir, 0.05);
      // Blend in over the first fifth of the ride, and back out over the last tenth.
      const k = smoothstep(Math.min(1, u / 0.2)) * (1 - smoothstep(Math.max(0, (u - 0.9) / 0.1)) * 0.35);
      this.map.jumpTo({
        center: [lerp(c0.lng, at[0], k), lerp(c0.lat, at[1], k)],
        zoom: lerp(z0, ride, k),
        pitch: lerp(p0, 52, k),
        bearing: lerpAngle(b0, heading, k),
      });
    });
    this.legProgress[id] = ok ? 1 : 0;
    if (run === this.legRun) {
      this.setLine('pr-leg-active', []);
      this.trainEl.classList.remove('on');
      setTimeout(() => { if (run === this.legRun) this.train.remove(); }, 250);
    }
    this.pushData();
    return ok;
  }

  /** Walk from one point to a stop along a gentle arc, the camera drifting with the walker. */
  async walkTo(from: LngLat, to: string, ms: number): Promise<boolean> {
    const target = SPOT[to]!.ll;
    const dist = km(from, target);
    const m = measure(arc(from, target, 0.16, dist > 4 ? 48 : 28));
    // Longer hops are a bus, ferry or taxi: same path, a different marker.
    this.walker.getElement().classList.toggle('is-transit', dist > WALKABLE_KM);
    this.walker.setLngLat(from).addTo(this.map);
    const b = bounds([from, target]);
    const cam = this.map.cameraForBounds(b, { padding: this.padding(), maxZoom: 15.4, bearing: this.map.getBearing() });
    if (cam && !reduced()) {
      this.map.easeTo({ ...cam, pitch: 48, bearing: this.map.getBearing() + 8, duration: ms, easing: easeInOut, essential: true });
    }
    const ok = await this.tween(ms, (u) => {
      const { at, head } = along(m, easeInOut(u));
      this.walker.setLngLat(at);
      this.setLine('pr-walk-active', head);
    });
    this.walker.remove();
    return ok;
  }

  /** Swoop in on a stop and orbit slowly while the card is read. */
  async arrive(id: string, flyMs: number, dwellMs: number): Promise<boolean> {
    const s = SPOT[id]!;
    const b = this.map.getBearing();
    const ok = await this.camera('fly', { center: s.ll, zoom: 15.7, pitch: 60, bearing: b + 18, duration: flyMs, curve: 1.2 });
    if (!ok) return false;
    if (reduced()) return this.tween(dwellMs, () => {});
    this.map.easeTo({ bearing: b + 18 + 22, duration: dwellMs, easing: (u) => u, essential: true });
    return this.tween(dwellMs, () => {});
  }

  /** Draw the day's walking path progressively after a day is picked. */
  async drawDay(ms: number): Promise<boolean> {
    if (this.day == null) return true;
    const runs = this.dayPath(this.day).map(measure);
    const total = runs.reduce((n, r) => n + r.total, 0) || 1;
    this.walkDrawn = 0;
    this.pushData();
    const src = this.map.getSource('pr-walk-active') as GeoJSONSource | undefined;
    const ok = await this.tween(ms, (u) => {
      // Each run (a city's walk) grows in turn, so a travel day doesn't draw a line across the delta.
      let left = easeInOut(u) * total;
      const features: GeoJSON.Feature[] = [];
      for (const r of runs) {
        if (left <= 0) break;
        const head = along(r, Math.min(1, left / (r.total || 1))).head;
        left -= r.total;
        if (head.length > 1) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: head } });
      }
      src?.setData({ type: 'FeatureCollection', features });
    });
    this.setLine('pr-walk-active', []);
    this.walkDrawn = 1;
    this.pushData();
    return ok;
  }
}
