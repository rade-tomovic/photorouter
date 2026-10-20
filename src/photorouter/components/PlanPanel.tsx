import { useId } from 'react';
import { Footprints, Maximize2, PanelLeftClose, Route, Trash2 } from 'lucide-react';
import { clearPlan, openStepper, useStore } from '../store';
import { stop } from '../map/player';
import { BriefChips, BriefForm, DemoPicker } from './BriefForm';
import { PromptBuilder } from './PromptBuilder';
import { PlanExport, PromptCopy, ReplyPaste } from './PlanSections';
import { IconButton } from './ui';

/**
 * PhotoRouter does not plan. This panel builds a prompt from the brief, the
 * user runs it in their own AI, and the JSON that comes back is checked and
 * turned into the route on the map. The step-by-step planner shows the same
 * sections full screen, one step at a time.
 */
export function PlanPanel({ onCollapse }: { onCollapse?: () => void }) {
  const plan = useStore((s) => s.plan);
  return (
    <section aria-labelledby="plan-h" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2.5 border-b border-line py-3 pr-2.5 pl-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
          <Route className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="plan-h" className="m-0 text-[15px] leading-tight font-bold">Plan your trip</h2>
          <p className="m-0 text-xs text-muted" aria-live="polite">
            {plan ? `Route loaded · ${plan.stops} stops over ${plan.days.length} days` : 'Describe it, ask your AI assistant, see the route'}
          </p>
        </div>
        {plan && (
          <IconButton label="Clear the route" onClick={() => { stop(); clearPlan(); }} className="size-8">
            <Trash2 aria-hidden />
          </IconButton>
        )}
        <IconButton label="Plan step by step, full screen" onClick={() => openStepper()} className="size-8">
          <Maximize2 aria-hidden />
        </IconButton>
        {onCollapse && (
          <IconButton id="plan-collapse" label="Hide the plan panel" onClick={onCollapse} className="size-8">
            <PanelLeftClose aria-hidden />
          </IconButton>
        )}
      </header>
      {/* relative: keeps absolutely positioned sr-only labels inside the scroll area, so they cannot stretch the page. */}
      <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 px-4 py-4">
          {!plan && <GuidedStart />}
          <TripStep />
          <PromptStep />
          <AnswerStep />
          {plan && <ExportStep />}
        </div>
      </div>
    </section>
  );
}

/** The way in for a first visit: the same planning, one question at a time. */
function GuidedStart() {
  return (
    <button
      type="button"
      onClick={() => openStepper()}
      className="group flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3 text-left text-ink transition-colors hover:border-accent"
    >
      <Footprints className="size-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Plan step by step</span>
        <span className="block text-xs text-muted">One question at a time, full screen. Good for a first trip.</span>
      </span>
      <Maximize2 className="size-4 shrink-0 text-muted transition-colors group-hover:text-accent" aria-hidden />
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className="grid gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5" aria-labelledby={id}>
      <h3 id={id} className="m-0 flex items-center gap-2 text-sm font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-accent font-mono text-[11px] text-accent-ink">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function TripStep() {
  const plan = useStore((s) => s.plan);
  return (
    <Step n={1} title="Describe the trip">
      <DemoPicker />
      <BriefChips />
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
  return (
    <Step n={2} title="Copy the prompt into your AI assistant">
      <p className="m-0 text-xs text-muted">
        The prompt holds your trip, its dates and the rules, and asks the assistant to pick the cities and photo spots and to
        reply in a format PhotoRouter can read. Paste it into a new chat in the AI assistant you use.
      </p>
      <PromptBuilder />
      <PromptCopy />
    </Step>
  );
}

function AnswerStep() {
  return (
    <Step n={3} title="Paste the assistant's reply">
      <ReplyPaste />
    </Step>
  );
}

function ExportStep() {
  const id = useId();
  return (
    <section className="grid gap-2.5 rounded-xl border border-line p-3.5" aria-labelledby={id}>
      <h3 id={id} className="m-0 text-sm font-bold">Take this plan elsewhere</h3>
      <p className="m-0 text-xs text-muted">Keep the plan as a file, share it, or give it back to your AI assistant to change.</p>
      <PlanExport />
    </section>
  );
}
