/**
 * ONNX InferenceProvider: real in-browser inference with the trained network.
 *
 * The classifier sub-model (mel-dB input → conv stack → sigmoid) is exported
 * to public/models/wakeword-clf.onnx by ml/wakeword/export_wakeword.py; the
 * mel front-end runs in JS (mel.js) and matches the training preprocessing
 * exactly (validated against Python golden vectors).
 *
 * onnxruntime-web and the 6.6 MB model are fetched only when the user clicks
 * "Record 3 s" — never on page load. Single-threaded wasm: GitHub Pages
 * sends no COOP/COEP headers, so no SharedArrayBuffer.
 *
 * @see provider.js for the interface contract.
 */
import { melSpectrogram, toDisplay, SAMPLE_RATE, N_SAMPLES, N_MELS, N_FRAMES } from './mel.js';

const MODEL_URL = '/models/wakeword-clf.onnx';
const THRESHOLD = 0.5;

let ortPromise = null;
let sessionPromise = null;

function loadOrt() {
  // wasm-only build: the default entry bundles the 25 MB JSEP (WebGPU) wasm,
  // which this exhibit never uses.
  ortPromise ??= import('onnxruntime-web/wasm').then((ort) => {
    // Absolute URL: the runtime dynamic-imports `${wasmPaths}ort-wasm-simd-threaded.mjs`,
    // and a root-relative path gets intercepted by Vite's resolver in dev.
    ort.env.wasm.wasmPaths = new URL('/ort/', self.location.href).href;
    ort.env.wasm.numThreads = 1;
    return ort;
  });
  return ortPromise;
}

function loadSession() {
  sessionPromise ??= loadOrt().then((ort) =>
    ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
  );
  return sessionPromise;
}

/** Signed per-bucket peak envelope, -1..1, matching the offline exporter. */
function envelope(x, n = 480) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  peak = peak || 1;
  const out = new Array(n).fill(0);
  for (let b = 0; b < n; b++) {
    const lo = Math.floor((b * x.length) / n);
    const hi = Math.floor(((b + 1) * x.length) / n);
    let best = 0;
    for (let i = lo; i < hi; i++) if (Math.abs(x[i]) > Math.abs(best)) best = x[i];
    out[b] = best / peak;
  }
  return out;
}

export function createOnnxProvider() {
  return {
    id: 'onnx',
    label: 'onnx · wasm',
    ready: () => loadSession().then(() => {}),

    /**
     * @param {{ pcm: Float32Array, label?: string, source?: string }} input
     *   pcm: 48000 samples @ 16 kHz (one recorded 3 s window)
     */
    async analyze({ pcm, label = 'your recording', source = 'mic' }) {
      const [ort, session] = await Promise.all([loadOrt(), loadSession()]);
      const x = pcm;
      const mel = melSpectrogram(x); // raw dB, center-fits to 48000 samples internally
      const input = new ort.Tensor('float32', mel.data, [1, N_MELS, N_FRAMES]);
      const out = await session.run({ [session.inputNames[0]]: input });
      const score = out[session.outputNames[0]].data[0];
      return {
        score,
        threshold: THRESHOLD,
        detected: score > THRESHOLD,
        melSpectrogram: toDisplay(mel),
        melDbRange: mel.dbRange,
        waveform: envelope(x.length > N_SAMPLES ? x.subarray(0, N_SAMPLES) : x),
        durationSec: N_SAMPLES / SAMPLE_RATE,
        sampleRate: SAMPLE_RATE,
        audioUrl: null,
        label,
        source,
      };
    },
  };
}
