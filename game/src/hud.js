// hud.js — one job: the DOM HUD. Reads state, writes textContent and styles
// only when the value changed (cached), so the HUD never thrashes the DOM.
// Shows health, ammo, round timer, score, money, battery, wave and feed.
import { WEAPONS } from './state.js';
import { buyList } from './rounds.js';

const $ = (id) => document.getElementById(id);
const cache = {};

function setText(id, v) {
  if (cache[id] !== v) { cache[id] = v; const el = $(id); if (el) el.textContent = v; }
}
function setWidth(id, v) {
  if (cache[id] !== v) { cache[id] = v; const el = $(id); if (el) el.style.width = v; }
}
function show(id, on) {
  const key = id + ':show';
  if (cache[key] !== on) { cache[key] = on; const el = $(id); if (el) el.hidden = !on; }
}

export function updateHud(st) {
  const p = st.player;
  const w = WEAPONS[p.weapon];
  setText('hp-num', Math.max(0, Math.ceil(p.hp)) + '');
  setWidth('hp-bar', Math.max(0, p.hp) + '%');
  setText('ammo-mag', p.mag + '');
  setText('ammo-reserve', '/ ' + p.reserve);
  setText('ammo-name', w.name);
  setText('money', '$' + st.money);
  setText('score', st.score + '');
  setText('round', 'ROUND ' + st.round + ' / ' + st.maxRounds);
  setText('timer', fmtTime(Math.max(0, st.roundTimer)));
  setWidth('battery-bar', Math.max(0, st.battery) + '%');
  setText('battery-num', Math.floor(st.battery) + '%');
  setText('kills', st.kills + '');
  setText('diff', st.diff.label);
  setText('wave-note', st.waveNote || '');
  // bomb state
  const b = st.bomb;
  if (b.state === 'planted') {
    setText('bomb-status', 'CHARGE PLANTED ' + (b.site || '') + ' — ' + Math.ceil(b.timer) + 's');
    show('bomb-status', true);
  } else if (b.state === 'carried' && b.progress > 0.05) {
    setText('bomb-status', 'PLANTING ' + Math.round((b.progress / 3.2) * 100) + '%');
    show('bomb-status', true);
  } else show('bomb-status', false);
  // crosshair spread grows with movement + bloom
  const spread = 4 + (p.moving ? 6 : 0) + p.spreadBloom * 160;
  const ch = $('crosshair');
  if (ch) ch.style.setProperty('--spread', spread.toFixed(1) + 'px');
  // battery warning
  const bat = $('battery');
  if (bat) bat.classList.toggle('low', st.battery < 25);
  // message line
  const showMsg = st.time < st.messageUntil && st.message;
  setText('message', showMsg ? st.message : '');
  // kill feed
  const feed = st.feed.slice(0, 4).join('\n');
  setText('feed', feed);
  // grenades
  setText('grenades', '◉ ' + (p.grenades || 0));
  // flash overlay (damage / kill flash)
  const fl = $('flash');
  if (fl) fl.style.opacity = st.flash > 0 ? (st.flash * 0.5).toFixed(2) : '0';
}

export function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' : '') + ss;
}

// Buy menu: rebuilt only when opened or when money changes.
export function renderBuy(st, onBuy) {
  const list = buyList(st);
  const box = $('buy-list');
  if (!box) return;
  box.innerHTML = '';
  for (const item of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy-item' + (item.owned ? ' owned' : '');
    btn.disabled = item.owned || st.money < item.price;
    btn.textContent = item.name + ' — $' + item.price + ' (DMG ' + item.damage + ', MAG ' + item.mag + ')';
    btn.addEventListener('click', () => onBuy(item.id));
    box.appendChild(btn);
  }
  const g = document.createElement('button');
  g.type = 'button';
  g.className = 'buy-item';
  g.disabled = st.money < 300 || (st.player.grenades || 0) >= 4;
  g.textContent = 'Flare Grenade — $300 (you have ' + (st.player.grenades || 0) + ')';
  g.addEventListener('click', () => onBuy('grenade'));
  box.appendChild(g);
  setText('buy-money', '$' + st.money);
}

export function setOverlay(mode, st) {
  // mode: title | buy | playing | roundEnd | won | lost
  show('overlay-title', mode === 'title');
  show('overlay-buy', mode === 'buy');
  show('overlay-end', mode === 'roundEnd');
  show('overlay-final', mode === 'won' || mode === 'lost');
  const hud = $('hud');
  if (hud) hud.style.display = mode === 'playing' || mode === 'roundEnd' ? 'block' : 'none';
  if (mode === 'roundEnd' && st.roundResult) {
    setText('end-title', st.roundResult.won ? 'ROUND WON' : 'ROUND LOST');
    setText('end-copy', st.roundResult.reason || '');
    setText('end-score', 'Score ' + st.score + '  •  Rounds ' + st.roundsWon + '–' + st.roundsLost + '  •  Money $' + st.money);
  }
  if (mode === 'won' || mode === 'lost') {
    setText('final-title', mode === 'won' ? 'THE YARD IS LIT' : 'THE DARK KEEPS THE YARD');
    setText('final-copy', mode === 'won'
      ? 'Ten rounds held. The lantern never went out — endless rounds continue if you keep playing.'
      : 'Four rounds lost. The shadows close in. Press R to try the yard again.');
    setText('final-score', 'Final score ' + st.score + '  •  Kills ' + st.kills + '  •  Headshots ' + st.headshots + '  •  Accuracy ' + (st.shots ? Math.round((st.hits / st.shots) * 100) : 0) + '%');
  }
}
