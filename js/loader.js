(() => {
  const loader = document.getElementById("loader");
  if (!loader) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  const minHold = reduced ? 0 : 700;
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const pageReady = new Promise((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });
  let fieldReady = false;
  let gone = false;

  function reveal() {
    if (gone || !fieldReady) return;
    gone = true;
    const delay = Math.max(0, minHold - (performance.now() - start));
    window.setTimeout(() => {
      document.documentElement.classList.remove("is-loading");
      loader.classList.add("is-done");
      const remove = () => {
        if (loader.isConnected) loader.remove();
      };
      loader.addEventListener("transitionend", remove, { once: true });
      window.setTimeout(remove, reduced ? 0 : 900);
    }, delay);
  }

  document.addEventListener("field-ready", () => {
    fieldReady = true;
    Promise.all([fontsReady, pageReady]).then(reveal);
  }, { once: true });

  window.setTimeout(() => {
    fieldReady = true;
    reveal();
  }, 20000);
})();
