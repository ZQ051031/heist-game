// The screenshot scenes behind ?shot=cover|lockdown|results|title. Each loads a real level, lets
// the guards and cameras run their patrols for a few seconds, then places the thief and sets the
// moment (a suspicious guard, a lockdown, a getaway) before playing a few more real steps, so the
// frame is the game's own rendering and the same seed always gives the same picture.
(function (HW) {
  'use strict';

  const still = { mx: 0, my: 0, sneak: true, interact: false, throwAt: null };

  function run(world, seconds, attract, input = still) {
    for (let t = 0; t < seconds; t += HW.STEP) world.step(HW.STEP, input, attract);
  }

  function tile(c, r) {
    return { x: (c + 0.5) * HW.TILE, y: (r + 0.5) * HW.TILE };
  }

  HW.stageShot = function stageShot(name, world) {
    const T = HW.TILE;
    if (name === 'lockdown') {
      world.load(1);
      run(world, 6, true);
      const s = world.state;
      Object.assign(s.player, tile(24, 5), { carrying: true, face: 0, coins: 1 });
      s.prizeTaken = true;
      s.time = 58.3;
      s.alarm = 90;
      world.raiseAlarm(10);
      run(world, 1.2, false, { mx: 0, my: 0, sneak: false, interact: false, throwAt: null });
      s.toasts = [];
      s.lockdownLeft = 13.4;
      return { screen: 'play', levelIndex: 1, clock: 3.1, mouse: { x: 1100, y: 160, seen: true }, best: {} };
    }
    if (name === 'results') {
      world.load(2);
      run(world, 4, true);
      const s = world.state;
      Object.assign(s.player, { x: s.level.exit.x, y: s.level.exit.y, carrying: true });
      s.prizeTaken = true;
      s.gems.forEach((g) => { g.taken = true; });
      s.gemsTaken = s.gems.length;
      s.time = 96.4;
      s.alarmPeak = 14;
      s.alarm = 4;
      run(world, HW.STEP, false);
      return { screen: 'won', levelIndex: 2, clock: 1.4, mouse: { x: 0, y: 0, seen: false }, best: { 2: { score: s.results.score, rank: s.results.rank } } };
    }
    if (name === 'title') {
      world.load(0);
      run(world, 9, true);
      return { screen: 'title', levelIndex: 0, clock: 2.2, mouse: { x: 640, y: 450, seen: true }, best: {} };
    }
    // The cover: the whole first room, both guards, both cameras, the prize and a climbing alarm.
    world.load(0);
    run(world, 7.5, true);
    const s = world.state;
    Object.assign(s.player, tile(7, 7), { face: -0.3, coins: 2 });
    s.time = 41.6;
    s.alarm = 36;
    s.alarmPeak = 36;
    s.toasts = [];
    const g = s.guards[0];
    g.sus = 0.5;
    run(world, 0.4, false, { mx: 0.4, my: -1, sneak: true, interact: false, throwAt: null });
    Object.assign(g, { mode: 'investigate', target: tile(13, 4), search: 3, bubble: 0 });
    g.path = HW.findPath(s.level, g, g.target);
    s.coins.push({ sx: s.player.x, sy: s.player.y, tx: 17 * T, ty: 2.5 * T, t: 0.62 });
    s.rings.push({ x: 4 * T, y: 7.5 * T, r: 6, max: 60, t: 0.25, color: 'rgba(255,255,255,0.35)' });
    return { screen: 'play', levelIndex: 0, clock: 4.2, mouse: { x: 17 * T, y: HW.MAP_Y + 2.5 * T, seen: true }, best: {} };
  };
})(window.HUSH = window.HUSH || {});
