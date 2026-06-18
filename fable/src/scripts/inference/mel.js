/*
 * Mel-spectrogram front-end matching keras.layers.MelSpectrogram exactly:
 *   fft_length=512 · sequence_stride=160 · sampling_rate=16000 · num_mel_bins=80
 *   min_freq=80 · max_freq=8000 · power_to_db (top_db=80, ref=1, min=1e-10)
 *   STFT center=true (reflect pad 256), periodic Hann window, power spectrum,
 *   HTK mel scale (1127·ln(1+f/700)), TF-style triangular filterbank.
 *
 * The classifier consumes RAW dB values — do not normalize before inference.
 * Validated against Python golden vectors (ml/wakeword/validate_mel.mjs).
 */

export const SAMPLE_RATE = 16000;
export const N_SAMPLES = 48000; // 3 s
export const FFT_LENGTH = 512;
export const HOP = 160;
export const N_MELS = 80;
export const N_FRAMES = 301; // 1 + (48000 + 2*256 - 512) / 160

const N_BINS = FFT_LENGTH / 2 + 1; // 257
const MIN_FREQ = 80;
const MAX_FREQ = SAMPLE_RATE / 2;
const TOP_DB = 80;
const MIN_POWER = 1e-10;

/* ---- precomputed tables --------------------------------------------------- */

// periodic Hann
const WINDOW = new Float32Array(FFT_LENGTH);
for (let n = 0; n < FFT_LENGTH; n++) {
  WINDOW[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FFT_LENGTH);
}

// bit-reversal permutation + twiddles for radix-2 FFT of size 512
const FFT_BITS = Math.log2(FFT_LENGTH);
const REV = new Uint16Array(FFT_LENGTH);
for (let i = 0; i < FFT_LENGTH; i++) {
  let r = 0;
  for (let b = 0; b < FFT_BITS; b++) r |= ((i >> b) & 1) << (FFT_BITS - 1 - b);
  REV[i] = r;
}
const COS = new Float32Array(FFT_LENGTH / 2);
const SIN = new Float32Array(FFT_LENGTH / 2);
for (let i = 0; i < FFT_LENGTH / 2; i++) {
  COS[i] = Math.cos((-2 * Math.PI * i) / FFT_LENGTH);
  SIN[i] = Math.sin((-2 * Math.PI * i) / FFT_LENGTH);
}

// HTK mel filterbank, TF linear_to_mel_weight_matrix semantics:
// drop the DC bin, triangular weights in mel space, no normalization.
const hzToMel = (f) => 1127 * Math.log(1 + f / 700);
const MEL_W = (() => {
  const w = new Float32Array(N_BINS * N_MELS); // [bin][mel], bin 0 stays zero
  const melLo = hzToMel(MIN_FREQ);
  const melHi = hzToMel(MAX_FREQ);
  const edges = new Float64Array(N_MELS + 2);
  for (let i = 0; i < N_MELS + 2; i++) {
    edges[i] = melLo + ((melHi - melLo) * i) / (N_MELS + 1);
  }
  const nyquist = SAMPLE_RATE / 2;
  for (let bin = 1; bin < N_BINS; bin++) {
    const mel = hzToMel((nyquist * bin) / (N_BINS - 1));
    for (let m = 0; m < N_MELS; m++) {
      const lower = (mel - edges[m]) / (edges[m + 1] - edges[m]);
      const upper = (edges[m + 2] - mel) / (edges[m + 2] - edges[m + 1]);
      w[bin * N_MELS + m] = Math.max(0, Math.min(lower, upper));
    }
  }
  return w;
})();

/* ---- FFT ------------------------------------------------------------------ */

const re = new Float32Array(FFT_LENGTH);
const im = new Float32Array(FFT_LENGTH);

function fftPower(frame, powerOut) {
  for (let i = 0; i < FFT_LENGTH; i++) {
    re[i] = frame[REV[i]];
    im[i] = 0;
  }
  for (let size = 2; size <= FFT_LENGTH; size <<= 1) {
    const half = size >> 1;
    const step = FFT_LENGTH / size;
    for (let start = 0; start < FFT_LENGTH; start += size) {
      for (let k = 0; k < half; k++) {
        const tw = k * step;
        const i0 = start + k;
        const i1 = i0 + half;
        const tr = re[i1] * COS[tw] - im[i1] * SIN[tw];
        const ti = re[i1] * SIN[tw] + im[i1] * COS[tw];
        re[i1] = re[i0] - tr;
        im[i1] = im[i0] - ti;
        re[i0] += tr;
        im[i0] += ti;
      }
    }
  }
  for (let b = 0; b < N_BINS; b++) powerOut[b] = re[b] * re[b] + im[b] * im[b];
}

/* ---- public API ------------------------------------------------------------ */

/**
 * Compute the mel spectrogram in raw dB, matching the training front-end.
 * @param {Float32Array} pcm 48000 samples @ 16 kHz (shorter input is zero-padded,
 *   longer is center-cropped)
 * @returns {{ data: Float32Array, nMels: number, nFrames: number, dbRange: [number, number] }}
 *   data layout matches keras output (80, 301): data[mel * nFrames + frame]
 */
export function melSpectrogram(pcm) {
  let x = pcm;
  if (x.length !== N_SAMPLES) {
    const fitted = new Float32Array(N_SAMPLES);
    if (x.length > N_SAMPLES) {
      const off = Math.floor((x.length - N_SAMPLES) / 2);
      fitted.set(x.subarray(off, off + N_SAMPLES));
    } else {
      fitted.set(x, Math.floor((N_SAMPLES - x.length) / 2));
    }
    x = fitted;
  }

  // reflect pad 256 each side (STFT center=true)
  const pad = FFT_LENGTH / 2;
  const padded = new Float32Array(N_SAMPLES + 2 * pad);
  padded.set(x, pad);
  for (let i = 0; i < pad; i++) {
    padded[pad - 1 - i] = x[i + 1];
    padded[pad + N_SAMPLES + i] = x[N_SAMPLES - 2 - i];
  }

  const out = new Float32Array(N_MELS * N_FRAMES);
  const frame = new Float32Array(FFT_LENGTH);
  const power = new Float32Array(N_BINS);
  let maxDb = -Infinity;

  for (let f = 0; f < N_FRAMES; f++) {
    const off = f * HOP;
    for (let n = 0; n < FFT_LENGTH; n++) frame[n] = padded[off + n] * WINDOW[n];
    fftPower(frame, power);
    for (let m = 0; m < N_MELS; m++) {
      let acc = 0;
      for (let b = 1; b < N_BINS; b++) acc += power[b] * MEL_W[b * N_MELS + m];
      const db = 10 * Math.log10(Math.max(acc, MIN_POWER));
      out[m * N_FRAMES + f] = db;
      if (db > maxDb) maxDb = db;
    }
  }

  // top_db clamp relative to the global max (ref_power=1 contributes 0)
  const floor = maxDb - TOP_DB;
  for (let i = 0; i < out.length; i++) if (out[i] < floor) out[i] = floor;

  return { data: out, nMels: N_MELS, nFrames: N_FRAMES, dbRange: [floor, maxDb] };
}

/**
 * Convert raw-dB mel output to the display format used by the exhibit:
 * frames × mels, normalized 0..1, optionally frame-subsampled.
 */
export function toDisplay(mel, subsample = 2) {
  const { data, nMels, nFrames, dbRange } = mel;
  const [lo, hi] = dbRange;
  const span = hi - lo || 1;
  const rows = [];
  for (let f = 0; f < nFrames; f += subsample) {
    const row = new Array(nMels);
    for (let m = 0; m < nMels; m++) row[m] = (data[m * nFrames + f] - lo) / span;
    rows.push(row);
  }
  return rows;
}
