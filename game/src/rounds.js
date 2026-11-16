// rounds.js — one job: the round loop and the economy.
// Win a round by eliminating every shadow, or by planting the light-charge at
// site A or B and letting it detonate. Lose it by dying or by the timer
// running out with the charge unplanted. Money is earned per kill (+$150),
// per round win (+$400) and per plant (+$300); between rounds the buy menu
// spends it on weapons and flare grenades. Rounds 5 and 10 are boss rounds;
// clearing round 10 wins the campaign, then endless rounds continue.
import { WEAPONS, newAgent } from './state.js';
import { MAP } from './map.js';
import { spawnEnemies, spawnAllies } from './bots.js';
import { sfx } from './audio.js';

export const ROUND = {
  time: 100, plantTime: 3.2, detonateTime: 35, defuseTime: 4,
  winBonus: 400, plantBonus: 300, killBonus: 150,
};

export function startRound(st) {
  const diff = st.diff;
  st.roundTimer = ROUND.time;
  st.bomb = { state: 'carried', site: null, timer: 0, plantAt: null, progress: 0 };
  st.mode = 'playing';
  const p = st.player;
  p.alive = true; p.hp = 100; p.maxHp = 100;
  p.pos.x = MAP.playerSpawn.x; p.pos.z = MAP.playerSpawn.z; p.yaw = MAP.playerSpawn.yaw; p.pitch = 0;
  p.vel.x = 0; p.vel.z = 0; p.grenades = p.grenades ?? 2;
  const w = WEAPONS[p.weapon];
  p.mag = Math.min(w.mag, p.mag); // keep what you bought; ammo tops up below
  p.reserve = Math.max(p.reserve, w.reserve);
  p.reloading = 0; p.fireCooldown = 0;
  spawnAllies(st);
  spawnEnemies(st);
  // battery cells on the map: light is a resource, and running dry is a choice
  st.pickups = [
    { x: -6, z: 0, kind: 'cell', taken: false },
    { x: 6, z: 0, kind: 'cell', taken: false },
    { x: 0, z: 12, kind: 'cell', taken: false },
  ];
  st.message = st.waveNote;
  st.messageUntil = st.time + 3;
}

// Buy menu: called from the buy phase. Returns true when the purchase lands.
export function buy(st, id) {
  if (st.mode !== 'buy') return false;
  const p = st.player;
  if (id === 'grenade') {
    if (st.money < 300 || (p.grenades || 0) >= 4) return false;
    st.money -= 300; p.grenades = (p.grenades || 0) + 1; sfx.buy(); return true;
  }
  const w = WEAPONS[id];
  if (!w || w.price <= 0) return false;
  if (st.money < w.price || p.weapon === id) return false;
  st.money -= w.price;
  p.weapon = id; p.mag = w.mag; p.reserve = w.reserve;
  sfx.buy();
  return true;
}

export function buyList(st) {
  return Object.entries(WEAPONS)
    .filter(([id, w]) => w.price > 0)
    .map(([id, w]) => ({ id, name: w.name, price: w.price, owned: st.player.weapon === id, damage: w.damage, mag: w.mag }));
}

// Planting: stand inside a site and hold E (progress). Defuse is the bots'
// job when the charge is planted — they converge on it.
export function stepBomb(st, dt) {
  const b = st.bomb;
  const p = st.player;
  if (b.state === 'carried' && p.alive) {
    for (const key of ['A', 'B']) {
      const s = MAP.sites[key];
      const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
      if (d < s.r) {
        if (st.input.plant) {
          b.progress += dt;
          b.site = key;
          if (b.progress >= ROUND.plantTime) {
            b.state = 'planted'; b.timer = ROUND.detonateTime;
            st.money += ROUND.plantBonus; st.score += 200;
            st.message = 'CHARGE PLANTED at ' + s.name + ' — hold the site!';
            st.messageUntil = st.time + 4;
            sfx.plant();
            // every living shadow converges on the planted site
            for (const e of st.enemies) if (e.alive) { e.state = 'chase'; e.lastSeen = { x: s.x, z: s.z }; e.target = p; }
          }
        } else b.progress = Math.max(0, b.progress - dt * 2);
        return;
      }
    }
    b.progress = 0; b.site = null;
  } else if (b.state === 'planted') {
    b.timer -= dt;
    if (Math.floor(b.timer) !== Math.floor(b.timer + dt)) sfx.beep(b.timer < 5);
    if (b.timer <= 0) { endRound(st, true, 'The charge detonated — site cleansed.'); return; }
    // a bot standing on the site defuses over time
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const s = MAP.sites[b.site];
      if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) < 2.5) {
        b.progress += dt;
        if (b.progress >= ROUND.defuseTime) { b.state = 'defused'; endRound(st, false, 'The shadows defused the charge.'); return; }
        break;
      }
    }
  }
}

export function endRound(st, won, reason) {
  st.mode = 'roundEnd';
  st.roundEndAt = st.time + 3.5;
  st.roundResult = { won, reason };
  if (won) {
    st.roundsWon += 1; st.money += ROUND.winBonus; st.score += 500;
    sfx.roundWin();
  } else {
    st.roundsLost += 1;
    sfx.roundLose();
  }
  st.message = reason;
  st.messageUntil = st.time + 3.5;
}

export function afterRound(st) {
  // Campaign won at 10 round wins, whatever round number that lands on
  // (lost rounds in between do not move the goalpost); after that, endless
  // rounds continue only if the player keeps playing from the win screen.
  if (st.roundsWon >= st.maxRounds) { st.mode = 'won'; return; }
  if (st.roundsLost >= 4) { st.mode = 'lost'; return; }
  st.round += 1;
  st.mode = 'buy';
  st.buyUntil = st.time + 25;
}

// Pickups: walk over a glow cell to restore 40 battery.
export function stepPickups(st) {
  const p = st.player;
  if (!p.alive) return;
  for (const pk of st.pickups) {
    if (pk.taken) continue;
    if (Math.hypot(p.pos.x - pk.x, p.pos.z - pk.z) < 1.2) {
      pk.taken = true;
      st.battery = Math.min(100, st.battery + 40);
      st.message = 'Glow cell +40 light';
      st.messageUntil = st.time + 1.5;
      sfx.pickup();
    }
  }
}
