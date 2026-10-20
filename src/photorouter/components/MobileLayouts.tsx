import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import { getEngine } from '../map/player';
import { useStore } from '../store';
import { SidePanel } from './DayPanel';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { cx } from './ui';

// The phone layouts below the tablet breakpoint. Each one shows the same map,
// timeline and panels; they differ in how much is on screen at once.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The map above the timeline and the panels, as one scrolling page. */
export function StackLayout() {
  return (
    <>
      <div className="flex min-h-0 flex-col">
        <div className="relative h-[58svh] min-h-[360px] min-h-0">
          <MapView />
        </div>
        <Timeline />
      </div>
      <aside className="min-h-[70svh] border-t border-line bg-surface">
        <SidePanel withPlan />
      </aside>
    </>
  );
}

type Snap = 'peek' | 'half' | 'full';
const SNAPS: Snap[] = ['peek', 'half', 'full'];

/** Watch an element's height. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

/**
 * The map fills the screen and the details sit in a sheet over it. Pulled down, the
 * sheet shows only the timeline; halfway, the open panel; pulled up, nearly the
 * whole screen. Playback and a picked spot lower it so the map is in view.
 */
export function SheetLayout() {
  const [box, boxH] = useHeight<HTMLDivElement>();
  const [head, headH] = useHeight<HTMLDivElement>();
  const sheet = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ y: number; h: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const dragged = useRef(false);
  // Once the sheet has its size, and after the photographer moves it, frame the trip or
  // the day in the map left above it. Moves made by the app itself leave the camera alone.
  const framed = useRef(false);
  const moveTo = (next: Snap) => {
    if (next !== snap) framed.current = false;
    setSnap(next);
  };

  // The home indicator area belongs to the sheet, so the peek height includes it.
  const safe = sheet.current ? parseFloat(getComputedStyle(sheet.current).paddingBottom) || 0 : 0;
  const peek = Math.round(headH + safe);
  const full = Math.max(peek, boxH - 56);
  // Halfway shares the screen with the map, with at least a few rows of the panel under the timeline.
  const heights: Record<Snap, number> = { peek, half: Math.min(full, Math.max(peek + 140, Math.round(boxH * 0.58))), full };
  const height = drag ?? heights[snap];

  useEffect(
    () =>
      useStore.subscribe((now, prev) => {
        // Playback and a spot's card need the map; a picked day keeps its stops in view below it.
        if ((now.playing && !prev.playing) || (now.spot && now.spot !== prev.spot)) setSnap('peek');
        else if (now.day != null && now.day !== prev.day && !now.playing) setSnap((s) => (s === 'full' ? 'half' : s));
      }),
    [],
  );

  const nearest = (h: number, v: number) => {
    // A flick goes one step in its direction; otherwise the closest height wins.
    const at = SNAPS.indexOf(snap);
    if (Math.abs(v) > 0.45) return SNAPS[Math.max(0, Math.min(2, at + (v > 0 ? 1 : -1)))]!;
    return SNAPS.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    gesture.current = { y: e.clientY, h: height, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = g.y - e.clientY;
    if (!g.moved) {
      if (Math.abs(dy) < 8) return;
      g.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - g.lastT);
    g.v = (g.lastY - e.clientY) / dt;
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;
    setDrag(Math.max(heights.peek, Math.min(heights.full, g.h + dy)));
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved) return;
    dragged.current = true;
    setTimeout(() => { dragged.current = false; }, 0);
    moveTo(nearest(drag ?? g.h, g.v));
    setDrag(null);
  };

  const cycle = () => moveTo(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');

  const ready = boxH > 0 && headH > 0;
  useEffect(() => {
    if (!ready || framed.current) return;
    framed.current = true;
    const s = useStore.getState();
    const engine = getEngine();
    if (!engine || s.playing || s.spot) return;
    void (s.day != null ? engine.fitDay(s.day, 600) : engine.overview(600));
  }, [ready, snap]);

  return (
    <div ref={box} className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0" style={{ '--map-inset': `${heights[snap]}px` } as CSSProperties}>
        <MapView />
      </div>
      <div
        ref={sheet}
        className={cx(
          'absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgb(0_0_0/0.28)]',
          drag == null && !reduced() && 'transition-[height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        )}
        style={{ height: boxH ? height : '52%' }}
      >
        <div
          ref={head}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          // A drag that started on a date or a button is not also a tap on it.
          onClickCapture={(e) => {
            if (!dragged.current) return;
            dragged.current = false;
            e.preventDefault();
            e.stopPropagation();
          }}
          className="shrink-0 touch-none select-none"
        >
          <button
            type="button"
            onClick={cycle}
            aria-label={snap === 'full' ? 'Lower the panel to show the map' : 'Raise the panel'}
            aria-expanded={snap !== 'peek'}
            className="grid h-5 w-full place-items-center border-0 bg-transparent pt-1.5"
          >
            <span className="h-1 w-10 rounded-full bg-line" />
          </button>
          <div className="[&>section]:border-t-0 [&>section]:pt-1">
            <Timeline />
          </div>
        </div>
        <div className="min-h-0 flex-1 border-t border-line" inert={snap === 'peek' && drag == null}>
          <SidePanel withPlan />
        </div>
      </div>
    </div>
  );
}

/**
 * One thing at a time: the map with its timeline, or the panels full screen, with a
 * button to switch. Playback and a picked spot switch to the map.
 */
export function SwitchLayout() {
  const [view, setView] = useState<'map' | 'details'>('map');
  const spot = useStore((s) => s.spot);

  useEffect(
    () =>
      useStore.subscribe((now, prev) => {
        if ((now.playing && !prev.playing) || (now.spot && now.spot !== prev.spot)) setView('map');
      }),
    [],
  );

  const toggle = (
    <button
      type="button"
      onClick={() => setView(view === 'map' ? 'details' : 'map')}
      className="rt-btn pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-card"
    >
      {view === 'map' ? <List className="size-4" aria-hidden /> : <MapIcon className="size-4" aria-hidden />}
      {view === 'map' ? 'Show details' : 'Show map'}
    </button>
  );

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className={cx('absolute inset-0 flex flex-col', view !== 'map' && 'invisible')} inert={view !== 'map'}>
        {/* The inset keeps the framed trip clear of the switch button. */}
        <div className="relative min-h-0 flex-1" style={{ '--map-inset': '44px' } as CSSProperties}>
          <MapView />
          {!spot && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">{toggle}</div>}
        </div>
        <div className="pb-[env(safe-area-inset-bottom)]">
          <Timeline />
        </div>
      </div>
      <div className={cx('absolute inset-0 bg-surface', view !== 'details' && 'invisible')} inert={view !== 'details'}>
        <div className="h-full pb-20 [&_[role=tabpanel]]:pb-4">
          <SidePanel withPlan />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)_+_16px)] z-10 flex justify-center">{toggle}</div>
      </div>
    </div>
  );
}
