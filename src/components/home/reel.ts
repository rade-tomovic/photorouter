// Drives the film strip scrollbar: hides the browser's own, moves the lit frame with the page,
// advances the sprocket holes and lets the frame be dragged or the strip clicked to scroll.
import { reduceMotion } from './dayclock';

const reel = document.querySelector<HTMLElement>('[data-reel]');
const film = reel?.querySelector<HTMLElement>('[data-reel-film]');
const gate = reel?.querySelector<HTMLElement>('[data-reel-gate]');

/** The shortest the lit frame gets, in px, so it stays easy to grab. */
const MIN_GATE = 44;
/** How long the strip stays bright after the page stops moving on touch screens, in ms. */
const IDLE = 1400;

if (reel && film && gate) {
  const root = document.documentElement;
  let gateH = 0;
  let travel = 0;
  let range = 0;
  let pending = false;
  let idle = 0;
  const still = reduceMotion();

  const measure = () => {
    const track = reel.clientHeight;
    range = Math.max(0, root.scrollHeight - innerHeight);
    reel.hidden = range < 1;
    gateH = Math.max(MIN_GATE, Math.round((track * innerHeight) / root.scrollHeight));
    travel = Math.max(0, track - gateH);
    gate.style.height = `${gateH}px`;
  };

  const draw = () => {
    pending = false;
    const p = range ? Math.min(1, Math.max(0, scrollY / range)) : 0;
    gate.style.transform = `translateY(${p * travel}px)`;
    // The holes advance with the page; with reduced motion only the frame moves.
    if (!still) film.style.backgroundPositionY = `${-scrollY * 0.35}px`;
  };

  const wake = () => {
    reel.dataset.active = '';
    clearTimeout(idle);
    idle = window.setTimeout(() => delete reel.dataset.active, IDLE);
  };

  const schedule = () => {
    wake();
    if (pending) return;
    pending = true;
    requestAnimationFrame(draw);
  };

  const refresh = () => {
    measure();
    draw();
  };

  // Drag the lit frame: the page follows the pointer, scaled from the strip to the page.
  gate.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gate.setPointerCapture(e.pointerId);
    reel.dataset.dragging = '';
    const y0 = e.clientY;
    const s0 = scrollY;
    const move = (ev: PointerEvent) => {
      wake();
      if (travel) scrollTo(0, s0 + ((ev.clientY - y0) * range) / travel);
    };
    const end = () => {
      delete reel.dataset.dragging;
      gate.removeEventListener('pointermove', move);
      gate.removeEventListener('pointerup', end);
      gate.removeEventListener('pointercancel', end);
    };
    gate.addEventListener('pointermove', move);
    gate.addEventListener('pointerup', end);
    gate.addEventListener('pointercancel', end);
  });

  // Click the strip with a mouse: bring that part of the page to the frame. A finger on the
  // strip only scrolls the page as usual.
  film.addEventListener('pointerdown', (e) => {
    if (!travel || e.pointerType !== 'mouse') return;
    const y = e.clientY - reel.getBoundingClientRect().top - gateH / 2;
    const p = Math.min(1, Math.max(0, y / travel));
    scrollTo({ top: p * range, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });

  root.dataset.filmScroll = '';
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', refresh);
  // The body is held at the viewport height, so watch the page content for growth instead.
  new ResizeObserver(refresh).observe(document.querySelector('.home') ?? document.body);
  refresh();
}
