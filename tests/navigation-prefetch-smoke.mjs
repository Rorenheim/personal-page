import assert from "node:assert/strict";
import { openBrowser } from "./browser.mjs";

const browser = await openBrowser();
const { send, evaluate, until, navigate, errors } = browser;
try {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate("/");
  await until('!document.documentElement.classList.contains("is-loading")');
  await until('document.querySelectorAll(\'link[rel="prefetch"]\').length >= 15');
  await until('performance.getEntriesByType("resource").some((entry) => entry.name.includes("assets/projects/casseo1-640.jpg"))');
  assert(await evaluate('!!document.querySelector(\'link[rel="modulepreload"][href="js/drift.js"]\')'),
    "The shared subpage shader module is preloaded");
  assert(await evaluate('document.querySelectorAll(\'link[rel="prefetch"][as="image"]\').length === 4'),
    "The first projects carousel images are prefetched");

  await evaluate(`window.__homeInstance = "preserved";
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.__homeRestoredFromCache = true;
    });`);
  await evaluate('document.querySelector(\'a.card[href="about.html"]\').click()');
  await until('location.pathname.endsWith("/about.html") && !!document.querySelector("#field canvas")');
  await until('!!document.querySelector(".menu-toggle")');
  await evaluate('document.querySelector(".menu-toggle").click()');
  await evaluate('document.querySelector(\'#menu a[href="index.html"]\').click()');
  await until('location.pathname === "/" || location.pathname.endsWith("/index.html")');
  assert.equal(await evaluate("window.__homeInstance"), "preserved",
    "Returning home reuses the existing document");
  assert.equal(await evaluate("window.__homeRestoredFromCache"), true,
    "The browser restores the homepage from its back/forward cache");
  assert.deepEqual(errors, []);
  console.log("PASS: shader/project prefetches and cached homepage restoration");
} finally {
  await browser.close();
}
