import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const mm = gsap.matchMedia();

/* ============================================================
 * FULL MOTION — pointer devices, no reduced-motion preference
 * ============================================================ */
mm.add(
  {
    full: '(prefers-reduced-motion: no-preference)',
    reduced: '(prefers-reduced-motion: reduce)',
  },
  (ctx) => {
    const { full, reduced } = ctx.conditions;

    /* ---------- hero load choreography (the one big sequence) ---------- */
    const path = document.querySelector('[data-signal-path]');
    if (full && path) {
      const len = path.getTotalLength();
      const chars = gsap.utils.toArray('.hero__name .char');

      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
      gsap.set('[data-hero-signal]', { opacity: 1 });
      gsap.set('[data-signal-impulse]', { scale: 0, transformOrigin: 'center' });
      // each letter starts displaced as if sitting on the waveform
      chars.forEach((c, i) => {
        gsap.set(c, { y: Math.sin(i * 1.7) * 60 + (i % 3) * 14 - 40, opacity: 0 });
      });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to(path, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' })
        .to('[data-signal-impulse]', { scale: 1, duration: 0.35, ease: 'back.out(3)' }, '-=0.55')
        .to(chars, { y: 0, opacity: 1, duration: 0.9, stagger: 0.035 }, '-=0.45')
        .to('[data-hero-kicker]', { opacity: 1, duration: 0.5 }, '-=0.6')
        .to('[data-hero-id]', { opacity: 1, duration: 0.6 }, '-=0.35')
        .to('[data-hero-links]', { opacity: 1, duration: 0.6 }, '-=0.4')
        .to('[data-hero-scroll]', { opacity: 1, duration: 0.6 }, '-=0.3');

      // the impulse keeps a slow pulse — the site is "recording"
      gsap.to('[data-signal-impulse]', { scale: 1.6, opacity: 0.55, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 3 });
      gsap.to('[data-rec]', { opacity: 0.25, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    } else if (path) {
      // reduced: everything simply visible (CSS already shows it)
      gsap.set('[data-hero-signal]', { opacity: 1 });
    }

    /* ---------- scroll reveals ---------- */
    gsap.utils.toArray('.reveal').forEach((el) => {
      if (full) {
        gsap.fromTo(
          el,
          { opacity: 0, y: 26 },
          {
            opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          }
        );
      } else if (reduced) {
        gsap.set(el, { opacity: 1 });
      }
    });

    /* ---------- through-line dividers draw in ---------- */
    document.querySelectorAll('[data-divider]').forEach((fig) => {
      const strokes = fig.querySelectorAll('path, line');
      if (full) {
        strokes.forEach((s) => {
          const len = s.getTotalLength ? s.getTotalLength() : 100;
          gsap.fromTo(
            s,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0, duration: 1.1, ease: 'power2.out',
              scrollTrigger: { trigger: fig, start: 'top 88%', once: true },
            }
          );
        });
      }
    });

    /* ---------- the single scrubbed moment: fig. 01 wipes in ---------- */
    const fig01 = document.querySelector('#fig-01');
    if (full && fig01) {
      gsap.fromTo(
        fig01,
        { clipPath: 'inset(0 100% 0 0)' },
        {
          clipPath: 'inset(0 0% 0 0)', ease: 'none',
          scrollTrigger: { trigger: '#p-wakeword', start: 'top 85%', end: 'top 25%', scrub: 0.4 },
        }
      );
    }

    /* ---------- micro-interaction 2: card level meters ---------- */
    if (full) {
      document.querySelectorAll('.card').forEach((card) => {
        const bars = card.querySelectorAll('.meter i');
        if (!bars.length) return;
        const excite = () =>
          bars.forEach((b) =>
            gsap.to(b, {
              height: `${25 + Math.random() * 75}%`,
              backgroundColor: '#e5231b',
              duration: 0.18 + Math.random() * 0.2,
              repeat: 3, yoyo: true, ease: 'sine.inOut',
              onComplete: () => gsap.to(b, { height: '30%', backgroundColor: '#d8d6cf', duration: 0.4 }),
            })
          );
        card.addEventListener('mouseenter', excite);
        card.addEventListener('focusin', excite);
      });
    }

    return () => {};
  }
);

/* ============================================================
 * rail: highlight current section
 * ============================================================ */
const navLinks = [...document.querySelectorAll('.rail__nav a')];
navLinks.forEach((a) => {
  const sec = document.querySelector(a.getAttribute('href'));
  if (!sec) return;
  ScrollTrigger.create({
    trigger: sec,
    start: 'top 40%',
    end: 'bottom 40%',
    onToggle: (st) => a.setAttribute('aria-current', st.isActive ? 'true' : 'false'),
  });
});

/* ============================================================
 * lazy exhibit loader — modules + their data load only when near viewport
 * ============================================================ */
const loaders = {
  wakeword: () => import('./exhibits/wakeword.js'),
  downsampling: () => import('./exhibits/downsampling.js'),
  diarization: () => import('./exhibits/diarization.js'),
  bioclock: () => import('./exhibits/bioclock.js'),
  mentormatch: () => import('./exhibits/mentormatch.js'),
  taxitips: () => import('./exhibits/taxitips.js'),
};

// Exhibits inject content (buttons, table rows) after load, which shifts every
// section below them. Recompute ScrollTrigger positions after each one settles,
// or reveals near the page bottom (About) can end up with stale start positions
// and never fire.
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 120);
}

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) loadExhibit(entry.target);
    });
  },
  { rootMargin: '320px 0px' }
);

// Shared by the observer and the deep-link preloader so an exhibit is only
// ever initialised once. Returns a promise that resolves when it's settled.
const loadedExhibits = new WeakSet();
function loadExhibit(root) {
  if (loadedExhibits.has(root)) return Promise.resolve();
  loadedExhibits.add(root);
  io.unobserve(root);
  const name = root.dataset.exhibit;
  return (loaders[name]?.() ?? Promise.resolve())
    .then((m) => m?.default(root))
    .then(scheduleRefresh)
    .catch((err) => {
      console.error(`exhibit ${name} failed`, err);
      root.insertAdjacentHTML('beforeend', '<p class="mono">Exhibit failed to load.</p>');
    });
}
document.querySelectorAll('[data-exhibit]').forEach((el) => io.observe(el));

/* ============================================================
 * deep-link glide — the head script stashed the hash and kept the
 * browser at the top so the page loads normally. We then load every
 * exhibit at/above the target up front so the page below stops growing,
 * let it settle, and run ONE timed GSAP tween to the section. Preloading
 * (not snapping) is what stops the choppy "still loading" jumps; the
 * tween duration is the speed knob. Aborts if the visitor scrolls first.
 * ============================================================ */
const GLIDE_DURATION = 1.6; // seconds — raise to slow the scroll, lower to speed it
const GLIDE_OFFSET = 64; // px gap above the title (matches scroll-padding-top: 4rem)

const deepLinkId = window.__deepLinkTarget;
const deepLinkEl = deepLinkId && document.getElementById(deepLinkId);
if (deepLinkEl) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The head script stripped the hash to stop the browser's instant jump.
  // Put it back now (replaceState never scrolls) so the URL stays shareable
  // through the load + glide instead of sitting bare.
  history.replaceState(null, '', '#' + deepLinkId);

  // reveals leave the header invisible/shifted on first paint — force the
  // target's reveals to rest state so we land on a visible title.
  const pin = () =>
    deepLinkEl.querySelectorAll('.reveal').forEach((r) => gsap.set(r, { opacity: 1, y: 0 }));

  // every exhibit that sits at or above the target — load these before
  // scrolling so nothing injects DOM mid-glide and shifts the destination.
  const inPath = [...document.querySelectorAll('[data-exhibit]')].filter(
    (el) =>
      deepLinkEl.contains(el) ||
      el.compareDocumentPosition(deepLinkEl) & Node.DOCUMENT_POSITION_FOLLOWING
  );

  const ready = Promise.all([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((res) =>
      document.readyState === 'complete' ? res() : addEventListener('load', res, { once: true })
    ),
  ]);

  ready
    // Load in-path exhibits so they stop reflowing, but cap the wait: their
    // init() awaits data fetches and a first render, and we must never let a
    // slow one stall the scroll entirely.
    .then(() =>
      Promise.race([
        Promise.all(inPath.map(loadExhibit)),
        new Promise((res) => setTimeout(res, 1200)),
      ])
    )
    .then(() => new Promise((res) => setTimeout(res, 200))) // let injected DOM settle
    .then(() => {
      // If the visitor already scrolled during load, they've taken over —
      // don't hijack them. (A simple position check, not an input listener,
      // so a stray trackpad twitch that moved nothing can't cancel us.)
      if (window.scrollY > 4) return;
      pin();
      ScrollTrigger.refresh();
      gsap.to(window, {
        duration: reduce ? 0 : GLIDE_DURATION,
        ease: 'power2.inOut',
        // autoKill lets a genuine scroll during the glide cancel it; it's only
        // armed now, so input while loading can't kill the glide before it runs.
        scrollTo: { y: deepLinkEl, offsetY: GLIDE_OFFSET, autoKill: true },
      });
    });
}
