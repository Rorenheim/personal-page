(() => {
  const host = document.querySelector("[data-glyph='projects']");
  if (!host) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "presentation");
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const BLEED = 1.18;
  const ACCENT = "#f43325";
  const LIGHT = { x: -0.62, y: -0.6, z: 0.5 };
  const sparkles = [
    [0.16, 0.18, 12],
    [0.84, 0.14, 10],
    [0.27, 0.44, 7],
    [0.76, 0.48, 9],
    [0.1, 0.62, 8],
    [0.91, 0.64, 7],
  ];

  let dpr = 1;
  let unit = 1;
  let width = 0;
  let height = 0;
  let frame = null;
  let rocket = null;
  let billows = [];
  let stars = null;
  let rocketLayer = null;
  let cloudLayer = null;
  let frameId = 0;
  let last = 0;
  let phase = 0;
  let heat = 0;
  let hovering = false;
  let motion = 0;
  let lift = 0;
  let pitch = 0;
  let yaw = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touchMotion = window.matchMedia("(hover: none), (pointer: coarse)");

  function mulberry(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function field(w, h) {
    const image = new ImageData(w, h);
    const data = image.data;
    function plot(x, y, alpha, radius) {
      const r = Math.max(0.8, radius);
      const ri = Math.ceil(r);
      const cx0 = x | 0;
      const cy0 = y | 0;
      const base = Math.max(0, Math.min(255, alpha * 255));
      for (let dy = -ri; dy <= ri; dy += 1) {
        for (let dx = -ri; dx <= ri; dx += 1) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r) continue;
          const ix = cx0 + dx;
          const iy = cy0 + dy;
          if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
          const i = (iy * w + ix) * 4;
          const aa = base * (0.5 + 0.5 * (1 - dist / (r + 0.01)));
          if (data[i + 3] >= aa) continue;
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = aa;
        }
      }
    }
    return {
      plot,
      commit(target) {
        target.putImageData(image, 0, 0);
      },
    };
  }

  function layer() {
    const el = document.createElement("canvas");
    el.width = width;
    el.height = height;
    return el;
  }

  function smoothstep(a, b, v) {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  // Keeps the bottom-left corner quiet so the tile title stays legible.
  function titleFade(x, y) {
    const fx = (x - frame.x) / frame.w;
    const fy = (y - frame.y) / frame.h;
    const dx = Math.max(0, fx - frame.titleRight) * (frame.w / frame.h);
    const dy = Math.max(0, frame.titleTop - fy);
    return 0.04 + 0.96 * smoothstep(0, 0.08, Math.hypot(dx, dy));
  }

  function rocketGeometry() {
    const r = frame.h * 0.062;
    const length = frame.h * 0.4;
    const top = frame.y + frame.h * 0.1;
    const cx = frame.x + frame.w * 0.5;
    const nozzle = length * 0.06;
    return { r, length, top, cx, nozzle, exit: top + length + nozzle };
  }

  function hull(t) {
    const { r } = rocket;
    if (t < 0 || t > 1) return 0;
    if (t < 0.3) {
      const k = 1 - t / 0.3;
      return r * (1 - k * k);
    }
    if (t > 0.9) return r * (1 - ((t - 0.9) / 0.1) * 0.16);
    return r;
  }

  function finShade(x, y) {
    const { r, length, top, cx } = rocket;
    const t = (y - top) / length;
    const side = x < cx ? -1 : 1;
    const off = Math.abs(x - cx);
    const inner = r * 0.9;
    const outer = r * 1.95;
    if (off >= inner && off <= outer) {
      const k = (off - inner) / (outer - inner);
      const from = 0.64 + k * 0.28;
      const to = 0.9 + k * 0.16;
      if (t >= from && t <= to) {
        const edge = Math.min(t - from, to - t) * length < frame.h * 0.006 ? 0.35 : 0;
        return side < 0 ? 0.62 + edge : 0.14 + edge * 0.6;
      }
    }
    if (off <= r * 0.16 && t >= 0.8 && t <= 1.08) return x < cx - r * 0.06 ? 0.85 : 0.4;
    return -1;
  }

  function rocketShade(x, y) {
    const { r, length, top, cx, nozzle } = rocket;
    const t = (y - top) / length;
    const half = hull(t);
    if (half > 0 && Math.abs(x - cx) <= half) {
      const nx = (x - cx) / half;
      const facing = -nx * 0.85 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.45;
      let shade = 0.02 + 0.98 * Math.max(0, Math.min(1, facing)) ** 2.2;
      if (Math.abs(nx + 0.55) < 0.08) shade = Math.min(1, shade + 0.3);
      if (nx > 0.82) shade = Math.max(shade, 0.22);
      const seam = frame.h * 0.005;
      if (Math.abs(y - (top + length * 0.3)) < seam || Math.abs(y - (top + length * 0.84)) < seam) shade *= 0.08;
      const px = cx;
      const py = top + length * 0.45;
      const pr = r * 0.5;
      const d = Math.hypot(x - px, y - py);
      if (d < pr + r * 0.12) {
        if (d > pr - r * 0.08) return 1;
        const hx = x - (px - pr * 0.28);
        const hy = y - (py - pr * 0.28);
        return hx * hx + hy * hy < (pr * 0.2) ** 2 ? 0.9 : 0.03;
      }
      return shade;
    }
    const n = y - (top + length);
    if (n >= 0 && n <= nozzle) {
      const k = n / nozzle;
      if (Math.abs(x - cx) <= r * (0.48 + k * 0.2)) return x < cx ? 0.5 : 0.2;
    }
    return finShade(x, y);
  }

  function renderRocket(rng) {
    const out = layer();
    const grain = field(width, height);
    const { r, length, top, cx, nozzle } = rocket;
    const x0 = cx - r * 2;
    const x1 = cx + r * 2;
    const y0 = top;
    const y1 = top + length * 1.1 + nozzle;
    const samples = ((x1 - x0) * (y1 - y0) * 0.21) / (unit * unit);
    const dot = 1.15 * unit;
    for (let i = 0; i < samples; i += 1) {
      const x = x0 + rng() * (x1 - x0);
      const y = y0 + rng() * (y1 - y0);
      const shade = rocketShade(x, y);
      if (shade <= 0 || rng() > shade) continue;
      grain.plot(x, y, 0.45 + 0.55 * shade, dot);
    }
    const edge = Math.round((length * 1.4) / unit);
    for (let i = 0; i < edge; i += 1) {
      const t = rng();
      const half = hull(t);
      const y = top + t * length;
      const inset = rng() * unit * 1.5;
      if (rng() < 0.85) grain.plot(cx - half + inset, y, 0.95, dot);
      if (rng() < 0.22) grain.plot(cx + half - inset, y, 0.45, dot);
    }
    grain.commit(out.getContext("2d"));
    return out;
  }

  function buildBillows(rng) {
    const list = [];
    const at = (fx, fy, fr) => list.push({
      x: frame.x + fx * frame.w,
      y: frame.y + fy * frame.h,
      r: fr * frame.h,
    });
    for (let i = 0; i < 6; i += 1) {
      const k = i / 5;
      at(0.5 + (rng() - 0.5) * 0.05 * k, 0.715 + k * 0.1, 0.035 + k * 0.05);
    }
    for (let i = 0; i < 7; i += 1) {
      const fx = 0.16 + (i / 6) * 0.68 + (rng() - 0.5) * 0.04;
      const c = Math.max(0, 1 - Math.abs(fx - 0.5) * 2.2);
      at(fx, 0.86 - c * 0.05 + rng() * 0.02, 0.06 + c * 0.04 + rng() * 0.015);
    }
    for (let i = 0; i < 9; i += 1) {
      const fx = -0.1 + (i / 8) * 1.2 + (rng() - 0.5) * 0.05;
      const c = Math.max(0, 1 - Math.abs(fx - 0.5) * 1.5);
      at(fx, 0.98 - c * 0.06 + rng() * 0.03, 0.11 + c * 0.06 + rng() * 0.03);
    }
    return list.sort((a, b) => a.y - b.y);
  }

  function covered(x, y, from) {
    for (let j = from; j < billows.length; j += 1) {
      const b = billows[j];
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) return true;
    }
    return false;
  }

  function renderCloud(rng) {
    const out = layer();
    const grain = field(width, height);
    const glowX = rocket.cx;
    const glowY = frame.y + frame.h * 0.72;
    const reach = frame.h * 0.2;
    const dot = 1.15 * unit;
    billows.forEach((b, index) => {
      const samples = (Math.PI * b.r * b.r * 0.15) / (unit * unit);
      for (let i = 0; i < samples; i += 1) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng());
        const nx = Math.cos(a) * d;
        const ny = Math.sin(a) * d;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const x = b.x + nx * b.r;
        const y = b.y + ny * b.r;
        const lambert = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
        const glow = Math.exp(-Math.hypot(x - glowX, y - glowY) / reach);
        let shade = 0.01 + 0.9 * lambert ** 3 + 0.6 * glow * lambert;
        shade = Math.min(1, shade) * titleFade(x, y);
        if (rng() > shade) continue;
        if (covered(x, y, index + 1)) continue;
        grain.plot(x, y, 0.35 + 0.65 * Math.min(1, shade), dot);
      }
      const rim = Math.round((b.r * 0.9) / unit);
      for (let i = 0; i < rim; i += 1) {
        const a = (i / rim) * Math.PI * 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const facing = nx * LIGHT.x + ny * LIGHT.y;
        if (facing < 0.3 || rng() > 0.8) continue;
        const inset = 1 - rng() * 0.03;
        const x = b.x + nx * b.r * inset;
        const y = b.y + ny * b.r * inset;
        if (covered(x, y, index + 1)) continue;
        grain.plot(x, y, (0.55 + 0.45 * facing) * titleFade(x, y), dot);
      }
    });
    grain.commit(out.getContext("2d"));
    return out;
  }

  function renderStars(rng) {
    const pad = Math.round(24 * dpr);
    const out = document.createElement("canvas");
    out.width = width + pad * 2;
    out.height = height + pad * 2;
    const grain = field(out.width, out.height);
    const count = Math.round((width * height) / (dpr * dpr * 520));
    const sweep = frame.h * 0.05;
    for (let i = 0; i < count; i += 1) {
      const x = rng() * out.width;
      const y = rng() * out.height;
      const sx = x - pad;
      const sy = y - pad;
      const fy = (sy - frame.y) / frame.h;
      if (rng() < smoothstep(0.5, 0.82, fy)) continue;
      if (rocketShade(sx, sy) > 0 || rocketShade(sx, sy + sweep) > 0) continue;
      if (covered(sx, sy, 0)) continue;
      const roll = rng();
      const radius = (roll < 0.66 ? 0.6 : roll < 0.92 ? 1.05 : 1.6) * unit;
      grain.plot(x, y, roll < 0.66 ? 0.4 + rng() * 0.35 : 0.9, radius);
    }
    grain.commit(out.getContext("2d"));
    return { layer: out, pad };
  }

  function drawSparkle(x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = Math.max(0.7, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size * 1.15);
    ctx.lineTo(x, y + size * 1.15);
    ctx.moveTo(x - size * 0.42, y - size * 0.42);
    ctx.lineTo(x + size * 0.42, y + size * 0.42);
    ctx.moveTo(x + size * 0.42, y - size * 0.42);
    ctx.lineTo(x - size * 0.42, y + size * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, size * 0.14), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlame(time, shake) {
    const rng = mulberry(motion > 0 ? (time * 60) | 0 : 5);
    const { r, cx } = rocket;
    const top = rocket.exit - lift;
    const flicker = 1 + (0.06 * Math.sin(time * 29) + 0.04 * Math.sin(time * 47)) * motion;
    const length = (frame.y + frame.h * 0.7 - rocket.exit + lift) * flicker;
    const size = 1.5 * unit;
    for (let i = 0; i < 2200; i += 1) {
      const u = rng() ** 1.2;
      const v = rng() * 2 - 1;
      const wobble = 1 + 0.1 * Math.sin(time * 31 + u * 12) * motion;
      const half = r * 0.62 * Math.sin(Math.min(1, 0.35 + u * 1.6) * Math.PI * 0.5) * (1 - u) ** 0.9 * wobble;
      const x = cx + shake + v * half;
      const y = top + u * length;
      const bright = (1 - u) ** 0.6 * (1 - 0.9 * v * v);
      if (rng() > bright * 1.25) continue;
      if (covered(x, y, 0)) continue;
      ctx.fillStyle = bright < heat * 0.8 ? ACCENT : "#fff";
      ctx.globalAlpha = Math.min(1, 0.45 + 0.55 * bright);
      ctx.fillRect(x - size / 2, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawChurn(time) {
    const ox = rocket.cx;
    const oy = frame.y + frame.h * 0.76;
    const reach = frame.h * 0.36;
    const size = 1.4 * unit;
    ctx.fillStyle = ACCENT;
    for (let i = 0; i < 140; i += 1) {
      const a = ((i * 137.5) % 360) * (Math.PI / 180);
      const speed = 0.18 + ((i * 29) % 17) / 60;
      const p = (time * speed + i * 0.071) % 1;
      const x = ox + Math.cos(a) * p * reach * 1.3;
      const y = oy + Math.abs(Math.sin(a)) * p * reach * 0.45;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85 * heat * titleFade(x, y);
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function paint(time) {
    if (!rocketLayer) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const drift = Math.sin(time * 0.55) * 4 * dpr * motion;
    ctx.drawImage(stars.layer, -stars.pad + drift, -stars.pad + drift * 0.4);
    sparkles.forEach(([x, y, size], index) => {
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 2.4 + index * 1.2));
      const alpha = 0.92 + (twinkle - 0.92) * motion;
      drawSparkle(frame.x + x * frame.w, frame.y + y * frame.h, size * (frame.w / 660), alpha);
    });
    const shake = Math.sin(time * 53) * 0.5 * dpr * motion;
    drawFlame(time, shake);
    ctx.drawImage(rocketLayer, shake, -lift);
    const breathe = 1 + 0.018 * Math.sin(time * 1.3) * (lift / (frame.h * 0.045));
    const anchorX = rocket.cx;
    const anchorY = frame.y + frame.h;
    ctx.setTransform(breathe, 0, 0, breathe, anchorX * (1 - breathe), anchorY * (1 - breathe));
    ctx.drawImage(cloudLayer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (heat > 0.02) drawChurn(time);
  }

  function layout() {
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    unit = dpr * Math.min(1, Math.max(0.6, rect.height / 760));
    width = Math.round(rect.width * BLEED * dpr);
    height = Math.round(rect.height * BLEED * dpr);
    canvas.width = width;
    canvas.height = height;
    const fw = rect.width * dpr;
    const fh = rect.height * dpr;
    frame = { x: (width - fw) / 2, y: (height - fh) / 2, w: fw, h: fh, titleRight: 0.44, titleTop: 0.86 };
    const title = card.querySelector("h2");
    if (title) {
      const box = title.getBoundingClientRect();
      frame.titleRight = (box.right - rect.left) / rect.width + 0.02;
      frame.titleTop = (box.top - rect.top) / rect.height - 0.02;
    }
    rocket = rocketGeometry();
    billows = buildBillows(mulberry(7));
    stars = renderStars(mulberry(11));
    rocketLayer = renderRocket(mulberry(29));
    cloudLayer = renderCloud(mulberry(41));
    paint(phase);
  }

  function applyTilt() {
    canvas.style.transform = `translate(-50%, -50%) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) scale(1.06)`;
  }

  function tick(now) {
    if (touchMotion.matches && now - last < 1000 / 30) {
      frameId = window.requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    phase += dt;
    heat += ((hovering ? 1 : 0) - heat) * Math.min(1, dt * 3);
    const ease = Math.min(1, dt * 2.2);
    motion += ((hovering ? 1 : 0) - motion) * ease;
    const targetYaw = hovering ? Math.sin(phase * 0.42) * 8 : 0;
    const targetPitch = hovering ? Math.cos(phase * 0.31) * 5.5 : 0;
    yaw += (targetYaw - yaw) * Math.min(1, dt * 1.6);
    pitch += (targetPitch - pitch) * Math.min(1, dt * 1.6);
    lift += ((hovering ? frame.h * 0.045 : 0) - lift) * ease;
    applyTilt();
    const settled = !hovering && motion < 0.01 && lift < 0.5 && heat < 0.02 && Math.abs(yaw) < 0.05 && Math.abs(pitch) < 0.05;
    if (settled) {
      motion = 0;
      lift = 0;
      heat = 0;
      yaw = 0;
      pitch = 0;
      applyTilt();
      paint(phase);
      frameId = 0;
      return;
    }
    paint(phase);
    frameId = window.requestAnimationFrame(tick);
  }

  const card = host.closest(".card");
  window.watchTileMotion(card, {
    enter() {
      if (reduced || !frame) return;
      hovering = true;
      if (frameId) return;
      last = performance.now();
      frameId = window.requestAnimationFrame(tick);
    },
    leave() { hovering = false; },
  });

  let resizeTimer = 0;
  canvas.style.transformOrigin = "center center";
  applyTilt();
  layout();
  if (document.fonts) document.fonts.ready.then(layout);
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  }).observe(host);
})();
