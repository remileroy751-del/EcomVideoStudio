'use strict';
/* EcomVideoStudio - actions, raccourcis, glisser-déposer, export, initialisation */

const actions = {
  import: async () => { const p = await window.ecom.openMedia(); if (p && p.length) importPaths(p); },
  add: el => addToProject(el.dataset.id),
  del: el => removeFromLibrary(el.dataset.id),
  addtext: el => addText(+el.dataset.i),
  addcaption: () => addText(3, 'Votre légende'),
  addemoji: el => addEmoji(el.dataset.code),
  emojicat: el => { state.emojiCat = el.dataset.id; renderPanel(); },
  fx: el => applyEffect(el.dataset.id, false),
  'fxall-sel': () => { const c = targetClips()[0]; if (!c) return toast('Sélectionnez d\'abord un clip.'); applyEffect(c.effect, true); },
  tr: el => applyTransition(el.dataset.id),
  ratio: el => { setRatio(el.dataset.id); $('ratioMenu').classList.add('hidden'); },
  fit: el => setFit(el.dataset.id),
  split: () => splitAtPlayhead(),
  delete: () => deleteSelected(),
  duplicate: () => duplicateSelected(),
  'open-effects': () => setPanel('effects'),
  'open-transitions': () => setPanel('transitions'),
  'rm-transition': () => { const o = getSelObj(); if (!o) return; pushHistory(); o.transition = null; refreshAll({ panels: true }); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.stopPropagation(); actions[el.dataset.act](el, e); return; }
  const card = e.target.closest('.mcard');
  if (card) { state.selMedia = card.dataset.media; document.querySelectorAll('.mcard').forEach(c => c.classList.toggle('sel', c === card)); }
});
document.addEventListener('dblclick', e => { const card = e.target.closest('.mcard'); if (card) addToProject(card.dataset.media); });

/* barre latérale + boutons du haut */
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setPanel(b.dataset.panel));
$('importBtn').onclick = () => actions.import();
$('newBtn').onclick = newProjectConfirm;
$('openProject').onclick = openProject;
$('saveProject').onclick = saveProject;
$('splitBtn').onclick = splitAtPlayhead;
$('deleteBtn').onclick = deleteSelected;
$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;

/* durée de transition (panneau) */
document.addEventListener('input', e => {
  if (e.target.id !== 'trDur') return;
  state.transDur = parseFloat(e.target.value); $('trDurVal').textContent = state.transDur.toFixed(1) + ' s';
  const o = state.sel && (state.sel.kind === 'junction' || state.sel.kind === 'clip') ? getSelObj() : null;
  if (o && o.transition) { beginEdit(o.id + 'tdur'); o.transition.dur = state.transDur; relayout(); renderTimeline(); renderAt(state.t, state.playing); updateTimeUI(); }
});

/* glisser-déposer */
document.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('.mcard'); if (!c) return;
  e.dataTransfer.setData('text/evs-media', c.dataset.media); e.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragover', e => {
  if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); const z = $('dropzone'); if (z) z.classList.add('over'); }
});
document.addEventListener('dragleave', e => { const z = $('dropzone'); if (z && !e.relatedTarget) z.classList.remove('over'); });
document.addEventListener('drop', e => {
  const z = $('dropzone'); if (z) z.classList.remove('over');
  if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map(f => window.ecom.pathForFile(f)).filter(Boolean);
  if (paths.length) importPaths(paths);
});

/* raccourcis clavier */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'textarea' || tag === 'select' || (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type));
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); splitAtPlayhead(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
  if (typing) return;
  if (e.code === 'Space') { e.preventDefault(); playPause(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (state.sel) deleteSelected(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(state.t - (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); seek(state.t + (e.shiftKey ? 1 : 1 / FPS)); }
  else if (e.key === 'Home') { e.preventDefault(); seek(0); }
  else if (e.key === 'End') { e.preventDefault(); seek(state.total); }
  else if (e.key === 'Escape') { if (state.sel) select(null); }
});

/* ---------- export ---------- */
let exportOutput = null;
const showExportView = v => { ['exportSettings', 'exportProgress', 'exportDone'].forEach(id => $(id).classList.toggle('hidden', id !== v)); };

function openExport() {
  const P = state.project;
  if (!P.clips.length) { toast('Ajoutez au moins un média à la timeline avant d\'exporter.'); return; }
  pause(); showExportView('exportSettings'); updateExportInfo();
  $('exportModal').classList.remove('hidden');
}
function updateExportInfo() {
  const sz = EVS.canvasSize(state.project.ratio, +state.exportQ);
  $('exportInfo').textContent = `Format ${state.project.ratio} · ${sz.w}×${sz.h} px · durée ${fmtTime(state.total)}`;
  document.querySelectorAll('.quality-grid button').forEach(b => b.classList.toggle('selected', b.dataset.res === state.exportQ));
}
$('exportBtn').onclick = openExport;
$('cancelExport').onclick = () => $('exportModal').classList.add('hidden');
$('closeExport').onclick = () => $('exportModal').classList.add('hidden');
$('revealExport').onclick = () => window.ecom.revealFile(exportOutput);
$('abortExport').onclick = () => window.ecom.cancelExport();
document.querySelectorAll('.quality-grid button').forEach(b => b.onclick = () => { state.exportQ = b.dataset.res; updateExportInfo(); });
window.ecom.onExportProgress(d => { $('pfill').style.width = d.percent + '%'; $('pText').textContent = 'Encodage… ' + d.percent + ' %'; });

async function buildJob(out) {
  const P = state.project, q = +state.exportQ, sz = EVS.canvasSize(P.ratio, q);
  const clips = P.clips.map(c => {
    const m = mediaById(c.mediaId);
    return { path: m.path, type: c.type, inPoint: c.in, dur: c.dur, speed: c.speed, volume: c.volume, effect: c.effect, hasAudio: m.hasAudio !== false, transition: c.transition ? { type: c.transition.type, dur: c.transition.dur } : null };
  });
  const audio = P.audio.map(a => ({ path: mediaById(a.mediaId).path, start: a.start, inPoint: a.in, dur: a.out - a.in, volume: a.volume }));
  const overlays = [];
  for (const o of P.overlays) {
    if (o.start >= state.total) continue;
    overlays.push({ png: await OV.renderPng(o, sz.w, sz.h), start: o.start, end: Math.min(state.total, o.start + o.dur), fade: !!o.fade });
  }
  return { width: sz.w, height: sz.h, fps: FPS, crf: q <= 480 ? 26 : 20, preset: 'medium', fit: P.fit, output: out, clips, audio, overlays };
}
$('doExport').onclick = async () => {
  const name = `EcomVideoStudio-${state.project.ratio.replace(':', 'x')}-${state.exportQ}p.mp4`;
  const out = await window.ecom.pickExportPath(name); if (!out) return;
  exportOutput = out; showExportView('exportProgress'); $('pfill').style.width = '0%'; $('pText').textContent = 'Préparation des calques texte / emoji…';
  setStatus('Export en cours…');
  let r;
  try { r = await window.ecom.exportVideo(await buildJob(out)); } catch (e) { r = { ok: false, error: String(e.message || e) }; }
  showExportView('exportDone');
  $('revealExport').style.display = r.ok ? '' : 'none';
  $('doneText').textContent = r.ok ? 'Export terminé avec succès ✓\n' + r.output : r.cancelled ? 'Export annulé.' : 'Échec de l\'export :\n' + (r.error || 'erreur inconnue');
  setStatus(r.ok ? 'Export terminé' : r.cancelled ? 'Export annulé' : 'Échec de l\'export');
};

/* ---------- démarrage ---------- */
updateRatioUi(); renderPanel(); renderInspector(); refreshAll(); fitStage(); updateUndoUi();
window.addEventListener('resize', fitStage);
