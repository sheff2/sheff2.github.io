# PROGRESS

Status log for the portfolio ("The Calibration Sheet"). See README.md for full
design rationale and the inference roadmap details.

## Done — v1 (June 2026)

### Design system
- [x] Light lab-document theme: Anechoic `#EFEEEA` ground, Graphite `#1A1C20` ink,
      REC Red `#E5231B` reserved for detections/thresholds/active states,
      Baffle `#D8D6CF` borders, Foam `#8A8C88` secondary.
- [x] Type: Panchang (display, hero + section numerals only) ·
      General Sans (body) · Spline Sans Mono (instrument readouts).
- [x] Graticule-tick rules everywhere instead of hairlines; fixed left rail nav
      (top bar on mobile).
- [x] Signature element — "The Through-Line": hero waveform that the name
      resolves out of, returning as section dividers that get progressively more
      processed (waveform → mel bands → segments → states → flatline).

### Motion (GSAP + ScrollTrigger)
- [x] Hero load choreography (line draw → impulse → name resolve → copy fade).
- [x] Scroll reveals per section; one scrubbed element (Fig. 01 wipe-in).
- [x] Two micro-interactions: underline-draw links, corner level-meters on cards.
- [x] `gsap.matchMedia()` with full reduced-motion degradation (opacity/none).

### Exhibits (all lazy-loaded, keyboard operable, JSON + schemas)
- [x] Fig. 01 Wake-word: spectrogram viewer, scrub/play, sigmoid score gauge
      vs. 0.5 threshold, animated detection moment. Built on the
      `InferenceProvider` interface (`src/scripts/inference/`).
- [x] Fig. 02 Diarization: playable timeline, speaker lanes, live transcript,
      voice+face identity reconciliation panel, memory profile.
- [x] Fig. 03 PermitPal: latency race (local vs. API), PII-safe routing,
      bundle assembly with refused permissions.
- [x] Fig. 04 BioClock: restlessness slider → HR/accel traces → 3-state
      classifier + alarm logic.
- [x] Mentor-Match micro-exhibit: animated 6-node Gale–Shapley round.

### Content & infrastructure
- [x] Experience (Prudential, UF RWE), About/contact, footer.
- [x] Reusable `PaperCard` component (collapsible abstract, venue metadata,
      PDF link, copy-BibTeX) — wired up for the wake-word paper.
- [x] Deterministic data generator (`npm run data`) + JSON Schemas in
      `public/data/schemas/` so real model outputs drop in with no code changes.
- [x] Astro static build passing; exhibit chunks 1–3 KB gzip each; dev toolbar
      disabled; real report PDF at `public/papers/wakeword-transfer-learning.pdf`.

## Repositioning for general SWE roles (June 2026)

- [x] Shaun is targeting normal SWE roles, not audio/ML research. Identity
      copy broadened: hero now "software that ships: ML systems, real-time
      pipelines, full-stack apps"; kicker "input: ideas"; title/meta updated;
      About rewritten around shipping breadth. ALL signal-inspired graphics
      kept (hero waveform, through-line dividers, REC dot) as pure design.
- [x] Project tiers re-cut: full figures = 01 Wake Word · 02 Smart Glasses ·
      03 Mentor-Match (promoted from compact card; new narrative + exhibit
      panel) · 04 BioClock · 05 Taxi Tips. Appendix tier (2-col card grid) =
      Appendix A PermitPal + Appendix B X-Ray (Shaun rates PermitPal weaker
      than Mentor-Match; X-Ray exhibit was broken/synthetic anyway).
      Papers section unchanged (all 4 papers still listed).
- [x] Permitpal/XrayClassifier exhibit components + loaders unplugged
      (files remain on disk, unused). X-Ray can be re-promoted with a real
      exhibit if Shaun provides the notebook/real model outputs.

## Copy, accuracy & polish — June 2026 session

### Voice & accuracy (lessons learned, see memory/verify-against-source-papers.md)
- [x] All writeups rewritten in Shaun's own paper/notebook vernacular; every
      em dash removed from user-visible text (his rule: "not how I write";
      separators are `·`, empty readouts `–`). Red `.stat` spans kept for
      key numbers and phrases — he likes those.
- [x] Fabrications from earlier AI passes found and fixed: invented PaperCard
      abstracts (taxi, x-ray) replaced with real abstracts verbatim; x-ray
      paper title corrected to "Classifying Diseases from Chest X-Ray Scans
      using Convolutional Neural Networks"; wake-word authors fixed to
      L. Burchill, S. Heffernan, Y. Gelli (was "Yashwant", wrong name + order);
      project 01 title = paper title exactly.
- [x] Numbers must render at the paper's printed precision: taxi CIs now show
      4 decimals "(0.5301, 0.6764)" — 3-decimal rounding produced values that
      appear nowhere in the paper and Shaun caught it. Attribution precision:
      10-fold CV = linear, λ grid search = lasso.

### Fig. 01 UX
- [x] Demo clips in a uniform 2-col grid (odd last clip spans the row; labels
      shortened in JSON + exporter); Record = full-width REC-red button with
      pulsing dot. Record errors are now stage-specific (ONNX load vs mic
      permission vs no device) instead of one misleading catch-all.

### Layout & gotchas
- [x] About-section invisibility fixed: exhibits inject DOM after load, so
      ScrollTrigger reveal positions went stale and the last section could
      never fire. Loader now does a debounced ScrollTrigger.refresh() after
      each exhibit init. (GOTCHA — don't remove.)
- [x] Astro scoped <style> doesn't reach JS-created DOM — exhibit styles use
      <style is:global> with prefixed classes (ww-, tx-, ds-, appx-).
- [x] Papers section: 2×2 papers-grid (was full-width cards with huge right
      gaps); venues shortened to "· UF" so meta lines don't wrap.
- [x] Appendix cards upgraded from plain text boxes: red top border, mini SVG
      viz in house style (PermitPal latency race; X-Ray seeded heatmap), tech
      tag rows (Ollama · OpenAI API · LLM routing · RBAC / TensorFlow · CNN ·
      ChestMNIST · Adam), real facts from the x-ray paper (112,120 scans,
      test acc 0.9475, AUC 0.8235, class-imbalance lesson).

## Smart glasses section (June 2026, in progress)

- [x] Git-audited context generated inside the glasses repo →
      ml/SMART-GLASSES-CONTEXT.md. Found and fixed two false claims that were
      live on the site: transport is UDP with a 1-byte header (NOT WebSockets;
      the only WebSocket is the monitoring dashboard), and transcription RTF
      is 0.085 measured on the production path (NOT 0.8 — no trace of that
      figure anywhere; ~12x faster than real time, Apple M2, Parakeet on MLX).
- [x] Narrative rewritten from git-evidenced contributions: audio pipeline
      core (chunking, Silero VAD, Parakeet streaming, per-sentence ReDimNet
      embeddings w/ last-speaker bias), the APIWorker LLM agent, per-person
      chat logging, and the monitoring dashboard (wholly Shaun's: 1,387-line
      frontend + aiohttp/WebSocket server + print monkey-patch interceptor).
      "Memory profiles" claim removed — built but unmerged/not wired in.
      Diarization exhibit caption fixed too.
- [x] Demo embedded as ONE merged synced exhibit (June 2026): GlassesDemo.astro
      + glassesdemo.js. The annotated face video (HEVC -> H.264 yuv420p faststart
      MP4 + poster) with the VERBATIM real coordinator log printing directly
      underneath it, in sync with playback: each of 9 SSR'd log lines has a
      data-t video timestamp, ghosted at opacity 0.16 and brightening as the
      video passes it (REC red on the Unknown->Sean binding line, calibrated to
      ~4.6s where the on-screen box actually flips). One interaction: press play,
      both run together. Replaced an earlier split (Fig 02 video + Fig 02b
      full-width log) Shaun rejected: it gapped under the text and didn't print
      (CSS specificity bug: `:global(html.js) .cl-line` outranked `.cl-line.is-on`).
      Synthetic Diarization exhibit retired from the section (files on disk;
      main.js untouched, so a dead diarization chunk still builds but never loads).

## Next up

### 1. Additional ML projects with IEEE-style papers  ← COMPLETED
- [x] Collected 3 new projects: NYC Taxi Tips (regression), X-Ray Classification (CNN),
      Cargo Ships (satellite imagery classification) with PDFs in `public/papers/`.
- [x] Added 3 `PaperCard` components in Papers section with abstracts, BibTeX, venue info.
- [x] Created 2 full interactive exhibits for taxi + x-ray (both later found
      broken/synthetic and superseded: taxi rebuilt on real data as Fig. 05,
      x-ray demoted to Appendix B — see sections above).
- [x] Extended Through-Line progression: waveform → melbands → scatter (regression) →
      heatmap (neural attention) → segments (documentation) → states (resolved).
- [x] Added lazy-loaded exhibit modules: `taxitips.js` and `xrayclassifier.js` with
      synthetic JSON data and schemas for future real model integration.

### 2. Real data integration — Live model inference
- [x] **Wake-word detector (Fig. 01) — DONE (June 2026)**: the exhibit now runs
      the REAL transfer-learned CNN ("Go Gators", EEE4773 final project).
  - [x] Honest narrative reframe: transfer learning from Google Speech Commands
        + sigmoid classifier @ 0.5 (the old "autoencoder / reconstruction error"
        story was placeholder fiction).
  - [x] Split-model export: classifier → `public/models/wakeword-clf.onnx`
        (tf2onnx, opset 17, parity max |Δ| 3.6e-7 over 360 clips); Keras
        `MelSpectrogram` front-end reimplemented in `src/scripts/inference/mel.js`
        and validated against Python golden vectors (MAE ≤ 0.005 dB, score
        |Δ| ≤ 4e-5). Pipeline: `ml/wakeword/export_wakeword.py`,
        `verify_onnx.py`, `validate_mel.mjs`.
  - [x] Demo clips = real training recordings (incl. one real false positive)
        with real precomputed scores + playable 16 kHz WAVs.
  - [x] "Record 3 s" mode: onnxruntime-web (wasm, lazy-loaded) + AudioWorklet
        capture one 3 s window, score it locally, encode it as WAV for
        playback, release the mic; click again to re-test. (A "Your file"
        upload mode and a continuous live-mic mode were built then removed —
        user preferred the simple one-shot record/score flow.)
  - [x] Fig. 01b sub-figure: 48 kHz vs 16 kHz spectrum comparison + real F1
        table — the downsample-don't-upsample story. Spectrum-only (waveform
        view removed: the envelopes were indistinguishable by design and read
        as a bug). Measured FFT of the real wake-clear training recording, not
        an illustration. Full-width `subfigure` slot row below the project
        grid (canvas left, table + explainer right; stacks under 860px).
        Explainer uses Shaun's paper reasoning (16 kHz only carries up to
        8 kHz, "human voice recognition is still good on that frequency
        range") — the word "Nyquist" is not in his paper, so not on the site.
  - [x] Bundling: `import('onnxruntime-web/wasm')` + Vite
        `resolve.conditions: ['onnxruntime-web-use-extern-wasm']` keep the
        runtime wasm out of `_astro` (dist 50 MB → 24 MB); wasm served from
        `public/ort/` via `npm run prepare:ort` (auto-run by dev/build);
        `wasmPaths` must be an absolute URL or Vite dev intercepts it.
  - [x] Fixed `setupCanvas` (util.js): ResizeObserver fires once right after
        observe() and re-setting `canvas.width` erases the canvas — no-op
        resizes are now skipped, so one-time draws (spectrogram) persist.
  - Note: demo-clip scores are computed batch-1 because the Keras mel layer's
    top-db clamp is batch-global; browser inference is always batch-1.

### Backlog
- [ ] Sliding-window score-over-time curve for Fig. 01 (score trajectory as a
      longer clip streams through the 3 s window) — interesting upgrade to the
      single-score gauge.

### 2b. Real data integration — other exhibits
- [x] **NYC Taxi Tips (Fig. 05) — rebuilt on real data (June 2026)**
  - [x] Exhibit rebuilt around the paper's actual finding: feature selection.
        Coefficient chart of all 27 fitted features (Tables II–III), animated
        Linear ⇄ LASSO toggle (LASSO zeroes 15 of 27), R² CI strip (10-fold CV,
        95% CI), real metrics table (cv/test R², RMSE). The old broken
        slider/scatter exhibit (ctx.canvas bug, fake coefficients, redundant
        "Compare Both") is gone.
  - [x] Narrative/abstract/BibTeX rewritten in the paper's vernacular
        (pre-tip total, data leakage, multicollinearity, cash-tip cleaning,
        "taxi driver perspective"); real title "Predicting NYC Taxi Tips using
        Machine Learning"; real abstract.
  - [ ] Optional: live tip predictions need the fitted sklearn pipeline
        (scaler stats + intercept aren't in the paper) — requires the
        notebook/pickle files if Shaun wants that interaction back.
- [~] **X-Ray Classification**: now Appendix B (real paper facts on the card;
      paper read in full — see memory/xray-paper-facts.md). To re-promote it to
      a numbered figure, Shaun must provide the notebook/real model outputs;
      then rebuild an honest exhibit (per-class confusion data, threshold UI)
      with the Fig. 05 playbook.
- [ ] **Cargo Ships**: PaperCard abstract is still AI-written — verify
      title/abstract/venue against public/papers/cargo_ships.pdf (same audit
      as taxi/x-ray). Then optionally real dimensionality reduction analysis
  - [ ] Extract actual PCA components and variance explained
  - [ ] Use real model comparison results (Random Forest vs Logistic Regression)
  - [ ] Replace synthetic accuracy metrics with actual performance data

### 3. Ship
- [ ] Deploy `dist/` via GitHub Pages (Action or manual publish).
- [ ] Lighthouse pass on mobile (budget: 90+); verify font loading strategy.
