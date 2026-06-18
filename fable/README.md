# Shaun Heffernan — Portfolio

A personal portfolio for an engineer working at the intersection of machine
learning, audio/signal processing, and real-time systems.

```
npm install
npm run data     # regenerate synthetic exhibit data (deterministic; not Fig. 01)
npm run dev      # local dev (copies the ONNX wasm runtime to public/ort/ first)
npm run build    # static export → dist/
```

Stack: **Astro** (static output) · **GSAP + ScrollTrigger** · hand-rolled CSS ·
vanilla JS exhibit modules, lazy-loaded per figure.

---

## Design rationale — "The Calibration Sheet"

The obvious move for an audio portfolio is a dark oscilloscope theme with a
glowing waveform. This site inverts it: a **paper-light lab document** — the
precision of a typeset IEEE paper crossed with the faceplate lettering of test
equipment. Signals appear as *plotted ink*, not glowing pixels, which matches
the identity the site argues for: research-grade ideas, shipped as software.

### Palette

| Name | Hex | Role |
|---|---|---|
| Anechoic | `#EFEEEA` | ground |
| Graphite | `#1A1C20` | ink, text, plotted signals |
| REC Red | `#E5231B` | the one loud thing: detections, thresholds, active states |
| Baffle | `#D8D6CF` | panel borders, ticks |
| Foam | `#8A8C88` | secondary text, axis labels |

Red is *reserved*: spectrograms render in an Anechoic→Graphite colormap so the
only red on a figure is the threshold, the detection, the playhead — the
moments that matter.

There are no hairline rules anywhere. Every divider and panel edge is a row of
**graticule ticks** (ruler/scope tick marks).

### Type

- **Panchang** (display) — wide, squared grotesque; reads like lettering
  milled into audio hardware. Used in exactly two places: the hero name and
  section numerals.
- **General Sans** (body) — quiet humanist grotesque for narrative copy.
- **Spline Sans Mono** (utility) — the "instrument readout" voice: figure
  labels, axis ticks, metadata, readouts.

### Signature element — "The Through-Line"

One continuous signal travels the page. It is born in the hero as a plotted
waveform (the load choreography draws it, fires an impulse, and the name
resolves out of its peaks), then reappears as every section divider,
*progressively more processed* as you scroll:

```
raw waveform → mel bands → diarized segments → classifier states → flatline (resolved)
```

The page itself is a DSP chain.

### Motion budget

- One choreographed load sequence (hero).
- Scroll reveals per section; **one** scrubbed element (Fig. 01 wipes in).
- Two micro-interactions: underline-draw on links, corner level-meters on cards.
- Everything runs through `gsap.matchMedia()`; under
  `prefers-reduced-motion: reduce` all animation degrades to opacity-only or
  none (a `reduced` class on `<html>` keeps content visible without JS motion).

### Performance & accessibility

- Each exhibit is a lazy module: an IntersectionObserver dynamic-imports its
  JS *and* fetches its JSON only when the figure approaches the viewport.
- ONNX Runtime is not in any bundle — it is dynamic-imported only when a
  visitor clicks "Record 3 s" in Fig. 01.
- Semantic landmarks, skip link, visible `:focus-visible` states, all exhibits
  operable by keyboard (native buttons + range inputs), `aria-live` readouts.

---

## Exhibit data

Exhibits run on static JSON in `public/data/`; each file conforms to a JSON
Schema in `public/data/schemas/`:

| Exhibit | Data | Source |
|---|---|---|
| Fig. 01 wake-word | `wakeword-clips.json` | **real model outputs** — `ml/wakeword/export_wakeword.py` |
| Fig. 01b downsampling | `wakeword-downsampling.json` | **real model outputs** — same exporter |
| Fig. 02 diarization | `diarization.json` | synthetic (`npm run data`) — real pipeline handles PHI |
| Fig. 03 PermitPal | `permitpal.json` | synthetic (`npm run data`) |
| Fig. 04 BioClock | `bioclock.json` | synthetic (`npm run data`) |
| Mentor-Match | `mentormatch.json` | synthetic (`npm run data`) |

---

## Real in-browser inference (Fig. 01 wake-word exhibit)

Fig. 01 runs the **real trained network** — a CNN pretrained on Google Speech
Commands and fine-tuned end-to-end on "Go Gators" (EEE4773 final project,
University of Florida). The exhibit UI talks only to a single interface,
defined in `src/scripts/inference/provider.js`:

```js
provider.ready()                       // resolves when the backend can analyze
provider.analyze({ clipId })           // demo clips (precomputed real scores)
provider.analyze({ pcm })              // "Record 3 s" — one mic window, local ONNX
// → { score, threshold, detected, melSpectrogram, melDbRange, waveform, … }
```

### Architecture: split model + JS mel front-end

`tf2onnx` cannot convert the Keras `MelSpectrogram` layer (`tf.signal.rfft`),
so the model is split:

- **Classifier** (mel-dB `(80, 301)` → conv stack → sigmoid) exported to
  `public/models/wakeword-clf.onnx` (~6.6 MB, opset 17) by
  `ml/wakeword/export_wakeword.py`. Parity vs Keras: max |Δscore| 3.6e-7
  over all 360 clips (`ml/wakeword/verify_onnx.py`).
- **Mel front-end** reimplemented dependency-free in
  `src/scripts/inference/mel.js` (reflect-padded 512-pt FFT, periodic Hann,
  HTK mel scale, 80 bins, `power_to_db` with top-db-80 clamp) and validated
  against Python golden vectors (`ml/wakeword/validate_mel.mjs`): mel MAE
  ≤ 0.005 dB, end-to-end score |Δ| ≤ 4e-5.

### The two modes

- **Demo clips** — real recordings from the training set, scored offline
  (batch-1, matching browser inference) with audio playback.
- **Record 3 s** — `getUserMedia` only from an explicit click; `onnxruntime-web`
  (wasm, single-threaded — GitHub Pages sends no COOP/COEP headers) + the
  model are fetched only on first use. One 3 s window is captured via an
  `AudioWorklet` (countdown in the status line), scored locally
  (mic → mel.js → ONNX), encoded as a WAV for playback, and the mic is
  released immediately. Click again to re-test.

`npm run prepare:ort` (run automatically by `dev`/`build`) copies the ort wasm
runtime from `node_modules` to `public/ort/`.

---

## Structure

```
src/
  pages/index.astro          single page: hero → work → experience → papers → about
  components/                Hero, Divider (through-line), Project, PaperCard
  components/exhibits/       static markup per figure
  scripts/main.js            GSAP orchestration + lazy exhibit loader
  scripts/exhibits/          one module per figure (wakeword, downsampling, …)
  scripts/inference/         provider interface · mel front-end · onnx · mic
scripts/generate-data.mjs    synthetic data generator (non-wakeword exhibits)
scripts/copy-ort-wasm.mjs    copies onnxruntime-web wasm → public/ort/
ml/wakeword/                 training artifacts + export/verify pipeline (not shipped)
public/data/                 exhibit JSON + schemas
public/models/               wakeword-clf.onnx (real trained classifier)
public/audio/wakeword/       real demo recordings (16 kHz WAV)
public/papers/               paper PDFs
```

To deploy on GitHub Pages, build and publish `dist/` (or point an Action at
this directory).
