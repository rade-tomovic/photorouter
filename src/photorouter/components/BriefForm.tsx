import { useEffect, useState } from 'react';
import { GEAR, GEAR_GROUPS, STYLES, tripDates } from '../lib/data';
import { CONTINENT_LABEL, DEMOS } from '../lib/demos';
import { chooseDemo, useStore } from '../store';
import { LensField } from './LensPicker';
import { Kicker, Seg, Toggle, cx } from './ui';

const field = 'w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent';

/** Pick a demo trip: its brief fills the form and its spots go on the map. */
export function DemoPicker() {
  const demo = useStore((s) => s.demo);
  const custom = useStore((s) => s.custom);
  if (!DEMOS.length) return null;
  return (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      Start from a demo trip
      <select value={custom ? '' : demo ?? ''} onChange={(e) => e.target.value && chooseDemo(e.target.value)} className={cx(field, 'h-10 font-normal')}>
        {custom && <option value="">Your own trip</option>}
        {DEMOS.map((d) => (
          <option key={d.id} value={d.id}>{CONTINENT_LABEL[d.continent]}: {d.label}</option>
        ))}
      </select>
      <span className="text-xs font-normal text-muted">
        {custom ? 'Picking a demo replaces your brief with its own.' : DEMOS.find((d) => d.id === demo)?.blurb ?? 'Fills the brief; change anything.'}
      </span>
    </label>
  );
}

/**
 * The trip brief the prompt is built from. Edits apply as you make them: the
 * prompt updates live, and a loaded plan keeps the brief it was checked
 * against until the next import.
 */
export function BriefForm() {
  const brief = useStore((s) => s.brief);
  const setBrief = useStore((s) => s.setBrief);
  const toggle = useStore((s) => s.toggle);
  const dates = tripDates(brief.start, brief.days);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-bold">
          Where to
          <input
            value={brief.destination}
            onChange={(e) => setBrief({ destination: e.target.value })}
            placeholder="A country, a region or a list of cities"
            className={cx(field, 'h-10 font-normal')}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <label className="grid gap-1.5 text-sm font-bold">
            First day
            <input type="date" value={brief.start} onChange={(e) => e.target.value && setBrief({ start: e.target.value })} className={cx(field, 'h-10 font-normal')} />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Days
            <input
              type="number"
              min={2}
              max={21}
              value={brief.days}
              onChange={(e) => setBrief({ days: Math.max(2, Math.min(21, Number(e.target.value) || 2)) })}
              className={cx(field, 'h-10 font-normal')}
            />
          </label>
        </div>
        {dates.length > 0 && (
          <p className="m-0 font-mono text-[11px] text-muted">{dates[0]} to {dates.at(-1)} · the first day is the arrival</p>
        )}
      </div>

      <div className="grid gap-2">
        <label htmlFor="brief" className="text-sm font-bold">What kind of trip is it?</label>
        <textarea
          id="brief"
          rows={4}
          value={brief.text}
          onChange={(e) => setBrief({ text: e.target.value })}
          className={cx(field, 'resize-y py-2.5 leading-relaxed')}
          placeholder="Who you are, what you shoot, what to avoid…"
        />
        <p className="m-0 text-xs text-muted">Your AI reads this as context. The settings below are the rules it has to follow.</p>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-2 text-sm font-bold">Gear you're bringing</legend>
        {GEAR_GROUPS.map((g) => (
          <div key={g.kind} className="grid gap-1.5">
            <Kicker>{g.label}</Kicker>
            {g.kind === 'lens' ? (
              <LensField />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {GEAR.filter((i) => i.kind === g.kind).map((i) => (
                  <Toggle key={i.id} on={brief.gear.includes(i.id)} onClick={() => toggle('gear', i.id)}>{i.label}</Toggle>
                ))}
              </div>
            )}
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
        <Switch on={brief.work} onChange={(v) => setBrief({ work: v })} label="Working Mon-Fri, 09:00-18:00" />
        <Switch on={brief.fridayEarly} disabled={!brief.work} onChange={(v) => setBrief({ fridayEarly: v })} label="Finish early on Fridays" />
        <Switch on={brief.avoidCrowds} onChange={(v) => setBrief({ avoidCrowds: v })} label="Avoid crowded spots" />
      </fieldset>

      <PlaceList label="Must-see places" hint="Your AI plans these or explains why not." value={brief.must} onChange={(must) => setBrief({ must })} />
      <PlaceList label="Places to skip" hint="Never planned." value={brief.avoid} onChange={(avoid) => setBrief({ avoid })} />
    </div>
  );
}

/** A comma-separated list of place names, kept as typed until the field loses focus. */
function PlaceList({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  const commit = () => onChange(text.split(',').map((x) => x.trim()).filter(Boolean));
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      {label}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        placeholder="Comma separated"
        className={cx(field, 'h-10 font-normal')}
      />
      <span className="text-xs font-normal text-muted">{hint}</span>
    </label>
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

