import { useMemo, type KeyboardEvent } from 'react';
import { BedDouble, Bus, Car, FileJson, Footprints, MapPinned, Plane, Route, Ship, Sparkles, Sunrise, Sunset, TrainFront, TriangleAlert } from 'lucide-react';
import { CITY_IDS, KIND_LABEL, LIGHT_LABEL, SPOT, SPOTS, TRIP, cityStyle, dayLabel, dayNum, gearItem, monthName, weekday } from '../lib/data';
import { hhmm, sunDay, tzOffset } from '../lib/sun';
import type { Light, Plan } from '../lib/types';
import { loadExample, useStore, type Tab } from '../store';
import { selectDay, selectSpot } from '../map/player';
import { PlanPanel } from './PlanPanel';
import { Button, CityChip, Kicker, LightChip, Pill, Toggle, cx } from './ui';

export function SidePanel({ withPlan }: { withPlan: boolean }) {
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);
  const tabs: { id: Tab; label: string }[] = [
    ...(withPlan ? [{ id: 'plan' as Tab, label: 'Plan' }] : []),
    { id: 'day', label: 'Day' },
    { id: 'spots', label: 'Spots' },
    { id: 'kit', label: 'Kit' },
    { id: 'info', label: 'Trip info' },
  ];
  const active = !withPlan && tab === 'plan' ? 'day' : tab;

  // Arrow keys, Home and End move between tabs; only the selected tab is in the tab order.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length]!;
    set({ tab: t.id });
    document.getElementById(`tab-${t.id}`)?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Trip panels" onKeyDown={onKey} className="flex gap-1 border-b border-line px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => set({ tab: t.id })}
            className={cx(
              '-mb-px h-10 border-b-2 px-2.5 text-[13px] font-semibold transition-colors',
              active === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className={cx('relative min-h-0 flex-1', active === 'plan' ? 'flex flex-col' : 'scroll-thin overflow-y-auto')}>
        {active === 'plan' && <PlanPanel />}
        {active === 'day' && <DayView />}
        {active === 'spots' && <SpotIndex />}
        {active === 'kit' && <KitView />}
        {active === 'info' && <InfoView />}
      </div>
    </div>
  );
}

function NoPlan() {
  const set = useStore((s) => s.set);
  return (
    <div className="grid gap-3 p-5">
      <Kicker>No route yet</Kicker>
      <h2 className="m-0 font-display text-3xl leading-none font-extrabold uppercase">Your AI plans the route</h2>
      <p className="m-0 text-sm text-muted">
        Describe where you're going, the gear you're bringing and what you like to shoot. PhotoRouter turns that into a
        prompt. Your own AI picks the cities and photo spots and returns JSON; paste it here and the route plays on the map.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => set({ tab: 'plan' })}>
          <Route className="size-4" aria-hidden /> Plan with your AI
        </Button>
        <Button onClick={() => loadExample()}>
          <FileJson className="size-4" aria-hidden /> Load the example
        </Button>
      </div>
    </div>
  );
}

function sunFor(date: string, city: string) {
  const c = TRIP.cities[city]!;
  return sunDay(date, c.ll[1], c.ll[0], tzOffset(date, TRIP.tz));
}

const MODE_ICON = { train: TrainFront, flight: Plane, ferry: Ship, car: Car, bus: Bus } as const;
const duration = (m: number) => (m < 90 ? `${m} min` : `${Math.round(m / 30) / 2} h`);

function DayView() {
  const plan = useStore((s) => s.plan);
  const day = useStore((s) => s.day);
  const activeStep = useStore((s) => s.activeStep);
  if (!plan) return <NoPlan />;
  if (day == null) return <Overview plan={plan} />;

  const d = plan.days[day]!;
  const sun = sunFor(d.date, d.city);
  const leg = d.leg ? TRIP.legs[d.leg] : null;
  const LegIcon = MODE_ICON[leg?.mode ?? 'train'];
  const legCard = leg && (
    <div className={cx('grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 rounded-xl p-3 text-[13.5px] transition-colors', activeStep === -1 ? 'bg-accent-soft' : 'bg-surface-2')}>
      <LegIcon className="mt-0.5 size-[18px] text-accent" aria-hidden />
      <div>
        <p className="m-0 font-semibold">{leg.label}</p>
        <p className="m-0 text-muted">{TRIP.cities[leg.from]?.name} to {TRIP.cities[leg.to]?.name}{leg.minutes ? `, about ${duration(leg.minutes)}` : ''}</p>
      </div>
    </div>
  );
  // Show the train where it happens: a travel day's morning stop comes before it.
  const legAt = d.steps.findIndex((st) => st.type === 'leg');
  const beforeLeg = new Set(d.steps.slice(0, Math.max(0, legAt)).flatMap((st) => (st.type === 'stop' ? [st.slot] : [])));
  const renderSlots = (which: (i: number) => boolean) => (
    <ol className="m-0 grid list-none p-0">
  {d.slots.map((slot, i) => {
    if (!which(i)) return null;
        const s = SPOT[slot.spotId]!;
        const on = activeStep === i;
        return (
          <li key={slot.spotId} className={cx('grid grid-cols-[96px_minmax(0,1fr)] gap-2.5 border-t border-line py-3 transition-colors first:border-t-0 max-sm:grid-cols-1 max-sm:gap-1', on && '-mx-3 rounded-xl border-transparent bg-accent-soft px-3')}>
            <div className="pt-0.5 font-mono text-[11px] tracking-wide text-muted uppercase">
              {slot.label}
              <b className="block font-medium text-ink">{slot.window}</b>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <button type="button" onClick={() => selectSpot(s.id)} style={cityStyle(s.city)} className="group flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-0 bg-transparent p-0 text-left">
                <span className="inline-grid size-5 shrink-0 translate-y-[3px] place-items-center rounded-full bg-(--c) font-mono text-[11px] font-medium text-white">{i + 1}</span>
                <span className="text-[15px] font-bold group-hover:underline">{s.name}</span>
                {s.local && <span className="font-zh text-[13px] text-muted">{s.local}</span>}
              </button>
              <p className="m-0 text-[13.5px] text-muted">{slot.note ?? s.tip}</p>
              <div className="flex flex-wrap gap-1">
                <LightChip light={s.light} />
                {slot.kit.map((k) => <Pill key={k.id} className="font-mono font-medium">{k.label}</Pill>)}
              </div>
              {slot.why && (
                <p className="m-0 flex items-start gap-1.5 text-xs text-muted">
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden />
                  <span>Why: {slot.why}</span>
                </p>
              )}
              {slot.warnings.map((w) => (
                <p key={w} className="m-0 flex items-start gap-1.5 text-xs text-golden">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden /> {w}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <article key={day} className="pr-enter grid gap-4 p-5" aria-live="polite">
      <header className="flex items-end gap-3.5">
        <span className="font-display text-7xl leading-[0.8] font-extrabold">{dayNum(d.date)}</span>
        <div className="grid min-w-0 gap-1">
          <Kicker>{weekday(d.date)} · {monthName(d.date)} · Day {day + 1} of {plan.days.length}</Kicker>
          <h2 className="m-0 font-display text-[28px] leading-none font-extrabold text-balance uppercase">{d.title}</h2>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {d.from && <><CityChip city={d.from} /><span className="text-muted">→</span></>}
        <CityChip city={d.city} />
        <Pill>{KIND_LABEL[d.kind]}</Pill>
      </div>

      {beforeLeg.size > 0 && renderSlots((i) => beforeLeg.has(i))}
      {legCard}
      {d.slots.length > beforeLeg.size ? (
        renderSlots((i) => !beforeLeg.has(i))
      ) : d.slots.length === 0 ? (
        <p className="m-0 text-sm text-muted">{d.move && d.index === 0 ? `${d.move}. No shooting planned.` : 'Nothing scheduled on this day.'}</p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 font-mono text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1"><Sunrise className="size-3.5" aria-hidden /> {hhmm(sun.sunrise)}</span>
        <span className="inline-flex items-center gap-1"><Sunset className="size-3.5" aria-hidden /> {hhmm(sun.sunset)}</span>
        <span>Blue hour until {hhmm(sun.blueEnd)}</span>
        {d.walkKm > 0 && <span className="inline-flex items-center gap-1"><Footprints className="size-3.5" aria-hidden /> {d.walkKm.toFixed(1)} km on foot</span>}
      </div>
    </article>
  );
}

function Overview({ plan }: { plan: Plan }) {
  const stages = CITY_IDS.map((c) => {
    const days = plan.days.filter((d) => d.city === c);
    return { c, first: days[0]!, last: days[days.length - 1]!, stops: plan.days.reduce((n, d) => n + d.slots.filter((s) => s.city === c).length, 0) };
  });
  return (
    <div className="pr-enter grid gap-4 p-5">
      <div>
        <Kicker>The plan</Kicker>
        <h2 className="m-0 font-display text-3xl leading-none font-extrabold uppercase">{TRIP.title}</h2>
        <p className="m-0 mt-1 font-mono text-xs text-muted">{plan.days.length} days, {stages.length} {stages.length === 1 ? 'city' : 'cities'}</p>
      </div>
      {TRIP.summary && <p className="m-0 text-[13.5px]">{TRIP.summary}</p>}
      <dl className="m-0 grid grid-cols-3 gap-2">
        {[
          [plan.stops, 'stops'],
          [plan.spots, 'spots'],
          [Math.round(plan.walkKm), 'km on foot'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-surface-2 p-3">
            <dd className="m-0 font-display text-3xl leading-none font-extrabold">{v}</dd>
            <dt className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{l}</dt>
          </div>
        ))}
      </dl>
      <ul className="m-0 grid list-none gap-2 p-0">
        {stages.map(({ c, first, last, stops }) => (
          <li key={c} style={cityStyle(c)}>
            <button type="button" onClick={() => void selectDay(first.index)} className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-0 bg-surface-2 px-3 py-2.5 text-left hover:brightness-[.98]">
              <i className="h-8 w-2.5 rounded-sm bg-(--c)" />
              <span>
                <b className="block">{TRIP.cities[c]!.name}</b>
                <span className="font-mono text-xs text-muted">Base {TRIP.cities[c]!.baseLabel}</span>
              </span>
              <span className="text-right font-mono text-xs text-muted">{dayNum(first.date)} {monthName(first.date)} to {dayNum(last.date)} {monthName(last.date)}<br />{stops} stops</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13.5px] text-muted">
        Press <b className="text-ink">Play trip</b> to fly through it day by day: the camera rides each travel leg, and a walker
        follows your route between stops. Or tap a date. Tap any dot for the spot, its light and its local name to show a driver.
      </p>
      {plan.skipped.length > 0 && (
        <div className="grid gap-1.5">
          <Kicker>Considered, left out</Kicker>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            {plan.skipped.map((s) => (
              <li key={s.name}>
                <b>{s.name}</b>
                <span className="text-muted">: {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 flex items-center gap-1.5 font-mono text-[11.5px] text-muted"><BedDouble className="size-3.5" aria-hidden /> Bases: {CITY_IDS.map((c) => TRIP.cities[c]!.baseLabel).join(', ')}</p>
    </div>
  );
}

function SpotIndex() {
  const plan = useStore((s) => s.plan);
  const lights = useStore((s) => s.lights);
  const toggle = useStore((s) => s.toggle);
  const when = useMemo(() => {
    const m = new Map<string, number>();
    plan?.days.forEach((d, i) => d.slots.forEach((s) => m.set(s.spotId, i)));
    return m;
  }, [plan]);

  return (
    <div className="grid gap-4 p-4">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by light">
        <span className="mr-1 text-xs text-muted">Light:</span>
        {(Object.keys(LIGHT_LABEL) as Light[]).map((l) => (
          <Toggle key={l} dot className={`lt-${l}`} on={lights.includes(l)} onClick={() => toggle('lights', l)}>{LIGHT_LABEL[l]}</Toggle>
        ))}
      </div>
      {CITY_IDS.map((c) => {
        const list = SPOTS.filter((s) => s.city === c && s.lights.some((l) => lights.includes(l)))
          .sort((a, b) => (when.get(a.id) ?? 99) - (when.get(b.id) ?? 99));
        return (
          <section key={c} style={cityStyle(c)} className="rounded-xl border border-line bg-surface px-3 pt-2.5 pb-1">
            <h3 className="m-0 mb-1 flex items-baseline justify-between font-display text-[22px] font-extrabold text-(--c) uppercase">
              {TRIP.cities[c]!.name} {TRIP.cities[c]!.local && <span className="font-zh text-sm font-medium text-muted">{TRIP.cities[c]!.local}</span>}
            </h3>
            <ul className="m-0 list-none p-0">
              {list.map((s) => {
                const d = when.get(s.id);
                return (
                  <li key={s.id} className="border-t border-line first:border-t-0">
                    <button type="button" onClick={() => selectSpot(s.id)} className="group grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2.5 border-0 bg-transparent px-0.5 py-2 text-left">
                      <i className={cx('size-2.5 rounded-full', d != null ? 'bg-(--c)' : 'border-2 border-(--c)')} />
                      <span className="truncate text-sm font-semibold group-hover:underline">{s.name}</span>
                      <span className="font-mono text-[11px] text-muted">{d != null ? dayLabel(TRIP.days[d]!.date) : plan ? 'not planned' : LIGHT_LABEL[s.light]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function KitView() {
  const plan = useStore((s) => s.plan);
  const brief = useStore((s) => s.brief);
  if (!plan) return <NoPlan />;
  const uses = new Map<string, number>();
  plan.days.forEach((d) => d.slots.forEach((s) => s.kit.forEach((k) => uses.set(k.id, (uses.get(k.id) ?? 0) + 1))));
  const owned = brief.gear.map((id) => gearItem(id)).filter((g): g is NonNullable<typeof g> => !!g && g.kind !== 'body');
  const unused = owned.filter((g) => !uses.has(g.id));
  const max = Math.max(1, ...uses.values());

  return (
    <div className="grid gap-5 p-5">
      <div>
        <Kicker>Kit, by how often you'll reach for it</Kicker>
        <ul className="m-0 mt-2 grid list-none gap-2 p-0">
          {[...uses.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
            <li key={id} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="truncate font-semibold">{gearItem(id)?.short}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="font-mono text-xs text-muted">{n} stops</span>
            </li>
          ))}
        </ul>
      </div>
      {unused.length > 0 && (
        <p className="m-0 rounded-xl bg-surface-2 p-3 text-[13.5px]">
          <b>Could stay home:</b> {unused.map((g) => g.label).join(', ')}. No stop on this route calls for {unused.length > 1 ? 'them' : 'it'}.
        </p>
      )}
      <div className="grid gap-2">
        <Kicker>Daily bag</Kicker>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {plan.days.filter((d) => d.slots.length).map((d) => {
            const bag = [...new Set(d.slots.flatMap((s) => s.kit.map((k) => k.label)))];
            return (
              <li key={d.date}>
                <button type="button" onClick={() => void selectDay(d.index)} className="grid w-full grid-cols-[72px_minmax(0,1fr)] gap-2 border-0 bg-transparent p-0 text-left text-[13px] hover:underline">
                  <span className="font-mono text-xs text-muted">{dayLabel(d.date)}</span>
                  <span className={bag.length ? '' : 'text-muted'}>{bag.join(' · ') || 'No kit listed'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="m-0 flex items-start gap-1.5 text-xs text-muted">
        <MapPinned className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Drone rules differ by country and city: check registration and no-fly zones before you pack one.
      </p>
    </div>
  );
}

function InfoView() {
  const plan = useStore((s) => s.plan);
  const legs = Object.values(TRIP.legs);
  return (
    <div className="grid gap-3 p-4">
      <article className="rounded-xl border border-line bg-surface p-4">
        <h3 className="m-0 mb-1.5 font-mono text-[12px] font-medium tracking-wide text-muted uppercase">{plan ? 'This trip' : 'Demo trip'}</h3>
        <p className="m-0 text-sm font-semibold">{TRIP.title || 'No trip loaded'}</p>
        {TRIP.summary && <p className="m-0 mt-1.5 text-sm">{TRIP.summary}</p>}
        {!plan && <p className="m-0 mt-1.5 text-sm text-muted">Its spots are on the map. Load the example to see the full route, or plan your own trip in the Plan panel.</p>}
      </article>
      {legs.length > 0 && (
        <article className="rounded-xl border border-line bg-surface p-4">
          <h3 className="m-0 mb-1.5 font-mono text-[12px] font-medium tracking-wide text-muted uppercase">Getting between cities</h3>
          <ul className="m-0 grid list-none gap-1 p-0 text-sm">
            {legs.map((l) => (
              <li key={`${l.from}-${l.to}`}>
                {TRIP.cities[l.from]?.name} to {TRIP.cities[l.to]?.name}: {l.label}{l.minutes ? `, about ${duration(l.minutes)}` : ''}
              </li>
            ))}
          </ul>
        </article>
      )}
      <p className="m-0 text-xs text-muted">
        Light times are computed for each date and city in the destination's time zone ({TRIP.tz}). Spots, coordinates and travel times
        come from the AI's answer: check them before you go. Travel lines on the map are arcs between bases, not real routes.
      </p>
    </div>
  );
}
