import { useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { FOCAL_BUCKETS, FORMAT_LABEL, LENSES, customLensId, inBucket, lensFor, lensLabel, type Lens } from '../lib/gear';
import { useStore } from '../store';
import { Button, Seg, cx } from './ui';

type TypeFilter = 'all' | 'prime' | 'zoom' | 'special';
type FormatFilter = 'all' | 'ff' | 'apsc' | 'mft';
const APERTURES = [
  { id: 'any', label: 'Any', max: Infinity },
  { id: '1.4', label: 'f/1.4 or faster', max: 1.4 },
  { id: '2', label: 'f/2 or faster', max: 2 },
  { id: '2.8', label: 'f/2.8 or faster', max: 2.8 },
  { id: '4', label: 'f/4 or faster', max: 4 },
] as const;
const CUSTOM_APERTURES = [0.95, 1.2, 1.4, 1.8, 2, 2.8, 3.5, 4, 4.5, 5, 5.6, 6.3, 8];

const chip = (on: boolean) =>
  cx(
    'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors',
    on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface-2 text-muted hover:border-muted hover:text-ink',
  );

/** The lenses in the brief, with a button that opens the full catalog. */
export function LensField() {
  const gear = useStore((s) => s.brief.gear);
  const toggle = useStore((s) => s.toggle);
  const dialog = useRef<HTMLDialogElement>(null);
  const chosen = gear.map((id) => lensFor(id)).filter((l): l is Lens => !!l);

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {chosen.map((l) => (
          <span key={l.id} className="inline-flex h-7 items-center gap-1 rounded-full border border-ink bg-ink pr-1 pl-2.5 text-xs font-semibold text-surface">
            {lensLabel(l)}
            <button type="button" aria-label={`Remove ${lensLabel(l)}`} onClick={() => toggle('gear', l.id)} className="grid size-5 place-items-center rounded-full border-0 bg-transparent text-surface hover:bg-white/15">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => dialog.current?.showModal()} className={cx(chip(false), 'gap-1 text-accent')}>
          <Plus className="size-3.5" aria-hidden /> {chosen.length ? 'Add or change lenses' : 'Choose lenses'}
        </button>
      </div>
      <LensDialog dialog={dialog} />
    </div>
  );
}

function LensDialog({ dialog }: { dialog: React.RefObject<HTMLDialogElement | null> }) {
  const gear = useStore((s) => s.brief.gear);
  const toggle = useStore((s) => s.toggle);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [format, setFormat] = useState<FormatFilter>('all');
  const [bucket, setBucket] = useState<string>('all');
  const [aperture, setAperture] = useState<(typeof APERTURES)[number]['id']>('any');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const maxF = APERTURES.find((a) => a.id === aperture)!.max;
    const b = FOCAL_BUCKETS.find((x) => x.id === bucket);
    return LENSES.filter((l) => {
      if (type === 'prime' && (l.type !== 'prime' || l.special)) return false;
      if (type === 'zoom' && (l.type !== 'zoom' || l.special)) return false;
      if (type === 'special' && !l.special) return false;
      if (format === 'ff' && l.format) return false;
      if ((format === 'apsc' || format === 'mft') && l.format !== format) return false;
      if (b && !inBucket(l, b)) return false;
      if (l.f > maxF) return false;
      return !q || lensLabel(l).toLowerCase().includes(q) || `${l.min}`.startsWith(q);
    }).sort((a, b) => a.min - b.min || a.max - b.max || a.f - b.f);
  }, [query, type, format, bucket, aperture]);

  const count = gear.filter((id) => lensFor(id)).length;
  const reset = () => { setQuery(''); setType('all'); setFormat('all'); setBucket('all'); setAperture('any'); };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="lens-h"
      onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
      className="m-auto h-[min(860px,94dvh)] w-[min(760px,calc(100vw-16px))] max-w-none overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="lens-h" className="m-0 text-base font-bold">Lenses</h2>
            <p className="m-0 text-xs text-muted">{count ? `${count} in your bag` : 'Pick the lenses you are bringing'} · focal lengths as marked on the lens</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => dialog.current?.close()}>Done</Button>
        </header>

        <div className="grid gap-2.5 border-b border-line px-4 py-3">
          <label className="relative block">
            <span className="sr-only">Search lenses</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, e.g. 24-70 or 85mm"
              className="h-10 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Seg label="Lens type" value={type} onChange={setType}
              options={[{ v: 'all', label: 'All' }, { v: 'prime', label: 'Prime' }, { v: 'zoom', label: 'Zoom' }, { v: 'special', label: 'Specialty' }]} />
            <Seg label="Made for" value={format} onChange={setFormat}
              options={[{ v: 'all', label: 'Any sensor' }, { v: 'ff', label: 'Full frame' }, { v: 'apsc', label: 'APS-C' }, { v: 'mft', label: 'MFT' }]} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Focal range">
            <button type="button" aria-pressed={bucket === 'all'} onClick={() => setBucket('all')} className={chip(bucket === 'all')}>Any focal length</button>
            {FOCAL_BUCKETS.map((b) => (
              <button key={b.id} type="button" aria-pressed={bucket === b.id} onClick={() => setBucket(bucket === b.id ? 'all' : b.id)} className={chip(bucket === b.id)}>
                {b.label} <span className="ml-1 font-mono text-[10px] font-normal opacity-70">{b.b === Infinity ? `${b.a}+` : `${b.a || '<'}${b.a ? '-' : ''}${b.b}`}mm</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Maximum aperture">
            {APERTURES.map((a) => (
              <button key={a.id} type="button" aria-pressed={aperture === a.id} onClick={() => setAperture(a.id)} className={chip(aperture === a.id)}>{a.label}</button>
            ))}
          </div>
        </div>

        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {list.length ? (
            <ul className="m-0 grid list-none gap-0.5 p-0 sm:grid-cols-2">
              {list.map((l) => {
                const on = gear.includes(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle('gear', l.id)}
                      className={cx('flex w-full items-center gap-2.5 rounded-xl border-0 px-2.5 py-2 text-left transition-colors', on ? 'bg-accent-soft' : 'bg-transparent hover:bg-surface-2')}
                    >
                      <span className={cx('grid size-5 shrink-0 place-items-center rounded-md border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line')}>
                        {on && <Check className="size-3.5" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{lensLabel(l)}</span>
                        <span className="block font-mono text-[10.5px] text-muted uppercase">
                          {l.special ?? l.type}{l.format ? ` · ${FORMAT_LABEL[l.format]}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 px-2.5 py-6 text-center text-sm text-muted">
              No lens matches these filters. <button type="button" onClick={reset} className="border-0 bg-transparent p-0 font-semibold text-accent hover:underline">Clear the filters</button> or add it below.
            </p>
          )}
        </div>

        <CustomLens />
      </div>
    </dialog>
  );
}

/** A lens that isn't in the catalog: type, focal length and maximum aperture are all the plan needs. */
function CustomLens() {
  const toggle = useStore((s) => s.toggle);
  const gear = useStore((s) => s.brief.gear);
  const [type, setType] = useState<Lens['type']>('prime');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [f, setF] = useState(2.8);
  const lo = Number(min);
  const hi = type === 'prime' ? lo : Number(max);
  const valid = lo > 0 && lo <= 2000 && hi >= lo && hi <= 2000;
  const id = valid ? customLensId(type, lo, hi, f) : '';
  const field = 'h-9 w-20 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink outline-none focus:border-accent';

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2/50 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !gear.includes(id)) toggle('gear', id);
        setMin('');
        setMax('');
      }}
    >
      <span className="w-full text-xs font-bold">Not listed? Add it</span>
      <Seg label="Custom lens type" value={type} onChange={setType} options={[{ v: 'prime', label: 'Prime' }, { v: 'zoom', label: 'Zoom' }]} />
      <label className="grid gap-0.5 text-[11px] text-muted">
        {type === 'prime' ? 'Focal (mm)' : 'From (mm)'}
        <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} className={field} />
      </label>
      {type === 'zoom' && (
        <label className="grid gap-0.5 text-[11px] text-muted">
          To (mm)
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} className={field} />
        </label>
      )}
      <label className="grid gap-0.5 text-[11px] text-muted">
        Max aperture
        <select value={f} onChange={(e) => setF(Number(e.target.value))} className={cx(field, 'w-24')}>
          {CUSTOM_APERTURES.map((a) => <option key={a} value={a}>f/{a}</option>)}
        </select>
      </label>
      <Button type="submit" size="md" disabled={!valid}><Plus className="size-3.5" aria-hidden /> Add lens</Button>
    </form>
  );
}
