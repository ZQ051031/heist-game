// The rules, with no drawing and no browser in them: the thief, the guards and what they see and
// hear, the cameras, lasers and terminal, the alarm meter and lockdown, the prize and the exit.
// step() advances one fixed step; what happened is left in state.events for sound and screen.
(function (HW) {
  'use strict';

  const P = HW.PLAYER;
  const G = HW.GUARD;
  const A = HW.ALARM;

  HW.createWorld = function createWorld(random) {
    const state = { level: null, events: [] };

    function load(index) {
      const level = HW.parseLevel(index);
      Object.assign(state, {
        level,
        phase: 'play',
        time: 0,
        alarm: 0,
        alarmPeak: 0,
        sinceSeen: 99,
        lockdown: false,
        lockdownLeft: 0,
        radio: 0,
        loopLeft: 0,
        termCooldown: 0,
        laserCooldown: 0,
        prizeTaken: false,
        gemsTaken: 0,
        everAlerted: false,
        exitNagged: false,
        results: null,
        events: [],
        rings: [],
        toasts: [],
        coins: [],
        shake: 0,
      });
      state.player = {
        x: level.start.x, y: level.start.y, face: -Math.PI / 2, moving: false, sneaking: false,
        coins: P.coins, stepTimer: 0, lit: false, hack: 0, carrying: false, seenBy: 0,
      };
      state.gems = level.gems.map((g) => ({ x: g.x, y: g.y, taken: false }));
      state.guards = level.guards.map((g, i) => {
        const first = g.route[0];
        return {
          id: i, route: g.route, routeIndex: 0, x: first.x, y: first.y, face: first.look,
          mode: 'patrol', sus: 0, path: [], wait: first.wait * (0.5 + random()), scan: random() * 6,
          target: null, lastSeen: null, repath: 0, lost: 0, search: 0, sees: false, bubble: 0, walkTime: 0,
        };
      });
      state.cameras = level.cameras.map((c) => ({ ...c, angle: c.base, spotting: false, radio: 0 }));
      state.lasers = level.lasers.map((l) => ({ ...l, active: true }));
    }

    function emit(type, data) {
      state.events.push({ type, ...data });
    }

    function toast(text, seconds = 2.6) {
      state.toasts.push({ text, t: seconds, life: seconds });
    }

    function ring(x, y, max, color) {
      state.rings.push({ x, y, r: 6, max, t: 0, color });
    }

    function raiseAlarm(amount) {
      if (state.lockdown) return;
      state.alarm = Math.min(A.max, state.alarm + amount);
      state.alarmPeak = Math.max(state.alarmPeak, state.alarm);
      if (state.alarm >= A.max) startLockdown();
    }

    function startLockdown() {
      state.lockdown = true;
      state.alarm = A.max;
      state.alarmPeak = A.max;
      state.lockdownLeft = A.lockdownSeconds;
      state.radio = 0;
      state.shake = 0.6;
      emit('lockdown');
      toast('LOCKDOWN — reach the exit before the shutters seal!', 4);
      for (const g of state.guards) alertGuard(g, true);
    }

    // ------------------------------------------------------------------ guards

    function setPath(g, to) {
      g.path = HW.findPath(state.level, g, to);
    }

    function investigate(g, x, y, why) {
      if (g.mode === 'alert') return;
      const was = g.mode;
      g.mode = 'investigate';
      g.target = { x, y };
      g.search = G.searchTime;
      g.sus = Math.max(g.sus, G.suspicious);
      setPath(g, g.target);
      if (was !== 'investigate') {
        g.bubble = 1.6;
        emit('huh', { why });
      }
    }

    function alertGuard(g, quiet) {
      const p = state.player;
      if (g.mode !== 'alert' && !quiet) {
        emit('alert');
        raiseAlarm(A.guardSpot);
        state.shake = Math.max(state.shake, 0.3);
      }
      g.mode = 'alert';
      g.sus = 1;
      g.lost = 0;
      g.bubble = 2;
      g.lastSeen = { x: p.x, y: p.y };
      g.repath = 0;
      state.everAlerted = true;
    }

    function returnToRoute(g) {
      g.mode = 'return';
      g.target = null;
      let best = 0;
      let bestD = Infinity;
      g.route.forEach((w, i) => {
        const d = Math.hypot(w.x - g.x, w.y - g.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      g.routeIndex = best;
      setPath(g, g.route[best]);
    }

    /** Walk along g.path at `speed`; true once the path is used up. */
    function follow(g, speed, dt) {
      let budget = speed * dt;
      while (budget > 0 && g.path.length > 0) {
        const next = g.path[0];
        const dx = next.x - g.x;
        const dy = next.y - g.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.5) {
          g.path.shift();
          continue;
        }
        g.moveFace = Math.atan2(dy, dx);
        const move = Math.min(budget, d);
        g.x += (dx / d) * move;
        g.y += (dy / d) * move;
        budget -= move;
        if (move >= d) g.path.shift();
      }
      return g.path.length === 0;
    }

    function guardSees(g) {
      const p = state.player;
      return HW.inCone(state.level, g.x, g.y, g.face, G.halfAngle, G.range, p.x, p.y);
    }

    function stepGuard(g, dt, attract) {
      const p = state.player;
      g.bubble = Math.max(0, g.bubble - dt);
      g.scan += dt;
      g.sees = !attract && state.phase === 'play' && guardSees(g);
      let lookAt = null;

      if (g.sees) {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        const prox = 1.6 - d / G.range;
        const rate = G.seeRate * prox * (p.lit ? 1 : 0.42) * (p.sneaking ? 0.75 : 1) * (p.moving ? 1 : 0.7);
        g.lastSeen = { x: p.x, y: p.y };
        p.seenBy += 1;
        if (g.mode === 'alert') {
          g.lost = 0;
          raiseAlarm(A.guardSeeRate * dt);
        } else {
          g.sus = Math.min(1, g.sus + rate * dt);
          if (g.sus >= 1) alertGuard(g, false);
          else if (g.sus >= G.suspicious && (g.mode === 'patrol' || g.mode === 'return')) investigate(g, p.x, p.y, 'saw');
          else if (g.mode === 'investigate' && g.sus >= G.suspicious) {
            g.target = { x: p.x, y: p.y };
            g.search = G.searchTime;
            g.repath -= dt;
            if (g.repath <= 0) {
              setPath(g, g.target);
              g.repath = G.repath;
            }
          }
        }
        if (g.sus >= G.suspicious * 0.5) lookAt = Math.atan2(p.y - g.y, p.x - g.x);
      } else if (g.mode !== 'alert') {
        g.sus = Math.max(0, g.sus - G.forget * dt);
      }

      let moving = false;
      if (g.mode === 'patrol') {
        if (g.path.length > 0) {
          follow(g, G.patrol, dt);
          moving = true;
        } else if (g.wait > 0) {
          g.wait -= dt;
          const w = g.route[g.routeIndex];
          g.wantFace = w.look + Math.sin(g.scan * 1.4) * 0.7;
          if (g.wait <= 0) {
            g.routeIndex = (g.routeIndex + 1) % g.route.length;
            setPath(g, g.route[g.routeIndex]);
          }
        } else {
          g.wait = g.route[g.routeIndex].wait;
        }
      } else if (g.mode === 'investigate') {
        if (g.path.length > 0) {
          follow(g, G.investigate, dt);
          moving = true;
        } else {
          g.search -= dt;
          g.wantFace = (g.wantFace ?? g.face) + dt * 2.2;
          if (g.search <= 0) returnToRoute(g);
        }
      } else if (g.mode === 'return') {
        if (g.path.length > 0) {
          follow(g, G.patrol, dt);
          moving = true;
        } else {
          g.mode = 'patrol';
          g.wait = g.route[g.routeIndex].wait;
        }
      } else if (g.mode === 'alert') {
        const speed = state.lockdown ? G.lockdownChase : G.chase;
        g.repath -= dt;
        if (g.sees) {
          if (g.repath <= 0) {
            setPath(g, p);
            g.repath = G.repath;
          }
        } else {
          g.lost += dt;
          if (g.repath <= 0 && g.lastSeen) {
            setPath(g, g.lastSeen);
            g.repath = 1;
          }
        }
        if (g.path.length > 0) {
          follow(g, speed, dt);
          moving = true;
        } else {
          g.wantFace = (g.wantFace ?? g.face) + dt * 3;
        }
        if (!state.lockdown && g.lost > G.loseSight && g.path.length === 0) {
          g.mode = 'patrol';
          investigate(g, g.x, g.y, 'lost');
          g.sus = 0.6;
          emit('lost');
        }
      }

      if (moving) g.walkTime += dt;
      const want = lookAt ?? (moving ? g.moveFace : g.wantFace ?? g.face);
      g.face = HW.wrapAngle(HW.turnToward(g.face, want, G.turn * dt * (g.mode === 'alert' ? 1.6 : 1)));

      if (!attract && state.phase === 'play' && Math.hypot(p.x - g.x, p.y - g.y) < G.radius + P.radius + 1) {
        state.phase = 'caught';
        state.shake = 0.5;
        emit('caught', { by: g.id });
      }
    }

    /** A sound at (x, y) that carries `radius` px (less through walls): guards in earshot come to look. */
    function noise(x, y, radius, why) {
      for (const g of state.guards) {
        const d = Math.hypot(g.x - x, g.y - y);
        const reach = HW.hasLine(state.level, g.x, g.y, x, y) ? radius : radius * HW.NOISE.wallScale;
        if (d <= reach) investigate(g, x, y, why);
      }
    }

    // ------------------------------------------------------------------ the thief

    function stepPlayer(dt, input) {
      const p = state.player;
      const level = state.level;
      let mx = input.mx;
      let my = input.my;
      const len = Math.hypot(mx, my);
      p.sneaking = input.sneak;
      p.moving = len > 0.01;
      if (p.moving) {
        mx /= len;
        my /= len;
        const speed = (p.sneaking ? P.sneak : P.walk) * (p.carrying ? P.carryScale : 1);
        p.x += mx * speed * dt;
        p.y += my * speed * dt;
        HW.collideCircle(level, p, P.radius);
        p.face = HW.turnToward(p.face, Math.atan2(my, mx), 14 * dt);
        p.stepTimer -= dt;
        if (p.stepTimer <= 0) {
          p.stepTimer = p.sneaking ? P.stepEvery * 1.6 : P.stepEvery;
          const onCarpet = HW.tileAt(level, Math.floor(p.x / HW.TILE), Math.floor(p.y / HW.TILE)) === HW.T_CARPET;
          if (p.sneaking) emit('step', { soft: true });
          else {
            const radius = HW.NOISE.step * (onCarpet ? HW.NOISE.carpetScale : 1);
            ring(p.x, p.y, radius, 'rgba(255,255,255,0.35)');
            noise(p.x, p.y, radius, 'step');
            emit('step', { soft: onCarpet });
          }
        }
      } else {
        p.stepTimer = 0.05;
      }
      p.lit = level.lights.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < l.r * 0.72);

      if (input.throwAt && p.coins > 0) throwCoin(input.throwAt.x, input.throwAt.y);

      // The terminal: hold the interact key beside it to loop the camera feeds.
      if (level.terminal) {
        const near = Math.hypot(level.terminal.x - p.x, level.terminal.y - p.y) < P.reach;
        if (near && input.interact && state.termCooldown <= 0) {
          p.hack += dt / HW.TERMINAL.hackTime;
          if (p.hack >= 1) {
            p.hack = 0;
            state.loopLeft = HW.TERMINAL.loopTime;
            state.termCooldown = HW.TERMINAL.cooldown;
            emit('hacked');
            toast(`Feeds looped: cameras and lasers dark for ${HW.TERMINAL.loopTime} s`);
          }
        } else {
          p.hack = Math.max(0, p.hack - dt * 2);
        }
      }

      if (!state.prizeTaken && Math.hypot(level.prize.x - p.x, level.prize.y - p.y) < 24 + P.radius) {
        state.prizeTaken = true;
        p.carrying = true;
        emit('prize');
        toast(`${level.def.prize} lifted! Now get out.`);
        ring(level.prize.x, level.prize.y, HW.NOISE.loot, 'rgba(255,210,120,0.5)');
        noise(level.prize.x, level.prize.y, HW.NOISE.loot, 'loot');
        raiseAlarm(A.lootLift);
      }
      for (const gem of state.gems) {
        if (!gem.taken && Math.hypot(gem.x - p.x, gem.y - p.y) < 18 + P.radius) {
          gem.taken = true;
          state.gemsTaken += 1;
          emit('gem');
        }
      }

      const atExit = Math.hypot(level.exit.x - p.x, level.exit.y - p.y) < 26;
      if (atExit && p.carrying) win();
      else if (atExit && !state.exitNagged) {
        state.exitNagged = true;
        toast(`Not leaving without the ${level.def.prize}.`);
        emit('nag');
      } else if (!atExit) state.exitNagged = false;
    }

    function throwCoin(tx, ty) {
      const p = state.player;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      let reach = Math.min(d, P.throwRange);
      let x = p.x + (dx / d) * reach;
      let y = p.y + (dy / d) * reach;
      while (reach > 0 && !HW.walkableAt(state.level, x, y)) {
        reach -= 6;
        x = p.x + (dx / d) * reach;
        y = p.y + (dy / d) * reach;
      }
      p.coins -= 1;
      state.coins.push({ sx: p.x, sy: p.y, tx: x, ty: y, t: 0 });
      emit('throw');
    }

    function win() {
      state.phase = 'won';
      const S = HW.SCORE;
      const ghost = !state.everAlerted && state.alarmPeak < 10;
      const timeBonus = Math.max(0, Math.round((state.level.def.par - state.time) * S.perSecond));
      const parts = [
        ['Prize: ' + state.level.def.prize, S.loot],
        [`Gems x${state.gemsTaken}`, state.gemsTaken * S.gem],
        ['Time bonus', timeBonus],
        ['Alarm penalty', -Math.round(state.alarmPeak * S.alarmPenalty)],
      ];
      if (ghost) parts.push(['Ghost: never spotted', S.ghost]);
      const score = Math.max(0, parts.reduce((sum, part) => sum + part[1], 0));
      const rank = S.ranks.find((r) => score >= r[1])[0];
      state.results = { parts, score, rank, ghost, time: state.time };
      emit('win');
    }

    // ------------------------------------------------------------------ the step

    /**
     * One fixed step. input: { mx, my, sneak, interact, throwAt } (throwAt a room point or null).
     * With `attract` set (the title screen's backdrop) guards and cameras move but notice nothing.
     */
    function step(dt, input, attract) {
      state.events.length = 0;
      state.shake = Math.max(0, state.shake - dt);
      for (const r of state.rings) r.t += dt;
      state.rings = state.rings.filter((r) => r.t < 0.7);
      for (const t of state.toasts) t.t -= dt;
      state.toasts = state.toasts.filter((t) => t.t > 0);
      if (state.phase !== 'play') return state.events;

      state.time += dt;
      state.loopLeft = Math.max(0, state.loopLeft - dt);
      state.termCooldown = Math.max(0, state.termCooldown - dt);
      state.laserCooldown = Math.max(0, state.laserCooldown - dt);
      const p = state.player;
      p.seenBy = 0;
      if (!attract) stepPlayer(dt, input);

      for (const c of state.coins) {
        c.t += dt / P.coinFlight;
        if (c.t >= 1) {
          ring(c.tx, c.ty, HW.NOISE.coin, 'rgba(255,215,110,0.55)');
          noise(c.tx, c.ty, HW.NOISE.coin, 'coin');
          emit('clink');
        }
      }
      state.coins = state.coins.filter((c) => c.t < 1);

      for (const g of state.guards) stepGuard(g, dt, attract);

      const looped = state.loopLeft > 0;
      let camSees = false;
      for (const c of state.cameras) {
        c.angle = c.base + c.sweep * Math.sin(c.phase + state.time * c.speed);
        const was = c.spotting;
        c.spotting = !attract && !looped && state.phase === 'play' && HW.inCone(state.level, c.x, c.y, c.angle, HW.CAMERA.halfAngle, HW.CAMERA.range, p.x, p.y);
        if (c.spotting) {
          camSees = true;
          raiseAlarm(HW.CAMERA.alarmRate * dt * (p.lit ? 1 : 0.55) * (p.sneaking ? 0.85 : 1));
          if (!was) emit('camera');
          c.radio -= dt;
          if (c.radio <= 0) {
            c.radio = HW.CAMERA.radioEvery;
            let nearest = null;
            for (const g of state.guards) {
              if (g.mode === 'alert') continue;
              if (!nearest || Math.hypot(g.x - p.x, g.y - p.y) < Math.hypot(nearest.x - p.x, nearest.y - p.y)) nearest = g;
            }
            if (nearest) investigate(nearest, p.x, p.y, 'radio');
          }
        } else c.radio = 0;
      }

      for (const l of state.lasers) {
        const cycle = l.on + l.off;
        l.active = !looped && ((state.time + l.phase) % cycle + cycle) % cycle < l.on;
        if (!attract && l.active && state.laserCooldown <= 0 && state.phase === 'play' && HW.segmentDistance(p.x, p.y, l.ax, l.ay, l.bx, l.by) < P.radius) {
          state.laserCooldown = 1.2;
          raiseAlarm(A.laser);
          ring(p.x, p.y, 320, 'rgba(255,60,100,0.5)');
          noise(p.x, p.y, 320, 'laser');
          state.shake = Math.max(state.shake, 0.25);
          emit('laser');
        }
      }

      if (p.seenBy > 0 || camSees) state.sinceSeen = 0;
      else state.sinceSeen += dt;
      if (!state.lockdown && state.sinceSeen > A.decayDelay) state.alarm = Math.max(0, state.alarm - A.decay * dt);

      if (state.lockdown && state.phase === 'play') {
        state.lockdownLeft -= dt;
        state.radio -= dt;
        if (state.radio <= 0) {
          state.radio = A.radioEvery;
          for (const g of state.guards) {
            g.lastSeen = { x: p.x, y: p.y };
            g.repath = 0;
          }
        }
        if (state.lockdownLeft <= 0) {
          state.lockdownLeft = 0;
          state.phase = 'sealed';
          emit('sealed');
        }
      }
      return state.events;
    }

    return { state, load, step, toast, raiseAlarm };
  };
})(window.HUSH = window.HUSH || {});
