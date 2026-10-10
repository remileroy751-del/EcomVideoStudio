/* EcomVideoStudio - rendu des calques texte / emoji sur canvas.
 * La même fonction dessine l'aperçu ET les PNG envoyés à FFmpeg pour l'export (WYSIWYG). */
(function () {
  const imgCache = {};
  const hits = new Map();           // id -> {cx,cy,w,h,rot} (coordonnées en px de l'aperçu)
  let onLoad = () => {};

  function emojiImg(code) {
    let im = imgCache[code];
    if (!im) {
      im = new Image();
      im.src = (window.EMOJI_SVG || {})[code] || '';
      im.onload = () => onLoad();
      imgCache[code] = im;
    }
    return im;
  }
  async function ensureEmoji(ov) {
    if (ov.kind !== 'emoji') return;
    const im = emojiImg(ov.code);
    try { await im.decode(); } catch (e) { /* ignoré */ }
  }

  function rgba(hex, a) {
    const h = String(hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function fontString(ov, px) {
    return `${ov.italic ? 'italic ' : ''}${ov.bold ? '700 ' : '400 '}${px}px "${ov.font || 'Arial'}", "Segoe UI", Arial, sans-serif`;
  }

  /** Mise en page du texte (retour à la ligne automatique à 90 % de la largeur) */
  function layoutText(ctx, ov, W, H) {
    const fp = Math.max(4, ov.size / 100 * H);
    ctx.font = fontString(ov, fp);
    const maxW = W * 0.9;
    const lines = [];
    String(ov.text || '').split('\n').forEach(par => {
      if (!par) { lines.push(''); return; }
      let cur = '';
      par.split(' ').forEach(w => {
        const test = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; } else cur = test;
      });
      lines.push(cur);
    });
    const lh = fp * 1.2;
    const tw = Math.max(fp * 0.5, ...lines.map(l => ctx.measureText(l).width));
    const padX = ov.bgOn ? fp * 0.45 : fp * 0.12;
    const padY = ov.bgOn ? fp * 0.25 : fp * 0.06;
    return { fp, lines, lh, padX, padY, w: tw + padX * 2, h: lines.length * lh + padY * 2 };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** Dessine un calque ; retourne sa boîte {w,h} (locale, avant rotation) */
  function drawOne(ctx, W, H, ov, alpha, selected) {
    ctx.save();
    const cx = ov.x / 100 * W, cy = ov.y / 100 * H, rot = (ov.rot || 0) * Math.PI / 180;
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = alpha;
    let w, h;
    if (ov.kind === 'emoji') {
      const s = Math.max(8, ov.size / 100 * H);
      w = h = s;
      const im = emojiImg(ov.code);
      if (im.complete && im.naturalWidth) ctx.drawImage(im, -s / 2, -s / 2, s, s);
    } else {
      const L = layoutText(ctx, ov, W, H);
      w = L.w; h = L.h;
      if (ov.bgOn) { ctx.fillStyle = rgba(ov.bgColor, ov.bgAlpha == null ? 0.6 : ov.bgAlpha); roundRect(ctx, -w / 2, -h / 2, w, h, L.fp * 0.25); ctx.fill(); }
      ctx.font = fontString(ov, L.fp); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      L.lines.forEach((line, i) => {
        const y = -h / 2 + L.padY + L.lh * (i + 0.5);
        if (ov.strokeW > 0) {
          ctx.lineJoin = 'round'; ctx.miterLimit = 2;
          ctx.lineWidth = L.fp * ov.strokeW / 100 * 2; ctx.strokeStyle = ov.strokeColor || '#000';
          ctx.strokeText(line, 0, y);
        }
        if (ov.shadow) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = L.fp * 0.14; ctx.shadowOffsetY = L.fp * 0.05; }
        ctx.fillStyle = ov.color || '#fff';
        ctx.fillText(line, 0, y);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      });
    }
    if (selected) {
      ctx.globalAlpha = 1; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#3d8bff';
      ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
      ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3d8bff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2 + 3, h / 2 + 3, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return { cx, cy, w, h, rot };
  }

  function alphaAt(ov, t) {
    if (!ov.fade) return 1;
    const f = Math.min(0.25, ov.dur / 2);
    return Math.max(0, Math.min(1, (t - ov.start) / f, (ov.start + ov.dur - t) / f));
  }

  /** Aperçu : dessine tous les calques actifs à l'instant t. ctx est déjà mis à l'échelle (px CSS). */
  function drawAll(ctx, W, H, overlays, t, selectedId) {
    ctx.clearRect(0, 0, W, H);
    hits.clear();
    overlays.forEach(ov => {
      if (t < ov.start || t >= ov.start + ov.dur) return;
      hits.set(ov.id, drawOne(ctx, W, H, ov, alphaAt(ov, t), ov.id === selectedId));
    });
  }

  /** Export : PNG transparent plein cadre d'un calque */
  async function renderPng(ov, W, H) {
    await ensureEmoji(ov);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    drawOne(ctx, W, H, ov, 1, false);
    return c.toDataURL('image/png');
  }

  /** Test de sélection : retourne {id, handle:boolean} du calque touché (le plus haut d'abord) */
  function hitTest(overlays, px, py, selectedId) {
    for (let i = overlays.length - 1; i >= 0; i--) {
      const ov = overlays[i], b = hits.get(ov.id);
      if (!b) continue;
      const dx = px - b.cx, dy = py - b.cy, c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      if (Math.hypot(lx - (b.w / 2 + 3), ly - (b.h / 2 + 3)) < 12 && ov.id === selectedId) return { id: ov.id, handle: true };
      if (Math.abs(lx) <= b.w / 2 + 4 && Math.abs(ly) <= b.h / 2 + 4) return { id: ov.id, handle: false };
    }
    return null;
  }

  window.OV = { drawAll, drawOne, renderPng, hitTest, hits, ensureEmoji, emojiImg, set onLoad(f) { onLoad = f; } };
})();
