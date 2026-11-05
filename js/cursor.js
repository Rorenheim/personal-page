(() => {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  if (!fine.matches) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("has-cursor");

  const head = document.createElement("div");
  head.id = "cursor-head";
  head.setAttribute("aria-hidden", "true");
  document.body.appendChild(head);

  const pool = [];
  for (let i = 0; i < 8; i++) {
    const el = document.createElement("div");
    el.className = "cursor-dot";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    pool.push({ el, t: 0, on: false, x: 0, y: 0, moved: false });
  }

  const gap = 14;
  const life = 420;
  let slot = 0;
  let last = null;
  let running = false;
  let headX = 0;
  let headY = 0;
  let headMoved = false;
  let headWanted = false;
  let headShown = false;

  function place(el, x, y) {
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  // Events can arrive many times per frame; styles are written once per frame.
  function frame(now) {
    running = false;
    if (headMoved) {
      headMoved = false;
      place(head, headX, headY);
    }
    if (headWanted !== headShown) {
      headShown = headWanted;
      head.classList.toggle("is-on", headShown);
    }
    let any = false;
    for (const dot of pool) {
      if (!dot.on) continue;
      if (dot.moved) {
        dot.moved = false;
        place(dot.el, dot.x, dot.y);
      }
      const age = now - dot.t;
      if (age >= life) {
        dot.on = false;
        dot.el.style.opacity = "0";
        continue;
      }
      any = true;
      dot.el.style.opacity = String(1 - age / life);
    }
    if (any) kick();
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function drop(x, y, now) {
    const dot = pool[slot];
    slot = (slot + 1) % pool.length;
    dot.on = true;
    dot.t = now;
    dot.x = x;
    dot.y = y;
    dot.moved = true;
  }

  function move(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const x = event.clientX;
    const y = event.clientY;
    headX = x;
    headY = y;
    headMoved = true;
    headWanted = true;
    kick();

    if (reduced) return;
    if (last && Math.hypot(x - last.x, y - last.y) < gap) return;
    last = { x, y };
    drop(x, y, performance.now());
  }

  window.addEventListener("pointermove", move, { passive: true });

  document.documentElement.addEventListener("pointerleave", () => {
    headWanted = false;
    last = null;
    kick();
  });

  fine.addEventListener("change", () => {
    if (fine.matches) return;
    document.documentElement.classList.remove("has-cursor");
    head.remove();
    for (const dot of pool) dot.el.remove();
  });
})();
