// Native media, preserved interactive exceptions, and zero subpage WebGL.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { openBrowser, sleep } from "./browser.mjs";

const browser = await openBrowser();
const { send, evaluate, until, navigate, errors } = browser;
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/");
  await until('!document.documentElement.classList.contains("is-loading") && !!document.querySelector(".baked-project-poster")');
  async function hover(name) {
    const box = await evaluate(`(() => {
      const el = document.querySelector('[data-glyph="${name}"]').closest(".card-links a, .card");
      el.scrollIntoView({block:"center",behavior:"instant"});
      const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...box });
  }
  for (const name of ["about", "work", "principles", "books", "linkedin", "github", "mail"]) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    const selector = `[data-glyph="${name}"]`;
    const before = await evaluate(`document.querySelector('${selector} svg').innerHTML`);
    await hover(name);
    await until(`document.querySelector('${selector}').classList.contains("has-baked-motion")`);
    const source = await evaluate(`document.querySelector('${selector} .baked-motion').getAttribute("src")`);
    assert(source.endsWith(`${name}.webp`), `${name} must use baked media`);
    await sleep(150);
    assert.equal(await evaluate(`document.querySelector('${selector} svg').innerHTML`), before,
      `${name} must not re-rasterize SVG dots at runtime`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await until(`!document.querySelector('${selector} .baked-motion')`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${selector} svg')).visibility`), "visible");
  }
  await hover("projects");
  await until('document.querySelector("[data-glyph=projects] video")?.currentTime > 0');
  assert.equal(await evaluate('document.querySelectorAll("[data-glyph=projects] canvas").length'), 0);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("generated-artifacts/prebaked-project.png", Buffer.from(shot.data, "base64"));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await until('!document.querySelector("[data-glyph=projects] video")');
  // The Blog illustration must still respond to the pointer, not use a clip.
  const blogBefore = await evaluate('document.querySelector("[data-glyph=blog] svg").innerHTML');
  await hover("blog");
  await until(`document.querySelector("[data-glyph=blog] svg").innerHTML !== ${JSON.stringify(blogBefore)}`);
  assert.equal(await evaluate('document.querySelectorAll("[data-glyph=blog] .baked-motion").length'), 0);
  assert(await evaluate('!!document.querySelector("#field canvas")'), "Index background must retain its renderer");

  await navigate("/about.html");
  await until('document.querySelector("#field video")?.currentTime > 0');
  assert.equal(await evaluate('document.querySelectorAll("#field canvas").length'), 0);
  assert(await evaluate('document.querySelector("#field video").currentSrc.includes("drift-landscape")'));
  assert(!(await evaluate('performance.getEntriesByType("resource").some(r => /glass\\.js|paper-shaders/.test(r.name))')),
    "Subpages must not load the shader renderer");
  const time = await evaluate('document.querySelector("#field video").currentTime');
  await until(`document.querySelector("#field video").currentTime > ${time}`);

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await until('document.querySelector("#field video").currentSrc.includes("drift-portrait") && document.querySelector("#field video").currentTime > 0');
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until('document.querySelector("#field video").paused && !document.querySelector("#field video").getAttribute("src")');
  assert(await evaluate('document.querySelector("#field video").poster.includes("drift-portrait")'));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await until('document.querySelector("#field video").currentTime > 0');
  const subpageShot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("generated-artifacts/prebaked-subpage.png", Buffer.from(subpageShot.data, "base64"));
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log("PASS: baked desktop tiles, native rocket playback, hover cleanup, live Blog, unchanged index renderer, native subpage backgrounds, portrait selection and reduced motion");
} finally {
  await browser.close();
}
