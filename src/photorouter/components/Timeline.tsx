import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { TRIP, dayLabel, dayNum, weekday } from '../lib/data';
import { useStore } from '../store';
import { overview, selectDay, step, togglePlay } from '../map/player';
import { IconButton, cx, radioKeys } from './ui';

const SPEEDS = [1, 2] as const;

const SPANS = [
  { city: 'gz', label: 'Guangzhou · 5 nights', from: 1, to: 6 },
  { city: 'sz', label: 'Shenzhen · 2', from: 6, to: 8 },
  { city: 'hk', label: 'Hong Kong · 7 nights', from: 8, to: 15 },
  { city: 'out', label: 'Fly', from: 15, to: 16 },
] as const;

export function Timeline() {
  const plan = useStore((s) => s.plan);
  const day = useStore((s) => s.day);
  const playing = useStore((s) => s.playing);
  const progress = useStore((s) => s.progress);
  const speed = useStore((s) => s.speed);
  const set = useStore((s) => s.set);
  const disabled = !plan;

  const status = !plan
    ? 'No route yet: load your AI\'s answer or the example'
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
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent pr-4 pl-3 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
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
              className={cx('h-7 rounded-full px-2.5 font-mono text-xs', speed === v ? 'bg-ink text-surface' : 'text-muted hover:text-ink')}
            >
              {v}×
            </button>
          ))}
        </div>
        <span className="ml-auto basis-full font-mono text-xs text-muted sm:basis-auto" aria-live="polite">{status}</span>
      </div>

      <div className="grid grid-cols-15 gap-0.5 sm:gap-1" aria-hidden>
        {SPANS.map((s) => (
          <span
            key={s.city}
            style={{ gridColumn: `${s.from} / ${s.to}` }}
            className={cx(
              s.city !== 'out' && `c-${s.city}`,
              'truncate border-b-2 border-current px-0.5 pb-1 font-mono text-[9.5px] tracking-wide whitespace-nowrap uppercase sm:text-[11px]',
              s.city === 'out' ? 'text-muted max-sm:invisible' : 'text-(--c)',
            )}
          >
            {s.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-15 gap-0.5 sm:gap-1">
        {TRIP.days.map((d, i) => {
          const city = d.kind === 'depart' ? null : d.city;
          // The plan's kind, not the frame's: a "no work" brief turns work days free.
          const kind = plan?.days[i]?.kind ?? d.kind;
          const free = kind === 'free' || kind === 'movefree';
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
              className={cx(
                city && `c-${city}`,
                'relative grid min-w-0 justify-items-center gap-px rounded-lg border px-0 pt-1.5 pb-2 transition-colors disabled:cursor-default',
                current ? 'border-ink bg-surface-2' : 'border-transparent hover:bg-surface-2',
              )}
            >
              <span className="font-mono text-[9px] text-muted uppercase sm:text-[10px]">{weekday(d.date).slice(0, 2)}</span>
              <span className={cx('font-display text-[17px] leading-none font-extrabold sm:text-2xl', day != null && i < day && 'text-muted')}>
                {dayNum(d.date)}
              </span>
              <span className={cx('relative mt-0.5 h-1.5 w-[72%] overflow-hidden rounded-full', city ? 'bg-(--c)' : 'bg-muted', free ? 'opacity-100' : 'opacity-35')}>
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
