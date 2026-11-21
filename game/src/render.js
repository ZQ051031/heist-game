// Everything drawn: the room (pre-painted once per level), the darkness and its lamp pools, vision
// cones cut off by walls, the thief, guards, cameras, lasers and loot, the HUD with the alarm meter,
// and the title, pause, busted and results screens. The canvas keeps a 1280x720 logical size,
// letterboxed to the window at the display's pixel ratio.
(function (HW) {
  'use strict';

  const W = HW.VIEW.width;
  const H = HW.VIEW.height;
  const T = HW.TILE;
  const RW = HW.COLS * T;
  const RH = HW.ROWS * T;
  const C = HW.PALETTE;
  const TAU = Math.PI * 2;

  /** Clickable buttons for a screen, shared by the renderer (to draw) and the loop (to hit-test). */
  HW.buttonsFor = function buttonsFor(screen, levelIndex) {
    const row = (items, y) => {
      const w = 190;
      const gap = 18;
      const x0 = (W - (items.length * w + (items.length - 1) * gap)) / 2;
      return items.map(([id, label, key], i) => ({ id, label, key, x: x0 + i * (w + gap), y, w, h: 46 }));
    };
    if (screen === 'title') return HW.LEVELS.map((_, i) => ({ id: 'level' + i, x: 130 + i * 350, y: 372, w: 320, h: 178 }));
    if (screen === 'paused') return row([['resume', 'Resume', 'P'], ['restart', 'Restart', 'R'], ['menu', 'Menu', 'Q']], 420);
    if (screen === 'caught' || screen === 'sealed') return row([['restart', 'Try again', 'R'], ['menu', 'Menu', 'Q']], 470);
    if (screen === 'won') {
      const items = [['restart', 'Replay', 'R'], ['menu', 'Menu', 'Q']];
      if (levelIndex < HW.LEVELS.length - 1) items.unshift(['next', 'Next night', 'Enter']);
      return row(items, 560);
    }
    return [];
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function layer(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ------------------------------------------------------------------ the static room

  function paintRoom(level) {
    const canvas = layer(RW, RH);
    const ctx = canvas.getContext('2d');
    const th = level.def.theme;
    const at = (c, r) => HW.tileAt(level, c, r);
    for (let r = 0; r < HW.ROWS; r += 1) {
      for (let c = 0; c < HW.COLS; c += 1) {
        const x = c * T;
        const y = r * T;
        const t = at(c, r);
        if (t === HW.T_WALL) continue;
        if (t === HW.T_CARPET) {
          ctx.fillStyle = th.carpet;
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = 'rgba(255,255,255,0.035)';
          ctx.beginPath();
          ctx.moveTo(x + T / 2, y + 6);
          ctx.lineTo(x + T - 6, y + T / 2);
          ctx.lineTo(x + T / 2, y + T - 6);
          ctx.lineTo(x + 6, y + T / 2);
          ctx.fill();
          ctx.strokeStyle = th.carpetEdge;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (at(c, r - 1) !== HW.T_CARPET) { ctx.moveTo(x, y + 4); ctx.lineTo(x + T, y + 4); }
          if (at(c, r + 1) !== HW.T_CARPET) { ctx.moveTo(x, y + T - 4); ctx.lineTo(x + T, y + T - 4); }
          if (at(c - 1, r) !== HW.T_CARPET) { ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + T); }
          if (at(c + 1, r) !== HW.T_CARPET) { ctx.moveTo(x + T - 4, y); ctx.lineTo(x + T - 4, y + T); }
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = (c + r) % 2 ? th.floor : th.floorAlt;
          ctx.fillRect(x, y, T, T);
          for (let i = 0; i < 5; i += 1) {
            ctx.fillStyle = `rgba(255,255,255,${0.015 + hash(c * 7 + i, r) * 0.03})`;
            ctx.fillRect(x + hash(c, r * 3 + i) * 36, y + hash(c * 5 + i, r) * 36, 3, 2);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
        }
      }
    }
    // Walls: a lit top face, and a darker front face where the floor lies below.
    for (let r = 0; r < HW.ROWS; r += 1) {
      for (let c = 0; c < HW.COLS; c += 1) {
        if (at(c, r) !== HW.T_WALL) continue;
        const x = c * T;
        const y = r * T;
        ctx.fillStyle = th.wall;
        ctx.fillRect(x, y, T, T);
        const front = r < HW.ROWS - 1 && at(c, r + 1) !== HW.T_WALL;
        ctx.fillStyle = th.wallTop;
        ctx.fillRect(x, y, T, front ? T - 12 : T);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, T, 2);
        if (front) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, y + T - 12, T, 12);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, y + T, T, 6);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.strokeRect(x + 0.5, y + 0.5, T - 1, front ? T - 12 : T - 1);
      }
    }
    for (let r = 0; r < HW.ROWS; r += 1) {
      for (let c = 0; c < HW.COLS; c += 1) {
        const t = at(c, r);
        const x = c * T;
        const y = r * T;
        if (t === HW.T_BLOCK) paintBlock(ctx, x, y, level.index, th);
        else if (t === HW.T_GLASS) paintGlass(ctx, x, y, c, r, th);
        else if (t === HW.T_TERMINAL) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + 4, y + 8, T - 4, T - 6);
          ctx.fillStyle = '#3a3f4f';
          roundRect(ctx, x + 2, y + 4, T - 4, T - 8, 4);
          ctx.fill();
          ctx.fillStyle = '#1b1e28';
          ctx.fillRect(x + 6, y + 8, T - 12, 14);
          ctx.fillStyle = '#545b70';
          for (let k = 0; k < 4; k += 1) ctx.fillRect(x + 7 + k * 7, y + 26, 5, 4);
        }
      }
    }
    // Ceiling lamps: a small fixture glyph.
    for (const l of level.lights) {
      ctx.fillStyle = 'rgba(255,220,150,0.14)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 16, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,170,0.35)';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 6, 0, TAU);
      ctx.stroke();
    }
    // The exit hatch: hazard chevrons.
    const ex = level.exit.x - T / 2;
    const ey = level.exit.y - T / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ex + 2, ey + 2, T - 4, T - 4);
    ctx.clip();
    ctx.fillStyle = '#1c2a22';
    ctx.fillRect(ex, ey, T, T);
    ctx.strokeStyle = 'rgba(120,255,170,0.35)';
    ctx.lineWidth = 4;
    for (let k = -T; k < T * 2; k += 10) {
      ctx.beginPath();
      ctx.moveTo(ex + k, ey);
      ctx.lineTo(ex + k - T, ey + T);
      ctx.stroke();
    }
    ctx.restore();
    // The prize's pedestal.
    const px = level.prize.x;
    const py = level.prize.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px + 3, py + 5, 17, 13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d8d2c4';
    ctx.beginPath();
    ctx.arc(px, py, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a49d8e';
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, TAU);
    ctx.fill();
    return canvas;
  }

  function paintBlock(ctx, x, y, variant, th) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 6, y + 8, T - 6, T - 4);
    if (variant === 2) {
      // A potted fern.
      ctx.fillStyle = '#5a4033';
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, 14, 0, TAU);
      ctx.fill();
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * TAU;
        ctx.fillStyle = k % 2 ? '#2f7a4f' : '#3f9a61';
        ctx.beginPath();
        ctx.ellipse(x + T / 2 + Math.cos(a) * 8, y + T / 2 + Math.sin(a) * 8, 10, 4, a, 0, TAU);
        ctx.fill();
      }
      return;
    }
    ctx.fillStyle = th.block;
    roundRect(ctx, x + 3, y + 3, T - 6, T - 6, variant === 1 ? 17 : 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x + 6, y + 6, T - 12, T - 12, variant === 1 ? 14 : 3);
    ctx.fill();
    if (variant === 0) {
      // A sculpture on its plinth: an abstract stone loop.
      ctx.strokeStyle = '#c9c1b0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(x + T / 2, y + T / 2, 9, 6, 0.6, 0, TAU);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(x + T / 2 + Math.cos(a) * 6, y + T / 2 + Math.sin(a) * 6);
        ctx.lineTo(x + T / 2 + Math.cos(a) * 15, y + T / 2 + Math.sin(a) * 15);
        ctx.stroke();
      }
    }
  }

  function paintGlass(ctx, x, y, c, r, th) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 6, y + 8, T - 6, T - 4);
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
    const hue = Math.floor(hash(c, r) * 4);
    ctx.fillStyle = ['#e8b04a', '#8fd3ff', '#e46a8c', '#b9f27c'][hue];
    ctx.beginPath();
    if (hue % 2) ctx.arc(x + T / 2, y + T / 2, 6, 0, TAU);
    else {
      ctx.moveTo(x + T / 2, y + 11);
      ctx.lineTo(x + T - 13, y + T / 2);
      ctx.lineTo(x + T / 2, y + T - 11);
      ctx.lineTo(x + 13, y + T / 2);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(150,220,255,0.18)';
    ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
    ctx.strokeStyle = 'rgba(190,235,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 4.5, y + 4.5, T - 9, T - 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 20);
    ctx.lineTo(x + 20, y + 9);
    ctx.stroke();
    void th;
  }

  function paintDark(level) {
    const canvas = layer(RW, RH);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(2,4,12,0.62)';
    ctx.fillRect(0, 0, RW, RH);
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of level.lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // A warm tint inside the pools.
    ctx.globalCompositeOperation = 'lighter';
    for (const l of level.lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, 'rgba(70,50,20,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fill();
    }
    return canvas;
  }

  // ------------------------------------------------------------------ the renderer

  HW.createRenderer = function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let cssScale = 1;
    let cssX = 0;
    let cssY = 0;
    let cached = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      cssScale = Math.min(vw / W, vh / H);
      cssX = (vw - W * cssScale) / 2;
      cssY = (vh - H * cssScale) / 2;
      ctx.setTransform(cssScale * dpr, 0, 0, cssScale * dpr, cssX * dpr, cssY * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    function toLogical(clientX, clientY) {
      return { x: (clientX - cssX) / cssScale, y: (clientY - cssY) / cssScale };
    }

    function layersFor(level) {
      if (!cached || cached.level !== level) cached = { level, room: paintRoom(level), dark: paintDark(level) };
      return cached;
    }

    // ---------------------------------------------------------------- pieces of the room

    function cone(pts, colour, range) {
      const g = ctx.createRadialGradient(pts[0], pts[1], 4, pts[0], pts[1], range);
      g.addColorStop(0, colour.replace(/[\d.]+\)$/, (a) => `${Math.min(1, parseFloat(a) * 1.8)})`));
      g.addColorStop(1, colour.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = colour.replace(/[\d.]+\)$/, '0.35)');
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawCones(s) {
      const level = s.level;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const g of s.guards) {
        const colour = g.mode === 'alert' ? C.alertCone : g.mode === 'investigate' || g.sus > 0.15 ? 'rgba(255,170,60,0.24)' : C.guardCone;
        cone(HW.conePolygon(level, g.x, g.y, g.face, HW.GUARD.halfAngle, HW.GUARD.range, 40), colour, HW.GUARD.range);
      }
      if (s.loopLeft <= 0) {
        for (const c of s.cameras) {
          cone(HW.conePolygon(level, c.x, c.y, c.angle, HW.CAMERA.halfAngle, HW.CAMERA.range, 30), c.spotting ? C.alertCone : C.camCone, HW.CAMERA.range);
        }
      }
      ctx.restore();
    }

    function drawLasers(s, clock) {
      for (const l of s.lasers) {
        for (const [x, y] of [[l.ax, l.ay], [l.bx, l.by]]) {
          ctx.fillStyle = '#20232e';
          ctx.fillRect(x - 5, y - 5, 10, 10);
          ctx.fillStyle = l.active ? C.laser : '#552233';
          ctx.fillRect(x - 2, y - 2, 4, 4);
        }
        if (l.active) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,50,100,${0.35 + 0.15 * Math.sin(clock * 30)})`;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(l.ax, l.ay);
          ctx.lineTo(l.bx, l.by);
          ctx.stroke();
          ctx.strokeStyle = '#ffd0dc';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.setLineDash([3, 6]);
          ctx.strokeStyle = 'rgba(255,60,100,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(l.ax, l.ay);
          ctx.lineTo(l.bx, l.by);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    function glow(x, y, r, colour) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, colour);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    function drawPrizeIcon(x, y, size, index, colour, clock) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = colour;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      if (index === 0) {
        // The Sable Orchid: five jewelled petals around a gold heart.
        for (let k = 0; k < 5; k += 1) {
          ctx.save();
          ctx.rotate((k / 5) * TAU + clock * 0.4);
          ctx.beginPath();
          ctx.ellipse(0, -size * 0.5, size * 0.28, size * 0.5, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.25, 0, TAU);
        ctx.fill();
      } else if (index === 1) {
        // The Ninefold Key: a ring bow and a toothed blade.
        ctx.rotate(-0.6);
        ctx.lineWidth = size * 0.22;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.arc(-size * 0.45, 0, size * 0.35, 0, TAU);
        ctx.stroke();
        ctx.fillRect(-size * 0.12, -size * 0.1, size * 1.1, size * 0.2);
        for (let k = 0; k < 3; k += 1) ctx.fillRect(size * (0.45 + k * 0.18), size * 0.08, size * 0.1, size * 0.22);
      } else {
        // The Moth Crown: a band with wing-shaped peaks.
        ctx.beginPath();
        ctx.moveTo(-size, size * 0.4);
        ctx.lineTo(-size, -size * 0.1);
        ctx.lineTo(-size * 0.55, -size * 0.7);
        ctx.lineTo(-size * 0.25, -size * 0.05);
        ctx.lineTo(0, -size * 0.85);
        ctx.lineTo(size * 0.25, -size * 0.05);
        ctx.lineTo(size * 0.55, -size * 0.7);
        ctx.lineTo(size, -size * 0.1);
        ctx.lineTo(size, size * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff5fa2';
        ctx.beginPath();
        ctx.arc(0, size * 0.1, size * 0.16, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawGem(x, y, r) {
      ctx.fillStyle = '#7df9c4';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.8, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.35, y - r * 0.1);
      ctx.lineTo(x - r * 0.35, y - r * 0.1);
      ctx.fill();
    }

    function drawItems(s, clock) {
      const level = s.level;
      const ex = level.exit;
      glow(ex.x, ex.y, 46 + Math.sin(clock * 3) * 4, s.player.carrying ? 'rgba(90,255,150,0.45)' : 'rgba(90,255,150,0.18)');
      ctx.fillStyle = s.player.carrying ? '#8dffb5' : 'rgba(141,255,181,0.6)';
      ctx.font = `bold 11px ${HW.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', ex.x, ex.y - 24);
      if (!s.prizeTaken) {
        const p = level.prize;
        glow(p.x, p.y, 52 + Math.sin(clock * 2.4) * 6, level.def.theme.prize + '66');
        drawPrizeIcon(p.x, p.y - 2 + Math.sin(clock * 2) * 1.5, 11, level.index, level.def.theme.prize, clock);
        for (let k = 0; k < 3; k += 1) {
          const a = clock * 1.3 + (k * TAU) / 3;
          const tw = (Math.sin(clock * 5 + k * 2) + 1) / 2;
          ctx.fillStyle = `rgba(255,255,255,${0.3 + tw * 0.6})`;
          ctx.fillRect(p.x + Math.cos(a) * 22 - 1, p.y + Math.sin(a) * 22 - 1, 2.5, 2.5);
        }
      }
      for (const gem of s.gems) {
        if (gem.taken) continue;
        glow(gem.x, gem.y, 22, 'rgba(110,255,200,0.35)');
        drawGem(gem.x, gem.y + Math.sin(clock * 3 + gem.x) * 1.5, 7);
      }
      const term = level.terminal;
      if (term) {
        const ready = s.termCooldown <= 0;
        const colour = s.loopLeft > 0 ? '#5fd7ff' : ready ? '#6dff9b' : '#6b7280';
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(clock * 4);
        ctx.fillRect(term.x - 14, term.y - 12, 28, 14);
        ctx.globalAlpha = 1;
        glow(term.x, term.y - 5, 30, colour + '55');
        const near = Math.hypot(term.x - s.player.x, term.y - s.player.y) < HW.PLAYER.reach;
        if (s.player.hack > 0) {
          ctx.strokeStyle = '#6dff9b';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(term.x, term.y, 26, -Math.PI / 2, -Math.PI / 2 + s.player.hack * TAU);
          ctx.stroke();
        } else if (near && ready && s.phase === 'play') {
          label(term.x, term.y - 30, 'Hold E: loop feeds', '#6dff9b');
        } else if (near && !ready) {
          label(term.x, term.y - 30, `Rebooting ${Math.ceil(s.termCooldown)}s`, '#9aa3b5');
        }
      }
    }

    function label(x, y, text, colour) {
      ctx.font = `bold 12px ${HW.FONT}`;
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = 'rgba(8,10,18,0.85)';
      roundRect(ctx, x - w / 2, y - 11, w, 20, 6);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      ctx.textBaseline = 'alphabetic';
    }

    function drawCamera(s, c, clock) {
      const back = HW.castRay(s.level, c.x, c.y, c.base + Math.PI, 30);
      const mx = c.x + Math.cos(c.base + Math.PI) * back;
      const my = c.y + Math.sin(c.base + Math.PI) * back;
      ctx.strokeStyle = '#7b8194';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-7, -4, 20, 12);
      ctx.fillStyle = '#c9ced9';
      roundRect(ctx, -9, -6, 20, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#1a1d26';
      ctx.fillRect(9, -4, 4, 8);
      const looped = s.loopLeft > 0;
      const on = c.spotting || Math.sin(clock * 5 + c.phase * 3) > 0.2;
      ctx.fillStyle = looped ? '#5fd7ff' : c.spotting ? '#ff2a4a' : on ? '#ff6b6b' : '#5a2a2a';
      ctx.beginPath();
      ctx.arc(-3, 0, 2.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (looped) {
        ctx.fillStyle = 'rgba(95,215,255,0.8)';
        ctx.font = `bold 9px ${HW.MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText('LOOP', c.x, c.y - 12);
      } else if (c.spotting) {
        glow(c.x, c.y, 26, 'rgba(255,40,70,0.5)');
      }
    }

    function drawGuard(g, clock) {
      const bob = Math.sin(g.walkTime * 10) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(g.x + 3, g.y + 5, 14, 11, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.face);
      // Flashlight hand.
      ctx.fillStyle = '#2d3d66';
      ctx.fillRect(4, 6 + bob * 0.5, 9, 5);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(12, 6 + bob * 0.5, 4, 5);
      // Shoulders and body.
      ctx.fillStyle = g.mode === 'alert' ? '#5a2f4a' : C.guard;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8c547';
      ctx.fillRect(-2, -10, 3, 3);
      // Head and cap with its brim to the front.
      ctx.fillStyle = '#d6a77a';
      ctx.beginPath();
      ctx.arc(1, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1b2440';
      ctx.beginPath();
      ctx.arc(0, 0, 6.2, Math.PI * 0.55, Math.PI * 1.45);
      ctx.fill();
      ctx.fillRect(3, -5, 5, 10);
      ctx.restore();
      if (g.mode !== 'alert' && g.sus > 0.02) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 18, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = g.sus >= HW.GUARD.suspicious ? '#ffb347' : '#ffe08a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 18, -Math.PI / 2, -Math.PI / 2 + g.sus * TAU);
        ctx.stroke();
      }
      const mark = g.mode === 'alert' ? '!' : g.mode === 'investigate' ? '?' : null;
      if (mark) {
        const pop = g.bubble > 0 ? 1 + Math.max(0, g.bubble - 1.3) * 1.5 : 1;
        const y = g.y - 30 + Math.sin(clock * 6) * 1.5;
        ctx.fillStyle = mark === '!' ? '#ff4d5e' : '#ffb347';
        ctx.beginPath();
        ctx.arc(g.x, y, 10 * pop, 0, TAU);
        ctx.moveTo(g.x - 4, y + 7);
        ctx.lineTo(g.x, y + 15);
        ctx.lineTo(g.x + 4, y + 7);
        ctx.fill();
        ctx.fillStyle = '#10131c';
        ctx.font = `bold ${Math.round(15 * pop)}px ${HW.FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mark, g.x, y + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }

    function drawThief(s, clock) {
      const p = s.player;
      const hidden = !p.lit;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + 5, 13, 10, 0, 0, TAU);
      ctx.fill();
      if (hidden) {
        ctx.strokeStyle = 'rgba(95,224,200,0.55)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 17, clock, clock + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.face);
      const s0 = p.sneaking ? 0.85 : 1;
      ctx.scale(s0, s0);
      ctx.globalAlpha = hidden ? 0.8 : 1;
      // A scarf that trails and flutters behind.
      ctx.strokeStyle = C.thief;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3, 2);
      const wave = Math.sin(clock * 12) * (p.moving ? 4 : 1.5);
      ctx.quadraticCurveTo(-12, 4 + wave, -20, 2 - wave);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Pack on the back, glowing when the prize is in it.
      ctx.fillStyle = p.carrying ? s.level.def.theme.prize : '#3a3046';
      roundRect(ctx, -13, -7, 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#20232f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2c3140';
      ctx.beginPath();
      ctx.arc(1, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.thief;
      ctx.fillRect(4, -5, 2.5, 10);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (p.carrying) glow(p.x, p.y, 26, s.level.def.theme.prize + '44');
    }

    function drawAim(s, mouse) {
      const p = s.player;
      if (s.phase !== 'play' || p.coins <= 0 || !mouse.seen) return;
      const mx = mouse.x;
      const my = mouse.y - HW.MAP_Y;
      const dx = mx - p.x;
      const dy = my - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) return;
      const reach = Math.min(d, HW.PLAYER.throwRange);
      const tx = p.x + (dx / d) * reach;
      const ty = p.y + (dy / d) * reach;
      ctx.strokeStyle = 'rgba(244,201,93,0.45)';
      ctx.setLineDash([2, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo((p.x + tx) / 2, (p.y + ty) / 2 - reach * 0.25, tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(244,201,93,0.8)';
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, TAU);
      ctx.moveTo(tx - 13, ty);
      ctx.lineTo(tx - 4, ty);
      ctx.moveTo(tx + 4, ty);
      ctx.lineTo(tx + 13, ty);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(244,201,93,0.12)';
      ctx.beginPath();
      ctx.arc(tx, ty, HW.NOISE.coin, 0, TAU);
      ctx.stroke();
    }

    function drawRoom(s, clock, mouse, attract) {
      const layers = layersFor(s.level);
      const shake = s.shake > 0 ? s.shake * 8 : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HW.MAP_Y, RW, RH);
      ctx.clip();
      ctx.translate(shake ? Math.sin(clock * 90) * shake : 0, HW.MAP_Y + (shake ? Math.cos(clock * 77) * shake : 0));
      ctx.drawImage(layers.room, 0, 0);
      ctx.drawImage(layers.dark, 0, 0);
      drawCones(s);
      drawLasers(s, clock);
      drawItems(s, clock);
      for (const c of s.cameras) drawCamera(s, c, clock);
      for (const r of s.rings) {
        const k = r.t / 0.7;
        ctx.strokeStyle = r.color.replace(/[\d.]+\)$/, `${(1 - k) * 0.6})`);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.sqrt(k), 0, TAU);
        ctx.stroke();
      }
      for (const coin of s.coins) {
        const x = coin.sx + (coin.tx - coin.sx) * coin.t;
        const y = coin.sy + (coin.ty - coin.sy) * coin.t - Math.sin(coin.t * Math.PI) * 40;
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 4 * Math.abs(Math.cos(coin.t * 20)) + 1, 0, 0, TAU);
        ctx.fill();
      }
      if (!attract) drawThief(s, clock);
      for (const g of s.guards) drawGuard(g, clock);
      if (!attract) drawAim(s, mouse);
      if (s.lockdown) {
        ctx.fillStyle = `rgba(255,20,50,${0.08 + 0.08 * Math.sin(clock * 6)})`;
        ctx.fillRect(0, 0, RW, RH);
      }
      ctx.restore();
      // Vignette that reddens as the alarm climbs.
      const heat = s.alarm / HW.ALARM.max;
      const v = ctx.createRadialGradient(W / 2, HW.MAP_Y + RH / 2, RH * 0.45, W / 2, HW.MAP_Y + RH / 2, RW * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(${Math.round(120 * heat)},0,${Math.round(10 * heat)},${0.35 + heat * 0.3})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, HW.MAP_Y, RW, RH);
    }

    // ---------------------------------------------------------------- HUD

    function drawHud(s, levelIndex, clock, muted) {
      ctx.fillStyle = C.hud;
      ctx.fillRect(0, 0, W, HW.MAP_Y);
      ctx.fillStyle = C.hudLine;
      ctx.fillRect(0, HW.MAP_Y - 2, W, 2);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.accent;
      ctx.font = `bold 22px ${HW.FONT}`;
      ctx.fillText('HUSHWORK', 18, 27);
      ctx.fillStyle = C.muted;
      ctx.font = `13px ${HW.FONT}`;
      ctx.fillText(`Night ${levelIndex + 1} · ${s.level.def.name}`, 18, 45);

      // The alarm meter.
      const mx = 430;
      const my = 12;
      const mw = 400;
      const mh = 18;
      const frac = s.alarm / HW.ALARM.max;
      ctx.fillStyle = C.text;
      ctx.font = `bold 12px ${HW.FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('ALARM', mx - 10, my + 14);
      ctx.fillStyle = '#05070c';
      roundRect(ctx, mx - 2, my - 2, mw + 4, mh + 4, 5);
      ctx.fill();
      const grad = ctx.createLinearGradient(mx, 0, mx + mw, 0);
      grad.addColorStop(0, '#38d39f');
      grad.addColorStop(0.5, '#ffc54d');
      grad.addColorStop(1, '#ff3b4f');
      ctx.fillStyle = grad;
      const flash = s.lockdown ? 0.65 + 0.35 * Math.sin(clock * 10) : 1;
      ctx.globalAlpha = flash;
      ctx.fillRect(mx, my, mw * frac, mh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#05070c';
      for (let k = 1; k < 20; k += 1) ctx.fillRect(mx + (mw * k) / 20 - 1, my, 2, mh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(mx, my, mw * frac, 5);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.text;
      ctx.font = `bold 13px ${HW.MONO}`;
      ctx.fillText(`${Math.floor(s.alarm)}%`, mx + mw + 10, my + 14);
      let status = 'QUIET';
      let colour = '#38d39f';
      if (s.lockdown) {
        status = `LOCKDOWN — SHUTTERS IN ${s.lockdownLeft.toFixed(1)}s`;
        colour = C.danger;
      } else if (s.guards.some((g) => g.mode === 'alert')) {
        status = 'GUARD ALERTED';
        colour = C.danger;
      } else if (s.cameras.some((c) => c.spotting)) {
        status = 'ON CAMERA';
        colour = C.danger;
      } else if (s.guards.some((g) => g.mode === 'investigate')) {
        status = 'SUSPICIOUS';
        colour = C.warn;
      } else if (s.alarm > 0.5) {
        status = 'CALMING';
        colour = '#ffd66b';
      }
      ctx.font = `bold 11px ${HW.FONT}`;
      ctx.fillStyle = colour;
      ctx.textAlign = 'center';
      ctx.fillText(status, mx + mw / 2, my + mh + 16);
      if (s.loopLeft > 0) {
        ctx.fillStyle = '#5fd7ff';
        ctx.textAlign = 'right';
        ctx.fillText(`FEEDS LOOPED ${Math.ceil(s.loopLeft)}s`, mx + mw, my + mh + 16);
      }

      // Right side: prize, gems, coins, time, visibility.
      let x = 905;
      const cy = 28;
      ctx.fillStyle = s.prizeTaken ? s.level.def.theme.prize + '33' : 'rgba(255,255,255,0.05)';
      roundRect(ctx, x - 4, cy - 18, 36, 36, 8);
      ctx.fill();
      ctx.globalAlpha = s.prizeTaken ? 1 : 0.35;
      drawPrizeIcon(x + 14, cy, 9, levelIndex, s.level.def.theme.prize, s.prizeTaken ? clock : 0);
      ctx.globalAlpha = 1;
      x += 44;
      drawGem(x + 6, cy, 8);
      ctx.fillStyle = C.text;
      ctx.font = `bold 14px ${HW.MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${s.gemsTaken}/${s.gems.length}`, x + 18, cy + 5);
      x += 62;
      for (let k = 0; k < HW.PLAYER.coins; k += 1) {
        ctx.fillStyle = k < s.player.coins ? C.gold : 'rgba(244,201,93,0.18)';
        ctx.beginPath();
        ctx.arc(x + k * 16, cy, 6, 0, TAU);
        ctx.fill();
      }
      x += 50;
      const m = Math.floor(s.time / 60);
      const sec = (s.time % 60).toFixed(1).padStart(4, '0');
      ctx.fillStyle = C.text;
      ctx.fillText(`${m}:${sec}`, x, cy + 5);
      x += 68;
      const lit = s.player.lit;
      ctx.fillStyle = lit ? 'rgba(255,214,107,0.18)' : 'rgba(95,224,200,0.12)';
      roundRect(ctx, x - 4, cy - 13, 78, 26, 13);
      ctx.fill();
      ctx.strokeStyle = lit ? '#ffd66b' : C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + 11, cy, 9, 5.5, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = lit ? '#ffd66b' : C.accent;
      ctx.beginPath();
      ctx.arc(x + 11, cy, lit ? 3 : 1.5, 0, TAU);
      ctx.fill();
      ctx.font = `bold 11px ${HW.FONT}`;
      ctx.fillText(lit ? 'LIT' : 'HIDDEN', x + 25, cy + 4);

      // The hint bar.
      ctx.fillStyle = C.hud;
      ctx.fillRect(0, H - 24, W, 24);
      ctx.fillStyle = C.muted;
      ctx.font = `12px ${HW.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`WASD / arrows move  ·  Shift sneak  ·  Mouse aim + click: throw a coin  ·  Hold E at terminal  ·  P pause  ·  R restart  ·  M sound ${muted ? 'off' : 'on'}`, W / 2, H - 8);
    }

    function drawToasts(s) {
      let y = HW.MAP_Y + 34;
      for (const t of s.toasts) {
        const a = Math.min(1, t.t * 3, (t.life - t.t) * 6 + 0.2);
        ctx.globalAlpha = a;
        ctx.font = `bold 16px ${HW.FONT}`;
        const w = ctx.measureText(t.text).width + 36;
        ctx.fillStyle = 'rgba(8,10,18,0.88)';
        roundRect(ctx, W / 2 - w / 2, y - 18, w, 34, 17);
        ctx.fill();
        ctx.strokeStyle = 'rgba(95,224,200,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.fillText(t.text, W / 2, y + 5);
        ctx.globalAlpha = 1;
        y += 42;
      }
    }

    // ---------------------------------------------------------------- screens

    function button(b, hover, primary) {
      ctx.fillStyle = hover ? (primary ? '#7ff0da' : '#2c3550') : primary ? C.accent : '#1b2133';
      roundRect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = primary ? '#a8fff0' : '#3a4566';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = primary ? '#06201b' : C.text;
      ctx.font = `bold 17px ${HW.FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 29);
      ctx.fillStyle = primary ? 'rgba(6,32,27,0.6)' : C.muted;
      ctx.font = `11px ${HW.MONO}`;
      ctx.fillText(b.key, b.x + b.w - 22, b.y + 29);
    }

    const hit = (b, m) => m.seen && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;

    function shade(alpha) {
      ctx.fillStyle = `rgba(4,6,12,${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    function emblem(x, y, r, clock) {
      // A moth whose body is a keyhole: the Hushwork mark.
      ctx.save();
      ctx.translate(x, y);
      const flap = 1 + Math.sin(clock * 2) * 0.06;
      ctx.fillStyle = 'rgba(95,224,200,0.16)';
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.2);
        ctx.bezierCurveTo(side * r * 1.4 * flap, -r * 1.2, side * r * 1.6 * flap, r * 0.2, 0, r * 0.15);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, r * 0.1);
        ctx.bezierCurveTo(side * r * 0.9 * flap, r * 0.3, side * r * 0.8 * flap, r * 1.1, 0, r * 0.6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, 0);
      ctx.lineTo(r * 0.1, 0);
      ctx.lineTo(r * 0.16, r * 0.75);
      ctx.lineTo(-r * 0.16, r * 0.75);
      ctx.fill();
      ctx.restore();
    }

    function drawTitle(clock, mouse, best) {
      shade(0.72);
      emblem(W / 2, 112, 44, clock);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text;
      ctx.font = `bold 76px ${HW.FONT}`;
      ctx.fillText('HUSHWORK', W / 2, 232);
      ctx.fillStyle = C.accent;
      ctx.font = `18px ${HW.FONT}`;
      ctx.fillText('Three quiet nights in Vesper City. Take the prize. Leave no alarm.', W / 2, 268);
      ctx.fillStyle = C.muted;
      ctx.font = `14px ${HW.FONT}`;
      ctx.fillText('Stay out of torch beams and camera sweeps · keep to the shadows · coins make a useful noise', W / 2, 300);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${HW.FONT}`;
      ctx.fillText('Choose a night  ·  click a card or press 1, 2, 3', W / 2, 350);
      HW.buttonsFor('title').forEach((b, i) => {
        const def = HW.LEVELS[i];
        const over = hit(b, mouse);
        ctx.fillStyle = over ? 'rgba(40,52,78,0.95)' : 'rgba(16,20,32,0.92)';
        roundRect(ctx, b.x, b.y - (over ? 4 : 0), b.w, b.h, 14);
        ctx.fill();
        ctx.strokeStyle = over ? C.accent : '#2c3550';
        ctx.lineWidth = 2;
        ctx.stroke();
        const y = b.y - (over ? 4 : 0);
        ctx.fillStyle = def.theme.prize + '30';
        ctx.beginPath();
        ctx.arc(b.x + 50, y + 62, 30, 0, TAU);
        ctx.fill();
        drawPrizeIcon(b.x + 50, y + 62, 15, i, def.theme.prize, clock);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.font = `bold 12px ${HW.FONT}`;
        ctx.fillText(`NIGHT ${i + 1}`, b.x + 96, y + 40);
        ctx.fillStyle = C.text;
        let size = 19;
        do ctx.font = `bold ${size--}px ${HW.FONT}`;
        while (ctx.measureText(def.name).width > b.w - 110 && size > 11);
        ctx.fillText(def.name, b.x + 96, y + 64);
        ctx.fillStyle = def.theme.prize;
        ctx.font = `14px ${HW.FONT}`;
        ctx.fillText(`Prize: ${def.prize}`, b.x + 96, y + 86);
        ctx.fillStyle = C.muted;
        ctx.font = `12px ${HW.FONT}`;
        const g = def.guards.length;
        const cams = def.cameras.length;
        ctx.fillText(`${g} guards · ${cams} cameras${def.lasers.length ? ` · ${def.lasers.length} lasers` : ''}`, b.x + 22, y + 124);
        const rec = best[i];
        ctx.fillStyle = rec ? C.gold : '#4a5370';
        ctx.font = `bold 14px ${HW.FONT}`;
        ctx.fillText(rec ? `Best: ${rec.rank} · ${rec.score}` : 'Not yet cracked', b.x + 22, y + 152);
      });
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5c6580';
      ctx.font = `12px ${HW.FONT}`;
      ctx.fillText('WASD move · Shift sneak · mouse aim, click to throw a coin · hold E to loop the cameras · M toggles sound', W / 2, 600);
      ctx.fillText('An original game for the make.fun heist bounty', W / 2, 690);
    }

    function panel(x, y, w, h, edge) {
      ctx.fillStyle = 'rgba(10,13,22,0.94)';
      roundRect(ctx, x, y, w, h, 18);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function drawEnd(s, screen, levelIndex, mouse, best, clock) {
      const buttons = HW.buttonsFor(screen, levelIndex);
      if (screen === 'paused') {
        shade(0.6);
        panel(W / 2 - 330, 230, 660, 260, '#2c3550');
        ctx.textAlign = 'center';
        ctx.fillStyle = C.text;
        ctx.font = `bold 48px ${HW.FONT}`;
        ctx.fillText('PAUSED', W / 2, 310);
        ctx.fillStyle = C.muted;
        ctx.font = `15px ${HW.FONT}`;
        ctx.fillText(s.level.def.brief, W / 2, 360);
      } else if (screen === 'caught' || screen === 'sealed') {
        ctx.fillStyle = 'rgba(60,0,10,0.55)';
        ctx.fillRect(0, 0, W, H);
        panel(W / 2 - 330, 250, 660, 290, C.danger);
        ctx.textAlign = 'center';
        ctx.fillStyle = C.danger;
        ctx.font = `bold 60px ${HW.FONT}`;
        ctx.fillText(screen === 'caught' ? 'BUSTED' : 'SEALED IN', W / 2, 335);
        ctx.fillStyle = C.text;
        ctx.font = `17px ${HW.FONT}`;
        ctx.fillText(screen === 'caught' ? 'A guard got a hand on your collar.' : 'The shutters came down before you reached the exit.', W / 2, 380);
        ctx.fillStyle = C.muted;
        ctx.font = `14px ${HW.FONT}`;
        const tip = s.lockdown ? 'Tip: lockdown is not the end — sprint for the exit, guards know where you are.' : 'Tip: shadows halve how fast guards notice you; Shift keeps your steps silent.';
        ctx.fillText(tip, W / 2, 420);
      } else if (screen === 'won') {
        const r = s.results;
        shade(0.55);
        panel(W / 2 - 360, 120, 720, 500, r.ghost ? C.accent : C.gold);
        ctx.textAlign = 'center';
        ctx.fillStyle = r.ghost ? C.accent : C.gold;
        ctx.font = `bold 46px ${HW.FONT}`;
        ctx.fillText(r.ghost ? 'GHOST GETAWAY' : s.lockdown ? 'NARROW ESCAPE' : 'CLEAN GETAWAY', W / 2, 185);
        ctx.fillStyle = C.muted;
        ctx.font = `15px ${HW.FONT}`;
        ctx.fillText(`${s.level.def.name} · ${Math.floor(r.time / 60)}:${(r.time % 60).toFixed(1).padStart(4, '0')}`, W / 2, 215);
        drawPrizeIcon(W / 2 + 250, 330, 26, levelIndex, s.level.def.theme.prize, clock);
        let y = 270;
        ctx.font = `16px ${HW.FONT}`;
        for (const [name, value] of r.parts) {
          ctx.textAlign = 'left';
          ctx.fillStyle = C.text;
          ctx.fillText(name, W / 2 - 300, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = value < 0 ? C.danger : C.text;
          ctx.font = `bold 16px ${HW.MONO}`;
          ctx.fillText(value >= 0 ? `+${value}` : String(value), W / 2 + 120, y);
          ctx.font = `16px ${HW.FONT}`;
          y += 32;
        }
        ctx.fillStyle = C.hudLine;
        ctx.fillRect(W / 2 - 300, y - 14, 420, 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.font = `bold 20px ${HW.FONT}`;
        ctx.fillText('Score', W / 2 - 300, y + 18);
        ctx.textAlign = 'right';
        ctx.fillText(String(r.score), W / 2 + 120, y + 18);
        ctx.textAlign = 'center';
        ctx.fillStyle = C.gold;
        ctx.font = `bold 96px ${HW.FONT}`;
        ctx.fillText(r.rank, W / 2 + 250, 480);
        ctx.font = `13px ${HW.FONT}`;
        ctx.fillStyle = C.muted;
        const rec = best[levelIndex];
        ctx.fillText(rec ? `Best ${rec.rank} · ${rec.score}` : '', W / 2 + 250, 510);
      }
      buttons.forEach((b, i) => button(b, hit(b, mouse), i === 0));
    }

    /**
     * Paint one frame. view: { screen, state, levelIndex, clock, mouse, best, muted }.
     */
    function draw(view) {
      const s = view.state;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.backdrop;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      const attract = view.screen === 'title';
      drawRoom(s, view.clock, view.mouse, attract);
      drawHud(s, view.levelIndex, view.clock, view.muted);
      if (!attract) drawToasts(s);
      if (attract) drawTitle(view.clock, view.mouse, view.best);
      else if (view.screen !== 'play') drawEnd(s, view.screen, view.levelIndex, view.mouse, view.best, view.clock);
      ctx.restore();
    }

    return { draw, toLogical, resize };
  };
})(window.HUSH = window.HUSH || {});
