// state.js — one job: the single state store. Every module reads and writes
// this one object; nothing else keeps gameplay state. The fixed-step simulation
// (sim.js) mutates it, the renderer (world.js) only reads it, and the HUD
// (hud.js) only reads it. No module allocates in the hot loop: vectors are
// plain {x,y,z} objects created once at spawn time and reused.
import { makeRng } from './rng.js';

export const DIFFS = {
  ember:   { label: 'Ember',   enemyHp: 55,  enemyAcc: 0.30, enemyDmg: 7,  enemySpeed: 3.0, enemyCount: 3, money: 900 },
  blaze:   { label: 'Blaze',   enemyHp: 80,  enemyAcc: 0.45, enemyDmg: 10, enemySpeed: 3.6, enemyCount: 4, money: 800 },
  inferno: { label: 'Inferno', enemyHp: 110, enemyAcc: 0.60, enemyDmg: 14, enemySpeed: 4.2, enemyCount: 5, money: 800 },
};

export const WEAPONS = {
  lantern: { name: 'Lantern SMG', price: 0,    damage: 16, headMul: 2.0, rof: 0.115, mag: 32, reserve: 128, spread: 0.011, moveSpread: 0.030, recoil: 0.011, reload: 1.5, auto: true,  range: 60 },
  ember:   { name: 'Ember Rifle', price: 650,  damage: 30, headMul: 2.2, rof: 0.150, mag: 25, reserve: 100, spread: 0.006, moveSpread: 0.022, recoil: 0.016, reload: 1.9, auto: true,  range: 80 },
  dusk:    { name: 'Dusk Scattergun', price: 550, damage: 11, headMul: 1.6, rof: 0.85, mag: 6, reserve: 30, spread: 0.045, moveSpread: 0.06, recoil: 0.045, reload: 2.4, auto: false, pellets: 7, range: 28 },
  glimmer: { name: 'Glimmer Pistol', price: 200, damage: 22, headMul: 2.0, rof: 0.22, mag: 12, reserve: 60, spread: 0.009, moveSpread: 0.026, recoil: 0.013, reload: 1.2, auto: false, range: 45 },
};

export function freshState(seed, difficulty) {
  const diff = DIFFS[difficulty] || DIFFS.ember;
  return {
    seed, difficulty, diff,
    rng: makeRng(seed),
    time: 0, stepCount: 0,
    mode: 'title',            // title | buy | playing | roundEnd | won | lost
    round: 1, maxRounds: 10,  // rounds 5 and 10 are boss rounds
    roundTimer: 100,          // seconds left in the round
    score: 0, roundsWon: 0, roundsLost: 0,
    money: diff.money, kills: 0, shots: 0, hits: 0, headshots: 0,
    battery: 100,             // lantern charge 0..100; light is a resource
    lanternOn: false,
    bomb: { state: 'carried', site: null, timer: 0, plantAt: null, progress: 0 },
    player: newAgent('player', 0, 0, -16, 0),
    allies: [],
    enemies: [],
    tracers: [],              // pooled visual tracers {a:{},b:{},life}
    bursts: [],               // pooled particle bursts
    grenades: [],
    pickups: [],              // battery cells
    feed: [],                 // kill feed strings, newest first
    shake: 0, hitStop: 0, flash: 0, slowmo: 0,
    message: '', messageUntil: 0,
    waveNote: '',
    stats: { damageDealt: 0 },
  };
}

export function newAgent(kind, x, z, yaw, team) {
  return {
    kind, team, alive: true,
    pos: { x, y: 0, z }, vel: { x: 0, z: 0 },
    yaw, pitch: 0, hp: 100, maxHp: 100,
    crouch: false, moving: false, speed: 0,
    weapon: 'lantern', mag: 32, reserve: 128, reloading: 0,
    fireCooldown: 0, spreadBloom: 0, recoil: 0,
    // bot-only fields (unused for the player, kept in one place)
    state: 'patrol', wp: 0, holdUntil: 0, target: null, lastSeen: null,
    hearAt: null, burstLeft: 0, aimErr: 0, reactAt: 0, strafeDir: 1,
    isBoss: false, radius: 0.42, height: 1.7,
  };
}

// Reuse a pooled tracer instead of allocating a new object per shot.
export function spawnTracer(st, ax, ay, az, bx, by, bz, color) {
  let t = null;
  for (let i = 0; i < st.tracers.length; i++) if (st.tracers[i].life <= 0) { t = st.tracers[i]; break; }
  if (!t) { if (st.tracers.length >= 24) return; t = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, life: 0, color: 0xffcc66 }; st.tracers.push(t); }
  t.a.x = ax; t.a.y = ay; t.a.z = az; t.b.x = bx; t.b.y = by; t.b.z = bz; t.life = 0.09; t.color = color;
}

export function spawnBurst(st, x, y, z, color, n) {
  let b = null;
  for (let i = 0; i < st.bursts.length; i++) if (st.bursts[i].life <= 0) { b = st.bursts[i]; break; }
  if (!b) { if (st.bursts.length >= 16) return; b = { x: 0, y: 0, z: 0, life: 0, color: 0xffffff, n: 8 }; st.bursts.push(b); }
  b.x = x; b.y = y; b.z = z; b.life = 0.5; b.color = color; b.n = n;
}
