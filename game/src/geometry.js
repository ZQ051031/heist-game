// Grid geometry shared by the rules and the renderer: what a tile blocks, grid ray casts (how far
// a guard's eye or a camera lens sees along one direction), line of sight, circle-versus-wall
// collision and breadth-first paths for guards walking between tiles.
(function (HW) {
  'use strict';

  const TAU = Math.PI * 2;

  HW.tileAt = function tileAt(level, col, row) {
    if (col < 0 || row < 0 || col >= HW.COLS || row >= HW.ROWS) return HW.T_WALL;
    return level.tiles[row * HW.COLS + col];
  };

  HW.blocksSight = function blocksSight(tile) {
    return tile === HW.T_WALL || tile === HW.T_BLOCK;
  };

  HW.blocksMove = function blocksMove(tile) {
    return tile === HW.T_WALL || tile === HW.T_BLOCK || tile === HW.T_GLASS || tile === HW.T_TERMINAL;
  };

  HW.walkableAt = function walkableAt(level, x, y) {
    return !HW.blocksMove(HW.tileAt(level, Math.floor(x / HW.TILE), Math.floor(y / HW.TILE)));
  };

  HW.wrapAngle = function wrapAngle(a) {
    a %= TAU;
    if (a > Math.PI) a -= TAU;
    if (a < -Math.PI) a += TAU;
    return a;
  };

  /** Turn `from` toward `to` by at most `maxStep` radians, the short way round. */
  HW.turnToward = function turnToward(from, to, maxStep) {
    const diff = HW.wrapAngle(to - from);
    if (Math.abs(diff) <= maxStep) return to;
    return from + Math.sign(diff) * maxStep;
  };

  /** Distance along the ray from (x, y) at `angle` to the first sight-blocking tile, at most maxDist. */
  HW.castRay = function castRay(level, x, y, angle, maxDist) {
    const T = HW.TILE;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let col = Math.floor(x / T);
    let row = Math.floor(y / T);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const deltaY = dy !== 0 ? Math.abs(T / dy) : Infinity;
    let maxX = dx !== 0 ? (dx > 0 ? (col + 1) * T - x : x - col * T) / Math.abs(dx) : Infinity;
    let maxY = dy !== 0 ? (dy > 0 ? (row + 1) * T - y : y - row * T) / Math.abs(dy) : Infinity;
    for (let guard = 0; guard < 128; guard += 1) {
      let t;
      if (maxX < maxY) {
        t = maxX;
        maxX += deltaX;
        col += stepX;
      } else {
        t = maxY;
        maxY += deltaY;
        row += stepY;
      }
      if (t >= maxDist) return maxDist;
      if (HW.blocksSight(HW.tileAt(level, col, row))) return t;
    }
    return maxDist;
  };

  HW.hasLine = function hasLine(level, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1) return true;
    return HW.castRay(level, ax, ay, Math.atan2(by - ay, bx - ax), d) >= d - 0.5;
  };

  /** Whether an eye at (x, y) facing `face` with a cone of `half` radians and `range` sees point (px, py). */
  HW.inCone = function inCone(level, x, y, face, half, range, px, py) {
    const d = Math.hypot(px - x, py - y);
    if (d > range) return false;
    if (d > 14 && Math.abs(HW.wrapAngle(Math.atan2(py - y, px - x) - face)) > half) return false;
    return HW.hasLine(level, x, y, px, py);
  };

  /** The cone's outline as points (x, y pairs), the eye first, rays stopping at walls. */
  HW.conePolygon = function conePolygon(level, x, y, face, half, range, rays) {
    const pts = [x, y];
    for (let i = 0; i <= rays; i += 1) {
      const a = face - half + (2 * half * i) / rays;
      const d = HW.castRay(level, x, y, a, range);
      pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    return pts;
  };

  /** Push a circle at pos out of every movement-blocking tile it overlaps. */
  HW.collideCircle = function collideCircle(level, pos, r) {
    const T = HW.TILE;
    for (let pass = 0; pass < 2; pass += 1) {
      const c0 = Math.floor((pos.x - r) / T);
      const c1 = Math.floor((pos.x + r) / T);
      const r0 = Math.floor((pos.y - r) / T);
      const r1 = Math.floor((pos.y + r) / T);
      for (let row = r0; row <= r1; row += 1) {
        for (let col = c0; col <= c1; col += 1) {
          if (!HW.blocksMove(HW.tileAt(level, col, row))) continue;
          const nx = Math.max(col * T, Math.min(pos.x, (col + 1) * T));
          const ny = Math.max(row * T, Math.min(pos.y, (row + 1) * T));
          const dx = pos.x - nx;
          const dy = pos.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * r;
            pos.y = ny + (dy / d) * r;
          } else {
            const left = pos.x - col * T;
            const right = (col + 1) * T - pos.x;
            const top = pos.y - row * T;
            const bottom = (row + 1) * T - pos.y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) pos.x = col * T - r;
            else if (m === right) pos.x = (col + 1) * T + r;
            else if (m === top) pos.y = row * T - r;
            else pos.y = (row + 1) * T + r;
          }
        }
      }
    }
  };

  HW.segmentDistance = function segmentDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  };

  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function open(level, col, row) {
    return !HW.blocksMove(HW.tileAt(level, col, row));
  }

  /** The walkable tile closest (by steps) to (col, row), itself when it is walkable. */
  HW.nearestOpen = function nearestOpen(level, col, row) {
    if (open(level, col, row)) return [col, row];
    for (let radius = 1; radius < 6; radius += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) === radius && open(level, col + dc, row + dr)) return [col + dc, row + dr];
        }
      }
    }
    return [col, row];
  };

  /**
   * Tile-centre waypoints from one point to another over walkable tiles (diagonals only where
   * both side tiles are open, so a guard never clips a corner). The last waypoint is `to` itself
   * when it is walkable. Empty when there is no way.
   */
  HW.findPath = function findPath(level, from, to) {
    const T = HW.TILE;
    const [sc, sr] = HW.nearestOpen(level, Math.floor(from.x / T), Math.floor(from.y / T));
    const [gc, gr] = HW.nearestOpen(level, Math.floor(to.x / T), Math.floor(to.y / T));
    const start = sr * HW.COLS + sc;
    const goal = gr * HW.COLS + gc;
    const prev = new Int16Array(HW.COLS * HW.ROWS).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let head = 0; head < queue.length && prev[goal] === -1; head += 1) {
      const cur = queue[head];
      const c = cur % HW.COLS;
      const r = (cur - c) / HW.COLS;
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!open(level, nc, nr)) continue;
        if (dc !== 0 && dr !== 0 && (!open(level, c + dc, r) || !open(level, c, r + dr))) continue;
        const next = nr * HW.COLS + nc;
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        queue.push(next);
      }
    }
    if (prev[goal] === -1) return [];
    const cells = [];
    for (let cur = goal; cur !== start; cur = prev[cur]) cells.push(cur);
    cells.reverse();
    const path = cells.map((cell) => ({ x: ((cell % HW.COLS) + 0.5) * T, y: (Math.floor(cell / HW.COLS) + 0.5) * T }));
    if (HW.walkableAt(level, to.x, to.y) && path.length > 0) path[path.length - 1] = { x: to.x, y: to.y };
    if (path.length === 0) path.push({ x: (gc + 0.5) * T, y: (gr + 0.5) * T });
    return path;
  };
})(window.HUSH = window.HUSH || {});
