/** Mentor-Match micro-exhibit: a 6-node animated matching round (SVG). */
import { gsap } from 'gsap';
import { fetchJSON, COLORS, reducedMotion } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const svg = root.querySelector('[data-match-svg]');
  const btn = root.querySelector('[data-run-match]');
  const status = root.querySelector('[data-match-status]');

  const W = 560, H = 170, LX = 90, RX = W - 90;
  const pos = {};
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  function node(p, x, i, side) {
    const y = 30 + i * 55;
    pos[p.id] = { x, y };
    const c = el('circle', { cx: x, cy: y, r: 7, fill: side === 'L' ? COLORS.ink : 'none', stroke: COLORS.ink, 'stroke-width': 1.6 });
    const t = el('text', {
      x: side === 'L' ? x - 16 : x + 16, y: y + 4,
      'text-anchor': side === 'L' ? 'end' : 'start',
      fill: COLORS.foam, 'font-family': 'Spline Sans Mono, monospace', 'font-size': '11',
      'letter-spacing': '1',
    });
    t.textContent = `${p.name.toUpperCase()} ${p.id}`;
    svg.append(c, t);
  }

  svg.innerHTML = '';
  data.mentors.forEach((m, i) => node(m, LX, i, 'L'));
  data.mentees.forEach((m, i) => node(m, RX, i, 'R'));

  const edgeLayer = el('g', {});
  svg.prepend(edgeLayer);

  function edge(from, to, cls) {
    const a = pos[from], b = pos[to];
    const ln = el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: cls === 'final' ? COLORS.red : cls === 'rejected' ? COLORS.baffle : COLORS.foam,
      'stroke-width': cls === 'final' ? 2.2 : 1.4,
      'stroke-dasharray': cls === 'held' ? '4 4' : 'none',
    });
    edgeLayer.appendChild(ln);
    return ln;
  }

  let busy = false;
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    edgeLayer.innerHTML = '';
    const instant = reducedMotion();
    const wait = (s) => new Promise((r) => setTimeout(r, instant ? 0 : s * 1000));

    for (const [ri, round] of data.rounds.entries()) {
      status.textContent = `round ${ri + 1} · proposals`;
      for (const p of round.proposals) {
        const ln = edge(p.from, p.to, p.outcome === 'held' ? 'held' : 'proposal');
        if (!instant) {
          const len = Math.hypot(pos[p.to].x - pos[p.from].x, pos[p.to].y - pos[p.from].y);
          gsap.fromTo(ln, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' });
        }
        if (p.displaces) {
          status.textContent = `round ${ri + 1} · ${p.to} prefers ${p.from}, ${p.displaces} displaced`;
          edgeLayer.querySelectorAll('line').forEach((l) => {
            if (l.getAttribute('x1') == pos[p.displaces].x && l.getAttribute('y1') == pos[p.displaces].y) {
              gsap.to(l, { opacity: 0.25, duration: instant ? 0 : 0.4 });
            }
          });
        }
        await wait(0.55);
      }
    }

    status.textContent = 'stable matching reached';
    edgeLayer.innerHTML = '';
    data.final.forEach(([m, e]) => {
      const ln = edge(m, e, 'final');
      if (!instant) gsap.from(ln, { opacity: 0, duration: 0.5 });
    });
    busy = false;
  });
}
