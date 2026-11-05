import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../js/widgets.js", import.meta.url), "utf8");
const helpers = source.slice(
  source.indexOf('  const reducedMotion ='),
  source.indexOf("  // Runs a glyph's springs"),
);

function setup({ touch = false, reduced = false } = {}) {
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
        matches: query.includes("reduced") ? reduced : query.includes("none") ? touch : !touch,
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

test("touch devices register no hover, focus, or scroll animation triggers", () => {
  const tile = setup({ touch: true });
  assert.deepEqual(Object.keys(tile.handlers), []);
  assert.deepEqual(tile.state, { active: false, enters: 0, leaves: 0 });
  assert.equal(tile.handlers.click, undefined, "Navigation is never intercepted");
});

test("reduced motion does not register animation triggers", () => {
  const tile = setup({ touch: true, reduced: true });
  assert.deepEqual(Object.keys(tile.handlers), []);
  assert.equal(tile.state.active, false);
});
