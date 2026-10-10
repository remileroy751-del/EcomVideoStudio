// Régénère src/js/emoji-data.js à partir du paquet npm @twemoji/svg (graphismes CC-BY 4.0).
// Utilisation (optionnelle) : npm i --no-save @twemoji/svg && node scripts/build-emoji.js
const fs = require('fs'), path = require('path');
const EVS = require('../src/shared/data.js');
const dir = path.join(require.resolve('@twemoji/svg/package.json'), '..', 'assets');
const base = fs.existsSync(dir) ? dir : path.join(dir, '..');
const out = {}; const missing = [];
EVS.EMOJI_CATEGORIES.forEach(cat => EVS.splitEmoji(cat.chars).forEach(ch => {
  const code = EVS.emojiCode(ch);
  const f = path.join(base, code + '.svg');
  if (fs.existsSync(f)) out[code] = 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
  else missing.push(ch + ' ' + code);
}));
fs.writeFileSync(path.join(__dirname, '..', 'src', 'js', 'emoji-data.js'),
  '/* Emoji Twemoji © Twitter, Inc. / jdecked — licence CC-BY 4.0 — https://github.com/jdecked/twemoji */\nwindow.EMOJI_SVG = ' + JSON.stringify(out) + ';\n');
console.log('Emoji embarqués :', Object.keys(out).length, '| absents :', missing.join(' ') || 'aucun');
