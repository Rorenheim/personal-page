(() => {
  const bar = document.querySelector(".bar");
  if (!bar) return;

  const PAGES = [
    ["index.html", "Home"],
    ["about.html", "About"],
    ["work.html", "Work"],
    ["projects.html", "Personal projects"],
    ["blog.html", "Blog"],
    ["principles.html", "Guiding principles"],
    ["books.html", "Book recommendations"],
  ];

  const ELSEWHERE = [
    ["https://www.linkedin.com/in/kalaba", "LinkedIn"],
    ["https://github.com/Rorenheim?tab=repositories", "GitHub"],
    ["mailto:paul@kalaba.me", "Email"],
  ];

  const LEGAL = [
    ["imprint.html", "Imprint"],
    ["privacy.html", "Privacy policy"],
  ];

  const here = location.pathname.split("/").pop() || "index.html";
  const current = (href) => (href === here ? ' aria-current="page"' : "");
  const external = (href) => (href.startsWith("http") ? ' rel="noreferrer"' : "");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "menu-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "menu");
  toggle.innerHTML = '<span class="menu-toggle-lines" aria-hidden="true"><span></span><span></span></span><span class="menu-toggle-label">Menu</span>';
  bar.append(toggle);

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.id = "menu";
  menu.hidden = true;
  menu.innerHTML = `
    <nav class="menu-pages" aria-label="Pages">
      <ol>
        ${PAGES.map(([href, label], i) => `<li style="--i:${i}"><a href="${href}"${current(href)}>${label}</a></li>`).join("")}
      </ol>
    </nav>
    <div class="menu-foot">
      <nav class="menu-elsewhere" aria-label="Elsewhere">
        ${ELSEWHERE.map(([href, label]) => `<a href="${href}"${external(href)}>${label}</a>`).join("")}
      </nav>
      <nav class="menu-legal" aria-label="Legal">
        ${LEGAL.map(([href, label]) => `<a href="${href}"${current(href)}>${label}</a>`).join("")}
      </nav>
    </div>`;
  bar.after(menu);

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const outside = () => [...document.body.children].filter((el) => el !== bar && el !== menu && el.id !== "field");
  let closing = 0;

  function open() {
    window.clearTimeout(closing);
    const box = toggle.getBoundingClientRect();
    menu.style.setProperty("--ox", `${box.left + box.width / 2}px`);
    menu.style.setProperty("--oy", `${box.top + box.height / 2}px`);
    menu.hidden = false;
    // Force a style flush so the reveal transition runs from its closed state.
    void menu.offsetWidth;
    root.classList.add("menu-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.querySelector(".menu-toggle-label").textContent = "Close";
    outside().forEach((el) => { el.inert = true; });
    const first = menu.querySelector('[aria-current="page"]') || menu.querySelector("a");
    first.focus({ preventScroll: true });
  }

  function close({ restoreFocus = true } = {}) {
    root.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.querySelector(".menu-toggle-label").textContent = "Menu";
    outside().forEach((el) => { el.inert = false; });
    if (restoreFocus) toggle.focus({ preventScroll: true });
    closing = window.setTimeout(() => { menu.hidden = true; }, reduced.matches ? 0 : 520);
  }

  const isOpen = () => root.classList.contains("menu-open");

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      close();
    }
  });

  menu.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link && isHome(link.href)) {
      const nav = window.navigation;
      const currentIndex = nav?.currentEntry?.index;
      const cachedHome = nav?.entries?.().filter((entry) =>
        entry.index < currentIndex && isHome(entry.url)
      ).at(-1);
      if (cachedHome) {
        event.preventDefault();
        try {
          nav.traverseTo(cachedHome.key).committed.catch(() => location.assign(link.href));
        } catch {
          location.assign(link.href);
        }
        return;
      }
      if (isHome(document.referrer)) {
        event.preventDefault();
        history.back();
        return;
      }
    }
    if (link && link.getAttribute("aria-current") === "page") {
      event.preventDefault();
      close();
    }
  });

  // Coming back through the history cache should never show a stale open menu.
  window.addEventListener("pageshow", () => {
    if (isOpen()) close({ restoreFocus: false });
  });

  function isHome(value) {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin &&
        (url.pathname === "/" || url.pathname.endsWith("/index.html"));
    } catch {
      return false;
    }
  }
})();
