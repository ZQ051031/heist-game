// Every sound is made here with the Web Audio API at run time: no sound files. A small step
// sequencer plays an original minor-key sneaking loop that thickens as the alarm climbs; one-shot
// effects are shaped oscillators and filtered noise. Nothing plays until the first key or click.
(function (HW) {
  'use strict';

  const midi = (n) => 440 * 2 ** ((n - 69) / 12);
  // Two bars of sixteenths: the bass ostinato (0 = rest) and where the soft plucks may fall.
  const BASS = [38, 0, 0, 38, 0, 0, 41, 0, 36, 0, 0, 36, 0, 0, 33, 0, 38, 0, 0, 38, 0, 0, 41, 43, 45, 0, 0, 44, 0, 0, 40, 0];
  const PLUCK = [62, 65, 67, 69, 72, 74];
  const BPM = 94;

  HW.createAudio = function createAudio() {
    let ctx = null;
    let master;
    let sfxBus;
    let musicBus;
    let noiseBuffer;
    let muted = false;
    let nextTime = 0;
    let stepIndex = 0;
    let intensity = 0;
    let lockdown = false;
    let siren = null;
    let musicLevel = 1;
    let pluckSeed = 7;

    function pluckRandom() {
      pluckSeed = (pluckSeed * 16807) % 2147483647;
      return pluckSeed / 2147483647;
    }

    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.3;
      musicBus.connect(master);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < data.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      nextTime = ctx.currentTime + 0.1;
      setInterval(schedule, 25);
    }

    function tone(freq, dur, opts = {}) {
      if (!ctx) return;
      const t = ctx.currentTime + (opts.when || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
      const vol = opts.vol ?? 0.25;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.006));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(opts.bus || sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    function hiss(dur, opts = {}) {
      if (!ctx) return;
      const t = opts.at ?? ctx.currentTime + (opts.when || 0);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter || 'highpass';
      filter.frequency.value = opts.freq || 2000;
      filter.Q.value = opts.q || 0.7;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(opts.vol ?? 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(opts.bus || sfxBus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    }

    function note(n, at, dur, type, vol) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = midi(n);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }

    function schedule() {
      if (!ctx || ctx.state !== 'running') return;
      const sixteenth = 60 / (BPM * (lockdown ? 1.25 : 1)) / 4;
      while (nextTime < ctx.currentTime + 0.12) {
        const i = stepIndex % BASS.length;
        const t = nextTime;
        if (BASS[i]) note(BASS[i] - (lockdown ? 0 : 0), t, sixteenth * 2.6, 'triangle', 0.32 * musicLevel);
        if (i % 2 === 1) hiss(0.04, { at: t, freq: 7000, vol: (0.05 + intensity * 0.06) * musicLevel, bus: musicBus });
        if (intensity > 0.35 && i % 4 === 0) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          g.gain.setValueAtTime(0.4 * intensity * musicLevel, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          osc.connect(g);
          g.connect(musicBus);
          osc.start(t);
          osc.stop(t + 0.2);
        }
        if ((i % 8 === 6 || i === 30) && pluckRandom() < 0.45 + intensity * 0.3) {
          note(PLUCK[Math.floor(pluckRandom() * PLUCK.length)], t, 0.5, 'sine', 0.12 * musicLevel);
        }
        if (intensity > 0.6 && i % 16 === 8) note(BASS[i] ? BASS[i] + 12 : 50, t, sixteenth * 6, 'sawtooth', 0.05 * musicLevel);
        nextTime += sixteenth;
        stepIndex += 1;
      }
    }

    function setSiren(on) {
      if (!ctx) return;
      if (on && !siren) {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 720;
        lfo.frequency.value = 1.6;
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        gain.gain.value = 0.045;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(sfxBus);
        osc.start();
        lfo.start();
        siren = { osc, lfo, gain };
      } else if (!on && siren) {
        siren.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        siren.osc.stop(ctx.currentTime + 0.3);
        siren.lfo.stop(ctx.currentTime + 0.3);
        siren = null;
      }
    }

    const SOUNDS = {
      step: (e) => hiss(0.05, { filter: 'bandpass', freq: e.soft ? 500 : 900, q: 1.2, vol: e.soft ? 0.05 : 0.16 }),
      throw: () => hiss(0.18, { filter: 'bandpass', freq: 1800, q: 2, vol: 0.08 }),
      clink: () => {
        tone(2350, 0.25, { type: 'triangle', vol: 0.16 });
        tone(3120, 0.2, { type: 'sine', vol: 0.1, when: 0.07 });
        tone(2600, 0.18, { type: 'sine', vol: 0.06, when: 0.15 });
      },
      huh: () => tone(330, 0.22, { type: 'sine', vol: 0.14, slide: 520 }),
      alert: () => {
        tone(660, 0.12, { type: 'square', vol: 0.12 });
        tone(990, 0.3, { type: 'square', vol: 0.12, when: 0.11 });
      },
      camera: () => {
        tone(1320, 0.07, { type: 'square', vol: 0.07 });
        tone(1320, 0.07, { type: 'square', vol: 0.07, when: 0.12 });
      },
      laser: () => tone(1600, 0.35, { type: 'sawtooth', vol: 0.1, slide: 300 }),
      prize: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(midi(74 + s), 0.5, { type: 'triangle', vol: 0.14, when: i * 0.07 })),
      gem: () => {
        tone(midi(86), 0.2, { type: 'sine', vol: 0.12 });
        tone(midi(91), 0.3, { type: 'sine', vol: 0.1, when: 0.06 });
      },
      hacked: () => [0, 3, 7, 10].forEach((s, i) => tone(midi(60 + s), 0.12, { type: 'square', vol: 0.06, when: i * 0.06 })),
      lost: () => tone(520, 0.3, { type: 'sine', vol: 0.08, slide: 300 }),
      nag: () => tone(220, 0.15, { type: 'triangle', vol: 0.1 }),
      caught: () => {
        tone(180, 0.6, { type: 'sawtooth', vol: 0.18, slide: 60 });
        hiss(0.3, { filter: 'lowpass', freq: 400, vol: 0.3 });
      },
      sealed: () => {
        hiss(0.9, { filter: 'lowpass', freq: 300, vol: 0.4 });
        tone(110, 0.9, { type: 'square', vol: 0.12, slide: 55 });
      },
      win: () => [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(midi(62 + s), 0.6, { type: 'triangle', vol: 0.13, when: i * 0.09 })),
      lockdown: () => tone(440, 0.6, { type: 'sawtooth', vol: 0.12, slide: 880 }),
      click: () => tone(880, 0.06, { type: 'square', vol: 0.05 }),
    };

    return {
      unlock,
      play(event) {
        const fn = SOUNDS[event.type];
        if (fn && ctx) fn(event);
      },
      /** alarm 0..1, lockdown on or off, quiet for menus and pause. */
      setMood(alarm, isLockdown, quiet) {
        intensity = alarm;
        lockdown = isLockdown;
        musicLevel = quiet ? 0.45 : 1;
        setSiren(isLockdown && !quiet);
      },
      toggleMute() {
        muted = !muted;
        if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
        return muted;
      },
      get muted() {
        return muted;
      },
    };
  };
})(window.HUSH = window.HUSH || {});
