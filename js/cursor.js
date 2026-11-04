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
    pool.push({ el, t: 0, on: false });
  }

  const gap = 14;
  const life = 420;
  let slot = 0;
  let last = null;
  let running = false;

  function place(el, x, y) {
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
  }

  function frame(now) {
    let any = false;
    for (const dot of pool) {
      if (!dot.on) continue;
      const age = now - dot.t;
      if (age >= life) {
        dot.on = false;
        dot.el.style.opacity = "0";
        continue;
      }
      any = true;
      dot.el.style.opacity = String(1 - age / life);
    }
    if (any) requestAnimationFrame(frame);
    else running = false;
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
    dot.el.style.opacity = "1";
    place(dot.el, x, y);
    kick();
  }

  function move(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const x = event.clientX;
    const y = event.clientY;
    place(head, x, y);
    head.classList.add("is-on");

    if (reduced || event.type !== "pointermove") return;
    if (last && Math.hypot(x - last.x, y - last.y) < gap) return;
    last = { x, y };
    drop(x, y, performance.now());
  }

  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerrawupdate", move, { passive: true });

  document.documentElement.addEventListener("pointerleave", () => {
    head.classList.remove("is-on");
    last = null;
  });

  fine.addEventListener("change", () => {
    if (fine.matches) return;
    document.documentElement.classList.remove("has-cursor");
    head.remove();
    for (const dot of pool) dot.el.remove();
  });
})();
