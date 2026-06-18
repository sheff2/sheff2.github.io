/** Fig. 03 — PermitPal routing demo: latency race + bundle assembly. */
import { gsap } from 'gsap';
import { fetchJSON, reducedMotion } from './util.js';

export default async function init(root) {
  const data = await fetchJSON(root.dataset.src);
  const queryRow = root.querySelector('[data-queries]');
  const queryBox = root.querySelector('[data-query-box]');
  const runBtn = root.querySelector('[data-run]');
  const routeNote = root.querySelector('[data-route-note]');
  const laneLocal = root.querySelector('[data-lane-local]');
  const laneApi = root.querySelector('[data-lane-api]');
  const msLocal = root.querySelector('[data-ms-local]');
  const msApi = root.querySelector('[data-ms-api]');
  const bundle = root.querySelector('[data-bundle]');
  const bundleName = root.querySelector('[data-bundle-name]');
  const bundleList = root.querySelector('[data-bundle-list]');
  const exHead = root.querySelector('[data-excluded-head]');
  const exList = root.querySelector('[data-excluded-list]');
  const rowLocal = laneLocal.closest('.pp-lane');
  const rowApi = laneApi.closest('.pp-lane');

  let selected = null;
  let running = false;

  data.queries.forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = q.query.length > 34 ? q.query.slice(0, 32) + '…' : q.query;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      queryRow.querySelectorAll('.btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      selected = q;
      queryBox.textContent = `» ${q.query}`;
      runBtn.disabled = false;
      reset();
    });
    queryRow.appendChild(b);
  });

  function reset() {
    routeNote.textContent = '';
    laneLocal.style.width = '0%';
    laneApi.style.width = '0%';
    msLocal.textContent = '–';
    msApi.textContent = '–';
    rowLocal.classList.remove('is-winner', 'is-blocked');
    rowApi.classList.remove('is-winner', 'is-blocked');
    bundle.hidden = true;
  }

  function perm(p, excluded) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="scope">${p.scope} : ${p.action}</span><span class="why">${p.reason ?? ''}</span>`;
    if (excluded) li.classList.add('is-excluded');
    return li;
  }

  runBtn.addEventListener('click', () => {
    if (!selected || running) return;
    running = true;
    reset();
    const q = selected;
    const maxMs = Math.max(q.localMs, q.apiMs ?? 0);
    const scale = (ms) => `${(ms / maxMs) * 100}%`;
    const instant = reducedMotion();
    // race plays out at 1/3000 real speed: ~1.4s for the slow lane
    const dur = (ms) => (instant ? 0 : ms / 3000);

    const apiBlocked = q.apiMs === null;
    if (apiBlocked) rowApi.classList.add('is-blocked');

    const tl = gsap.timeline({
      onComplete: () => {
        running = false;
        (q.route === 'local' ? rowLocal : rowApi).classList.add('is-winner');
        routeNote.textContent = apiBlocked
          ? 'routed: local · PII-safe mode, request never leaves the building'
          : `routed: ${q.route} · ${Math.round(q.localMs / q.apiMs)}× faster than local`;

        bundle.hidden = false;
        bundleName.textContent = `bundle → ${q.bundle.name}`;
        bundleList.innerHTML = '';
        exList.innerHTML = '';
        q.bundle.permissions.forEach((p) => bundleList.appendChild(perm(p, false)));
        const hasExcluded = (q.bundle.excluded ?? []).length > 0;
        exHead.hidden = !hasExcluded;
        (q.bundle.excluded ?? []).forEach((p) => exList.appendChild(perm(p, true)));
        if (!instant) {
          gsap.from(bundle.querySelectorAll('li, [data-bundle-name]'), {
            opacity: 0, y: 8, stagger: 0.07, duration: 0.4, ease: 'power2.out',
          });
        }
      },
    });

    tl.to(laneLocal, {
      width: scale(q.localMs), duration: dur(q.localMs), ease: 'none',
      onUpdate: function () { msLocal.textContent = `${Math.round(this.progress() * q.localMs)} ms`; },
      onComplete: () => { msLocal.textContent = `${q.localMs} ms`; },
    }, 0);

    if (!apiBlocked) {
      tl.to(laneApi, {
        width: scale(q.apiMs), duration: dur(q.apiMs), ease: 'none',
        onUpdate: function () { msApi.textContent = `${Math.round(this.progress() * q.apiMs)} ms`; },
        onComplete: () => { msApi.textContent = `${q.apiMs} ms`; },
      }, 0);
    } else {
      msApi.textContent = 'blocked · pii';
    }
  });

  // preselect the first query so the exhibit reads as ready
  queryRow.querySelector('.btn')?.click();
}
