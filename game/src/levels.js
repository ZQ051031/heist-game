// The three jobs. Each room is 32x16 tiles drawn in text:
//   #  wall          c  pillar or crate (blocks walking and sight)
//   g  glass case    (blocks walking, not sight)
//   ~  carpet        (footsteps on it are quieter)
//   .  floor         L / K  lamp over floor / over carpet
//   P  thief starts  X  exit   $  the prize   *  a loose gem   T  camera terminal
// Guards walk routes of [col, row, wait seconds, look angle in degrees]; cameras sit at tile
// coordinates and sweep `sweep` degrees either side of `angle`; lasers run between two points
// and cycle `on` seconds lit, `off` seconds dark.
(function (HW) {
  'use strict';

  HW.LEVELS = [
    {
      name: 'The Marrow Gallery',
      prize: 'Sable Orchid',
      brief: 'A private gallery after closing. Two night guards, two cameras, one jewelled flower.',
      par: 75,
      theme: { floor: '#2b2420', floorAlt: '#2f2823', carpet: '#5a1f2b', carpetEdge: '#a2763a', wall: '#3d4152', wallTop: '#596078', block: '#6b5640', prize: '#b06cff' },
      map: [
        '################################',
        '#P....#.........L........#.....#',
        '#.....#..g...........g...#..L..#',
        '#.....#..................#.....#',
        '#..L..#....~~~~~~~~~~....#.....#',
        '#.....###..~~~~~~~~~~..###.....#',
        '#..........~~~~K~~~~~..........#',
        '#~~~~......~~~~~~~~~~.....g..$.#',
        '#~~~~......~~~~~~~~~~..........#',
        '#~~~~...c..............c.......#',
        '#.....###....#########.###.....#',
        '#.....#......#....#......#..*..#',
        '#.....#..g...#.L..#...g..#.....#',
        '#.....#......#.*..#T.....#.....#',
        '#X..........L...........L......#',
        '################################',
      ],
      guards: [
        { route: [[9, 3, 1.4, 180], [22, 3, 1.4, 0], [22, 8, 1.2, 90], [9, 8, 1.2, 180]] },
        { route: [[25, 14, 1.4, 0], [6, 14, 1.6, 180]] },
      ],
      cameras: [
        { x: 12.5, y: 1.15, angle: 90, sweep: 55, speed: 0.55, phase: 0 },
        { x: 30.85, y: 9.5, angle: 200, sweep: 32, speed: 0.5, phase: 1.2 },
      ],
      lasers: [],
    },
    {
      name: 'Coldwater Savings & Trust',
      prize: 'Ninefold Key',
      brief: 'A marble bank lobby. Lasers guard the vault door; one guard naps inside it with his eyes open.',
      par: 95,
      theme: { floor: '#262b31', floorAlt: '#2b3138', carpet: '#1f3d4a', carpetEdge: '#7fb5c4', wall: '#3a3f4a', wallTop: '#6d7686', block: '#555c66', prize: '#ffd36b' },
      map: [
        '################################',
        '#.L...#...#.g......g.#...#....X#',
        '#.....#...#..$.......#...#.....#',
        '#.....#...#.c......c.#...#..L..#',
        '#.....#...#####..#####...##.####',
        '#.....#........................#',
        '#..T..........~~~~~~~~.........#',
        '#.....#.......~~~~K~~~.....g...#',
        '#.....#...c...~~~~~~~~...c.....#',
        '###.###......................*.#',
        '#.......L...g..........g...L...#',
        '#.....######....######.........#',
        '#.P...#....#....#....#....c....#',
        '#.....#.*..#.L..#....#.........#',
        '#.L............................#',
        '################################',
      ],
      guards: [
        { route: [[8, 6, 1.0, 180], [23, 6, 1.2, 0], [23, 9, 1.0, 90], [8, 9, 1.2, 180]] },
        { route: [[29, 14, 2.0, 0], [4, 14, 2.0, 180]] },
        { route: [[12, 2, 3.5, 270], [19, 2, 3.5, 270]] },
      ],
      cameras: [
        { x: 7.15, y: 5.15, angle: 40, sweep: 30, speed: 0.6, phase: 0.5 },
        { x: 30.85, y: 2.5, angle: 180, sweep: 38, speed: 0.55, phase: 0 },
        { x: 14, y: 14.85, angle: 270, sweep: 48, speed: 0.5, phase: 2.0 },
      ],
      lasers: [
        { a: [15, 4.5], b: [17, 4.5], on: 2.2, off: 1.5, phase: 0 },
        { a: [27, 4.5], b: [28, 4.5], on: 2.6, off: 1.6, phase: 1.1 },
        { a: [3, 9.5], b: [4, 9.5], on: 1.8, off: 1.8, phase: 0.4 },
      ],
    },
    {
      name: 'The Vesper Penthouse',
      prize: 'Moth Crown',
      brief: 'A collector\'s penthouse forty floors up. Four guards, laser doors, and a crown under glass.',
      par: 120,
      theme: { floor: '#221f2c', floorAlt: '#262233', carpet: '#3a2350', carpetEdge: '#c9a1ff', wall: '#2f2f45', wallTop: '#5b5a80', block: '#4a3b5c', prize: '#7cf2ff' },
      map: [
        '################################',
        '#X...L..#..............#...L..*#',
        '#.......#...~~~~~~~~...#.......#',
        '#..c....#...~~~K~~~~...........#',
        '#.......#...~~~~~~~~...#...g...#',
        '#..........##########..........#',
        '#..L.......#~~~~~~~~#......L...#',
        '#...........~~~$~~~~...........#',
        '#....c.....#~g~~~~g~#.....c....#',
        '#..........##########..........#',
        '#.......#....L.........#...T...#',
        '#.......#.....g..g.....#.......#',
        '#..............................#',
        '#.......#..~~~~~~~~~~..#.......#',
        '#..*....#..~~~~~~~~~~..#....P..#',
        '################################',
      ],
      guards: [
        { route: [[10, 4, 1.0, 90], [21, 4, 1.0, 90], [21, 10, 1.0, 270], [10, 10, 1.0, 270]] },
        { route: [[2, 5, 2.0, 0], [6, 7, 1.5, 90], [4, 10, 1.5, 0]] },
        { route: [[25, 2, 1.6, 180], [29, 4, 1.6, 90]] },
        { route: [[10, 12, 1.6, 180], [22, 12, 1.6, 0]] },
      ],
      cameras: [
        { x: 16, y: 6.15, angle: 90, sweep: 60, speed: 0.7, phase: 0 },
        { x: 16, y: 1.15, angle: 90, sweep: 50, speed: 0.45, phase: 1.5 },
        { x: 30.85, y: 7.5, angle: 180, sweep: 40, speed: 0.5, phase: 0.7 },
      ],
      lasers: [
        { a: [11.5, 7], b: [11.5, 8], on: 2.0, off: 1.4, phase: 0 },
        { a: [20.5, 7], b: [20.5, 8], on: 2.4, off: 1.2, phase: 1.0 },
      ],
    },
  ];

  HW.T_FLOOR = 0;
  HW.T_WALL = 1;
  HW.T_BLOCK = 2;
  HW.T_GLASS = 3;
  HW.T_CARPET = 4;
  HW.T_TERMINAL = 5;

  /** Turn a level's text into tiles and entity positions (pixel coordinates in the room). */
  HW.parseLevel = function parseLevel(index) {
    const def = HW.LEVELS[index];
    const T = HW.TILE;
    const tiles = new Uint8Array(HW.COLS * HW.ROWS);
    const out = { index, def, tiles, lights: [], gems: [], start: null, exit: null, prize: null, terminal: null };
    for (let row = 0; row < HW.ROWS; row += 1) {
      const line = def.map[row];
      if (line.length !== HW.COLS) throw new Error(`level ${index} row ${row} is ${line.length} wide`);
      for (let col = 0; col < HW.COLS; col += 1) {
        const ch = line[col];
        const centre = { x: (col + 0.5) * T, y: (row + 0.5) * T };
        let tile = HW.T_FLOOR;
        if (ch === '#') tile = HW.T_WALL;
        else if (ch === 'c') tile = HW.T_BLOCK;
        else if (ch === 'g') tile = HW.T_GLASS;
        else if (ch === '~' || ch === 'K') tile = HW.T_CARPET;
        else if (ch === 'T') {
          tile = HW.T_TERMINAL;
          out.terminal = centre;
        }
        if (ch === 'L' || ch === 'K') out.lights.push({ x: centre.x, y: centre.y, r: 150 });
        if (ch === 'P') out.start = centre;
        if (ch === 'X') out.exit = centre;
        if (ch === '$') out.prize = centre;
        if (ch === '*') out.gems.push(centre);
        tiles[row * HW.COLS + col] = tile;
      }
    }
    out.guards = def.guards.map((g) => ({ route: g.route.map(([c, r, wait, look]) => ({ x: (c + 0.5) * T, y: (r + 0.5) * T, wait, look: (look * Math.PI) / 180 })) }));
    out.cameras = def.cameras.map((c) => ({ x: c.x * T, y: c.y * T, base: (c.angle * Math.PI) / 180, sweep: (c.sweep * Math.PI) / 180, speed: c.speed, phase: c.phase }));
    out.lasers = def.lasers.map((l) => ({ ax: l.a[0] * T, ay: l.a[1] * T, bx: l.b[0] * T, by: l.b[1] * T, on: l.on, off: l.off, phase: l.phase }));
    return out;
  };
})(window.HUSH = window.HUSH || {});
