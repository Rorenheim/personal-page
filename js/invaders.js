(() => {
  const root = document.getElementById("invaders");
  if (!root) return;

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const playButton = root.querySelector(".play");

  const invader = [
    "...##...##.",
    "..########.",
    ".##.####.##",
    "###########",
    "#.##.##.##.",
    "###########",
    ".#.#...#.#.",
    "..#.....#..",
  ];
  const player = [
    ".....##.....",
    "....####....",
    "..########..",
    "############",
  ];

  const cols = 5;
  const rows = 3;

  let mode = "idle";
  let raf = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let unit = 4;
  let game = null;
  let inViewport = true;
  let pixelRatio = 0;
  let inkColor = "#fff";
  const spritePaths = new WeakMap();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function spriteSize(sprite) {
    return { w: sprite[0].length * unit, h: sprite.length * unit };
  }

  function makeGame(playerX) {
    const invaderSize = spriteSize(invader);
    const aliens = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) aliens.push({ c, r, alive: true });
    }
    return {
      aliens,
      strideX: invaderSize.w + unit * 4,
      strideY: invaderSize.h + unit * 4,
      x: 28,
      y: 28,
      dir: 1,
      stepEvery: 0.62,
      acc: 0,
      drop: false,
      playerX: playerX ?? width / 2,
      bullet: null,
      shots: [],
      shotAcc: 1.2,
      cooldown: 0,
      bursts: [],
      shells: [],
      sparks: [],
      boomAcc: 0,
      wonTime: 0,
    };
  }

  function living() {
    return game.aliens.filter((alien) => alien.alive);
  }

  function alienOrigin(alien) {
    return {
      x: game.x + alien.c * game.strideX,
      y: game.y + alien.r * game.strideY,
    };
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === nextWidth && height === nextHeight && pixelRatio === dpr) return;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = dpr;
    inkColor = getComputedStyle(root).color;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fit = Math.floor((width - 56) / (cols * 15 + 11));
    unit = Math.max(3, Math.min(6, fit));
    if (game) {
      const invaderSize = spriteSize(invader);
      game.strideX = invaderSize.w + unit * 4;
      game.strideY = invaderSize.h + unit * 4;
      clampPlayer();
    }
  }

  function clampPlayer() {
    const half = (player[0].length * unit) / 2;
    game.playerX = Math.min(width - half - 10, Math.max(half + 10, game.playerX));
  }

  function placePlayer(x) {
    if (mode !== "play" || !game) return;
    game.playerX = x;
    clampPlayer();
  }

  function burst(x, y) {
    [0.4, 2.2, 3.8, 5.4].forEach((angle) => {
      game.bursts.push({
        x,
        y,
        vx: Math.cos(angle) * 70,
        vy: Math.sin(angle) * 70,
        life: 0.22,
      });
    });
  }

  function shoot() {
    if (mode !== "play" || !game || game.bullet || game.cooldown > 0) return;
    const size = spriteSize(player);
    game.bullet = { x: game.playerX, y: height - 26 - size.h };
    game.cooldown = 0.26;
  }

  function explode(x, y) {
    [16, 8].forEach((count, ring) => {
      const speed = ring === 0 ? 130 : 64;
      const life = ring === 0 ? 1.05 : 0.72;
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + ring * 0.18;
        game.sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          max: life,
        });
      }
    });
  }

  function launchShell() {
    game.shells.push({
      x: width * (0.18 + Math.random() * 0.64),
      y: height - 16,
      vx: (Math.random() - 0.5) * 46,
      vy: -(250 + Math.random() * 150),
    });
  }

  function beginWin() {
    mode = "won";
    game.wonTime = 0;
    game.shells = [];
    game.sparks = [];
    game.bullet = null;
    game.shots = [];
    const quiet = reducedMotion.matches;
    if (quiet) {
      explode(width * 0.32, height * 0.32);
      explode(width * 0.68, height * 0.24);
      return;
    }
    game.boomAcc = 0.02;
  }

  function endGame() {
    mode = "lost";
    game.lostTime = 0;
    game.bullet = null;
    game.shots = [];
  }

  function revert() {
    mode = "idle";
    root.classList.remove("is-on");
    release();
  }

  // The canvas is hidden while idle, so it holds no pixel memory until Play.
  function release() {
    canvas.width = 0;
    canvas.height = 0;
    width = 0;
    height = 0;
    pixelRatio = 0;
  }

  function resizeWhilePlaying() {
    if (mode !== "idle") resize();
  }

  function tickBursts(dt) {
    game.bursts.forEach((dot) => {
      dot.life -= dt;
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
    });
    game.bursts = game.bursts.filter((dot) => dot.life > 0);
  }

  function celebrate(dt) {
    game.wonTime += dt;
    if (reducedMotion.matches) return;
    game.boomAcc -= dt;
    if (game.boomAcc <= 0 && game.shells.length < 3) {
      launchShell();
      game.boomAcc = 0.4 + Math.random() * 0.28;
    }

    const popped = [];
    game.shells.forEach((shell) => {
      shell.vy += 340 * dt;
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      if (shell.vy >= -36 || shell.y < 24) popped.push(shell);
    });
    if (popped.length) {
      game.shells = game.shells.filter((shell) => !popped.includes(shell));
      popped.forEach((shell) => explode(shell.x, shell.y));
    }

    game.sparks.forEach((dot) => {
      dot.life -= dt;
      dot.vy += 150 * dt;
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
    });
    game.sparks = game.sparks.filter((dot) => dot.life > 0);
    tickBursts(dt);
  }

  function tickLoss(dt) {
    game.lostTime += dt;
    tickBursts(dt);
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (game.lostTime >= (quiet ? 1.4 : 2.7)) revert();
  }

  function stepFormation() {
    const alive = living();
    if (!alive.length) return;
    const size = spriteSize(invader);
    const left = Math.min(...alive.map((alien) => alienOrigin(alien).x));
    const right = Math.max(...alive.map((alien) => alienOrigin(alien).x)) + size.w;
    const nudge = unit * 2;

    if (game.drop) {
      game.y += unit * 5;
      game.dir *= -1;
      game.drop = false;
      return;
    }

    game.x += game.dir * nudge;
    if (right + game.dir * nudge > width - 18 || left + game.dir * nudge < 18) game.drop = true;
  }

  function hitAlien(bullet) {
    const size = spriteSize(invader);
    return living().find((alien) => {
      const origin = alienOrigin(alien);
      return bullet.x > origin.x && bullet.x < origin.x + size.w && bullet.y > origin.y && bullet.y < origin.y + size.h;
    });
  }

  function update(dt) {
    const playerSize = spriteSize(player);
    const playerY = height - 26 - playerSize.h;
    let failed = false;

    game.cooldown = Math.max(0, game.cooldown - dt);
    game.acc += dt;
    if (game.acc >= game.stepEvery) {
      game.acc = 0;
      stepFormation();
    }

    if (game.bullet) {
      game.bullet.y -= 460 * dt;
      const alien = hitAlien(game.bullet);
      if (alien) {
        alien.alive = false;
        const origin = alienOrigin(alien);
        const size = spriteSize(invader);
        burst(origin.x + size.w / 2, origin.y + size.h / 2);
        game.bullet = null;
      } else if (game.bullet.y < 8) {
        game.bullet = null;
      }
    }

    game.shotAcc -= dt;
    if (game.shotAcc <= 0 && living().length) {
      const alive = living();
      const columns = [...new Set(alive.map((alien) => alien.c))];
      const column = columns[Math.floor(Math.random() * columns.length)];
      const shooter = alive.filter((alien) => alien.c === column).sort((a, b) => b.r - a.r)[0];
      const origin = alienOrigin(shooter);
      const size = spriteSize(invader);
      game.shots.push({ x: origin.x + size.w / 2, y: origin.y + size.h });
      game.shotAcc = 1.05;
    }

    game.shots = game.shots.filter((shot) => {
      shot.y += 150 * dt;
      const hit = shot.x > game.playerX - playerSize.w / 2
        && shot.x < game.playerX + playerSize.w / 2
        && shot.y > playerY
        && shot.y < playerY + playerSize.h;
      if (hit) failed = true;
      return !hit && shot.y < height + 8;
    });

    tickBursts(dt);

    const lowest = living().reduce((max, alien) => Math.max(max, alienOrigin(alien).y), 0);
    const landed = living().length > 0 && lowest + spriteSize(invader).h >= playerY - 4;
    if (failed || landed) {
      endGame();
      return;
    }
    if (!living().length) beginWin();
  }

  function blit(sprite, x, y) {
    let cached = spritePaths.get(sprite);
    if (!cached || cached.unit !== unit) {
      const path = new Path2D();
      const radius = unit * 0.38;
      sprite.forEach((line, row) => {
        for (let col = 0; col < line.length; col += 1) {
          if (line[col] !== "#") continue;
          const cx = (col + 0.5) * unit;
          const cy = (row + 0.5) * unit;
          path.moveTo(cx + radius, cy);
          path.arc(cx, cy, radius, 0, Math.PI * 2);
        }
      });
      cached = { unit, path };
      spritePaths.set(sprite, cached);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fill(cached.path);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    // The transparent canvas already shows the card's background, including
    // its existing CSS transitions. No per-frame computed-style reads needed.
    ctx.fillStyle = inkColor;

    if (mode === "lost") {
      drawCaption("Try again", game.lostTime);
      return;
    }

    living().forEach((alien) => {
      const origin = alienOrigin(alien);
      blit(invader, origin.x, origin.y);
    });

    if (game.bullet) {
      ctx.beginPath();
      ctx.arc(game.bullet.x, game.bullet.y, unit * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    game.shots.forEach((shot) => {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, unit * 0.34, 0, Math.PI * 2);
      ctx.fill();
    });

    game.bursts.forEach((dot) => {
      ctx.globalAlpha = Math.max(0, dot.life / 0.22);
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const size = spriteSize(player);
    blit(player, game.playerX - size.w / 2, height - 26 - size.h);

    game.shells.forEach((shell) => {
      fillDot(shell.x, shell.y, unit * 0.38);
    });

    game.sparks.forEach((dot) => {
      const age = 1 - dot.life / dot.max;
      if (age > 0.62 && Math.floor(dot.x / unit + game.wonTime * 18) % 2 === 0) return;
      fillDot(dot.x, dot.y, unit * 0.38);
    });
    ctx.globalAlpha = 1;

    if (mode === "won") drawCaption("You Won", game.wonTime);
  }

  function drawCaption(text, time) {
    const quiet = reducedMotion.matches;
    const blinkOn = quiet || Math.floor(time / 0.45) % 2 === 0;
    if (!blinkOn) return;
    let fontSize = Math.round(Math.min(width * 0.14, height * 0.22, 64));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${fontSize}px Doto, "Space Grotesk", sans-serif`;
    while (fontSize > 22 && ctx.measureText(text).width > width - 48) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px Doto, "Space Grotesk", sans-serif`;
    }
    ctx.fillText(text, width / 2, height * 0.44);
  }

  function fillDot(x, y, radius) {
    ctx.beginPath();
    ctx.arc(Math.round(x / unit) * unit, Math.round(y / unit) * unit, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function canRun() {
    return inViewport && !document.hidden && game && mode !== "idle";
  }

  function queueFrame() {
    if (!raf && canRun()) raf = requestAnimationFrame(frame);
  }

  function refreshVisibility() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = performance.now();
    queueFrame();
  }

  function frame(now) {
    raf = 0;
    if (!canRun()) return;
    const dt = Math.min(0.034, (now - last) / 1000 || 0);
    last = now;
    if (!document.hidden && game && mode !== "idle") {
      if (mode === "won") celebrate(dt);
      else if (mode === "lost") tickLoss(dt);
      else update(dt);
      if (mode !== "idle") draw();
    }
    queueFrame();
  }

  function start() {
    resize();
    inkColor = getComputedStyle(root).color;
    game = makeGame(width / 2);
    if (new URLSearchParams(location.search).has("celebrate")) {
      game.aliens.forEach((alien) => { alien.alive = false; });
    }
    mode = "play";
    root.classList.add("is-on");
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = 0;
    queueFrame();
  }

  if (new URLSearchParams(location.search).has("celebrate")) playButton.textContent = "Win";

  playButton.addEventListener("click", (event) => {
    event.stopPropagation();
    start();
  });

  canvas.addEventListener("pointerenter", (event) => {
    placePlayer(event.offsetX);
  });

  canvas.addEventListener("pointermove", (event) => {
    placePlayer(event.offsetX);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (mode === "won") {
      start();
      return;
    }
    if (mode !== "play") return;
    placePlayer(event.offsetX);
    shoot();
  });

  document.addEventListener("visibilitychange", refreshVisibility);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting;
      if (visible === inViewport) return;
      inViewport = visible;
      refreshVisibility();
    }).observe(root);
  }

  release();
  new ResizeObserver(resizeWhilePlaying).observe(root);
  window.__invaders = {
    state: () => ({
      mode,
      on: root.classList.contains("is-on"),
      label: playButton.textContent,
      lost: game ? game.lostTime : null,
    }),
    hit: () => {
      const size = spriteSize(player);
      game.shots.push({ x: game.playerX, y: height - 26 - size.h + 2 });
    },
  };
})();
