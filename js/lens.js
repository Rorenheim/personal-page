(() => {
  const web = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 901px)");
  if (!web.matches) return;
  const figures = [...document.querySelectorAll(".slide .t-shot")];
  if (!figures.length) return;

  const SIZE = 320;
  const MAG = 2.2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const lens = document.createElement("div");
  lens.className = "lens";
  lens.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.round(SIZE * dpr);
  lens.append(canvas);
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return;
  document.body.append(lens);

  const vertex = `
    attribute vec2 a_pos;
    varying vec2 v_pos;
    void main() {
      v_pos = a_pos;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }`;

  // p runs -1..1 across the lens with y pointing down, like image coordinates.
  const fragment = `
    precision highp float;
    varying vec2 v_pos;
    uniform sampler2D u_tex;
    uniform vec2 u_center;
    uniform vec2 u_reach;
    uniform vec3 u_back;
    uniform float u_px;

    vec3 pick(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return u_back;
      return texture2D(u_tex, uv).rgb;
    }

    void main() {
      vec2 p = vec2(v_pos.x, -v_pos.y);
      float d = length(p);
      float edge = 1.0 - smoothstep(1.0 - 2.0 * u_px, 1.0, d);
      if (edge <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
      }
      float bend = 1.0 + 0.08 * pow(d, 8.0);
      vec2 offset = p * u_reach * bend;
      float split = 0.003 * pow(d, 8.0);
      vec3 color = vec3(
        pick(u_center + offset * (1.0 + split)).r,
        pick(u_center + offset).g,
        pick(u_center + offset * (1.0 - split)).b
      );
      color *= 1.0 - 0.12 * smoothstep(0.93, 1.0, d);
      float arc = smoothstep(0.9, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
      color += 0.35 * arc * smoothstep(0.2, -0.8, p.x + p.y);
      color = mix(color, vec3(1.0), 0.55 * smoothstep(1.0 - 6.0 * u_px, 1.0 - 2.5 * u_px, d));
      gl_FragColor = vec4(color * edge, edge);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    lens.remove();
    return;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name) => gl.getUniformLocation(program, name);
  const uCenter = uniform("u_center");
  const uReach = uniform("u_reach");
  const uBack = uniform("u_back");
  gl.uniform1f(uniform("u_px"), 2 / canvas.width);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);

  const textures = new Map();

  function upload(texture, source) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  }

  // The largest srcset candidate, so the lens magnifies real pixels instead of the downsized copy.
  function sharpest(img) {
    let best = img.currentSrc || img.src;
    let width = 0;
    for (const part of (img.getAttribute("srcset") || "").split(",")) {
      const [url, size] = part.trim().split(/\s+/);
      const w = parseFloat(size);
      if (url && w > width) {
        width = w;
        best = new URL(url, location.href).href;
      }
    }
    return best;
  }

  function textureFor(figure) {
    let entry = textures.get(figure);
    if (entry) return entry;
    const img = figure.querySelector("img");
    if (!img?.complete || !img.naturalWidth) return null;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    upload(texture, img);
    const back = (getComputedStyle(figure).backgroundColor.match(/\d+/g) || [240, 240, 240]).slice(0, 3).map((n) => n / 255);
    entry = { img, texture, back };
    textures.set(figure, entry);
    const src = sharpest(img);
    if (src !== img.currentSrc) {
      const full = new Image();
      full.decoding = "async";
      full.src = src;
      full.decode().then(() => {
        upload(texture, full);
        if (active === figure) schedule();
      }, () => {});
    }
    return entry;
  }

  // Where the pointer sits on the source image, through object-fit: cover, object-position, and any CSS zoom.
  function locate(img, x, y) {
    const box = img.getBoundingClientRect();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.max(box.width / nw, box.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    const [px, py] = getComputedStyle(img).objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5));
    const left = box.left + (box.width - w) * px;
    const top = box.top + (box.height - h) * py;
    return { u: (x - left) / w, v: (y - top) / h, w, h };
  }

  let active = null;
  let pointer = { x: 0, y: 0 };
  let queued = false;

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  }

  function hide() {
    active = null;
    lens.classList.remove("is-on");
    document.documentElement.classList.remove("lens-on");
  }

  function render() {
    queued = false;
    if (!active) return;
    if (!active.closest(".slide")?.classList.contains("is-active")) {
      hide();
      return;
    }
    const entry = textureFor(active);
    if (!entry) return;
    const spot = locate(entry.img, pointer.x, pointer.y);
    const radius = SIZE / 2;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform2f(uCenter, spot.u, spot.v);
    gl.uniform2f(uReach, radius / spot.w / MAG, radius / spot.h / MAG);
    gl.uniform3f(uBack, ...entry.back);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    lens.style.transform = `translate3d(${pointer.x - radius}px, ${pointer.y - radius}px, 0)`;
    lens.classList.add("is-on");
    document.documentElement.classList.add("lens-on");
  }

  for (const figure of figures) {
    const img = figure.querySelector("img");
    if (!img) continue;
    img.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      active = figure;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    });
    img.addEventListener("pointermove", (event) => {
      if (active !== figure) return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    });
    img.addEventListener("pointerleave", () => {
      if (active === figure) hide();
    });
  }

  window.addEventListener("scroll", () => active && schedule(), { passive: true });
  web.addEventListener("change", () => {
    if (!web.matches) hide();
  });
})();
