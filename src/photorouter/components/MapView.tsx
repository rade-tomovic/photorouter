import { useEffect, useRef, useState } from 'react';
import { Compass, Copy, ExternalLink, FileJson, Layers, Minus, Plus, Route, X } from 'lucide-react';
import { SPOT, TRIP, dayLabel, tripDates } from '../lib/data';
import { TripMap } from '../map/engine';
import { getEngine, selectDay, selectSpot, setEngine, stop } from '../map/player';
import { loadExample, openStepper, useStore } from '../store';
import { Button, CityChip, LightChip, Pill, cx, radioKeys } from './ui';

const BASEMAPS = ['detailed', 'clean'] as const;
const TOOL = 'pointer-events-auto grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink shadow-card hover:border-muted [&_svg]:size-4';

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = useStore.getState();
    const engine = new TripMap(ref.current!, s.theme, s.basemap, {
      onSpot: (id) => selectSpot(id),
      onUserMove: () => stop(),
      onError: setError,
    });
    setEngine(engine);
    engine.setPlan(s.plan);
    engine.setTerrain(s.terrain);

    // Mirror store changes onto the map without re-rendering React per frame.
    const unsub = useStore.subscribe((now, prev) => {
      if (now.theme !== prev.theme) engine.setTheme(now.theme);
      if (now.basemap !== prev.basemap) engine.setBasemap(now.basemap);
      if (now.terrain !== prev.terrain) engine.setTerrain(now.terrain);
      if (now.lights !== prev.lights) engine.setLights(now.lights);
      // A new trip (a demo picked, or an answer loaded) rebuilds the markers and routes first.
      if (now.trip !== prev.trip) {
        engine.setTrip();
        if (!now.plan) void engine.overview(1200);
      }
      if (now.plan !== prev.plan || now.trip !== prev.trip) {
        engine.setPlan(now.plan);
        engine.setSelected(now.spot);
        if (now.day != null) engine.setDay(now.day, { legsDrawn: true });
        else {
          engine.setDay(null);
          if (now.plan && (!prev.plan || now.trip !== prev.trip)) void engine.overview(1200);
        }
      }
    });
    return () => {
      unsub();
      setEngine(null);
      engine.destroy();
    };
  }, []);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[color-mix(in_oklab,var(--route)_25%,var(--bg))]">
      {/* MapLibre sets position: relative on its container, so the sizing lives on a wrapper. */}
      <div className="absolute inset-0">
        <div ref={ref} className="size-full" role="region" aria-label="Map of the Pearl River Delta with photo spots and the train route" />
      </div>
      <MapTools />
      <EmptyHint />
      <SpotCard />
      {error && (
        <p role="alert" className="absolute top-14 left-1/2 z-10 m-0 -translate-x-1/2 rounded-full border border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-ink shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}

function MapTools() {
  const basemap = useStore((s) => s.basemap);
  return (
    <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1">
      {[
        // Touch screens pinch to zoom, so the zoom buttons are for mouse and keyboard.
        { label: 'Zoom in', icon: <Plus />, run: () => getEngine()?.zoomBy(0.8), touch: false },
        { label: 'Zoom out', icon: <Minus />, run: () => getEngine()?.zoomBy(-0.8), touch: false },
        { label: 'Reset north and tilt', icon: <Compass />, run: () => getEngine()?.resetNorth(), touch: true },
      ].map((b) => (
        <button
          key={b.label}
          type="button"
          aria-label={b.label}
          title={b.label}
          onClick={() => { stop(); b.run(); }}
          className={cx(TOOL, !b.touch && 'pointer-coarse:hidden')}
        >
          {b.icon}
        </button>
      ))}
      {/* Phones get one button that swaps the style; wider screens show both choices. */}
      <button
        type="button"
        aria-label={`Map style: ${basemap === 'detailed' ? 'Detailed' : 'Clean'}. Switch to ${basemap === 'detailed' ? 'Clean' : 'Detailed'}`}
        title="Map style"
        onClick={() => useStore.setState({ basemap: basemap === 'detailed' ? 'clean' : 'detailed' })}
        className={cx(TOOL, 'sm:hidden')}
      >
        <Layers />
      </button>
      <div
        role="radiogroup"
        aria-label="Map style"
        onKeyDown={radioKeys(BASEMAPS, BASEMAPS.indexOf(basemap), (b) => useStore.setState({ basemap: b }))}
        className="pointer-events-auto mt-1 inline-flex rounded-lg border border-line bg-surface p-0.5 shadow-card max-sm:hidden"
      >
        {BASEMAPS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={basemap === b}
            tabIndex={basemap === b ? 0 : -1}
            onClick={() => useStore.setState({ basemap: b })}
            className={basemap === b ? 'h-7 rounded-md bg-accent px-2.5 text-xs font-semibold text-accent-ink' : 'h-7 rounded-md px-2.5 text-xs font-semibold text-muted hover:text-ink'}
          >
            {b === 'detailed' ? 'Detailed' : 'Clean'}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyHint() {
  const plan = useStore((s) => s.plan);
  const custom = useStore((s) => s.custom);
  const brief = useStore((s) => s.brief);
  useStore((s) => s.trip); // re-render when the demo changes
  if (plan) return null;
  const dates = tripDates(brief.start, brief.days);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-14">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-line bg-surface/95 px-3 py-2 sm:rounded-full sm:py-1.5 sm:pr-1.5 sm:pl-4 text-[13px] shadow-card backdrop-blur">
        <span className="text-muted">
          {custom
            ? `${brief.destination.trim() || 'Your trip'}${dates.length ? `, ${dayLabel(dates[0]!)} to ${dayLabel(dates.at(-1)!)}` : ''}. No route yet.`
            : TRIP.title ? `Demo: ${TRIP.title}` : 'No route yet'}
        </span>
        <Button size="sm" onClick={() => loadExample()}>
          <FileJson className="size-3.5" aria-hidden /> Load the example
        </Button>
        <Button size="sm" variant="primary" onClick={() => openStepper()}>
          <Route className="size-3.5" aria-hidden /> Plan your trip
        </Button>
      </div>
    </div>
  );
}

function SpotCard() {
  const id = useStore((s) => s.spot);
  const plan = useStore((s) => s.plan);
  const [copied, setCopied] = useState<string | null>(null);
  const localRef = useRef<HTMLSpanElement>(null);
  if (!id || !SPOT[id]) return null;
  const s = SPOT[id]!;
  const local = s.local;
  const dayIndex = plan?.days.findIndex((d) => d.slots.some((x) => x.spotId === id)) ?? -1;
  const slot = dayIndex >= 0 ? plan!.days[dayIndex]!.slots.find((x) => x.spotId === id) : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(local ?? s.name);
      setCopied('Copied');
    } catch {
      const r = document.createRange();
      r.selectNodeContents(localRef.current!);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      setCopied('Selected, copy it');
    }
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div key={id} className="pr-enter absolute bottom-[calc(var(--map-inset,0px)_+_10px)] left-2.5 z-10 grid max-h-[calc(100%_-_var(--map-inset,0px)_-_20px)] w-[min(380px,calc(100%-20px))] gap-2 overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-card" aria-live="polite">
      <button type="button" aria-label="Close" onClick={() => selectSpot(null)} className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg border-0 bg-surface-2 text-ink">
        <X className="size-4" aria-hidden />
      </button>
      <h3 className="m-0 pr-8 text-[17px] leading-tight font-bold text-balance">{s.name}</h3>
      {local && (
        <div className="flex flex-wrap items-center gap-2">
          <span ref={localRef} className="font-zh text-base font-medium">{local}</span>
          <Button size="sm" onClick={copy}><Copy className="size-3" aria-hidden />{copied ?? 'Copy local name'}</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <LightChip light={s.light} />
        <Pill className="font-mono font-medium">{s.when}</Pill>
        <CityChip city={s.city} />
      </div>
      <p className="m-0 text-[13.5px]">{s.tip}</p>
      {slot?.why && <p className="m-0 text-xs text-muted"><b className="text-accent">Why:</b> {slot.why}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold">
        {dayIndex >= 0 ? (
          <button type="button" onClick={() => void selectDay(dayIndex)} className="border-0 bg-transparent p-0 text-accent hover:underline">
            Planned for {dayLabel(TRIP.days[dayIndex]!.date)}
          </button>
        ) : plan ? (
          <span className="text-muted">Not in this plan</span>
        ) : null}
        <a
          href={`https://www.openstreetmap.org/?mlat=${s.ll[1]}&mlon=${s.ll[0]}#map=17/${s.ll[1]}/${s.ll[0]}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-accent no-underline hover:underline"
        >
          Open in OpenStreetMap <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
