/**
 * InferenceProvider — the single interface every wake-word inference backend
 * implements. The exhibit UI talks ONLY to this interface, so the precomputed
 * provider (bundled demo clips) and the ONNX provider (live mic, real
 * in-browser inference) are interchangeable.
 *
 * The model is a transfer-learned CNN classifier (EEE4773 final project):
 * 3 s of 16 kHz audio → mel spectrogram (80 × 301) → conv encoder pretrained
 * on Google Speech Commands → sigmoid score. Score > 0.5 = "Go Gators".
 *
 * @typedef {Object} AnalysisResult
 * @property {number}     score           sigmoid output, 0..1
 * @property {number}     threshold       detection threshold on the score (0.5)
 * @property {boolean}    detected        score > threshold
 * @property {number[][]} melSpectrogram  frames × nMels, normalized 0..1 for display
 * @property {number[]}   melDbRange      [min, max] raw dB of the mel input
 * @property {number[]}   waveform        amplitude envelope, -1..1
 * @property {number}     durationSec     length of the scored window (3.0)
 * @property {number}     sampleRate      16000
 * @property {?string}    audioUrl        playable audio for the clip, if any
 * @property {string}     label           human-readable description of the input
 * @property {('precomputed'|'mic')} source
 *
 * @typedef {Object} InferenceProvider
 * @property {string} id      e.g. 'precomputed' | 'onnx'
 * @property {string} label   shown in the exhibit's mode indicator
 * @property {() => Promise<void>} ready
 *   Resolves when the provider can analyze (e.g. ONNX session created).
 * @property {(input: { clipId?: string, pcm?: Float32Array, label?: string, source?: string }) => Promise<AnalysisResult>} analyze
 *   Precomputed passes { clipId }; live mic passes { pcm }
 *   (48000 samples @ 16 kHz).
 * @property {string[]} [clipIds]  precomputed only: the bundled demo clips.
 */

export {};
