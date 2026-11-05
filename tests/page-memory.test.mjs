import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { loadWidgets, snapshot } from "./fake-svg-dom.mjs";

const widgetsSource = readFileSync(new URL("../js/widgets.js", import.meta.url), "utf8");

test("glyph dots carry no unused inline style", () => {
  const page = loadWidgets(widgetsSource);
  const circles = [];
  const walk = (el) => el.children.forEach((child) => (child.tag === "circle" ? circles.push(child) : walk(child)));
  page.hosts.forEach(walk);
  assert(circles.length > 900);
  assert(circles.every((circle) => !("style" in circle.attrs)));
});

test("hover motion reuses dot elements and settles back to the resting glyph", () => {
  const page = loadWidgets(widgetsSource);
  const resting = page.hosts.map(snapshot);
  const initial = page.stats.created;
  page.hosts.forEach((host) => {
    page.pointer(host, "pointerenter", 40, 150);
    for (let f = 0; f < 120; f++) {
      if (f % 3 === 0) page.pointer(host, "pointermove", 100 + Math.sin(f / 5) * 95, 100);
      page.frame();
    }
    page.pointer(host, "pointerleave", 0, 0);
    while (page.frame()) { /* settle */ }
  });
  const createdAfterFirstHover = page.stats.created;
  page.hosts.forEach((host) => {
    page.pointer(host, "pointerenter", 40, 150);
    for (let f = 0; f < 120; f++) {
      if (f % 3 === 0) page.pointer(host, "pointermove", 100 + Math.sin(f / 5) * 95, 100);
      page.frame();
    }
    page.pointer(host, "pointerleave", 0, 0);
    while (page.frame()) { /* settle */ }
  });
  assert.equal(page.stats.innerHTML, page.hosts.length, "Markup is only built once per glyph");
  // Rebuilding markup each frame created tens of thousands of dots for this script;
  // the pool only grows when a pose needs more dots than any pose before it.
  assert(createdAfterFirstHover - initial < 300, "The first hovers only grow the pool a little");
  assert(page.stats.created - createdAfterFirstHover <= 10, "A repeated hover creates almost no dots");
  assert.deepEqual(page.hosts.map(snapshot), resting, "Every glyph returns to its resting dots");
});

test("the footer clock only rewrites text that changed", () => {
  const writes = [];
  const textNode = (name, text) => {
    let value = text;
    return {
      get textContent() { return value; },
      set textContent(next) { writes.push(name); value = next; },
    };
  };
  const clock = (name, text) => {
    const parts = { ".ink-rim": textNode(`${name}-rim`, text), ".ink-face": textNode(`${name}-face`, text) };
    return { querySelector: (selector) => parts[selector], setAttribute() {} };
  };
  const year = String(new Date().getFullYear());
  const page = loadWidgets(widgetsSource, { elements: { year: clock("year", year), now: clock("now", "––") } });
  page.runTimers();
  page.runTimers();
  assert(!writes.includes("year-rim") && !writes.includes("year-face"), "The year is never rewritten");
  assert(writes.includes("now-face"), "The time still updates");
});

function skyHarness() {
  const source = readFileSync(new URL("../js/sky.js", import.meta.url), "utf8");
  let rect = { left: 0, top: 0, width: 120, height: 140, right: 120, bottom: 140 };
  let resize;
  let fontsReady;
  const timers = [];
  const calls = { buffers: 0 };
  const context = () => new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  const canvas = () => ({ width: 0, height: 0, style: {}, setAttribute() {}, getContext: context });
  const card = { querySelector: () => ({ getBoundingClientRect: () => ({ right: 60, top: 120 }) }) };
  const host = { appendChild() {}, closest: () => card, getBoundingClientRect: () => rect };
  class ImageData {
    constructor(w, h) { calls.buffers++; this.data = new Uint8ClampedArray(w * h * 4); }
  }
  runInNewContext(source, {
    document: {
      querySelector: () => host,
      createElement: canvas,
      fonts: { ready: new Promise((resolve) => { fontsReady = resolve; }) },
    },
    window: {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: false }),
      watchTileMotion() {},
      setTimeout(fn) { timers.push(fn); return timers.length; },
      clearTimeout() {},
      requestAnimationFrame() { return 0; },
    },
    ImageData,
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} },
    performance: { now: () => 0 },
  });
  return {
    calls,
    async fonts() { fontsReady(); await Promise.resolve(); await Promise.resolve(); },
    resize(next) {
      if (next) rect = { ...rect, ...next };
      resize([]);
      timers.splice(0).forEach((fn) => fn());
    },
  };
}

test("the rocket artwork is built once per size, not once per notification", async () => {
  const sky = skyHarness();
  const perBuild = sky.calls.buffers;
  assert(perBuild > 0);
  await sky.fonts();
  sky.resize();
  assert.equal(sky.calls.buffers, perBuild, "Font and first resize callbacks reuse the artwork");
  sky.resize({ width: 160, right: 160 });
  assert.equal(sky.calls.buffers, perBuild * 2, "A real size change rebuilds it");
});

function invadersHarness() {
  const source = readFileSync(new URL("../js/invaders.js", import.meta.url), "utf8");
  const pending = [];
  let now = 0;
  let resize;
  const listeners = {};
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => new Proxy({}, { get: (t, k) => t[k] ?? (k === "measureText" ? () => ({ width: 0 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } }),
    addEventListener() {},
  };
  const button = { textContent: "Play", addEventListener(type, fn) { listeners[type] = fn; } };
  const root = {
    getBoundingClientRect: () => ({ width: 520, height: 360 }),
    querySelector: (selector) => (selector === "canvas" ? canvas : button),
    classList: { add() {}, remove() {}, contains() { return false; } },
  };
  const window = { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) };
  runInNewContext(source, {
    window,
    document: { hidden: false, getElementById: () => root, addEventListener() {} },
    Path2D: class { moveTo() {} arc() {} },
    location: { search: "" }, URLSearchParams,
    performance: { now: () => now },
    requestAnimationFrame(fn) { pending.push(fn); return pending.length; },
    cancelAnimationFrame() {},
    getComputedStyle: () => ({ color: "#fff" }),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} },
  });
  return {
    canvas,
    window,
    resize: () => resize([]),
    play: () => listeners.click({ stopPropagation() {} }),
    run(frames) {
      for (let i = 0; i < frames; i++) {
        now += 1000 / 60;
        const fn = pending.shift();
        if (fn) fn(now);
      }
    },
  };
}

test("the game canvas holds no pixels until Play and frees them afterwards", () => {
  const game = invadersHarness();
  game.resize();
  assert.deepEqual([game.canvas.width, game.canvas.height], [0, 0], "Idle game allocates nothing");
  game.play();
  assert.deepEqual([game.canvas.width, game.canvas.height], [1040, 720]);
  game.window.__invaders.hit();
  game.run(200);
  assert.equal(game.window.__invaders.state().mode, "idle");
  assert.deepEqual([game.canvas.width, game.canvas.height], [0, 0], "Back to idle frees the pixels");
  game.play();
  assert.deepEqual([game.canvas.width, game.canvas.height], [1040, 720], "Playing again re-allocates");
});
