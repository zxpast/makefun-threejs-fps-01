// audio.js — one job: all sound, synthesized with WebAudio oscillators and
// filtered noise. No audio files, no network. Created lazily on first user
// gesture (browsers require it); every call before that is a safe no-op.
let ctx = null, master = null, muted = false;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { return null; }
  return ctx;
}

export function unlockAudio() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.35; return muted; }
export function isMuted() { return muted; }

function tone(freq0, freq1, dur, type, vol, when = 0) {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq0, t);
  if (freq1 !== freq0) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, filterFreq, when = 0) {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  shot(kind) {
    if (kind === 'dusk') { noise(0.16, 0.5, 900); tone(120, 45, 0.14, 'sawtooth', 0.25); }
    else if (kind === 'glimmer') { noise(0.07, 0.35, 2200); tone(700, 240, 0.06, 'square', 0.12); }
    else { noise(0.09, 0.4, 1600); tone(320, 110, 0.08, 'square', 0.16); }
  },
  enemyShot() { noise(0.07, 0.16, 1200); tone(240, 90, 0.07, 'square', 0.07); },
  dryFire() { tone(1400, 900, 0.04, 'square', 0.1); },
  reload() { tone(500, 500, 0.05, 'square', 0.1); tone(700, 700, 0.05, 'square', 0.1, 0.18); },
  hit() { tone(880, 880, 0.05, 'sine', 0.18); },
  kill() { tone(660, 990, 0.12, 'sine', 0.22); tone(990, 1320, 0.14, 'sine', 0.18, 0.09); },
  hurt() { tone(180, 70, 0.18, 'sawtooth', 0.28); noise(0.12, 0.2, 500); },
  headshot() { tone(1200, 1800, 0.08, 'sine', 0.22); },
  plant() { tone(520, 520, 0.09, 'sine', 0.2); tone(520, 520, 0.09, 'sine', 0.2, 0.14); },
  beep(final) { tone(final ? 1200 : 880, final ? 1200 : 880, 0.07, 'sine', 0.16); },
  defuse() { tone(440, 660, 0.1, 'sine', 0.18); },
  explosion() { noise(0.7, 0.7, 300); tone(90, 30, 0.6, 'sine', 0.5); },
  lantern() { tone(300, 900, 0.25, 'sine', 0.2); tone(900, 1500, 0.2, 'sine', 0.12, 0.12); },
  pickup() { tone(740, 1108, 0.1, 'sine', 0.18); },
  buy() { tone(520, 780, 0.08, 'triangle', 0.18); tone(780, 1040, 0.1, 'triangle', 0.18, 0.08); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.2, i * 0.11)); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.18, i * 0.13)); },
  waveHorn() { tone(98, 98, 0.5, 'sawtooth', 0.16); tone(147, 147, 0.5, 'sawtooth', 0.12, 0.05); },
  grenade() { noise(0.4, 0.5, 2400); tone(1200, 300, 0.35, 'sine', 0.2); },
  click() { tone(900, 900, 0.03, 'square', 0.08); },
};
