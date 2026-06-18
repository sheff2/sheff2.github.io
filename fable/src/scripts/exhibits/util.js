/** Shared helpers for exhibit modules. */

export const COLORS = {
  bg: '#efeeea',
  panel: '#f6f5f1',
  ink: '#1a1c20',
  red: '#e5231b',
  baffle: '#d8d6cf',
  foam: '#8a8c88',
};

export const MONO = '500 11px "Spline Sans Mono", monospace';

export const reducedMotion = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/**
 * Size a canvas to its CSS width × the height attribute, scaled for DPR.
 * Returns a draw context; call the returned resize() on container resize.
 */
export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const cssH = canvas.height; // height attribute = CSS pixels
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h: cssH };
  }
  let dims = resize();
  const ro = new ResizeObserver(() => {
    // Skip no-op resizes: setting canvas.width erases the canvas, and the
    // observer always fires once right after observe() — repainting nothing.
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    if (w === dims.w) return;
    dims = resize();
    canvas.dispatchEvent(new CustomEvent('exhibit:resize'));
  });
  ro.observe(canvas.parentElement);
  return { ctx, get w() { return dims.w; }, get h() { return dims.h; } };
}

/** Anechoic → Graphite colormap for spectrograms (red stays reserved). */
export function heat(v) {
  const t = Math.max(0, Math.min(1, v));
  const a = [0xef, 0xee, 0xea];
  const b = [0x1a, 0x1c, 0x20];
  const mix = a.map((c, i) => Math.round(c + (b[i] - c) * t ** 0.85));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}
