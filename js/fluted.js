import { mountGlass } from "./glass.js";
import { drawInkSource, inkMask, sameBytes } from "./ink-mask.js";

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
const inkElements = Array.from(document.querySelectorAll(".ink"));
const inkPositions = new Map();
// Ink text within a viewport of the screen. Offscreen text needs no new mask.
const inkNearby = new Set("IntersectionObserver" in window ? [] : inkElements);
let inkPositionsDirty = true;
let inkLive = false;
let inkStale = false;
let inkValues = new Uint8Array(0);
let inkHorizontal = new Uint8Array(0);
let inkPrevious = null;
let inkShown = "";
const inkBlobs = [];
// "check" until the worker has matched this page's mask exactly, then "on".
// "off" keeps every frame on the main thread.
let inkOffload = "off";
let inkWorker = null;
let inkJob = 0;
let inkJobCount = 0;
let inkChecks = 0;
let inkExpected = null;
let inkFrame = null;
let inkQueued = null;

function resizeInk() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  ink.height = 140;
  ink.width = Math.max(1, Math.round(140 * aspect));
  inkValues = new Uint8Array(ink.width * ink.height);
  inkHorizontal = new Uint8Array(inkValues.length);
  inkPrevious = null;
  inkPositionsDirty = true;
}

// Page offsets are measured only after layout changes; scrolling just shifts them.
function placeInk() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  if (inkPositionsDirty) {
    inkPositionsDirty = false;
    inkElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const previous = inkPositions.get(el);
      inkPositions.set(el, {
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        x: previous ? previous.x : NaN,
        y: previous ? previous.y : NaN,
      });
    });
  }
  inkPositions.forEach((position, el) => {
    if (!inkNearby.has(el)) return;
    const x = position.left - scrollX;
    const y = position.top - scrollY;
    if (x === position.x && y === position.y) return;
    position.x = x;
    position.y = y;
    el.style.setProperty("--ink-x", `${x}px`);
    el.style.setProperty("--ink-y", `${y}px`);
  });
}

function updateInk(source, sourceWidth, sourceHeight) {
  if (touchMotion.matches) return;
  if (!sourceWidth || !sourceHeight) return;
  if (!inkNearby.size) {
    inkStale = true;
    return;
  }
  inkStale = false;
  if (inkOffload === "on") {
    if (inkJob) inkQueued = [source, sourceWidth, sourceHeight];
    else sendInkJob(source, sourceWidth, sourceHeight, false);
    return;
  }
  const changed = drawInkHere(source, sourceWidth, sourceHeight);
  if (inkOffload === "check" && !inkJob) {
    // Same frame, same task: the worker must reproduce this mask byte for byte.
    inkExpected = inkValues.slice();
    sendInkJob(source, sourceWidth, sourceHeight, true);
  }
  if (!changed) return;
  inkCtx.putImageData(inkFrame, 0, 0);
  showInk(ink.toDataURL("image/png"));
}

// The main-thread path, used until the worker is verified and as the fallback.
function drawInkHere(source, sourceWidth, sourceHeight) {
  const width = ink.width;
  const height = ink.height;
  drawInkSource(inkCtx, source, width, height, sourceWidth, sourceHeight);
  inkFrame = inkCtx.getImageData(0, 0, width, height);
  inkMask(inkFrame, width, height, inkValues, inkHorizontal);
  if (sameBytes(inkPrevious, inkValues)) return false;
  inkPrevious = inkPrevious || new Uint8Array(inkValues.length);
  inkPrevious.set(inkValues);
  return true;
}

// The mask is opaque, so the new image fully covers the previous one once it
// has loaded; keeping the previous one underneath avoids a blank frame meanwhile.
// Set on the ink text itself: on <html> or a section, each update restyles about ten times longer.
function showInk(url) {
  const value = inkShown ? `url("${url}"), url("${inkShown}")` : `url("${url}")`;
  inkElements.forEach((el) => el.style.setProperty("--ink", value));
  inkShown = url;
  if (url.startsWith("blob:")) inkBlobs.push(url);
  while (inkBlobs.length > 2) URL.revokeObjectURL(inkBlobs.shift());
  if (!inkLive) {
    inkLive = true;
    document.documentElement.classList.add("ink-live");
  }
  placeInk();
}

function sendInkJob(source, sourceWidth, sourceHeight, check) {
  inkJobCount += 1;
  const id = inkJobCount;
  inkJob = id;
  createImageBitmap(source).then((bitmap) => {
    if (inkJob !== id || inkOffload === "off") {
      bitmap.close();
      return;
    }
    inkWorker.postMessage({
      id, bitmap, check, sourceWidth, sourceHeight, width: ink.width, height: ink.height,
    }, [bitmap]);
  }, () => stopInkWorker());
}

function stopInkWorker() {
  inkOffload = "off";
  inkJob = 0;
  inkQueued = null;
  inkWorker?.terminate();
  inkWorker = null;
}

function onInkWorkerMessage({ data }) {
  if (data.id !== inkJob) return;
  inkJob = 0;
  if (data.type === "check") {
    if (sameBytes(inkExpected, data.values)) inkOffload = "on";
    else if (++inkChecks >= 3) stopInkWorker();
    inkExpected = null;
  } else if (data.type === "mask") {
    if (inkNearby.size) showInk(URL.createObjectURL(data.blob));
    else inkStale = true;
  } else if (data.type === "error") {
    stopInkWorker();
  }
  // A frame that arrived while the worker was busy is processed straight away.
  if (inkQueued && inkOffload === "on") {
    const queued = inkQueued;
    inkQueued = null;
    updateInk(...queued);
  }
}

function startInkWorker() {
  if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") return;
  try {
    inkWorker = new Worker(new URL("./ink-worker.js", import.meta.url), { type: "module" });
  } catch {
    return;
  }
  inkWorker.addEventListener("message", onInkWorkerMessage);
  inkWorker.addEventListener("error", stopInkWorker);
  inkWorker.addEventListener("messageerror", stopInkWorker);
  inkOffload = "check";
}

resizeInk();
if (!touchMotion.matches) {
  startInkWorker();
  window.addEventListener("resize", () => {
    resizeInk();
    placeInk();
  });
  let inkScrollFrame = 0;
  window.addEventListener("scroll", () => {
    if (inkScrollFrame || !inkNearby.size) return;
    inkScrollFrame = requestAnimationFrame(() => {
      inkScrollFrame = 0;
      placeInk();
    });
  }, { passive: true });
  document.fonts?.ready.then(() => { inkPositionsDirty = true; });
  // Footer text changes (the clock) only move ink text when some ink element resizes.
  if ("ResizeObserver" in window) {
    const layoutWatch = new ResizeObserver(() => { inkPositionsDirty = true; });
    layoutWatch.observe(document.body);
    inkElements.forEach((el) => layoutWatch.observe(el));
  }
  if ("IntersectionObserver" in window) {
    // The margin starts updates a viewport ahead so text never enters with a stale mask.
    const nearby = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) inkNearby.add(target);
        else inkNearby.delete(target);
      });
      if (!inkNearby.size) return;
      placeInk();
      if (inkStale && video.readyState >= 2) updateInk(video, video.videoWidth, video.videoHeight);
    }, { rootMargin: "100% 0px" });
    inkElements.forEach((el) => nearby.observe(el));
  }
}

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
  const mobileFrame = touchMotion.matches ? document.createElement("canvas") : null;
  const mobileContext = mobileFrame?.getContext("2d", { alpha: false });

  const upload = (now) => {
    if (video.readyState < 2) return;
    if (document.hidden || (touchMotion.matches && now - lastPaint < 1000 / 30 - 1)) return;
    lastPaint = now;
    if (mobileContext) {
      // Upload a small texture rather than a full-resolution video every frame.
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      if (mobileFrame.width !== width || mobileFrame.height !== height) {
        mobileFrame.width = width;
        mobileFrame.height = height;
      }
      mobileContext.drawImage(video, 0, 0, width, height);
      glass.draw(mobileFrame, width, height);
    } else {
      glass.draw(video, video.videoWidth, video.videoHeight);
      updateInk(video, video.videoWidth, video.videoHeight);
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
