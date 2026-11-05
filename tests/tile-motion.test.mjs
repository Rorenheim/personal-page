import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/widgets.js", import.meta.url), "utf8");
const helpers = source.slice(
  source.indexOf('  const reducedMotion ='),
  source.indexOf("  // Runs a glyph's springs"),
);

function setup({ touch = false, reduced = false, narrow = false } = {}) {
  const handlers = {};
  let intersection;
  let active = false;
  let enters = 0;
  let leaves = 0;
  class Observer {
    constructor(callback) { intersection = callback; }
    observe() {}
    disconnect() {}
  }
  const window = {
    IntersectionObserver: Observer,
    matchMedia(query) {
      return {
        matches: query.includes("reduced") ? reduced
          : query.includes("max-width") ? narrow
          : query.includes("none") ? touch : !touch,
        addEventListener() {},
      };
    },
  };
  runInNewContext(helpers, {
    window, document: { hidden: false, addEventListener() {} },
    IntersectionObserver: Observer,
  });
  const trigger = {
    classList: { toggle(_name, value) { active = value; } },
    addEventListener(name, handler) { handlers[name] = handler; },
    matches() { return false; },
  };
  window.watchTileMotion(trigger, {
    enter() { enters++; },
    leave() { leaves++; },
  });
  return {
    handlers,
    intersect(visible) {
      intersection([{ target: trigger, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
    },
    get state() { return { active, enters, leaves }; },
  };
}

test("desktop mouse hover starts and stops the existing animation", () => {
  const tile = setup();
  tile.handlers.pointerenter({ pointerType: "mouse" });
  assert.deepEqual(tile.state, { active: true, enters: 1, leaves: 0 });
  tile.handlers.pointerleave({ pointerType: "mouse" });
  assert.deepEqual(tile.state, { active: false, enters: 1, leaves: 1 });
});

test("desktop does not animate tiles just because they are on screen", () => {
  const tile = setup();
  tile.intersect(true);
  assert.deepEqual(tile.state, { active: false, enters: 0, leaves: 0 });
});

test("mobile layout ignores hover and plays a tile while it is on screen", () => {
  const tile = setup({ narrow: true });
  tile.handlers.pointerenter({ pointerType: "mouse" });
  assert.deepEqual(tile.state, { active: false, enters: 0, leaves: 0 });
  tile.intersect(true);
  assert.deepEqual(tile.state, { active: true, enters: 1, leaves: 0 });
  tile.intersect(false);
  assert.deepEqual(tile.state, { active: false, enters: 1, leaves: 1 });
});

test("touch devices play a tile while it is on screen and stop when it leaves", () => {
  const tile = setup({ touch: true });
  tile.handlers.pointerenter({ pointerType: "touch" });
  assert.deepEqual(tile.state, { active: false, enters: 0, leaves: 0 }, "Touches never start motion");
  tile.intersect(true);
  assert.deepEqual(tile.state, { active: true, enters: 1, leaves: 0 });
  tile.handlers.pointerleave({ pointerType: "touch" });
  assert.equal(tile.state.active, true, "Lifting a finger does not stop a visible tile");
  tile.intersect(false);
  assert.deepEqual(tile.state, { active: false, enters: 1, leaves: 1 });
  assert.equal(tile.handlers.click, undefined, "Navigation is never intercepted");
});

test("reduced motion does not register animation triggers", () => {
  const tile = setup({ touch: true, reduced: true });
  assert.deepEqual(Object.keys(tile.handlers), []);
  tile.intersect(true);
  assert.equal(tile.state.active, false);
});
