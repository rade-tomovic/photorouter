import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Backpack, ChevronLeft, ChevronRight, MapPinned } from 'lucide-react';
import { GEAR_GROUPS, dayLabel, dayNum, gearItem, weekday } from '../lib/data';
import type { Plan } from '../lib/types';
import { useStore } from '../store';
import { selectDay } from '../map/player';
import { Kicker, cx } from './ui';

interface Use {
  id: string;
  label: string;
  short: string;
  kind: string;
  /** Indexes of the days it is used on. */
  days: Set<number>;
  stops: number;
}

/** Each piece of kit the route calls for, most used first, with the days and stops it is used on. */
function usage(plan: Plan): Use[] {
  const uses = new Map<string, Use>();
  for (const d of plan.days) {
    for (const s of d.slots) {
      for (const k of s.kit) {
        const g = gearItem(k.id);
        const u = uses.get(k.id) ?? { id: k.id, label: g?.label ?? k.label, short: k.label, kind: g?.kind ?? 'other', days: new Set(), stops: 0 };
        u.days.add(d.index);
        u.stops++;
        uses.set(k.id, u);
      }
    }
  }
  return [...uses.values()].sort((a, b) => b.days.size - a.days.size || b.stops - a.stops);
}

/**
 * What to pack, and when it comes out. The packing list groups the kit by kind, with a
 * strip of the trip's days under each item; the day list then names only what goes in
 * the bag on top of the kit that is needed every day.
 */
export function KitView({ plan }: { plan: Plan }) {
  const brief = useStore((s) => s.brief);
  const day = useStore((s) => s.day);

  const shooting = plan.days.filter((d) => d.slots.length);
  const used = usage(plan);
  // Kit used on every shooting day goes in the bag once; the day list leaves it out.
  const core = shooting.length > 1 ? used.filter((u) => u.days.size === shooting.length) : [];
  const coreIds = new Set(core.map((u) => u.id));
  const groups = [
    ...GEAR_GROUPS.map((g) => ({ label: g.label, items: used.filter((u) => u.kind === g.kind) })),
    { label: 'Other', items: used.filter((u) => !GEAR_GROUPS.some((g) => g.kind === u.kind)) },
  ].filter((g) => g.items.length);
  const owned = brief.gear.map((id) => gearItem(id)).filter((g): g is NonNullable<typeof g> => !!g && g.kind !== 'body');
  const unused = owned.filter((g) => !used.some((u) => u.id === g.id));
  const drone = used.some((u) => u.kind === 'drone');
  // With an everyday kit, the day list shows only the days that add to it.
  const listed = core.length ? shooting.filter((d) => used.some((u) => u.days.has(d.index) && !coreIds.has(u.id))) : shooting;
  const plain = shooting.length - listed.length;
  const picked = day != null ? plan.days[day] : undefined;

  return (
    <div className="grid gap-6 p-5">
      {picked && picked.slots.length > 0 && (
        <section key={picked.index} className="pr-enter grid gap-2 rounded-xl bg-accent-soft p-3.5" aria-label={`Bag for ${dayLabel(picked.date)}`}>
          <p className="m-0 flex items-center gap-2 text-sm font-bold">
            <Backpack className="size-4 text-accent" aria-hidden />
            Bag for {dayLabel(picked.date)}
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {used.filter((u) => u.days.has(picked.index)).map((u) => (
              <li key={u.id} className="inline-flex h-7 items-center rounded-full border border-line bg-surface px-2.5 text-xs font-semibold">{u.short}</li>
            ))}
          </ul>
          <p className="m-0 text-xs text-muted">
            {picked.slots.length} {picked.slots.length === 1 ? 'stop' : 'stops'}: {picked.title}
          </p>
        </section>
      )}

      <section className="grid gap-3" aria-labelledby="kit-pack">
        <div>
          <Kicker><span id="kit-pack">What to pack</span></Kicker>
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            {used.length} {used.length === 1 ? 'item' : 'items'} for {shooting.length} shooting {shooting.length === 1 ? 'day' : 'days'}. Each strip is the trip, one mark per day the item comes out. Tap a date for that day's bag.
          </p>
        </div>
        <KitStrips plan={plan} groups={groups} shooting={shooting.length} />
      </section>

      {unused.length > 0 && (
        <section className="grid gap-1.5 rounded-xl border border-dashed border-line p-3.5" aria-labelledby="kit-home">
          <Kicker><span id="kit-home">Could stay home</span></Kicker>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {unused.map((g) => (
              <li key={g.id} className="inline-flex h-7 items-center rounded-full bg-surface-2 px-2.5 text-xs font-semibold text-muted">{g.label}</li>
            ))}
          </ul>
          <p className="m-0 text-xs text-muted">No stop on this route calls for {unused.length > 1 ? 'them' : 'it'}.</p>
        </section>
      )}

      <section className="grid gap-2" aria-labelledby="kit-days">
        <div>
          <Kicker><span id="kit-days">Day by day</span></Kicker>
          {core.length > 0 && (
            <p className="m-0 mt-0.5 text-[13px] text-muted">
              Every day: <b className="font-semibold text-ink">{core.map((u) => u.short).join(', ')}</b>.
            </p>
          )}
        </div>
        {/* The strips above already show the days; a long list waits behind a click. */}
        {listed.length > 0 && (
          <details key={plan.trip.title} open={listed.length <= 4} className="group">
            <summary className="cursor-pointer list-none rounded-lg px-2 py-1.5 text-[13px] font-semibold text-accent hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
              {core.length ? `What to add, day by day (${listed.length} ${listed.length === 1 ? 'day' : 'days'})` : `Each day's bag (${listed.length} ${listed.length === 1 ? 'day' : 'days'})`}
            </summary>
            <ul className="m-0 mt-1 grid list-none gap-1 p-0">
              {listed.map((d) => {
                const extra = used.filter((u) => u.days.has(d.index) && !coreIds.has(u.id));
                return (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => void selectDay(d.index)}
                      aria-current={day === d.index ? 'date' : undefined}
                      className={cx(
                        'grid w-full grid-cols-[72px_minmax(0,1fr)] items-center gap-2 rounded-lg border-0 px-2 py-1.5 text-left',
                        day === d.index ? 'bg-accent-soft' : 'bg-transparent hover:bg-surface-2',
                      )}
                    >
                      <span className="font-mono text-xs text-muted">{weekday(d.date)} {dayNum(d.date)}</span>
                      <span className="flex flex-wrap gap-1">
                        {extra.length ? (
                          extra.map((u) => (
                            <span key={u.id} className="inline-flex h-6 items-center rounded-full border border-line bg-surface-2 px-2 text-xs font-semibold">
                              {u.short}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted">No kit listed</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        {plain > 0 && listed.length > 0 && (
          <p className="m-0 px-2 text-xs text-muted">
            The other {plain === 1 ? 'day needs' : `${plain} days need`} only the everyday kit.
          </p>
        )}
      </section>

      {drone && (
        <p className="m-0 flex items-start gap-1.5 text-xs text-muted">
          <MapPinned className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Drone rules differ by country and city: check registration and no-fly zones before you pack one.
        </p>
      )}
    </div>
  );
}

/** A day column's narrowest width: room for a date big enough to tap. */
const COL = 48;
const GAP = 4;

/**
 * The trip's dates over one strip per item. Columns keep a tap-sized width, so a long
 * trip scrolls sideways; the item names stay put, and arrows and faded edges show
 * when there are more days either way. Opening a day scrolls it into view.
 */
function KitStrips({ plan, groups, shooting }: { plan: Plan; groups: { label: string; items: Use[] }[]; shooting: number }) {
  const day = useStore((s) => s.day);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const cols = { gridTemplateColumns: `repeat(${plan.days.length}, minmax(${COL}px, 1fr))`, gap: GAP };

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new plan can arrive while the tab stays open (the plan column on wide screens):
  // start at its first day and measure the edges for its columns, which the observer misses.
  useLayoutEffect(() => {
    scroller.current!.scrollLeft = 0;
    measure();
  }, [plan]);

  useEffect(() => {
    const el = scroller.current;
    const btn = day != null ? el?.querySelector<HTMLElement>(`[data-day="${day}"]`) : null;
    if (!el || !btn) return;
    const left = btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2;
    el.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [day]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current!;
    el.scrollBy({ left: dir * (el.clientWidth - COL * 2), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="relative -mx-5">
      <div ref={scroller} onScroll={measure} className="@container overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* As wide as the days need, so the sticky names have room to stay put. */}
        <div className="grid w-max min-w-full gap-3">
          <div className="grid" style={cols}>
            {plan.days.map((d) => (
              <button
                key={d.date}
                type="button"
                data-day={d.index}
                disabled={!d.slots.length}
                onClick={() => void selectDay(d.index)}
                aria-label={`Open ${dayLabel(d.date)}`}
                aria-current={day === d.index ? 'date' : undefined}
                className={cx(
                  'grid justify-items-center gap-1 rounded-xl pt-2 pb-2.5 leading-none transition-[background-color,color,box-shadow] duration-300 disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none',
                  day === d.index ? 'bg-accent text-accent-ink shadow-card' : 'text-ink hover:bg-surface-2',
                )}
              >
                <span className={cx('font-mono text-[10px] uppercase', day === d.index ? 'font-semibold' : 'text-muted')}>{weekday(d.date).slice(0, 2)}</span>
                {/* The open day's date grows with a small overshoot; the others ease back. */}
                <span
                  className={cx(
                    'origin-top font-display text-2xl font-extrabold transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                    day === d.index && 'scale-[1.3]',
                  )}
                >
                  {dayNum(d.date)}
                </span>
              </button>
            ))}
          </div>
          {groups.map((g) => (
            <div key={g.label} className="grid gap-2">
              {/* Names stay in view while the strips scroll under them. */}
              <h3 className="sticky left-0 m-0 w-[100cqw] font-mono text-[11px] font-medium tracking-[0.08em] text-muted uppercase">{g.label}</h3>
              <ul className="m-0 grid list-none gap-3 p-0">
                {g.items.map((u) => (
                  <li key={u.id} className="grid gap-1.5">
                    <div className="sticky left-0 flex w-[100cqw] items-baseline justify-between gap-3">
                      <span className="min-w-0 text-sm font-semibold">{u.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">
                        {u.days.size === shooting ? 'Every day' : `${u.days.size} of ${shooting} days`}
                      </span>
                    </div>
                    {/* One neutral tone for the marks; the open day's column takes the accent of its date. */}
                    <div className="grid" style={cols} aria-hidden>
                      {plan.days.map((d) => (
                        <span
                          key={d.date}
                          className={cx(
                            'h-2 rounded-full transition-colors duration-300 motion-reduce:transition-none',
                            !u.days.has(d.index) ? (d.slots.length ? 'bg-surface-2' : 'bg-transparent')
                              : day == null ? 'bg-ink/55'
                              : day === d.index ? 'bg-accent'
                              : 'bg-ink/25',
                          )}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {/* Faded edges and arrows when there are more days off screen. */}
      <div aria-hidden className={cx('pointer-events-none absolute inset-y-0 left-0 w-5 bg-linear-to-r from-surface to-transparent transition-opacity', edges.left ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cx('pointer-events-none absolute inset-y-0 right-0 w-5 bg-linear-to-l from-surface to-transparent transition-opacity', edges.right ? 'opacity-100' : 'opacity-0')} />
      {edges.left && (
        <button type="button" aria-label="Earlier days" onClick={() => page(-1)} className="rt-btn-quiet absolute top-3 left-1 grid size-8 place-items-center rounded-full shadow-card [&_svg]:size-4">
          <ChevronLeft aria-hidden />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Later days" onClick={() => page(1)} className="rt-btn-quiet absolute top-3 right-1 grid size-8 place-items-center rounded-full shadow-card [&_svg]:size-4">
          <ChevronRight aria-hidden />
        </button>
      )}
    </div>
  );
}
