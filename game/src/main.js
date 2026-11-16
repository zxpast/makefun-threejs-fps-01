// main.js — one job: wire everything together and run the loop.
// Fixed-step simulation (1/60 s) in sim.js, rendering in world.js, HUD in
// hud.js, input here. The loop never lets the sim fall behind more than 5
// steps; rendering reads the same state the sim wrote. No per-frame allocation
// in the loop body: the input object is created once and reused.
import { freshState } from './state.js';
import { hashSeed } from './rng.js';
import { step, STEP } from './sim.js';
import { initWorld, render } from './world.js';
import { updateHud, setOverlay, renderBuy } from './hud.js';
import { autopilotStep, autoReport } from './autopilot.js';
import { applyShot } from './shots.js';
import { startRound, buy } from './rounds.js';
import { unlockAudio, toggleMute, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) || 7 : (hashSeed('lanternfall') % 100000);
const difficulty = params.get('diff') || 'ember';
const auto = params.get('auto') === '1';
const shot = params.get('shot') || '';

// One input object for the whole session: listeners write to it, the sim
// reads it. Restart never replaces it, so keys never go dead.
const input = makeInput();
let st = freshState(seed, difficulty);
st.input = input;
if (shot) st = applyShot(st, shot, seed);
if (auto) { startRound(st); st.autoStart = performance.now(); }

const container = document.getElementById('game');
initWorld(container, st);
bindInput(st);
setOverlay(st.mode === 'title' ? 'title' : st.mode, st);
updateHud(st);

let last = performance.now();
let acc = 0;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - last);
  last = now;
  // hit-stop: freeze the sim briefly on kills (juice, 30-130 ms).
  // Decay here in real time: stepJuice (inside step) never runs while the
  // sim is frozen, so decaying only there deadlocks after the first kill.
  if (st.hitStop > 0) {
    st.hitStop -= dtMs / 1000;
    if (st.hitStop > 0) { render(st, now); return; }
  }
  acc += dtMs / 1000;
  let n = 0;
  while (acc >= STEP && n < 5) {
    if (auto) autopilotStep(st, st.input, STEP);
    step(st, st.input, STEP);
    acc -= STEP;
    n += 1;
  }
  if (n === 5) acc = 0; // never spiral behind
  // mode transitions owned by the loop, not by the sim
  if (st.mode !== st._shownMode) {
    st._shownMode = st.mode;
    setOverlay(st.mode, st);
    if (st.mode === 'buy') { renderBuy(st, (id) => tryBuy(st, id)); document.exitPointerLock?.(); }
  }
  render(st, now);
  updateHud(st);
  frames += 1;
  if (auto && st.mode !== 'playing' && st.mode !== 'roundEnd' && st.mode !== 'buy') {
    // autopilot finished a campaign: report once, then stop burning CPU
    if (!st._autoReported) {
      st._autoReported = true;
      document.title = autoReport(st);
      const el = document.getElementById('auto-result');
      if (el) el.textContent = autoReport(st);
      console.log('[AUTO] ' + autoReport(st));
    }
  }
  if (auto && st.mode === 'buy' && !st._autoBuyLogged) { /* autopilot buys in its own step */ }
}
requestAnimationFrame(frame);

// The auto harness reads this: after 150 s of autopilot, print the verdict.
if (auto) {
  setTimeout(() => {
    if (!st._autoReported) {
      st._autoReported = true;
      console.log('[AUTO] ' + autoReport(st) + ' (timeout)');
      document.title = autoReport(st);
    }
  }, 150000);
}

function makeInput() {
  return {
    f: false, b: false, l: false, r: false, crouch: false,
    lookDX: 0, lookDY: 0,
    firing: false, fireEdge: false, fireQueued: 0,
    reloadQueued: false, grenadeQueued: false,
    plant: false, beam: false, blast: false,
  };
}

function bindInput(st) {
  const input = st.input;
  const keymap = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r' };
  window.addEventListener('keydown', (e) => {
    if (e.code in keymap) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'ControlLeft' || e.code === 'KeyC') input.crouch = true;
    if (e.code === 'KeyR') input.reloadQueued = true;
    if (e.code === 'KeyQ') input.grenadeQueued = true;
    if (e.code === 'KeyE') input.plant = true;
    if (e.code === 'KeyF') input.blast = true;
    if (e.code === 'KeyG') input.beam = true;
    if (e.code === 'KeyB' && st.mode === 'playing') { /* buy is between rounds only */ }
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Enter' && st.mode === 'buy') startRound(st);
    if (e.code === 'KeyR' && (st.mode === 'won' || st.mode === 'lost')) restart(st);
    if (e.code === 'Digit1') tryBuy(st, 'lantern');
    if (e.code === 'Digit2') tryBuy(st, 'ember');
    if (e.code === 'Digit3') tryBuy(st, 'dusk');
    if (e.code === 'Digit4') tryBuy(st, 'glimmer');
    if (e.code === 'Digit5') tryBuy(st, 'grenade');
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in keymap) input[keymap[e.code]] = false;
    if (e.code === 'ControlLeft' || e.code === 'KeyC') input.crouch = false;
    if (e.code === 'KeyE') input.plant = false;
    if (e.code === 'KeyF') input.blast = false;
    if (e.code === 'KeyG') input.beam = false;
  });
  const playBtn = document.getElementById('play');
  if (playBtn) playBtn.addEventListener('click', () => {
    unlockAudio();
    sfx.click();
    startRound(st);
    lockPointer();
  });
  const againBtn = document.getElementById('again');
  if (againBtn) againBtn.addEventListener('click', () => restart(st));
  const startBtn = document.getElementById('start-round');
  if (startBtn) startBtn.addEventListener('click', () => { sfx.click(); startRound(st); lockPointer(); });
  // click the game to re-take the mouse after losing pointer lock
  const gameEl = document.getElementById('game');
  if (gameEl) gameEl.addEventListener('click', () => {
    if (st.mode === 'playing' && !document.pointerLockElement) lockPointer();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { input.lookDX += e.movementX; input.lookDY += e.movementY; }
  });
  document.addEventListener('mousedown', (e) => {
    if (st.mode !== 'playing' || !document.pointerLockElement) return;
    if (e.button === 0) { input.firing = true; input.fireEdge = true; input.fireQueued = 0.1; unlockAudio(); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
}

function lockPointer() {
  const el = document.getElementById('game');
  if (el && el.requestPointerLock) el.requestPointerLock();
}

function tryBuy(st, id) {
  if (st.mode !== 'buy') return;
  if (buy(st, id)) { renderBuy(st, (x) => tryBuy(st, x)); updateHud(st); }
}

function restart(st) {
  const keepSeed = st.seed + 1, diff = st.difficulty;
  const fresh = freshState(keepSeed, diff);
  Object.assign(st, fresh);
  st.input = input; // the one input object survives the restart
  setOverlay('title', st);
  updateHud(st);
}
