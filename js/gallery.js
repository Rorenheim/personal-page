(() => {
  const icon = (path) =>
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

  // Consecutive images become one thumbnail row, even without a wrapper.
  document.querySelectorAll(".post").forEach((post) => {
    const children = [...post.children];
    let group = [];
    const flush = () => {
      if (group.length > 1) {
        const gallery = document.createElement("div");
        gallery.className = "post-gallery";
        group[0].before(gallery);
        group.forEach((figure) => gallery.append(figure));
      }
      group = [];
    };
    children.forEach((el) => {
      const image = el.matches?.(".post-media") && el.querySelector("img") && !el.querySelector("video");
      if (image) group.push(el);
      else flush();
    });
    flush();
  });

  const galleries = [...document.querySelectorAll(".post-gallery")];
  if (!galleries.length) return;

  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.innerHTML = `
    <button type="button" class="round-button lightbox-close" aria-label="Close">${icon("M5 5l10 10M15 5L5 15")}</button>
    <button type="button" class="round-button lightbox-prev" aria-label="Previous image">${icon("M16 10H4M9 5l-5 5 5 5")}</button>
    <figure>
      <img alt="">
      <figcaption></figcaption>
    </figure>
    <button type="button" class="round-button lightbox-next" aria-label="Next image">${icon("M4 10h12M11 5l5 5-5 5")}</button>
  `;
  document.body.append(dialog);

  const frame = dialog.querySelector("img");
  const caption = dialog.querySelector("figcaption");
  const prev = dialog.querySelector(".lightbox-prev");
  const next = dialog.querySelector(".lightbox-next");
  let shots = [];
  let index = 0;

  function show(nextIndex) {
    index = (nextIndex + shots.length) % shots.length;
    const shot = shots[index];
    frame.src = shot.src;
    frame.alt = shot.alt;
    caption.textContent = shot.alt;
    caption.hidden = !shot.alt;
    const multi = shots.length > 1;
    prev.hidden = !multi;
    next.hidden = !multi;
  }

  function open(list, start) {
    shots = list;
    show(start);
    if (!dialog.open) dialog.showModal();
  }

  galleries.forEach((gallery) => {
    const images = [...gallery.querySelectorAll("img")];
    images.forEach((img, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "post-zoom";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-label", img.alt ? `View larger: ${img.alt}` : "View larger image");
      img.before(button);
      button.append(img);
      button.addEventListener("click", () => {
        open(images.map((el) => ({ src: el.currentSrc || el.src, alt: el.alt })), i);
      });
    });
  });

  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (dialog.querySelector("figure").contains(event.target)) return;
    if (event.target.closest("button")) return;
    dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1);
    }
  });

  const figure = dialog.querySelector("figure");
  let swipe = null;
  figure.addEventListener("pointerdown", (event) => {
    swipe = event.clientX;
  });
  figure.addEventListener("pointerup", (event) => {
    if (swipe == null) return;
    const dx = event.clientX - swipe;
    swipe = null;
    if (shots.length > 1 && Math.abs(dx) > 48) show(index + (dx < 0 ? 1 : -1));
  });
  figure.addEventListener("pointercancel", () => { swipe = null; });

  const narrow = window.matchMedia("(max-width: 900px)");

  function fit(gallery) {
    const images = [...gallery.querySelectorAll("img")];
    if (!images.length || images.some((img) => !img.naturalWidth)) return;
    const width = gallery.clientWidth;
    if (!width || Math.abs((gallery._fitWidth || 0) - width) < 1) return;
    const gap = parseFloat(getComputedStyle(gallery).columnGap) || 0;
    const maxH = narrow.matches ? 200 : 280;
    const sum = images.reduce((total, img) => total + img.naturalWidth / img.naturalHeight, 0);
    const natural = sum * maxH + gap * (images.length - 1);
    const height = natural > width ? Math.max(96, (width - gap * (images.length - 1)) / sum) : maxH;
    gallery.style.setProperty("--thumb-h", `${Math.round(height)}px`);
    gallery._fitWidth = width;
  }

  function fitAll() {
    galleries.forEach(fit);
  }

  galleries.forEach((gallery) => {
    gallery.querySelectorAll("img").forEach((img) => {
      if (img.complete) fit(gallery);
      else img.addEventListener("load", () => fit(gallery), { once: true });
    });
  });

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(fitAll);
    galleries.forEach((gallery) => observer.observe(gallery));
  } else {
    window.addEventListener("resize", fitAll);
  }
  narrow.addEventListener("change", () => {
    galleries.forEach((gallery) => { gallery._fitWidth = 0; });
    fitAll();
  });
})();
