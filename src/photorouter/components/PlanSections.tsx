import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ClipboardCopy, Download, FileJson, Pause, Play, TriangleAlert, Upload } from 'lucide-react';
import { gearItem, tripDates } from '../lib/data';
import { SCHEMA_PATH, planSchema, toResponse, type ImportResult } from '../lib/byoai';
import { buildPrompt } from '../lib/prompt';
import type { Brief } from '../lib/types';
import { importPlan, loadExample, useStore } from '../store';
import { selectDay, stop, togglePlay } from '../map/player';
import { Button, cx } from './ui';

// The parts of planning that both the docked plan panel and the step-by-step
// planner show: copying the prompt, pasting the reply and taking the plan away.

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useCopy() {
  const [state, setState] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState(key);
    } catch {
      setState(`${key}:blocked`);
    }
    setTimeout(() => setState(null), 2000);
  };
  return { state, copy };
}

export type BriefPart = 'where' | 'gear' | 'style';

/** What the brief still needs before the prompt is worth sending, and where it is set. */
export function missing(brief: Brief): { part: BriefPart; text: string }[] {
  const out: { part: BriefPart; text: string }[] = [];
  if (!brief.destination.trim()) out.push({ part: 'where', text: 'Where you are going' });
  if (!brief.gear.some((id) => gearItem(id)?.kind === 'body')) out.push({ part: 'gear', text: 'The camera you are bringing' });
  if (!brief.styles.length) out.push({ part: 'style', text: 'At least one thing you like to shoot' });
  return out;
}

/** A plain note listing what is still needed, with a way to go and fix each item when one is given. */
export function MissingNote({ items, onFix, lead = 'Still needed:' }: { items: { part: BriefPart; text: string }[]; onFix?: ((part: BriefPart) => void) | undefined; lead?: string }) {
  if (!items.length) return null;
  return (
    <div role="note" className="grid gap-1 rounded-lg border border-golden/50 bg-golden/10 px-3 py-2 text-[13px]">
      <p className="m-0 flex items-center gap-1.5 font-semibold text-ink">
        <TriangleAlert className="size-3.5 shrink-0 text-golden" aria-hidden /> {lead}
      </p>
      <ul className="m-0 grid list-none gap-0.5 p-0 pl-5">
        {items.map((m) => (
          <li key={m.part} className="text-ink">
            {onFix ? (
              <button type="button" onClick={() => onFix(m.part)} className="border-0 bg-transparent p-0 text-left text-accent underline-offset-2 hover:underline">
                {m.text}
              </button>
            ) : m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The prompt built from the brief: copy it, download it, or look at it first. */
export function PromptCopy({ onFix }: { onFix?: ((part: BriefPart) => void) | undefined }) {
  const brief = useStore((s) => s.brief);
  const cfg = useStore((s) => s.prompt);
  const prompt = useMemo(() => buildPrompt(brief, cfg), [brief, cfg]);
  const size = Math.max(1, Math.round(prompt.length / 1000));
  const { state, copy } = useCopy();
  const cut = prompt.indexOf('## Request');
  const gaps = missing(brief);

  return (
    <div className="grid gap-2.5">
      <MissingNote items={gaps} onFix={onFix} lead="The prompt works best once you add:" />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void copy('prompt', prompt)}>
          {state === 'prompt' ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
          {state === 'prompt' ? 'Copied' : 'Copy prompt'}
        </Button>
        <Button onClick={() => download('photorouter-prompt.md', prompt, 'text/markdown')}>
          <Download className="size-3.5" aria-hidden /> Download
        </Button>
        {cfg.target === 'api' && (
          <Button onClick={() => void copy('schema', JSON.stringify(planSchema(tripDates(brief.start, brief.days)), null, 2))}>
            {state === 'schema' ? <Check className="size-3.5" aria-hidden /> : <FileJson className="size-3.5" aria-hidden />}
            {state === 'schema' ? 'Copied' : 'Copy reply format'}
          </Button>
        )}
      </div>
      <p className="sr-only" role="status">{state === 'prompt' ? 'Prompt copied' : state === 'schema' ? 'Reply format copied' : ''}</p>
      {state?.endsWith(':blocked') && <p className="m-0 text-xs text-golden">The browser blocked the clipboard. Use Download instead.</p>}
      <details className="group rounded-lg border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Preview the prompt
          <span className="font-mono text-[11px] font-normal text-muted">about {size}k characters</span>
        </summary>
        <pre className="scroll-thin m-0 max-h-72 overflow-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted">
          {prompt.length > 6000 && cut > 0 ? `${prompt.slice(0, cut)}## Request\n{ …${Math.round((prompt.length - cut) / 1000)}k characters of trip data and format rules… }` : prompt}
        </pre>
      </details>
      {cfg.target === 'api' && (
        <p className="m-0 text-xs text-muted">
          For developers: pass the{' '}
          <a href={SCHEMA_PATH} target="_blank" rel="noopener" className="text-accent">reply format</a>{' '}
          (a JSON Schema) to your provider's structured output option.
        </p>
      )}
    </div>
  );
}

/** Paste the assistant's reply, check it and load it; the result says what passed and what to fix. */
export function ReplyPaste({ rows = 8, loaded }: { rows?: number; loaded?: ReactNode | undefined }) {
  const answer = useStore((s) => s.answer);
  const result = useStore((s) => s.result);
  const id = useId();
  return (
    <div className="grid gap-2.5">
      <label htmlFor={id} className="sr-only">The assistant's reply</label>
      <textarea
        id={id}
        rows={rows}
        spellCheck={false}
        value={answer}
        onChange={(e) => useStore.setState({ answer: e.target.value, result: null })}
        placeholder="Paste the whole reply here"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!answer.trim()} onClick={() => { stop(); importPlan(); }}>
          <Upload className="size-3.5" aria-hidden /> Check and load
        </Button>
        <Button onClick={() => { stop(); loadExample(); }}>
          <FileJson className="size-3.5" aria-hidden /> Load the example
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">
        Paste the whole reply as it is; any text around the plan is ignored. The example is a finished plan for the selected demo trip. If you changed the destination or dates, your trip settings stay as they are.
      </p>
      {result && <ImportReport result={result} actions={loaded} />}
    </div>
  );
}

function ImportReport({ result, actions }: { result: ImportResult; actions?: ReactNode | undefined }) {
  const playing = useStore((s) => s.playing);
  const exampleOf = useStore((s) => s.exampleOf);
  const ok = !!result.plan;
  return (
    <div role="status" className={cx('grid gap-1.5 rounded-lg p-3 text-xs', ok ? 'bg-accent-soft' : 'bg-surface')}>
      <p className={cx('m-0 font-semibold', ok ? 'text-ink' : 'text-danger')}>
        {ok
          ? `Loaded ${result.plan!.stops} stops over ${result.plan!.days.length} days.`
          : `Not loaded: ${result.errors.length} problem${result.errors.length > 1 ? 's' : ''} to fix. Send them back to the assistant and paste its corrected reply.`}
      </p>
      {ok && exampleOf && (
        <p className="m-0 font-semibold text-ink">This is the {exampleOf} example. Your trip settings are unchanged; paste the assistant's reply above to load your own trip.</p>
      )}
      {ok && result.summary && <p className="m-0 text-muted">{result.summary}</p>}
      {[...result.errors.map((e) => ['e', e] as const), ...result.warnings.map((w) => ['w', w] as const)].slice(0, 12).map(([k, m]) => (
        <p key={m} className={cx('m-0 flex items-start gap-1.5', k === 'e' ? 'text-danger' : 'text-golden')}>
          <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden /> {m}
        </p>
      ))}
      {ok && (
        <div className="mt-1 flex flex-wrap gap-2">
          {actions ?? (
            <>
              <Button size="sm" variant="primary" onClick={togglePlay}>
                {playing ? <Pause className="size-3 fill-current" aria-hidden /> : <Play className="size-3 fill-current" aria-hidden />}
                {playing ? 'Pause' : 'Play trip'}
              </Button>
              <Button size="sm" onClick={() => void selectDay(0)}>
                Start with day 1 <ArrowRight className="size-3" aria-hidden />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The loaded plan as JSON: to keep, share, or hand back to an AI assistant to change. */
export function PlanExport() {
  const plan = useStore((s) => s.plan);
  const { state, copy } = useCopy();
  if (!plan) return null;
  const json = () => JSON.stringify(toResponse(plan), null, 2);
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void copy('plan', json())}>
        {state === 'plan' ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
        {state === 'plan' ? 'Copied' : 'Copy the plan'}
      </Button>
      <Button onClick={() => download('photorouter-plan.json', json(), 'application/json')}>
        <Download className="size-3.5" aria-hidden /> Download
      </Button>
    </div>
  );
}
