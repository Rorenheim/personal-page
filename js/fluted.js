import { mountGlass } from "./glass.js";

const host = document.getElementById("field");
if (!host) throw new Error("Missing #field");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function resizeInk() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  ink.height = 140;
  ink.width = Math.max(1, Math.round(140 * aspect));
}

function placeInk() {
  document.querySelectorAll(".ink").forEach((el) => {
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--ink-x", `${rect.left}px`);
    el.style.setProperty("--ink-y", `${rect.top}px`);
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
  const pixels = frame.data;
  const values = new Uint8Array(width * height);
  for (let p = 0, i = 0; i < pixels.length; i += 4, p += 1) {
    const luma = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    const light = smoothstep(0.28, 0.62, luma);
    values[p] = Math.round((1 - light) * 255);
  }
  const radius = 1;
  const grown = new Uint8Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let yy = y0; yy <= y1; yy += 1) {
        for (let xx = x0; xx <= x1; xx += 1) {
          const sample = values[yy * width + xx];
          if (sample > max) max = sample;
        }
      }
      grown[y * width + x] = max;
    }
  }
  for (let p = 0, i = 0; p < grown.length; p += 1, i += 4) {
    pixels[i] = grown[p];
    pixels[i + 1] = grown[p];
    pixels[i + 2] = grown[p];
    pixels[i + 3] = 255;
  }
  inkCtx.putImageData(frame, 0, 0);
  document.documentElement.style.setProperty("--ink", `url("${ink.toDataURL("image/png")}")`);
  document.documentElement.classList.add("ink-live");
  placeInk();
}

resizeInk();
window.addEventListener("resize", () => {
  resizeInk();
  placeInk();
});
window.addEventListener("scroll", placeInk, { passive: true });

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

  const upload = () => {
    if (video.readyState < 2) return;
    glass.draw(video, video.videoWidth, video.videoHeight);
    updateInk(video, video.videoWidth, video.videoHeight);
  };

  const paint = () => {
    upload();
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
