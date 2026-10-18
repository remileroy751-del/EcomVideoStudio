const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require("electron");
const path = require("path"), fs = require("fs"), os = require("os");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static").replace("app.asar", "app.asar.unpacked");
const { buildExportArgs, buildTranscribeArgs, buildAss, resolutionFor } = require("./ffgraph");

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 930, minWidth: 1100, minHeight: 700, backgroundColor: "#090b10",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
    title: "EcomVideoStudio"
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

const send = (ch, d) => { try { win && win.webContents.send(ch, d); } catch (e) {} };

// ---------- FFmpeg ----------
function runFF(args, opts = {}) {
  return new Promise(resolve => {
    let tail = "";
    let p;
    try { p = spawn(ffmpegPath, args, { cwd: opts.cwd, windowsHide: true }); }
    catch (e) { return resolve({ code: -1, stderr: String(e.message) }); }
    p.stderr.on("data", d => { const s = String(d); tail = (tail + s).slice(-6000); if (opts.onData) opts.onData(s); });
    p.on("error", e => resolve({ code: -1, stderr: e.message }));
    p.on("close", code => resolve({ code, stderr: tail }));
  });
}

function probe(file) {
  return runFF(["-hide_banner", "-i", file]).then(r => {
    const s = r.stderr;
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    const duration = d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0;
    const hasVideo = /Stream #.*Video:/.test(s);
    const hasAudio = /Stream #.*Audio:/.test(s);
    const sz = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(s);
    const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(s);
    let width = sz ? +sz[1] : 0, height = sz ? +sz[2] : 0;
    if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) { const t = width; width = height; height = t; } // vidéos de téléphone pivotées
    return { duration, hasVideo, hasAudio, width, height };
  });
}

// ---------- Projets / fichiers ----------
ipcMain.handle("open-media", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Médias", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv", "mpeg", "mpg", "3gp", "jpg", "jpeg", "png", "webp", "bmp", "gif", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }]
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("probe", (_, f) => probe(f));
ipcMain.handle("sticker-dir", () => path.join(__dirname, "stickers"));
ipcMain.handle("fx-dir", () => path.join(__dirname, "effects"));
ipcMain.handle("thumb", (_, file, dur) => new Promise(resolve => {
  const chunks = [];
  const ss = Math.max(0, Math.min(0.5, (dur || 1) / 2));
  let p;
  try { p = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", String(ss), "-i", file, "-frames:v", "1", "-vf", "scale=-2:72", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "6", "pipe:1"], { windowsHide: true }); }
  catch (e) { return resolve(""); }
  p.stdout.on("data", d => chunks.push(d));
  p.on("error", () => resolve(""));
  p.on("close", () => { const b = Buffer.concat(chunks); resolve(b.length ? "data:image/jpeg;base64," + b.toString("base64") : ""); });
}));
ipcMain.handle("save-project", async (_, data) => {
  const r = await dialog.showSaveDialog(win, { title: "Enregistrer le projet", defaultPath: "EcomVideoStudio-project.json", filters: [{ name: "Projet EcomVideoStudio", extensions: ["json"] }] });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return r.filePath;
});
ipcMain.handle("load-project", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Projet EcomVideoStudio", extensions: ["json"] }] });
  if (r.canceled) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); } catch (e) { return null; }
});
ipcMain.handle("pick-export-path", async (_, name) => {
  const r = await dialog.showSaveDialog(win, { title: "Exporter la vidéo", defaultPath: name || "EcomVideoStudio-export.mp4", filters: [{ name: "Vidéo MP4", extensions: ["mp4"] }] });
  return r.canceled ? null : r.filePath;
});

// ---------- Export ----------
function prepareSubs(tmp, caps, res) {
  fs.writeFileSync(path.join(tmp, "subs.ass"), buildAss(caps, res.w, res.h), "utf8");
  const fonts = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
  for (const f of ["arialbd.ttf", "arial.ttf"]) {
    try { if (fs.existsSync(path.join(fonts, f))) fs.copyFileSync(path.join(fonts, f), path.join(tmp, f)); } catch (e) {}
  }
}
ipcMain.handle("export-video", async (_, o) => {
  const res = resolutionFor(o.ratio, o.resolution);
  const unpack = p => String(p).replace(/app\.asar(?!\.unpacked)/, "app.asar.unpacked");
  o.video = (o.video || []).map(c => ({ ...c, path: unpack(c.path) }));
  o.fxDir = unpack(path.join(__dirname, "effects"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecomvs-"));
  try {
    const caps = (o.captions || []).filter(c => c.text && c.end > c.start);
    let burn = caps.length > 0;
    if (burn) prepareSubs(tmp, caps, res);
    let r = await runFF(buildExportArgs(o, res, burn, o.output), { cwd: tmp, onData: s => send("export-progress", s) });
    let warning;
    if (r.code !== 0 && burn) {
      send("export-progress", "\nLes légendes n'ont pas pu être incrustées, nouvel essai sans légendes…\n");
      r = await runFF(buildExportArgs(o, res, false, o.output), { cwd: tmp, onData: s => send("export-progress", s) });
      if (r.code === 0) warning = "Export terminé, mais sans les légendes incrustées (moteur vidéo incompatible).";
    }
    if (r.code !== 0 && o.video.some(c => c.type === "sticker")) {
      send("export-progress", "\nAnimation des stickers non supportée, nouvel essai avec des stickers fixes…\n");
      o.video = o.video.map(c => ({ ...c, noAnim: true }));
      r = await runFF(buildExportArgs(o, res, burn, o.output), { cwd: tmp, onData: s => send("export-progress", s) });
      if (r.code === 0) warning = "Export terminé, mais les stickers sont fixes (animation non supportée par le moteur vidéo).";
    }
    if (r.code !== 0 && o.video.some(c => c.fx && c.fx.length)) {
      send("export-progress", "\nUn effet n'est pas supporté par le moteur vidéo, nouvel essai sans effets…\n");
      o.video = o.video.map(c => ({ ...c, noFx: true }));
      r = await runFF(buildExportArgs(o, res, burn, o.output), { cwd: tmp, onData: s => send("export-progress", s) });
      if (r.code === 0) warning = "Export terminé, mais sans les effets (non supportés par le moteur vidéo).";
    }
    return r.code === 0 ? { ok: true, output: o.output, warning } : { ok: false, error: r.stderr.slice(-800) || "Erreur FFmpeg" };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
});

// ---------- Réglages (clé API stockée chiffrée si possible) ----------
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function loadSettings() {
  try {
    const j = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    let key = "";
    if (j.key) {
      if (j.enc) { try { key = safeStorage.decryptString(Buffer.from(j.key, "base64")); } catch (e) { key = ""; } }
      else key = j.key;
    }
    return { provider: j.provider || "groq", key };
  } catch (e) { return { provider: "groq", key: "" }; }
}
function saveSettings(provider, key) {
  const old = loadSettings();
  const k = key ? key.trim() : old.key;
  const rec = { provider: provider === "openai" ? "openai" : "groq" };
  if (k) {
    if (safeStorage.isEncryptionAvailable()) { rec.enc = true; rec.key = safeStorage.encryptString(k).toString("base64"); }
    else rec.key = k;
  }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(rec));
}
ipcMain.handle("get-settings", () => { const s = loadSettings(); return { provider: s.provider, hasKey: !!s.key }; });
ipcMain.handle("set-settings", (_, o) => { saveSettings(o.provider, o.key); return true; });

// ---------- Légendes automatiques (Whisper via internet) ----------
const PROVIDERS = {
  groq: { url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3-turbo" },
  openai: { url: "https://api.openai.com/v1/audio/transcriptions", model: "whisper-1" }
};
async function callWhisper(cfg, file, language, offset) {
  const P = PROVIDERS[cfg.provider] || PROVIDERS.groq;
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), "audio.mp3");
  fd.append("model", P.model);
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  fd.append("timestamp_granularities[]", "segment");
  fd.append("temperature", "0");
  if (language && language !== "auto") fd.append("language", language);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  let res;
  try {
    res = await fetch(P.url, { method: "POST", headers: { Authorization: "Bearer " + cfg.key }, body: fd, signal: ctrl.signal });
  } catch (e) {
    throw new Error("Impossible de joindre le service de transcription. Vérifiez votre connexion internet.");
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    let msg = "";
    try { const j = await res.json(); msg = (j.error && j.error.message) || JSON.stringify(j); } catch (e) {}
    if (res.status === 401) msg = "Clé API refusée. Vérifiez la clé enregistrée. " + msg;
    throw new Error(`Erreur ${res.status} : ${msg}`.trim());
  }
  const j = await res.json();
  const segs = (j.segments || []).filter(s => !(s.no_speech_prob > 0.6));
  const inSeg = t => !(j.segments || []).length || segs.some(s => t >= s.start - 0.1 && t <= s.end + 0.1);
  return {
    words: (j.words || []).filter(w => inSeg((w.start + w.end) / 2)).map(w => ({ word: String(w.word).trim(), start: w.start + offset, end: w.end + offset })),
    segments: segs.map(s => ({ start: s.start + offset, end: s.end + offset, text: String(s.text).trim() }))
  };
}
ipcMain.handle("transcribe", async (_, o) => {
  const cfg = loadSettings();
  if (!cfg.key) return { ok: false, error: "Aucune clé API enregistrée. Renseignez-la dans le panneau Légendes (voir les instructions)." };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecomvs-tr-"));
  try {
    send("caption-progress", "Préparation de l'audio…");
    const args = buildTranscribeArgs(o.sources, o.total, path.join(tmp, "chunk%03d.mp3"));
    if (!args) return { ok: false, error: "Aucun son à transcrire." };
    const r = await runFF(args);
    if (r.code !== 0) return { ok: false, error: "Préparation audio impossible : " + r.stderr.slice(-400) };
    const chunks = fs.readdirSync(tmp).filter(f => /^chunk\d+\.mp3$/.test(f)).sort();
    let words = [], segments = [];
    for (let i = 0; i < chunks.length; i++) {
      send("caption-progress", `Transcription en ligne… (${i + 1}/${chunks.length})`);
      const part = await callWhisper(cfg, path.join(tmp, chunks[i]), o.language, i * 600);
      words = words.concat(part.words); segments = segments.concat(part.segments);
    }
    return { ok: true, words, segments };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
});
