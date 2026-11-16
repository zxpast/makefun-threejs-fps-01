// juice.js — one job: game feel, with the cheatsheet numbers as constants.
// Juice is medium-high and scaled to impact (Kao N=3.018: medium-high beats
// none AND extreme). Shake 2-5 px, decay 80-150 ms. Hit-stop 2-8 frames
// (~30-130 ms) on heavy hits/kills only. Squash & stretch 10-20%, yoyo ~100 ms.
// Input buffer ~100 ms. Total latency target <=50 ms at 60 Hz.
export const JUICE = {
  shakeSmall: 2, shakeBig: 5, shakeDecayMs: 120,
  hitStopKillMs: 90, hitStopHeavyMs: 50,
  squash: 0.15, squashMs: 100,
  inputBufferMs: 100,
};

export function addShake(st, px) {
  // px in 2..5; bigger impacts shake harder, never beyond the cap.
  st.shake = Math.min(JUICE.shakeBig, Math.max(st.shake, px));
}

// Called once per fixed step; decays shake over ~120 ms.
export function stepJuice(st, dt) {
  if (st.shake > 0) st.shake = Math.max(0, st.shake - (JUICE.shakeBig / (JUICE.shakeDecayMs / 1000)) * dt);
  if (st.hitStop > 0) st.hitStop -= dt;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 3);
}

// Kill juice: brief hit-stop (90 ms) + 4 px shake + a light flash. Only on
// kills — never a freeze on every hit.
export function killJuice(st) {
  st.hitStop = JUICE.hitStopKillMs / 1000;
  addShake(st, 4);
  st.flash = 0.55;
}

export function hurtJuice(st) {
  addShake(st, 3);
  st.flash = 0.35;
}

// Squash & stretch for the viewmodel: returns a scale factor for this frame,
// 10-20% yoyo over ~100 ms after `t0` (seconds since the shot).
export function squashAt(tSince, amount = JUICE.squash) {
  const ms = tSince * 1000;
  if (ms > JUICE.squashMs) return 1;
  const k = Math.sin((ms / JUICE.squashMs) * Math.PI);
  return 1 + amount * k;
}
