// Optional browser smoke checks: Node 22+ and Chromium, no npm dependencies.
// Run with: node tests/mobile-smoke.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const profile = await mkdtemp(join(tmpdir(), "portfolio-mobile-"));
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=9223", `--user-data-dir=${profile}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base = process.env.TEST_BASE_URL
  || `https://${process.env.REPLIT_DEV_DOMAIN}`;
let socket;
try {
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
      if (targets.some((target) => target.type === "page")) break;
    } catch {}
    await sleep(100);
  }
  assert(targets, "Chromium did not start");
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.text);
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    assert.fail(`Condition never became true: ${expression}`);
  };
  const viewport = async (width, height = 844, mobile = true) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile,
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    await sleep(150);
  };
  const center = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center", behavior:"instant"})`);
    await sleep(250);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.bringToFront");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.backgroundFrames = 0;
    window.backgroundAllocations = 0;
    window.backgroundUpdates = 0;
    window.gameFrames = 0;
    window.gameFills = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      if (this.canvas.closest("#invaders")) window.gameFrames++;
      return clear.apply(this, args);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    CanvasRenderingContext2D.prototype.fill = function(...args) {
      if (this.canvas.closest("#invaders")) window.gameFills++;
      return fill.apply(this, args);
    };
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const draw = type.prototype.drawArrays;
      type.prototype.drawArrays = function(...args) {
        if (this.canvas.closest("#field")) window.backgroundFrames++;
        return draw.apply(this, args);
      };
      for (const [method, count] of [["texImage2D", "backgroundAllocations"], ["texSubImage2D", "backgroundUpdates"]]) {
        const original = type.prototype[method];
        type.prototype[method] = function(...args) {
          if (this.canvas.closest("#field")) window[count]++;
          return original.apply(this, args);
        };
      }
    }
  ` });
  await viewport(390);
  await send("Page.navigate", { url: `${base}/` });
  await until('!!window.watchTileMotion && !!document.querySelector("[data-glyph=projects] canvas")');
  await until('!document.documentElement.classList.contains("is-loading")');
  assert(await evaluate('matchMedia("(pointer:coarse)").matches'), "Touch emulation must be active");
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("generated-artifacts/mobile-home.png", Buffer.from(screenshot.data, "base64"));

  // All footer text stays on a single line without horizontal page overflow.
  for (const width of [320, 360, 390, 430, 600, 601, 768, 900]) {
    await viewport(width);
    const footer = await evaluate(`(() => {
      const rects = [...document.querySelectorAll(".colophon .ink-face")].map(el => el.getBoundingClientRect());
      return {
        singleLine: Math.max(...rects.map(r=>r.bottom)) - Math.min(...rects.map(r=>r.bottom)) < 3,
        noOverflow: document.documentElement.scrollWidth <= innerWidth,
        readable: rects.every(r=>r.left >= 0 && r.right <= innerWidth),
      };
    })()`);
    assert(footer.singleLine && footer.noOverflow && footer.readable, `${width}px footer: ${JSON.stringify(footer)}`);
  }
  await viewport(390);
  await center('a.card[href="about.html"]');
  const hand = await evaluate('document.querySelector("[data-glyph=about]").innerHTML');
  await sleep(250);
  assert.equal(await evaluate('document.querySelector("[data-glyph=about]").innerHTML'), hand, "Mobile tiles must stay still");
  assert(!(await evaluate('!!document.querySelector(".is-motion-active")')), "Scrolling must not activate tiles");
  await center(".card-feature");
  const rocket = await evaluate('document.querySelector("[data-glyph=projects] canvas").style.transform');
  await sleep(250);
  assert.equal(await evaluate('document.querySelector("[data-glyph=projects] canvas").style.transform'), rocket);
  const background = await evaluate(`(() => {
    const c=document.querySelector("#field canvas"), v=document.querySelector("body > video");
    return {pixels: c.width*c.height, time: v.currentTime, frames: window.backgroundFrames, ink: document.documentElement.classList.contains("ink-live")};
  })()`);
  assert(background.pixels <= 264000, `Mobile background pixel budget: ${background.pixels}`);
  assert.equal(background.ink, false, "Mobile should not encode animated text masks");
  await sleep(400);
  assert(await evaluate(`document.querySelector("body > video").currentTime > ${background.time}`), "Background must keep playing");
  assert(await evaluate(`window.backgroundFrames > ${background.frames}`), "Background shader must keep rendering");
  const texture = await evaluate("({ allocations: backgroundAllocations, updates: backgroundUpdates })");
  await sleep(400);
  assert.equal(await evaluate("backgroundAllocations"), texture.allocations, "Video frames must reuse texture storage");
  assert(await evaluate(`backgroundUpdates > ${texture.updates}`), "Existing background texture should receive new frames");

  // Starting Play should draw batched sprites, not hundreds of separate dots.
  await center("#invaders");
  await evaluate('document.querySelector("#invaders .play").click()');
  await until('window.__invaders.state().mode === "play" && gameFrames > 2');
  const playing = await evaluate("({ frames: gameFrames, fills: gameFills, background: backgroundFrames })");
  // Software-rendered headless browsers need not produce frames within a
  // 300ms wall-clock window. Verify actual frame progress instead.
  await until(`gameFrames > ${playing.frames + 2} && backgroundFrames > ${playing.background}`);
  const played = await evaluate("({ frames: gameFrames, fills: gameFills, background: backgroundFrames })");
  assert(played.frames > playing.frames, "Game should animate while visible");
  assert((played.fills - playing.fills) / (played.frames - playing.frames) <= 20, "Sprites should use one fill each");
  assert(played.background > playing.background, "Background must remain animated during Play");
  const gameScreenshot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("generated-artifacts/mobile-game.png", Buffer.from(gameScreenshot.data, "base64"));
  await center('a.card[href="about.html"]');
  const paused = await evaluate("gameFrames");
  await sleep(250);
  assert.equal(await evaluate("gameFrames"), paused, "Offscreen game should not render");
  await center("#invaders");
  await until(`gameFrames > ${paused}`);
  assert.equal(await evaluate("window.__invaders.state().mode"), "play", "Game should resume in place");

  // A real touch swipe scrolls instead of navigating.
  const before = await evaluate("scrollY");
  await send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [{ x: 195, y: 600 }],
  });
  for (let y = 580; y >= 360; y -= 20) {
    await send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: 195, y }],
    });
    await sleep(20);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  assert(await evaluate(`scrollY > ${before + 40}`),
    `Touch swipe should scroll: ${before} -> ${await evaluate("scrollY")}`);
  assert.equal(await evaluate("location.pathname"), "/");
  await center('a.card[href="about.html"]');
  const point = await evaluate(`(() => {
    const r=document.querySelector('a.card[href="about.html"]').getBoundingClientRect();
    return {x: r.left+r.width/2, y:r.top+r.height/2};
  })()`);
  await send("Input.dispatchTouchEvent", {
    type: "touchStart", touchPoints: [point],
  });
  await sleep(80);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until('location.pathname.endsWith("/about.html")');
  console.log("PASS: mobile layout, static tiles, texture reuse, Play rendering, offscreen pause/resume, animated background, swipe and tap navigation");

  assert.deepEqual(errors, [], "No uncaught browser exceptions");
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await sleep(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
