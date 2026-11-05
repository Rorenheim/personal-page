(() => {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;

  const documents = [
    "about.html",
    "work.html",
    "projects.html",
    "blog.html",
    "principles.html",
    "books.html",
    "imprint.html",
    "privacy.html",
  ];
  const resources = [
    ["css/pages.css"],
    ["js/menu.js"],
    ["js/carousel.js"],
    ["assets/projects/casseo1-640.jpg", "image"],
    ["assets/projects/casseo2-640.jpg", "image"],
    ["assets/projects/casseo3-640.jpg", "image"],
    ["assets/projects/casseo4-640.jpg", "image"],
  ];

  function addPrefetch(href, as) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    if (as) link.as = as;
    document.head.append(link);
  }

  function warmNextPages() {
    documents.forEach((path) => addPrefetch(path));
    resources.forEach(([path, as]) => addPrefetch(path, as));
  }

  function schedule() {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(warmNextPages, { timeout: 2500 });
    } else {
      window.setTimeout(warmNextPages, 1200);
    }
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
