import { CITY_IDS, GEAR, GEAR_GROUPS, SPOTS, STYLES, TRIP } from '../lib/data';
import { useStore } from '../store';
import { Kicker, Seg, Toggle, cx } from './ui';

/**
 * The trip brief the prompt is built from. Edits apply as you make them: the
 * prompt updates live, and an imported plan keeps the brief it was checked
 * against until the next import.
 */
export function BriefForm() {
  const brief = useStore((s) => s.brief);
  const setBrief = useStore((s) => s.setBrief);
  const toggle = useStore((s) => s.toggle);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="brief" className="text-sm font-bold">What kind of trip is it?</label>
        <textarea
          id="brief"
          rows={4}
          value={brief.text}
          onChange={(e) => setBrief({ text: e.target.value })}
          className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent"
          placeholder="Who you are, what you shoot, what to avoid…"
        />
        <p className="m-0 text-xs text-muted">Your AI reads this as context. The settings below are the rules it has to follow.</p>
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <Kicker>Trip frame · fixed in this demo</Kicker>
        <p className="mt-1 mb-0 text-sm font-semibold">{TRIP.region}, {TRIP.dates}</p>
        <p className="m-0 flex flex-wrap items-center gap-1 text-xs text-muted">
          <span className="font-semibold text-gz">Guangzhou 5 nights</span> →
          <span className="font-semibold text-sz">Shenzhen 2</span> →
          <span className="font-semibold text-hk">Hong Kong 7</span> · 3 train legs
        </p>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-2 text-sm font-bold">Gear you're bringing</legend>
        {GEAR_GROUPS.map((g) => (
          <div key={g.kind} className="grid gap-1.5">
            <Kicker>{g.label}</Kicker>
            <div className="flex flex-wrap gap-1.5">
              {GEAR.filter((i) => i.kind === g.kind).map((i) => (
                <Toggle key={i.id} on={brief.gear.includes(i.id)} onClick={() => toggle('gear', i.id)}>{i.label}</Toggle>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold">What you like to shoot</legend>
        <div className="flex flex-wrap gap-1.5">
          {STYLES.map((s) => (
            <Toggle key={s.id} on={brief.styles.includes(s.id)} onClick={() => toggle('styles', s.id)}>{s.label}</Toggle>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-2 text-sm font-bold">How you travel</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">Pace</span>
          <Seg label="Pace" value={brief.pace} onChange={(v) => setBrief({ pace: v })}
            options={[{ v: 'relaxed', label: 'Relaxed' }, { v: 'balanced', label: 'Balanced' }, { v: 'packed', label: 'Packed' }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">Walking</span>
          <Seg label="Walking" value={brief.walking} onChange={(v) => setBrief({ walking: v })}
            options={[{ v: 'low', label: 'Easy' }, { v: 'medium', label: 'Some' }, { v: 'high', label: 'Hikes' }]} />
        </div>
        <Switch on={brief.work} onChange={(v) => setBrief({ work: v })} label="Working Mon–Fri, 09:00–18:00" />
        <Switch on={brief.fridayEarly} disabled={!brief.work} onChange={(v) => setBrief({ fridayEarly: v })} label="Finish early on Fridays" />
        <Switch on={brief.avoidCrowds} onChange={(v) => setBrief({ avoidCrowds: v })} label="Avoid crowded spots" />
      </fieldset>

      <SpotPicks />
    </div>
  );
}

type Pick = 'none' | 'must' | 'skip';
const NEXT: Record<Pick, Pick> = { none: 'must', must: 'skip', skip: 'none' };

/** Must-see and skip spots: each pill cycles through no preference, must see and skip. */
function SpotPicks() {
  const must = useStore((s) => s.brief.must);
  const avoid = useStore((s) => s.brief.avoid);
  const setBrief = useStore((s) => s.setBrief);
  const state = (id: string): Pick => (must.includes(id) ? 'must' : avoid.includes(id) ? 'skip' : 'none');
  const cycle = (id: string) => {
    const next = NEXT[state(id)];
    setBrief({
      must: next === 'must' ? [...must, id] : must.filter((x) => x !== id),
      avoid: next === 'skip' ? [...avoid, id] : avoid.filter((x) => x !== id),
    });
  };

  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
        Must-see and skip
        <span className="font-mono text-[11px] font-normal text-muted">{must.length} must · {avoid.length} skip</span>
      </summary>
      <div className="grid gap-3 border-t border-line px-3 py-3">
        <p className="m-0 text-xs text-muted">Click a spot to mark it must-see, click again to skip it, a third time to clear.</p>
        {CITY_IDS.map((c) => (
          <div key={c} className="grid gap-1.5">
            <Kicker className={`c-${c} text-(--c)`}>{TRIP.cities[c].name}</Kicker>
            <div className="flex flex-wrap gap-1.5">
              {SPOTS.filter((s) => s.city === c).map((s) => {
                const st = state(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => cycle(s.id)}
                    aria-label={`${s.name}: ${st === 'must' ? 'must see' : st === 'skip' ? 'skip' : 'no preference'}`}
                    className={cx(
                      'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors',
                      st === 'must' && 'border-accent bg-accent text-accent-ink',
                      st === 'skip' && 'border-line bg-surface-2 text-muted line-through',
                      st === 'none' && 'border-line bg-surface-2 text-ink hover:border-muted',
                    )}
                  >
                    {s.name.split(/,| & /)[0]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-sm text-ink disabled:opacity-45"
    >
      <span>{label}</span>
      <span className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <span className={cx('absolute top-1 size-4 rounded-full bg-surface shadow transition-all', on ? 'left-5' : 'left-1')} />
      </span>
    </button>
  );
}

