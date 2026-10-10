const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { buildExport } = require('./exporter.js');

let ffmpegPath = require('ffmpeg-static');
ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

let win = null;
let exportProc = null;
let exportCancelled = false;

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg', '3gp'];
const AUDIO_EXT = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'];
const ext = p => path.extname(p).slice(1).toLowerCase();

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1500, height: 930, minWidth: 1180, minHeight: 700,
    backgroundColor: '#0b0d12', title: 'EcomVideoStudio',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toUpperCase() === 'I'))) win.webContents.toggleDevTools();
  });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------- utilitaire FFmpeg ---------- */
function run(args, { binary = false, onStderr } = {}) {
  return new Promise(resolve => {
    let p;
    try { p = spawn(ffmpegPath, args, { windowsHide: true }); }
    catch (e) { return resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(e.message) }); }
    const out = []; let err = '';
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => { const s = d.toString(); err += s; if (err.length > 200000) err = err.slice(-100000); if (onStderr) onStderr(s); });
    p.on('error', e => resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(e.message) }));
    p.on('close', code => resolve({ code, stdout: Buffer.concat(out), stderr: err, proc: p }));
    run.last = p;
  });
}

/* ---------- boîtes de dialogue ---------- */
ipcMain.handle('open-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Médias', extensions: [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT] },
      { name: 'Vidéos', extensions: VIDEO_EXT }, { name: 'Audio', extensions: AUDIO_EXT }, { name: 'Images', extensions: IMAGE_EXT }
    ]
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('save-project', async (_, data) => {
  const r = await dialog.showSaveDialog(win, { title: 'Enregistrer le projet', defaultPath: 'Projet-EcomVideoStudio.json', filters: [{ name: 'Projet EcomVideoStudio', extensions: ['json'] }] });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2));
  return r.filePath;
});
ipcMain.handle('load-project', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Projet EcomVideoStudio', extensions: ['json'] }] });
  if (r.canceled) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch (e) { return { error: e.message }; }
});
ipcMain.handle('pick-export-path', async (_, name) => {
  const r = await dialog.showSaveDialog(win, { title: 'Exporter la vidéo', defaultPath: name || 'EcomVideoStudio-export.mp4', filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('reveal-file', (_, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.handle('file-exists', (_, p) => fs.existsSync(p));

/* ---------- analyse d'un média ---------- */
ipcMain.handle('probe-media', async (_, p) => {
  if (!fs.existsSync(p)) return { ok: false, error: 'Fichier introuvable' };
  const e = ext(p);
  const r = await run(['-hide_banner', '-i', p]);
  const s = r.stderr;
  const dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  let duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0;
  const lines = s.split(/\r?\n/);
  const vLine = lines.find(l => /Stream #\d+:\d+.*Video:/.test(l) && !/attached pic/.test(l));
  const hasAudio = lines.some(l => /Stream #\d+:\d+.*Audio:/.test(l));
  let width = 0, height = 0;
  if (vLine) {
    const m = /[, ](\d{2,5})x(\d{2,5})[, \[]/.exec(vLine);
    if (m) { width = +m[1]; height = +m[2]; }
    const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(s);
    if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) [width, height] = [height, width];
  }
  let type;
  if (IMAGE_EXT.includes(e)) { type = 'image'; duration = 5; }
  else if (vLine) type = 'video';
  else if (hasAudio) type = 'audio';
  else return { ok: false, error: 'Format non reconnu' };
  if (!duration && type !== 'image') return { ok: false, error: 'Durée illisible' };
  return { ok: true, type, duration, hasAudio, width, height };
});

/* ---------- miniature (JPEG en data URL) ---------- */
ipcMain.handle('thumbnail', async (_, p, type, duration) => {
  if (type === 'audio') return null;
  const vf = 'scale=360:360:force_original_aspect_ratio=decrease';
  const tries = type === 'image' ? [0] : [Math.min(1, (duration || 1) / 3), 0];
  for (const t of tries) {
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (t > 0) args.push('-ss', String(t));
    args.push('-i', p, '-frames:v', '1', '-vf', vf, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1');
    const r = await run(args);
    if (r.stdout.length > 100) return 'data:image/jpeg;base64,' + r.stdout.toString('base64');
  }
  return null;
});

/* ---------- forme d'onde (20 pics / seconde) ---------- */
ipcMain.handle('waveform', async (_, p) => {
  const r = await run(['-hide_banner', '-loglevel', 'error', '-i', p, '-vn', '-ac', '1', '-ar', '2000', '-f', 's16le', 'pipe:1']);
  const buf = r.stdout; const n = Math.floor(buf.length / 2);
  if (n < 100) return [];
  const bucket = 100; const peaks = []; let max = 1;
  for (let i = 0; i + bucket <= n; i += bucket) {
    let m = 0;
    for (let j = 0; j < bucket; j++) { const v = Math.abs(buf.readInt16LE((i + j) * 2)); if (v > m) m = v; }
    peaks.push(m); if (m > max) max = m;
  }
  return peaks.map(v => Math.round(Math.sqrt(v / max) * 100) / 100);
});

/* ---------- proxy d'aperçu (formats non lisibles par Chromium) ---------- */
ipcMain.handle('make-proxy', async (_, p) => {
  try {
    const st = fs.statSync(p);
    const dir = path.join(os.tmpdir(), 'EcomVideoStudio-proxy'); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, crypto.createHash('md5').update(p + st.mtimeMs).digest('hex') + '.mp4');
    if (fs.existsSync(out)) return out;
    const r = await run(['-y', '-hide_banner', '-loglevel', 'error', '-i', p, '-vf', 'scale=-2:540', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out]);
    return r.code === 0 ? out : null;
  } catch { return null; }
});

/* ---------- export ---------- */
ipcMain.handle('export-video', async (_, job) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evs-export-'));
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  let built;
  try { built = buildExport(job, dir); }
  catch (e) { cleanup(); return { ok: false, error: e.message }; }
  exportCancelled = false;
  let tail = '';
  const r = await new Promise(resolve => {
    let p;
    try { p = spawn(ffmpegPath, built.args, { windowsHide: true }); }
    catch (e) { return resolve({ code: -1, err: e.message }); }
    exportProc = p;
    p.stderr.on('data', d => {
      const s = d.toString(); tail = (tail + s).slice(-4000);
      const m = [...s.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop();
      if (m && win && !win.isDestroyed()) {
        const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        win.webContents.send('export-progress', { percent: Math.min(99, Math.round(t / built.total * 100)) });
      }
    });
    p.on('error', e => resolve({ code: -1, err: e.message }));
    p.on('close', code => resolve({ code }));
  });
  exportProc = null; cleanup();
  if (exportCancelled) { try { fs.unlinkSync(job.output); } catch {} return { ok: false, cancelled: true }; }
  if (r.code === 0) return { ok: true, output: job.output };
  return { ok: false, error: r.err || tail.split(/\r?\n/).filter(Boolean).slice(-6).join('\n') };
});
ipcMain.handle('cancel-export', () => { if (exportProc) { exportCancelled = true; try { exportProc.kill(); } catch {} } });
