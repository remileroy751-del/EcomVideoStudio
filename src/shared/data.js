/* EcomVideoStudio - données partagées (interface + export FFmpeg)
 * Tous les effets / transitions utilisent uniquement des filtres FFmpeg natifs : 100 % gratuits, aucun fichier externe. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EVS = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- Formats de projet (comme CapCut) ---------- */
  const RATIOS = [
    { id: '9:16', w: 9, h: 16, label: '9:16', hint: 'TikTok · Reels · Shorts' },
    { id: '16:9', w: 16, h: 9, label: '16:9', hint: 'YouTube · Paysage' },
    { id: '4:5', w: 4, h: 5, label: '4:5', hint: 'Instagram · Facebook' }
  ];
  const even = n => Math.round(n / 2) * 2;
  /** Taille de sortie : shortSide = plus petit côté (480, 720, 1080) */
  function canvasSize(ratioId, shortSide) {
    const r = RATIOS.find(x => x.id === ratioId) || RATIOS[0];
    if (r.w < r.h) return { w: even(shortSide), h: even(shortSide * r.h / r.w) };
    return { w: even(shortSide * r.w / r.h), h: even(shortSide) };
  }
  function nearestRatio(w, h) {
    if (!w || !h) return '9:16';
    const a = w / h;
    let best = RATIOS[0], bd = 1e9;
    RATIOS.forEach(r => { const d = Math.abs(Math.log(a / (r.w / r.h))); if (d < bd) { bd = d; best = r; } });
    return best.id;
  }

  /* ---------- Effets vidéo ----------
   * ff(W,H) : filtre FFmpeg pour l'export ; css(k) : approximation CSS pour l'aperçu (k = échelle aperçu/export) */
  const EFFECTS = [
    { id: 'none', label: 'Aucun', ff: () => '', css: () => '' },
    { id: 'bw', label: 'Noir & blanc', ff: () => 'hue=s=0', css: () => 'grayscale(1)' },
    { id: 'sepia', label: 'Sépia', ff: () => 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0', css: () => 'sepia(1)' },
    { id: 'vintage', label: 'Vintage', ff: () => 'curves=preset=vintage,vignette=PI/5', css: () => 'sepia(.4) contrast(1.1) saturate(.9)', vignette: true },
    { id: 'vivid', label: 'Éclatant', ff: () => 'eq=saturation=1.6:contrast=1.08', css: () => 'saturate(1.7) contrast(1.08)' },
    { id: 'warm', label: 'Chaud', ff: () => 'colorbalance=rs=.12:gs=.02:bs=-.12:rm=.10:bm=-.10', css: () => 'sepia(.25) saturate(1.25) hue-rotate(-8deg)' },
    { id: 'cold', label: 'Froid', ff: () => 'colorbalance=rs=-.10:bs=.15:rm=-.08:bm=.12', css: () => 'saturate(1.1) hue-rotate(18deg) brightness(1.02)' },
    { id: 'cinema', label: 'Cinéma', ff: () => 'curves=preset=strong_contrast,eq=saturation=1.1,vignette=PI/6', css: () => 'contrast(1.25) saturate(1.1)', vignette: true },
    { id: 'matte', label: 'Mat', ff: () => "curves=all='0/0.10 1/0.95',eq=saturation=0.85", css: () => 'contrast(.85) brightness(1.1) saturate(.8)' },
    { id: 'bright', label: 'Lumineux', ff: () => 'eq=brightness=0.08:contrast=1.08', css: () => 'brightness(1.18) contrast(1.05)' },
    { id: 'dark', label: 'Sombre', ff: () => 'eq=brightness=-0.12:contrast=1.05', css: () => 'brightness(.82) contrast(1.05)' },
    { id: 'blur', label: 'Flou', ff: () => 'gblur=sigma=8', css: k => `blur(${Math.max(1, 8 * k).toFixed(1)}px)` },
    { id: 'sharp', label: 'Netteté', ff: () => 'unsharp=5:5:1.5:5:5:0.0', css: () => 'contrast(1.08)' },
    { id: 'vignette', label: 'Vignette', ff: () => 'vignette=PI/4', css: () => '', vignette: true },
    { id: 'negative', label: 'Négatif', ff: () => 'negate', css: () => 'invert(1)' },
    { id: 'mirror', label: 'Miroir', ff: () => 'hflip', css: () => '', mirror: true },
    { id: 'grain', label: 'Grain film', ff: () => 'noise=alls=18:allf=t+u', css: () => 'contrast(1.05)' },
    { id: 'rgbshift', label: 'Aberration RVB', ff: () => 'rgbashift=rh=8:bh=-8', css: () => 'saturate(1.3) contrast(1.1)' },
    { id: 'pixel', label: 'Pixel', ff: (W, H) => `scale=${Math.max(2, Math.round(W / 24))}:${Math.max(2, Math.round(H / 24))}:flags=neighbor,scale=${W}:${H}:flags=neighbor`, css: () => 'contrast(1.1)' }
  ];

  /* ---------- Transitions (filtre xfade de FFmpeg) ---------- */
  const TRANSITIONS = [
    { id: 'fade', label: 'Fondu', xfade: 'fade', icon: '◐' },
    { id: 'dissolve', label: 'Dissolution', xfade: 'dissolve', icon: '░' },
    { id: 'fadeblack', label: 'Fondu noir', xfade: 'fadeblack', icon: '■' },
    { id: 'fadewhite', label: 'Flash blanc', xfade: 'fadewhite', icon: '□' },
    { id: 'slideleft', label: 'Glisser ←', xfade: 'slideleft', icon: '⇦' },
    { id: 'slideright', label: 'Glisser →', xfade: 'slideright', icon: '⇨' },
    { id: 'slideup', label: 'Glisser ↑', xfade: 'slideup', icon: '⇧' },
    { id: 'slidedown', label: 'Glisser ↓', xfade: 'slidedown', icon: '⇩' },
    { id: 'wipeleft', label: 'Volet ←', xfade: 'wipeleft', icon: '◧' },
    { id: 'wiperight', label: 'Volet →', xfade: 'wiperight', icon: '◨' },
    { id: 'wipeup', label: 'Volet ↑', xfade: 'wipeup', icon: '⬒' },
    { id: 'wipedown', label: 'Volet ↓', xfade: 'wipedown', icon: '⬓' },
    { id: 'circleopen', label: 'Cercle ouvert', xfade: 'circleopen', icon: '◎' },
    { id: 'circleclose', label: 'Cercle fermé', xfade: 'circleclose', icon: '◉' },
    { id: 'zoomin', label: 'Zoom', xfade: 'zoomin', icon: '⊕' },
    { id: 'pixelize', label: 'Pixellisation', xfade: 'pixelize', icon: '▦' }
  ];

  const FONTS = ['Arial', 'Arial Black', 'Impact', 'Segoe UI', 'Trebuchet MS', 'Verdana', 'Tahoma', 'Georgia', 'Courier New', 'Comic Sans MS'];

  /* ---------- Emoji (Twemoji, CC-BY 4.0) ---------- */
  const EMOJI_CATEGORIES = [
    { id: 'smileys', label: '😀', title: 'Visages', chars: '😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰🤩🥳🙂🤗🤔🤨😐😑🙄😏😮🤐😴😌😛😜🤪😒😔😕🙃🤑😲😞😤😢😭😩🤯😬😰😱🥵🥶😳😵😡🤬😷🤒🤕🤢🤮😇🤠🤡🤓🧐😈👿💀👻👽🤖💩' },
    { id: 'gestes', label: '👍', title: 'Gestes', chars: '👍👎👌✌️🤞🤟🤘🤙👈👉👆👇☝️✋🤚🖐️🖖👋🤏✊👊🤛🤜👏🙌👐🤲🙏🤝💪👀🧠' },
    { id: 'coeurs', label: '❤️', title: 'Cœurs & symboles', chars: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💯💢💥💫💦💨🔥✨⭐🌟⚡🎉🎊🎁🏆🥇🥈🥉🎯' },
    { id: 'business', label: '💰', title: 'Business & e-commerce', chars: '💰💵💸💳🛒🛍️📦🚚🏷️📈📉📊💼📱💻🖥️📞📣📢🔔🔒🔑💡🎬🎥📷🎤🎧🎵🎶⏰⌛🚀🌍📍🆕🆓🔝💎👑' },
    { id: 'signes', label: '✅', title: 'Signes & flèches', chars: '✅❌⚠️❓❗‼️⁉️➕➖➡️⬅️⬆️⬇️🔴🟢🔵🟡🟠🟣⚫⚪' },
    { id: 'nature', label: '🌈', title: 'Nature & food', chars: '☀️🌙🌈☁️❄️🌸🌹🌴🍀🍎🍕🍔🍟🍿☕🍺🥂🎂🍰🍫🐶🐱🦁🐼🦄' }
  ];
  /** caractère emoji -> nom de fichier Twemoji (ex. "1f600") */
  function emojiCode(ch) {
    const cps = Array.from(ch).map(c => c.codePointAt(0));
    const hasZwj = cps.includes(0x200d);
    return cps.filter(c => hasZwj || c !== 0xfe0f).map(c => c.toString(16)).join('-');
  }
  function splitEmoji(str) {
    // sépare une chaîne d'emoji en caractères (gère VS16 et ZWJ simples)
    const out = []; const arr = Array.from(str);
    for (let i = 0; i < arr.length; i++) {
      let cur = arr[i];
      while (arr[i + 1] === '\ufe0f' || arr[i + 1] === '\u200d') {
        cur += arr[++i];
        if (arr[i] === '\u200d' && arr[i + 1]) cur += arr[++i];
      }
      out.push(cur);
    }
    return out;
  }

  /* ---------- Mise en page de la piste principale (séquentielle, avec chevauchement des transitions) ----------
   * clips : [{dur, transition:{type,dur}|null}] -> ajoute start et td (chevauchement avec le clip précédent). Retourne la durée totale. */
  function layoutClips(clips) {
    let prev = null;
    clips.forEach(c => {
      let td = 0;
      if (prev && prev.transition) {
        td = Math.min(prev.transition.dur, 0.5 * Math.min(prev.dur, c.dur));
        if (td < 0.05) td = 0;
      }
      c.td = td;
      c.start = prev ? prev.start + prev.dur - td : 0;
      prev = c;
    });
    const last = clips[clips.length - 1];
    return last ? last.start + last.dur : 0;
  }

  return { RATIOS, canvasSize, nearestRatio, EFFECTS, TRANSITIONS, FONTS, EMOJI_CATEGORIES, emojiCode, splitEmoji, layoutClips };
});
