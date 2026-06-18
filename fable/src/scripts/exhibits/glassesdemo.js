/**
 * Fig. 02 — annotated demo video + the backend's real coordinator log,
 * one interaction. The log lines are SSR'd (ghosted) and brighten in sync
 * with the video: each line turns on when playback passes its `data-t`
 * timestamp, and a cursor trails the newest line. Scrubbing re-syncs.
 */
export default function init(root) {
  const video = root.querySelector('[data-gl-video]');
  const lines = [...root.querySelectorAll('.cl-line')];
  const cursor = root.querySelector('.cl-cursor');
  if (!video || !lines.length) return;

  function sync() {
    const t = video.currentTime;
    let last = null;
    for (const line of lines) {
      const on = t >= parseFloat(line.dataset.t);
      line.classList.toggle('is-on', on);
      if (on) last = line;
    }
    if (cursor) last ? last.after(cursor) : lines[0].before(cursor);
  }

  // currentTime updates a few times a second during playback; also catch
  // scrubbing, restart-after-end, and the initial paused state.
  video.addEventListener('timeupdate', sync);
  video.addEventListener('seeked', sync);
  video.addEventListener('play', sync);
  sync();
}
