import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, FileJson, Map as MapIcon, Play, Plus, X } from 'lucide-react';
import { CONTINENT_LABEL, DEMOS } from '../lib/demos';
import { chooseDemo, importPlan, loadExample, useStore } from '../store';
import { getEngine, overview, play, stop } from '../map/player';
import { BriefChips, GearSection, PlacesSection, StyleSection, TravelSection, TripNotes, WhereWhen } from './BriefForm';
import { PromptDelivery, PromptPresets, PromptPriorities, PromptRules, PromptWriting, TemplateActions } from './PromptBuilder';
import { MissingNote, PlanExport, PromptCopy, ReplyPaste, missing, type BriefPart } from './PlanSections';
import { Button, Kicker, cx } from './ui';

interface StepDef {
  id: string;
  /** One word for the film strip. */
  label: string;
  title: string;
  /** What to do on this step, in one plain sentence. */
  say: string;
  part?: BriefPart;
  body: (go: (to: number) => void) => ReactNode;
}

const STEPS: StepDef[] = [
  {
    id: 'start',
    label: 'Start',
    title: 'Pick a starting point',
    say: 'Start your own trip, or try a demo trip to see how PhotoRouter works.',
    body: (go) => <StartStep go={go} />,
  },
  {
    id: 'where',
    label: 'Where',
    title: 'Where and when',
    say: 'Tell us where you are going, the day you arrive and how many days you have.',
    part: 'where',
    body: () => <WhereWhen />,
  },
  {
    id: 'gear',
    label: 'Gear',
    title: 'Your gear',
    say: 'Tap the camera, lenses and kit you are packing, so the spots suit what you carry.',
    part: 'gear',
    body: () => <GearSection legend={null} />,
  },
  {
    id: 'style',
    label: 'Style',
    title: 'What you shoot',
    say: 'Pick what you love to photograph and how full you want each day to be.',
    part: 'style',
    body: () => (
      <>
        <StyleSection />
        <div className="h-px bg-line" />
        <TravelSection />
      </>
    ),
  },
  {
    id: 'places',
    label: 'Places',
    title: 'Must-see and skip',
    say: 'Name any places you must see or would rather skip, and add anything else worth knowing.',
    body: () => (
      <>
        <PlacesSection />
        <TripNotes label="Anything else about the trip?" />
      </>
    ),
  },
  {
    id: 'focus',
    label: 'Focus',
    title: 'What matters most',
    say: 'Choose a ready-made approach, or set how much each thing matters to you.',
    body: () => <FocusStep />,
  },
  {
    id: 'prompt',
    label: 'Prompt',
    title: 'Copy the prompt',
    say: 'Copy the prompt and paste it into a new chat with your AI assistant.',
    body: (go) => <PromptStep go={go} />,
  },
  {
    id: 'reply',
    label: 'Reply',
    title: 'Paste the reply',
    say: 'When your AI assistant has answered, paste its whole reply here and check it.',
    body: () => <ReplyPaste rows={9} loaded={<SeeRoute size="sm" />} />,
  },
  {
    id: 'route',
    label: 'Route',
    title: 'See your route',
    say: 'Close the planner to see the route on the map, or play the trip day by day.',
    body: (go) => <RouteStep go={go} />,
  },
];

const LAST = STEPS.length - 1;
const STEP_OF: Record<BriefPart, number> = {
  where: STEPS.findIndex((s) => s.part === 'where'),
  gear: STEPS.findIndex((s) => s.part === 'gear'),
  style: STEPS.findIndex((s) => s.part === 'style'),
};
const REPLY = STEPS.findIndex((s) => s.id === 'reply');

const goTo = (to: number) =>
  useStore.setState((s) => ({ stepper: { ...s.stepper, step: to, reached: Math.max(s.stepper.reached, to) } }));

/** Close the planner and hand over to the map: framed on the whole route, or playing it. */
function finish(then: 'overview' | 'play') {
  // The day tab, not the plan form, sits under the map on narrower screens once there is a route.
  useStore.setState((s) => ({ stepper: { ...s.stepper, open: false }, tab: 'day' }));
  pendingFocus = 'map';
  stop();
  void (then === 'play' ? play() : overview());
}

/** Where focus goes once the dialog has closed: back to the opener, or onto the map after finishing. */
let pendingFocus: 'opener' | 'map' = 'opener';

/**
 * The plan panel as a full screen, step-by-step flow: the same sections and the
 * same store, one question at a time, for a first trip and for phones.
 */
export function PlanStepper() {
  const open = useStore((s) => s.stepper.open);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pendingFocus = 'opener';
      // A plan already on the map means every step has been done: all frames can be jumped to.
      if (useStore.getState().plan) useStore.setState((s) => ({ stepper: { ...s.stepper, reached: LAST } }));
      d.showModal();
      document.documentElement.classList.add('pr-modal-open');
      // showModal focuses the first control (Close); the step's title is the better start.
      d.querySelector<HTMLElement>('[data-step-title]')?.focus({ preventScroll: true });
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const onClose = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    if (e.target !== e.currentTarget) return; // a nested dialog, such as the lens picker
    document.documentElement.classList.remove('pr-modal-open');
    if (useStore.getState().stepper.open) useStore.setState((s) => ({ stepper: { ...s.stepper, open: false } }));
    const target = opener.current;
    requestAnimationFrame(() => {
      if (pendingFocus === 'map') {
        const map = getEngine()?.map;
        map?.getContainer().scrollIntoView({ block: 'nearest' });
        map?.getCanvas().focus({ preventScroll: true });
      } else if (target?.isConnected && target.getClientRects().length) {
        target.focus({ preventScroll: true });
      } else {
        document.getElementById('main')?.focus({ preventScroll: true });
      }
      pendingFocus = 'opener';
    });
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="stepper-h"
      onClose={onClose}
      className="pr-stepper fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-bg p-0 text-ink"
    >
      {open && <Stepper />}
    </dialog>
  );
}

function Stepper() {
  const { step, reached } = useStore((s) => s.stepper);
  const brief = useStore((s) => s.brief);
  const plan = useStore((s) => s.plan);
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const last = useRef(step);
  const dir = step >= last.current ? 'next' : 'prev';
  const gaps = missing(brief);
  const def = STEPS[step]!;
  const own = gaps.filter((g) => g.part === def.part);

  // Each new step starts at its top, with focus on its title so it is read out.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    title.current?.focus({ preventScroll: true });
    last.current = step;
  }, [step]);

  const close = () => useStore.setState((s) => ({ stepper: { ...s.stepper, open: false } }));
  const next = () => {
    if (step === REPLY) {
      // A pasted reply that was never checked is checked on the way out; problems keep it here.
      const s = useStore.getState();
      if (s.answer.trim() && !s.result) {
        stop();
        if (!importPlan().plan) return;
      }
    }
    if (step === LAST) {
      if (plan) finish('overview');
      else close();
      return;
    }
    goTo(step + 1);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="rt-leather shrink-0">
        <div className="mx-auto flex h-13 max-w-[1080px] items-center gap-3 px-3 sm:px-6">
          <h2 id="stepper-h" className="m-0 min-w-0 flex-1 truncate font-display text-[20px] leading-none font-extrabold tracking-wide uppercase">
            Plan your trip <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-[#e89a4a] normal-case">step by step</span>
          </h2>
          <button
            type="button"
            onClick={close}
            className="rt-btn-quiet inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold"
          >
            <X className="size-4" aria-hidden /> Close
          </button>
        </div>
        <FilmStrip step={step} reached={reached} warn={new Set(gaps.map((g) => STEP_OF[g.part]))} />
      </header>

      <div ref={body} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid max-w-[1080px] gap-8 px-4 pt-6 pb-10 sm:px-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div key={step} className={cx('grid min-w-0 content-start gap-5', dir === 'next' ? 'pr-step-next' : 'pr-step-prev')}>
            <div className="grid gap-2">
              <p className="m-0 font-mono text-[11px] tracking-[0.08em] text-accent uppercase">Step {step + 1} of {STEPS.length}</p>
              <h3 ref={title} tabIndex={-1} data-step-title className="m-0 font-display text-[40px] leading-[0.95] font-extrabold uppercase outline-none sm:text-5xl">
                {def.title}
              </h3>
              <p className="m-0 max-w-[60ch] text-[15px] text-muted">{def.say}</p>
            </div>
            {own.length > 0 && <MissingNote items={own} lead="Needed for a good prompt:" />}
            <div className="grid gap-5 rounded-2xl border border-line bg-surface p-4 sm:p-5">{def.body(goTo)}</div>
          </div>
          <TripSoFar />
        </div>
      </div>

      <footer className="rt-leather rt-rule-top shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-3 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            className="rt-btn-quiet inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:invisible"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <p className="m-0 hidden flex-1 text-center font-mono text-[11px] tracking-[0.12em] text-muted uppercase sm:block" aria-hidden>
            {step < LAST ? `Next · ${STEPS[step + 1]!.title}` : plan ? 'Ready' : 'No route yet'}
          </p>
          <button type="button" onClick={next} className="rt-btn ml-auto inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-semibold sm:ml-0">
            {step < LAST ? (
              <>Next <ArrowRight className="size-4" aria-hidden /></>
            ) : plan ? (
              <><MapIcon className="size-4" aria-hidden /> See the route</>
            ) : (
              'Close'
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * The progress indicator: one frame per step on a strip of film. Frames already
 * reached can be jumped to; the current frame is lit in amber.
 */
function FilmStrip({ step, reached, warn }: { step: number; reached: number; warn: Set<number> }) {
  return (
    <nav aria-label="Planning steps" className="pr-filmstrip">
      <ol className="mx-auto flex max-w-[1080px] list-none gap-1 px-3 sm:gap-1.5 sm:px-6">
        {STEPS.map((s, i) => {
          const current = i === step;
          const open = i <= reached;
          const flagged = warn.has(i) && open && !current;
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!open}
                aria-current={current ? 'step' : undefined}
                onClick={() => goTo(i)}
                className={cx('pr-frame', current && 'is-current', open && i < step && 'is-done')}
              >
                <span className="pr-frame-no" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <span className="pr-frame-label">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.label}
                  {flagged && <span className="sr-only"> (something is missing)</span>}
                  {!open && <span className="sr-only"> (not reached yet)</span>}
                </span>
                {flagged && <span className="pr-frame-flag" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The brief so far, beside the steps on wide screens. */
function TripSoFar() {
  const plan = useStore((s) => s.plan);
  return (
    <aside className="hidden content-start gap-3 lg:grid" aria-label="Your trip so far">
      <div className="rt-panel sticky top-0 grid gap-3 rounded-2xl p-4">
        <Kicker>Your trip so far</Kicker>
        <BriefChips />
        <p className="m-0 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
          <span className={cx('size-2 shrink-0 rounded-full', plan ? 'bg-accent' : 'bg-line')} aria-hidden />
          {plan ? `Route loaded: ${plan.stops} stops over ${plan.days.length} days` : 'No route on the map yet'}
        </p>
      </div>
    </aside>
  );
}

function StartStep({ go }: { go: (to: number) => void }) {
  const demo = useStore((s) => s.demo);
  const custom = useStore((s) => s.custom);
  const plan = useStore((s) => s.plan);
  const setBrief = useStore((s) => s.setBrief);
  const card = (on: boolean) =>
    cx(
      'relative grid w-full content-start gap-1 rounded-xl border p-3.5 text-left text-ink transition-colors',
      on ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface-2 hover:border-muted',
    );
  const tick = <Check className="absolute top-3 right-3 size-4 text-accent" aria-hidden />;

  return (
    <div className="grid gap-4">
      <button
        type="button"
        aria-pressed={custom}
        onClick={() => {
          // Clearing the destination makes the brief the photographer's own and drops the demo's places.
          if (!custom) setBrief({ destination: '' });
          go(1);
        }}
        className={card(custom)}
      >
        {custom && tick}
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <Plus className="size-4 text-accent" aria-hidden /> {custom ? 'Your own trip' : 'Plan my own trip'}
        </span>
        <span className="text-[13px] text-muted">
          {custom ? 'Carry on with your trip: you can change anything on the next steps.' : 'Start from a clean brief: where, when and what you shoot.'}
        </span>
      </button>

      <div className="grid gap-2">
        <Kicker>Or try a demo trip</Kicker>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Demo trips">
          {DEMOS.map((d) => {
            const on = !custom && demo === d.id;
            return (
              <button key={d.id} type="button" aria-pressed={on} onClick={() => chooseDemo(d.id)} className={card(on)}>
                {on && tick}
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-muted uppercase">{CONTINENT_LABEL[d.continent]} · {d.brief.days} days</span>
                <span className="pr-6 text-[15px] font-bold">{d.label}</span>
                <span className="text-[13px] text-muted">{d.blurb}</span>
              </button>
            );
          })}
        </div>
        <p className="m-0 text-xs text-muted">
          {plan || custom ? 'Picking a demo replaces your brief with its own and takes the current route off the map.' : 'A demo fills in every step for you. Change anything you like.'}
        </p>
      </div>

      {!custom && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-[13px]">
          <span className="text-muted">Just looking?</span>
          <button
            type="button"
            onClick={() => { stop(); if (loadExample()?.plan) go(LAST); }}
            className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 font-semibold text-accent hover:underline"
          >
            <FileJson className="size-3.5" aria-hidden /> Load this demo's finished route
          </button>
        </div>
      )}
    </div>
  );
}

function FocusStep() {
  return (
    <>
      <div className="grid gap-2">
        <p className="m-0 text-sm font-bold">A ready-made approach</p>
        <PromptPresets />
      </div>
      <div className="h-px bg-line" />
      <div className="grid gap-2">
        <p className="m-0 text-sm font-bold">How much each thing matters</p>
        <PromptPriorities kicker={null} />
      </div>
      <details className="group rounded-xl border border-line bg-surface-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          More prompt options
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted">
            Voice, rules, language
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="grid gap-4 border-t border-line px-3.5 py-3.5">
          <PromptDelivery />
          <PromptRules />
          <PromptWriting />
          <TemplateActions />
        </div>
      </details>
    </>
  );
}

function PromptStep({ go }: { go: (to: number) => void }) {
  return (
    <>
      <ol className="m-0 grid gap-2 p-0 text-sm sm:grid-cols-3">
        {['Copy the prompt below.', 'Open your AI assistant and start a new chat.', 'Paste the prompt, send it, then come back here with the reply.'].map((t, i) => (
          <li key={t} className="flex list-none items-start gap-2.5 rounded-xl bg-surface-2 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-accent font-mono text-[11px] text-accent">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <PromptCopy large onFix={(part) => go(STEP_OF[part])} />
    </>
  );
}

function SeeRoute({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <Button size={size} variant="primary" onClick={() => finish('overview')}>
      <MapIcon className={size === 'sm' ? 'size-3' : 'size-4'} aria-hidden /> See the route
    </Button>
  );
}

function RouteStep({ go }: { go: (to: number) => void }) {
  const plan = useStore((s) => s.plan);
  const trip = useStore((s) => s.trip);
  const exampleOf = useStore((s) => s.exampleOf);
  if (!plan) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-sm">
          There is no route on the map yet. Paste your AI assistant's reply on the previous step, or load the example to see how it works.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => go(REPLY)}>
            <ArrowLeft className="size-4" aria-hidden /> Paste the reply
          </Button>
          <Button onClick={() => { stop(); loadExample(); }}>
            <FileJson className="size-4" aria-hidden /> Load the example
          </Button>
        </div>
      </div>
    );
  }
  const cities = [...new Set(plan.days.map((d) => d.city))].map((c) => trip.cities[c]?.name ?? c);
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <Kicker>{exampleOf ? `The ${exampleOf} example` : 'Your route'}</Kicker>
        <p className="m-0 font-display text-3xl leading-none font-extrabold uppercase">{trip.title}</p>
        {trip.summary && <p className="m-0 mt-1 text-sm text-muted">{trip.summary}</p>}
      </div>
      <dl className="m-0 grid grid-cols-3 gap-2">
        {[
          ['Days', plan.days.length],
          ['Stops', plan.stops],
          ['Cities', cities.length],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 p-3">
            <dt className="font-mono text-[10.5px] tracking-[0.1em] text-muted uppercase">{k}</dt>
            <dd className="m-0 font-display text-3xl leading-none font-extrabold text-accent">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-sm text-muted">{cities.join(', ')}</p>
      <div className="flex flex-wrap gap-2">
        <SeeRoute />
        <Button onClick={() => finish('play')}>
          <Play className="size-3.5 fill-current" aria-hidden /> Play the trip
        </Button>
      </div>
      <div className="grid gap-2 border-t border-line pt-4">
        <p className="m-0 text-sm font-bold">Keep a copy</p>
        <p className="m-0 text-xs text-muted">Save the plan as a file, share it, or give it back to your AI assistant to change.</p>
        <PlanExport />
      </div>
    </div>
  );
}
