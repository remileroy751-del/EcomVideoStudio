'use strict';
/* EcomVideoStudio - lecteur : aperçu au format du projet, lecture de la timeline, transitions en direct, barre de lecture */

const stageEl = $('stage');
const canvas = $('overlayCanvas');
const cctx = canvas.getContext('2d');
let rafId = 0, lastNow = 0, playUntil = null;
const audioEls = new Map();

function makeLayer(id) {
  const el = $(id);
  const L = { el, media: el.querySelector('.lmedia'), video: el.querySelector('video'), img: el.querySelector('img'), vig: el.querySelector('.vig'), clipId: null, clipEnd: 0, pendingSeek: null };
  L.video.addEventListener('loadedmetadata', () => { if (L.pendingSeek != null) { try { L.video.currentTime = L.pendingSeek; } catch (e) { } L.pendingSeek = null; } });
  L.video.addEventListener('error', () => onVideoError(L));
  return L;
}
const layers = [makeLayer('layer0'), makeLayer('layer1')];

function onVideoError(L) {
  const c = state.project.clips.find(x => x.id === L.clipId); if (!c) return;
  const m = mediaById(c.mediaId);
  if (!m || m.proxyTried) return;
  m.proxyTried = true;
  toast('Format non lisible directement : préparation d\'un aperçu compatible…', 5000);
  window.ecom.makeProxy(m.path).then(px => { if (px) { m.previewPath = px; invalidateLayers(); toast('Aperçu prêt. L\'export utilisera le fichier original.'); } else toast('Aperçu impossible pour ce fichier (l\'export reste possible).', 5000); });
}
function invalidateLayers() { layers.forEach(L => { L.clipId = null; L.video.removeAttribute('data-u'); L.img.removeAttribute('data-u'); }); renderAt(state.t, state.playing); }

/* ---------- taille de la scène selon le format (9:16 / 16:9 / 4:5) ---------- */
function currentRatio() { return EVS.RATIOS.find(r => r.id === state.project.ratio) || EVS.RATIOS[0]; }
function fitStage() {
  const area = $('previewArea'), r = currentRatio();
  const aw = area.clientWidth - 28, ah = area.clientHeight - 28;
  if (aw <= 20 || ah <= 20) return;
  let w = aw, h = aw * r.h / r.w;
  if (h > ah) { h = ah; w = ah * r.w / r.h; }
  stageEl.style.width = Math.floor(w) + 'px'; stageEl.style.height = Math.floor(h) + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stageEl.clientWidth * dpr); canvas.height = Math.round(stageEl.clientHeight * dpr);
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlayCanvas();
}
new ResizeObserver(() => fitStage()).observe($('previewArea'));
OV.onLoad = () => drawOverlayCanvas();

function updateRatioUi() {
  const r = currentRatio();
  $('ratioLabel').textContent = r.label;
  const box = $('ratioIcon'); const k = 18 / Math.max(r.w, r.h);
  box.style.width = Math.round(r.w * k) + 'px'; box.style.height = Math.round(r.h * k) + 'px';
  $('ratioMenu').innerHTML = EVS.RATIOS.map(x => {
    const kk = 22 / Math.max(x.w, x.h);
    return `<button class="ratio-item" data-act="ratio" data-id="${x.id}"><span class="ric"><span class="rbox" style="width:${Math.round(x.w * kk)}px;height:${Math.round(x.h * kk)}px"></span></span><span><b>${x.label}</b><small>${x.hint}</small></span>${x.id === r.id ? '<span class="chk">✓</span>' : ''}</button>`;
  }).join('');
}

/* ---------- calque texte / emoji ---------- */
function drawOverlayCanvas(t) {
  const W = stageEl.clientWidth, H = stageEl.clientHeight; if (!W || !H) return;
  const sel = state.sel && state.sel.kind === 'overlay' ? state.sel.id : null;
  OV.drawAll(cctx, W, H, state.project.overlays, t == null ? state.t : t, sel);
}
(function bindCanvas() {
  let drag = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => {
    const p = pos(e), P = state.project;
    const selId = state.sel && state.sel.kind === 'overlay' ? state.sel.id : null;
    const hit = OV.hitTest(P.overlays, p.x, p.y, selId);
    if (!hit) { if (state.sel && state.sel.kind === 'overlay') select(null); return; }
    if (!selId || selId !== hit.id) select('overlay', hit.id);
    const ov = getObj('overlay', hit.id), b = OV.hits.get(hit.id);
    drag = { ov, mode: hit.handle ? 'scale' : 'move', ox: b.cx - p.x, oy: b.cy - p.y, d0: Math.hypot(p.x - b.cx, p.y - b.cy) || 1, s0: ov.size, cx: b.cx, cy: b.cy, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e), W = stageEl.clientWidth, H = stageEl.clientHeight;
    if (!drag) {
      const selId = state.sel && state.sel.kind === 'overlay' ? state.sel.id : null;
      const h = OV.hitTest(state.project.overlays, p.x, p.y, selId);
      canvas.style.cursor = h ? (h.handle ? 'nwse-resize' : 'move') : 'default';
      return;
    }
    if (!drag.moved) { drag.moved = true; pushHistory(); }
    if (drag.mode === 'move') { drag.ov.x = clamp((p.x + drag.ox) / W * 100, -10, 110); drag.ov.y = clamp((p.y + drag.oy) / H * 100, -10, 110); }
    else drag.ov.size = clamp(drag.s0 * Math.hypot(p.x - drag.cx, p.y - drag.cy) / drag.d0, 1.5, 60);
    drawOverlayCanvas();
  });
  const end = () => { if (drag && drag.moved) renderInspector(); drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', () => { const ta = $('inspector').querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } });
  canvas.addEventListener('wheel', e => {
    if (!state.sel || state.sel.kind !== 'overlay') return;
    e.preventDefault(); const ov = getSelObj(); if (!ov) return;
    beginEdit(ov.id + 'wheel'); ov.size = clamp(ov.size * (e.deltaY < 0 ? 1.06 : 0.94), 1.5, 60);
    drawOverlayCanvas(); renderInspector();
  }, { passive: false });
})();

/* ---------- liaison d'un clip à une couche vidéo ---------- */
function seekVideo(L, t) {
  if (L.video.readyState >= 1) { try { L.video.currentTime = t; } catch (e) { } } else L.pendingSeek = t;
}
function bindLayer(L, c) {
  const m = mediaById(c.mediaId);
  L.clipId = c.id; L.clipEnd = c.start + c.dur; L.pendingSeek = null;
  if (!m) return;
  const url = fileUrl(m.previewPath || m.path);
  if (c.type === 'image') {
    L.video.pause(); L.video.style.display = 'none'; L.img.style.display = 'block';
    if (L.img.dataset.u !== url) { L.img.src = url; L.img.dataset.u = url; }
  } else {
    L.img.style.display = 'none'; L.video.style.display = 'block';
    if (L.video.dataset.u !== url) { L.video.src = url; L.video.dataset.u = url; }
    seekVideo(L, c.in);
  }
}
function hideLayer(L) { L.el.style.visibility = 'hidden'; if (!L.video.paused) L.video.pause(); }

function showLayer(L, c, te, playing) {
  const P = state.project;
  L.el.style.visibility = 'visible';
  L.media.className = 'lmedia' + (P.fit === 'cover' ? ' cover' : '');
  const fx = EVS.EFFECTS.find(e => e.id === c.effect) || EVS.EFFECTS[0];
  const k = stageEl.clientHeight / EVS.canvasSize(P.ratio, 1080).h;
  L.media.style.filter = fx.css(k) || 'none';
  L.media.style.transform = fx.mirror ? 'scaleX(-1)' : 'none';
  L.vig.style.display = fx.vignette ? 'block' : 'none';
  if (c.type !== 'video') return;
  const v = L.video, srcT = c.in + (te - c.start) * c.speed;
  v.volume = clamp(c.volume, 0, 1);
  if (v.playbackRate !== c.speed) v.playbackRate = c.speed;
  if (playing) {
    if (v.paused) { if (Math.abs(v.currentTime - srcT) > 0.05) seekVideo(L, srcT); const pr = v.play(); if (pr && pr.catch) pr.catch(() => { }); }
    else if (Math.abs(v.currentTime - srcT) > 0.35) seekVideo(L, srcT);
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - srcT) > 0.03) seekVideo(L, srcT);
  }
}

/* ---------- transitions en direct (approximation CSS des filtres xfade) ---------- */
function resetTransitionStyles() {
  layers.forEach(L => { const s = L.el.style; s.opacity = ''; s.transform = ''; s.clipPath = ''; s.zIndex = ''; });
  stageEl.style.background = '#000';
}
function applyTransitionStyle(type, A, B, p) {
  const a = A.el.style, b = B.el.style, pc = p * 100;
  a.zIndex = 1; b.zIndex = 2; a.opacity = '1'; b.opacity = '1'; a.transform = 'none'; b.transform = 'none'; a.clipPath = 'none'; b.clipPath = 'none';
  stageEl.style.background = '#000';
  switch (type) {
    case 'fade': case 'dissolve': case 'pixelize': b.opacity = p; break;
    case 'fadeblack': case 'fadewhite':
      if (type === 'fadewhite') stageEl.style.background = '#fff';
      if (p < 0.5) { a.opacity = 1 - p * 2; b.opacity = 0; } else { a.opacity = 0; b.opacity = p * 2 - 1; } break;
    case 'slideleft': a.transform = `translateX(${-pc}%)`; b.transform = `translateX(${100 - pc}%)`; break;
    case 'slideright': a.transform = `translateX(${pc}%)`; b.transform = `translateX(${-(100 - pc)}%)`; break;
    case 'slideup': a.transform = `translateY(${-pc}%)`; b.transform = `translateY(${100 - pc}%)`; break;
    case 'slidedown': a.transform = `translateY(${pc}%)`; b.transform = `translateY(${-(100 - pc)}%)`; break;
    case 'wipeleft': b.clipPath = `inset(0 0 0 ${100 - pc}%)`; break;
    case 'wiperight': b.clipPath = `inset(0 ${100 - pc}% 0 0)`; break;
    case 'wipeup': b.clipPath = `inset(${100 - pc}% 0 0 0)`; break;
    case 'wipedown': b.clipPath = `inset(0 0 ${100 - pc}% 0)`; break;
    case 'circleopen': b.clipPath = `circle(${pc * 0.75}% at 50% 50%)`; break;
    case 'circleclose': a.zIndex = 2; b.zIndex = 1; a.clipPath = `circle(${(100 - pc) * 0.75}% at 50% 50%)`; break;
    case 'zoomin': a.zIndex = 2; b.zIndex = 1; a.transform = `scale(${1 + p * 0.8})`; a.opacity = 1 - p; break;
    default: b.opacity = p;
  }
}

/* ---------- rendu d'un instant t ---------- */
function renderAt(t, playing) {
  const P = state.project, clips = P.clips;
  $('emptyPreview').style.display = clips.length ? 'none' : 'grid';
  if (!clips.length) {
    layers.forEach(L => { hideLayer(L); L.clipId = null; });
    resetTransitionStyles(); syncAudio(t, playing); drawOverlayCanvas(t); return;
  }
  const te = Math.min(t, Math.max(0, state.total - 0.001));
  const act = [];
  clips.forEach((c, i) => { if (te >= c.start && te < c.start + c.dur) act.push(i); });

  layers.forEach(L => { if (L.clipId && !clips.some(c => c.id === L.clipId)) { hideLayer(L); L.clipId = null; } });
  clips.forEach((c, i) => {                                   // préchargement du clip suivant (1,5 s avant)
    if (te >= c.start - 1.5 && te < c.start + c.dur) {
      const L = layers[i % 2];
      if (L.clipId !== c.id && (!L.clipId || te >= L.clipEnd || act.includes(i))) bindLayer(L, c);
    }
  });
  layers.forEach(L => {
    const i = act.find(j => clips[j].id === L.clipId);
    if (i === undefined) hideLayer(L); else showLayer(L, clips[i], te, playing);
  });

  if (act.length === 2) {
    const ia = act[0], ib = act[1], B = clips[ib];
    const A = layers[ia % 2], Bl = layers[ib % 2];
    const tr = clips[ia].transition;
    if (tr && B.td > 0) applyTransitionStyle(tr.type, A, Bl, clamp((te - B.start) / B.td, 0, 1));
  } else resetTransitionStyles();

  syncAudio(te, playing);
  drawOverlayCanvas(t);
}

function syncAudio(te, playing) {
  const P = state.project;
  for (const [id, el] of audioEls) if (!P.audio.some(a => a.id === id)) { el.pause(); audioEls.delete(id); }
  P.audio.forEach(a => {
    const m = mediaById(a.mediaId); if (!m) return;
    let el = audioEls.get(a.id);
    const url = fileUrl(m.previewPath || m.path);
    if (!el) { el = new Audio(); el.preload = 'auto'; el.src = url; audioEls.set(a.id, el); }
    else if (el.dataset.u && el.dataset.u !== url) { el.src = url; }
    el.dataset.u = url;
    el.volume = clamp(a.volume, 0, 1);
    const inRange = te >= a.start && te < a.start + (a.out - a.in);
    if (inRange && playing) {
      const srcT = a.in + (te - a.start);
      if (el.paused) { try { el.currentTime = srcT; } catch (e) { } const pr = el.play(); if (pr && pr.catch) pr.catch(() => { }); }
      else if (Math.abs(el.currentTime - srcT) > 0.35) { try { el.currentTime = srcT; } catch (e) { } }
    } else if (!el.paused) el.pause();
  });
}

/* ---------- lecture ---------- */
function tick(now) {
  if (!state.playing) return;
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  state.t += dt;
  if (playUntil != null && state.t >= playUntil) { state.t = playUntil; pause(); return; }
  if (state.t >= state.total) { state.t = state.total; pause(); return; }
  renderAt(state.t, true); updateTimeUI();
  rafId = requestAnimationFrame(tick);
}
function play() {
  if (!state.total) { toast('Ajoutez d\'abord un média à la timeline (bouton ＋ sur une miniature).'); return; }
  if (state.t >= state.total - 0.05) state.t = 0;
  state.playing = true; lastNow = performance.now(); $('play').textContent = '⏸';
  rafId = requestAnimationFrame(tick);
}
function pause() {
  state.playing = false; playUntil = null; cancelAnimationFrame(rafId); $('play').textContent = '▶';
  renderAt(state.t, false); updateTimeUI();
}
const playPause = () => state.playing ? pause() : play();
function seek(t) {
  state.t = clamp(t, 0, state.total);
  renderAt(state.t, state.playing); updateTimeUI();
}

function updateTimeUI() {
  $('tcCur').textContent = fmtTime(state.t); $('tcTot').textContent = fmtTime(state.total);
  $('seekfill').style.width = (state.total ? state.t / state.total * 100 : 0) + '%';
  const x = PAD + state.t * state.pps;
  $('playhead').style.left = x + 'px';
  if (state.playing) {
    const sc = $('tlScroll');
    if (x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 60;
    else if (x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 60);
  }
}

/* ---------- barre de lecture : curseur, ratio, plein écran ---------- */
(function bindPlaybar() {
  const bar = $('seekbar');
  const at = e => { const r = bar.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * state.total); };
  bar.addEventListener('pointerdown', e => {
    at(e); const mv = ev => at(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  $('play').onclick = playPause;
  $('toStart').onclick = () => seek(0);
  $('toEnd').onclick = () => { pause(); seek(state.total); };
  $('ratioBtn').onclick = e => { e.stopPropagation(); $('ratioMenu').classList.toggle('hidden'); };
  document.addEventListener('click', e => { if (!e.target.closest('.ratio-wrap')) $('ratioMenu').classList.add('hidden'); });
  $('fullscreen').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen(); else $('previewArea').requestFullscreen().catch(() => { });
  };
  document.addEventListener('fullscreenchange', () => setTimeout(fitStage, 60));
})();
