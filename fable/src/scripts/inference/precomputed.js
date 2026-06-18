/**
 * Precomputed InferenceProvider: real model outputs for bundled demo clips,
 * exported by ml/wakeword/export_wakeword.py from the trained network and the
 * actual EEE4773 training recordings. Scores, spectrograms, and audio are all
 * authentic — only computed offline rather than in the browser.
 * @see provider.js for the interface contract.
 */
export function createPrecomputedProvider(data) {
  return {
    id: 'precomputed',
    label: 'precomputed',
    clipIds: data.clips.map((c) => c.id),
    clips: data.clips,
    ready: () => Promise.resolve(),
    analyze({ clipId }) {
      const clip = data.clips.find((c) => c.id === clipId);
      if (!clip) return Promise.reject(new Error(`unknown clip ${clipId}`));
      return Promise.resolve({
        score: clip.score,
        threshold: data.threshold,
        detected: clip.detected,
        melSpectrogram: clip.melSpectrogram,
        melDbRange: clip.melDbRange,
        waveform: clip.waveform,
        durationSec: clip.durationSec,
        sampleRate: data.sampleRate,
        audioUrl: clip.audioUrl,
        label: clip.label,
        source: 'precomputed',
      });
    },
  };
}
