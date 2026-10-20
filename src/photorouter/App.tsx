import { useEffect, useState } from 'react';
import { Mountain, Moon, Smartphone, Sun } from 'lucide-react';
import { MOBILE_LAYOUTS, useStore, type MobileLayout } from './store';
import { PlanColumn } from './components/PlanColumn';
import { PlanStepper } from './components/PlanStepper';
import { SidePanel } from './components/DayPanel';
import { MapView } from './components/MapView';
import { SheetLayout, StackLayout, SwitchLayout } from './components/MobileLayouts';
import { Timeline } from './components/Timeline';
import { cx } from './components/ui';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const planView = useStore((s) => s.planView);
  const layout = useStore((s) => s.mobileLayout);
  const wide = useMedia('(min-width: 1280px)');
  const mid = useMedia('(min-width: 1024px)');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0908' : '#ece4d2');
    try { localStorage.setItem('photorouter:theme', theme); } catch { /* private mode */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem('photorouter:plan-view', planView); } catch { /* private mode */ }
  }, [planView]);

  useEffect(() => {
    try { localStorage.setItem('photorouter:mobile-layout', layout); } catch { /* private mode */ }
  }, [layout]);

  // Only the stacked phone layout scrolls as a page; the others fit the screen like the desktop.
  const fixed = mid || layout !== 'stack';

  // The plan panel gets its own column when there's room; otherwise it is a tab.
  useEffect(() => {
    const { tab, set } = useStore.getState();
    if (wide && tab === 'plan') set({ tab: 'day' });
  }, [wide]);

  return (
    <div className={cx('flex flex-col bg-bg text-ink', fixed ? 'h-dvh' : 'min-h-dvh')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-ink"
      >
        Skip to content
      </a>
      <TopBar phone={!mid} />
      <main
        id="main"
        tabIndex={-1}
        className={cx(
          'outline-none',
          'grid min-h-0 flex-1',
          // On wide screens the page is exactly one viewport tall: the single row is capped so each panel scrolls inside itself.
          fixed && 'grid-rows-[minmax(0,1fr)] overflow-hidden',
          wide ? 'grid-cols-[auto_minmax(0,1fr)_400px]' : mid ? 'grid-cols-[minmax(0,1fr)_390px]' : 'grid-cols-1',
        )}
      >
        {mid ? (
          <>
            {wide && <PlanColumn />}
            <div className="flex min-h-0 flex-col">
              <div className="relative min-h-0 flex-1">
                <MapView />
              </div>
              <Timeline />
            </div>
            <aside className="min-h-0 border-l border-line bg-surface">
              <SidePanel withPlan={!wide} />
            </aside>
          </>
        ) : layout === 'sheet' ? (
          <SheetLayout />
        ) : layout === 'switch' ? (
          <SwitchLayout />
        ) : (
          <StackLayout />
        )}
      </main>
      <PlanStepper />
    </div>
  );
}

function TopBar({ phone }: { phone: boolean }) {
  const theme = useStore((s) => s.theme);
  const terrain = useStore((s) => s.terrain);
  const set = useStore((s) => s.set);
  return (
    <header className="rt-leather rt-rule flex h-14 shrink-0 items-center gap-3 px-3 sm:px-4">
      <a href="/" className="flex items-center gap-2 text-ink no-underline">
        <Logo />
        <h1 className="m-0 font-display text-[22px] leading-none font-extrabold tracking-wide uppercase">PhotoRouter</h1>
      </a>
      <span className="rt-plate hidden font-mono text-[10px] tracking-[0.14em] uppercase sm:inline-flex">
        Photo trip planner
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {phone && <LayoutPicker />}
        <button
          type="button"
          aria-pressed={terrain}
          onClick={() => set({ terrain: !terrain })}
          className={cx(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold max-sm:w-8 max-sm:justify-center max-sm:px-0',
            terrain ? 'rt-btn' : 'rt-btn-quiet text-muted hover:text-ink',
          )}
        >
          <Mountain className="size-3.5" aria-hidden />
          <span className="max-sm:sr-only">3D terrain</span>
        </button>
        <button
          type="button"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })}
          className="rt-btn-quiet grid size-8 place-items-center rounded-full"
        >
          {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        </button>
        <a href="https://ampq.dev/" className="ml-1 hidden font-mono text-xs text-muted no-underline hover:text-ink md:inline">by AMPQ</a>
      </div>
    </header>
  );
}

/** Switches between the phone layouts, to compare them on a real device. */
function LayoutPicker() {
  const layout = useStore((s) => s.mobileLayout);
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Phone layout</span>
      <Smartphone className="pointer-events-none absolute left-2.5 size-3.5 text-muted" aria-hidden />
      <select
        value={layout}
        onChange={(e) => useStore.setState({ mobileLayout: e.target.value as MobileLayout })}
        className="rt-btn-quiet h-8 appearance-none rounded-full border-0 pr-3 pl-7 text-xs font-semibold text-ink"
      >
        {MOBILE_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}

function Logo() {
  // An aperture whose blades are route segments.
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="var(--accent)" />
      <path d="M16 6.5 24.2 11v10L16 25.5 7.8 21V11Z" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 6.5v9.5l8.2 5M16 16l-8.2 5" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.4" fill="var(--accent-ink)" />
    </svg>
  );
}
