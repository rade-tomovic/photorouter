import { useEffect, useState, type CSSProperties } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import { useStore } from '../store';
import { SidePanel } from './DayPanel';
import { MapView } from './MapView';
import { Timeline } from './Timeline';
import { cx } from './ui';

/**
 * Below the tablet breakpoint, one thing at a time: the map with its timeline, or the
 * panels full screen, with a button to switch. Playback and a picked spot switch to the map.
 */
export function PhoneLayout() {
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
      {/* The panels stay mounted under the map, so a tab and its scroll survive a switch. */}
      <div className={cx('absolute inset-0 flex flex-col', view !== 'map' && 'invisible')} inert={view !== 'map'}>
        {/* The inset keeps the framed trip clear of the switch button, which a spot's card replaces. */}
        <div className="relative min-h-0 flex-1" style={{ '--map-inset': spot ? '0px' : '56px' } as CSSProperties}>
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
