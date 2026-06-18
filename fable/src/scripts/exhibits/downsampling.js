/**
 * Fig. 01b — downsample, don't upsample.
 *
 * Measured spectrum of the same real "Go Gators" recording at 48 kHz and after
 * downsampling to 16 kHz (the Google Speech Commands pretraining rate), plus
 * the real experiment table. Data exported by ml/wakeword/export_wakeword.py.
 */
import { fetchJSON, setupCanvas, COLORS, MONO } from './util.js';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const cmp = setupCanvas(root.querySelector('[data-cmp]'));

  /* ---------- spectrum: shared 0–24 kHz axis ---------- */
  function spectrumPath(ctx, spec, w, top, bottom, fracOfAxis) {
    ctx.beginPath();
    for (let i = 0; i < spec.length; i++) {
      const x = (i / (spec.length - 1)) * fracOfAxis * w;
      const y = bottom - spec[i] * (bottom - top);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function draw() {
    const { ctx, w, h } = cmp;
    const top = 26;
    const bottom = h - 18;
    const axisHz = data.original.nyquistHz; // 24 000
    ctx.clearRect(0, 0, w, h);

    // axis + ticks
    ctx.strokeStyle = COLORS.baffle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bottom + 0.5);
    ctx.lineTo(w, bottom + 0.5);
    ctx.stroke();
    ctx.font = MONO;
    ctx.fillStyle = COLORS.foam;
    for (const kHz of [0, 4, 8, 16, 24]) {
      const x = ((kHz * 1000) / axisHz) * w;
      ctx.fillText(`${kHz}k`, Math.min(x, w - 18), bottom + 12);
    }

    // 48 kHz original — full axis
    ctx.strokeStyle = COLORS.foam;
    spectrumPath(ctx, data.original.spectrum, w, top, bottom, 1);
    // 16 kHz downsampled — stops at its 8 kHz Nyquist
    const frac = data.downsampled.nyquistHz / axisHz;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.4;
    spectrumPath(ctx, data.downsampled.spectrum, w, top, bottom, frac);

    // Nyquist cut line
    const nx = frac * w;
    ctx.strokeStyle = COLORS.red;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(nx, top - 8);
    ctx.lineTo(nx, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.red;
    const nLabel = '8 kHz · EVERYTHING PAST HERE IS DISCARDED';
    const nw = ctx.measureText(nLabel).width;
    ctx.fillText(nLabel, Math.min(nx + 6, w - nw), top);

    ctx.fillStyle = COLORS.foam;
    ctx.fillText('SPECTRUM · GRAY 48 kHz · INK 16 kHz', 0, 10);
  }

  root.querySelector('[data-cmp]').addEventListener('exhibit:resize', draw);

  /* ---------- real experiment table ---------- */
  const tbody = root.querySelector('[data-table] tbody');
  for (const exp of data.experiments) {
    const parts = [];
    if (exp.valF1 != null) parts.push(`val F1 ${exp.approx ? '≈ ' : ''}${exp.valF1.toFixed(2)}`);
    if (exp.testF1 != null) parts.push(`test F1 ${exp.testF1.toFixed(3)}`);
    if (exp.accuracy != null) parts.push(`acc ${exp.accuracy.toFixed(4)}`);
    if (exp.f1 != null) parts.push(`F1 ${exp.f1.toFixed(4)}`);
    const tr = document.createElement('tr');
    if (/kept/.test(exp.outcome)) tr.className = 'is-kept';
    for (const text of [exp.approach, parts.join(' · '), exp.outcome]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  draw();
}
