// Hushwork: every tuning number, colour and name in one place. The view is a fixed 1280x720
// logical area (a 56 px HUD bar, the 32x16 tile room, a 24 px hint bar); the renderer scales it.
(function (HW) {
  'use strict';

  HW.VIEW = { width: 1280, height: 720 };
  HW.TILE = 40;
  HW.COLS = 32;
  HW.ROWS = 16;
  HW.MAP_Y = 56;
  HW.STEP = 1 / 60;

  HW.PLAYER = {
    radius: 11,
    walk: 152,
    sneak: 90,
    carryScale: 0.92,
    coins: 3,
    throwRange: 290,
    coinFlight: 0.55,
    stepEvery: 0.3,
    reach: 48,
  };

  HW.GUARD = {
    radius: 12,
    patrol: 62,
    investigate: 92,
    chase: 134,
    lockdownChase: 146,
    range: 240,
    halfAngle: 0.56,
    turn: 4.2,
    seeRate: 1.25,
    forget: 0.16,
    suspicious: 0.32,
    searchTime: 3.2,
    loseSight: 3.5,
    repath: 0.35,
  };

  HW.CAMERA = { range: 280, halfAngle: 0.34, alarmRate: 30, radioEvery: 1.6 };

  HW.ALARM = {
    max: 100,
    decay: 3.2,
    decayDelay: 2.2,
    guardSpot: 20,
    guardSeeRate: 16,
    laser: 34,
    lootLift: 8,
    lockdownSeconds: 24,
    radioEvery: 2.4,
  };

  HW.NOISE = { step: 96, carpetScale: 0.45, wallScale: 0.6, coin: 215, loot: 170 };

  HW.TERMINAL = { hackTime: 1.3, loopTime: 14, cooldown: 18 };

  HW.SCORE = { loot: 1000, gem: 200, perSecond: 15, alarmPenalty: 5, ghost: 600, ranks: [['S', 2300], ['A', 1800], ['B', 1300], ['C', 0]] };

  HW.FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  HW.MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
  HW.BEST_KEY = 'hushwork.best.v1';

  HW.PALETTE = {
    backdrop: '#06080e',
    hud: '#0c1019',
    hudLine: '#232a3a',
    text: '#e9edf5',
    muted: '#8790a4',
    accent: '#5fe0c8',
    gold: '#f4c95d',
    danger: '#ff4d5e',
    warn: '#ffb347',
    thief: '#5fe0c8',
    guard: '#3c5a99',
    guardCone: 'rgba(255, 236, 170, 0.20)',
    camCone: 'rgba(170, 220, 255, 0.16)',
    alertCone: 'rgba(255, 70, 90, 0.28)',
    laser: '#ff3b6b',
  };
})(window.HUSH = window.HUSH || {});
