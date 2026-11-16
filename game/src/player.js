// player.js — one job: the player's first-person movement.
// Acceleration-based (not instant velocity): the player ramps up, crouching
// halves speed, and collision is circle-vs-AABB against the map. Stopping to
// aim pays because spread and recoil both key off `moving`.
import { MAP, collide } from './map.js';

export const MOVE = {
  accel: 42, maxSpeed: 6.2, crouchSpeed: 3.1, friction: 11,
  eyeHeight: 1.62, crouchEye: 1.27,
};

// input: {f,b,l,r,crouch,jump,lookDX,lookDY} — raw keys, already buffered.
export function stepPlayer(st, input, dt) {
  const p = st.player;
  if (!p.alive) return;
  // Mouse look: yaw/pitch from accumulated deltas, clamped pitch.
  p.yaw -= input.lookDX * 0.0023;
  p.pitch -= input.lookDY * 0.0023;
  if (p.pitch > 1.5) p.pitch = 1.5;
  if (p.pitch < -1.5) p.pitch = -1.5;
  input.lookDX = 0; input.lookDY = 0;

  p.crouch = !!input.crouch;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let ix = 0, iz = 0;
  if (input.f) iz -= 1;
  if (input.b) iz += 1;
  if (input.l) ix -= 1;
  if (input.r) ix += 1;
  const il = Math.hypot(ix, iz);
  if (il > 0) { ix /= il; iz /= il; }
  // wish direction in world space: rotate the local move (ix right, iz
  // forward=-1) by yaw. Forward is (-sin yaw, -cos yaw), right is
  // (cos yaw, -sin yaw) — so wx = ix*cos + iz*sin, wz = -ix*sin + iz*cos.
  const wx = ix * cy + iz * sy;
  const wz = -ix * sy + iz * cy;
  const max = p.crouch ? MOVE.crouchSpeed : MOVE.maxSpeed;
  p.vel.x += wx * MOVE.accel * dt;
  p.vel.z += wz * MOVE.accel * dt;
  // friction when no input, so the player glides to a stop instead of snapping
  if (il === 0) {
    const f = Math.max(0, 1 - MOVE.friction * dt);
    p.vel.x *= f; p.vel.z *= f;
  }
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (sp > max) { p.vel.x *= max / sp; p.vel.z *= max / sp; }
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  collide(p.pos, p.radius, MAP.walls);
  p.moving = sp > 0.8 && il > 0;
  p.speed = sp;
  // spread bloom decays when still — stopping to aim pays.
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * (p.moving ? 0.02 : 0.09));
  p.recoil = Math.max(0, p.recoil - dt * 0.25);
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  // reload timing is owned by sim.js (it calls finishReload when the timer ends)
}

// Pointer-lock helpers: main.js owns the DOM, this file only owns the math.
export function lookFromMouse(p, dx, dy) {
  p.yaw -= dx * 0.0023;
  p.pitch -= dy * 0.0023;
  if (p.pitch > 1.5) p.pitch = 1.5;
  if (p.pitch < -1.5) p.pitch = -1.5;
}
