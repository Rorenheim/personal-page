(() => {
  const root = document.querySelector("[data-timeline]");
  if (!root) return;

  const track = root.querySelector(".tl-track");
  const entries = [...root.querySelectorAll(".tl-entry")];
  const years = [...root.querySelectorAll(".tl-years button")];
  const steps = [...root.querySelectorAll("[data-step]")];
  const stacked = window.matchMedia("(max-width: 900px)");

  // Strength by distance from the focused role.
  const FADE = [1, 0.42, 0.26, 0.16, 0.1];
  const SHRINK = 0.035;

  let index = 0;

  function place() {
    if (stacked.matches) {
      track.style.transform = "";
      return;
    }
    const shift = entries[index].offsetLeft - entries[0].offsetLeft;
    track.style.transform = `translateX(${-shift}px)`;
  }

  function focus(next, { reveal = false } = {}) {
    index = Math.max(0, Math.min(entries.length - 1, next));
    entries.forEach((entry, i) => {
      const distance = Math.min(Math.abs(i - index), FADE.length - 1);
      entry.style.setProperty("--fade", FADE[distance]);
      entry.style.setProperty("--scale", 1 - distance * SHRINK);
      entry.classList.toggle("is-focus", i === index);
      entry.querySelector(".tl-pick").setAttribute("aria-current", i === index ? "true" : "false");
    });
    years.forEach((button, i) => button.setAttribute("aria-current", i === index ? "true" : "false"));
    steps.forEach((button) => {
      const target = index + Number(button.dataset.step);
      button.disabled = target < 0 || target >= entries.length;
    });
    place();
    if (reveal && stacked.matches) {
      window.setTimeout(() => entries[index].scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
    }
  }

  const viewport = root.querySelector(".tl-viewport");

  entries.forEach((entry, i) => {
    const pick = entry.querySelector(".tl-pick");
    pick.addEventListener("click", () => focus(i, { reveal: true }));
    // Tabbing onto a muted role brings it forward instead of letting the
    // clipped viewport scroll on its own.
    pick.addEventListener("focus", () => {
      viewport.scrollLeft = 0;
      if (i !== index && pick.matches(":focus-visible")) focus(i);
    });
  });

  years.forEach((button) => {
    button.addEventListener("click", () => focus(Number(button.dataset.to)));
  });

  steps.forEach((button) => {
    button.addEventListener("click", () => focus(index + Number(button.dataset.step)));
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    focus(index + (event.key === "ArrowRight" ? 1 : -1));
    entries[index].querySelector(".tl-pick").focus({ preventScroll: true });
  });

  window.addEventListener("resize", place);
  stacked.addEventListener("change", place);

  focus(0);
})();
