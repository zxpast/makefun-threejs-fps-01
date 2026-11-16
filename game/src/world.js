// world.js — one job: turning state into pictures. The renderer only READS
// state; it never mutates gameplay. Geometry is merged by material (one
// shared material per surface kind, so draw calls follow material count, not
// object count — Saltline principle), textures are baked once to canvas, and
// every per-frame visual (tracers, particles, the gun) is pooled.
import * as THREE from 'three';
import { MAP } from './map.js';
import { squashAt } from './juice.js';

const PALETTE = {
  sky: 0x0b0e1a, fog: 0x0b0e1a, floor: 0x1a1d26, wall: 0x2a2f3d,
  wallTop: 0x3a4152, crate: 0x4a3b28, siteA: 0xffb347, siteB: 0x7fd4ff,
  shadow: 0x14101f, eye: 0xff3355, ally: 0xffcc66, moon: 0xfff3c4,
};

let R = null; // renderer bundle, created once by init()

function canvasTexture(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function initWorld(container, st) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 18, 70);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 200);
  scene.add(camera);

  // --- lights: cold moon + warm lanterns over the two sites ---
  scene.add(new THREE.HemisphereLight(0x2a3560, 0x0a0805, 0.55));
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.7);
  moon.position.set(-20, 30, -12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
  scene.add(moon);
  const lanternLight = new THREE.PointLight(0xffb347, 60, 26, 1.8);
  lanternLight.position.set(0, 3, 0);
  scene.add(lanternLight);
  // the player's lantern: a spotlight that follows the aim
  const spot = new THREE.SpotLight(0xffe9a8, 0, 30, 0.5, 0.45, 1.2);
  spot.position.set(0, 0, 0);
  scene.add(spot); scene.add(spot.target);

  // --- materials, one per surface kind ---
  const floorTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#1a1d26'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    g.fillStyle = 'rgba(255,179,71,0.08)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }, 256, 256);
  floorTex.repeat.set(16, 11);
  const matFloor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
  const matWall = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.85 });
  const matWallTop = new THREE.MeshStandardMaterial({ color: PALETTE.wallTop, roughness: 0.7 });
  const matCrate = new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.9 });
  const matSiteA = new THREE.MeshStandardMaterial({ color: PALETTE.siteA, emissive: PALETTE.siteA, emissiveIntensity: 0.7, roughness: 0.4 });
  const matSiteB = new THREE.MeshStandardMaterial({ color: PALETTE.siteB, emissive: PALETTE.siteB, emissiveIntensity: 0.7, roughness: 0.4 });

  // --- floor + walls (one mesh per wall, shared materials) ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), matFloor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of MAP.walls) {
    const m = new THREE.Mesh(wallGeo, w.h <= 1.5 ? matCrate : matWall);
    m.position.set((w.x1 + w.x2) / 2, w.h / 2, (w.z1 + w.z2) / 2);
    m.scale.set(w.x2 - w.x1, w.h, w.z2 - w.z1);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(wallGeo, matWallTop);
    cap.position.set((w.x1 + w.x2) / 2, w.h + 0.06, (w.z1 + w.z2) / 2);
    cap.scale.set(w.x2 - w.x1 + 0.1, 0.12, w.z2 - w.z1 + 0.1);
    scene.add(cap);
  }

  // --- bombsite beacons: glowing rings on the floor + a hanging lantern ---
  const ringGeo = new THREE.RingGeometry(3.6, 4.5, 40);
  for (const [key, s] of Object.entries(MAP.sites)) {
    const ring = new THREE.Mesh(ringGeo, key === 'A' ? matSiteA : matSiteB);
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: key === 'A' ? PALETTE.siteA : PALETTE.siteB, emissiveIntensity: 2 }));
    lamp.position.set(s.x, 3.4, s.z);
    scene.add(lamp);
    const pl = new THREE.PointLight(key === 'A' ? PALETTE.siteA : PALETTE.siteB, 25, 14, 1.6);
    pl.position.set(s.x, 3.2, s.z);
    scene.add(pl);
  }

  // --- distant skyline silhouettes + moon, for depth at a glance ---
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x11142a });
  for (let i = 0; i < 14; i++) {
    const h = 6 + (i * 37 % 14);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4 + (i * 13 % 5), h, 4), skyMat);
    const ang = (i / 14) * Math.PI * 2;
    b.position.set(Math.cos(ang) * 52, h / 2 - 1, Math.sin(ang) * 52);
    scene.add(b);
  }
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false }));
  moonDisc.position.set(-38, 26, -46); moonDisc.lookAt(0, 1, 0);
  scene.add(moonDisc);

  // --- pickups: glowing cells ---
  const cellGeo = new THREE.OctahedronGeometry(0.35);
  const cellMat = new THREE.MeshStandardMaterial({ color: 0xaef7ff, emissive: 0x66d9ff, emissiveIntensity: 1.6 });
  const cells = st.pickups.map((pk) => {
    const m = new THREE.Mesh(cellGeo, cellMat);
    m.position.set(pk.x, 0.9, pk.z);
    scene.add(m);
    return m;
  });

  // --- agents: pooled meshes, one group per slot ---
  const agentMeshes = [];
  for (let i = 0; i < 12; i++) agentMeshes.push(makeAgentMesh(scene, i < 3));

  // --- viewmodel: a lantern-rifle built from boxes, attached to the camera ---
  const gun = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2e2a33, roughness: 0.5, metalness: 0.6 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9962e, roughness: 0.35, metalness: 0.8 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), gunMat);
  barrel.position.set(0, -0.02, -0.35); gun.add(barrel);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.3), gunMat);
  body.position.set(0, -0.03, -0.05); gun.add(body);
  const lampGlass = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffb347, emissiveIntensity: 2.2 }));
  lampGlass.position.set(0, 0.06, -0.28); gun.add(lampGlass);
  gun.position.set(0.28, -0.24, -0.45);
  camera.add(gun);

  // --- tracers: pooled lines, 24 max ---
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, tracerMat.clone());
    line.visible = false; line.frustumCulled = false;
    scene.add(line); tracers.push(line);
  }

  // --- particles: one Points cloud, 256 slots, recycled ---
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(256 * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffcc66, size: 0.12, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  scene.add(points);
  const pVel = new Float32Array(256 * 3);
  const pLife = new Float32Array(256);

  R = { renderer, scene, camera, spot, lanternLight, gun, lampGlass, brassMat, agentMeshes, tracers, points, pPos, pVel, pLife, cells, gunMat };
  window.addEventListener('resize', onResize);
  return R;
}

function onResize() {
  if (!R) return;
  R.camera.aspect = window.innerWidth / window.innerHeight;
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(window.innerWidth, window.innerHeight);
}

function makeAgentMesh(scene, ally) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: ally ? 0x6b4a1f : PALETTE.shadow, roughness: 0.8, emissive: ally ? 0x332200 : 0x1a0a2e, emissiveIntensity: ally ? 0.25 : 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 4, 8), bodyMat);
  body.position.y = 0.95; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), bodyMat);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: ally ? 0xffcc66 : PALETTE.eye });
  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.09, 1.64, 0.2); g.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.09, 1.64, 0.2); g.add(eR);
  // health bar: a thin billboard above the head
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }));
  barBg.position.y = 2.05; g.add(barBg);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.06), new THREE.MeshBasicMaterial({ color: ally ? 0x66ff88 : 0xff4455 }));
  bar.position.set(0, 2.05, 0.01); g.add(bar);
  g.visible = false;
  scene.add(g);
  return { group: g, bar, barBg, bodyMat };
}

// --- per-frame render: reads state, writes only three.js objects ---
const _v = { x: 0, y: 0, z: 0 };

export function render(st, now) {
  const p = st.player;
  const cam = R.camera;
  // shake: 2-5 px equivalent in world space, decays in stepJuice
  const sh = st.shake * 0.012;
  const shx = (Math.random() - 0.5) * sh, shy = (Math.random() - 0.5) * sh;
  cam.position.set(p.pos.x + shx, (p.crouch ? 1.27 : 1.62) + shy, p.pos.z);
  cam.rotation.set(0, 0, 0);
  cam.rotateY(p.yaw);
  cam.rotateX(p.pitch);

  // lantern spotlight follows the aim; intensity follows the battery
  const spot = R.spot;
  spot.position.set(p.pos.x, 1.6, p.pos.z);
  spot.target.position.set(p.pos.x - Math.sin(p.yaw) * 10, 1.6 + Math.tan(p.pitch) * 10, p.pos.z - Math.cos(p.yaw) * 10);
  spot.intensity = st.lanternOn ? 60 + st.battery * 0.4 : 0;
  R.lampGlass.material.emissiveIntensity = st.lanternOn ? 2.2 : 0.4;
  // pulsing yard lantern follows the player softly
  R.lanternLight.position.set(p.pos.x, 3, p.pos.z);
  R.lanternLight.intensity = 30 + Math.sin(now * 0.002) * 4;

  // viewmodel: bob with movement + squash on fire (10-20%, ~100 ms yoyo)
  const tSinceShot = st.time - (st._lastShotAt ?? -99);
  const sq = squashAt(tSinceShot);
  const bob = p.moving ? Math.sin(now * 0.011) * 0.012 : 0;
  R.gun.position.set(0.28, -0.24 + bob, -0.45);
  R.gun.scale.set(1, sq, 1);
  R.gun.visible = p.alive && st.mode !== 'title';

  // agents: enemies first (slots 0..), then allies
  let slot = 0;
  const all = [...st.enemies, ...st.allies];
  for (const a of all) {
    const m = R.agentMeshes[slot++];
    if (!a.alive) { m.group.visible = false; continue; }
    m.group.visible = true;
    m.group.position.set(a.pos.x, 0, a.pos.z);
    m.group.rotation.y = a.yaw + Math.PI;
    const s = a.isBoss ? 1.6 : 1;
    m.group.scale.set(s, s, s);
    const frac = Math.max(0, a.hp / a.maxHp);
    m.bar.scale.x = frac;
    m.bar.position.x = -(1 - frac) * 0.43;
    m.bar.visible = a.kind === 'enemy';
    m.barBg.visible = a.kind === 'enemy';
    // lit shadows glow warm — the player can SEE what the lantern marks
    m.bodyMat.emissive.setHex(a.litUntil && a.litUntil > st.time ? 0xff8822 : (a.kind === 'enemy' ? 0x1a0a2e : 0x332200));
    m.bodyMat.emissiveIntensity = a.litUntil && a.litUntil > st.time ? 0.9 : 0.5;
    m.group.lookAt(cam.position.x, 0, cam.position.z);
  }
  for (; slot < R.agentMeshes.length; slot++) R.agentMeshes[slot].group.visible = false;

  // pickups
  for (let i = 0; i < R.cells.length; i++) {
    const pk = st.pickups[i];
    R.cells[i].visible = pk && !pk.taken;
    if (pk && !pk.taken) { R.cells[i].rotation.y += 0.03; R.cells[i].position.y = 0.9 + Math.sin(now * 0.003 + i) * 0.12; }
  }

  // tracers
  for (let i = 0; i < R.tracers.length; i++) {
    const t = st.tracers[i];
    const line = R.tracers[i];
    if (!t || t.life <= 0) { line.visible = false; continue; }
    line.visible = true;
    line.material.color.setHex(t.color);
    line.material.opacity = Math.min(1, t.life / 0.09);
    const pos = line.geometry.attributes.position.array;
    pos[0] = t.a.x; pos[1] = t.a.y; pos[2] = t.a.z;
    pos[3] = t.b.x; pos[4] = t.b.y; pos[5] = t.b.z;
    line.geometry.attributes.position.needsUpdate = true;
  }

  // particles: recycle slots from bursts
  for (let i = 0; i < 256; i++) {
    if (R.pLife[i] > 0) {
      R.pLife[i] -= 1 / 60;
      R.pPos[i * 3] += R.pVel[i * 3] / 60;
      R.pPos[i * 3 + 1] += R.pVel[i * 3 + 1] / 60;
      R.pPos[i * 3 + 2] += R.pVel[i * 3 + 2] / 60;
      R.pVel[i * 3 + 1] -= 4 / 60;
    } else {
      R.pPos[i * 3 + 1] = -10; // park below the floor
    }
  }
  for (const b of st.bursts) {
    if (b.life <= 0 || b._spawned) continue;
    b._spawned = true;
    for (let k = 0; k < b.n; k++) {
      const idx = (b._cursor = ((b._cursor || 0) + 7) % 256);
      R.pPos[idx * 3] = b.x; R.pPos[idx * 3 + 1] = b.y; R.pPos[idx * 3 + 2] = b.z;
      R.pVel[idx * 3] = (Math.random() - 0.5) * 6;
      R.pVel[idx * 3 + 1] = Math.random() * 4;
      R.pVel[idx * 3 + 2] = (Math.random() - 0.5) * 6;
      R.pLife[idx] = 0.5;
    }
  }
  R.points.geometry.attributes.position.needsUpdate = true;

  R.renderer.render(R.scene, R.camera);
}
