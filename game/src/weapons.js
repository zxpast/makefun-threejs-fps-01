// weapons.js — one job: shooting. Hitscan with per-body-part damage (head
// shots pay more), spread and recoil that punish firing on the move, and ammo
// that runs out. All hit math is 2D + height bands, no allocations in the
// hot loop: the ray walks the enemy list with plain numbers.
import { WEAPONS, spawnTracer, spawnBurst } from './state.js';
import { losClear, MAP } from './map.js';
import { sfx } from './audio.js';
import { killJuice, addShake } from './juice.js';

const EYE = 1.62; // eye height
const HEAD_Y = 1.55, BODY_Y = 0.95;

export function eyePos(a, out) { out.x = a.pos.x; out.y = EYE - (a.crouch ? 0.35 : 0); out.z = a.pos.z; return out; }

// Direction from yaw/pitch. Reuses the caller's object.
export function aimDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

const _e = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

// Fire one trigger pull for agent `a` (player, ally or bot). `st` is the store,
// `targets` the opposing agents. Returns the agent hit, or null.
export function fireWeapon(st, a, targets, isPlayer, dmgOverride) {
  const w = WEAPONS[a.weapon];
  if (a.reloading > 0 || a.fireCooldown > 0) return null;
  if (a.mag <= 0) { if (isPlayer) sfx.dryFire(); a.fireCooldown = 0.25; return null; }
  a.mag -= 1;
  a.fireCooldown = w.rof;
  st.shots += isPlayer ? 1 : 0;
  if (isPlayer) st._lastShotAt = st.time; // viewmodel squash clock (sim time)
  const pellets = w.pellets || 1;
  let anyHit = null;
  eyePos(a, _e);
  // Spread grows while moving and with bloom from sustained fire; stopping to
  // aim pays (spread shrinks back toward the base value when still).
  const moveK = a.moving ? w.moveSpread : w.spread;
  const spread = moveK + a.spreadBloom;
  for (let p = 0; p < pellets; p++) {
    aimDir(a.yaw + a.recoil * 0.4, a.pitch + a.recoil * 0.4, _d);
    const rx = (st.rng.next() - 0.5) * 2 * spread;
    const ry = (st.rng.next() - 0.5) * 2 * spread;
    _d.x += rx; _d.y += ry; _d.z += (st.rng.next() - 0.5) * 2 * spread;
    const dl = Math.hypot(_d.x, _d.y, _d.z);
    _d.x /= dl; _d.y /= dl; _d.z /= dl;
    const hit = traceHit(st, a, _e, _d, w.range, targets, isPlayer, dmgOverride);
    if (hit) anyHit = hit;
    // tracer end: hit point, or max range
    const tx = _e.x + _d.x * (hit ? hit.dist : w.range);
    const ty = _e.y + _d.y * (hit ? hit.dist : w.range);
    const tz = _e.z + _d.z * (hit ? hit.dist : w.range);
    spawnTracer(st, _e.x, _e.y, _e.z, tx, ty, tz, a.team === 0 ? 0xffcc66 : 0xaa66ff);
  }
  a.spreadBloom = Math.min(0.05, a.spreadBloom + w.recoil * 0.5);
  a.recoil = Math.min(0.09, a.recoil + w.recoil);
  if (isPlayer) { sfx.shot(a.weapon); addShake(st, a.weapon === 'dusk' ? 4 : 2); }
  else sfx.enemyShot();
  return anyHit;
}

// Ray vs agents: nearest agent whose body cylinder the ray crosses, provided
// no wall blocks the line of sight first. Head band pays the head multiplier.
function traceHit(st, shooter, origin, dir, range, targets, isPlayer, dmgOverride) {
  let best = null, bestDist = range;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive || t === shooter) continue;
    const dx = t.pos.x - origin.x, dz = t.pos.z - origin.z;
    const along = dx * dir.x + dz * dir.z;
    if (along < 0.5 || along > bestDist) continue;
    const px = origin.x + dir.x * along, pz = origin.z + dir.z * along;
    const radial = Math.hypot(t.pos.x - px, t.pos.z - pz);
    if (radial > t.radius + 0.15) continue;
    const yAt = origin.y + dir.y * along;
    if (yAt < 0.1 || yAt > t.height + 0.15) continue;
    if (!losClear(origin.x, origin.z, t.pos.x, t.pos.z, MAP.walls)) continue;
    best = t; bestDist = along;
  }
  // Wall cap: if a wall stands closer than the target, the shot is blocked.
  if (best && !wallClear(origin, dir, bestDist)) return null;
  if (!best) return null;
  const w = WEAPONS[shooter.weapon];
  const yAt = origin.y + dir.y * bestDist;
  const head = yAt > HEAD_Y;
  // Bots use difficulty-scaled damage; the player and allies use weapon damage.
  let dmg = (dmgOverride !== undefined ? dmgOverride : w.damage) * (head ? w.headMul : 1);
  // Lit shadows burn: a target caught in your lantern light takes double.
  if (best.litUntil && best.litUntil > st.time) dmg *= 2;
  // Falloff past half range.
  if (bestDist > w.range * 0.5) dmg *= 0.8;
  best.hp -= dmg;
  st.stats.damageDealt += isPlayer ? dmg : 0;
  if (isPlayer) { st.hits += 1; if (head) { st.headshots += 1; sfx.headshot(); } else sfx.hit(); }
  spawnBurst(st, best.pos.x, Math.min(yAt, 1.6), best.pos.z, head ? 0xff5533 : 0xffcc66, head ? 10 : 6);
  if (best.hp <= 0) {
    best.alive = false;
    if (isPlayer) {
      st.kills += 1; st.score += head ? 150 : 100; st.money += 150;
      st.feed.unshift((head ? 'HEADSHOT ' : '') + 'Shadow down  +$150');
      if (st.feed.length > 5) st.feed.pop();
      sfx.kill(); killJuice(st);
    }
  }
  return { agent: best, dist: bestDist, head };
}

// True when no tall wall crosses the ray before `dist`.
function wallClear(o, d, dist) {
  const steps = Math.ceil(dist / 0.5);
  for (let s = 1; s <= steps; s++) {
    const t = (s / steps) * dist;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    for (let i = 0; i < MAP.walls.length; i++) {
      const w = MAP.walls[i];
      if (w.h < 2.0) continue;
      if (x >= w.x1 && x <= w.x2 && z >= w.z1 && z <= w.z2) return false;
    }
  }
  return true;
}

export function startReload(st, a) {
  const w = WEAPONS[a.weapon];
  if (a.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return false;
  a.reloading = w.reload;
  sfx.reload();
  return true;
}

export function finishReload(a) {
  const w = WEAPONS[a.weapon];
  const need = w.mag - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
}

// Flare grenade: a burst of light that burns every shadow in radius and
// marks them lit for 4 seconds. The player's one tactical tool.
export function throwGrenade(st, a) {
  if (a.grenades <= 0) return false;
  a.grenades -= 1;
  eyePos(a, _e); aimDir(a.yaw, a.pitch, _d);
  const gx = _e.x + _d.x * 6, gz = _e.z + _d.z * 6;
  st.grenades.push({ x: gx, y: 0.4, z: gz, vx: _d.x * 6, vy: 3, vz: _d.z * 6, t: 0.9, fuse: 0.9 });
  sfx.grenade();
  return true;
}

export function stepGrenades(st, dt) {
  for (let i = st.grenades.length - 1; i >= 0; i--) {
    const g = st.grenades[i];
    g.t -= dt; g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt; g.vy -= 9 * dt;
    if (g.y < 0.3) { g.y = 0.3; g.vy = 0; }
    if (g.t > 0) continue;
    // detonate: light burst
    spawnBurst(st, g.x, 1, g.z, 0xfff2aa, 26);
    addShake(st, 5); sfx.explosion();
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - g.x, e.pos.z - g.z);
      if (d < 7) { e.hp -= 70; e.litUntil = st.time + 4; if (e.hp <= 0) { e.alive = false; st.kills += 1; st.score += 100; st.money += 150; sfx.kill(); } }
    }
    st.grenades.splice(i, 1);
  }
}
