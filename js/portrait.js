(() => {
  const video = document.querySelector(".portrait video");
  if (!video) return;
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // The poster already shows the pose, so skip the settle.
  video.removeAttribute("autoplay");
  video.pause();
})();
