'use strict';
/* EcomVideoStudio - cœur : état du projet, historique, bibliothèque de médias, opérations de montage */

const $ = id => document.getElementById(id);
const FPS = 30;
const PAD = 14; // marge gauche de la timeline (px)

const state = {
  media: [],              // bibliothèque importée (miniatures)
  project: null,          // { ratio, fit, clips[], audio[], overlays[] }
  sel: null,              // { kind: 'clip'|'audio'|'overlay'|'junction', id }
  t: 0, total: 0, playing: false,
  panel: 'media', pps: 50,
  selMedia: null, transDur: 0.6, emojiCat: 'smileys', exportQ: '1080', lastExport: null
};
const newProject = () => ({ version: 2, ratio: '9:16', fit: 'contain', clips: [], audio: [], overlays: [] });
state.project = newProject();

let _uid = 0;
const nid = p => p + Date.now().toString(36) + (++_uid);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

function fmtTime(s) {
  s = Math.max(0, Number(s) || 0);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function fmtDur(s) { return s >= 10 ? Math.round(s) + 's' : (Math.round(s * 10) / 10) + 's'; }

function fileUrl(p) {
  const q = String(p).replace(/\\/g, '/');
  const u = q.split('/').map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s)) ? s : encodeURIComponent(s)).join('/');
  return q.startsWith('/') ? 'file://' + u : 'file:///' + u;
}
function toast(msg, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.add('hidden'), ms);
}
const setStatus = s => { $('status').textContent = s; };

const EXT = {
  video: /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|mpeg|mpg|3gp)$/i,
  audio: /\.(mp3|wav|aac|m4a|ogg|flac)$/i,
  image: /\.(png|jpe?g|webp|bmp)$/i
};
const PROXY_EXT = /\.(avi|wmv|flv|mpeg|mpg)$/i;

const mediaById = id => state.media.find(m => m.id === id);
const isMediaUsed = id => state.project.clips.some(c => c.mediaId === id) || state.project.audio.some(a => a.mediaId === id);

/* ---------- durées / mise en page ---------- */
const clipDur = c => Math.max(0.05, (c.out - c.in) / (c.speed || 1));
function relayout() {
  const P = state.project;
  P.clips.forEach(c => { c.dur = clipDur(c); });
  state.total = EVS.layoutClips(P.clips);
}
function clipAt(t) {
  const cs = state.project.clips;
  for (let i = cs.length - 1; i >= 0; i--) if (t >= cs[i].start - 1e-6 && t < cs[i].start + cs[i].dur) return cs[i];
  return cs.length && t >= state.total ? cs[cs.length - 1] : null;
}
function getObj(kind, id) {
  const P = state.project;
  if (kind === 'clip' || kind === 'junction') return P.clips.find(c => c.id === id);
  if (kind === 'audio') return P.audio.find(a => a.id === id);
  if (kind === 'overlay') return P.overlays.find(o => o.id === id);
  return null;
}
const getSelObj = () => state.sel ? getObj(state.sel.kind, state.sel.id) : null;

/* ---------- historique (annuler / rétablir) ---------- */
const hist = { undo: [], redo: [] };
let editTag = '', editTime = 0;
function pushHistory() {
  hist.undo.push(JSON.stringify(state.project));
  if (hist.undo.length > 100) hist.undo.shift();
  hist.redo.length = 0; updateUndoUi();
}
/** regroupe les modifications successives d'un même champ en une seule étape d'annulation */
function beginEdit(tag) {
  const now = Date.now();
  if (editTag !== tag || now - editTime > 1200) pushHistory();
  editTag = tag; editTime = now;
}
function undo() {
  if (!hist.undo.length) return;
  hist.redo.push(JSON.stringify(state.project));
  state.project = JSON.parse(hist.undo.pop()); afterHistory();
}
function redo() {
  if (!hist.redo.length) return;
  hist.undo.push(JSON.stringify(state.project));
  state.project = JSON.parse(hist.redo.pop()); afterHistory();
}
function afterHistory() { fitStage(); refreshAll({ panels: true }); updateRatioUi(); }
function updateUndoUi() { $('undoBtn').disabled = !hist.undo.length; $('redoBtn').disabled = !hist.redo.length; }

/* ---------- rafraîchissement global ---------- */
function validateSelection() {
  if (!state.sel) return;
  if (!getObj(state.sel.kind, state.sel.id)) state.sel = null;
}
function refreshAll(o = {}) {
  relayout();
  state.t = clamp(state.t, 0, state.total);
  validateSelection();
  renderTimeline();
  renderInspector();
  if (o.panels) renderPanel();
  renderAt(state.t, state.playing);
  updateTimeUI(); updateUndoUi();
}
function select(kind, id) {
  state.sel = kind ? { kind, id } : null;
  updateSelectionClasses();
  renderInspector();
  renderAt(state.t, state.playing);
  if (state.panel === 'effects' || state.panel === 'transitions') renderPanel();
}

/* ---------- bibliothèque : import + miniatures ---------- */
async function importPaths(paths) {
  const ok = (paths || []).filter(p => EXT.video.test(p) || EXT.audio.test(p) || EXT.image.test(p));
  if (paths && paths.length && !ok.length) { toast('Format non pris en charge.'); return; }
  const jobs = [];
  for (const p of ok) {
    if (state.media.some(m => m.path === p)) continue;
    const item = {
      id: nid('m'), path: p, name: p.split(/[\\/]/).pop(),
      type: EXT.audio.test(p) ? 'audio' : EXT.image.test(p) ? 'image' : 'video',
      duration: 0, thumb: null, loading: true
    };
    state.media.push(item);
    jobs.push(item);
  }
  renderMediaPanels();
  for (const item of jobs) {
    await hydrateMedia(item);
    if (item.missing) {
      state.media = state.media.filter(m => m !== item);
      renderMediaPanels();
      toast('Impossible de lire « ' + item.name + ' » (' + (item.error || 'format non reconnu') + ').');
    }
  }
  if (jobs.length) setStatus(jobs.length + ' média(s) importé(s) — cliquez sur ＋ pour les ajouter au projet');
}

async function hydrateMedia(item) {
  const pr = await window.ecom.probe(item.path);
  if (!pr || !pr.ok) { item.loading = false; item.missing = true; item.error = pr && pr.error; renderMediaPanels(); return; }
  Object.assign(item, { type: pr.type, duration: pr.duration, hasAudio: pr.hasAudio, width: pr.width, height: pr.height, loading: false, missing: false });
  renderMediaPanels();
  window.ecom.thumbnail(item.path, item.type, item.duration).then(t => { item.thumb = t; renderMediaPanels(); renderTimeline(); if (state.panel === 'effects') renderPanel(); });
  if (item.type === 'audio') window.ecom.waveform(item.path).then(pk => { item.peaks = pk; renderTimeline(); });
  if (PROXY_EXT.test(item.path)) window.ecom.makeProxy(item.path).then(px => { if (px) { item.previewPath = px; invalidateLayers(); } });
}

function removeFromLibrary(id) {
  const m = mediaById(id); if (!m) return;
  if (isMediaUsed(id)) {
    if (!confirm('« ' + m.name + ' » est utilisé dans le projet. Le retirer supprimera aussi ses clips de la timeline. Continuer ?')) return;
    pushHistory();
    const P = state.project;
    P.clips = P.clips.filter(c => c.mediaId !== id); P.audio = P.audio.filter(a => a.mediaId !== id);
  }
  state.media = state.media.filter(x => x.id !== id);
  if (state.selMedia === id) state.selMedia = null;
  refreshAll({ panels: true });
}

/* ---------- ajout au projet ---------- */
function addToProject(mediaId) {
  const m = mediaById(mediaId), P = state.project;
  if (!m || m.loading || m.missing) return;
  pushHistory();
  if (m.type === 'audio') {
    P.audio.push({ id: nid('a'), mediaId, start: Math.min(state.t, Math.max(0, state.total)), in: 0, out: m.duration, volume: 1 });
    state.sel = { kind: 'audio', id: P.audio[P.audio.length - 1].id };
    setStatus('Audio ajouté à la tête de lecture');
  } else {
    const first = P.clips.length === 0;
    const c = { id: nid('c'), mediaId, type: m.type, in: 0, out: m.type === 'image' ? 5 : m.duration, speed: 1, volume: 1, effect: 'none', transition: null };
    P.clips.push(c);
    state.sel = { kind: 'clip', id: c.id };
    if (first) {
      const r = EVS.nearestRatio(m.width, m.height);
      if (r !== P.ratio) { P.ratio = r; fitStage(); updateRatioUi(); toast('Format du projet réglé sur ' + r + ' d\'après votre média. Modifiable via le bouton « Ratio ».'); }
      state.t = 0;
    }
    setStatus('Clip ajouté à la timeline');
  }
  refreshAll({ panels: true });
}

function setRatio(id) {
  const P = state.project; if (P.ratio === id) return;
  pushHistory(); P.ratio = id; fitStage(); updateRatioUi(); refreshAll();
  setStatus('Format du projet : ' + id);
}
function setFit(f) {
  const P = state.project; if (P.fit === f) return;
  pushHistory(); P.fit = f; refreshAll();
}

/* ---------- texte / emoji ---------- */
const TEXT_PRESETS = [
  { name: 'Titre', font: 'Arial Black', size: 8, color: '#ffffff', bold: false, strokeW: 6, strokeColor: '#000000', y: 40 },
  { name: 'Impact jaune', font: 'Impact', size: 9, color: '#ffe600', bold: false, strokeW: 9, strokeColor: '#000000', y: 50 },
  { name: 'Sous-titre', font: 'Segoe UI', size: 4.6, color: '#ffffff', bold: true, strokeW: 0, shadow: true, y: 70 },
  { name: 'Légende', font: 'Segoe UI', size: 4.2, color: '#ffffff', bold: true, strokeW: 0, bgOn: true, bgColor: '#000000', bgAlpha: 0.7, y: 82 },
  { name: 'Promo', font: 'Arial Black', size: 6, color: '#ffffff', bold: false, strokeW: 0, bgOn: true, bgColor: '#e0143c', bgAlpha: 1, y: 30 },
  { name: 'Néon', font: 'Trebuchet MS', size: 7, color: '#ff4fd8', bold: true, strokeW: 7, strokeColor: '#5a0a78', shadow: true, y: 50 },
  { name: 'Élégant', font: 'Georgia', size: 6, color: '#ffffff', bold: false, italic: true, strokeW: 0, shadow: true, y: 50 },
  { name: 'Prix', font: 'Impact', size: 12, color: '#00e676', bold: false, strokeW: 8, strokeColor: '#000000', y: 55 }
];
function makeTextOverlay(p) {
  return Object.assign({
    id: nid('o'), kind: 'text', text: 'Votre texte', start: Math.min(state.t, state.total), dur: 3,
    x: 50, y: 50, size: 6, rot: 0, fade: true, font: 'Arial', color: '#ffffff', bold: true, italic: false,
    strokeW: 0, strokeColor: '#000000', bgOn: false, bgColor: '#000000', bgAlpha: 0.6, shadow: false
  }, p || {});
}
function addText(presetIdx, text) {
  const P = state.project; pushHistory();
  const p = TEXT_PRESETS[presetIdx] || TEXT_PRESETS[0];
  const o = makeTextOverlay(Object.assign({}, p, { name: undefined }));
  if (text) o.text = text;
  P.overlays.push(o); state.sel = { kind: 'overlay', id: o.id };
  refreshAll();
  setStatus('Texte ajouté — glissez-le dans l\'aperçu, modifiez-le à droite');
  setTimeout(() => { const ta = $('inspector').querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }, 30);
}
function addEmoji(code) {
  const P = state.project; pushHistory();
  const n = P.overlays.filter(o => o.kind === 'emoji').length;
  const o = { id: nid('o'), kind: 'emoji', code, start: Math.min(state.t, state.total), dur: 3, x: 50 + ((n % 5) - 2) * 7, y: 42 + ((n % 3) - 1) * 6, size: 14, rot: 0, fade: false };
  P.overlays.push(o); state.sel = { kind: 'overlay', id: o.id };
  refreshAll();
}

/* ---------- découpe / suppression / duplication ---------- */
function splitObj(kind, obj, t) {
  const P = state.project, MIN = 0.1;
  if (kind === 'clip') {
    if (t - obj.start < MIN || obj.start + obj.dur - t < MIN) return false;
    const right = clone(obj); right.id = nid('c');
    if (obj.type === 'image') {
      const cut = t - obj.start; right.in = 0; right.out = obj.dur - cut; obj.in = 0; obj.out = cut;
    } else {
      const cut = obj.in + (t - obj.start) * obj.speed; right.in = cut; obj.out = cut;
    }
    right.transition = obj.transition; obj.transition = null;
    P.clips.splice(P.clips.indexOf(obj) + 1, 0, right);
    state.sel = { kind: 'clip', id: right.id }; return true;
  }
  if (kind === 'audio') {
    const dur = obj.out - obj.in;
    if (t - obj.start < MIN || obj.start + dur - t < MIN) return false;
    const right = clone(obj); right.id = nid('a'); const cut = obj.in + (t - obj.start);
    right.start = t; right.in = cut; obj.out = cut;
    P.audio.splice(P.audio.indexOf(obj) + 1, 0, right); state.sel = { kind: 'audio', id: right.id }; return true;
  }
  if (kind === 'overlay') {
    if (t - obj.start < MIN || obj.start + obj.dur - t < MIN) return false;
    const right = clone(obj); right.id = nid('o'); right.start = t; right.dur = obj.dur - (t - obj.start); obj.dur = t - obj.start;
    P.overlays.splice(P.overlays.indexOf(obj) + 1, 0, right); state.sel = { kind: 'overlay', id: right.id }; return true;
  }
  return false;
}
function splitAtPlayhead() {
  const P = state.project, t = state.t;
  let kind, obj;
  if (state.sel && state.sel.kind !== 'junction') { kind = state.sel.kind; obj = getSelObj(); }
  else { obj = clipAt(t); kind = 'clip'; }
  if (!obj) { toast('Sélectionnez un clip ou placez la tête de lecture sur un clip.'); return; }
  pushHistory();
  if (!splitObj(kind, obj, t)) { hist.undo.pop(); updateUndoUi(); toast('Placez la tête de lecture à l\'intérieur du clip pour le couper.'); return; }
  refreshAll(); setStatus('Clip coupé à ' + fmtTime(t));
}
function deleteSelected() {
  const s = state.sel, P = state.project;
  if (!s) { toast('Sélectionnez d\'abord un élément dans la timeline.'); return; }
  pushHistory();
  if (s.kind === 'junction') { const c = getObj('junction', s.id); if (c) c.transition = null; state.sel = null; }
  else {
    const list = s.kind === 'clip' ? P.clips : s.kind === 'audio' ? P.audio : P.overlays;
    const i = list.findIndex(x => x.id === s.id); if (i >= 0) list.splice(i, 1);
    state.sel = null;
  }
  refreshAll({ panels: true });
}
function duplicateSelected() {
  const o = getSelObj(); if (!o || state.sel.kind === 'junction') return;
  pushHistory(); const P = state.project, k = state.sel.kind;
  const c = clone(o);
  if (k === 'overlay') { c.id = nid('o'); c.start = o.start + o.dur; c.x = clamp(o.x + 4, 0, 100); c.y = clamp(o.y + 4, 0, 100); P.overlays.push(c); }
  else if (k === 'audio') { c.id = nid('a'); c.start = o.start + (o.out - o.in); P.audio.push(c); }
  else { c.id = nid('c'); c.transition = null; P.clips.splice(P.clips.indexOf(o) + 1, 0, c); }
  state.sel = { kind: k, id: c.id }; refreshAll();
}

/* ---------- effets & transitions ---------- */
function targetClips() {
  const s = state.sel;
  if (s && (s.kind === 'clip' || s.kind === 'junction')) { const c = getObj('clip', s.id); return c ? [c] : []; }
  const c = clipAt(state.t); return c ? [c] : [];
}
function applyEffect(id, all) {
  const P = state.project;
  const targets = all ? P.clips.slice() : targetClips();
  if (!targets.length) { toast('Ajoutez un clip à la timeline, puis sélectionnez-le pour lui appliquer un effet.'); return; }
  pushHistory(); targets.forEach(c => { c.effect = id; });
  refreshAll({ panels: true });
  const fx = EVS.EFFECTS.find(e => e.id === id);
  setStatus(id === 'none' ? 'Effet retiré' : 'Effet « ' + fx.label + ' » appliqué' + (all ? ' à tous les clips' : ''));
}
function applyTransition(type) {
  const P = state.project;
  let c = null;
  if (state.sel && (state.sel.kind === 'clip' || state.sel.kind === 'junction')) c = getObj('clip', state.sel.id);
  else c = clipAt(state.t);
  if (!c) { toast('Ajoutez au moins deux clips à la timeline pour utiliser une transition.'); return; }
  let i = P.clips.indexOf(c);
  if (i === P.clips.length - 1) i--;           // dernier clip : on utilise la jonction précédente
  if (i < 0) { toast('Il faut au moins deux clips pour une transition : ajoutez un deuxième média.'); return; }
  const from = P.clips[i];
  pushHistory();
  from.transition = type === 'none' ? null : { type, dur: state.transDur };
  state.sel = { kind: 'junction', id: from.id };
  refreshAll({ panels: true });
  if (from.transition) previewTransition(from);
}
function previewTransition(from) {
  const P = state.project, i = P.clips.indexOf(from), next = P.clips[i + 1]; if (!next) return;
  pause();
  const a = Math.max(0, next.start - 0.9), b = Math.min(state.total, next.start + next.td + 0.6);
  seek(a); playUntil = b; play();
}

/* ---------- enregistrement / ouverture ---------- */
function projectPayload() {
  const strip = c => { const d = clone(c); delete d.start; delete d.dur; delete d.td; return d; };
  const P = clone(state.project); P.clips = state.project.clips.map(strip);
  return {
    app: 'EcomVideoStudio', version: 2, project: P,
    media: state.media.filter(m => !m.missing).map(m => ({ id: m.id, path: m.path, name: m.name, type: m.type, duration: m.duration, hasAudio: m.hasAudio, width: m.width, height: m.height }))
  };
}
async function saveProject() {
  const p = await window.ecom.saveProject(projectPayload());
  if (p) { toast('Projet sauvegardé'); setStatus('Projet sauvegardé : ' + p); }
}
async function openProject() {
  const d = await window.ecom.loadProject();
  if (!d) return;
  if (d.error || d.app !== 'EcomVideoStudio' || !d.project) { toast('Ce fichier n\'est pas un projet compatible (ancien format ou fichier invalide).', 5000); return; }
  pause();
  state.project = Object.assign(newProject(), d.project);
  state.media = (d.media || []).map(m => Object.assign({}, m, { loading: true, thumb: null }));
  state.sel = null; state.t = 0; hist.undo = []; hist.redo = [];
  invalidateLayers(); fitStage(); updateRatioUi(); refreshAll({ panels: true });
  let missing = 0;
  for (const m of state.media) {
    await hydrateMedia(m);
    if (m.missing) missing++;
  }
  refreshAll({ panels: true });
  toast(missing ? missing + ' fichier(s) média introuvable(s) : ils ont été déplacés ou supprimés.' : 'Projet ouvert', missing ? 6000 : 2500);
}
function newProjectConfirm() {
  const P = state.project;
  if ((P.clips.length || P.audio.length || P.overlays.length) && !confirm('Créer un nouveau projet ? Les modifications non sauvegardées seront perdues.')) return;
  pause(); state.project = newProject(); state.media = []; state.sel = null; state.t = 0; hist.undo = []; hist.redo = [];
  invalidateLayers(); fitStage(); updateRatioUi(); refreshAll({ panels: true }); setStatus('Nouveau projet');
}
