// light.js — one job: the lantern, the game's one idea.
// "Light is the only weapon — and your light runs out."
// The lantern beam marks shadows `lit`: lit shadows take DOUBLE gun damage
// and cannot regenerate. A lantern blast (hold F) burns shadows outright but
// drains the battery fast. Battery recharges slowly between rounds and from
// glow-cell pickups. When the battery is empty the lantern dies — and the dark
// gets bold: enemies move faster and hit harder in the dark.
export const LIGHT = {
  drainBlast: 34,      // battery per second while blasting
  drainBeam: 2.5,      // battery per second while the beam is on
  recharge: 6,         // battery per second between rounds
  blastRange: 9, blastDps: 55, blastArc: 0.55,
  litSeconds: 3,
};

export function stepLight(st, dt) {
  const p = st.player;
  if (st.mode === 'buy' || st.mode === 'roundEnd') {
    st.battery = Math.min(100, st.battery + LIGHT.recharge * dt);
    return;
  }
  const wantBlast = st.input.blast && st.battery > 0 && p.alive;
  const wantBeam = st.input.beam && st.battery > 0 && p.alive;
  st.lanternOn = wantBeam || wantBlast;
  if (wantBlast) {
    st.battery = Math.max(0, st.battery - LIGHT.drainBlast * dt);
    blastEnemies(st, dt);
    if (st.time - (st._blastSfxAt || 0) > 0.3) { st._blastSfxAt = st.time; }
  } else if (wantBeam) {
    st.battery = Math.max(0, st.battery - LIGHT.drainBeam * dt);
    markLit(st, dt);
  }
  // lit marks expire
  for (const e of st.enemies) if (e.litUntil && e.litUntil < st.time) e.litUntil = 0;
}

// Beam: shadows inside the beam cone are marked lit for LIGHT.litSeconds.
function markLit(st, dt) {
  const p = st.player;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (const e of st.enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 26 || d < 0.01) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot > 0.86) e.litUntil = st.time + LIGHT.litSeconds;
  }
}

// Blast: a cone of burning light in front of the player.
function blastEnemies(st, dt) {
  const p = st.player;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (const e of st.enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > LIGHT.blastRange || d < 0.01) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < Math.cos(LIGHT.blastArc)) continue;
    e.hp -= LIGHT.blastDps * dt;
    e.litUntil = st.time + LIGHT.litSeconds;
    if (e.hp <= 0) {
      e.alive = false;
      st.kills += 1; st.score += 120; st.money += 150;
      st.feed.unshift('Lantern burn  +$150');
      if (st.feed.length > 5) st.feed.pop();
    }
  }
}

// Darkness modifier: with the lantern off and battery empty, shadows are
// bolder — they move 15% faster and deal 15% more damage.
export function darkBoost(st) {
  return st.battery <= 0.5 && !st.lanternOn ? 1.15 : 1.0;
}
