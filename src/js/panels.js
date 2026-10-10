'use strict';
/* EcomVideoStudio - panneaux de gauche (médias, audio, texte, emoji, légendes, effets, transitions) + inspecteur */

const PANEL_TITLES = { media: 'Médias', audio: 'Audio', text: 'Texte', emoji: 'Emoji', captions: 'Légendes', effects: 'Effets', transitions: 'Transitions' };

function setPanel(n) { state.panel = n; renderPanel(); }

function mediaCard(m) {
  const used = isMediaUsed(m.id);
  const thumb = m.thumb ? `background-image:url(${m.thumb})` : '';
  const ico = m.type === 'audio' ? '♫' : m.type === 'image' ? '🖼' : '▣';
  return `<div class="mcard${state.selMedia === m.id ? ' sel' : ''}" draggable="${m.loading || m.missing ? 'false' : 'true'}" data-media="${m.id}" title="${esc(m.path)}">
    <div class="mthumb ${m.type}${m.loading ? ' loading' : ''}" style="${thumb}">
      ${!m.thumb ? `<span class="ico">${ico}</span>` : ''}
      ${used ? '<span class="mused">✓ Dans le projet</span>' : ''}
      ${m.duration && m.type !== 'image' ? `<span class="mdur">${fmtTime(m.duration)}</span>` : ''}
      ${m.missing ? '<div class="mmiss">Fichier introuvable</div>' : `<button class="madd" data-act="add" data-id="${m.id}" title="Ajouter au projet">＋</button>`}
      <button class="mdel" data-act="del" data-id="${m.id}" title="Retirer de la bibliothèque">✕</button>
    </div>
    <div class="mname">${esc(m.name)}</div></div>`;
}
function panelMedia() {
  const list = state.media;
  return `<div class="dropzone" id="dropzone">Glissez vos vidéos, images ou sons ici<br><button class="primary" data-act="import">＋ Importer des médias</button></div>
    ${list.length ? `<div class="section-title">Bibliothèque (${list.length}) — cliquez sur ＋ pour ajouter au projet</div><div class="media-grid">${list.map(mediaCard).join('')}</div>`
      : '<div class="pad note">Vos médias importés apparaîtront ici sous forme de miniatures. Vous choisissez ensuite ceux à ajouter à la timeline avec le bouton ＋ (ou en les glissant sur la timeline).</div>'}`;
}
function panelAudio() {
  const list = state.media.filter(m => m.type === 'audio');
  return `<div class="dropzone" id="dropzone">Musiques, voix-off et effets sonores<br><button class="primary" data-act="import">＋ Importer un son</button></div>
    ${list.length ? `<div class="media-grid">${list.map(mediaCard).join('')}</div>` : '<div class="pad note">Aucun son importé. L\'audio est ajouté à la position de la tête de lecture.</div>'}`;
}
function panelText() {
  return `<div class="pad"><button class="primary" style="width:100%" data-act="addtext" data-i="0">＋ Ajouter un texte</button></div>
    <div class="section-title">Styles prêts à l'emploi</div>
    <div class="tiles two">${TEXT_PRESETS.map((p, i) => {
      const css = `font-family:'${p.font}';font-size:15px;color:${p.color};font-weight:${p.bold ? 700 : 400};font-style:${p.italic ? 'italic' : 'normal'};` +
        (p.strokeW ? `-webkit-text-stroke:${Math.max(1, p.strokeW / 4)}px ${p.strokeColor};paint-order:stroke fill;` : '') +
        (p.bgOn ? `background:${p.bgColor};padding:2px 8px;border-radius:5px;` : '') + (p.shadow ? 'text-shadow:0 1px 4px #000;' : '');
      return `<div class="tile" data-act="addtext" data-i="${i}"><div class="tt"><span style="${css};display:inline-block;margin:0">${esc(p.name)}</span></div></div>`;
    }).join('')}</div>
    <div class="pad note">Le texte s'affiche pendant 3 secondes à la tête de lecture. Glissez-le dans l'aperçu, agrandissez-le avec la poignée ou la molette, et ajustez police, couleur, contour et animation dans le panneau de droite.</div>`;
}
function panelEmoji() {
  const cats = EVS.EMOJI_CATEGORIES, cur = cats.find(c => c.id === state.emojiCat) || cats[0];
  const items = EVS.splitEmoji(cur.chars).map(ch => ({ ch, code: EVS.emojiCode(ch) })).filter(e => (window.EMOJI_SVG || {})[e.code]);
  return `<div class="emoji-tabs">${cats.map(c => `<button class="${c.id === cur.id ? 'active' : ''}" data-act="emojicat" data-id="${c.id}" title="${esc(c.title)}">${c.label}</button>`).join('')}</div>
    <div class="section-title">${esc(cur.title)}</div>
    <div class="emoji-grid">${items.map(e => `<button class="emo" data-act="addemoji" data-code="${e.code}" title="${e.ch}"><img src="${window.EMOJI_SVG[e.code]}" alt="${e.ch}"></button>`).join('')}</div>
    <div class="pad note">Emoji Twemoji © Twitter / jdecked — licence libre CC-BY 4.0. Cliquez pour ajouter à la tête de lecture, puis déplacez/redimensionnez dans l'aperçu.</div>`;
}
function panelCaptions() {
  return `<div class="pad"><p class="note" style="margin-top:0">La transcription automatique n'est pas incluse dans cette version. Vous pouvez en revanche ajouter vos légendes à la main, au bon moment :</p>
    <button class="primary" style="width:100%" data-act="addcaption">＋ Ajouter une légende</button>
    <p class="note">Une légende est un texte stylé (fond noir) placé en bas de la vidéo. Dupliquez-la et changez le texte pour chaque phrase. Pour la transcription automatique, il faudra brancher un moteur de type Whisper.</p></div>`;
}
function fxSample() {
  const c = targetClips()[0] || (state.project.clips[0]); const m = c && mediaById(c.mediaId);
  if (m && m.thumb) return m.thumb;
  if (!fxSample.cache) {
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160; const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 160, 160); gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(.5, '#3c9bff'); gr.addColorStop(1, '#7a2cff');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 160); g.fillStyle = '#ffd6a5'; g.beginPath(); g.arc(60, 70, 32, 0, 7); g.fill();
    g.fillStyle = '#2b2b2b'; g.fillRect(90, 90, 50, 50); fxSample.cache = cv.toDataURL();
  }
  return fxSample.cache;
}
function panelEffects() {
  const tc = targetClips()[0], cur = tc ? tc.effect : null, img = fxSample();
  return `<div class="pad note" style="padding-bottom:6px">${tc ? 'Appliqué au clip sélectionné.' : 'Sélectionnez un clip dans la timeline (ou placez la tête de lecture dessus), puis choisissez un effet.'}</div>
    <div class="tiles">${EVS.EFFECTS.map(f => {
      const mir = f.mirror ? 'transform:scaleX(-1);' : '';
      return `<div class="tile${cur === f.id ? ' active' : ''}" data-act="fx" data-id="${f.id}"><div class="tt" style="background-image:url(${img});filter:${f.css(0.5) || 'none'};${mir}">${f.id === 'none' ? '<span style="font-size:20px;color:#fff;text-shadow:0 0 4px #000">⊘</span>' : ''}</div><span>${esc(f.label)}</span></div>`;
    }).join('')}</div>
    <div class="pad"><button style="width:100%" data-act="fxall-sel">Appliquer l'effet du clip à tout le projet</button>
    <p class="note">Effets 100 % gratuits (filtres FFmpeg intégrés). L'aperçu est une approximation : le rendu final de l'export est un peu plus précis.</p></div>`;
}
function panelTransitions() {
  const P = state.project; let c = null;
  if (state.sel && (state.sel.kind === 'clip' || state.sel.kind === 'junction')) c = getObj('clip', state.sel.id); else c = clipAt(state.t);
  let i = c ? P.clips.indexOf(c) : -1; if (i === P.clips.length - 1) i--;
  const from = i >= 0 ? P.clips[i] : null, cur = from && from.transition ? from.transition.type : null;
  const info = P.clips.length < 2 ? 'Ajoutez au moins deux clips à la timeline pour utiliser une transition.'
    : from ? `Transition entre « ${esc((mediaById(from.mediaId) || {}).name || 'clip')} » et le clip suivant.` : 'Sélectionnez un clip : la transition s\'applique entre ce clip et le suivant (ou cliquez sur le ◈ entre deux clips).';
  return `<div class="pad note" style="padding-bottom:6px">${info}</div>
    <div class="pad" style="padding-top:0"><div class="f"><div class="lab">Durée <span class="val" id="trDurVal">${state.transDur.toFixed(1)} s</span></div><input type="range" id="trDur" min="0.2" max="2" step="0.1" value="${state.transDur}"></div></div>
    <div class="tiles">
      <div class="tile${from && !cur ? ' active' : ''}" data-act="tr" data-id="none"><div class="tt">⊘</div><span>Aucune</span></div>
      ${EVS.TRANSITIONS.map(t => `<div class="tile${cur === t.id ? ' active' : ''}" data-act="tr" data-id="${t.id}"><div class="tt">${t.icon}</div><span>${esc(t.label)}</span></div>`).join('')}
    </div>
    <div class="pad note">Transitions gratuites (filtre xfade de FFmpeg). Un aperçu se lance automatiquement à l'application.</div>`;
}

function renderMediaPanels() { if (state.panel === 'media' || state.panel === 'audio') renderPanel(); }
function renderPanel() {
  const lp = document.querySelector('.leftpanel'), sc = lp.scrollTop;
  const fn = { media: panelMedia, audio: panelAudio, text: panelText, emoji: panelEmoji, captions: panelCaptions, effects: panelEffects, transitions: panelTransitions }[state.panel];
  $('panelTitle').textContent = PANEL_TITLES[state.panel];
  $('importBtn').style.display = (state.panel === 'media' || state.panel === 'audio') ? '' : 'none';
  $('panelContent').innerHTML = fn();
  document.querySelectorAll('.tool').forEach(x => x.classList.toggle('active', x.dataset.panel === state.panel));
  lp.scrollTop = sc;
}

/* ================= inspecteur (panneau de droite) ================= */
const fieldFmt = { pct: v => Math.round(v * 100) + '%', deg: v => Math.round(v) + '°', num: v => (Math.round(v * 10) / 10) + '', sec: v => (Math.round(v * 10) / 10) + ' s' };
const rng = (label, k, min, max, step, val, fmt, scale) =>
  `<div class="f"><div class="lab">${label}<span class="val" data-val="${k}">${fieldFmt[fmt](val)}</span></div><input type="range" data-k="${k}" data-fmt="${fmt}" ${scale ? `data-scale="${scale}"` : ''} min="${min}" max="${max}" step="${step}" value="${scale ? val * scale : val}"></div>`;
const chk = (label, k, val) => `<label class="chk"><input type="checkbox" data-k="${k}" ${val ? 'checked' : ''}>${label}</label>`;
const numf = (label, k, val, min, step) => `<div class="f"><label>${label}</label><input type="number" data-k="${k}" min="${min}" step="${step}" value="${(Math.round(val * 100) / 100)}"></div>`;
const colf = (label, k, val) => `<div class="f"><label>${label}</label><input type="color" data-k="${k}" value="${val}"></div>`;
const actBtns = (extra) => `<div class="btnrow">${extra || ''}<button data-act="split">✂ Couper</button><button data-act="duplicate">⧉ Dupliquer</button><button class="danger" data-act="delete">🗑 Supprimer</button></div>`;

function inspProject() {
  const P = state.project;
  return `<div class="insp-head">Projet</div><div class="insp-body">
    <div class="f"><div class="lab">Format de la vidéo</div><div class="seg">${EVS.RATIOS.map(r => `<button class="${P.ratio === r.id ? 'on' : ''}" data-act="ratio" data-id="${r.id}">${r.label}</button>`).join('')}</div><span class="note">${currentRatio().hint}</span></div>
    <div class="f"><div class="lab">Ajustement du média</div><div class="seg"><button class="${P.fit !== 'cover' ? 'on' : ''}" data-act="fit" data-id="contain">Ajuster</button><button class="${P.fit === 'cover' ? 'on' : ''}" data-act="fit" data-id="cover">Remplir</button></div><span class="note">« Ajuster » garde l'image entière (barres noires), « Remplir » recadre pour couvrir tout le cadre.</span></div>
    <div class="f"><div class="lab">Durée du projet <span class="val">${fmtTime(state.total)}</span></div></div>
    <div class="note"><b>Raccourcis</b><br>Espace : lecture/pause · Suppr : supprimer · Ctrl+B : couper · Ctrl+Z / Ctrl+Y : annuler/rétablir · ←/→ : image par image · Ctrl+molette (timeline) : zoom</div></div>`;
}
function inspTransition(c) {
  const T = c.transition && EVS.TRANSITIONS.find(t => t.id === c.transition.type);
  if (!T) return `<div class="f"><div class="lab">Transition</div><button data-act="open-transitions">＋ Ajouter une transition</button></div>`;
  return `<div class="f"><div class="lab">Transition vers le clip suivant <span class="pill">${T.icon} ${esc(T.label)}</span></div>
    ${rng('Durée', 'tdur', 0.2, 2, 0.1, c.transition.dur, 'sec')}
    <div class="btnrow"><button data-act="open-transitions">Changer</button><button data-act="rm-transition">Retirer</button></div></div>`;
}
function inspClip(c) {
  const m = mediaById(c.mediaId), fx = EVS.EFFECTS.find(e => e.id === c.effect) || EVS.EFFECTS[0];
  let h = `<div class="insp-head">${c.type === 'image' ? 'Image' : 'Clip vidéo'}<small>${esc(m ? m.name : '')}</small></div><div class="insp-body">`;
  h += `<div class="f"><div class="lab">Effet <span class="pill">✦ ${esc(fx.label)}</span></div><button data-act="open-effects">Choisir un effet…</button></div>`;
  if (c.type === 'video') {
    h += `<div class="f"><label>Vitesse</label><select data-k="speed" data-num="1">${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map(s => `<option value="${s}" ${c.speed === s ? 'selected' : ''}>×${s}</option>`).join('')}</select></div>`;
    h += m && m.hasAudio === false ? '<div class="note">Ce clip n\'a pas de piste audio.</div>'
      : rng('Volume du clip', 'volume', 0, 200, 1, c.volume, 'pct', 100) + '<div class="note">0 % = muet (utile si vous ajoutez une voix-off). L\'aperçu est limité à 100 %, l\'export applique le réglage complet.</div>';
  } else h += numf('Durée à l\'écran (s)', 'imgdur', c.out - c.in, 0.5, 0.1);
  h += inspTransition(c) + actBtns() + '</div>';
  return h;
}
function inspJunction(c) {
  return `<div class="insp-head">Transition</div><div class="insp-body">${inspTransition(c)}<div class="btnrow"><button data-act="open-transitions">Choisir une transition</button></div></div>`;
}
function inspAudio(a) {
  const m = mediaById(a.mediaId);
  return `<div class="insp-head">Audio<small>${esc(m ? m.name : '')}</small></div><div class="insp-body">
    ${rng('Volume', 'volume', 0, 200, 1, a.volume, 'pct', 100)}<div class="note">L'aperçu est limité à 100 %, l'export applique le réglage complet.</div>
    ${numf('Début sur la timeline (s)', 'start', a.start, 0, 0.1)}${actBtns()}</div>`;
}
function inspOverlay(o) {
  let h = `<div class="insp-head">${o.kind === 'emoji' ? 'Emoji' : 'Texte'}</div><div class="insp-body">`;
  if (o.kind === 'text') {
    h += `<div class="f"><label>Texte</label><textarea data-k="text" rows="3">${esc(o.text)}</textarea></div>
      <div class="f"><label>Police</label><select data-k="font">${EVS.FONTS.map(f => `<option ${o.font === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></div>
      ${rng('Taille', 'size', 2, 30, 0.5, o.size, 'num')}
      <div class="row">${colf('Couleur', 'color', o.color)}${chk('Gras', 'bold', o.bold)}${chk('Italique', 'italic', o.italic)}</div>
      <div class="row">${colf('Contour', 'strokeColor', o.strokeColor)}${rng('Épaisseur', 'strokeW', 0, 20, 0.5, o.strokeW, 'num')}</div>
      <div class="row">${chk('Fond', 'bgOn', o.bgOn)}${colf('Couleur du fond', 'bgColor', o.bgColor)}</div>
      ${o.bgOn ? rng('Opacité du fond', 'bgAlpha', 0, 100, 1, o.bgAlpha == null ? 0.6 : o.bgAlpha, 'pct', 100) : ''}
      ${chk('Ombre portée', 'shadow', o.shadow)}`;
  } else h += rng('Taille', 'size', 3, 60, 0.5, o.size, 'num');
  h += rng('Rotation', 'rot', -180, 180, 1, o.rot, 'deg') + chk('Apparition / disparition en fondu', 'fade', o.fade)
    + `<div class="row">${numf('Début (s)', 'start', o.start, 0, 0.1)}${numf('Durée (s)', 'dur', o.dur, 0.2, 0.1)}</div>`
    + actBtns() + '<div class="note">Astuce : glissez l\'élément dans l\'aperçu, redimensionnez avec la poignée ronde ou la molette.</div></div>';
  return h;
}
function renderInspector() {
  const el = $('inspector'), s = state.sel;
  const keepScroll = el.scrollTop;
  const o = getSelObj();
  el.innerHTML = !s || !o ? inspProject()
    : s.kind === 'clip' ? inspClip(o) : s.kind === 'junction' ? inspJunction(o) : s.kind === 'audio' ? inspAudio(o) : inspOverlay(o);
  el.scrollTop = keepScroll;
}

$('inspector').addEventListener('input', e => {
  const el = e.target.closest('[data-k]'); if (!el || !state.sel) return;
  const obj = getSelObj(); if (!obj) return;
  const k = el.dataset.k; let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range' || el.type === 'number') { v = parseFloat(el.value); if (isNaN(v)) return; if (el.dataset.scale) v /= parseFloat(el.dataset.scale); }
  else if (el.dataset.num) v = parseFloat(el.value);
  else v = el.value;
  beginEdit(state.sel.id + k);
  if (k === 'tdur') { if (obj.transition) obj.transition.dur = v; state.transDur = v; }
  else if (k === 'imgdur') { obj.in = 0; obj.out = Math.max(0.3, v); }
  else if (k === 'dur') obj.dur = Math.max(0.2, v);
  else if (k === 'start') obj.start = Math.max(0, v);
  else obj[k] = v;
  const lab = el.closest('.f') && el.closest('.f').querySelector('[data-val]');
  if (lab && el.dataset.fmt) lab.textContent = fieldFmt[el.dataset.fmt](v);
  relayout(); renderTimeline(); renderAt(state.t, state.playing); updateTimeUI();
  if (k === 'bgOn' || k === 'speed') renderInspector();
});
