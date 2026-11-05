// The ink mask behind the homepage headline. The page and ink-worker.js both use
// this module, so either one produces exactly the same pixels.

export function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function drawInkSource(inkCtx, source, width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  inkCtx.clearRect(0, 0, width, height);
  inkCtx.filter = "blur(7px)";
  inkCtx.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight
  );
  inkCtx.filter = "none";
}

// Turns the blurred frame in `frame` into the opaque grey mask, in place.
export function inkMask(frame, width, height, values, inkHorizontal) {
  const pixels = frame.data;
  for (let p = 0, i = 0; i < pixels.length; i += 4, p += 1) {
    const luma = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    const light = smoothstep(0.28, 0.62, luma);
    values[p] = Math.round((1 - light) * 255);
  }
  // A separable maximum gives the same 3x3 mask without nine nested samples
  // per pixel, and both work buffers are reused across frames.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      inkHorizontal[p] = Math.max(values[p], values[p - (x > 0 ? 1 : 0)], values[p + (x < width - 1 ? 1 : 0)]);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      values[p] = Math.max(inkHorizontal[p], inkHorizontal[p - (y > 0 ? width : 0)], inkHorizontal[p + (y < height - 1 ? width : 0)]);
    }
  }
  for (let p = 0, i = 0; p < values.length; p += 1, i += 4) {
    pixels[i] = values[p];
    pixels[i + 1] = values[p];
    pixels[i + 2] = values[p];
    pixels[i + 3] = 255;
  }
}

export function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
