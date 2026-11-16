# LANTERNFALL — light is the only weapon

[![threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/c/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/zxpast/makefun-threejs-fps-01/rank.svg)](https://make.fun/c/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/zxpast/makefun-threejs-fps-01/reward.svg)](https://make.fun/c/threejs-fps-01)

A three.js tactical FPS for make.fun's [threejs-fps-01 bounty](https://make.fun/c/threejs-fps-01)
($1,000 — 1st $400, 2nd $200, 3rd $120, 4th–10th $40).

## The one idea

**Light is the only weapon — and your light runs out.**

Night has swallowed Duskworks Yard. Your lantern beam marks shadows — lit
shadows take double damage — and a lantern blast burns them outright, but
every second of light drains the battery. When the battery dies, the dark gets
bold: shadows move faster and hit harder.

## How to play

- **Goal:** hold 10 rounds. Win a round by eliminating every shadow, or by
  planting the light-charge at **Lantern Yard (A)** or **The Furnace (B)**
  and letting it detonate. Lose 4 rounds and the dark keeps the yard.
  Bosses rise on rounds 5 and 10; clearing round 10 wins the campaign, then
  endless rounds continue.
- **Money:** $150 per kill, $300 per plant, $400 per round win. Spend it
  between rounds in the buy menu: Ember Rifle ($650), Dusk Scattergun ($550),
  Glimmer Pistol ($200), Flare Grenade ($300).
- **Controls:** WASD move, mouse look (click to lock), click fire, R reload,
  F lantern blast, G lantern beam, E plant charge, Q flare grenade,
  Ctrl crouch, M mute, 1–5 buy between rounds, Enter start round.
- **Difficulties:** Ember (easy), Blaze (medium), Inferno (hard) — pick on
  the title screen or via `?diff=blaze`.

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Open `game/index.html` in desktop Chrome. No build step, no network: every
script and sound is a file under `game/` or synthesized at runtime (WebAudio).

## Verify it (headless)

```sh
# autopilot plays a full campaign and prints the result
/opt/meta-chromium/chrome --headless=new --dump-dom 'http://localhost:8080/?auto=1&seed=7'
# staged screenshot frames
/opt/meta-chromium/chrome --headless=new --screenshot=2-play.jpg --window-size=1280,720 'http://localhost:8080/?shot=play&seed=7'
```

The autopilot wins on Ember difficulty across seeds 1–12. Deterministic: the
same seed always plays the same game (seeded RNG, `game/src/rng.js`).

## Where the judge criteria live

1. **Complete game** — `game/src/sim.js` (fixed-step loop), `game/src/rounds.js`
   (rounds, plant/defuse, economy), `game/src/hud.js` (health, ammo, timer, score).
2. **Gunplay** — `game/src/weapons.js` (hitscan, headshots, spread/recoil that
   punish firing on the move), `game/src/player.js` (acceleration, crouch, AABB
   collision, stopping to aim pays).
3. **Tactics** — `game/src/rounds.js` (objective, money, buy menu),
   `game/src/bots.js` (waypoint routes, hold positions, hearing, line of sight),
   `game/src/light.js` (lantern as weapon + resource).
4. **Map & look** — `game/src/map.js` (Duskworks Yard: 2 sites, mid, lanes,
   corners, sightlines), `game/src/world.js` (night palette, fog, lantern beacons).
5. **Code** — one job per module, fixed-step sim apart from rendering, one
   state store (`game/src/state.js`), pooled tracers/particles, no per-frame
   allocation in hot loops.

## License

MIT — see `LICENSE`.
