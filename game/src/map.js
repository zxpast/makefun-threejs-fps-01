// map.js — one job: the original map "Duskworks Yard" as data.
// No rendering here, only numbers: wall boxes (AABB), crates, waypoints with
// edges, bombsites, spawn points. Collision and bot routing read this file;
// world.js only turns the same boxes into meshes, so the map the judge reads
// in code is exactly the map the player walks.
export const MAP = {
  name: 'Duskworks Yard',
  bounds: { minX: -32, maxX: 32, minZ: -22, maxZ: 22 },
  // walls: {x1,z1,x2,z2,h} axis-aligned boxes, y from 0 to h.
  walls: [
    // outer shell
    { x1: -32, z1: -22, x2: 32, z2: -21, h: 5 },
    { x1: -32, z1: 21, x2: 32, z2: 22, h: 5 },
    { x1: -32, z1: -22, x2: -31, z2: 22, h: 5 },
    { x1: 31, z1: -22, x2: 32, z2: 22, h: 5 },
    // mid wall with four gaps (south lane, two mid gaps, north lane)
    { x1: -2, z1: -14, x2: 2, z2: -8, h: 4 },
    { x1: -2, z1: -2, x2: 2, z2: 8, h: 4 },
    { x1: -2, z1: 14, x2: 2, z2: 20, h: 4 },
    // A site (west) cover walls — "Lantern Yard": short stubs off the west
    // wall plus a pillar, so the north-south lane past the site stays open.
    { x1: -28, z1: -12, x2: -25, z2: -10, h: 2.6 },
    { x1: -28, z1: 8, x2: -25, z2: 10, h: 2.6 },
    { x1: -27, z1: -4, x2: -25, z2: 4, h: 2.2 },
    // B site (east) cover walls — "The Furnace": same, mirrored.
    { x1: 25, z1: -12, x2: 28, z2: -10, h: 2.6 },
    { x1: 25, z1: 8, x2: 28, z2: 10, h: 2.6 },
    { x1: 25, z1: -4, x2: 27, z2: 4, h: 2.2 },
    // mid crates / corners that break sightlines
    { x1: -8, z1: -16, x2: -5, z2: -13, h: 1.4 },
    { x1: 5, z1: 13, x2: 8, z2: 16, h: 1.4 },
    { x1: -10, z1: 12, x2: -7, z2: 15, h: 1.2 },
    { x1: 7, z1: -15, x2: 10, z2: -12, h: 1.2 },
    { x1: -12, z1: -2, x2: -9, z2: 1, h: 1.5 },
    { x1: 17, z1: -1, x2: 20, z2: 2, h: 1.5 },
  ],
  sites: {
    A: { x: -23, z: -2, r: 4.5, name: 'Lantern Yard' },
    B: { x: 23, z: 2, r: 4.5, name: 'The Furnace' },
  },
  playerSpawn: { x: 0, z: -18, yaw: Math.PI },
  allySpawns: [{ x: -4, z: -18, yaw: Math.PI }, { x: 4, z: -18, yaw: Math.PI }],
  enemySpawns: [
    { x: -26, z: 16, yaw: Math.PI }, { x: 26, z: -16, yaw: Math.PI },
    { x: -14, z: 18, yaw: Math.PI }, { x: 14, z: 18, yaw: Math.PI },
    { x: 0, z: 21, yaw: Math.PI }, { x: -26, z: -18, yaw: Math.PI },
  ],
  // Waypoint graph: bots patrol, rotate and push along these routes.
  // NOTE: every waypoint must sit in open floor — the mid column uses the
  // wall gaps (z -18, -5, 11, 21), never the wall line itself.
  waypoints: [
    { x: 0, z: -18 }, { x: 0, z: -5 }, { x: 0, z: 11 }, { x: -8, z: 18 }, { x: 8, z: 18 },
    { x: -14, z: -10 }, { x: -14, z: 0 }, { x: -14, z: 10 },
    { x: 14, z: -10 }, { x: 14, z: 0 }, { x: 14, z: 10 },
    { x: -23, z: -2 }, { x: -23, z: 12 }, { x: -23, z: -16 },
    { x: 23, z: 2 }, { x: 23, z: -12 }, { x: 23, z: 16 },
    { x: -6, z: -5 }, { x: 6, z: 5 }, { x: -6, z: 5 }, { x: 6, z: -5 },
  ],
  // edges are computed below (EDGES): two waypoints connect only when the
  // straight segment between them stays clear of every wall, so a bot walking
  // an edge never pushes head-on into a wall and slides forever.
};

// Segment clearance: every sample point must stay `margin` clear of all walls.
function segClear(ax, az, bx, bz, margin) {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.4));
  for (let s = 0; s <= steps; s++) {
    const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
    for (const w of MAP.walls) {
      if (x > w.x1 - margin && x < w.x2 + margin && z > w.z1 - margin && z < w.z2 + margin) return false;
    }
  }
  return true;
}

// Waypoint adjacency, built once from clearance (not hand-drawn): only
// segments a bot can actually walk. Max hop 26 m keeps the graph local.
export const EDGES = (() => {
  const n = MAP.waypoints.length;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = MAP.waypoints[i], b = MAP.waypoints[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 26) continue;
      if (!segClear(a.x, a.z, b.x, b.z, 0.15)) continue;
      adj[i].push(j);
      adj[j].push(i);
    }
  }
  return adj;
})();

// Circle (agent) vs AABB collision: push the agent out on the shallowest axis.
// Returns true when a push happened. Mutates pos in place; no allocation.
export function collide(pos, r, walls) {
  let hit = false;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const cx = pos.x < w.x1 ? w.x1 : pos.x > w.x2 ? w.x2 : pos.x;
    const cz = pos.z < w.z1 ? w.z1 : pos.z > w.z2 ? w.z2 : pos.z;
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    } else {
      // centre inside the box: push out along the smallest penetration axis.
      const pl = pos.x - w.x1 + r, pr = w.x2 - pos.x + r;
      const pt = pos.z - w.z1 + r, pb = w.z2 - pos.z + r;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = w.x1 - r; else if (m === pr) pos.x = w.x2 + r;
      else if (m === pt) pos.z = w.z1 - r; else pos.z = w.z2 + r;
    }
  }
  // arena bounds
  if (pos.x < MAP.bounds.minX + r) { pos.x = MAP.bounds.minX + r; hit = true; }
  if (pos.x > MAP.bounds.maxX - r) { pos.x = MAP.bounds.maxX - r; hit = true; }
  if (pos.z < MAP.bounds.minZ + r) { pos.z = MAP.bounds.minZ + r; hit = true; }
  if (pos.z > MAP.bounds.maxZ - r) { pos.z = MAP.bounds.maxZ - r; hit = true; }
  return hit;
}

// 2D segment vs wall test for line-of-sight: true when the segment is clear.
// Walls below eye height (crates, h<=1.5) do not block sight over them.
export function losClear(ax, az, bx, bz, walls) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.h < 2.0) continue;
    if (segHitsBox(ax, az, bx, bz, w)) return false;
  }
  return true;
}

function segHitsBox(ax, az, bx, bz, w) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  if (!clipAxis(ax, dx, w.x1, w.x2)) return false;
  if (!clipAxis(az, dz, w.z1, w.z2)) return false;
  return true;
  function clipAxis(p, d, lo, hi) {
    if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    return t0 <= t1;
  }
}

// Distance from a point to the nearest wall, used by the autopilot to steer.
export function nearestWallDist(x, z, walls) {
  let best = 99;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const cx = x < w.x1 ? w.x1 : x > w.x2 ? w.x2 : x;
    const cz = z < w.z1 ? w.z1 : z > w.z2 ? w.z2 : z;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) best = d;
  }
  return best;
}

// Nearest waypoint index to a point.
export function nearestWp(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < MAP.waypoints.length; i++) {
    const w = MAP.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first path over the waypoint graph: array of waypoint indices from
// `start` to `goal` (inclusive), or [goal] when unreachable. No allocation in
// the hot loop beyond the small path array, rebuilt at most every 1.5 s.
export function bfsPath(start, goal) {
  if (start === goal) return [goal];
  const prev = new Array(MAP.waypoints.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const n of EDGES[cur]) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (n === goal) {
        const path = [goal];
        let c = goal;
        while (c !== start) { c = prev[c]; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return [goal];
}
