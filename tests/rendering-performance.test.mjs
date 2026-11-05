import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const gameSource = readFileSync(new URL("../js/invaders.js", import.meta.url), "utf8");

function gameHarness() {
  let now = 0;
  let nextId = 0;
  let visibility;
  const pending = new Map();
  const listeners = {};
  const documentEvents = {};
  const classes = new Set();
  const calls = { styles: 0, pathDots: 0, fills: 0, clears: 0 };
  class Path {
    moveTo() {}
    arc() { calls.pathDots++; }
  }
  const ctx = {
    setTransform() {}, save() {}, restore() {}, translate() {},
    clearRect() { calls.clears++; },
    fill() { calls.fills++; }, beginPath() {}, arc() {},
    fillText() {}, measureText() { return { width: 100 }; },
  };
  const canvas = {
    getContext() { return ctx; },
    addEventListener() {},
  };
  const button = {
    textContent: "Play",
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  const root = {
    getBoundingClientRect() { return { width: 520, height: 360 }; },
    querySelector(selector) { return selector === "canvas" ? canvas : button; },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
  const document = {
    hidden: false,
    getElementById() { return root; },
    addEventListener(type, fn) { documentEvents[type] = fn; },
  };
  class Intersection {
    constructor(callback) { visibility = callback; }
    observe() {}
  }
  const window = {
    devicePixelRatio: 2,
    matchMedia() { return { matches: false }; },
    IntersectionObserver: Intersection,
  };
  runInNewContext(gameSource, {
    window, document, Path2D: Path, location: { search: "" }, URLSearchParams,
    performance: { now: () => now },
    requestAnimationFrame(fn) { const id = ++nextId; pending.set(id, fn); return id; },
    cancelAnimationFrame(id) { pending.delete(id); },
    getComputedStyle() { calls.styles++; return { color: "#fff" }; },
    IntersectionObserver: Intersection,
    ResizeObserver: class { observe() {} },
  });
  return {
    window, document, calls,
    start() { listeners.click({ stopPropagation() {} }); },
    step() {
      now += 1000 / 60;
      const frame = pending.entries().next().value;
      if (frame) { pending.delete(frame[0]); frame[1](now); }
    },
    visible(value) { visibility([{ isIntersecting: value }]); },
    hidden(value) { document.hidden = value; documentEvents.visibilitychange(); },
    get pending() { return pending.size; },
  };
}

test("game reuses sprite paths and avoids per-frame computed styles", () => {
  const game = gameHarness();
  game.start();
  game.step();
  const first = { ...game.calls };
  assert(first.pathDots > 0, "Initial sprite geometry should be built");
  for (let i = 0; i < 10; i++) game.step();
  assert.equal(game.calls.pathDots, first.pathDots, "Dot geometry must be cached");
  assert.equal(game.calls.styles, first.styles, "No styles should be read during frames");
  assert.equal((game.calls.fills - first.fills) / 10, 16, "One fill per alien/player, not per dot");
  assert.equal(game.pending, 1, "Only one animation loop should run");
});

test("game suspends offscreen/hidden and resumes without duplicate loops", () => {
  const game = gameHarness();
  game.start();
  game.step();
  game.visible(false);
  const clears = game.calls.clears;
  assert.equal(game.pending, 0);
  for (let i = 0; i < 30; i++) game.step();
  assert.equal(game.calls.clears, clears);
  assert.equal(game.window.__invaders.state().mode, "play");
  game.visible(true);
  assert.equal(game.pending, 1);
  game.step();
  assert(game.calls.clears > clears);
  game.hidden(true);
  assert.equal(game.pending, 0);
  game.hidden(false);
  assert.equal(game.pending, 1);
  game.start();
  assert.equal(game.pending, 1);
});

test("optimized ink dilation matches the original mask exactly, including edges", () => {
  const source = readFileSync(new URL("../js/fluted.js", import.meta.url), "utf8");
  const algorithm = source.slice(
    source.indexOf("  // A separable maximum"),
    source.indexOf("  for (let p = 0, i = 0; p < values.length;"),
  );
  assert(algorithm.includes("inkHorizontal"));
  for (const [width, height] of [[1, 1], [1, 9], [9, 1], [11, 7], [140, 90]]) {
    const original = Uint8Array.from({ length: width * height }, (_, i) => (i * 79 + i % 7) % 256);
    const expected = original.map((_, p) => {
      const y = Math.floor(p / width), x = p % width;
      let max = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
          max = Math.max(max, original[yy * width + xx]);
        }
      }
      return max;
    });
    const values = original.slice();
    runInNewContext(algorithm, { width, height, values, inkHorizontal: new Uint8Array(values.length) });
    assert.deepEqual(values, expected, `${width}x${height} ink should be visually identical`);
  }
});
