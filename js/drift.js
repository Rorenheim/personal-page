import { mountGlass } from "./glass.js";

const host = document.getElementById("field");
if (!host) throw new Error("Missing #field");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = window.matchMedia("(hover: none), (pointer: coarse)").matches;

const FIELD = "#e7e7e7";
const HEIGHT = mobile ? 240 : 420;
const FRAME_MS = 1000 / 30;
const TAU = Math.PI * 2;

// Positions and sizes are fractions of the canvas height so the composition
// holds on any aspect. Tones stay close to the field to keep text legible.
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

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

function resize() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  canvas.height = HEIGHT;
  canvas.width = Math.max(1, Math.round(HEIGHT * aspect));
}

// Each shape is drawn far off-canvas and only its blurred shadow lands in view,
// which gives soft edges without relying on `ctx.filter`.
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
}

resize();
render(0);

const poster = new Image();
poster.decoding = "async";
poster.src = canvas.toDataURL("image/png");

poster.addEventListener("load", () => {
  const { draw } = mountGlass(host, poster);
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

  // Capping the step keeps shapes from jumping after the tab was hidden.
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
