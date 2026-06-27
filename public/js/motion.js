/* ============================================================
   motion.js — shared motion layer for every surface.

   Two engines, one façade:
     • Motion One  → everyday micro-interactions (press, hover,
       reveal, stagger). Spring-based, WAAPI under the hood, ~5kb.
     • Anime.js    → reserved for orchestrated/sequenced moments
       (hero intros, number roll-ups, SVG).

   Both load from CDN as ES modules (no build step). The module
   degrades gracefully: if a CDN fails or prefers-reduced-motion
   is set, helpers become no-ops that leave the final state intact.

   Usage (any surface):
     <script type="module">
       import { Motion } from '/js/motion.js';
       Motion.reveal('.card');                 // staggered entrance
       Motion.press('[data-action]');          // tactile button press
       Motion.countUp(el, 0, 1280);            // animated counter
     </script>

   Tokens: durations/easings/spring constants are read from
   tokens.css custom properties so motion matches the design system.
   ============================================================ */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Read motion tokens from :root (with safe fallbacks) ───── */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function ms(name, fallback) {
  const v = cssVar(name, fallback);
  return parseFloat(v) * (v.endsWith('ms') ? 1 : v.endsWith('s') ? 1000 : 1);
}
const TOK = {
  get d1() { return ms('--dur-1', '120') / 1000; },
  get d2() { return ms('--dur-2', '200') / 1000; },
  get d3() { return ms('--dur-3', '320') / 1000; },
  get d4() { return ms('--dur-4', '480') / 1000; },
  get d5() { return ms('--dur-5', '640') / 1000; },
  get spring() {
    return {
      stiffness: parseFloat(cssVar('--spring-stiffness', '320')),
      damping:   parseFloat(cssVar('--spring-damping', '26')),
      mass:      parseFloat(cssVar('--spring-mass', '1')),
    };
  },
};

/* ── Lazy CDN loaders (cached promises) ───────────────────── */
let _motionP, _animeP;
function loadMotion() {
  if (!_motionP) {
    _motionP = import('https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm').catch((e) => {
      console.warn('[motion] Motion One failed to load; animations disabled.', e);
      return null;
    });
  }
  return _motionP;
}
function loadAnime() {
  if (!_animeP) {
    _animeP = import('https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm')
      .then((m) => m.default || m)
      .catch((e) => {
        console.warn('[motion] Anime.js failed to load; sequences disabled.', e);
        return null;
      });
  }
  return _animeP;
}

const toArray = (t) =>
  typeof t === 'string' ? Array.from(document.querySelectorAll(t)) : t instanceof Element ? [t] : Array.from(t || []);

/* ============================================================
   Micro-interactions (Motion One)
   ============================================================ */

/** Staggered entrance — fade + rise. Returns when settled. */
async function reveal(target, { y = 14, delay = 0, stagger = 0.05, duration } = {}) {
  const els = toArray(target);
  if (!els.length) return;
  if (REDUCED) { els.forEach((el) => (el.style.opacity = '1')); return; }
  const lib = await loadMotion();
  if (!lib) { els.forEach((el) => (el.style.opacity = '1')); return; }
  const { animate, stagger: stg } = lib;
  return animate(
    els,
    { opacity: [0, 1], transform: [`translateY(${y}px)`, 'translateY(0px)'] },
    { duration: duration ?? TOK.d3, delay: stg ? stg(stagger, { startDelay: delay }) : delay, easing: [0.05, 0.7, 0.1, 1] }
  ).finished;
}

/** Tactile spring press on pointer-down for interactive elements. */
async function press(target, { scale = 0.96 } = {}) {
  const els = toArray(target);
  if (!els.length || REDUCED) return;
  const lib = await loadMotion();
  if (!lib) return;
  const { animate, spring } = lib;
  const sp = TOK.spring;
  els.forEach((el) => {
    if (el.__pressBound) return;
    el.__pressBound = true;
    const down = () => animate(el, { transform: `scale(${scale})` }, { duration: TOK.d1, easing: 'ease-out' });
    const up = () => animate(el, { transform: 'scale(1)' }, { easing: spring(sp) });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  });
}

/** Spring-lift on hover (subtle translateY + shadow handoff to CSS). */
async function hoverLift(target, { y = -2 } = {}) {
  const els = toArray(target);
  if (!els.length || REDUCED) return;
  const lib = await loadMotion();
  if (!lib) return;
  const { animate, spring } = lib;
  const sp = TOK.spring;
  els.forEach((el) => {
    if (el.__hoverBound) return;
    el.__hoverBound = true;
    el.addEventListener('pointerenter', () => animate(el, { transform: `translateY(${y}px)` }, { easing: spring(sp) }));
    el.addEventListener('pointerleave', () => animate(el, { transform: 'translateY(0px)' }, { easing: spring(sp) }));
  });
}

/** Cross-fade a container's content swap (call before+after replacing innerHTML). */
async function swap(el, mutate) {
  if (REDUCED || !el) { mutate(); return; }
  const lib = await loadMotion();
  if (!lib) { mutate(); return; }
  const { animate } = lib;
  await animate(el, { opacity: [1, 0], transform: ['translateY(0px)', 'translateY(6px)'] }, { duration: TOK.d2, easing: [0.3, 0, 0.8, 0.15] }).finished;
  mutate();
  return animate(el, { opacity: [0, 1], transform: ['translateY(-6px)', 'translateY(0px)'] }, { duration: TOK.d3, easing: [0.05, 0.7, 0.1, 1] }).finished;
}

/* ============================================================
   Orchestrated sequences (Anime.js)
   ============================================================ */

/** Animated number roll-up. Formats with the provided fn (default toLocaleString). */
async function countUp(el, from, to, { duration, format = (n) => Math.round(n).toLocaleString() } = {}) {
  if (!el) return;
  if (REDUCED) { el.textContent = format(to); return; }
  const anime = await loadAnime();
  if (!anime) { el.textContent = format(to); return; }
  const obj = { v: from };
  anime({
    targets: obj,
    v: to,
    duration: (duration ?? TOK.d5) * 1000,
    easing: 'easeOutExpo',
    update: () => { el.textContent = format(obj.v); },
  });
}

/** Generic Anime.js timeline passthrough for bespoke sequences. */
async function timeline(opts) {
  if (REDUCED) return null;
  const anime = await loadAnime();
  if (!anime) return null;
  return anime.timeline(opts);
}

/* ── Auto-wire: opt-in via data attributes, no JS needed ───── */
function autoInit(root = document) {
  reveal(root.querySelectorAll('[data-reveal]'));
  press(root.querySelectorAll('[data-press]'));
  hoverLift(root.querySelectorAll('[data-lift]'));
}

export const Motion = { reveal, press, hoverLift, swap, countUp, timeline, autoInit, REDUCED, loadMotion, loadAnime };
export default Motion;

if (document.readyState !== 'loading') autoInit();
else document.addEventListener('DOMContentLoaded', () => autoInit());
