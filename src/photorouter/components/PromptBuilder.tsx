import { useState, type ReactNode } from 'react';
import { ChevronDown, Lock, RotateCcw, Save } from 'lucide-react';
import {
  DEFAULT_PROMPT,
  OPTIONAL_RULES,
  PERSONAS,
  PRESETS,
  PRIORITIES,
  REQUIRED_RULES,
  type PriorityId,
  type PromptConfig,
  type RuleId,
  type Weight,
} from '../lib/prompt';
import { saveTemplate, savedTemplate, useStore } from '../store';
import { Kicker, Seg, Toggle, cx } from './ui';

const PRIORITY_LABEL: Record<PriorityId, string> = {
  light: 'Best light',
  style: 'Style match',
  walking: 'Short walks',
  crowds: 'Quiet spots',
  variety: 'Variety',
  icons: 'Famous views',
};

const same = (a: PromptConfig, b: PromptConfig) => JSON.stringify(a) === JSON.stringify(b);

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string | undefined }) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-ink">{label}</span>
        {children}
      </div>
      {hint && <p className="m-0 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-[13px] text-ink"
    >
      <span>{label}</span>
      <span className={cx('relative h-5 w-8 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all', on ? 'left-3.5' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Tune the prompt for whichever AI the photographer uses. Required rules stay locked so the answer still imports. */
export function PromptBuilder() {
  const cfg = useStore((s) => s.prompt);
  const set = (patch: Partial<PromptConfig>) => useStore.setState((s) => ({ prompt: { ...s.prompt, ...patch } }));
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<PromptConfig | null>(() => savedTemplate());
  const [note, setNote] = useState<string | null>(null);

  const presets = [...PRESETS, ...(saved ? [{ id: 'mine', label: 'My template', config: saved }] : [])];
  const active = presets.find((p) => same(p.config, cfg))?.id;

  const save = () => {
    const ok = saveTemplate(cfg);
    if (ok) setSaved(cfg);
    setNote(ok ? 'Saved in this browser.' : 'This browser blocked saving.');
    setTimeout(() => setNote(null), 2000);
  };

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Prompt presets">
        {presets.map((p) => (
          <Toggle key={p.id} on={active === p.id} onClick={() => set(p.config)}>{p.label}</Toggle>
        ))}
        {!active && <span className="text-[11px] text-muted italic">custom</span>}
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-ink hover:border-muted"
      >
        Customise the prompt
        <ChevronDown className={cx('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="pr-enter grid gap-4 rounded-lg border border-line bg-surface p-3">
          <div className="grid gap-2.5">
            <Kicker>Delivery</Kicker>
            <Row
              label="Paste into"
              hint={cfg.target === 'api' ? 'Leaves the schema out of the prompt: send it as the structured-output format instead.' : undefined}
            >
              <Seg label="Paste into" value={cfg.target} onChange={(v) => set({ target: v })}
                options={[{ v: 'chat', label: 'Chat app' }, { v: 'api', label: 'API' }]} />
            </Row>
            <Row label="Voice">
              <Seg label="Voice" value={cfg.persona} onChange={(v) => set({ persona: v })}
                options={(Object.keys(PERSONAS) as PromptConfig['persona'][]).map((k) => ({ v: k, label: PERSONAS[k].label }))} />
            </Row>
          </div>

          <div className="grid gap-2">
            <Kicker>Priorities</Kicker>
            {(Object.keys(PRIORITIES) as PriorityId[]).map((p) => (
              <Row key={p} label={PRIORITY_LABEL[p]}>
                <Seg
                  label={`${PRIORITY_LABEL[p]} weight`}
                  value={String(cfg.priorities[p]) as '0' | '1' | '2'}
                  onChange={(v) => set({ priorities: { ...cfg.priorities, [p]: Number(v) as Weight } })}
                  options={[{ v: '0', label: 'Off' }, { v: '1', label: 'Normal' }, { v: '2', label: 'High' }]}
                />
              </Row>
            ))}
          </div>

          <div className="grid gap-2">
            <Kicker>Rules</Kicker>
            {(Object.keys(OPTIONAL_RULES) as RuleId[]).map((r) => (
              <Check key={r} label={OPTIONAL_RULES[r].label} on={cfg.rules[r]} onChange={(v) => set({ rules: { ...cfg.rules, [r]: v } })} />
            ))}
            <details className="text-[11.5px] text-muted">
              <summary className="flex cursor-pointer items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                <Lock className="size-3" aria-hidden /> {REQUIRED_RULES.length} rules always on, so the answer imports
              </summary>
              <ol className="mt-1.5 mb-0 grid gap-1 pl-4">
                {REQUIRED_RULES.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </details>
          </div>

          <div className="grid gap-2.5">
            <Kicker>Writing</Kicker>
            <Row label='"Why" notes'>
              <Seg label="Why notes" value={cfg.why} onChange={(v) => set({ why: v })}
                options={[{ v: 'short', label: 'One line' }, { v: 'detailed', label: 'Detailed' }]} />
            </Row>
            <label className="grid gap-1 text-[13px] text-ink">
              Answer language
              <input
                value={cfg.language}
                onChange={(e) => set({ language: e.target.value })}
                placeholder="English"
                className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <label className="grid gap-1 text-[13px] text-ink">
              Extra instructions
              <textarea
                rows={3}
                value={cfg.extra}
                onChange={(e) => set({ extra: e.target.value })}
                placeholder="e.g. I want one rooftop per city. Prefer Fridays for the long exposures."
                className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" onClick={save} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-semibold text-ink hover:border-muted">
              <Save className="size-3.5" aria-hidden /> Save as my template
            </button>
            <button type="button" onClick={() => set(DEFAULT_PROMPT)} className="inline-flex h-7 items-center gap-1.5 rounded-full border-0 bg-transparent px-2 text-xs font-semibold text-muted hover:text-ink">
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </button>
            {note && <span className="text-[11px] text-muted" role="status">{note}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
