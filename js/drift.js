import { backgrounds } from "./prebaked-media.js";

const host = document.getElementById("field");
if (!host) throw new Error("Missing #field");

// Native video playback replaces both the procedural canvas and WebGL shader.
// The index background has its own renderer and is deliberately unchanged.
const video = document.createElement("video");
video.className = "baked-drift";
video.muted = true;
video.defaultMuted = true;
video.loop = true;
video.playsInline = true;
video.preload = "auto";
video.setAttribute("muted", "");
video.setAttribute("playsinline", "");
video.setAttribute("aria-hidden", "true");
video.disablePictureInPicture = true;
host.append(video);

const portrait = matchMedia("(max-aspect-ratio: 3/4)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function syncPlayback() {
  if (document.hidden || reducedMotion.matches) {
    video.pause();
    return;
  }
  video.play().catch((error) => {
    // Browsers may block autoplay in low-power/data-saving modes. The baked
    // poster remains visible; no expensive live renderer is started instead.
    console.info("Background playback unavailable:", error.name);
  });
}

function selectMedia() {
  const media = portrait.matches ? backgrounds.portrait : backgrounds.landscape;
  video.poster = media.poster;
  if (reducedMotion.matches) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    return;
  }
  video.src = media.src;
  video.load();
  syncPlayback();
}

portrait.addEventListener("change", selectMedia);
reducedMotion.addEventListener("change", selectMedia);
document.addEventListener("visibilitychange", syncPlayback);
selectMedia();
