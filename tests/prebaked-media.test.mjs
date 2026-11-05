import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { tiles, backgrounds } from "../js/prebaked-media.js";

const root = new URL("../", import.meta.url);

test("all baked media is local, explicit, and lightweight", () => {
  assert.deepEqual(Object.keys(tiles).sort(),
    ["about", "books", "github", "linkedin", "mail", "principles", "projects", "work"]);
  assert(!tiles.blog && !tiles.invader);
  for (const item of [...Object.values(tiles), ...Object.values(backgrounds)]) {
    for (const path of [item.src, item.poster].filter(Boolean)) {
      assert(path.startsWith("assets/animations/"));
      assert(statSync(new URL(path, root)).size < 4 * 1024 * 1024, `Oversized clip: ${path}`);
    }
  }
  assert(tiles.projects.video && tiles.projects.src.endsWith(".mp4"));
});

test("rocket animation and reduced-motion poster are baked at 2× size", () => {
  const video = readFileSync(new URL(tiles.projects.src, root));
  const stsd = video.indexOf(Buffer.from("stsd"));
  const avc1 = video.indexOf(Buffer.from("avc1"), stsd);
  assert(stsd > 0 && avc1 > stsd, "Expected an H.264 video track");
  assert.equal(video.readUInt16BE(avc1 + 28), 1200, "Rocket video width");
  assert.equal(video.readUInt16BE(avc1 + 30), 1400, "Rocket video height");

  const poster = readFileSync(new URL(tiles.projects.poster, root));
  let dimensions;
  for (let offset = 12; offset + 8 <= poster.length;) {
    const kind = poster.toString("ascii", offset, offset + 4);
    const length = poster.readUInt32LE(offset + 4);
    if (kind === "VP8X") {
      const data = poster.subarray(offset + 8, offset + 8 + length);
      dimensions = [
        1 + data.readUIntLE(4, 3),
        1 + data.readUIntLE(7, 3),
      ];
      break;
    }
    offset += 8 + length + (length % 2);
  }
  assert.deepEqual(dimensions, [1200, 1400], "Reduced-motion poster must match the high-resolution video");
});

test("WebP animations preserve periodic versus one-shot hover playback", () => {
  for (const [name, media] of Object.entries(tiles)) {
    if (media.video) continue;
    const data = readFileSync(new URL(media.src, root));
    assert.equal(data.toString("ascii", 8, 12), "WEBP");
    let loopCount;
    let frames = 0;
    for (let offset = 12; offset + 8 <= data.length;) {
      const kind = data.toString("ascii", offset, offset + 4);
      const length = data.readUInt32LE(offset + 4);
      if (kind === "ANIM") loopCount = data.readUInt16LE(offset + 12);
      if (kind === "ANMF") frames++;
      offset += 8 + length + (length % 2);
    }
    assert(frames > 1, `${name} needs actual pre-rendered animation frames`);
    assert.equal(loopCount, ["about", "github"].includes(name) ? 0 : 1, name);
  }
});
