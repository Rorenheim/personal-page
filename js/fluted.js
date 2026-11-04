import { mountGlass } from "./glass.js";
import { createInkMask } from "./ink-mask.js";

const host = document.getElementById("field");
if (!host) throw new Error("Missing #field");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const touchMotion = window.matchMedia("(hover: none), (pointer: coarse)");

const video = document.createElement("video");
video.src = new URL("../Silhouette calm background loop _40 s_.mp4", import.meta.url).href;
video.muted = true;
video.defaultMuted = true;
video.loop = !reducedMotion;
video.playsInline = true;
video.autoplay = true;
video.preload = "auto";
video.setAttribute("playsinline", "");
video.setAttribute("muted", "");
video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
document.body.append(video);

const ink = document.createElement("canvas");
const inkCtx = ink.getContext("2d", { willReadFrequently: true });
const applyInkMask = createInkMask();
const inkElements = Array.from(document.querySelectorAll(".ink"), (el) => ({ el, x: NaN, y: NaN }));
let inkReady = false;

function resizeInk() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const width = Math.max(1, Math.round(140 * aspect));
  if (ink.height !== 140 || ink.width !== width) {
    ink.height = 140;
    ink.width = width;
  }
}

function placeInk() {
  // Read all positions before writing styles to avoid layout thrashing on scroll.
  const positions = inkElements.map((entry) => {
    const rect = entry.el.getBoundingClientRect();
    return { entry, x: rect.left, y: rect.top };
  });
  positions.forEach(({ entry, x, y }) => {
    if (entry.x !== x) entry.el.style.setProperty("--ink-x", `${x}px`);
    if (entry.y !== y) entry.el.style.setProperty("--ink-y", `${y}px`);
    entry.x = x;
    entry.y = y;
  });
}

function updateInk(source, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) return;
  const width = ink.width;
  const height = ink.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  inkCtx.clearRect(0, 0, width, height);
  inkCtx.filter = "blur(7px)";
  inkCtx.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
  inkCtx.filter = "none";
  const frame = inkCtx.getImageData(0, 0, width, height);
  applyInkMask(frame.data, width, height);
  inkCtx.putImageData(frame, 0, 0);
  document.documentElement.style.setProperty("--ink", `url("${ink.toDataURL("image/png")}")`);
  if (!inkReady) {
    inkReady = true;
    document.documentElement.classList.add("ink-live");
    scheduleInkPlacement();
  }
}

resizeInk();
window.addEventListener("resize", () => {
  resizeInk();
  scheduleInkPlacement();
});
let inkScrollFrame = 0;
function scheduleInkPlacement() {
  if (inkScrollFrame) return;
  inkScrollFrame = requestAnimationFrame(() => {
    inkScrollFrame = 0;
    placeInk();
  });
}
window.addEventListener("scroll", scheduleInkPlacement, { passive: true });
if (document.fonts) document.fonts.ready.then(scheduleInkPlacement);
const inkResizeObserver = new ResizeObserver(scheduleInkPlacement);
inkElements.forEach(({ el }) => inkResizeObserver.observe(el));

const poster = new Image();
poster.decoding = "async";
poster.src = "assets/silhouette.png";

// A 1×1 image lets the shader start compiling before the poster arrives.
const seed = new Image();
seed.decoding = "async";
seed.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

let fieldReady = false;

function markFieldReady() {
  if (fieldReady) return;
  fieldReady = true;
  document.dispatchEvent(new Event("field-ready"));
}

function whenVideo() {
  if (video.readyState >= 4) return Promise.resolve(true);
  return new Promise((resolve) => {
    video.addEventListener("canplaythrough", () => resolve(true), { once: true });
    video.addEventListener("error", () => resolve(false), { once: true });
  });
}

function boot() {
  const glass = mountGlass(host, seed);
  let lastPaint = -Infinity;
  let lastInk = -Infinity;

  const upload = (now) => {
    if (video.readyState < 2) return;
    if (document.hidden || (touchMotion.matches && now - lastPaint < 1000 / 30)) return;
    lastPaint = now;
    glass.draw(video, video.videoWidth, video.videoHeight);
    // The ink mask does pixel sampling and PNG encoding; it need not run at
    // video frame rate on touch devices while the browser is also scrolling.
    if (!touchMotion.matches || now - lastInk >= 1000 / 15) {
      updateInk(video, video.videoWidth, video.videoHeight);
      lastInk = now;
    }
  };

  const paint = (now = performance.now()) => {
    upload(now);
    if (reducedMotion) return;
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(paint);
    } else {
      requestAnimationFrame(paint);
    }
  };

  (async () => {
    try {
      const linked = await glass.compiled;
      if (linked && poster.complete && poster.naturalWidth) {
        await glass.draw(poster, poster.naturalWidth, poster.naturalHeight);
        await glass.idle();
      }
      if (await whenVideo()) {
        paint();
        await glass.idle();
        video.play().catch(() => {});
      }
    } finally {
      markFieldReady();
    }
  })();
}

if (seed.complete && seed.naturalWidth) boot();
else seed.addEventListener("load", boot, { once: true });
seed.addEventListener("error", markFieldReady, { once: true });
