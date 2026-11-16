// sim.js — one job: the fixed-step simulation, kept apart from rendering.
// main.js accumulates real time and calls step() at exactly 1/60 s; rendering
// never feeds back into the sim. One step: input -> player -> lantern ->
// bots -> bomb -> grenades -> pickups -> round end checks -> juice decay.
import { stepPlayer } from './player.js';
import { stepLight } from './light.js';
import { stepBot, hearShot } from './bots.js';
import { stepBomb, stepPickups, endRound, afterRound, startRound } from './rounds.js';
import { fireWeapon, startReload, finishReload, stepGrenades, throwGrenade } from './weapons.js';
import { WEAPONS } from './state.js';
import { stepJuice } from './juice.js';
import { sfx } from './audio.js';

export const STEP = 1 / 60;

export function step(st, input, dt) {
  st.time += dt;
  st.stepCount += 1;

  // Buffered fire input: a click up to ~100 ms before the weapon is ready
  // still fires (input buffer, cheatsheet 1.4).
  if (input.fireQueued > 0) input.fireQueued -= dt;

  if (st.mode === 'playing') {
    stepPlayer(st, input, dt);
    stepLight(st, dt);

    // firing: auto weapons fire while held; semi-auto fire once per click
    // (input.fireEdge is set by main.js on mousedown and cleared here).
    const p = st.player;
    const wdef = WEAPONS[p.weapon];
    if (p.alive && p.reloading <= 0) {
      const wantFire = wdef.auto ? input.firing : input.fireEdge;
      if (wantFire && p.mag > 0 && p.fireCooldown <= 0) {
        hearShot(st, p.pos); // gunfire is loud: nearby shadows investigate
        fireWeapon(st, p, st.enemies, true);
      }
    }
    input.fireEdge = false;
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) finishReload(p);
    }
    if (input.reloadQueued) { input.reloadQueued = false; startReload(st, p); }
    if (input.grenadeQueued) { input.grenadeQueued = false; throwGrenade(st, p); }

    // bots: enemies hunt the player and allies; allies hunt shadows
    for (const e of st.enemies) stepBot(st, e, [st.player, ...st.allies], dt);
    for (const a of st.allies) stepBot(st, a, st.enemies, dt);

    stepBomb(st, dt);
    stepGrenades(st, dt);
    stepPickups(st);

    // round timer
    st.roundTimer -= dt;
    if (st.roundTimer <= 0) {
      endRound(st, st.bomb.state === 'planted', st.bomb.state === 'planted' ? 'Time — the charge will finish the job.' : 'Time up — the shadows hold the yard.');
    } else if (!st.player.alive) {
      endRound(st, false, 'You fell. The dark keeps the yard.');
    } else if (st.enemies.length > 0 && st.enemies.every((e) => !e.alive)) {
      endRound(st, true, 'Yard clear — every shadow down.');
    }
  } else if (st.mode === 'roundEnd') {
    // let the dust settle, then advance
    if (st.time >= (st.roundEndAt || 0)) afterRound(st);
    for (const e of st.enemies) if (e.alive) stepBot(st, e, [st.player, ...st.allies], dt);
  } else if (st.mode === 'buy') {
    stepLight(st, dt); // battery recharges between rounds
    if (st.time >= (st.buyUntil || 0)) startRound(st);
  }

  // tracers / bursts decay
  for (const t of st.tracers) if (t.life > 0) t.life -= dt;
  for (const b of st.bursts) if (b.life > 0) b.life -= dt;
  stepJuice(st, dt);
}
