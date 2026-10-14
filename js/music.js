// ============================================================
//  Generated medieval score (Web Audio, no audio files).
//  D minor: drone, choir pad, harp arpeggios, horn melody, and
//  war drums that swell when raiders come or a battle starts.
// ============================================================

const Music = (() => {
  const PREF_KEY = 'emberfall_music';
  const BPM = 66, STEP = 60 / BPM / 2;           // eighth notes
  let ac = null, master, wet, dry, comp;
  let on = false, timer = 0, nextTime = 0, step = 0;
  let intensity = 0, targetIntensity = 0;
  let droneNodes = [];

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // i – VII – VI – v   (Dm  C  Bb  Am), plus a darker turn on later passes
  const CHORDS = [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 48, 52], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
  // horn phrases: [step in bar (0-7), midi, length in steps]
  const PHRASES = [
    [[0, 62, 3], [3, 65, 1], [4, 64, 2], [6, 62, 2]],
    [[0, 69, 4], [4, 67, 2], [6, 65, 2]],
    [[0, 65, 2], [2, 64, 2], [4, 62, 3], [7, 60, 1]],
    [[0, 62, 6], [6, 61, 2]],
    [[0, 57, 2], [2, 60, 2], [4, 62, 4]],
    [[0, 70, 3], [3, 69, 1], [4, 67, 2], [6, 69, 2]],
  ];

  function prefOn() { try { return localStorage.getItem(PREF_KEY) === '1'; } catch (e) { return false; } }
  function savePref(v) { try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch (e) {} }

  function impulse(seconds, decay) {
    const len = ac.sampleRate * seconds, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function setup() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    const verb = ac.createConvolver(); verb.buffer = impulse(3.2, 2.6);
    wet = ac.createGain(); wet.gain.value = 0.38;
    dry = ac.createGain(); dry.gain.value = 0.8;
    dry.connect(comp); wet.connect(verb); verb.connect(comp);
    comp.connect(master); master.connect(ac.destination);
  }
  function out(node) { node.connect(dry); node.connect(wet); }

  // ---------- instruments ----------
  function pad(notes, t, dur) {
    for (const m of notes) for (const det of [-7, 0, 6]) {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m + 12); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.7;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 1.1);
      g.gain.setValueAtTime(0.022, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
      o.connect(f); f.connect(g); out(g);
      o.start(t); o.stop(t + dur + 1.3);
    }
  }
  function pluck(m, t, vel = 1) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(m);
    o2.type = 'sine'; o2.frequency.value = hz(m) * 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f); o2.connect(f); f.connect(g); out(g);
    o.start(t); o2.start(t); o.stop(t + 1.5); o2.stop(t + 1.5);
  }
  function horn(m, t, dur) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    const lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = hz(m); o2.frequency.value = hz(m) / 2;
    lfo.frequency.value = 5.2; lg.gain.value = 4; lfo.connect(lg); lg.connect(o.detune);
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1500 + intensity * 800, t + 0.12); f.Q.value = 1.2;
    const v = 0.05 + intensity * 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.09);
    g.gain.setValueAtTime(v * 0.85, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.25);
    o.connect(f); o2.connect(f); f.connect(g); out(g);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.3); }
  }
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  function taiko(t, vel = 1) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); out(g); o.start(t); o.stop(t + 1);
    const n = noise(), f = ac.createBiquadFilter(), ng = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = 600;
    ng.gain.setValueAtTime(0.25 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(f); f.connect(ng); out(ng); n.start(t); n.stop(t + 0.3);
  }
  function frameDrum(t, vel = 1) {
    const n = noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.18 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(f); f.connect(g); out(g); n.start(t); n.stop(t + 0.15);
  }
  function startDrone() {
    stopDrone();
    for (const [m, type, v] of [[38, 'sawtooth', 0.05], [45, 'sawtooth', 0.03], [26, 'sine', 0.07]]) {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = type; o.frequency.value = hz(m);
      f.type = 'lowpass'; f.frequency.value = 280;
      g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(v, ac.currentTime + 3);
      o.connect(f); f.connect(g); out(g); o.start();
      droneNodes.push({ o, g });
    }
  }
  function stopDrone() {
    for (const { o, g } of droneNodes) { try { g.gain.linearRampToValueAtTime(0, ac.currentTime + 1); o.stop(ac.currentTime + 1.1); } catch (e) {} }
    droneNodes = [];
  }

  // ---------- sequencer ----------
  let phrase = null;
  function scheduleStep(t) {
    const bar = Math.floor(step / 8), pos = step % 8;
    const chord = CHORDS[bar % CHORDS.length];
    if (pos === 0) {
      pad(chord, t, STEP * 8);
      if (droneNodes[0]) droneNodes[0].o.frequency.setTargetAtTime(hz(chord[0] - 12), t, 0.4);
      // horn plays on alternating pairs of bars; always when the drums are up
      phrase = (bar % 4 >= 2 || intensity > 0.5) ? PHRASES[Math.floor(Math.random() * PHRASES.length)] : null;
    }
    // harp arpeggio
    const arp = [0, 1, 2, 1, 0, 1, 2, 3];
    const note = chord[arp[pos] % 3] + 12 + (arp[pos] === 3 ? 12 : 0);
    if (intensity < 0.8 || pos % 2 === 0) pluck(note, t, pos === 0 ? 1 : 0.65);
    if (phrase) for (const [p, m, len] of phrase) if (p === pos) horn(m + (intensity > 0.6 ? 0 : -12) + 12, t, len * STEP);
    // drums
    if (intensity > 0.25) {
      const pat = [1, 0, 0, 0.6, 1, 0, 0.5, 0.8];
      if (pat[pos]) taiko(t, pat[pos] * intensity);
      if (intensity > 0.6 && (pos % 2 === 1)) frameDrum(t, 0.6 * intensity);
      if (bar % 4 === 3 && pos >= 6) { frameDrum(t + STEP / 2, intensity); taiko(t + STEP / 2, 0.7 * intensity); }
    } else if (pos === 0) taiko(t, 0.35);      // a distant heartbeat
    step++;
  }
  function pump() {
    if (!on || !ac) return;
    while (nextTime < ac.currentTime + 0.25) { scheduleStep(nextTime); nextTime += STEP; }
  }

  // ---------- public ----------
  function start() {
    if (!ac) setup();
    ac.resume();
    on = true;
    nextTime = ac.currentTime + 0.1;
    startDrone();
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ac.currentTime + 2);
    clearInterval(timer);
    timer = setInterval(pump, 60);
  }
  function stop() {
    on = false;
    clearInterval(timer);
    if (!ac) return;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
    stopDrone();
  }
  function toggle() {
    if (on) stop(); else start();
    savePref(on);
    return on;
  }
  // follow the game: drums rise when raiders approach or a battle is on
  function update() {
    if (!G) return;
    const inc = G.raid && G.raid.incoming;
    targetIntensity = G.inBattle ? 1 : inc && inc.eta - G.time < 1.5 ? 0.7 : inc ? 0.45 : 0;
    intensity += (targetIntensity - intensity) * 0.02;
  }
  function init() {
    // browsers only allow audio after a click, so the saved preference starts with the first one
    if (prefOn()) window.addEventListener('pointerdown', function once() { window.removeEventListener('pointerdown', once); if (!on) start(); });
  }

  return { init, toggle, update, isOn: () => on };
})();
