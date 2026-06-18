/**
 * One-shot microphone recording for the wake-word exhibit.
 *
 * recordClip() captures exactly 3 s (48000 samples @ 16 kHz) from the mic via
 * an AudioWorklet, then releases the tracks and closes the AudioContext.
 * Capture starts only from an explicit user gesture. pcmToWavBlob() encodes
 * the capture as a playable WAV so the transport works like the demo clips.
 */
import { SAMPLE_RATE, N_SAMPLES } from './mel.js';

const WORKLET_SRC = `
class WakewordTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch?.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('wakeword-tap', WakewordTap);
`;

/** Linear resample for contexts that can't run at 16 kHz natively. */
function makeResampler(fromRate) {
  if (fromRate === SAMPLE_RATE) return (c) => c;
  const ratio = fromRate / SAMPLE_RATE;
  return (chunk) => {
    const n = Math.floor(chunk.length / ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const t = pos - j;
      out[i] = chunk[j] * (1 - t) + (chunk[Math.min(j + 1, chunk.length - 1)] ?? 0) * t;
    }
    return out;
  };
}

/**
 * Record one 3 s window. onTick(secondsRemaining) fires once per second for
 * a countdown. Resolves with Float32Array(48000) @ 16 kHz; always releases
 * the mic, even on error.
 */
export async function recordClip({ onTick } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let ctx;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch {
    ctx = new AudioContext();
  }
  let tickTimer = null;
  try {
    const resample = makeResampler(ctx.sampleRate);
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const tap = new AudioWorkletNode(ctx, 'wakeword-tap');
    const out = new Float32Array(N_SAMPLES);
    let filled = 0;
    const done = new Promise((resolve) => {
      tap.port.onmessage = (e) => {
        if (filled >= N_SAMPLES) return;
        const chunk = resample(e.data);
        const n = Math.min(chunk.length, N_SAMPLES - filled);
        out.set(chunk.subarray(0, n), filled);
        filled += n;
        if (filled >= N_SAMPLES) resolve();
      };
    });
    ctx.createMediaStreamSource(stream).connect(tap);
    if (onTick) {
      let remaining = Math.round(N_SAMPLES / SAMPLE_RATE);
      onTick(remaining);
      tickTimer = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) onTick(remaining);
      }, 1000);
    }
    await done;
    return out;
  } finally {
    if (tickTimer) clearInterval(tickTimer);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  }
}

/** Encode mono Float32 PCM as a playable 16-bit WAV blob. */
export function pcmToWavBlob(pcm, sampleRate = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
