/* EcomVideoStudio — interface : 3 pistes vidéo, 3 pistes audio, légendes automatiques */
const $ = id => document.getElementById(id);
const LABEL = 70;
const IMG_EXT = /\.(jpe?g|png|webp|bmp|gif)$/i, AUD_EXT = /\.(mp3|wav|aac|m4a|ogg|flac)$/i, VID_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|mpe?g|3gp)$/i;
let uid = 0;
const newId = () => "i" + Date.now().toString(36) + (uid++);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fileUrl(p) { return encodeURI("file:///" + p.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F"); }
function fmt(s, dec) { s = Math.max(0, s || 0); const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, "0") + ":" + (dec ? r.toFixed(1).padStart(4, "0") : String(Math.floor(r)).padStart(2, "0")); }

let state = freshState();
function freshState() { return { media: [], clips: [], audioTracks: 1, captions: [], selected: null, resolution: "1080", pps: 40 }; }
const P = { t: 0, playing: false, last: 0 };
let currentPanel = "media", resolution = "1080", capSettings = { provider: "groq", hasKey: false }, capBusy = false;

const setStatus = m => { $("status").textContent = m; };
const total = () => state.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
const getSel = () => state.clips.find(c => c.id === state.selected);
const clipAt = (kind, track, t) => state.clips.find(c => c.kind === kind && c.track === track && t >= c.start - 1e-6 && t < c.start + c.duration - 1e-6);

/* ---------- Aperçu : 3 couches vidéo + 3 lecteurs audio ---------- */
const layers = [], aEls = [];
for (let i = 0; i < 3; i++) {
  const wrap = document.createElement("div"); wrap.className = "layer"; wrap.style.zIndex = i + 1;
  const v = document.createElement("video"); v.playsInline = true; v.preload = "auto";
  const img = document.createElement("img");
  wrap.append(v, img); $("layers").appendChild(wrap);
  layers.push({ wrap, v, img, cur: null });
  const a = new Audio(); a.preload = "auto"; aEls.push({ a, cur: null });
}

function drive(el, c, t, sw) {
  const target = c.inPoint + (t - c.start);
  el.volume = clamp(c.volume / 100, 0, 1);
  const diff = Math.abs(el.currentTime - target);
  if (sw || diff > 0.35 || (!P.playing && diff > 0.04)) { try { el.currentTime = target; } catch (e) {} }
  if (P.playing) { if (el.paused) el.play().catch(() => {}); } else if (!el.paused) el.pause();
}
function setSrc(el, p) { if (el.dataset.src !== p) { el.dataset.src = p; el.src = fileUrl(p); } }

function syncMedia(force) {
  const t = P.t;
  for (let i = 0; i < 3; i++) {
    const L = layers[i], c = clipAt("video", i, t);
    if (!c) { L.wrap.style.display = "none"; if (!L.v.paused) L.v.pause(); L.cur = null; continue; }
    L.wrap.style.display = "block";
    L.wrap.style.transform = `translate(${c.x}%,${c.y}%) scale(${c.scale / 100})`;
    if (c.type === "image") {
      L.v.style.display = "none"; if (!L.v.paused) L.v.pause();
      L.img.style.display = "block"; setSrc(L.img, c.path); L.cur = c.id;
    } else {
      L.img.style.display = "none"; L.v.style.display = "block";
      const sw = force || L.cur !== c.id; L.cur = c.id;
      setSrc(L.v, c.path); drive(L.v, c, t, sw);
    }
  }
  for (let i = 0; i < 3; i++) {
    const A = aEls[i], c = clipAt("audio", i, t);
    if (!c) { if (!A.a.paused) A.a.pause(); A.cur = null; continue; }
    const sw = force || A.cur !== c.id; A.cur = c.id;
    setSrc(A.a, c.path); drive(A.a, c, t, sw);
  }
}

function play() {
  if (P.playing || total() <= 0) return;
  if (P.t >= total() - 0.05) P.t = 0;
  P.playing = true; P.last = performance.now(); $("play").textContent = "⏸";
  syncMedia(true); requestAnimationFrame(tick);
}
function pause() { P.playing = false; $("play").textContent = "▶"; syncMedia(); }
function tick(now) {
  if (!P.playing) return;
  P.t += (now - P.last) / 1000; P.last = now;
  if (P.t >= total()) { P.t = total(); pause(); updateUI(); return; }
  syncMedia(); updateUI(true); requestAnimationFrame(tick);
}
function seek(t) { P.t = clamp(t, 0, Math.max(total(), 0)); syncMedia(true); updateUI(); }

function updateUI(follow) {
  const T = total();
  $("time").textContent = fmt(P.t) + " / " + fmt(T);
  $("scrubFill").style.width = (T ? (P.t / T) * 100 : 0) + "%";
  const ph = $("playhead");
  if (ph) {
    ph.style.left = (LABEL + P.t * state.pps) + "px";
    if (follow) { const tl = $("timeline"), x = LABEL + P.t * state.pps; if (x > tl.scrollLeft + tl.clientWidth - 40) tl.scrollLeft = x - 120; }
  }
  const cap = state.captions.find(c => P.t >= c.start && P.t < c.end);
  $("captionLayer").textContent = cap ? cap.text : "";
  $("emptyPreview").style.display = state.clips.length ? "none" : "block";
}

/* ---------- Médias ---------- */
function typeOfPath(p) { return IMG_EXT.test(p) ? "image" : AUD_EXT.test(p) ? "audio" : VID_EXT.test(p) ? "video" : null; }
async function importPaths(paths) {
  const out = [];
  for (const p of paths) {
    const type = typeOfPath(p);
    if (!type) { setStatus("Format non pris en charge : " + p.split(/[\\/]/).pop()); continue; }
    let m = state.media.find(x => x.path === p);
    if (!m) {
      setStatus("Analyse de " + p.split(/[\\/]/).pop() + "…");
      const info = await window.ecom.probe(p);
      m = { id: newId(), path: p, name: p.split(/[\\/]/).pop(), type, duration: type === "image" ? 5 : (info.duration || 10), hasAudio: type === "audio" ? true : !!info.hasAudio, width: info.width, height: info.height };
      state.media.push(m);
    }
    out.push(m);
  }
  renderMedia(); setStatus(out.length ? out.length + " média(s) importé(s)" : "Prêt");
  return out;
}
function mediaHtml(filter) {
  const list = state.media.filter(m => !filter || m.type === filter);
  if (!list.length) return `<div class="media-card">Glissez vos fichiers ici<br>ou cliquez sur « Importer »</div>`;
  return list.map(m => {
    const url = fileUrl(m.path);
    const th = m.type === "image" ? `<img src="${url}">` : m.type === "video" ? `<video src="${url}#t=0.5" preload="metadata" muted></video>` : `<span class="note">♫</span>`;
    const icon = { video: "🎬", image: "🖼", audio: "♫" }[m.type];
    return `<div class="media-item" draggable="true" data-id="${m.id}"><div class="thumb">${th}</div><div class="minfo"><b>${esc(m.name)}</b><small>${icon} ${m.type === "image" ? "Photo" : fmt(m.duration)}${m.type === "video" && !m.hasAudio ? " • sans son" : ""}</small></div><button class="addbtn" data-add="${m.id}" title="Ajouter à la timeline">＋</button></div>`;
  }).join("");
}
function renderMedia() { const el = $("mediaList"); if (el) el.innerHTML = mediaHtml(currentPanel === "audio" ? "audio" : null); }

/* ---------- Clips ---------- */
function overlaps(clip, track, start, dur) {
  dur = dur == null ? clip.duration : dur;
  return state.clips.some(c => c !== clip && c.kind === clip.kind && c.track === track && start < c.start + c.duration - 1e-6 && start + dur > c.start + 1e-6);
}
function addClip(m, kind, track, time) {
  const dur = m.type === "image" ? 5 : (m.duration || 5);
  let start = Math.max(0, time || 0);
  for (let i = 0; i < 100; i++) {
    const o = state.clips.find(c => c.kind === kind && c.track === track && start < c.start + c.duration - 1e-6 && start + dur > c.start + 1e-6);
    if (!o) break; start = o.start + o.duration;
  }
  const c = { id: newId(), mediaId: m.id, kind, track, type: kind === "audio" ? "audio" : m.type, path: m.path, name: m.name, start, inPoint: 0, duration: dur, mediaDur: m.type === "image" ? 0 : dur, scale: 100, x: 0, y: 0, volume: 100, hasAudio: kind === "audio" ? true : !!m.hasAudio };
  state.clips.push(c); state.selected = c.id;
  renderTimeline(); renderProps(); syncMedia(true); updateUI();
  setStatus(`« ${m.name} » ajouté sur ${kind === "video" ? "V" + (track + 1) : "A" + (track + 1)}`);
  return c;
}
function dropOnLane(m, lane, t) {
  const kind = lane.dataset.kind; let track = +lane.dataset.track || 0;
  if (kind === "video") { if (m.type === "audio") return setStatus("Un son se dépose sur une piste audio."); }
  else {
    if (m.type === "image") return setStatus("Une photo ne peut pas être déposée sur une piste audio.");
    if (m.type === "video" && !m.hasAudio) return setStatus("Cette vidéo n'a pas de son.");
    if (lane.dataset.new) { if (state.audioTracks >= 3) return; state.audioTracks++; track = state.audioTracks - 1; }
  }
  return addClip(m, kind, track, t);
}
function quickAdd(m) {
  if (m.type === "audio") { const a = state.clips.filter(c => c.kind === "audio" && c.track === 0); return addClip(m, "audio", 0, a.reduce((x, c) => Math.max(x, c.start + c.duration), 0)); }
  const v = state.clips.filter(c => c.kind === "video" && c.track === 0);
  return addClip(m, "video", 0, v.reduce((x, c) => Math.max(x, c.start + c.duration), 0));
}
function deleteSelected() {
  const c = getSel(); if (!c) return setStatus("Sélectionnez un clip à supprimer.");
  state.clips = state.clips.filter(x => x !== c); state.selected = null;
  renderTimeline(); renderProps(); syncMedia(true); updateUI(); setStatus("Clip supprimé");
}
function splitAt(t) {
  const s = getSel();
  const inside = c => t > c.start + 0.05 && t < c.start + c.duration - 0.05;
  const targets = s && inside(s) ? [s] : state.clips.filter(inside);
  if (!targets.length) return setStatus("Placez la tête de lecture à l'intérieur d'un clip pour le couper.");
  targets.forEach(c => {
    const d = t - c.start;
    state.clips.push({ ...c, id: newId(), start: t, inPoint: c.type === "image" ? 0 : c.inPoint + d, duration: c.duration - d });
    c.duration = d;
  });
  renderTimeline(); syncMedia(true); setStatus("Clip coupé");
}

/* ---------- Timeline ---------- */
function renderTimeline() {
  const pps = state.pps, T = Math.max(total() + 20, 60), width = Math.ceil(T * pps);
  const step = pps >= 80 ? 1 : pps >= 40 ? 2 : pps >= 20 ? 5 : 10;
  let ticks = "";
  for (let s = 0; s <= T; s += step) ticks += `<span class="tick" style="left:${s * pps}px">${fmt(s)}</span>`;
  const clipHtml = (kind, track) => state.clips.filter(c => c.kind === kind && c.track === track).map(c => {
    const icon = c.type === "image" ? "🖼" : c.kind === "audio" ? "♫" : "🎬";
    return `<div class="clip ${c.kind} ${c.type}${c.id === state.selected ? " selected" : ""}" data-id="${c.id}" style="left:${c.start * pps}px;width:${Math.max(8, c.duration * pps)}px"><i class="h hl"></i><span class="cname">${icon} ${esc(c.name)}</span><i class="h hr"></i></div>`;
  }).join("");
  let h = `<div class="tl-inner" style="width:${LABEL + width}px"><div class="ruler-row"><div class="tlabel corner"></div><div class="ruler" id="ruler" style="width:${width}px">${ticks}</div></div>`;
  for (let v = 2; v >= 0; v--) h += `<div class="track-row video"><div class="tlabel">V${v + 1}</div><div class="lane" data-kind="video" data-track="${v}" style="width:${width}px">${clipHtml("video", v)}</div></div>`;
  for (let a = 0; a < state.audioTracks; a++) h += `<div class="track-row audio"><div class="tlabel">A${a + 1}</div><div class="lane" data-kind="audio" data-track="${a}" style="width:${width}px">${clipHtml("audio", a)}</div></div>`;
  if (state.audioTracks < 3) h += `<div class="track-row audio"><div class="tlabel">＋</div><div class="lane newlane" data-kind="audio" data-new="1" style="width:${width}px">Déposez un son ici pour créer la piste audio ${state.audioTracks + 1}</div></div>`;
  h += `<div class="playhead" id="playhead"></div></div>`;
  $("timeline").innerHTML = h;
  updateUI();
}

function startDrag(e, clip, mode) {
  e.preventDefault();
  const x0 = e.clientX, o = { start: clip.start, inPoint: clip.inPoint, duration: clip.duration };
  let moved = false;
  const mm = ev => {
    const dx = (ev.clientX - x0) / state.pps; moved = true;
    if (mode === "move") {
      const ns = Math.max(0, o.start + dx); let track = clip.track;
      const lane = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList && x.classList.contains("lane") && x.dataset.kind === clip.kind && !x.dataset.new);
      if (lane) track = +lane.dataset.track;
      if (!overlaps(clip, track, ns)) { clip.start = ns; clip.track = track; }
    } else if (mode === "right") {
      let nd = Math.max(0.2, o.duration + dx);
      if (clip.type !== "image") nd = Math.min(nd, clip.mediaDur - clip.inPoint);
      if (!overlaps(clip, clip.track, clip.start, nd)) clip.duration = nd;
    } else {
      let d = Math.max(dx, clip.type === "image" ? -o.start : -Math.min(o.start, o.inPoint));
      d = Math.min(d, o.duration - 0.2);
      if (!overlaps(clip, clip.track, o.start + d, o.duration - d)) {
        clip.start = o.start + d; clip.duration = o.duration - d; if (clip.type !== "image") clip.inPoint = o.inPoint + d;
      }
    }
    renderTimeline(); syncMedia(true);
  };
  const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); if (moved) { renderProps(); updateUI(); } };
  window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
}

function scrubFromEvent(e) {
  const r = $("ruler").getBoundingClientRect();
  seek((e.clientX - r.left) / state.pps);
}
function initTimeline() {
  const tl = $("timeline");
  tl.addEventListener("mousedown", e => {
    const ruler = e.target.closest("#ruler");
    if (ruler) {
      pause(); scrubFromEvent(e);
      const mm = ev => scrubFromEvent(ev), mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
      window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu); return;
    }
    const clipEl = e.target.closest(".clip");
    if (clipEl) {
      const c = state.clips.find(x => x.id === clipEl.dataset.id); if (!c) return;
      if (state.selected !== c.id) { state.selected = c.id; renderTimeline(); renderProps(); }
      startDrag(e, c, e.target.classList.contains("hl") ? "left" : e.target.classList.contains("hr") ? "right" : "move");
      return;
    }
    if (e.target.closest(".lane") && state.selected) { state.selected = null; renderTimeline(); renderProps(); }
  });
  tl.addEventListener("dragover", e => { const lane = e.target.closest(".lane"); if (lane) { e.preventDefault(); lane.classList.add("over"); } });
  tl.addEventListener("dragleave", e => { const lane = e.target.closest(".lane"); if (lane) lane.classList.remove("over"); });
  tl.addEventListener("drop", async e => {
    const lane = e.target.closest(".lane"); if (!lane) return;
    e.preventDefault(); lane.classList.remove("over");
    const t = Math.max(0, (e.clientX - lane.getBoundingClientRect().left) / state.pps);
    const id = e.dataTransfer.getData("application/x-ecom-media");
    let ms = [];
    if (id) { const m = state.media.find(x => x.id === id); if (m) ms = [m]; }
    else if (e.dataTransfer.files && e.dataTransfer.files.length) ms = await importPaths(window.ecom.pathsFromFiles(e.dataTransfer.files));
    let pos = t;
    for (const m of ms) { const c = dropOnLane(m, lane, pos); if (c) pos = c.start + c.duration; }
  });
}

/* ---------- Propriétés du clip sélectionné ---------- */
function renderProps() {
  const bar = $("propsBar"), c = getSel();
  if (!c) { bar.innerHTML = `<span class="hint">Sélectionnez un clip pour régler volume, taille et position • Glissez ses bords pour le rogner</span>`; return; }
  const sl = (key, label, min, max, val, unit) => `<label>${label} <input type="range" data-p="${key}" min="${min}" max="${max}" value="${val}"><span>${val}${unit}</span></label>`;
  let h = `<b>${esc(c.name)}</b>`;
  if (c.type !== "image" && (c.kind === "audio" || c.hasAudio)) h += sl("volume", "Volume", 0, 100, c.volume, "%");
  if (c.kind === "video") h += sl("scale", "Taille", 10, 100, c.scale, "%") + sl("x", "Position X", -50, 50, c.x, "") + sl("y", "Position Y", -50, 50, c.y, "") + `<button id="resetProps">Recentrer</button>`;
  bar.innerHTML = h;
}
function initProps() {
  $("propsBar").addEventListener("input", e => {
    const k = e.target.dataset.p, c = getSel(); if (!k || !c) return;
    c[k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value + (k === "volume" || k === "scale" ? "%" : "");
    syncMedia();
  });
  $("propsBar").addEventListener("click", e => {
    if (e.target.id === "resetProps") { const c = getSel(); if (c) { c.scale = 100; c.x = 0; c.y = 0; renderProps(); syncMedia(true); } }
  });
}

/* ---------- Panneaux ---------- */
const TITLES = { media: "Médias", audio: "Audio", text: "Texte", captions: "Légendes", effects: "Effets", transitions: "Transitions" };
function showPanel(name) {
  currentPanel = name; $("panelTitle").textContent = TITLES[name] || name;
  document.querySelectorAll(".tool").forEach(b => b.classList.toggle("active", b.dataset.panel === name));
  const pc = $("panelContent");
  if (name === "media") pc.innerHTML = `<div id="mediaList"></div><p class="tip">Glissez un média sur une piste de la timeline (V1 à V3), ou double-cliquez pour l'ajouter.</p>`;
  else if (name === "audio") pc.innerHTML = `<div class="panel-pad"><button id="addTrackBtn2" class="primary wide">＋ Ajouter piste audio</button></div><div id="mediaList"></div><p class="tip">Glissez un son sur A1, A2, A3 ou sur la zone « nouvelle piste ». Une vidéo glissée sur une piste audio n'en garde que le son.</p>`;
  else if (name === "captions") { pc.innerHTML = captionsHtml(); bindCaptions(); }
  else pc.innerHTML = `<div class="media-card">Bientôt disponible</div>`;
  renderMedia();
}
function addAudioTrack() {
  if (state.audioTracks >= 3) return setStatus("Maximum 3 pistes audio.");
  state.audioTracks++; renderTimeline(); setStatus("Piste audio " + state.audioTracks + " ajoutée");
}

/* ---------- Légendes automatiques ---------- */
function captionsHtml() {
  const list = state.captions.map((c, i) => `<div class="cap-item"><a data-seek="${i}">${fmt(c.start, 1)}</a><input data-cap="${i}" value="${esc(c.text)}"><button data-del="${i}" title="Supprimer">×</button></div>`).join("");
  return `<div class="panel-pad cap-panel">
  <label>Service de transcription</label>
  <select id="capProvider"><option value="groq">Groq (clé gratuite)</option><option value="openai">OpenAI (payant)</option></select>
  <input id="capKey" type="password" placeholder="${capSettings.hasKey ? "Clé enregistrée — laisser vide pour la conserver" : "Collez votre clé API ici"}">
  <button id="capSave">Enregistrer la clé</button>
  <small class="muted">Groq : créez une clé gratuite sur console.groq.com/keys. La clé reste sur cet ordinateur (chiffrée par Windows).</small>
  <label>Langue parlée</label>
  <select id="capLang"><option value="fr">Français</option><option value="en">English</option><option value="pt">Português</option><option value="es">Español</option><option value="auto">Détection automatique</option></select>
  <label>Son à transcrire</label>
  <select id="capSrc"><option value="all">Tout l'audio de la timeline</option><option value="a0">Piste audio 1</option><option value="a1">Piste audio 2</option><option value="a2">Piste audio 3</option><option value="video">Son des vidéos uniquement</option></select>
  <button id="capGen" class="primary wide">✨ Générer les légendes</button>
  <div id="capMsg" class="muted"></div>
  ${state.captions.length ? `<div class="cap-head"><b>${state.captions.length} légendes</b><button id="capClear">Tout effacer</button></div>` : ""}
  <div id="capList">${list}</div></div>`;
}
function bindCaptions() {
  $("capProvider").value = capSettings.provider;
  $("capSave").onclick = async () => {
    await window.ecom.setSettings({ provider: $("capProvider").value, key: $("capKey").value });
    capSettings = await window.ecom.getSettings(); $("capKey").value = ""; $("capKey").placeholder = capSettings.hasKey ? "Clé enregistrée — laisser vide pour la conserver" : "Collez votre clé API ici";
    $("capMsg").textContent = capSettings.hasKey ? "Réglages enregistrés ✔" : "Aucune clé enregistrée.";
  };
  $("capGen").onclick = generateCaptions;
  const clr = $("capClear"); if (clr) clr.onclick = () => { state.captions = []; updateUI(); showPanel("captions"); };
  $("capList").addEventListener("input", e => { const i = e.target.dataset.cap; if (i != null) { state.captions[i].text = e.target.value; updateUI(); } });
  $("capList").addEventListener("click", e => {
    if (e.target.dataset.del != null) { state.captions.splice(+e.target.dataset.del, 1); updateUI(); showPanel("captions"); }
    if (e.target.dataset.seek != null) seek(state.captions[+e.target.dataset.seek].start);
  });
}
function audioSources(filter) {
  const out = [];
  state.clips.forEach(c => {
    if (c.type === "image" || c.volume <= 0) return;
    const isAudio = c.kind === "audio";
    if (!isAudio && !c.hasAudio) return;
    if (filter === "video" && isAudio) return;
    if (/^a\d$/.test(filter) && !(isAudio && c.track === +filter[1])) return;
    out.push({ path: c.path, start: c.start, inPoint: c.inPoint, duration: c.duration, volume: c.volume });
  });
  return out;
}
function buildCaptions(r) {
  const caps = [];
  const words = (r.words || []).filter(w => w.word);
  if (words.length) {
    let cur = null;
    const flush = () => { if (cur && cur.text.trim()) caps.push(cur); cur = null; };
    words.forEach(w => {
      if (cur) {
        const gap = w.start - cur.end, len = (cur.text + " " + w.word).length;
        if (gap > 0.8 || len > 38 || w.end - cur.start > 3.8 || (/[.!?…]$/.test(cur.text) && cur.text.length > 12) || (/[,;:]$/.test(cur.text) && cur.text.length > 24)) flush();
      }
      if (!cur) cur = { start: w.start, end: w.end, text: w.word }; else { cur.text += " " + w.word; cur.end = w.end; }
    });
    flush();
  } else {
    (r.segments || []).forEach(s => {
      const parts = s.text.match(/[^.!?,;]+[.!?,;]*/g) || [s.text], totalLen = parts.join("").length || 1;
      let t = s.start;
      parts.forEach(p => { const d = (s.end - s.start) * (p.length / totalLen); if (p.trim()) caps.push({ start: t, end: t + d, text: p.trim() }); t += d; });
    });
  }
  caps.forEach((c, i) => { const next = caps[i + 1]; c.end = Math.max(c.start + 0.4, Math.min(c.end + 0.1, next ? next.start : c.end + 0.1)); });
  return caps;
}
async function generateCaptions() {
  if (capBusy) return;
  const sources = audioSources($("capSrc").value);
  if (!sources.length) { $("capMsg").textContent = "Aucun son à transcrire : ajoutez une voix off ou une vidéo avec du son sur la timeline."; return; }
  if (!capSettings.hasKey) { $("capMsg").textContent = "Enregistrez d'abord votre clé API (voir ci-dessus)."; return; }
  if (state.captions.length && !confirm("Remplacer les légendes existantes ?")) return;
  capBusy = true; $("capGen").disabled = true; $("capMsg").textContent = "Démarrage…";
  const lang = $("capLang").value;
  const r = await window.ecom.transcribe({ sources, total: total(), language: lang });
  capBusy = false;
  if (!r.ok) { if ($("capMsg")) { $("capGen").disabled = false; $("capMsg").textContent = "❌ " + r.error; } return; }
  state.captions = buildCaptions(r);
  setStatus(state.captions.length + " légendes générées");
  if (currentPanel === "captions") { showPanel("captions"); $("capLang").value = lang; $("capMsg").textContent = state.captions.length ? "✔ Légendes générées. Vous pouvez les corriger ci-dessous." : "Aucune parole détectée."; }
  updateUI();
}

/* ---------- Projets ---------- */
async function saveProject() {
  const f = await window.ecom.saveProject({ app: "EcomVideoStudio", version: 2, state: { ...state, selected: null } });
  if (f) setStatus("Projet enregistré : " + f);
}
async function openProject() {
  const d = await window.ecom.loadProject();
  if (!d || !d.state) return setStatus("Projet illisible ou annulé.");
  pause(); state = { ...freshState(), ...d.state, selected: null };
  (state.clips || []).forEach(c => { c.scale = c.scale || 100; c.x = c.x || 0; c.y = c.y || 0; c.volume = c.volume == null ? 100 : c.volume; });
  P.t = 0; $("zoom").value = state.pps; showPanel(currentPanel); renderTimeline(); renderProps(); syncMedia(true); updateUI(); setStatus("Projet chargé");
}
function newProject() {
  if (state.clips.length && !confirm("Créer un nouveau projet ? Les modifications non enregistrées seront perdues.")) return;
  pause(); state = freshState(); P.t = 0; showPanel(currentPanel); renderTimeline(); renderProps(); syncMedia(true); updateUI();
}

/* ---------- Export ---------- */
function openExport() {
  if (!state.clips.length) return setStatus("Ajoutez des clips à la timeline avant d'exporter.");
  pause(); $("exportLog").textContent = ""; $("expBar").classList.add("hidden"); $("expFill").style.width = "0"; $("exportModal").classList.remove("hidden");
}
async function doExport() {
  const out = await window.ecom.pickExportPath("EcomVideoStudio-export.mp4"); if (!out) return;
  const T = total();
  const video = state.clips.filter(c => c.kind === "video").map(c => ({ path: c.path, type: c.type, track: c.track, start: c.start, inPoint: c.inPoint, duration: c.duration, scale: c.scale, x: c.x, y: c.y }));
  $("doExport").disabled = true; $("exportLog").textContent = "Export en cours…\n"; $("expBar").classList.remove("hidden");
  const r = await window.ecom.exportVideo({ video, audio: audioSources("all"), total: T, resolution, output: out, captions: $("burnCaps").checked ? state.captions : [] });
  $("doExport").disabled = false;
  if (r.ok) { $("expFill").style.width = "100%"; $("exportLog").textContent = "✔ Export terminé :\n" + r.output + (r.warning ? "\n⚠ " + r.warning : ""); setStatus("Export terminé"); }
  else $("exportLog").textContent = "❌ Échec de l'export :\n" + r.error;
}
window.ecom.onExportProgress(s => {
  const m = [...s.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop();
  if (m) { const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); const p = clamp(Math.round((t / Math.max(total(), 0.1)) * 100), 0, 99); $("expFill").style.width = p + "%"; $("exportLog").textContent = "Export en cours… " + p + "%"; }
});
window.ecom.onCaptionProgress(s => { const el = $("capMsg"); if (el) el.textContent = s; });

/* ---------- Initialisation ---------- */
document.querySelectorAll(".tool").forEach(b => b.onclick = () => showPanel(b.dataset.panel));
$("importBtn").onclick = async () => { const p = await window.ecom.openMedia(); if (p.length) await importPaths(p); };
$("play").onclick = () => P.playing ? pause() : play();
$("splitBtn").onclick = () => splitAt(P.t);
$("deleteBtn").onclick = deleteSelected;
$("addAudioTrack").onclick = addAudioTrack;
$("zoom").oninput = e => { state.pps = +e.target.value; renderTimeline(); };
$("scrub").onclick = e => { const r = $("scrub").getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * total()); };
$("newBtn").onclick = newProject; $("openProject").onclick = openProject; $("saveProject").onclick = saveProject;
$("exportBtn").onclick = openExport; $("cancelExport").onclick = () => $("exportModal").classList.add("hidden"); $("doExport").onclick = doExport;
document.querySelectorAll(".quality-grid button").forEach(b => b.onclick = () => { document.querySelectorAll(".quality-grid button").forEach(x => x.classList.remove("selected")); b.classList.add("selected"); resolution = b.dataset.res; });
document.querySelector(".side-bottom").onclick = () => showPanel("captions");

const pc = $("panelContent");
pc.addEventListener("dragstart", e => { const it = e.target.closest(".media-item"); if (it) { e.dataTransfer.setData("application/x-ecom-media", it.dataset.id); e.dataTransfer.effectAllowed = "copy"; } });
pc.addEventListener("click", e => {
  const b = e.target.closest("[data-add]"); if (b) { const m = state.media.find(x => x.id === b.dataset.add); if (m) quickAdd(m); }
  if (e.target.id === "addTrackBtn2") addAudioTrack();
});
pc.addEventListener("dblclick", e => { const it = e.target.closest(".media-item"); if (it && !e.target.closest("button")) { const m = state.media.find(x => x.id === it.dataset.id); if (m) quickAdd(m); } });
const leftPanel = document.querySelector(".leftpanel");
leftPanel.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
leftPanel.addEventListener("drop", async e => { if (e.dataTransfer.files.length) { e.preventDefault(); await importPaths(window.ecom.pathsFromFiles(e.dataTransfer.files)); } });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => e.preventDefault());
window.addEventListener("keydown", e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range") return;
  if (e.code === "Space") { e.preventDefault(); P.playing ? pause() : play(); }
  else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
});

initTimeline(); initProps(); showPanel("media"); renderTimeline(); renderProps(); updateUI();
window.ecom.getSettings().then(s => { capSettings = s; });
