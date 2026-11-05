(() => {
  window.addEventListener("pageswap", (event) => {
    if (event.viewTransition) event.viewTransition.skipTransition();
  });

  let fieldReady = false;
  document.addEventListener("field-ready", () => {
    fieldReady = true;
  }, { once: true });

  function arriveFlag() {
    try {
      return sessionStorage.getItem("home-return") === "arrive";
    } catch {
      return false;
    }
  }

  function clearArrive() {
    try {
      sessionStorage.removeItem("home-return");
      sessionStorage.removeItem("home-return-ox");
      sessionStorage.removeItem("home-return-oy");
    } catch {}
  }

  function uncoverArrive() {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const done = () => {
      root.classList.remove("is-arriving", "is-uncovering");
      document.getElementById("arrive-cover")?.remove();
      root.style.removeProperty("--back-ox");
      root.style.removeProperty("--back-oy");
      clearArrive();
    };
    if (reduced || !root.classList.contains("is-arriving")) {
      done();
      return;
    }
    window.setTimeout(() => {
      root.classList.add("is-uncovering");
      const onEnd = (event) => {
        if (event.propertyName !== "clip-path" && event.propertyName !== "-webkit-clip-path") return;
        root.removeEventListener("transitionend", onEnd);
        done();
      };
      root.addEventListener("transitionend", onEnd);
      window.setTimeout(done, 1500);
    }, 280);
  }

  function waitToUncover() {
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      Promise.resolve(fontsReady).then(uncoverArrive);
    };
    if (fieldReady) start();
    else document.addEventListener("field-ready", start, { once: true });
    window.setTimeout(start, 4000);
  }

  if (arriveFlag()) {
    document.documentElement.classList.add("is-arriving");
    document.getElementById("loader")?.remove();
    waitToUncover();
    return;
  }

  window.addEventListener("pageshow", () => {
    if (!arriveFlag()) return;
    document.documentElement.classList.add("is-arriving");
    document.getElementById("loader")?.remove();
    waitToUncover();
  });

  const loader = document.getElementById("loader");
  if (!loader) return;

  if (document.documentElement.classList.contains("is-returning")) {
    loader.remove();
    return;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fieldOnly = loader.dataset.hold === "field";
  const start = performance.now();
  const minHold = fieldOnly || reduced ? 0 : 700;
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const pageReady = fieldOnly ? Promise.resolve() : new Promise((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });
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

  const unveil = () => Promise.all([fontsReady, pageReady]).then(reveal);
  if (fieldReady) unveil();
  else document.addEventListener("field-ready", unveil, { once: true });

  window.setTimeout(() => {
    fieldReady = true;
    reveal();
  }, fieldOnly ? 4000 : 20000);
})();
