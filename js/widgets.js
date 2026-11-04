(() => {
  const DOT = 0.34;

  const ABOUT = [
    "..*.....##.......*..",
    ".*......##.##.....*.",
    ".*...##.##.##.....*.",
    ".*...##.##.##.##..*.",
    "..*..##.##.##.##.*..",
    ".....##.##.##.##....",
    ".....##.##.##.##....",
    ".....##.##.##.##....",
    ".....###########....",
    "##...###########....",
    "###..###########....",
    ".###.###########....",
    "..##############....",
    "...#############....",
    ".....###########....",
    "......#########.....",
    "......#########.....",
  ];

  const WORK = [
    "......lllllll......",
    "......l.....l......",
    ".lllllllllllllllll.",
    "lllllllllllllllllll",
    "lllllllllllllllllll",
    "........***........",
    "#######.***.#######",
    "###################",
    "###################",
    "###################",
    "###################",
    ".#################.",
  ];

  const BLOG = [
    "................#####.",
    "...............#######",
    "......................",
    "...............#######",
    "...............#######",
    "......................",
    "...............#.###.#",
    "...............#.###.#",
    "...............#.###.#",
    "...............#.###.#",
    "...............#.###.#",
    "...............#.###.#",
    "...............#.###.#",
    "...............#######",
    "..**......**....#####.",
    ".*..*....*..*....###..",
    "*....*..*....*........",
    "......**......****#...",
  ];

  const PRINCIPLES = [
    "......#####......",
    "....##.....##....",
    "...#....*....#...",
    "..#.....*.....#..",
    ".#......*......#.",
    ".#.....***.....#.",
    "#......***......#",
    "#......***......#",
    "#.#....***....#.#",
    "#.......n.......#",
    "#.......n.......#",
    ".#......n......#.",
    ".#......n......#.",
    "..#.....n.....#..",
    "...#....n....#...",
    "....##.....##....",
    "......#####......",
  ];

  const BOOKS = [
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    ".....................",
    "###...............###",
    "######.........######",
    "########.....########",
    "##########.##########",
    "##########.##########",
    "##########.##########",
    "##########.##########",
    "##########.##########",
    "##########.##########",
    "...#######.#######...",
    "......####.####......",
  ];

  // The bookmark is three dots wide with a notched end. It sits between the pages,
  // is hidden column by column below the page edge, peeks out by `peek` rows above
  // the highest edge it crosses, and is drawn up `rise` more on hover.
  const BOOKMARK = { x: 9, peek: 3, rise: 4 };

  const INVADER = [
    "...##...##.",
    "..########.",
    ".##e####e##",
    "###########",
    "#.##.##.##.",
    "###########",
    "ba.#...#.ab",
    ".ba.....ab.",
  ];

  const LINKEDIN = [
    "...............",
    "..**...........",
    "..**...........",
    "...............",
    "..##.#######...",
    "..##.########..",
    "..##.##....##..",
    "..##.##....##..",
    "..##.##....##..",
    "..##.##....##..",
    "..##.##....##..",
    "..##.##....##..",
    "...............",
  ];

  const GITHUB = [
    "..#.........#..",
    "..##.......##..",
    "..###.....###..",
    "..###########..",
    ".#############.",
    ".#############.",
    ".#############.",
    ".#############.",
    "..###########..",
    "...#########...",
    ".t...##.##.....",
    "..t..##.##.....",
    "...tt##.##.....",
  ];

  const MAIL = [
    "...............",
    "###############",
    "#*...........*#",
    "#.*.........*.#",
    "#..*.......*..#",
    "#...*.....*...#",
    "#....*...*....#",
    "#.....*.*.....#",
    "#......*......#",
    "#.............#",
    "#.............#",
    "###############",
    "...............",
  ];

  // Any non-"." cell is a dot. `parts` maps a cell character to the class of the
  // group it joins, so the motion code can find and redraw that part.
  function mark(x, y, width, radius = DOT) {
    const p = width > 1 ? x / (width - 1) : 0;
    return `<circle class="mark" style="--p:${p.toFixed(3)}" cx="${x + 0.5}" cy="${y + 0.5}" r="${radius.toFixed(3)}"/>`;
  }

  // `extra` is raw SVG appended inside the figure, for parts drawn outside the grid.
  function matrixSvg(rows, parts = {}, extra = "") {
    const height = rows.length;
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const groups = new Map();
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === ".") return;
        groups.set(cell, (groups.get(cell) || "") + mark(x, y, width));
      });
    });
    let body = "";
    groups.forEach((marks, cell) => {
      body += `<g class="${parts[cell] || "base"}">${marks}</g>`;
    });
    return `<svg viewBox="0 0 ${width} ${height}" role="presentation"><g class="figure">${body}${extra}</g></svg>`;
  }

  // The spine column has no dots, so it borrows the edge of the pages beside it.
  function pageEdge(col) {
    const row = BOOKS.findIndex((line) => line[col] === "#");
    if (row >= 0) return row;
    return Math.min(...[col - 1, col + 1].map((side) => {
      const edge = BOOKS.findIndex((line) => line[side] === "#");
      return edge < 0 ? BOOKS.length : edge;
    }));
  }

  // The full bookmark, including the length hidden between the pages.
  function bookmarkCells() {
    const { x, peek, rise } = BOOKMARK;
    const edges = [x, x + 1, x + 2].map(pageEdge);
    const top = Math.min(...edges) - peek;
    const cells = [];
    edges.forEach((edge, i) => {
      for (let y = top; y < edge + rise; y += 1) {
        if (y !== top || i !== 1) cells.push([x + i, y]);
      }
    });
    return cells;
  }

  const glyphs = {
    about: () => matrixSvg(ABOUT, { "#": "hand", "*": "accent wave" }),
    work: () => matrixSvg(WORK, { l: "lid", "*": "accent clasp" }),
    blog: () => matrixSvg(BLOG, { "#": "pencil", "*": "accent ink" }),
    books: () => matrixSvg(BOOKS, {}, `<g class="accent bookmark"></g>`),
    principles: () => matrixSvg(PRINCIPLES, { "*": "accent needle-north", n: "needle-south" }),
    invader: () => matrixSvg(INVADER, { e: "accent eye", a: "leg-a", b: "leg-b" }),
    linkedin: () => matrixSvg(LINKEDIN, { "*": "accent tittle" }),
    github: () => matrixSvg(GITHUB, { t: "accent tail" }),
    mail: () => matrixSvg(MAIL, { "*": "accent flap" }),
  };

  document.querySelectorAll("[data-glyph]").forEach((host) => {
    const draw = glyphs[host.dataset.glyph];
    if (draw) host.innerHTML = draw();
  });

  // Moving parts are never transformed as a whole: rotated or shifted dots would
  // fall off the lattice. Each frame a part is re-rasterized onto the dot grid
  // through its pose, and every dot is sized by how much of its cell the posed
  // part covers. At rest every dot is full size, so the still glyph is unchanged.
  const SAMPLES = 4;
  const key = (x, y) => (y + 64) * 256 + (x + 64);

  function cellsOf(rows, char) {
    const cells = [];
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === char) cells.push([x, y]);
      });
    });
    return cells;
  }

  // `layers` pairs each group with its source cells. Where layers overlap after
  // posing, a dot joins whichever layer covers more of it. `mode` picks how a pose
  // lands on the grid:
  // - "cover" sizes each dot by coverage. Smooth for thin parts that travel far.
  // - "solid" keeps a full dot wherever the part covers at least half the cell, so
  //   broad shapes stay crisp instead of growing a fringe of small dots.
  // - "trace" moves each source dot to its nearest cell, for lines one dot wide.
  function part(layers, pivot = [0, 0], mask = null, mode = "cover") {
    const lookup = new Map();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    layers.forEach(({ cells }, index) => {
      cells.forEach(([x, y]) => {
        lookup.set(key(x, y), index);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      });
    });
    return { layers, lookup, bounds: [minX, minY, maxX, maxY], pivot, mask, mode, drawn: [] };
  }

  function commit(target, out) {
    out.forEach((html, index) => {
      if (target.drawn[index] === html) return;
      target.drawn[index] = html;
      target.layers[index].group.innerHTML = html;
    });
  }

  function trace(target, width, cos, sin, scaleX, scaleY, tx, ty) {
    const { layers, pivot: [px, py], mask } = target;
    const taken = new Set();
    const out = layers.map(({ cells }) => {
      let html = "";
      cells.forEach(([x, y]) => {
        const dx = (x + 0.5 - px) * scaleX;
        const dy = (y + 0.5 - py) * scaleY;
        const col = Math.floor(px + dx * cos - dy * sin + tx);
        const row = Math.floor(py + dx * sin + dy * cos + ty);
        const cell = key(col, row);
        if (taken.has(cell) || (mask && !mask(col + 0.5, row + 0.5))) return;
        taken.add(cell);
        html += mark(col, row, width);
      });
      return html;
    });
    commit(target, out);
  }

  function layersOf(host, rows, chars) {
    return Object.entries(chars).map(([char, selector]) => ({
      group: host.querySelector(selector),
      cells: cellsOf(rows, char),
    }));
  }

  function render(target, width, { angle = 0, tx = 0, ty = 0, sx = 1, sy = 1 } = {}) {
    const { layers, lookup, bounds, pivot, mask, mode } = target;
    const [px, py] = pivot;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scaleX = Math.abs(sx) < 0.02 ? 0.02 : sx;
    const scaleY = Math.abs(sy) < 0.02 ? 0.02 : sy;
    if (mode === "trace") {
      trace(target, width, cos, sin, scaleX, scaleY, tx, ty);
      return;
    }
    const floor = mode === "solid" ? 0.5 : 0.15;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]]].forEach(([x, y]) => {
      const dx = (x - px) * scaleX;
      const dy = (y - py) * scaleY;
      const fx = px + dx * cos - dy * sin + tx;
      const fy = py + dx * sin + dy * cos + ty;
      x0 = Math.min(x0, fx);
      y0 = Math.min(y0, fy);
      x1 = Math.max(x1, fx);
      y1 = Math.max(y1, fy);
    });
    const out = layers.map(() => "");
    const hits = new Array(layers.length);
    for (let row = Math.floor(y0); row < Math.ceil(y1); row += 1) {
      for (let col = Math.floor(x0); col < Math.ceil(x1); col += 1) {
        hits.fill(0);
        let total = 0;
        for (let i = 0; i < SAMPLES; i += 1) {
          for (let j = 0; j < SAMPLES; j += 1) {
            const x = col + (i + 0.5) / SAMPLES;
            const y = row + (j + 0.5) / SAMPLES;
            if (mask && !mask(x, y)) continue;
            const qx = x - px - tx;
            const qy = y - py - ty;
            const sourceX = px + (qx * cos + qy * sin) / scaleX;
            const sourceY = py + (-qx * sin + qy * cos) / scaleY;
            const index = lookup.get(key(Math.floor(sourceX), Math.floor(sourceY)));
            if (index === undefined) continue;
            hits[index] += 1;
            total += 1;
          }
        }
        const cover = total / (SAMPLES * SAMPLES);
        if (cover < floor) continue;
        let best = 0;
        for (let i = 1; i < hits.length; i += 1) if (hits[i] > hits[best]) best = i;
        const radius = mode === "solid" ? DOT : DOT * Math.sqrt(Math.min(1, cover / 0.8));
        out[best] += mark(col, row, width, radius);
      }
    }
    commit(target, out);
  }

  function spring(stiffness, damping, value = 0) {
    return { stiffness, damping, value, velocity: 0, target: value };
  }

  function advance(s, dt) {
    s.velocity += (-s.stiffness * (s.value - s.target) - s.damping * s.velocity) * dt;
    s.value += s.velocity * dt;
  }

  const settled = (s) => Math.abs(s.value - s.target) < 0.003 && Math.abs(s.velocity) < 0.01;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Runs a glyph's springs while it is hovered or still settling. `state.nx` and
  // `state.ny` are the pointer's offset from the glyph's center, from -1 to 1.
  function drive(host, trigger, motion) {
    const width = host.querySelector("svg").viewBox.baseVal.width;
    const state = { hovering: false, nx: 0, ny: 0, time: 0 };
    const draw = () => motion.draw(state, width);
    draw();
    if (reducedMotion || !trigger) return;
    let frameId = 0;
    let last = 0;

    function step(now) {
      const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
      last = now;
      state.time += dt;
      motion.aim(state, dt);
      motion.springs.forEach((s) => advance(s, dt));
      const busy = motion.busy ? motion.busy(state) : false;
      if (!state.hovering && !busy && motion.springs.every(settled)) {
        motion.springs.forEach((s) => {
          s.value = s.target;
          s.velocity = 0;
        });
        draw();
        frameId = 0;
        return;
      }
      draw();
      frameId = window.requestAnimationFrame(step);
    }

    function point(event) {
      const box = host.getBoundingClientRect();
      state.nx = clamp((event.clientX - (box.left + box.width / 2)) / (box.width / 2), -1, 1);
      state.ny = clamp((event.clientY - (box.top + box.height / 2)) / (box.height / 2), -1, 1);
    }

    function wake() {
      if (frameId) return;
      last = performance.now();
      frameId = window.requestAnimationFrame(step);
    }

    trigger.addEventListener("pointerenter", (event) => {
      state.hovering = true;
      point(event);
      if (motion.enter) motion.enter(state);
      wake();
    });
    trigger.addEventListener("pointermove", (event) => {
      if (state.hovering) point(event);
    });
    trigger.addEventListener("pointerleave", () => {
      state.hovering = false;
      wake();
    });
  }

  // Blog pencil height along the written line, keyed by how far it has slid left.
  const STROKE = [[-18, -1], [-15.5, -3], [-11.5, 0], [-7.5, -3], [-3.5, 0], [0, 0]];

  function strokeHeight(tx) {
    if (tx <= STROKE[0][0]) return STROKE[0][1];
    for (let i = 1; i < STROKE.length; i += 1) {
      const [x1, y1] = STROKE[i];
      if (tx > x1) continue;
      const [x0, y0] = STROKE[i - 1];
      const t = (1 - Math.cos(((tx - x0) / (x1 - x0)) * Math.PI)) / 2;
      return y0 + (y1 - y0) * t;
    }
    return 0;
  }

  const motions = {
    // The needle kicks on enter, leans toward the pointer, and settles on north.
    principles(host) {
      const needle = part(layersOf(host, PRINCIPLES, { "*": ".needle-north", n: ".needle-south" }), [8.5, 8.5]);
      const angle = spring(46, 3.2);
      return {
        springs: [angle],
        enter(state) { angle.velocity += (state.nx < 0 ? -1 : 1) * 6; },
        aim(state) { angle.target = state.hovering ? state.nx * 0.35 : 0; },
        draw(state, width) { render(needle, width, { angle: angle.value }); },
      };
    },

    // The hand waves from the wrist on a spring chasing a sway, tilted by the pointer.
    about(host) {
      const hand = part(layersOf(host, ABOUT, { "#": ".hand" }), [10.5, 17], null, "solid");
      const angle = spring(60, 5);
      return {
        springs: [angle],
        enter() { angle.velocity -= 3; },
        aim(state) {
          angle.target = state.hovering ? Math.sin(state.time * 9) * 0.2 + state.nx * 0.1 : 0;
        },
        draw(state, width) { render(hand, width, { angle: angle.value }); },
      };
    },

    // The lid pops open on its hinge, opening wider toward the right of the tile.
    work(host) {
      const lid = part(layersOf(host, WORK, { l: ".lid" }), [1, 5], null, "solid");
      const angle = spring(70, 6);
      const lift = spring(70, 9);
      return {
        springs: [angle, lift],
        enter() { angle.velocity -= 1.5; },
        aim(state) {
          angle.target = state.hovering ? -0.07 - 0.05 * (state.nx + 1) / 2 : 0;
          lift.target = state.hovering ? -1 : 0;
        },
        draw(state, width) { render(lid, width, { angle: angle.value, ty: lift.value }); },
      };
    },

    // The pencil follows the pointer along the line. Ink exists only behind its tip,
    // so sliding left erases and sliding right writes. It leans against its motion.
    blog(host) {
      let tipX = 18;
      const pencil = part(layersOf(host, BLOG, { "#": ".pencil" }), [18.5, 17.5]);
      const ink = part(layersOf(host, BLOG, { "*": ".ink" }), [0, 0], (x) => x < tipX);
      const slide = spring(38, 9);
      return {
        springs: [slide],
        enter() { slide.velocity -= 12; },
        aim(state) { slide.target = state.hovering ? -18 * (1 - (state.nx + 1) / 2) : 0; },
        draw(state, width) {
          const tx = slide.value;
          tipX = 18 + tx;
          render(pencil, width, {
            tx,
            ty: strokeHeight(tx),
            angle: clamp(-slide.velocity * 0.008, -0.18, 0.18),
          });
          render(ink, width);
        },
      };
    },

    // The bookmark is drawn out of the spine on a spring and tilts toward the pointer.
    // Anything below the page edge stays hidden between the pages.
    books(host) {
      const edges = new Map();
      const edgeAt = (col) => {
        if (!edges.has(col)) edges.set(col, pageEdge(col));
        return edges.get(col);
      };
      const ribbon = part(
        [{ group: host.querySelector(".bookmark"), cells: bookmarkCells() }],
        [BOOKMARK.x + 1.5, pageEdge(BOOKMARK.x + 1) + BOOKMARK.rise],
        (x, y) => y < edgeAt(Math.floor(x)),
      );
      const pull = spring(55, 5);
      const tilt = spring(40, 4);
      return {
        springs: [pull, tilt],
        enter() { pull.velocity -= 10; },
        aim(state) {
          pull.target = state.hovering ? -BOOKMARK.rise : 0;
          tilt.target = state.hovering ? state.nx * 0.15 : 0;
        },
        draw(state, width) { render(ribbon, width, { ty: pull.value, angle: tilt.value }); },
      };
    },

    // The invader tracks the pointer sideways and marches, swapping legs on a beat.
    invader(host) {
      const layers = layersOf(host, INVADER, { "#": ".base", e: ".eye", a: ".leg-a", b: ".leg-b" });
      const body = part(layers, [5.5, 4]);
      const legA = host.querySelector(".leg-a");
      const legB = host.querySelector(".leg-b");
      const march = spring(30, 6.5);
      let beat = 0;
      let stride = 0;
      return {
        springs: [march],
        enter(state) { beat = state.time; },
        aim(state) {
          march.target = state.hovering ? state.nx * 2.5 : 0;
          const next = Math.floor((state.time - beat) * 2.5) % 2;
          if (state.hovering || stride !== 0) stride = next;
        },
        busy() { return stride !== 0; },
        draw(state, width) {
          legA.style.opacity = stride ? "0" : "";
          legB.style.opacity = stride ? "1" : "";
          render(body, width, { tx: march.value });
        },
      };
    },

    // The tittle hops on enter and squashes with its speed.
    linkedin(host) {
      const tittle = part(layersOf(host, LINKEDIN, { "*": ".tittle" }), [3, 2]);
      const hop = spring(140, 7);
      return {
        springs: [hop],
        enter() { hop.velocity -= 16; },
        aim() { hop.target = 0; },
        draw(state, width) {
          const stretch = 1 + clamp(Math.abs(hop.velocity) * 0.02, 0, 0.3);
          render(tittle, width, { ty: hop.value, sx: 1 / stretch, sy: stretch });
        },
      };
    },

    // The tail wags from its root on a spring chasing a quick sway.
    github(host) {
      const tail = part(layersOf(host, GITHUB, { t: ".tail" }), [5, 14.5], null, "trace");
      const angle = spring(160, 8);
      return {
        springs: [angle],
        aim(state) { angle.target = state.hovering ? Math.sin(state.time * 13) * 0.25 : 0; },
        draw(state, width) { render(tail, width, { angle: angle.value }); },
      };
    },

    // The flap folds open over its hinge, passing edge-on before it lands.
    mail(host) {
      const flap = part(layersOf(host, MAIL, { "*": ".flap" }), [7.5, 1.5]);
      const fold = spring(80, 10, 1);
      return {
        springs: [fold],
        aim(state) { fold.target = state.hovering ? -1 : 1; },
        draw(state, width) { render(flap, width, { sy: fold.value }); },
      };
    },
  };

  document.querySelectorAll("[data-glyph]").forEach((host) => {
    const motion = motions[host.dataset.glyph];
    if (!motion || !host.querySelector("svg")) return;
    const trigger = host.closest(".card-links a") || host.closest(".card");
    drive(host, trigger, motion(host));
  });

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const yearEl = document.getElementById("year");
  const nowEl = document.getElementById("now");

  function paint(el, text) {
    const rim = el.querySelector(".ink-rim");
    const face = el.querySelector(".ink-face");
    if (rim) rim.textContent = text;
    if (face) face.textContent = text;
  }

  function tick() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} · ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    if (yearEl) paint(yearEl, String(date.getFullYear()));
    if (nowEl) {
      paint(nowEl, stamp);
      nowEl.dateTime = date.toISOString();
    }
    window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }

  tick();
})();
