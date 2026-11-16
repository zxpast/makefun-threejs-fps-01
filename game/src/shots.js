// shots.js — one job: stage the game for screenshots.
// `?shot=title|play|boss|win&seed=N` puts the game in a fixed, good-looking
// state without pointer lock, so headless Chrome can capture real renders of
// real gameplay. Nothing here is fake: the scene is the live game state.
import { freshState } from './state.js';
import { startRound, endRound } from './rounds.js';

export function applyShot(st, shot, seed) {
  const s = freshState(seed, 'ember');
  Object.assign(st, s);
  if (shot === 'title') {
    st.mode = 'title';
    startRound(st);
    st.mode = 'title';
    // frame the yard: player at spawn looking north down mid toward both sites
    st.player.pos.x = 0; st.player.pos.z = -18; st.player.yaw = Math.PI - 0.15; st.player.pitch = 0.02;
    return st;
  }
  if (shot === 'play') {
    startRound(st);
    // mid-fight: enemies advanced to mid, one lit by the lantern
    const p = st.player;
    p.pos.x = -4; p.pos.z = -6; p.yaw = Math.PI - 0.25; p.pitch = 0;
    p.mag = 24;
    st.enemies[0].pos.x = -4; st.enemies[0].pos.z = 4; st.enemies[0].litUntil = st.time + 10;
    st.enemies[1].pos.x = 6; st.enemies[1].pos.z = 2;
    st.enemies[2].pos.x = 0; st.enemies[2].pos.z = 10;
    st.lanternOn = true; st.battery = 72;
    st.score = 350; st.kills = 3; st.money = 1050;
    return st;
  }
  if (shot === 'boss') {
    st.round = 5;
    startRound(st);
    const p = st.player;
    p.pos.x = -6; p.pos.z = 2; p.yaw = Math.PI; p.pitch = 0.05;
    p.weapon = 'ember'; p.mag = 25; p.reserve = 100;
    // boss framed down the west lane: 16 m ahead, charging, not hidden
    // behind the mid wall (its spawn at (0,21) sits behind the z 14..20 wall)
    const boss = st.enemies.find((e) => e.isBoss);
    if (boss) { boss.pos.x = -6; boss.pos.z = 18; boss.state = 'chase'; }
    st.bomb.state = 'planted'; st.bomb.site = 'A'; st.bomb.timer = 18;
    st.score = 1200; st.kills = 11; st.money = 1400; st.roundTimer = 62;
    return st;
  }
  if (shot === 'win') {
    startRound(st);
    st.enemies.forEach((e) => { e.alive = false; });
    endRound(st, true, 'Yard clear — every shadow down.');
    st.mode = 'roundEnd';
    st.roundEndAt = st.time + 999;
    return st;
  }
  return st;
}
