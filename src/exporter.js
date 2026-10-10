/* EcomVideoStudio - construction de la commande FFmpeg à partir du projet.
 * Module sans dépendance Electron (testable avec Node seul). */
const fs = require('fs');
const path = require('path');
const EVS = require('./shared/data.js');

const num = (n, d = 3) => Number(n).toFixed(d);

function atempoChain(speed) {
  const f = [];
  let s = speed;
  while (s > 2) { f.push('atempo=2.0'); s /= 2; }
  while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; }
  f.push(`atempo=${num(s, 4)}`);
  return f;
}

/**
 * job = {
 *   width, height, fps, crf, preset, fit: 'contain'|'cover', output,
 *   clips:    [{ path, type:'video'|'image', inPoint, dur, speed, volume, effect, hasAudio, transition:{type,dur}|null }],
 *   audio:    [{ path, start, inPoint, dur, volume }],
 *   overlays: [{ png:'data:image/png;base64,...', start, end, fade }]
 * }
 * dir = dossier temporaire où écrire le script de filtres et les PNG des calques.
 */
function buildExport(job, dir) {
  const W = job.width, H = job.height, fps = job.fps || 30;
  const clips = job.clips.map(c => ({ ...c, dur: Math.max(0.05, c.dur), speed: c.speed || 1 }));
  if (!clips.length) throw new Error('Aucun clip dans le projet.');
  const total = EVS.layoutClips(clips);

  const inputs = [];
  let idx = 0;
  const filters = [];

  /* ---- 1) Clips vidéo / image ---- */
  clips.forEach(c => {
    if (c.type === 'image') inputs.push('-loop', '1', '-framerate', String(fps), '-t', num(c.dur + 0.1), '-i', c.path);
    else inputs.push('-ss', num(c.inPoint), '-t', num(c.dur * c.speed + 0.1), '-i', c.path);
    c.idx = idx++;
  });

  clips.forEach(c => {
    const f = [];
    f.push(c.type === 'video' && c.speed !== 1 ? `setpts=(PTS-STARTPTS)/${num(c.speed, 4)}` : 'setpts=PTS-STARTPTS');
    f.push(`fps=${fps}`);
    if (job.fit === 'cover') {
      f.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`);
    } else {
      f.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`);
    }
    f.push('setsar=1');
    const fx = EVS.EFFECTS.find(e => e.id === c.effect);
    const ff = fx && fx.ff(W, H);
    if (ff) f.push(ff);
    f.push(`trim=duration=${num(c.dur)}`, 'setpts=PTS-STARTPTS', 'format=yuv420p', 'settb=AVTB', `fps=${fps}`);
    filters.push(`[${c.idx}:v]${f.join(',')}[v${c.idx}]`);
  });

  /* ---- 2) Enchaînement : xfade si transition, concat sinon ---- */
  let cur = `v${clips[0].idx}`;
  for (let i = 1; i < clips.length; i++) {
    const c = clips[i], prev = clips[i - 1];
    const out = `c${i}`;
    if (c.td > 0 && prev.transition) {
      const tr = EVS.TRANSITIONS.find(t => t.id === prev.transition.type) || EVS.TRANSITIONS[0];
      filters.push(`[${cur}][v${c.idx}]xfade=transition=${tr.xfade}:duration=${num(c.td)}:offset=${num(c.start)}[${out}]`);
    } else {
      filters.push(`[${cur}][v${c.idx}]concat=n=2:v=1:a=0[${out}]`);
    }
    cur = out;
  }

  /* ---- 3) Audio ---- */
  const aLabels = [];
  const aFmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  clips.forEach((c, i) => {
    if (c.type !== 'video' || !c.hasAudio || !(c.volume > 0)) return;
    const f = ['asetpts=PTS-STARTPTS', aFmt];
    if (c.speed !== 1) f.push(...atempoChain(c.speed));
    f.push(`volume=${num(c.volume, 3)}`);
    const next = clips[i + 1];
    const tdOut = next ? next.td : 0;
    if (c.td > 0) f.push(`afade=t=in:st=0:d=${num(c.td)}`);
    if (tdOut > 0) f.push(`afade=t=out:st=${num(Math.max(0, c.dur - tdOut))}:d=${num(tdOut)}`);
    f.push(`atrim=duration=${num(c.dur)}`, 'asetpts=PTS-STARTPTS');
    const ms = Math.round(c.start * 1000);
    if (ms > 0) f.push(`adelay=${ms}|${ms}`);
    filters.push(`[${c.idx}:a]${f.join(',')}[a${c.idx}]`);
    aLabels.push(`a${c.idx}`);
  });

  (job.audio || []).forEach((a, k) => {
    if (!(a.volume > 0) || a.start >= total) return;
    inputs.push('-ss', num(a.inPoint), '-t', num(a.dur), '-i', a.path);
    const i = idx++;
    const f = [aFmt, `volume=${num(a.volume, 3)}`, 'asetpts=PTS-STARTPTS'];
    const ms = Math.round(a.start * 1000);
    if (ms > 0) f.push(`adelay=${ms}|${ms}`);
    filters.push(`[${i}:a]${f.join(',')}[ax${k}]`);
    aLabels.push(`ax${k}`);
  });

  let audioOut = null;
  if (aLabels.length === 1) { filters.push(`[${aLabels[0]}]alimiter=limit=0.97[aout]`); audioOut = 'aout'; }
  else if (aLabels.length > 1) {
    filters.push(`${aLabels.map(l => `[${l}]`).join('')}amix=inputs=${aLabels.length}:duration=longest:normalize=0:dropout_transition=0,alimiter=limit=0.97[aout]`);
    audioOut = 'aout';
  }

  /* ---- 4) Calques texte / emoji (PNG plein cadre) ---- */
  (job.overlays || []).forEach((o, k) => {
    const s = Math.max(0, o.start), e = Math.min(total, o.end);
    if (e - s < 0.03) return;
    const file = path.join(dir, `overlay${k}.png`);
    fs.writeFileSync(file, Buffer.from(String(o.png).replace(/^data:image\/png;base64,/, ''), 'base64'));
    inputs.push('-loop', '1', '-framerate', String(fps), '-t', num(total + 0.1), '-i', file);
    const i = idx++;
    const f = ['format=rgba'];
    if (o.fade) {
      const d = Math.min(0.25, (e - s) / 2);
      f.push(`fade=t=in:st=${num(s)}:d=${num(d)}:alpha=1`, `fade=t=out:st=${num(e - d)}:d=${num(d)}:alpha=1`);
    }
    filters.push(`[${i}:v]${f.join(',')}[ov${k}]`);
    const out = `o${k}`;
    filters.push(`[${cur}][ov${k}]overlay=0:0:enable='between(t,${num(s)},${num(e)})':format=auto[${out}]`);
    cur = out;
  });

  filters.push(`[${cur}]format=yuv420p[vout]`);

  const script = path.join(dir, 'filters.txt');
  fs.writeFileSync(script, filters.join(';\n'));

  const args = ['-y', '-hide_banner', ...inputs, '-filter_complex_script', script, '-map', '[vout]'];
  if (audioOut) args.push('-map', `[${audioOut}]`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  else args.push('-an');
  args.push('-c:v', 'libx264', '-preset', job.preset || 'medium', '-crf', String(job.crf || 20),
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-t', num(total, 3), '-movflags', '+faststart', job.output);

  return { args, total, script };
}

module.exports = { buildExport };
