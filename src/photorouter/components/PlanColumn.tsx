import { useEffect, useRef } from 'react';
import { Maximize2, PanelLeftOpen } from 'lucide-react';
import { openStepper, useStore, type PlanView } from '../store';
import { PlanPanel } from './PlanPanel';
import { cx } from './ui';

const RAIL = 'w-[52px]';

/**
 * The plan panel's own column on wide screens. Docked, it sits beside the map;
 * collapsed, it folds to a slim rail so the map and the day panel get the room.
 * The panel keeps its width while the column animates, so nothing inside it reflows.
 */
export function PlanColumn() {
  const view = useStore((s) => s.planView);
  const plan = useStore((s) => s.plan);
  const collapsed = view === 'collapsed';
  const toggled = useRef(false);

  const set = (v: PlanView) => {
    toggled.current = true;
    useStore.setState({ planView: v });
  };

  // After a toggle, focus lands on the control that undoes it.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    document.getElementById(collapsed ? 'plan-expand' : 'plan-collapse')?.focus({ preventScroll: true });
  }, [collapsed]);

  return (
    <aside
      className={cx(
        'relative z-20 min-h-0 border-r border-line bg-surface transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
        collapsed ? RAIL : 'w-[360px]',
      )}
    >
      <div className="absolute inset-0 overflow-hidden" inert={collapsed}>
        <div className={cx('h-full w-[359px] transition-opacity duration-200 motion-reduce:transition-none', collapsed && 'opacity-0')}>
          <PlanPanel onCollapse={() => set('collapsed')} />
        </div>
      </div>

      <div
        inert={!collapsed}
        className={cx(
          'rt-leather pr-rail absolute inset-y-0 left-0 flex flex-col items-center gap-2 py-3 transition-opacity duration-200 motion-reduce:transition-none',
          RAIL,
          collapsed ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button type="button" id="plan-expand" aria-label="Show the plan panel" data-tip="Show the plan panel" onClick={() => set('docked')} className="pr-tip rt-btn-quiet grid size-9 place-items-center rounded-full">
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Plan step by step, full screen" data-tip="Plan step by step, full screen" onClick={() => openStepper()} className="pr-tip rt-btn grid size-9 place-items-center rounded-full">
          <Maximize2 className="size-4" aria-hidden />
        </button>
        <span className="pr-rail-rule my-1" aria-hidden />
        {/* The spine of the folded panel: a pointer shortcut for Show the plan panel, which keyboard users reach above. */}
        <div onClick={() => set('docked')} className="pr-rail-spine flex min-h-0 flex-1 cursor-pointer items-center justify-end gap-2.5 py-1" aria-hidden>
          <span className="font-display text-[17px] leading-none font-extrabold tracking-[0.06em] text-[#efe7d8] uppercase">Plan your trip</span>
          <span className={cx('size-1.5 rounded-full', plan ? 'bg-[#f28a3c]' : 'bg-[#5b5047]')} />
          <span className="font-mono text-[10px] tracking-[0.14em] text-[#e89a4a] uppercase">
            {plan ? `${plan.days.length} days · ${plan.stops} stops` : 'No route yet'}
          </span>
        </div>
      </div>
    </aside>
  );
}
