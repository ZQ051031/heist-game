// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// sounds follow the world's events and the renderer paints the current screen: title, play,
// paused, caught, sealed or won.
//
// ?seed=N fixes guard timings. ?shot=cover|lockdown|results|title stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a screenshot.
(function (HW) {
  'use strict';

  const MAX_FRAME = 0.25;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const world = HW.createWorld(HW.createRandom(seed));
  const renderer = HW.createRenderer(canvas);

  function readBest() {
    try {
      return JSON.parse(window.localStorage.getItem(HW.BEST_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveBest(best) {
    try {
      window.localStorage.setItem(HW.BEST_KEY, JSON.stringify(best));
    } catch {
      // Storage can be off (private windows): records then last this visit only.
    }
  }

  function runShot(name) {
    const scene = HW.stageShot(name, world);
    let painted = 0;
    function paint() {
      renderer.draw({ screen: scene.screen, state: world.state, levelIndex: scene.levelIndex, clock: scene.clock, mouse: scene.mouse, best: scene.best, muted: false });
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  }

  function runGame() {
    const input = HW.createInput(canvas, renderer.toLogical);
    const audio = HW.createAudio();
    input.onGesture(() => audio.unlock());
    let screen = 'title';
    let levelIndex = 0;
    let best = readBest();
    let accumulator = 0;
    let clock = 0;
    let last = performance.now();
    world.load(0);

    const announce = (message) => {
      status.textContent = message;
    };

    function startLevel(index) {
      levelIndex = index;
      world.load(index);
      world.toast(world.state.level.def.brief, 5);
      screen = 'play';
      accumulator = 0;
      announce(`Night ${index + 1}: ${world.state.level.def.name}. Steal the ${world.state.level.def.prize} and reach the exit.`);
    }

    function toMenu() {
      screen = 'title';
      world.load(0);
      announce('Hushwork. Choose a night: press 1, 2 or 3.');
    }

    function setScreen(next, message) {
      screen = next;
      if (message) announce(message);
    }

    function act(id) {
      audio.play({ type: 'click' });
      if (id.startsWith('level')) startLevel(Number(id.slice(5)));
      else if (id === 'resume') setScreen('play', 'Playing.');
      else if (id === 'restart') startLevel(levelIndex);
      else if (id === 'next') startLevel(Math.min(levelIndex + 1, HW.LEVELS.length - 1));
      else if (id === 'menu') toMenu();
    }

    function handlePresses() {
      for (const code of input.takePresses()) {
        if (code === 'KeyM') {
          announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
          continue;
        }
        if (screen === 'title') {
          if (code.startsWith('Digit')) act('level' + (Number(code.slice(5)) - 1));
          else if (code === 'Enter' || code === 'Space') act('level0');
        } else if (screen === 'play') {
          if (code === 'KeyP' || code === 'Escape') setScreen('paused', 'Paused.');
          else if (code === 'KeyR') act('restart');
        } else if (screen === 'paused') {
          if (code === 'KeyP' || code === 'Escape' || code === 'Enter') act('resume');
          else if (code === 'KeyR') act('restart');
          else if (code === 'KeyQ') act('menu');
        } else if (screen === 'caught' || screen === 'sealed') {
          if (code === 'KeyR' || code === 'Enter') act('restart');
          else if (code === 'KeyQ' || code === 'Escape') act('menu');
        } else if (screen === 'won') {
          if ((code === 'Enter' || code === 'KeyN') && levelIndex < HW.LEVELS.length - 1) act('next');
          else if (code === 'KeyR') act('restart');
          else if (code === 'KeyQ' || code === 'Escape' || code === 'Enter') act('menu');
        }
      }
    }

    /** The room point a click aims at during play, or null for a click on the menu buttons. */
    function handleClicks() {
      let throwAt = null;
      for (const click of input.takeClicks()) {
        if (screen === 'play') {
          if (click.y >= HW.MAP_Y && click.y < HW.MAP_Y + HW.ROWS * HW.TILE) throwAt = { x: click.x, y: click.y - HW.MAP_Y };
          continue;
        }
        const b = HW.buttonsFor(screen, levelIndex).find((k) => click.x >= k.x && click.x <= k.x + k.w && click.y >= k.y && click.y <= k.y + k.h);
        if (b) act(b.id);
      }
      return throwAt;
    }

    function react(events) {
      for (const e of events) {
        audio.play(e);
        if (e.type === 'caught') setScreen('caught', 'Busted. Press R to try again.');
        else if (e.type === 'sealed') setScreen('sealed', 'Sealed in. Press R to try again.');
        else if (e.type === 'lockdown') announce('Lockdown! Reach the exit before the shutters seal.');
        else if (e.type === 'prize') announce(`${world.state.level.def.prize} taken. Get to the exit.`);
        else if (e.type === 'alert') announce('A guard has spotted you!');
        else if (e.type === 'win') {
          const r = world.state.results;
          const rec = best[levelIndex];
          if (!rec || r.score > rec.score) {
            best = { ...best, [levelIndex]: { score: r.score, rank: r.rank } };
            saveBest(best);
          }
          setScreen('won', `Escaped. Score ${r.score}, rank ${r.rank}.`);
        }
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      clock += dt;
      handlePresses();
      let throwAt = handleClicks();
      accumulator += dt;
      if (screen === 'play' || screen === 'title') {
        while (accumulator >= HW.STEP) {
          const axis = input.axis();
          const events = world.step(HW.STEP, { mx: axis.mx, my: axis.my, sneak: input.sneak(), interact: input.interact(), throwAt }, screen === 'title');
          throwAt = null;
          accumulator -= HW.STEP;
          if (screen === 'play') react(events);
          if (screen !== 'play' && screen !== 'title') break;
        }
      } else {
        accumulator = 0;
        world.step(dt, null, true);
      }
      const s = world.state;
      audio.setMood(s.alarm / HW.ALARM.max, s.lockdown && screen === 'play', screen !== 'play');
      canvas.style.cursor = screen === 'play' ? 'crosshair' : 'default';
      renderer.draw({ screen, state: s, levelIndex, clock, mouse: input.mouse, best, muted: audio.muted });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && screen === 'play') setScreen('paused', 'Paused.');
    });

    window.__hushwork = { state: () => world.state, screen: () => screen };
    announce('Hushwork. Choose a night: press 1, 2 or 3, or click a card.');
    requestAnimationFrame(frame);
  }

  if (shot) runShot(shot);
  else runGame();
})(window.HUSH = window.HUSH || {});
