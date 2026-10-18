// Construction des commandes FFmpeg (module sans dépendance Electron, testable seul)
const FPS = 30;
const anim = require('./anim');
const fxlib = require('./effects');
const path = require('path');

const SIZES = { '1080': { '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080] }, '480': { '16:9': [854, 480], '9:16': [480, 854], '4:5': [480, 600], '1:1': [480, 480] } };
function resolutionFor(ratio, quality) { const t = (SIZES[quality] || SIZES['1080'])[ratio] || SIZES['1080']['16:9']; return { w: t[0], h: t[1] }; }

function num(n, d = 3) { return Number(n).toFixed(d); }

// Ajoute les entrées audio à `args` et renvoie les filtres de mixage.
function audioGraph(sources, total, firstIdx, args) {
  if (!sources || !sources.length) return null;
  const filters = [], labels = [];
  sources.forEach((s, i) => {
    args.push('-ss', num(s.inPoint || 0), '-t', num(s.duration), '-i', s.path);
    const k = firstIdx + i;
    const vol = Math.max(0, Math.min(2, (s.volume == null ? 100 : s.volume) / 100));
    const ms = Math.round((s.start || 0) * 1000);
    let f = `[${k}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${vol.toFixed(2)}`;
    if (ms > 0) f += `,adelay=${ms}:all=1`;
    f += `,apad=whole_dur=${num(total)}[a${i}]`;
    filters.push(f);
    labels.push(`[a${i}]`);
  });
  const n = sources.length;
  if (n === 1) filters.push(`${labels[0]}alimiter=limit=0.95[aout]`);
  else filters.push(`${labels.join('')}amix=inputs=${n}:duration=longest:dropout_transition=0,volume=${n},alimiter=limit=0.95[aout]`);
  return { filters, label: 'aout' };
}

// Commande d'export : fond noir + clips vidéo/photo superposés (V1 en bas, V3 en haut) + mix audio + légendes.
function buildExportArgs(o, res, burn, output) {
  const W = res.w, H = res.h;
  const total = Math.max(Number(o.total) || 0.1, 0.1);
  const args = ['-y', '-hide_banner', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${num(total)}`];
  const fc = [];
  let last = '0:v', idx = 1;
  const vids = [...(o.video || [])].sort((a, b) => a.track - b.track || a.start - b.start);
  vids.forEach((c, i) => {
    const isImg = c.type === 'image' || c.type === 'sticker';
    const myIdx = idx++;
    if (isImg) args.push('-loop', '1', '-framerate', String(FPS), '-t', num(c.duration), '-i', c.path);
    else args.push('-ss', num(c.inPoint || 0), '-t', num(c.duration), '-i', c.path);
    const ovs = (c.type !== 'sticker' && !c.noFx && o.fxDir) ? fxlib.overlaysOf(c.fx) : [];
    const ovIdx = ovs.map(id => { args.push('-stream_loop', '-1', '-t', num(c.duration), '-i', path.join(o.fxDir, `fx_${id}.mp4`)); return idx++; });
    const s = Math.max(0.05, Math.min(3, (c.scale == null ? 100 : c.scale) / 100));
    const bw = Math.max(2, Math.round((W * s) / 2) * 2), bh = Math.max(2, Math.round((H * s) / 2) * 2);
    const dx = Math.round(((c.x || 0) / 100) * W), dy = Math.round(((c.y || 0) / 100) * H);
    const start = num(c.start), end = num(c.start + c.duration);
    let chain = `[${myIdx}:v]fps=${FPS},` + (isImg ? 'format=rgba,' : '');
    let ox = `(W-w)/2+(${dx})`, oy = `(H-h)/2+(${dy})`;
    let cw = null, ch = null;
    if (c.type !== 'sticker') {
      if (c.fit === 'fill') { cw = bw; ch = bh; }
      else if (c.srcW && c.srcH) { const k = Math.min(bw / c.srcW, bh / c.srcH); cw = fxlib.even(c.srcW * k); ch = fxlib.even(c.srcH * k); }
    }
    if (c.fit === 'fill' && c.type !== 'sticker') chain += `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},setsar=1`;
    else if (cw) chain += `scale=${cw}:${ch},setsar=1`;
    else chain += `scale=${bw}:${bh}:force_original_aspect_ratio=decrease,setsar=1`;
    if (c.type !== 'sticker' && !c.noFx) {
      const parts = fxlib.ffChain(c.fx, bw, bh, cw, ch, c.duration);
      if (parts.length) chain += ',' + parts.join(',');
    }
    if (c.type === 'sticker' && !c.noAnim) {
      const A = anim.exprs(c.anim || 'none', c.duration);
      if (A.rot !== '0') chain += `,rotate=a='${A.rot}':c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`;
      chain += `,scale=w='max(2,iw*(${A.s}))':h='max(2,ih*(${A.s}))':eval=frame`;
      const lt = e => e.replace(/\bt\b/g, `(t-${start})`);
      if (A.dx !== '0') ox += `+(${lt(A.dx)})*W`;
      if (A.dy !== '0') oy += `+(${lt(A.dy)})*H`;
    }
    const blendPath = ovs.length > 0 && cw;
    if (blendPath) chain += ',format=gbrp';
    let cur = `c${i}`;
    fc.push(`${chain}[${cur}]`);
    if (blendPath) ovs.forEach((id, k) => {
      fc.push(`[${ovIdx[k]}:v]fps=${FPS},scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},format=gbrp[f${i}_${k}]`);
      fc.push(`[${cur}][f${i}_${k}]blend=all_mode=screen:shortest=1[m${i}_${k}]`);
      cur = `m${i}_${k}`;
    });
    const fade = c.type !== 'sticker' && !c.noFx ? fxlib.ffFade(c.fx, c.duration) : '';
    if (fade) { fc.push(`[${cur}]${fade}[fd${i}]`); cur = `fd${i}`; }
    fc.push(`[${cur}]setpts=PTS-STARTPTS+${start}/TB[v${i}]`);
    fc.push(`[${last}][v${i}]overlay=x='${ox}':y='${oy}':format=auto:eof_action=pass:enable='between(t,${start},${end})'[b${i}]`);
    last = `b${i}`;
    if (ovs.length && !blendPath) ovs.forEach((id, k) => { // repli (dimensions inconnues) : superposition par transparence
      const n = `${i}_${k}`;
      fc.push(`[${ovIdx[k]}:v]fps=${FPS},split[fa${n}][fb${n}];[fb${n}]format=gray[fg${n}];[fa${n}][fg${n}]alphamerge,scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},format=rgba,setpts=PTS-STARTPTS+${start}/TB[fx${n}]`);
      fc.push(`[${last}][fx${n}]overlay=x='(W-w)/2+(${dx})':y='(H-h)/2+(${dy})':format=auto:eof_action=pass:enable='between(t,${start},${end})'[bx${n}]`);
      last = `bx${n}`;
    });
  });
  if (burn) fc.push(`[${last}]subtitles=filename=subs.ass:fontsdir=.,format=yuv420p[vout]`);
  else fc.push(`[${last}]format=yuv420p[vout]`);
  const ag = audioGraph(o.audio, total, idx, args);
  if (ag) fc.push(...ag.filters);
  args.push('-filter_complex', fc.join(';'), '-map', '[vout]');
  if (ag) args.push('-map', `[${ag.label}]`, '-c:a', 'aac', '-b:a', '192k');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', o.resolution === '480' ? '26' : '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', '-t', num(total), output);
  return args;
}

// Mix audio (mono 16 kHz) découpé en morceaux de 10 min pour la transcription.
function buildTranscribeArgs(sources, total, chunkPattern) {
  const args = ['-y', '-hide_banner'];
  const ag = audioGraph(sources, Math.max(Number(total) || 0.1, 0.1), 0, args);
  if (!ag) return null;
  args.push('-filter_complex', ag.filters.join(';'), '-map', `[${ag.label}]`, '-ac', '1', '-ar', '16000',
    '-c:a', 'libmp3lame', '-b:a', '48k', '-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1', chunkPattern);
  return args;
}

function assTime(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function buildAss(caps, W, H) {
  const size = Math.round(Math.min(W, H) * 0.06), mv = Math.round(H * 0.07), ol = Math.max(2, Math.round(H * 0.004)), mh = Math.round(W * 0.06);
  let s = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n` +
    `[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `Style: Default,Arial,${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${ol},1,2,${mh},${mh},${mv},1\n\n` +
    `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  (caps || []).forEach(c => {
    const text = String(c.text || '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim();
    if (text) s += `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text}\n`;
  });
  return s;
}

module.exports = { resolutionFor, audioGraph, buildExportArgs, buildTranscribeArgs, buildAss, assTime };
