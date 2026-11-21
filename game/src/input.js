// Keyboard and mouse. Held keys steer and sneak; key presses and clicks are queued and taken once
// per frame by the loop, so a quick tap between two frames is never lost or counted twice.
(function (HW) {
  'use strict';

  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
    'KeyE', 'Space', 'Enter', 'Escape', 'KeyP', 'KeyR', 'KeyM', 'KeyN', 'KeyQ', 'Digit1', 'Digit2', 'Digit3',
  ]);

  HW.createInput = function createInput(canvas, toLogical) {
    const held = new Set();
    let presses = [];
    let clicks = [];
    const mouse = { x: HW.VIEW.width / 2, y: HW.VIEW.height / 2, down: false, seen: false };
    const listeners = [];

    window.addEventListener('keydown', (event) => {
      if (!GAME_KEYS.has(event.code)) return;
      event.preventDefault();
      held.add(event.code);
      if (!event.repeat) presses.push(event.code);
      listeners.forEach((fn) => fn());
    });
    window.addEventListener('keyup', (event) => held.delete(event.code));
    window.addEventListener('blur', () => {
      held.clear();
      mouse.down = false;
    });
    canvas.addEventListener('pointermove', (event) => {
      const p = toLogical(event.clientX, event.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.seen = true;
    });
    canvas.addEventListener('pointerdown', (event) => {
      const p = toLogical(event.clientX, event.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.seen = true;
      if (event.button === 0) {
        mouse.down = true;
        clicks.push({ x: p.x, y: p.y });
      }
      listeners.forEach((fn) => fn());
    });
    window.addEventListener('pointerup', () => {
      mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    const any = (...codes) => codes.some((code) => held.has(code));

    return {
      mouse,
      /** Call fn on every key press or click (the first one unlocks audio). */
      onGesture(fn) {
        listeners.push(fn);
      },
      axis() {
        return {
          mx: (any('KeyD', 'ArrowRight') ? 1 : 0) - (any('KeyA', 'ArrowLeft') ? 1 : 0),
          my: (any('KeyS', 'ArrowDown') ? 1 : 0) - (any('KeyW', 'ArrowUp') ? 1 : 0),
        };
      },
      sneak: () => any('ShiftLeft', 'ShiftRight'),
      interact: () => any('KeyE', 'Space'),
      takePresses() {
        const out = presses;
        presses = [];
        return out;
      },
      takeClicks() {
        const out = clicks;
        clicks = [];
        return out;
      },
    };
  };
})(window.HUSH = window.HUSH || {});
