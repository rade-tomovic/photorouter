import { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardCopy, Download, FileJson, Pause, Play, Route, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { GEAR_BY_ID, STYLES, tripDates } from '../lib/data';
import { SCHEMA_PATH, planSchema, toResponse, type ImportResult } from '../lib/byoai';
import { buildPrompt, estimateTokens } from '../lib/prompt';
import { clearPlan, importPlan, loadExample, useStore } from '../store';
import { selectDay, stop, togglePlay } from '../map/player';
import { BriefForm, DemoPicker } from './BriefForm';
import { PromptBuilder } from './PromptBuilder';
import { Button, cx } from './ui';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useCopy() {
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

/**
 * PhotoRouter does not plan. This panel builds a prompt from the brief, the
 * user runs it in their own AI, and the JSON that comes back is checked and
 * turned into the route on the map.
 */
export function PlanPanel() {
  const plan = useStore((s) => s.plan);
  return (
    <section aria-labelledby="plan-h" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
            <Route className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id="plan-h" className="m-0 text-[15px] leading-tight font-bold">Plan with your AI</h2>
            <p className="m-0 text-xs text-muted" aria-live="polite">
              {plan ? `Route loaded · ${plan.stops} stops over ${plan.days.length} days` : 'Brief, prompt, answer, route'}
            </p>
          </div>
        </div>
        {plan && (
          <Button size="sm" variant="ghost" onClick={() => { stop(); clearPlan(); }}>
            <Trash2 className="size-3.5" aria-hidden /> Clear
          </Button>
        )}
      </header>
      {/* relative: keeps absolutely positioned sr-only labels inside the scroll area, so they cannot stretch the page. */}
      <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 px-4 py-4">
          <TripStep />
          <PromptStep />
          <AnswerStep />
          {plan && <ExportStep />}
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id: string }) {
  return (
    <section className="grid gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5" aria-labelledby={id}>
      <h3 id={id} className="m-0 flex items-center gap-2 text-sm font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-ink font-mono text-[11px] text-surface">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function TripStep() {
  const brief = useStore((s) => s.brief);
  const plan = useStore((s) => s.plan);
  const chips = [
    ...(brief.destination ? [brief.destination] : []),
    `${brief.days} days from ${brief.start}`,
    ...brief.gear.map((g) => GEAR_BY_ID[g]?.short ?? g),
    ...brief.styles.map((s) => STYLES.find((x) => x.id === s)?.label ?? s),
    `${brief.pace} pace`,
    brief.work ? 'works weekdays' : 'on holiday',
    ...(brief.must.length ? [`${brief.must.length} must-see`] : []),
  ];
  return (
    <Step n={1} title="Describe the trip" id="step-trip">
      <DemoPicker />
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c} className="inline-flex h-5 items-center rounded-full border border-line px-2 text-[11px] text-muted">{c}</span>
        ))}
      </div>
      {/* Open until a route is loaded; the brief is still one click away after that. */}
      <details key={plan ? 'planned' : 'empty'} open={!plan} className="group rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Edit the brief</span>
          <span className="hidden group-open:inline">Hide the brief</span>
        </summary>
        <div className="border-t border-line px-3 py-3">
          <BriefForm />
        </div>
      </details>
    </Step>
  );
}

function PromptStep() {
  const brief = useStore((s) => s.brief);
  const cfg = useStore((s) => s.prompt);
  const prompt = useMemo(() => buildPrompt(brief, cfg), [brief, cfg]);
  const tokens = Math.round(estimateTokens(prompt) / 100) / 10;
  const { state, copy } = useCopy();
  const cut = prompt.indexOf('## Request');

  return (
    <Step n={2} title="Build the prompt and run it in your AI" id="step-prompt">
      <p className="m-0 text-xs text-muted">
        The prompt carries your brief, the trip dates and the rules, and asks your AI to pick the cities and photo spots and
        return the plan as JSON in a fixed format. Paste it into any AI assistant, or send it through an API.
      </p>
      <PromptBuilder />
      <details className="group rounded-lg border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Preview the prompt
          <span className="font-mono text-[11px] font-normal text-muted">≈{tokens}k tokens</span>
        </summary>
        <pre className="scroll-thin m-0 max-h-72 overflow-auto border-t border-line px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted">
          {prompt.length > 6000 && cut > 0 ? `${prompt.slice(0, cut)}## Request\n{ …${Math.round((prompt.length - cut) / 1000)}k characters of trip data and schema… }` : prompt}
        </pre>
      </details>
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
            {state === 'schema' ? 'Copied' : 'Copy schema'}
          </Button>
        )}
      </div>
      {state?.endsWith(':blocked') && <p className="m-0 text-xs text-golden">The browser blocked the clipboard. Use Download instead.</p>}
      <p className="m-0 text-xs text-muted">
        Calling an API? Pass the{' '}
        <a href={SCHEMA_PATH} target="_blank" rel="noopener" className="text-accent">response schema</a>{' '}
        to the provider's structured-output option (a JSON Schema response format) and the answer is guaranteed to parse.
      </p>
    </Step>
  );
}

function AnswerStep() {
  const answer = useStore((s) => s.answer);
  const result = useStore((s) => s.result);
  return (
    <Step n={3} title="Paste the JSON answer" id="step-answer">
      <label htmlFor="answer" className="sr-only">Your AI's answer as JSON</label>
      <textarea
        id="answer"
        rows={8}
        spellCheck={false}
        value={answer}
        onChange={(e) => useStore.setState({ answer: e.target.value, result: null })}
        placeholder='{ "version": "photorouter.plan/v1", "summary": "…", "days": [ … ] }'
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
        Code fences and text around the JSON are fine. The example is the ready-made answer for the selected demo trip; loading it resets the brief to match.
      </p>
      {result && <ImportReport result={result} />}
    </Step>
  );
}

function ImportReport({ result }: { result: ImportResult }) {
  const playing = useStore((s) => s.playing);
  const ok = !!result.plan;
  return (
    <div role="status" className={cx('grid gap-1.5 rounded-lg p-3 text-xs', ok ? 'bg-accent-soft' : 'bg-surface')}>
      <p className={cx('m-0 font-semibold', ok ? 'text-ink' : 'text-danger')}>
        {ok
          ? `Loaded ${result.plan!.stops} stops over ${result.plan!.days.length} days.`
          : `Not loaded: ${result.errors.length} problem${result.errors.length > 1 ? 's' : ''} to fix. Send them back to your AI and paste its corrected answer.`}
      </p>
      {ok && result.summary && <p className="m-0 text-muted">{result.summary}</p>}
      {[...result.errors.map((e) => ['e', e] as const), ...result.warnings.map((w) => ['w', w] as const)].slice(0, 12).map(([k, m]) => (
        <p key={m} className={cx('m-0 flex items-start gap-1.5', k === 'e' ? 'text-danger' : 'text-golden')}>
          <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden /> {m}
        </p>
      ))}
      {ok && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={togglePlay}>
            {playing ? <Pause className="size-3 fill-current" aria-hidden /> : <Play className="size-3 fill-current" aria-hidden />}
            {playing ? 'Pause' : 'Play trip'}
          </Button>
          <Button size="sm" onClick={() => void selectDay(0)}>
            Start with day 1 <ArrowRight className="size-3" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

function ExportStep() {
  const plan = useStore((s) => s.plan)!;
  const { state, copy } = useCopy();
  const json = () => JSON.stringify(toResponse(plan), null, 2);
  return (
    <section className="grid gap-2.5 rounded-xl border border-line p-3.5" aria-labelledby="step-export">
      <h3 id="step-export" className="m-0 text-sm font-bold">Take this plan elsewhere</h3>
      <p className="m-0 text-xs text-muted">The loaded plan in the same format, to share, edit by hand or hand back to your AI for changes.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy('plan', json())}>
          {state === 'plan' ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
          {state === 'plan' ? 'Copied' : 'Copy plan JSON'}
        </Button>
        <Button onClick={() => download('photorouter-plan.json', json(), 'application/json')}>
          <Download className="size-3.5" aria-hidden /> Download
        </Button>
      </div>
    </section>
  );
}
