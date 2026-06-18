/**
 * Fig. 05 — what predicts a taxi tip.
 *
 * Real fitted coefficients and metrics from the NYC 2023 taxi report
 * (Tables II–III, Test Results) — linear regression vs LASSO (λ = 0.01).
 * The interaction is the paper's finding: toggle LASSO and watch it zero
 * 15 of 27 features while R² barely moves.
 */
import { gsap } from 'gsap';
import { fetchJSON, setupCanvas, COLORS, MONO, reducedMotion } from './util.js';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const coefC = setupCanvas(root.querySelector('[data-coef]'));
  const ciC = setupCanvas(root.querySelector('[data-ci]'));
  const btns = [...root.querySelectorAll('[data-model]')];
  const roView = root.querySelector('[data-ro-view]');
  const metricsBody = root.querySelector('[data-metrics]');

  const features = data.features;
  const zeroed = features.filter((f) => f.lasso === 0).length;
  const kept = features.length - zeroed;
  const maxAbs = Math.max(...features.map((f) => Math.max(Math.abs(f.linear), Math.abs(f.lasso))));

  let view = 'linear';
  // displayed coefficient values, animated between the two models
  const disp = Object.fromEntries(features.map((f) => [f.id, f.linear]));
  let tween = null;

  /* ---------- coefficient chart: all 27 features, real values ---------- */
  function drawCoef() {
    const { ctx, w, h } = coefC;
    ctx.clearRect(0, 0, w, h);
    const labelW = Math.min(168, w * 0.36);
    const valueW = 44;
    const top = 18;
    const rowH = (h - top - 4) / features.length;
    const areaW = w - labelW - valueW;
    const zeroX = labelW + areaW / 2;
    const scale = (areaW / 2 - 4) / maxAbs;

    ctx.font = MONO;
    ctx.fillStyle = COLORS.foam;
    ctx.fillText(
      view === 'lasso'
        ? `FITTED COEFFICIENTS · LASSO · ${zeroed} FEATURES → 0`
        : 'FITTED COEFFICIENTS · LINEAR · ALL 27 FEATURES',
      0, 10
    );

    // zero axis
    ctx.strokeStyle = COLORS.baffle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX + 0.5, top);
    ctx.lineTo(zeroX + 0.5, h - 2);
    ctx.stroke();

    features.forEach((f, i) => {
      const y = top + i * rowH;
      const v = disp[f.id];
      const dropped = view === 'lasso' && f.lasso === 0;

      ctx.fillStyle = dropped ? COLORS.baffle : COLORS.foam;
      ctx.fillText(f.label.toUpperCase(), 0, y + rowH / 2 + 3.5);

      if (Math.abs(v) > 1e-4) {
        const bw = v * scale;
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(Math.min(zeroX, zeroX + bw), y + rowH / 2 - 3, Math.abs(bw), 6);
      }

      ctx.fillStyle = dropped ? COLORS.red : COLORS.foam;
      const vLabel = dropped ? '0' : (Math.round(v * 100) / 100).toFixed(2);
      ctx.fillText(vLabel, w - valueW + 8, y + rowH / 2 + 3.5);
    });
  }

  /* ---------- R² confidence intervals (10-fold CV, 95%) ---------- */
  function drawCI() {
    const { ctx, w, h } = ciC;
    ctx.clearRect(0, 0, w, h);
    const lo = 0.5;
    const hi = 0.7;
    const labelW = 56;
    const top = 22;
    const bottom = h - 14;
    const x = (r2) => labelW + ((r2 - lo) / (hi - lo)) * (w - labelW);

    ctx.font = MONO;
    ctx.fillStyle = COLORS.foam;
    ctx.fillText('R² · 10-FOLD CV · 95% CI', 0, 10);

    ctx.strokeStyle = COLORS.baffle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelW, bottom + 0.5);
    ctx.lineTo(w, bottom + 0.5);
    ctx.stroke();
    for (const t of [0.5, 0.55, 0.6, 0.65, 0.7]) {
      ctx.fillStyle = COLORS.foam;
      ctx.fillText(t.toFixed(2), Math.min(x(t), w - 26), bottom + 11);
    }

    Object.entries(data.models).forEach(([id, m], i) => {
      const y = top + i * ((bottom - top - 10) / (Object.keys(data.models).length - 1));
      const active = id === view;
      ctx.fillStyle = active ? COLORS.ink : COLORS.foam;
      ctx.fillText(id.toUpperCase(), 0, y + 3.5);
      ctx.strokeStyle = active ? COLORS.ink : COLORS.foam;
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x(m.ci[0]), y);
      ctx.lineTo(x(m.ci[1]), y);
      ctx.stroke();
      // CI end ticks
      for (const e of m.ci) {
        ctx.beginPath();
        ctx.moveTo(x(e), y - 3);
        ctx.lineTo(x(e), y + 3);
        ctx.stroke();
      }
      // point estimate: red for the active model
      ctx.fillStyle = active ? COLORS.red : COLORS.foam;
      ctx.beginPath();
      ctx.arc(x(m.cvR2), y, 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  /* ---------- metrics table (real test results) ---------- */
  for (const [id, m] of Object.entries(data.models)) {
    const tr = document.createElement('tr');
    if (m.chosen) tr.className = 'is-chosen';
    const cells = [
      id + (m.chosen ? ' · chosen' : ''),
      `${m.cvR2.toFixed(4)} (${m.ci[0].toFixed(4)}, ${m.ci[1].toFixed(4)})`,
      m.testR2.toFixed(3),
      `$${m.rmse.toFixed(2)} · ${m.rmsePctOfMeanTip}%`,
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    metricsBody.appendChild(tr);
  }

  /* ---------- model toggle ---------- */
  function setView(next, { animate = true } = {}) {
    view = next;
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.model === next)));
    const m = data.models[next];
    roView.textContent =
      next === 'lasso'
        ? `${kept} of ${features.length} features kept · cv R² ${m.cvR2.toFixed(4)}`
        : `all ${features.length} features · cv R² ${m.cvR2.toFixed(4)}`;
    roView.classList.toggle('is-hot', next === 'lasso');
    drawCI();

    tween?.kill();
    const targets = Object.fromEntries(features.map((f) => [f.id, f[next]]));
    if (animate && !reducedMotion()) {
      tween = gsap.to(disp, { ...targets, duration: 0.8, ease: 'power3.out', onUpdate: drawCoef });
    } else {
      Object.assign(disp, targets);
      drawCoef();
    }
  }

  btns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.model)));

  root.querySelector('[data-coef]').addEventListener('exhibit:resize', drawCoef);
  root.querySelector('[data-ci]').addEventListener('exhibit:resize', drawCI);

  setView('linear', { animate: false });
}
