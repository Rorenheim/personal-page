(() => {
  const root = document.querySelector("[data-carousel]");
  if (!root) return;

  const track = root.querySelector(".carousel-track");
  const viewport = root.querySelector(".carousel-viewport");
  const slides = [...root.querySelectorAll(".slide")];
  const now = root.querySelector(".carousel-now");
  const dotsHost = root.querySelector(".carousel-dots");
  const steps = [...root.querySelectorAll("[data-step]")];
  const pad = (n) => String(n).padStart(2, "0");

  const dots = slides.map((slide, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    const name = slide.querySelector(".t-name h2").textContent;
    dot.setAttribute("aria-label", name);
    dot.title = name;
    dot.addEventListener("click", () => go(i));
    dotsHost.append(dot);
    return dot;
  });

  let index = 0;

  // Stacked slides differ in height; the viewport follows the active one.
  function fit() {
    viewport.style.height = `${slides[index].offsetHeight}px`;
  }

  window.addEventListener("resize", fit);
  document.fonts?.ready.then(fit);

  function go(next, { updateHash = true } = {}) {
    index = (next + slides.length) % slides.length;
    track.style.setProperty("--index", index);
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.inert = !active;
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dots.forEach((dot, i) => dot.setAttribute("aria-current", i === index ? "true" : "false"));
    now.textContent = pad(index + 1);
    fit();
    if (updateHash) history.replaceState(null, "", `#${slides[index].id}`);
  }

  steps.forEach((button) => {
    button.addEventListener("click", () => go(index + Number(button.dataset.step)));
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === "ArrowRight") go(index + 1);
  });

  // Horizontal swipes move between projects; vertical drags still scroll the page.
  let start = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    start = { x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener("pointerup", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) go(index + (dx < 0 ? 1 : -1));
  });
  viewport.addEventListener("pointercancel", () => { start = null; });

  const fromHash = slides.findIndex((slide) => `#${slide.id}` === location.hash);
  go(Math.max(0, fromHash), { updateHash: false });

  // Enable the tile entrance only after the first slide is in place.
  requestAnimationFrame(() => root.classList.add("is-ready"));
})();
