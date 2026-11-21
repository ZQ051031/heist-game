// Plays Hushwork in headless Chrome through real keyboard and mouse events (CDP Input domain),
// against the local server (`node serve.ts`). A small autopilot steers with WASD toward tiles,
// sneaking with Shift and waiting while a guard looks its way. Logs what happened and saves
// frames to /tmp/hush-play/. Usage: node tools/playtest.mjs [scenario]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';

const URL_ = process.env.URL ?? 'http://localhost:8080/?seed=1';
const out = '/tmp/hush-play';
mkdirSync(out, { recursive: true });
const b = await launch();
const requests = [];
const errors = [];
const inputMs = Number(process.env.INPUT_MS ?? 45);
let failures = 0;
b.on((m) => {
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
});
await b.send('Network.enable');
await b.send('Runtime.enable');
await b.send('Log.enable');
await b.send('Page.navigate', { url: URL_ });
await sleep(800);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ShiftLeft: 'Shift', KeyE: 'e', Digit1: '1', Digit2: '2', Digit3: '3', KeyR: 'r', KeyP: 'p', Enter: 'Enter', KeyQ: 'q' };
const down = new Set();
async function key(code, type) {
  await b.send('Input.dispatchKeyEvent', { type, code, key: KEYS[code], windowsVirtualKeyCode: code === 'ShiftLeft' ? 16 : KEYS[code].toUpperCase().charCodeAt(0) });
}
async function setHeld(codes) {
  for (const c of [...down]) if (!codes.includes(c)) { down.delete(c); await key(c, 'keyUp'); }
  for (const c of codes) if (!down.has(c)) { down.add(c); await key(c, 'keyDown'); }
}
async function tap(code) {
  await key(code, 'keyDown');
  await sleep(60);
  await key(code, 'keyUp');
}
async function click(x, y) {
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
const st = () => b.evaluate(`(() => { const s = __hushwork.state(); const p = s.player; return {
  screen: __hushwork.screen(), night: s.level.index + 1, time: +s.time.toFixed(2), alarmPeak: +s.alarmPeak.toFixed(1), x: Math.round(p.x), y: Math.round(p.y), alarm: +s.alarm.toFixed(1), prize: s.prizeTaken, gems: s.gemsTaken,
  coins: p.coins, lockdown: s.lockdown, hacked: +s.loopLeft.toFixed(1), hack: +p.hack.toFixed(2), rings: s.rings.length,
  guards: s.guards.map((g) => ({ x: Math.round(g.x), y: Math.round(g.y), mode: g.mode, sus: +g.sus.toFixed(2), sees: g.sees })),
  cams: s.cameras.map((c) => ({ sees: !!c.sees, sus: +(c.sus || 0).toFixed(2) })) }; })()`);
let frame = 0;
async function snap(label) {
  const { data } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const name = `${String(++frame).padStart(2, '0')}-${label}.jpg`;
  writeFileSync(`${out}/${name}`, Buffer.from(data, 'base64'));
  return name;
}
// Danger: is this spot inside (or about to be inside) a guard's or camera's view?
const dangerAt = (pts) => b.evaluate(`(() => { const H = window.HUSH, s = __hushwork.state(); const pts = ${JSON.stringify(pts)};
  return pts.map(([tx, ty]) => {
    for (const g of s.guards) { if (g.mode === 'alert' || g.mode === 'chase') return 'chase';
      if (H.inCone(s.level, g.x, g.y, g.face, H.GUARD.halfAngle + 0.45, H.GUARD.range + 50, tx, ty)) return 'guard';
      if (Math.hypot(g.x - tx, g.y - ty) < 70) return 'close'; }
    if (!(s.loopLeft > 0)) for (const c of s.cameras) if (H.inCone(s.level, c.x, c.y, c.angle, H.CAMERA.halfAngle + 0.3, H.CAMERA.range + 30, tx, ty)) return 'camera';
    return null; }); })()`);
async function goTo(col, row, { sneak = true, careful = true, timeout = 60000, until = null } = {}) {
  const T = 40;
  const t0 = Date.now();
  let waits = 0;
  const safe = [];
  let tick = 0;
  while (Date.now() - t0 < timeout) {
    const s = await st();
    if (s.screen !== 'play') { await setHeld([]); return s; }
    if (until && until(s)) break;
    const wp = await b.evaluate(`(() => { const H = window.HUSH, s = __hushwork.state(); const path = H.findPath(s.level, s.player, { x: ${(col + 0.5) * T}, y: ${(row + 0.5) * T} });
      if (!path || !path.length) return null; const n = path[Math.min(1, path.length - 1)]; return { x: n.x, y: n.y, left: path.length }; })()`);
    const gx = (col + 0.5) * T;
    const gy = (row + 0.5) * T;
    if (Math.hypot(s.x - gx, s.y - gy) < 10) break;
    const tx = wp && wp.left > 1 ? wp.x : gx;
    const ty = wp && wp.left > 1 ? wp.y : gy;
    if (careful) {
      const len = Math.hypot(tx - s.x, ty - s.y) || 1;
      const [dCur, dAhead] = await dangerAt([[s.x, s.y], [s.x + ((tx - s.x) / len) * 36, s.y + ((ty - s.y) / len) * 36]]);
      if (!dCur) safe.push([s.x, s.y]);
      if (process.env.TRACE && (tick++ % 8 === 0)) console.log('  t', s.x, s.y, '->', Math.round(tx), Math.round(ty), dCur, dAhead, JSON.stringify(s.guards.map((g) => [g.x, g.y, g.mode, g.sus])));
      if (dAhead && dAhead !== 'chase') {
        waits += 1;
        if (!dCur || safe.length === 0) { await setHeld(['ShiftLeft']); await sleep(60); continue; }
        // Back off along the trail of safe spots.
        let back = safe[safe.length - 1];
        while (safe.length > 1 && Math.hypot(back[0] - s.x, back[1] - s.y) < 6) { safe.pop(); back = safe[safe.length - 1]; }
        const keys = ['ShiftLeft'];
        if (back[0] - s.x > 3) keys.push('KeyD'); if (s.x - back[0] > 3) keys.push('KeyA');
        if (back[1] - s.y > 3) keys.push('KeyS'); if (s.y - back[1] > 3) keys.push('KeyW');
        await setHeld(keys); await sleep(45); continue;
      }
    }
    const keys = sneak ? ['ShiftLeft'] : [];
    if (tx - s.x > 4) keys.push('KeyD');
    if (s.x - tx > 4) keys.push('KeyA');
    if (ty - s.y > 4) keys.push('KeyS');
    if (s.y - ty > 4) keys.push('KeyW');
    await setHeld(keys);
    await sleep(inputMs);
  }
  await setHeld([]);
  const s = await st();
  s.waits = waits;
  return s;
}

// A look-ahead planner that runs in the page: it copies the live state into a scratch world and
// tries a few seconds of each option (follow the route, step one of 8 ways, hold still), then
// says which keys to hold. The real game only ever receives the keys.
const planner = `window.__plan = function (gx, gy, horizon) {
  const H = window.HUSH, live = __hushwork.state();
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const options = [];
  for (const sneak of [true, false]) {
    options.push({ wait: 0, dir: null, sneak });
    for (const d of dirs) options.push({ wait: 0.45, dir: d, sneak });
  }
  for (const w of [0.4, 1, 2, 3]) options.push({ wait: w, dir: [0, 0], sneak: true });
  const dist = (st) => { const path = H.findPath(st.level, st.player, { x: gx, y: gy }); return path ? path.length * 40 + Math.hypot(st.player.x - gx, st.player.y - gy) * 0.2 : 9999; };
  let best = null;
  for (const o of options) {
    const sim = H.createWorld(H.createRandom(7));
    const copy = structuredClone(live); copy.level = live.level; Object.assign(sim.state, copy);
    let bad = 0, t = 0, first = null, path = null, k = 0;
    const alarm0 = live.alarm, sus0 = Math.max(0, ...live.guards.map((g) => g.sus));
    for (; t < horizon + o.wait; t += H.STEP, k += 1) {
      let mx = 0, my = 0;
      const p = sim.state.player;
      if (o.dir && t < o.wait) { mx = o.dir[0]; my = o.dir[1]; }
      else {
        if (!path || k % 8 === 0) path = H.findPath(sim.state.level, p, { x: gx, y: gy });
        while (path && path.length > 1 && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 8) path.shift();
        const n = path && path.length > 1 ? path[1] : { x: gx, y: gy };
        const m = path && path.length > 1 && Math.hypot(path[0].x - p.x, path[0].y - p.y) > 20 ? path[0] : n;
        mx = Math.abs(m.x - p.x) > 3 ? Math.sign(m.x - p.x) : 0;
        my = Math.abs(m.y - p.y) > 3 ? Math.sign(m.y - p.y) : 0;
      }
      if (first === null) first = [mx, my];
      sim.step(H.STEP, { mx, my, sneak: o.sneak || t >= Math.max(o.wait, 0.45), interact: false, throwAt: null }, false);
      const st = sim.state;
      if (st.phase === 'won') break;
      if (st.phase !== 'play') { bad = 1000; break; }
      if (st.guards.some((g) => g.mode === 'alert' || g.mode === 'chase')) { bad = 500; break; }
      if (st.alarm > alarm0 + 14) { bad = 200; break; }
      if (Math.max(0, ...st.guards.map((g) => g.sus)) > Math.max(0.26, sus0 + 0.05)) { bad = 100; break; }
      if (live.prizeTaken === false && st.prizeTaken) break;
    }
    const score = bad ? bad * 10 - t * 100 : dist(sim.state) + o.wait * 40 + Math.max(0, sim.state.alarm - alarm0) * 25;
    if (!best || score < best.score) best = { score, kind: o.dir ? 'dir' : 'route', ox: o.dir ? o.dir[0] : 0, oy: o.dir ? o.dir[1] : 0, wait: o.wait, sneak: o.sneak, first, bad };
  }
  return best;
};`;
await b.evaluate(planner);
async function sneakTo(col, row, { timeout = 90000, until = null, horizon = 4.5 } = {}) {
  const gx = (col + 0.5) * 40;
  const gy = (row + 0.5) * 40;
  const t0 = Date.now();
  let unsafe = 0;
  let traceTick = 0;
  while (Date.now() - t0 < timeout) {
    const s = await st();
    if (s.screen !== 'play') break;
    if (until && until(s)) break;
    if (Math.hypot(s.x - gx, s.y - gy) < 10) break;
    const plan = await b.evaluate(`__plan(${gx}, ${gy}, ${horizon})`);
    if (plan.bad) unsafe += 1;
    if (process.env.TRACE && (unsafe + Date.now()) % 1 === 0 && (traceTick++ % 6 === 0)) console.log('  p', s.x, s.y, plan.kind, plan.ox, plan.oy, plan.sneak ? 'sneak' : 'walk', 'bad', plan.bad, 'alarm', s.alarm, JSON.stringify(s.guards.map((g) => [g.x, g.y, g.mode, g.sus])));
    const [mx, my] = plan.first;
    const keys = plan.sneak ? ['ShiftLeft'] : [];
    if (mx > 0) keys.push('KeyD'); if (mx < 0) keys.push('KeyA');
    if (my > 0) keys.push('KeyS'); if (my < 0) keys.push('KeyW');
    await setHeld(keys);
    await sleep(40);
  }
  await setHeld([]);
  const s = await st();
  s.unsafePlans = unsafe;
  return s;
}
const log = (...a) => console.log(...a);
const wanted = (process.argv[2] ?? 'all').split(',');
const run = (name) => wanted.includes('all') || wanted.includes(name);
async function freshNight1() {
  const scr = (await st()).screen;
  if (scr === 'title') await tap('Digit1');
  else if (scr === 'won') { await tap('KeyR'); }
  else await tap('KeyR');
  await sleep(300);
  return (await st()).screen;
}

if (run('walk')) {
  log('title', await st().then((s) => s.screen), await snap('title'));
  await tap('Digit1');
  await sleep(300);
  let s0 = await st();
  log('started night 1:', s0.screen, s0.x, s0.y);
  await setHeld(['KeyD']); await sleep(700); await setHeld(['KeyS']); await sleep(700); await setHeld([]);
  let s1 = await st();
  log('walked with D then S ->', s1.x, s1.y, 'noise', s1.noise, 'alarm', s1.alarm);
  await setHeld(['ShiftLeft', 'KeyS']); await sleep(400);
  const sn = await st(); await setHeld([]);
  log('sneaking rings', sn.rings, 'pos', sn.x, sn.y);
  await click(640, 56 + 300);
  await sleep(900);
  log('coin thrown via mouse click; coins left', (await st()).coins, await snap('coin'));
  await tap('KeyP'); await sleep(200); log('P ->', (await st()).screen, await snap('paused')); await tap('KeyP'); await sleep(200);
  log('P again ->', (await st()).screen);
}

if (run('heist') || run('night1')) {
  await freshNight1();
  log('restart ->', (await st()).screen);
  const term = await b.evaluate(`(() => { const t = __hushwork.state().level.terminal; return [Math.floor(t.x / 40), Math.floor(t.y / 40)]; })()`);
  let s = await sneakTo(term[0], term[1] - 1);
  log('at terminal', s.x, s.y, 'alarm', s.alarm, 'waits', s.waits);
  await setHeld(['KeyE']);
  for (let i = 0; i < 40; i += 1) { await sleep(100); const t = await st(); if (t.hacked > 0) break; }
  await setHeld([]);
  s = await st();
  log('held E: cameras looped for', s.hacked, 's', await snap('hacked'));
  for (const [c, r] of [[21, 14], [27, 14], [27, 11]]) {
    s = await sneakTo(c, r, { timeout: 30000 });
    log('  waypoint', c, r, '->', s.screen, s.x, s.y, 'alarm', s.alarm);
    if (s.screen !== 'play') break;
  }
  s = await sneakTo(29, 7, { until: (q) => q.prize });
  log('prize?', s.prize, 'screen', s.screen, 'alarm', s.alarm, 'pos', s.x, s.y, 'unsafe plans', s.unsafePlans, await snap('prize'));
  s = await sneakTo(28, 11, { until: (q) => q.gems > 0 });
  log('gem?', s.gems, 'screen', s.screen, 'alarm', s.alarm);
  s = await sneakTo(1, 14, { timeout: 120000 });
  await sleep(300);
  s = await st();
  log('end of heist:', s.screen, 'alarm', s.alarm, 'prize', s.prize, 'gems', s.gems, await snap('heist-end'));
  s.blocked = s.screen === 'won' ? null : 'route incomplete';
  s.frame = `${out}/${await snap(`night1-${s.screen}`)}`;
  log('FINAL', JSON.stringify(s));
  if (s.screen !== 'won') failures += 1;
}

if (run('alarm')) {
  await freshNight1();
  log('alarm run on night 1 ->', (await st()).screen);
  // Walk loudly out onto the open gallery floor and stand in the guards' sweep.
  let s = await goTo(8, 6, { sneak: false, careful: false, timeout: 8000 });
  const t0 = Date.now();
  let spotted = false;
  let peak = 0;
  while (Date.now() - t0 < 25000) {
    s = await st();
    peak = Math.max(peak, s.alarm);
    if (s.screen !== 'play') break;
    if (!spotted && s.guards.some((q) => q.mode === 'alert')) { spotted = true; log('guard alerted -> alarm', s.alarm, await snap('spotted')); }
    if (spotted && s.alarm > 40) break;
    await sleep(100);
  }
  log('alarm peak', peak);
  log('alarm test ended:', s.screen, 'alarm', s.alarm, 'lockdown', s.lockdown, await snap('alarm-end'));
}

if (run('lockdown')) {
  await freshNight1();
  log('lockdown run ->', (await st()).screen);
  // Walk in the open in front of camera(s) without sneaking, dodging guards, until lockdown.
  let s;
  const t0 = Date.now();
  let locked = false;
  while (Date.now() - t0 < 40000) {
    s = await goTo(28, 4, { sneak: false, careful: false, timeout: 3000 });
    if (s.lockdown && !locked) { locked = true; log('LOCKDOWN at alarm', s.alarm, await snap('lockdown')); break; }
    if (s.screen !== 'play') break;
    s = await goTo(28, 9, { sneak: false, careful: false, timeout: 3000 });
    if (s.lockdown && !locked) { locked = true; log('LOCKDOWN at alarm', s.alarm, await snap('lockdown')); break; }
    if (s.screen !== 'play') break;
  }
  s = await st();
  log('lockdown test state:', s.screen, 'alarm', s.alarm, 'lockdown', s.lockdown);
  const t1 = Date.now();
  while (Date.now() - t1 < 35000 && (await st()).screen === 'play') await sleep(250);
  s = await st();
  log('after waiting:', s.screen, await snap('lockdown-end'));
}

for (const night of [2, 3]) {
  if (!run(`night${night}`)) continue;
  await b.send('Page.navigate', { url: URL_ });
  await sleep(800);
  await b.evaluate(planner);
  await tap(`Digit${night}`);
  await sleep(Number(process.env.START_DELAY_MS ?? 300));
  const routes = {
    1: [[5, 14], [21, 14], [27, 14], [27, 7], [29, 7], [27, 14], [1, 14]],
    2: [[3, 10], [3, 7], [8, 5], [15, 5], [13, 2], [16, 5], [28, 5], [27, 3], [30, 1]],
    3: [[27, 11], [22, 7], [15, 7], [10, 7], [9, 5], [6, 5], [6, 1], [1, 1]],
  };
  for (const [col, row] of routes[night]) {
    const before = await st();
    const s = await goTo(col, row, { sneak: !(night === 2 && before.prize), careful: night === 2 && !before.prize, timeout: 30000, until: night === 2 && row === 2 ? (q) => q.prize : null });
    log('waypoint', night, col, row, JSON.stringify(s));
    if (s.screen !== 'play') break;
    if ((night === 2 && col === 3 && row === 7) || (night === 3 && col === 27 && row === 11)) {
      await setHeld(['KeyE']); await sleep(1600); await setHeld([]);
    }
    if (night === 2 && col === 15 && row === 5) {
      await click(19.5 * 40, 56 + 2.5 * 40); await sleep(1500);
    }
    if (night === 3 && col === 9 && row === 5) {
      await click(4.5 * 40, 56 + 9.5 * 40); await sleep(2000);
    }
  }
  await setHeld([]);
  const s = await st();
  s.blocked = s.screen === 'won' ? null : s.screen === 'play' ? 'route incomplete' : 'caught or lockdown';
  s.frame = `${out}/${await snap(`night${night}-${s.screen}`)}`;
  log('FINAL', JSON.stringify(s));
  if (s.screen !== 'won') failures += 1;
}

if (run('smoke')) {
  for (const night of [1, 2, 3]) {
    await b.send('Page.navigate', { url: URL_ });
    await sleep(800);
    await tap(`Digit${night}`);
    await sleep(500);
    const s = await st();
    log('LOAD', JSON.stringify({ night, screen: s.screen, frame: `${out}/${await snap(`load-night${night}`)}` }));
    if (s.screen !== 'play' || s.night !== night) failures += 1;
  }
}

const origin = new URL(URL_).origin;
const remote = requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:') && new URL(u).origin !== origin);
log('errors:', errors.length ? errors : 'none', '| non-local requests:', remote.length ? remote : 'none');
log(JSON.stringify({ url: URL_, consoleErrors: errors.length, nonLocalRequests: remote.length, failures }));
b.close();
if (failures || errors.length || remote.length) process.exitCode = 1;
