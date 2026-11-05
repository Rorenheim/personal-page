// Offline renderer: run with Node 22+, Chromium and ffmpeg available.
// --snapshot saves the original procedural renderers before the first migration.
// Original sources are never loaded by the live prebaked tile/background paths.
import { spawn, spawnSync } from "node:child_process";
import { constants, renameSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const work = join(root, "generated-artifacts", "animation-bake");
const assets = join(root, "assets", "animations");
const sources = join(root, "scripts", "animation-sources");
const projectsOnly = process.argv.includes("--projects-only");
await Promise.all([work, assets, sources].map((path) => mkdir(path, { recursive: true })));
if (process.argv.includes("--snapshot")) {
  for (const name of ["widgets", "sky", "drift"]) {
    await copyFile(join(root, "js", `${name}.js`), join(sources, `${name}.js`), constants.COPYFILE_EXCL);
  }
}
const originals = Object.fromEntries(await Promise.all(["widgets", "sky", "drift"].map(async (name) =>
  [name, await readFile(join(sources, `${name}.js`), "utf8")])));
const base = process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const profile = await mkdtemp(join(tmpdir(), "portfolio-bake-"));
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
  "--remote-debugging-port=9227", `--user-data-dir=${profile}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank",
], { stdio: "ignore" });
let socket;
let serial = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 120000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function page(html, width, height, mobile = false) {
  await writeFile(join(work, "page.html"), html);
  await evaluate("window.__bakeReady = false");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  await send("Page.navigate", { url: `${base}/generated-artifacts/animation-bake/page.html?${Date.now()}` });
  for (let i = 0; i < 1200; i++) {
    if (await evaluate("window.__bakeReady === true")) return;
    await sleep(100);
  }
  throw new Error("Baking page did not become ready");
}
function ffmpeg(args) {
  const destination = args.at(-1);
  const temporary = join(work, `encoded-${destination.split("/").at(-1)}`);
  args = [...args.slice(0, -1), temporary];
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { stdio: "inherit", timeout: 240000 });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.status}`);
  renameSync(temporary, destination);
}
async function saveFrame(directory, index, data) {
  await writeFile(join(directory, `${String(index).padStart(4, "0")}.png`),
    Buffer.from(data.slice(data.indexOf(",") + 1), "base64"));
}
const tileMedia = {};
try {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9227/json/list")).json(); } catch {}
    if (targets?.some((target) => target.type === "page")) break;
    await sleep(100);
  }
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  const head = '<base href="/"><link rel="stylesheet" href="css/styles.css">';
  if (!projectsOnly) {
  const widgets = originals.widgets.replace("  const DOT =", "  window.__tileBakes = new Map();\n  const DOT =")
    .replace("    if (reducedMotion || !trigger) return;", `    window.__tileBakes.set(host.dataset.glyph, {
      host, state, motion, width, draw,
      step(dt) { state.time += dt; motion.aim(state, dt); motion.springs.forEach(s => advance(s, dt)); draw(); }
    });
    return;`);
  const index = (await readFile(join(root, "index.html"), "utf8"))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace("<head>", `<head>${head}<style>*{transition:none!important}html,body{background:transparent}</style>`)
    .replace("</body>", `<script>${widgets}</script><script>
      document.fonts.ready.then(() => { window.__bakeReady = true; });
    </script></body>`);
  await page(index, 1440, 1000);
  // Rasterize the actual SVG paths after each original spring step, including
  // resolved accent colors. Padding retains dots that leave the original viewBox.
  await evaluate(`window.__raster = async function(name) {
    const entry = __tileBakes.get(name), svg = entry.host.querySelector("svg");
    const clone = svg.cloneNode(true), width = svg.viewBox.baseVal.width, height = svg.viewBox.baseVal.height;
    const nodes = [svg, ...svg.querySelectorAll("*")], copies = [clone, ...clone.querySelectorAll("*")];
    nodes.forEach((node, i) => {
      const style = getComputedStyle(node);
      ["fill", "stroke", "opacity", "stroke-width"].forEach(key => copies[i].style.setProperty(key, style.getPropertyValue(key)));
    });
    const pad = 2, scale = name === "linkedin" || name === "github" || name === "mail" ? 8 : 18;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", [-pad, -pad, width + pad * 2, height + pad * 2].join(" "));
    clone.setAttribute("width", (width + pad * 2) * scale);
    clone.setAttribute("height", (height + pad * 2) * scale);
    clone.style.cssText += ";width:" + (width + pad * 2) * scale + "px;height:" + (height + pad * 2) * scale + "px";
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type:"image/svg+xml"});
    const url = URL.createObjectURL(blob), image = new Image();
    image.src = url; await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = (width + pad * 2) * scale; canvas.height = (height + pad * 2) * scale;
    canvas.getContext("2d").drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    return {data:canvas.toDataURL(), width, height, pad};
  }`);
  for (const name of ["about", "work", "principles", "books", "linkedin", "github", "mail"]) {
    const directory = join(work, name);
    await mkdir(directory, { recursive: true });
    const info = await evaluate(`__raster(${JSON.stringify(name)})`);
    const loop = name === "about" || name === "github";
    // Warm periodic motion into its stable orbit before recording a whole
    // number of cycles; one-shot animations retain their final hover pose.
    await evaluate(`(() => {
      const e = __tileBakes.get("${name}");
      e.host.closest(".card-links a, .card").classList.add("is-motion-active");
      e.state.hovering = true; e.motion.enter?.(e.state);
      ${loop ? 'for(let i=0;i<180;i++) e.step(1/60);' : ""}
    })()`);
    const seconds = name === "about" ? Math.PI * 2 / 9 * 3 : name === "github" ? Math.PI * 2 / 13 * 4 : 2;
    const frames = Math.round(seconds * 30);
    for (let i = 0; i < frames; i++) {
      await evaluate(`__tileBakes.get("${name}").step(${seconds / frames})`);
      await saveFrame(directory, i, (await evaluate(`__raster("${name}")`)).data);
    }
    ffmpeg(["-framerate", String(frames / seconds), "-i", join(directory, "%04d.png"),
      "-c:v", "libwebp_anim", "-quality", "86", "-compression_level", "5", "-loop", loop ? "0" : "1",
      join(assets, `${name}.webp`)]);
    tileMedia[name] = { src: `assets/animations/${name}.webp`, width: info.width, height: info.height, pad: info.pad };
    console.log(`Baked ${name}: ${frames} frames`);
  }
  }
  const sky = originals.sky.replace("  let resizeTimer = 0;", `  window.__skyBake = {
      step(now) { tick(now); }, activate() { hovering = true; last = 0; }, canvas, layout
    };
    let resizeTimer = 0;`);
  await page(`<!doctype html><html><head>${head}<style>
    html,body{margin:0;background:transparent!important}
    .card.card-feature{width:600px;height:700px;border-radius:0;background:transparent!important}
    .card h2{visibility:hidden}*{transition:none!important}
  </style></head><body><a class="card card-feature"><div class="glyph" data-glyph="projects"></div>
    <h2>Passion projects</h2></a><script>
    window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
    window.watchTileMotion=()=>{};
  </script><script>${sky}</script><script>
    document.fonts.ready.then(()=>{ window.__bakeReady=true; });
  </script></body></html>`, 600, 700);
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  // Capture the original 600×700 CSS composition at 2× pixel density. The
  // resulting 1200×1400 video preserves sharp particles on high-DPR displays.
  await send("Emulation.setDeviceMetricsOverride", { width: 600, height: 700, deviceScaleFactor: 2, mobile: false });
  await evaluate("__skyBake.layout()");
  const canvasSize = await evaluate("({dpr:devicePixelRatio,width:__skyBake.canvas.width,height:__skyBake.canvas.height})");
  if (canvasSize.dpr !== 2 || canvasSize.width < 1400 || canvasSize.height < 1600) {
    throw new Error(`High-resolution rocket capture failed: ${JSON.stringify(canvasSize)}`);
  }
  const directory = join(work, "projects");
  await mkdir(directory, { recursive: true });
  let shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(work, "projects-poster.png"), Buffer.from(shot.data, "base64"));
  ffmpeg(["-i", join(work, "projects-poster.png"), "-c:v", "libwebp", "-quality", "92",
    join(assets, "projects-poster.webp")]);
  await evaluate("__skyBake.activate()");
  for (let i = 0; i < 90; i++) {
    await evaluate(`__skyBake.step(${(i + 1) * 1000 / 30})`);
    shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(directory, `${String(i).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
  }
  // A black-backed video can use compositor screen blending as transparency.
  // Correct the source colors for the existing #262626 hover background before
  // compositing alpha onto black, preserving the white and red artwork.
  // Unlike animated WebP, H.264 compresses the rocket's fine particle field well
  // and supports hardware video decoding.
  ffmpeg(["-framerate", "30", "-i", join(directory, "%04d.png"),
    "-filter_complex", "color=black:s=1200x1400:r=30:d=3[black];"
      + "[0:v]format=rgba,lutrgb=r='max(0,(val-38)*255/217)':g='max(0,(val-38)*255/217)':b='max(0,(val-38)*255/217)'[art];"
      + "[black][art]overlay=shortest=1:format=rgb,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0",
    "-c:v", "libx264", "-crf", "21", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an", join(assets, "projects.mp4")]);
  await rm(join(assets, "projects.webp"), { force: true });
  tileMedia.projects = { src: "assets/animations/projects.mp4", poster: "assets/animations/projects-poster.webp", video: true };
  console.log("Baked projects");

  if (!projectsOnly) {
  // Subpage drift: identical source drawing and glass shader, rendered offline.
  const driftDrawing = originals.drift.slice(originals.drift.indexOf('const FIELD ='), originals.drift.indexOf("resize();\nrender(0);"));
  for (const [name, width, height, mobile] of [
    ["landscape", 960, 540, false], ["portrait", 390, 844, true],
  ]) {
    const directory = join(work, `drift-${name}`);
    await mkdir(directory, { recursive: true });
    await page(`<!doctype html><html><head>${head}</head><body><div id="field"></div>
    <script type="module">
      import {mountGlass} from "/js/glass.js";
      const mobile=${mobile}, host=document.getElementById("field");
      ${driftDrawing}
      resize();render(0);
      const poster = new Image();poster.src=canvas.toDataURL();await poster.decode();
      const glass=mountGlass(host,poster);await glass.compiled;
      window.__driftBake=async(seconds)=>{
        render(seconds);await glass.draw(canvas,canvas.width,canvas.height);
        return glass.mount.canvasElement.toDataURL();
      };
      window.__bakeReady=true;
    </script></body></html>`, width, height, mobile);
    for (let i = 0; i < 240; i++) {
      await saveFrame(directory, i, await evaluate(`__driftBake(${i / 12})`));
      if (i % 60 === 0) console.log(`Drift ${name}: ${i}/240`);
    }
    ffmpeg(["-i", join(directory, "0000.png"), "-vf", `scale=${width}:${height}`,
      "-c:v", "libwebp", "-quality", "90", join(assets, `drift-${name}.webp`)]);
    ffmpeg(["-framerate", "12", "-i", join(directory, "%04d.png"),
      "-filter_complex", `[0:v]scale=${width}:${height},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,fps=24`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-an", join(assets, `drift-${name}.mp4`)]);
    console.log(`Baked drift ${name}`);
  }
  }
  const manifestPath = join(root, "js", "prebaked-media.js");
  const previousManifest = await readFile(manifestPath, "utf8");
  const existingTiles = projectsOnly
    ? JSON.parse(previousManifest.match(/export const tiles = (\{[\s\S]*?\});\nexport const backgrounds =/)[1])
    : {};
  existingTiles.projects = tileMedia.projects;
  const backgroundsSource = previousManifest.slice(previousManifest.indexOf("export const backgrounds ="));
  await writeFile(manifestPath, "// Generated by scripts/bake-animations.mjs. Explicit URLs are fingerprinted by the CDN build.\n"
    + `export const tiles = ${JSON.stringify(existingTiles, null, 2)};\n${backgroundsSource}`);
} finally {
  socket?.close();
  browser.kill();
  await Promise.race([
    new Promise((done) => browser.once("exit", done)),
    sleep(2000),
  ]);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
