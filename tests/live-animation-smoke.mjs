import assert from "node:assert/strict";
import { openBrowser } from "./browser.mjs";

const browser = await openBrowser();
const { send, evaluate, until, navigate, errors } = browser;
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/");
  await until('!document.documentElement.classList.contains("is-loading") && !!document.querySelector("[data-glyph=projects] canvas")');
  for (const name of ["about", "work", "principles", "books", "linkedin", "github", "mail", "blog"]) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    const selector = `[data-glyph="${name}"]`;
    const before = await evaluate(`document.querySelector('${selector} svg').innerHTML`);
    const point = await evaluate(`(() => {
      const el = document.querySelector('${selector}').closest(".card-links a, .card");
      el.scrollIntoView({block:"center",behavior:"instant"});
      const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await until(`document.querySelector('${selector} svg').innerHTML !== ${JSON.stringify(before)}`);
  }
  const point = await evaluate(`(() => {
    const el = document.querySelector(".card-feature");
    el.scrollIntoView({block:"center",behavior:"instant"});
    const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  const rest = await evaluate('document.querySelector("[data-glyph=projects] canvas").style.transform');
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await until(`document.querySelector("[data-glyph=projects] canvas").style.transform !== ${JSON.stringify(rest)}`);
  assert.equal(await evaluate('document.querySelectorAll(".glyph img, .glyph video").length'), 0);
  assert(!(await evaluate('performance.getEntriesByType("resource").some(r=>r.name.includes("assets/animations/"))')));
  await navigate("/about.html");
  await until('!!document.querySelector("#field canvas")');
  assert.equal(await evaluate('document.querySelectorAll("#field video").length'), 0);
  assert(!(await evaluate('performance.getEntriesByType("resource").some(r=>r.name.includes("prebaked"))')));
  assert.deepEqual(errors, []);
  console.log("PASS: live SVG tile hover animations, rocket canvas motion, live subpage background, no prebaked media requests");
} finally {
  await browser.close();
}
