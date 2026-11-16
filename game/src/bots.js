// bots.js — one job: the shadow bots' brains.
// State machine: patrol (walk the waypoint graph) -> chase (a target was seen
// or heard) -> engage (line of sight + range: strafe and shoot in bursts) ->
// hold (defend a bombsite after planting starts). Bots hear gunfire: a shot
// within 18 m pulls nearby patrol bots toward the shooter. Bosses (rounds 5
// and 10) are bigger, slower, tougher, and charge the player.
import { MAP, collide, losClear, nearestWp, bfsPath, EDGES } from './map.js';
import { fireWeapon, startReload } from './weapons.js';
import { darkBoost } from './light.js';
import { sfx } from './audio.js';

const EYE = 1.62;

function dist2d(a, b) { return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); }

export function spawnEnemies(st) {
  const diff = st.diff;
  const bossRound = st.round % 5 === 0;
  const count = bossRound ? diff.enemyCount + 1 : diff.enemyCount + Math.floor((st.round - 1) / 2);
  st.enemies = [];
  for (let i = 0; i < count; i++) {
    const s = MAP.enemySpawns[i % MAP.enemySpawns.length];
    const e = {
      kind: 'enemy', team: 1, alive: true,
      pos: { x: s.x + st.rng.range(-1, 1), y: 0, z: s.z + st.rng.range(-1, 1) },
      vel: { x: 0, z: 0 }, yaw: s.yaw, pitch: 0,
      hp: diff.enemyHp, maxHp: diff.enemyHp,
      crouch: false, moving: false, speed: 0,
      weapon: 'lantern', mag: 30, reserve: 999, reloading: 0,
      fireCooldown: 0, spreadBloom: 0, recoil: 0,
      state: 'patrol', wp: st.rng.int(0, MAP.waypoints.length - 1),
      holdUntil: 0, target: null, lastSeen: null, hearAt: null,
      burstLeft: 0, aimErr: 0, reactAt: 0, strafeDir: st.rng.chance(0.5) ? 1 : -1,
      isBoss: false, radius: 0.42, height: 1.7, litUntil: 0,
      grenades: 0,
    };
    st.enemies.push(e);
  }
  if (bossRound) {
    const b = st.enemies[0];
    b.isBoss = true; b.hp = b.maxHp = diff.enemyHp * 4; b.radius = 0.7; b.height = 2.6;
    b.pos.x = 0; b.pos.z = 21; b.state = 'chase';
    st.waveNote = 'BOSS — THE GLOAM BRUTE';
    sfx.waveHorn();
  } else {
    st.waveNote = 'Round ' + st.round + ' — ' + count + ' shadows';
  }
}

export function spawnAllies(st) {
  st.allies = [];
  for (let i = 0; i < 2; i++) {
    const s = MAP.allySpawns[i];
    const a = {
      kind: 'ally', team: 0, alive: true,
      pos: { x: s.x, y: 0, z: s.z }, vel: { x: 0, z: 0 },
      yaw: s.yaw, pitch: 0, hp: 100, maxHp: 100,
      crouch: false, moving: false, speed: 0,
      weapon: 'lantern', mag: 32, reserve: 999, reloading: 0,
      fireCooldown: 0, spreadBloom: 0, recoil: 0,
      state: 'patrol', wp: st.rng.int(0, MAP.waypoints.length - 1),
      holdUntil: 0, target: null, lastSeen: null, hearAt: null,
      burstLeft: 0, aimErr: 0, reactAt: 0, strafeDir: 1,
      isBoss: false, radius: 0.42, height: 1.7, litUntil: 0, grenades: 0,
    };
    st.allies.push(a);
  }
}

// Can `a` see `b`? Range + line of sight + a forward-facing cone (bots do
// not have eyes in the back of their heads).
export function canSee(a, b, range) {
  const d = dist2d(a, b);
  if (d > range) return false;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const dot = ((b.pos.x - a.pos.x) * fx + (b.pos.z - a.pos.z) * fz) / Math.max(0.01, d);
  if (dot < 0.35 && d > 2) return false;
  return losClear(a.pos.x, a.pos.z, b.pos.x, b.pos.z, MAP.walls);
}

function moveToward(a, tx, tz, speed, dt) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  a.vel.x = vx; a.vel.z = vz;
  a.pos.x += vx * dt; a.pos.z += vz * dt;
  collide(a.pos, a.radius, MAP.walls);
  a.moving = true; a.speed = speed;
  a.yaw = Math.atan2(-(tx - a.pos.x), -(tz - a.pos.z));
  return d < 0.6;
}

function pickTarget(st, a, foes) {
  let best = null, bestD = 1e9;
  for (const f of foes) {
    if (!f.alive) continue;
    const d = dist2d(a, f);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

export function stepBot(st, a, foes, dt) {
  if (!a.alive) return;
  const diff = st.diff;
  const boost = a.team === 1 ? darkBoost(st) : 1;
  const speed = (a.isBoss ? 2.6 : diff.enemySpeed) * boost;
  if (a.fireCooldown > 0) a.fireCooldown -= dt;
  if (a.reloading > 0) { a.reloading -= dt; if (a.reloading <= 0) { a.mag = 30; } }
  a.moving = false;

  // Pick the nearest living foe, but only react when seen or heard.
  const foe = pickTarget(st, a, foes);
  let seen = false;
  if (foe && canSee(a, foe, a.isBoss ? 40 : 30)) {
    seen = true;
    if (!a.target) a.reactAt = st.time + 0.45; // reaction delay: fair, not instant
    a.target = foe;
    a.lastSeen = { x: foe.pos.x, z: foe.pos.z };
    a.lastContact = st.time;
  }
  // Gunfire is loud: investigate the sound even without a target.
  if (a.hearAt && !a.target) {
    if (moveToward(a, a.hearAt.x, a.hearAt.z, speed, dt)) a.hearAt = null;
    return;
  }
  if (a.hearAt && foe) {
    const hd = Math.hypot(a.pos.x - a.hearAt.x, a.pos.z - a.hearAt.z);
    if (hd < 3) { a.target = foe; a.lastSeen = { x: foe.pos.x, z: foe.pos.z }; a.hearAt = null; }
  }

  if (a.state === 'hold') {
    // hold position: face the site, shoot anything that appears.
    if (a.target && st.time >= a.reactAt) shootAt(st, a, a.target, dt);
    return;
  }

  if (a.target && a.target.alive && st.time >= a.reactAt) {
    const d = dist2d(a, a.target);
    if (seen) a.lastSeen = { x: a.target.pos.x, z: a.target.pos.z };
    if (d > 26 || !seen) {
      // lost sight: push to the last known position — around walls, not
      // through them: use the waypoint graph when the direct line is blocked
      if (a.lastSeen) {
        if (losClear(a.pos.x, a.pos.z, a.lastSeen.x, a.lastSeen.z, MAP.walls)) {
          if (moveToward(a, a.lastSeen.x, a.lastSeen.z, speed, dt)) a.target = null;
        } else {
          walkBotPath(st, a, a.lastSeen.x, a.lastSeen.z, speed, dt);
          if (Math.hypot(a.pos.x - a.lastSeen.x, a.pos.z - a.lastSeen.z) < 1.5) a.target = null;
        }
      }
    } else if (d > 7 || a.isBoss) {
      // close the distance (bosses always charge)
      moveToward(a, a.target.pos.x, a.target.pos.z, speed, dt);
      if (d < 18) shootAt(st, a, a.target, dt);
    } else {
      // in range: strafe sideways and fire in bursts
      a.strafeDir = st.rng.chance(0.01) ? -a.strafeDir : a.strafeDir;
      const px = -Math.cos(a.yaw) * a.strafeDir, pz = Math.sin(a.yaw) * a.strafeDir;
      a.pos.x += px * speed * 0.5 * dt; a.pos.z += pz * speed * 0.5 * dt;
      collide(a.pos, a.radius, MAP.walls);
      a.moving = true;
      shootAt(st, a, a.target, dt);
    }
    return;
  }

  // Patrol: walk the waypoint graph, pausing at nodes to "hold" briefly.
  // After 25 s without contact, hunt: converge on the player's side of the
  // yard instead of patrolling the far side forever (a round must end).
  if (st.time - (a.lastContact || 0) > 25 && a.team === 1) {
    const huntWp = nearestWp(st.player.pos.x, st.player.pos.z);
    if (a.wp !== huntWp) a.wp = huntWp;
  }
  if (st.time < a.holdUntil) return;
  const wp = MAP.waypoints[a.wp];
  const dwp = Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z);
  if (dwp < 1.0) {
    const next = EDGES[a.wp];
    a.wp = next[st.rng.int(0, next.length - 1)];
    if (st.rng.chance(0.3)) a.holdUntil = st.time + st.rng.range(1, 3);
    return;
  }
  // Route around walls via the graph when the straight line is blocked;
  // a straight push into a wall just slides along it forever.
  if (losClear(a.pos.x, a.pos.z, wp.x, wp.z, MAP.walls)) {
    moveToward(a, wp.x, wp.z, speed * 0.6, dt);
  } else {
    walkBotPath(st, a, wp.x, wp.z, speed * 0.6, dt);
  }
}

// Walk the waypoint graph toward (tx, tz) — the bot's version of the
// autopilot's walkPath. Recomputed at most every 1.5 s per bot.
function walkBotPath(st, a, tx, tz, speed, dt) {
  if (!a._path || a._path.length === 0 || st.time - (a._pathAt || 0) > 1.5) {
    a._path = bfsPath(nearestWp(a.pos.x, a.pos.z), nearestWp(tx, tz));
    a._pathAt = st.time;
  }
  const next = MAP.waypoints[a._path[0]];
  const dx = next.x - a.pos.x, dz = next.z - a.pos.z;
  if (Math.hypot(dx, dz) < 1.0) { a._path.shift(); return; }
  moveToward(a, next.x, next.z, speed, dt);
}
function shootAt(st, a, t, dt) {
  const d = dist2d(a, t);
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
  const want = Math.atan2(-dx, -dz);
  // turn toward the target, limited turn rate
  let diff = want - a.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  a.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  if (Math.abs(diff) > 0.35) return; // still turning
  const acc = a.team === 1 ? st.diff.enemyAcc : 0.5;
  const err = (1 - acc) * 0.09 + d * 0.0012;
  a.yaw += (st.rng.next() - 0.5) * err * 2;
  // aim at the torso (y ~1.0 from eye 1.62): pitch down, plus error
  a.pitch = Math.atan2(1.0 - EYE, Math.max(1, d)) + (st.rng.next() - 0.5) * err;
  if (a.burstLeft <= 0) {
    if (st.rng.chance(0.02 + acc * 0.03)) a.burstLeft = 3;
    return;
  }
  if (a.mag <= 0) { startReload(st, a); return; }
  const foes = a.team === 1 ? [st.player, ...st.allies] : st.enemies;
  // Enemy damage is difficulty-scaled (and boosted in the dark); allies use
  // their weapon's damage. fireWeapon applies it in traceHit.
  const dmg = a.team === 1 ? st.diff.enemyDmg * darkBoost(st) : undefined;
  fireWeapon(st, a, foes, false, dmg);
  a.burstLeft -= 1;
}

// Gunfire is loud: bots within 18 m hear it and investigate.
export function hearShot(st, from) {
  for (const e of st.enemies) {
    if (!e.alive || e.target) continue;
    const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
    if (d < 18) e.hearAt = { x: from.x, z: from.z };
  }
}
