// Optional browser smoke checks: Node 22+ and Chromium, no npm dependencies.
// Run with: node tests/mobile-smoke.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
  await viewport(390);
  await send("Page.navigate", { url: `${base}/` });
  await until('!!window.watchTileMotion && !!document.querySelector("[data-glyph=projects] canvas")');
  await until('!document.documentElement.classList.contains("is-loading")');
  assert(await evaluate('matchMedia("(pointer:coarse)").matches'), "Touch emulation must be active");

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
  await until('document.querySelector("a.card[href=\\"about.html\\"]").classList.contains("is-motion-active")');
  const hand = await evaluate('document.querySelector("[data-glyph=about]").innerHTML');
  await sleep(250);
  assert.notEqual(await evaluate('document.querySelector("[data-glyph=about]").innerHTML'), hand, "Scroll alone should animate the tile");
  await center(".card-feature");
  await until('document.querySelector(".card-feature").classList.contains("is-motion-active")');
  assert(!(await evaluate('document.querySelector("a.card[href=\\"about.html\\"]").classList.contains("is-motion-active")')), "Offscreen tile should deactivate");
  const rocket = await evaluate('document.querySelector("[data-glyph=projects] canvas").style.transform');
  await sleep(250);
  assert.notEqual(await evaluate('document.querySelector("[data-glyph=projects] canvas").style.transform'), rocket);

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
  console.log("PASS: mobile footer widths, scroll animations, offscreen reset, rocket motion, swipe and tap navigation");

  assert.deepEqual(errors, [], "No uncaught browser exceptions");
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await sleep(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
