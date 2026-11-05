import { mountGlass } from "./glass.js";

const host = document.getElementById("field");
if (!host) throw new Error("Missing #field");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = window.matchMedia("(hover: none), (pointer: coarse)").matches;

const FIELD = "#e7e7e7";
const DARK = document.documentElement.classList.contains("theme-dark");
const HEIGHT = mobile ? 240 : 420;
const FRAME_MS = 1000 / 30;
const TAU = Math.PI * 2;

// Original drawing from the supplied drift script, retaining mobile safeguards.
const SHAPES = [
  { kind: "disc", x: 0.18, y: 0.22, r: 0.2, tone: "#fbfbfb", ax: 0.1, ay: 0.08, px: 96, py: 78, phase: 0.2 },
  { kind: "disc", x: 0.82, y: 0.7, r: 0.26, tone: "#d3d3d3", ax: 0.12, ay: 0.06, px: 118, py: 84, phase: 1.7 },
  { kind: "capsule", x: 0.62, y: 0.2, r: 0.07, len: 0.36, tone: "#f6f6f6", ax: 0.08, ay: 0.1, px: 104, py: 66, phase: 3.1 },
  { kind: "ring", x: 0.36, y: 0.78, r: 0.13, line: 0.035, tone: "#d8d8d8", ax: 0.09, ay: 0.07, px: 88, py: 112, phase: 4.4 },
  { kind: "disc", x: 0.5, y: 0.48, r: 0.1, tone: "#f2f2f2", ax: 0.16, ay: 0.12, px: 72, py: 98, phase: 2.5 },
  { kind: "capsule", x: 0.12, y: 0.66, r: 0.05, len: 0.24, tone: "#d6d6d6", ax: 0.06, ay: 0.12, px: 120, py: 90, phase: 5.2 },
  { kind: "ring", x: 0.9, y: 0.16, r: 0.09, line: 0.028, tone: "#f8f8f8", ax: 0.07, ay: 0.08, px: 82, py: 106, phase: 0.9 },
  { kind: "disc", x: 0.7, y: 0.92, r: 0.12, tone: "#f5f5f5", ax: 0.1, ay: 0.05, px: 110, py: 70, phase: 3.8 },
];

// Slanted so the vertical flutes break each streak into steps as it slides sideways.
const STREAKS = [
  { x: 0.08, y: 0.3, len: 0.9, line: 0.014, angle: -1.05, tone: "#fafafa", ax: 0.14, px: 46, phase: 0.4 },
  { x: 0.34, y: 0.62, len: 0.7, line: 0.008, angle: -1.1, tone: "#d0d0d0", ax: 0.12, px: 58, phase: 2.1 },
  { x: 0.58, y: 0.4, len: 1.1, line: 0.02, angle: -1.0, tone: "#f4f4f4", ax: 0.1, px: 64, phase: 3.6 },
  { x: 0.8, y: 0.74, len: 0.6, line: 0.01, angle: -1.12, tone: "#d5d5d5", ax: 0.16, px: 40, phase: 5.0 },
  { x: 0.94, y: 0.24, len: 0.8, line: 0.006, angle: -0.98, tone: "#fdfdfd", ax: 0.12, px: 52, phase: 1.2 },
];

const ARCS = [
  { x: 0.28, y: 0.42, r: 0.34, span: 1.7, line: 0.018, tone: "#f7f7f7", period: 54, phase: 0.6 },
  { x: 0.74, y: 0.34, r: 0.2, span: 2.3, line: 0.01, tone: "#d2d2d2", period: -72, phase: 2.8 },
];

const random = (seed) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const MOTES = Array.from({ length: 18 }, (_, i) => ({
  x: random(i + 1),
  y: random(i + 41),
  r: 0.012 + random(i + 81) * 0.026,
  rise: 0.006 + random(i + 121) * 0.008,
  sway: 0.01 + random(i + 161) * 0.02,
  period: 14 + random(i + 201) * 14,
  grey: i % 3 === 0 ? 200 : 255,
  alpha: 0.5 + random(i + 241) * 0.4,
}));

const SWEEP_SECONDS = 34;

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

function resize() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  canvas.height = HEIGHT;
  canvas.width = Math.max(1, Math.round(HEIGHT * aspect));
}

function soft(tone, blur, paint) {
  const away = canvas.width * 4;
  ctx.save();
  ctx.translate(-away, 0);
  ctx.shadowOffsetX = away;
  ctx.shadowColor = tone;
  ctx.shadowBlur = blur;
  ctx.fillStyle = tone;
  ctx.strokeStyle = tone;
  paint();
  ctx.restore();
}

function render(seconds) {
  const h = canvas.height;
  const w = canvas.width;
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, w, h);
  for (const s of SHAPES) {
    const cx = (s.x + s.ax * Math.sin((TAU * seconds) / s.px + s.phase)) * w;
    const cy = (s.y + s.ay * Math.cos((TAU * seconds) / s.py + s.phase * 1.3)) * h;
    const r = s.r * h;
    if (s.kind === "disc") {
      soft(s.tone, r * 0.7, () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      });
    } else if (s.kind === "ring") {
      soft(s.tone, r * 0.25, () => {
        ctx.lineWidth = s.line * h;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
      });
    } else {
      const half = (s.len * h) / 2;
      const tilt = 0.35 * Math.sin((TAU * seconds) / (s.px * 1.6) + s.phase);
      soft(s.tone, r * 0.8, () => {
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 2 + tilt);
        ctx.lineCap = "round";
        ctx.lineWidth = r * 2;
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(half, 0);
        ctx.stroke();
      });
    }
  }
  renderSweep(seconds, w, h);
  for (const a of ARCS) {
    const start = (TAU * seconds) / a.period + a.phase;
    soft(a.tone, a.line * h * 1.5, () => {
      ctx.lineWidth = a.line * h;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(a.x * w, a.y * h, a.r * h, start, start + a.span);
      ctx.stroke();
    });
  }
  for (const s of STREAKS) {
    const cx = (s.x + s.ax * Math.sin((TAU * seconds) / s.px + s.phase)) * w;
    const half = (s.len * h) / 2;
    const angle = s.angle + 0.06 * Math.sin((TAU * seconds) / (s.px * 1.4) + s.phase);
    soft(s.tone, s.line * h * 1.2, () => {
      ctx.translate(cx, s.y * h);
      ctx.rotate(angle);
      ctx.lineCap = "round";
      ctx.lineWidth = s.line * h;
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    });
  }
  for (const m of MOTES) {
    const travel = (m.y - seconds * m.rise) % 1.3;
    const cy = ((travel + 1.3) % 1.3 - 0.15) * h;
    const cx = (m.x + m.sway * Math.sin((TAU * seconds) / m.period + m.x * TAU)) * w;
    const r = m.r * h;
    const tone = `${m.grey}, ${m.grey}, ${m.grey}`;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, `rgba(${tone}, ${m.alpha})`);
    glow.addColorStop(0.55, `rgba(${tone}, ${m.alpha * 0.55})`);
    glow.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  if (DARK) {
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
}

// A faint slanted band of light crosses the field, then waits off-screen before the next pass.
function renderSweep(seconds, w, h) {
  const progress = (seconds % SWEEP_SECONDS) / SWEEP_SECONDS;
  const center = (progress * 2.2 - 0.6) * w;
  const band = 0.22 * w + 0.3 * h;
  const lean = 0.45 * h;
  const sheen = ctx.createLinearGradient(center - band, -lean, center + band, lean);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.42)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

resize();
render(0);
const poster = new Image();
poster.decoding = "async";
poster.src = canvas.toDataURL("image/png");
poster.addEventListener("load", async () => {
  const { draw, compiled } = mountGlass(host, poster);
  await compiled;
  let elapsed = 0;
  let last = performance.now();
  const paint = () => {
    render(elapsed / 1000);
    draw(canvas, canvas.width, canvas.height);
  };
  window.addEventListener("resize", () => {
    resize();
    paint();
  });
  paint();
  if (reducedMotion) return;
  const loop = (now) => {
    if (mobile && document.hidden) {
      last = now;
      requestAnimationFrame(loop);
      return;
    }
    const step = now - last;
    if (step >= FRAME_MS) {
      last = now;
      elapsed += Math.min(step, 100);
      paint();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, { once: true });
