/** Fig. 02 — diarization timeline with cross-modal identity reconciliation. */
import { gsap } from 'gsap';
import { fetchJSON, setupCanvas, COLORS, MONO, reducedMotion } from './util.js';

const SPEAKER_STYLES = [
  { fill: COLORS.ink, pattern: null },
  { fill: COLORS.foam, pattern: null },
  { fill: COLORS.ink, pattern: 'hatch' },
];

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const tlC = setupCanvas(root.querySelector('[data-timeline]'));
  const scrub = root.querySelector('[data-scrub]');
  const playBtn = root.querySelector('[data-play]');
  const roTime = root.querySelector('[data-ro-time]');
  const roSpeaker = root.querySelector('[data-ro-speaker]');
  const transcript = root.querySelector('[data-transcript]');
  const ident = root.querySelector('[data-ident]');
  const identNote = root.querySelector('[data-ident-note]');
  const barVoice = root.querySelector('[data-bar-voice]');
  const barFace = root.querySelector('[data-bar-face]');
  const valVoice = root.querySelector('[data-val-voice]');
  const valFace = root.querySelector('[data-val-face]');
  const resolved = root.querySelector('[data-resolved]');
  const memory = root.querySelector('[data-memory]');
  const memoryList = root.querySelector('[data-memory-list]');

  const DUR = data.durationSec;
  scrub.max = String(Math.round(DUR * 10));
  let t = 0;
  let playing = false;
  let raf = null;
  let shownRecon = null;

  const styleFor = (id) => SPEAKER_STYLES[data.speakers.findIndex((s) => s.id === id) % SPEAKER_STYLES.length];

  function draw() {
    const { ctx, w, h } = tlC;
    const lanes = data.speakers.length;
    const top = 18;
    const laneH = (h - top - 24) / lanes;
    const x = (sec) => (sec / DUR) * w;
    ctx.clearRect(0, 0, w, h);

    ctx.font = MONO;
    data.speakers.forEach((s, i) => {
      const ly = top + i * laneH;
      ctx.fillStyle = COLORS.foam;
      ctx.fillText(s.name.toUpperCase(), 0, ly + laneH / 2 - 8);
      // lane baseline ticks
      ctx.fillStyle = COLORS.baffle;
      for (let px = 0; px < w; px += 9) ctx.fillRect(px, ly + laneH / 2 + 6, 1, 3);
    });

    // segments revealed up to playhead
    data.segments.forEach((seg) => {
      if (seg.start > t) return;
      const i = data.speakers.findIndex((s) => s.id === seg.speaker);
      const ly = top + i * laneH + laneH / 2;
      const x0 = x(seg.start);
      const x1 = x(Math.min(seg.end, t));
      const st = styleFor(seg.speaker);
      if (st.pattern === 'hatch') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, ly - 1, x1 - x0, 8);
        ctx.clip();
        ctx.strokeStyle = st.fill;
        ctx.lineWidth = 1.2;
        for (let hx = x0 - 8; hx < x1 + 8; hx += 5) {
          ctx.beginPath();
          ctx.moveTo(hx, ly + 9);
          ctx.lineTo(hx + 8, ly - 2);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = st.fill;
        ctx.fillRect(x0, ly - 1, Math.max(1, x1 - x0), 8);
      }
    });

    // reconciliation markers
    (data.reconciliation ?? []).forEach((rc) => {
      if (rc.t > t) return;
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.moveTo(x(rc.t), h - 16);
      ctx.lineTo(x(rc.t) - 4, h - 8);
      ctx.lineTo(x(rc.t) + 4, h - 8);
      ctx.fill();
    });

    // playhead
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x(t), top - 6);
    ctx.lineTo(x(t), h - 18);
    ctx.stroke();

    ctx.fillStyle = COLORS.foam;
    ctx.fillText('0 S', 0, h - 2);
    ctx.fillText(`${DUR.toFixed(0)} S`, w - 26, h - 2);
  }

  function update(sec) {
    t = Math.max(0, Math.min(sec, DUR));
    scrub.value = String(Math.round(t * 10));
    roTime.textContent = `t = ${t.toFixed(1)} s`;

    const seg = data.segments.find((s) => t >= s.start && t <= s.end);
    if (seg) {
      const sp = data.speakers.find((s) => s.id === seg.speaker);
      roSpeaker.textContent = `▮ ${sp.name} · ${sp.role}`;
      const chars = Math.floor(((t - seg.start) / (seg.end - seg.start)) * seg.text.length);
      transcript.textContent = `“${seg.text.slice(0, chars)}${chars < seg.text.length ? '…' : '”'}`;
    } else {
      roSpeaker.textContent = '–';
    }

    // most recent reconciliation event at or before t
    const rc = [...(data.reconciliation ?? [])].reverse().find((r) => r.t <= t);
    if (rc && rc !== shownRecon) {
      shownRecon = rc;
      ident.hidden = false;
      identNote.textContent = rc.note;
      barVoice.style.width = `${rc.voice.confidence * 100}%`;
      barFace.style.width = `${rc.face.confidence * 100}%`;
      valVoice.textContent = rc.voice.confidence.toFixed(2);
      valFace.textContent = rc.face.confidence > 0 ? rc.face.confidence.toFixed(2) : 'off-cam';
      resolved.textContent = `→ resolved: ${rc.resolved.person} (${rc.resolved.confidence.toFixed(2)})`;
      if (!reducedMotion()) {
        gsap.fromTo(resolved, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out' });
      }
    } else if (!rc) {
      shownRecon = null;
      ident.hidden = true;
    }

    // memory profile at the end
    const done = t >= DUR - 0.05;
    if (done && memory.hidden && data.memoryProfile) {
      memory.hidden = false;
      memoryList.innerHTML = '';
      data.memoryProfile.facts.forEach((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        memoryList.appendChild(li);
      });
      if (!reducedMotion()) {
        gsap.fromTo(memory, { opacity: 0 }, { opacity: 1, duration: 0.6 });
      }
    } else if (!done) {
      memory.hidden = true;
    }

    draw();
  }

  function stop() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    playBtn.textContent = 'Play ▸';
    playBtn.setAttribute('aria-pressed', 'false');
  }

  playBtn.addEventListener('click', () => {
    if (playing) return stop();
    playing = true;
    playBtn.textContent = 'Pause ⏸';
    playBtn.setAttribute('aria-pressed', 'true');
    if (t >= DUR - 0.05) update(0);
    let last = performance.now();
    const step = (now) => {
      if (!playing) return;
      update(t + (now - last) / 1000);
      last = now;
      if (t >= DUR) return stop();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  scrub.addEventListener('input', () => {
    stop();
    update(Number(scrub.value) / 10);
  });

  root.querySelector('[data-timeline]').addEventListener('exhibit:resize', draw);
  update(0);
}
