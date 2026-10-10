'use strict';
/* EcomVideoStudio - timeline : règle, pistes (texte/emoji, vidéo, audio), glisser, rogner, transitions */

const tlInner = $('tlInner'), tlScroll = $('tlScroll');
const MIN_CLIP = 0.2;

function tickStep(pps) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find(s => s * pps >= 80) || 600;
}

function renderTimeline() {
  const P = state.project, pps = state.pps;
  tlInner.style.width = (PAD + Math.max(state.total + 10, 30) * pps + 160) + 'px';

  /* règle */
  const step = tickStep(pps), minor = step / (step >= 10 ? 5 : step >= 2 ? 2 : 1);
  const maxT = Math.max(state.total + 10, 30);
  let rh = '';
  for (let t = 0; t <= maxT; t += minor) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    rh += `<div class="tick${major ? ' major' : ''}" style="left:${PAD + t * pps}px">${major ? `<span>${fmtTime(t)}</span>` : ''}</div>`;
  }
  $('ruler').innerHTML = rh;

  const isSel = (k, id) => state.sel && state.sel.id === id && (state.sel.kind === k) ? ' selected' : '';

  /* piste principale */
  let h = '';
  if (!P.clips.length) h += '<div class="tl-empty">Cliquez sur ＋ sur une miniature de la bibliothèque pour ajouter un média ici</div>';
  P.clips.forEach((c, i) => {
    const m = mediaById(c.mediaId), left = PAD + c.start * pps, w = Math.max(8, c.dur * pps);
    const bg = m && m.thumb ? `background-image:url(${m.thumb});` : '';
    const fx = EVS.EFFECTS.find(e => e.id === c.effect);
    const tags = (c.speed !== 1 ? ' ×' + c.speed : '') + (c.type === 'video' && c.volume === 0 ? ' 🔇' : '');
    h += `<div class="clip ${c.type}${isSel('clip', c.id)}" data-kind="clip" data-id="${c.id}" style="left:${left}px;width:${w}px;${bg}">
      <div class="handle l" data-side="l"></div><div class="label">${esc(m ? m.name : '?')} · ${fmtDur(c.dur)}${tags}</div>
      ${fx && fx.id !== 'none' ? `<div class="fxbadge">✦ ${esc(fx.label)}</div>` : ''}<div class="handle r" data-side="r"></div></div>`;
  });
  P.clips.forEach((c, i) => {                                   // jonctions (transitions)
    if (i === 0) return;
    const prev = P.clips[i - 1], tr = prev.transition;
    const T = tr && EVS.TRANSITIONS.find(t => t.id === tr.type);
    const x = PAD + (c.start + c.td / 2) * pps;
    h += `<button class="junction${T ? ' has' : ''}${state.sel && state.sel.kind === 'junction' && state.sel.id === prev.id ? ' selected' : ''}" data-junction="${prev.id}" style="left:${x}px" title="${T ? 'Transition : ' + T.label : 'Ajouter une transition'}">${T ? T.icon : '＋'}</button>`;
  });
  $('trackMain').innerHTML = h;

  /* piste audio */
  h = '';
  P.audio.forEach(a => {
    const m = mediaById(a.mediaId), dur = a.out - a.in, left = PAD + a.start * pps, w = Math.max(8, dur * pps);
    h += `<div class="clip audio${isSel('audio', a.id)}" data-kind="audio" data-id="${a.id}" style="left:${left}px;width:${w}px">
      <canvas data-wave="${a.id}"></canvas><div class="handle l" data-side="l"></div><div class="label">♫ ${esc(m ? m.name : '?')}${a.volume === 0 ? ' 🔇' : ''}</div><div class="handle r" data-side="r"></div></div>`;
  });
  $('trackAudio').innerHTML = h;
  P.audio.forEach(a => {
    const cv = $('trackAudio').querySelector(`canvas[data-wave="${a.id}"]`), m = mediaById(a.mediaId);
    if (!cv || !m || !m.peaks || !m.peaks.length) return;
    const w = Math.min(4000, Math.max(8, Math.round((a.out - a.in) * pps))), hh = 36;
    cv.width = w; cv.height = hh;
    const g = cv.getContext('2d'); g.fillStyle = 'rgba(255,170,190,.75)';
    const i0 = a.in * 20, n = (a.out - a.in) * 20;
    for (let x = 0; x < w; x += 2) {
      const pk = m.peaks[Math.min(m.peaks.length - 1, Math.floor(i0 + x / w * n))] || 0;
      const bh = Math.max(1, pk * (hh - 6)); g.fillRect(x, (hh - bh) / 2, 1.4, bh);
    }
  });

  /* piste texte / emoji */
  h = '';
  P.overlays.forEach(o => {
    const left = PAD + o.start * pps, w = Math.max(8, o.dur * pps);
    const inner = o.kind === 'emoji'
      ? `<img src="${(window.EMOJI_SVG || {})[o.code] || ''}" alt=""><div class="label"></div>`
      : `<div class="label">T ${esc(String(o.text || '').split('\n')[0])}</div>`;
    h += `<div class="clip ${o.kind}${isSel('overlay', o.id)}" data-kind="overlay" data-id="${o.id}" style="left:${left}px;width:${w}px"><div class="handle l" data-side="l"></div>${inner}<div class="handle r" data-side="r"></div></div>`;
  });
  $('trackOver').innerHTML = h;
  $('playhead').style.left = (PAD + state.t * pps) + 'px';
}

function updateSelectionClasses() {
  tlInner.querySelectorAll('.clip').forEach(el => el.classList.toggle('selected', !!state.sel && state.sel.kind === el.dataset.kind && state.sel.id === el.dataset.id));
  tlInner.querySelectorAll('.junction').forEach(el => el.classList.toggle('selected', !!state.sel && state.sel.kind === 'junction' && state.sel.id === el.dataset.junction));
}

/* ---------- interactions ---------- */
tlInner.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('#ruler')) return;
  const jn = e.target.closest('.junction');
  if (jn) { select('junction', jn.dataset.junction); setPanel('transitions'); return; }
  const el = e.target.closest('.clip');
  if (!el) { if (state.sel) select(null); return; }
  const handle = e.target.closest('.handle');
  select(el.dataset.kind, el.dataset.id);
  startDrag(e, el.dataset.kind, el.dataset.id, handle ? handle.dataset.side : null);
});

function trimObj(kind, obj, orig, m, side, dt) {
  if (kind === 'clip') {
    const sp = orig.speed || 1;
    if (obj.type === 'image') {
      if (side === 'l') obj.out = Math.max(MIN_CLIP, orig.out - orig.in - dt);
      else obj.out = Math.max(MIN_CLIP, orig.out - orig.in + dt);
      obj.in = 0;
    } else if (side === 'l') obj.in = clamp(orig.in + dt * sp, 0, orig.out - MIN_CLIP * sp);
    else obj.out = clamp(orig.out + dt * sp, orig.in + MIN_CLIP * sp, m ? m.duration : orig.out);
  } else if (kind === 'audio') {
    if (side === 'l') { const d = clamp(dt, -orig.in, orig.out - orig.in - MIN_CLIP); obj.in = orig.in + d; obj.start = orig.start + d; }
    else obj.out = clamp(orig.out + dt, orig.in + MIN_CLIP, m ? m.duration : orig.out);
  } else if (kind === 'overlay') {
    if (side === 'l') { const d = clamp(dt, -orig.start, orig.dur - MIN_CLIP); obj.start = orig.start + d; obj.dur = orig.dur - d; }
    else obj.dur = Math.max(MIN_CLIP, orig.dur + dt);
  }
}
function reorderClip(obj, orig, dt) {
  const cs = state.project.clips, others = cs.filter(c => c !== obj);
  const center = orig.start + dt + obj.dur / 2;
  let cum = 0, idx = 0;
  others.forEach(o => { if (cum + o.dur / 2 < center) idx++; cum += o.dur; });
  cs.splice(cs.indexOf(obj), 1); cs.splice(idx, 0, obj);
}
function startDrag(e, kind, id, side) {
  const obj = getObj(kind, id); if (!obj) return;
  const orig = clone(obj), m = mediaById(obj.mediaId), x0 = e.clientX;
  let moved = false;
  const move = ev => {
    const dx = ev.clientX - x0;
    if (!moved) { if (Math.abs(dx) < 3) return; moved = true; pushHistory(); }
    const dt = dx / state.pps;
    if (side) trimObj(kind, obj, orig, m, side, dt);
    else if (kind === 'clip') reorderClip(obj, orig, dt);
    else obj.start = Math.max(0, orig.start + dt);
    relayout(); renderTimeline(); renderAt(state.t, false); updateTimeUI();
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    if (moved) { state.t = clamp(state.t, 0, state.total); renderInspector(); updateTimeUI(); }
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

/* règle : déplacer la tête de lecture */
$('ruler').addEventListener('pointerdown', e => {
  const at = ev => { const r = tlInner.getBoundingClientRect(); seek((ev.clientX - r.left - PAD) / state.pps); };
  at(e);
  const mv = ev => at(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
});

/* zoom */
$('zoom').addEventListener('input', e => { state.pps = +e.target.value; renderTimeline(); updateTimeUI(); });
tlScroll.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  state.pps = clamp(state.pps * (e.deltaY < 0 ? 1.15 : 0.87), 10, 200); $('zoom').value = state.pps;
  renderTimeline(); updateTimeUI();
}, { passive: false });

/* glisser une miniature depuis la bibliothèque vers la timeline */
['trackMain', 'trackAudio', 'trackOver'].forEach(id => {
  const el = $(id);
  el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/evs-media')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  el.addEventListener('drop', e => {
    const mid = e.dataTransfer.getData('text/evs-media'); if (!mid) return;
    e.preventDefault(); e.stopPropagation();
    const r = tlInner.getBoundingClientRect(), t = Math.max(0, (e.clientX - r.left - PAD) / state.pps);
    const m = mediaById(mid); if (!m) return;
    if (m.type === 'audio') { const keep = state.t; state.t = t; addToProject(mid); state.t = keep; refreshAll(); }
    else addToProject(mid);
  });
});
