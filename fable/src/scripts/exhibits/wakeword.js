/**
 * Fig. 01 — wake-word detector ("Go Gators").
 *
 * Two ways in, one InferenceProvider contract:
 *   Demo clips — real recordings + real model scores, precomputed offline
 *   Record 3 s — one-shot mic capture scored in-browser
 *                (JS mel front-end + ONNX classifier), re-test at will
 */
import { gsap } from 'gsap';
import { fetchJSON, setupCanvas, heat, COLORS, MONO, reducedMotion } from './util.js';
import { createPrecomputedProvider } from '../inference/precomputed.js';

const SCRUB_STEPS = 300;

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const demo = createPrecomputedProvider(data);
  await demo.ready();

  const specC = setupCanvas(root.querySelector('[data-spec]'));
  const gaugeC = setupCanvas(root.querySelector('[data-gauge]'));
  const scrub = root.querySelector('[data-scrub]');
  const scrubLabel = root.querySelector('[data-scrub-label]');
  const playBtn = root.querySelector('[data-play]');
  const roTime = root.querySelector('[data-ro-time]');
  const roScore = root.querySelector('[data-ro-score]');
  const roState = root.querySelector('[data-ro-state]');
  const clipRow = root.querySelector('[data-clips]');
  const modeLabel = root.querySelector('[data-mode-label]');
  const status = root.querySelector('[data-status]');
  const recBtn = root.querySelector('[data-record]');

  const audio = new Audio();
  audio.preload = 'auto';

  let result = null;
  let displayScore = 0; // animated gauge value
  let raf = null;
  let announced = false;
  let onnxProvider = null;
  let objectUrl = null;
  let scoreTween = null;

  /* ---------- status line ---------- */
  function setStatus(msg) {
    status.hidden = !msg;
    status.textContent = msg || '';
  }

  /* ---------- spectrogram ---------- */
  function drawSpec(playFrac = currentFrac()) {
    const { ctx, w, h } = specC;
    ctx.clearRect(0, 0, w, h);
    if (!result) return;
    const mel = result.melSpectrogram;
    const fw = w / mel.length;
    const nMels = mel[0].length;
    const fh = (h - 14) / nMels;
    for (let f = 0; f < mel.length; f++) {
      for (let m = 0; m < nMels; m++) {
        ctx.fillStyle = heat(mel[f][m]);
        // low mel bins at the bottom, like a real spectrogram
        ctx.fillRect(f * fw, 14 + (nMels - 1 - m) * fh, fw + 0.5, fh + 0.5);
      }
    }
    // playhead over the analyzed window
    if (playFrac != null && result.audioUrl) {
      const px = playFrac * w;
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, 14);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    ctx.font = MONO;
    ctx.fillStyle = COLORS.foam;
    ctx.fillText('MEL SPECTROGRAM · 80 BINS · 10 MS HOP · 3 S WINDOW', 0, 9);
  }

  /* ---------- score gauge ---------- */
  function drawGauge() {
    const { ctx, w, h } = gaugeC;
    ctx.clearRect(0, 0, w, h);
    if (!result) return;
    const top = 22;
    const barH = 20;
    const thX = result.threshold * w;
    const hot = displayScore > result.threshold;

    // track
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, top, w, barH);
    ctx.strokeStyle = COLORS.baffle;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, top + 0.5, w - 1, barH - 1);

    // fill
    ctx.fillStyle = hot ? COLORS.red : COLORS.ink;
    ctx.fillRect(0, top, Math.max(displayScore * w, 0), barH);

    // threshold tick
    ctx.strokeStyle = COLORS.red;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(thX, top - 6);
    ctx.lineTo(thX, top + barH + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = MONO;
    ctx.fillStyle = COLORS.foam;
    ctx.fillText('DETECTION SCORE · sigmoid(CNN)', 0, 10);
    ctx.fillStyle = COLORS.red;
    const tLabel = `THRESHOLD ${result.threshold.toFixed(2)}`;
    const tw = ctx.measureText(tLabel).width;
    ctx.fillText(tLabel, Math.min(thX + 6, w - tw), 10);
  }

  /* ---------- result presentation ---------- */
  function showResult(next, { animate = true } = {}) {
    result = next;
    announced = false;
    scoreTween?.kill();
    drawSpec(0);
    roScore.textContent = `p = ${result.score.toFixed(3)}`;

    const finish = () => {
      if (result.detected) {
        roState.textContent = '● wake word detected';
        roState.classList.add('is-hot');
        if (!announced) {
          announced = true;
          if (!reducedMotion()) {
            gsap.fromTo(roState, { scale: 1.25, transformOrigin: 'left center' }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)' });
            gsap.fromTo(root, { boxShadow: 'inset 0 0 0 2px rgba(229,35,27,0.9)' }, { boxShadow: 'inset 0 0 0 2px rgba(229,35,27,0)', duration: 0.9, ease: 'power2.out' });
          }
        }
      } else {
        roState.textContent = `no wake word: score under ${result.threshold.toFixed(1)}`;
        roState.classList.remove('is-hot');
      }
    };

    if (animate && !reducedMotion()) {
      const o = { v: displayScore };
      scoreTween = gsap.to(o, {
        v: result.score,
        duration: 0.7,
        ease: 'power3.out',
        onUpdate: () => {
          displayScore = o.v;
          drawGauge();
        },
        onComplete: finish,
      });
    } else {
      displayScore = result.score;
      drawGauge();
      finish();
    }
  }

  /* ---------- audio transport ---------- */
  function currentFrac() {
    if (!result?.audioUrl || !audio.duration) return 0;
    return Math.min(audio.currentTime / audio.duration, 1);
  }

  function tick() {
    const frac = currentFrac();
    scrub.value = String(Math.round(frac * SCRUB_STEPS));
    roTime.textContent = `t = ${(audio.currentTime || 0).toFixed(2)} s`;
    drawSpec(frac);
    if (!audio.paused && !audio.ended) {
      raf = requestAnimationFrame(tick);
    } else if (audio.ended) {
      stopPlayback();
    }
  }

  function stopPlayback() {
    audio.pause();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    playBtn.textContent = 'Play ▸';
    playBtn.setAttribute('aria-pressed', 'false');
  }

  playBtn.addEventListener('click', () => {
    if (!result?.audioUrl) return;
    if (!audio.paused) return stopPlayback();
    if (audio.ended) audio.currentTime = 0;
    audio.play().then(() => {
      playBtn.textContent = 'Pause ⏸';
      playBtn.setAttribute('aria-pressed', 'true');
      raf = requestAnimationFrame(tick);
    }).catch(() => setStatus('Audio playback failed.'));
  });

  scrub.addEventListener('input', () => {
    if (!result?.audioUrl || !audio.duration) return;
    stopPlayback();
    audio.currentTime = (Number(scrub.value) / SCRUB_STEPS) * audio.duration;
    roTime.textContent = `t = ${audio.currentTime.toFixed(2)} s`;
    drawSpec(currentFrac());
  });

  function setTransportEnabled(on) {
    playBtn.disabled = !on;
    scrub.disabled = !on;
    playBtn.parentElement.style.opacity = on ? '' : '0.5';
    scrubLabel.style.opacity = on ? '' : '0.5';
  }

  function loadAudio(url) {
    stopPlayback();
    audio.src = url || '';
    scrub.value = '0';
    roTime.textContent = 't = 0.00 s';
    setTransportEnabled(Boolean(url));
  }

  /* ---------- demo clips ---------- */
  demo.clips.forEach((clip, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = clip.label;
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', () => selectClip(clip.id, b));
    clipRow.appendChild(b);
  });

  async function selectClip(clipId, btn) {
    clipRow.querySelectorAll('.btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn?.setAttribute('aria-pressed', 'true');
    modeLabel.textContent = 'mode: precomputed';
    setStatus('');
    const res = await demo.analyze({ clipId });
    loadAudio(res.audioUrl);
    showResult(res);
  }

  /* ---------- record 3 s & score (onnx) ---------- */
  async function getOnnx() {
    if (!onnxProvider) {
      setStatus('Loading ONNX runtime + model (one-time, ~8 MB)…');
      const { createOnnxProvider } = await import('../inference/onnx.js');
      onnxProvider = createOnnxProvider();
    }
    await onnxProvider.ready();
    setStatus('');
    return onnxProvider;
  }

  async function recordAndScore() {
    recBtn.disabled = true;
    stopPlayback();
    try {
      let provider, mic;
      try {
        [provider, mic] = await Promise.all([getOnnx(), import('../inference/mic.js')]);
      } catch (err) {
        console.error('wakeword: runtime/model load failed', err);
        setStatus('Could not load the ONNX runtime or model. See the browser console.');
        return;
      }
      clipRow.querySelectorAll('.btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      modeLabel.textContent = 'mode: onnx · your mic';
      roState.textContent = 'recording…';
      roState.classList.remove('is-hot');
      const pcm = await mic.recordClip({
        onTick: (s) => setStatus(`● recording · say “Go Gators” (${s}…)`),
      });
      setStatus('Scoring in your browser…');
      const res = await provider.analyze({ pcm, label: 'your recording', source: 'mic' });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(mic.pcmToWavBlob(pcm));
      res.audioUrl = objectUrl;
      loadAudio(objectUrl);
      showResult(res);
      setStatus('Scored locally. Nothing was uploaded. Record again to re-test.');
    } catch (err) {
      console.error('wakeword recording failed', err);
      const name = err?.name;
      setStatus(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission denied. Allow mic access for this site, then click again.'
          : name === 'NotFoundError' || name === 'NotReadableError'
            ? 'No usable microphone found (is another app holding it?).'
            : `Recording failed: ${err?.message ?? err}`
      );
    } finally {
      recBtn.disabled = false;
    }
  }

  recBtn.addEventListener('click', recordAndScore);

  root.querySelector('[data-spec]').addEventListener('exhibit:resize', () => drawSpec());
  root.querySelector('[data-gauge]').addEventListener('exhibit:resize', drawGauge);

  await selectClip(demo.clipIds[0], clipRow.querySelector('.btn'));
}
