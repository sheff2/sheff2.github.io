import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
      if (!entry.isIntersecting) return;
      const root = entry.target;
      io.unobserve(root);
      const name = root.dataset.exhibit;
      loaders[name]?.().then((m) => m.default(root)).then(scheduleRefresh).catch((err) => {
        console.error(`exhibit ${name} failed`, err);
        root.insertAdjacentHTML('beforeend', '<p class="mono">Exhibit failed to load.</p>');
      });
    });
  },
  { rootMargin: '320px 0px' }
);
document.querySelectorAll('[data-exhibit]').forEach((el) => io.observe(el));
