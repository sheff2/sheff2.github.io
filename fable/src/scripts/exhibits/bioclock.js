/** Fig. 04 — BioClock: restlessness slider → edge classifier decision. */
import { fetchJSON, setupCanvas, COLORS, MONO, reducedMotion } from './util.js';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const traces = setupCanvas(root.querySelector('[data-traces]'));
  const rest = root.querySelector('[data-rest]');
  const roState = root.querySelector('[data-ro-state]');
  const roConf = root.querySelector('[data-ro-conf]');
  const roHr = root.querySelector('[data-ro-hr]');
  const alarm = root.querySelector('[data-alarm]');

  let level = Number(rest.value) / 100;
  let offset = 0;
  let raf = null;
  let running = false;

  /** nearest precomputed sample for the current slider level */
  function sample() {
    let best = data.samples[0];
    for (const s of data.samples) {
      if (Math.abs(s.restlessness - level) < Math.abs(best.restlessness - level)) best = s;
    }
    return best;
  }

  function draw() {
    const { ctx, w, h } = traces;
    const s = sample();
    const half = (h - 26) / 2;
    const n = s.hr.length;
    ctx.clearRect(0, 0, w, h);
    ctx.font = MONO;

    // HR trace (top half) — scrolling window
    ctx.fillStyle = COLORS.foam;
    ctx.fillText('HEART RATE · BPM', 0, 9);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = s.hr[(i + offset) % n];
      const x = (i / (n - 1)) * w;
      const y = 14 + half - ((v - 45) / 50) * half;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // accel trace (bottom half) — bars
    const base = h - 4;
    ctx.fillStyle = COLORS.foam;
    ctx.fillText('ACCEL · G', 0, 14 + half + 12);
    for (let i = 0; i < n; i++) {
      const v = Math.abs(s.accel[(i + offset) % n]);
      const x = (i / (n - 1)) * w;
      const bh = Math.min(half - 18, v * (half - 18) * 1.6) + 1;
      ctx.fillStyle = v > 0.45 ? COLORS.red : COLORS.ink;
      ctx.fillRect(x, base - bh, Math.max(1.5, w / n - 2), bh);
    }
  }

  function classify() {
    const s = sample();
    roState.textContent = s.state;
    roState.classList.toggle('is-hot', s.state === 'awake');
    roConf.textContent = `conf = ${s.confidence.toFixed(2)}`;
    const meanHr = s.hr.reduce((a, b) => a + b, 0) / s.hr.length;
    roHr.textContent = `hr = ${Math.round(meanHr)} bpm`;
    const firing = s.state === 'awake';
    alarm.textContent = firing ? 'alarm: dismissed, actually awake' : 'alarm: held, not awake yet';
    alarm.classList.toggle('is-firing', firing);
  }

  function loop() {
    if (!running) return;
    offset = (offset + 1) % sample().hr.length;
    draw();
    raf = setTimeout(loop, 70);
  }

  rest.addEventListener('input', () => {
    level = Number(rest.value) / 100;
    classify();
    if (reducedMotion()) draw();
  });

  root.querySelector('[data-traces]').addEventListener('exhibit:resize', draw);

  classify();
  draw();
  if (!reducedMotion() && !running) {
    running = true;
    loop();
  }

  // stop the rAF loop when the exhibit scrolls far away
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !running && !reducedMotion()) {
        running = true;
        loop();
      } else if (!e.isIntersecting && running) {
        running = false;
        if (raf) clearTimeout(raf);
      }
    });
  }).observe(root);
}
