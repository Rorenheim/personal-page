import { tiles } from "./prebaked-media.js";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const touchMotion = matchMedia("(hover: none), (pointer: coarse)");

document.querySelectorAll("[data-glyph]").forEach((host) => {
  const media = tiles[host.dataset.glyph];
  if (!media) return; // Blog and Play are deliberately excluded.
  const trigger = host.closest(".card-links a") || host.closest(".card");
  let animation;
  const svg = host.querySelector("svg");
  if (media.poster) {
    const poster = new Image();
    poster.className = "baked-project-poster";
    poster.src = media.poster;
    poster.alt = "";
    poster.decoding = "async";
    host.append(poster);
  }

  function size() {
    if (!animation || !svg) return;
    const rect = svg.getBoundingClientRect();
    animation.style.width = `${rect.width * (media.width + 2 * media.pad) / media.width}px`;
    animation.style.height = `${rect.height * (media.height + 2 * media.pad) / media.height}px`;
  }

  function stop() {
    host.classList.remove("has-baked-motion");
    if (!animation) return;
    animation.onload = null;
    animation.onloadeddata = null;
    animation.onerror = null;
    if (media.video) animation.pause();
    animation.remove();
    animation.removeAttribute("src");
    if (media.video) animation.load();
    animation = undefined;
  }

  window.watchTileMotion(trigger, {
    enter() {
      if (reducedMotion.matches || touchMotion.matches || document.hidden) return;
      stop();
      const image = media.video ? document.createElement("video") : new Image();
      animation = image;
      image.setAttribute("aria-hidden", "true");
      if (!media.video) image.alt = "";
      image.className = "baked-motion";
      const ready = () => {
        if (animation !== image) return;
        host.classList.add("has-baked-motion");
      };
      if (media.video) {
        image.muted = true;
        image.loop = true;
        image.playsInline = true;
        image.disablePictureInPicture = true;
        image.setAttribute("playsinline", "");
        image.setAttribute("muted", "");
        image.onloadeddata = ready;
      } else {
        image.decoding = "async";
        image.onload = ready;
      }
      image.onerror = stop;
      // Only active desktop tiles download/decode an animation. Mobile retains
      // its existing still illustrations and never starts motion on scroll.
      image.src = media.src;
      host.append(image);
      size();
      if (media.video) image.play().catch(() => { if (animation === image) stop(); });
    },
    leave: stop,
  });

  if (svg) new ResizeObserver(size).observe(host);
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) stop();
  }).observe(host);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) stop(); });
  touchMotion.addEventListener("change", stop);
});
