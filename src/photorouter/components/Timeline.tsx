import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { TRIP, cityStyle, dayLabel, dayNum, weekday } from '../lib/data';
import { useStore } from '../store';
import { overview, selectDay, step, togglePlay } from '../map/player';
import { IconButton, cx, radioKeys } from './ui';

const SPEEDS = [1, 2] as const;

/** Runs of consecutive nights in one city, as grid column spans. */
function spans() {
  const out: { city: string; label: string; from: number; to: number }[] = [];
  TRIP.days.forEach((d, i) => {
    const last = out.at(-1);
    if (last && last.city === d.city) last.to = i + 2;
    else out.push({ city: d.city, label: '', from: i + 1, to: i + 2 });
  });
  for (const s of out) {
    const n = s.to - s.from;
    s.label = TRIP.cities[s.city] ? `${TRIP.cities[s.city]!.name} · ${n} ${n === 1 ? 'night' : 'nights'}` : `${TRIP.title} · ${n} days`;
  }
  return out;
}

export function Timeline() {
  const plan = useStore((s) => s.plan);
  const day = useStore((s) => s.day);
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const speed = useStore((s) => s.speed);
  const set = useStore((s) => s.set);
  useStore((s) => s.trip); // re-render when the trip changes
  const disabled = !plan;
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, TRIP.days.length)}, minmax(0, 1fr))` };

  const status = !plan
    ? 'No route yet: paste your AI assistant\'s reply or load the example'
    : day == null
      ? `${TRIP.days.length} days · pick a day or press play`
      : `Day ${day + 1} of ${TRIP.days.length} · ${dayLabel(TRIP.days[day]!.date)}${playing ? ' · playing' : ''}`;

  return (
    <section aria-label="Trip timeline" className="grid gap-2.5 border-t border-line bg-surface px-3 pt-3 pb-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={togglePlay}
          className="rt-btn inline-flex h-9 items-center gap-1.5 rounded-full pr-4 pl-3 text-[13px] font-semibold disabled:opacity-40"
        >
          {playing ? <Pause className="size-4 fill-current" aria-hidden /> : <Play className="size-4 fill-current" aria-hidden />}
          {playing ? 'Pause' : 'Play trip'}
        </button>
        <IconButton label="Previous day" disabled={disabled} onClick={() => step(-1)}><ChevronLeft /></IconButton>
        <IconButton label="Next day" disabled={disabled} onClick={() => step(1)}><ChevronRight /></IconButton>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void overview()}
          className="h-9 rounded-full border border-line bg-surface-2 px-3 text-[13px] font-semibold hover:border-muted disabled:opacity-40"
        >
          Whole trip
        </button>
        <div
          role="radiogroup"
          aria-label="Playback speed"
          onKeyDown={radioKeys(SPEEDS, SPEEDS.indexOf(speed), (v) => set({ speed: v }))}
          className="inline-flex rounded-full border border-line bg-surface-2 p-0.5"
        >
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={speed === v}
              tabIndex={speed === v ? 0 : -1}
              onClick={() => set({ speed: v })}
              className={cx('h-7 rounded-full px-2.5 font-mono text-xs', speed === v ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}
            >
              {v}×
            </button>
          ))}
        </div>
        <span className="ml-auto basis-full font-mono text-xs text-muted sm:basis-auto" aria-live="polite">{status}</span>
      </div>

      <div className="grid gap-0.5 sm:gap-1" style={cols} aria-hidden>
        {spans().map((s) => (
          <span
            key={`${s.city}-${s.from}`}
            style={{ gridColumn: `${s.from} / ${s.to}`, ...cityStyle(s.city) }}
            className="truncate border-b-2 border-current px-0.5 pb-1 font-mono text-[9.5px] tracking-wide whitespace-nowrap text-(--c) uppercase sm:text-[11px]"
          >
            {s.label}
          </span>
        ))}
      </div>

      <div className="grid gap-0.5 sm:gap-1" style={cols}>
        {TRIP.days.map((d, i) => {
          const city = d.city;
          const kind = plan?.days[i]?.kind ?? d.kind;
          const free = kind === 'free' || kind === 'movefree' || kind === 'daytrip';
          const current = day === i;
          const fill = day == null ? 0 : i < day ? 1 : current ? progress : 0;
          const stops = plan?.days[i]?.slots.length ?? 0;
          return (
            <button
              key={d.date}
              type="button"
              disabled={disabled}
              aria-current={current ? 'date' : undefined}
              aria-label={`${dayLabel(d.date)}: ${plan?.days[i]?.title ?? d.title}`}
              onClick={() => void selectDay(i)}
              style={cityStyle(city)}
              className={cx(
                'relative grid min-w-0 justify-items-center gap-px rounded-lg border px-0 pt-1.5 pb-2 transition-colors disabled:cursor-default',
                current ? 'border-ink bg-surface-2' : 'border-transparent hover:bg-surface-2',
              )}
            >
              <span className="font-mono text-[9px] text-muted uppercase sm:text-[10px]">{weekday(d.date).slice(0, 2)}</span>
              <span className={cx('font-display text-[17px] leading-none font-extrabold sm:text-2xl', day != null && i < day && 'text-muted')}>
                {dayNum(d.date)}
              </span>
              <span className={cx('relative mt-0.5 h-1.5 w-[72%] overflow-hidden rounded-full', 'bg-(--c)', free ? 'opacity-100' : 'opacity-35')}>
                <span className="absolute inset-y-0 left-0 bg-ink/55 transition-[width] duration-300" style={{ width: `${fill * 100}%` }} />
              </span>
              {plan && (
                <span className="font-mono text-[9px] leading-none text-muted max-sm:hidden">{stops ? `${stops}×` : '–'}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-4 rounded-full bg-muted" />Free day</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-4 rounded-full bg-muted opacity-35" />Work day: shoot before and after hours</span>
      </div>
    </section>
  );
}
