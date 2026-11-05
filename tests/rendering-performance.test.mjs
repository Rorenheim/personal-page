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
  const source = readFileSync(new URL("../js/ink-mask.js", import.meta.url), "utf8");
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

function styleRecorder() {
  const writes = [];
  return {
    writes,
    setProperty(name, value) { writes.push([name, value]); },
  };
}

// ink-mask.js as plain script, so the page and worker sources can run in a vm.
const maskSource = readFileSync(new URL("../js/ink-mask.js", import.meta.url), "utf8")
  .replaceAll("export function", "function");

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

// Every frame is uniform grey; changing the shade changes the mask.
function frameSource(state, offset = 0) {
  return (w, h) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i + 1] = data[i + 2] = state.shade + offset;
      data[i + 3] = 255;
    }
    return { data };
  };
}

// Runs js/ink-worker.js in its own context, connected like a real worker.
function workerHarness(state, calls, offset) {
  const source = readFileSync(new URL("../js/ink-worker.js", import.meta.url), "utf8")
    .replace(/^import .*$/m, maskSource);
  const read = frameSource(state, offset);
  return class {
    constructor() {
      this.listeners = {};
      calls.workers++;
      const self = { postMessage: (data) => setTimeout(() => this.listeners.message?.({ data }), 0) };
      class OffscreenCanvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() {
          return { clearRect() {}, drawImage() {}, putImageData() {}, getImageData: (x, y, w, h) => read(w, h) };
        }
        convertToBlob() { calls.workerEncodes++; return Promise.resolve({ blob: calls.workerEncodes }); }
      }
      runInNewContext(source, { self, OffscreenCanvas });
      this.self = self;
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    postMessage(data) { setTimeout(() => this.self.onmessage({ data }), 0); }
    terminate() { calls.terminated++; }
  };
}

async function inkHarness({ worker = false, workerOffset = 0 } = {}) {
  const source = readFileSync(new URL("../js/fluted.js", import.meta.url), "utf8")
    .replace(/^import .*glass.*$/m, "")
    .replace(/^import .*ink-mask.*$/m, maskSource)
    .replaceAll("import.meta.url", JSON.stringify("http://site/js/fluted.js"));
  const calls = { encodes: 0, measures: 0, workers: 0, workerEncodes: 0, terminated: 0, revoked: [] };
  const state = { shade: 100 };
  const frames = [];
  const windowEvents = {};
  let nearby;
  let videoFrame;
  let seedLoad;
  let blobs = 0;
  const read = frameSource(state);
  const inkText = Array.from({ length: 3 }, (_, index) => ({
    style: styleRecorder(),
    getBoundingClientRect() {
      calls.measures++;
      return { left: 40, top: 200 + index * 900 - window.scrollY };
    },
  }));
  const root = { style: styleRecorder(), classList: { add() {} } };
  const video = {
    readyState: 4, videoWidth: 960, videoHeight: 720, style: {},
    setAttribute() {}, addEventListener() {},
    play() { return Promise.resolve(); },
    requestVideoFrameCallback(fn) { videoFrame = fn; },
  };
  function canvas() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          clearRect() {}, drawImage() {}, putImageData() {},
          getImageData: (x, y, w, h) => read(w, h),
        };
      },
      toDataURL() { calls.encodes++; return `data:image/png;base64,${calls.encodes}`; },
    };
  }
  class Image {
    complete = false;
    naturalWidth = 0;
    addEventListener(type, fn) { if (type === "load" && !seedLoad) seedLoad = fn; }
  }
  const document = {
    hidden: false,
    documentElement: root,
    body: { append() {} },
    getElementById() { return {}; },
    createElement(tag) { return tag === "video" ? video : canvas(); },
    querySelectorAll() { return inkText; },
    querySelector() { return null; },
    addEventListener() {},
    dispatchEvent() {},
  };
  class Intersection {
    constructor(callback) { nearby = callback; }
    observe() {}
  }
  class Observer { observe() {} }
  const window = {
    innerWidth: 1440,
    innerHeight: 900,
    scrollX: 0,
    scrollY: 0,
    matchMedia() { return { matches: false, addEventListener() {} }; },
    addEventListener(type, fn) { windowEvents[type] = fn; },
    IntersectionObserver: Intersection,
    ResizeObserver: Observer,
  };
  class PageURL extends URL {
    static createObjectURL() { blobs += 1; return `blob:${blobs}`; }
    static revokeObjectURL(url) { calls.revoked.push(url); }
  }
  const workerGlobals = worker ? {
    Worker: workerHarness(state, calls, workerOffset),
    OffscreenCanvas: class {},
    createImageBitmap: () => Promise.resolve({ close() {} }),
  } : {};
  runInNewContext(source, {
    window, document, Image, URL: PageURL, Event: class {},
    performance: { now: () => 0 },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    IntersectionObserver: Intersection,
    ResizeObserver: Observer,
    MutationObserver: Observer,
    mountGlass: () => ({
      draw: () => Promise.resolve(),
      compiled: Promise.resolve(false),
      idle: () => Promise.resolve(),
    }),
    ...workerGlobals,
  });
  seedLoad();
  await flush();
  return {
    calls, inkText, root, window, state,
    videoFrame(shade = state.shade + 3) {
      state.shade = shade;
      videoFrame(0);
    },
    nearby(visible) {
      nearby(inkText.map((target, index) => ({ target, isIntersecting: visible.includes(index) })));
    },
    scroll(y) {
      window.scrollY = y;
      windowEvents.scroll();
      while (frames.length) frames.shift()(0);
    },
  };
}

const lastWrite = (el, name) => el.style.writes.filter(([key]) => key === name).at(-1)?.[1];

test("ink mask is scoped to the ink text and pauses while that text is offscreen", async () => {
  const page = await inkHarness();
  assert.equal(page.calls.encodes, 0, "No ink text is near the screen yet");
  page.nearby([0]);
  assert.equal(page.calls.encodes, 1, "Text returning to view is refreshed immediately");
  for (let i = 0; i < 5; i++) page.videoFrame();
  assert.equal(page.calls.encodes, 6);
  const expected = `url("data:image/png;base64,6"), url("data:image/png;base64,5")`;
  assert(page.inkText.every((el) => lastWrite(el, "--ink") === expected), "New mask over the previous one");
  assert(!page.root.style.writes.some(([name]) => name === "--ink"), "--ink must not be set on <html>");
  page.nearby([]);
  for (let i = 0; i < 5; i++) page.videoFrame();
  assert.equal(page.calls.encodes, 6, "Offscreen text must not rebuild the mask");
});

test("an unchanged mask is not encoded or restyled again", async () => {
  const page = await inkHarness();
  page.nearby([0]);
  const writes = page.inkText[0].style.writes.length;
  for (let i = 0; i < 5; i++) page.videoFrame(page.state.shade);
  assert.equal(page.calls.encodes, 1);
  assert.equal(page.inkText[0].style.writes.length, writes);
  page.videoFrame();
  assert.equal(page.calls.encodes, 2, "A changed frame is encoded");
});

test("verified worker builds the masks and old mask URLs are released", async () => {
  const page = await inkHarness({ worker: true });
  page.nearby([0]);
  assert.equal(page.calls.encodes, 1, "The first mask is built on the page while the worker is checked");
  await flush();
  for (let i = 0; i < 4; i++) {
    page.videoFrame();
    await flush();
  }
  assert.equal(page.calls.encodes, 1, "Verified worker takes over; the page encodes nothing");
  assert.equal(page.calls.workerEncodes, 4);
  assert.equal(lastWrite(page.inkText[0], "--ink"), `url("blob:4"), url("blob:3")`);
  assert.deepEqual(page.calls.revoked, ["blob:1", "blob:2"], "Only the two URLs in use stay alive");
  page.videoFrame(page.state.shade);
  await flush();
  assert.equal(page.calls.workerEncodes, 4, "The worker skips an unchanged mask too");
});

test("a worker that does not reproduce the page mask exactly is not used", async () => {
  const page = await inkHarness({ worker: true, workerOffset: 1 });
  page.nearby([0]);
  for (let i = 0; i < 4; i++) {
    await flush();
    page.videoFrame();
  }
  await flush();
  assert.equal(page.calls.terminated, 1, "Three mismatches stop the worker");
  assert.equal(page.calls.workerEncodes, 0);
  const encodes = page.calls.encodes;
  page.videoFrame();
  assert.equal(page.calls.encodes, encodes + 1, "The page keeps building masks itself");
});

test("ink text positions follow scrolling without re-measuring layout", async () => {
  const page = await inkHarness();
  page.nearby([0, 1, 2]);
  const measures = page.calls.measures;
  assert.equal(lastWrite(page.inkText[1], "--ink-y"), "1100px");
  for (const y of [120, 640, 1333.5]) {
    page.scroll(y);
    page.inkText.forEach((el, index) => {
      assert.equal(lastWrite(el, "--ink-y"), `${200 + index * 900 - y}px`);
      assert.equal(lastWrite(el, "--ink-x"), "40px");
    });
  }
  assert.equal(page.calls.measures, measures, "Scrolling must reuse cached page offsets");
  page.nearby([]);
  const writes = page.inkText[0].style.writes.length;
  page.scroll(2000);
  assert.equal(page.inkText[0].style.writes.length, writes, "Offscreen text is not repositioned");
});

function cursorHarness() {
  const source = readFileSync(new URL("../js/cursor.js", import.meta.url), "utf8");
  const frames = [];
  const listeners = {};
  const created = [];
  function element() {
    const counts = { transform: 0, opacity: 0 };
    const values = {};
    const style = {};
    for (const key of Object.keys(counts)) {
      Object.defineProperty(style, key, {
        get: () => values[key],
        set: (value) => { counts[key]++; values[key] = value; },
      });
    }
    const classes = new Set();
    const el = {
      counts, style, classes,
      setAttribute() {},
      remove() {},
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      },
    };
    created.push(el);
    return el;
  }
  const document = {
    documentElement: { classList: { add() {}, remove() {} }, addEventListener(type, fn) { listeners[`root:${type}`] = fn; } },
    body: { appendChild() {} },
    createElement: element,
  };
  const window = {
    matchMedia(query) { return { matches: !query.includes("reduced-motion"), addEventListener() {} }; },
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  let now = 0;
  runInNewContext(source, {
    window, document,
    performance: { now: () => now },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
  });
  const [head, ...dots] = created;
  return {
    head, dots, frames,
    listens(type) { return type in listeners; },
    move(type, x, y) { listeners[type]({ type, pointerType: "mouse", clientX: x, clientY: y }); },
    leave() { listeners["root:pointerleave"](); },
    frame(ms = 16) {
      now += ms;
      const pending = frames.splice(0);
      pending.forEach((fn) => fn(now));
    },
  };
}

test("cursor writes styles at most once per frame and keeps the same trail", () => {
  const cursor = cursorHarness();
  assert.equal(cursor.listens("pointerrawupdate"), false, "High-rate raw events are not needed");
  for (const [x, y] of [[0, 0], [5, 3], [40, 30], [42, 31], [80, 60]]) cursor.move("pointermove", x, y);
  assert.equal(cursor.head.counts.transform, 0, "No styles are written inside input events");
  assert.equal(cursor.frames.length, 1, "One frame is scheduled for many events");
  cursor.frame();
  assert.equal(cursor.head.counts.transform, 1);
  assert.equal(cursor.head.style.transform, "translate3d(80px,60px,0)");
  assert(cursor.head.classes.has("is-on"));
  const trail = cursor.dots.filter((dot) => dot.counts.transform === 1);
  assert.equal(trail.length, 3, "Each move beyond the gap still drops a trail dot");
  assert.deepEqual(trail.map((dot) => dot.style.transform), [
    "translate3d(0px,0px,0)", "translate3d(40px,30px,0)", "translate3d(80px,60px,0)",
  ]);
  for (let i = 0; i < 40; i++) cursor.frame();
  assert(cursor.dots.every((dot) => dot.style.opacity === undefined || dot.style.opacity === "0"), "Trail fades out");
  assert.equal(cursor.frames.length, 0, "The loop stops once the trail has faded");
  cursor.leave();
  cursor.frame();
  assert(!cursor.head.classes.has("is-on"));
});
