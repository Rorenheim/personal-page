// Pixel/geometry equivalence checks and focused CPU microbenchmarks.
// Node 22+: node tests/render-performance.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createInkMask } from "../js/ink-mask.js";

function referenceMask(pixels, width, height) {
  const values = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < values.length; p++, i += 4) {
    const luma = (pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722) / 255;
    const t = Math.min(1, Math.max(0, (luma - .28) / (.62 - .28)));
    values[p] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
  }
  const grown = new Uint8Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
          max = Math.max(max, values[yy * width + xx]);
        }
      }
      grown[y * width + x] = max;
    }
  }
  for (let p = 0, i = 0; p < grown.length; p++, i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = grown[p];
    pixels[i + 3] = 255;
  }
}

const applyMask = createInkMask();
let seed = 2026;
function image(width, height) {
  return Uint8ClampedArray.from({ length: width * height * 4 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  });
}
for (const [w, h] of [[1, 1], [1, 9], [9, 1], [2, 2], [64, 140], [249, 140], [64, 140]]) {
  const pixels = image(w, h);
  const expected = pixels.slice();
  referenceMask(expected, w, h);
  applyMask(pixels, w, h);
  assert.deepEqual(pixels, expected, `${w}×${h} mask must be byte-identical`);
}
console.log("PASS: text-mask pixels match the original algorithm, including edges and resize");

function medianTime(fn, count = 100) {
  for (let i = 0; i < 15; i++) fn();
  const batches = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) fn();
    batches.push((performance.now() - start) / count);
  }
  return batches.sort((a, b) => a - b)[2];
}
const originalPixels = image(249, 140);
const work = originalPixels.slice();
const oldTime = medianTime(() => { work.set(originalPixels); referenceMask(work, 249, 140); });
const newTime = medianTime(() => { work.set(originalPixels); applyMask(work, 249, 140); });
console.log(JSON.stringify({ maskCpuMilliseconds: { before: oldTime, after: newTime }, speedup: oldTime / newTime }));

// Exercise the real renderer with its real source glyphs, replacing only DOM
// commits with a string collector. The snapshot predates these optimizations.
function renderer(file) {
  const source = readFileSync(file, "utf8");
  let body = source.slice(source.indexOf("  const SAMPLES ="), source.indexOf("  function spring("));
  body = body.slice(0, body.indexOf("  function commit("))
    + "function commit(target, out) { target.out = out; }\n"
    + body.slice(body.indexOf("  function trace("));
  return runInNewContext(
    source.slice(0, source.indexOf('  document.querySelectorAll("[data-glyph]")'))
    + body
    + "return {part, render, rows:[ABOUT,WORK,BLOG,BOOKS,PRINCIPLES,INVADER,LINKEDIN,GITHUB,MAIL]}; })()",
    { Math, Map, Set, Int16Array, Uint16Array },
  );
}
function cases(api, visit) {
  api.rows.forEach((rows) => {
    const chars = [...new Set(rows.join("").replaceAll(".", ""))];
    const layers = chars.map(char => ({
      cells: rows.flatMap((line, y) => [...line].flatMap((c, x) => c === char ? [[x, y]] : [])),
    }));
    const width = Math.max(...rows.map(row => row.length));
    for (const mode of ["cover", "solid", "trace"]) {
      const target = api.part(layers, [width / 2, rows.length / 2], null, mode);
      for (let i = 0; i < 24; i++) {
        api.render(target, width, {
          angle: Math.sin(i) * .7, tx: Math.cos(i) * 3, ty: Math.sin(i * 2) * 2,
          sx: i % 7 === 0 ? .8 : 1, sy: i % 5 === 0 ? -.8 : i % 7 === 0 ? .001 : 1,
        });
        visit(target.out);
      }
    }
  });
}
function digest(api) {
  const hash = createHash("sha256");
  cases(api, out => hash.update(JSON.stringify(out)));
  return hash.digest("hex");
}
const current = renderer(new URL("../js/widgets.js", import.meta.url));
const currentDigest = digest(current);
if (process.env.BASELINE_WIDGETS) {
  const before = renderer(process.env.BASELINE_WIDGETS);
  const originalDigest = digest(before);
  assert.equal(currentDigest, originalDigest, "All glyph poses must render identical dot geometry");
  console.log("Original geometry checksum:", originalDigest);
  const beforeMs = medianTime(() => cases(before, () => {}), 1);
  const afterMs = medianTime(() => cases(current, () => {}), 1);
  console.log(JSON.stringify({ glyphRasterCpuMilliseconds: { before: beforeMs, after: afterMs }, speedup: beforeMs / afterMs }));
} else {
  assert.equal(currentDigest, "c337a72919bdf6a57c7a04a900332dadc9d2459ba82e142c202d6a23d46a906c");
}
console.log("PASS: 648 animated glyph poses preserve exact dot geometry");
