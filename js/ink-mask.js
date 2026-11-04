// Same luminance curve and 3×3 maximum filter as the original text mask.
// Reuse scratch space and separate the square filter into two linear passes.
export function createInkMask() {
  let values = new Uint8Array(0);
  let horizontal = new Uint8Array(0);
  return (pixels, width, height) => {
    const count = width * height;
    if (values.length !== count) {
      values = new Uint8Array(count);
      horizontal = new Uint8Array(count);
    }
    for (let p = 0, i = 0; p < count; p++, i += 4) {
      const luma = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
      const t = Math.min(1, Math.max(0, (luma - 0.28) / (0.62 - 0.28)));
      values[p] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
    }
    for (let y = 0; y < height; y++) {
      const start = y * width;
      const end = start + width - 1;
      for (let p = start; p <= end; p++) {
        horizontal[p] = Math.max(
          values[p === start ? p : p - 1], values[p], values[p === end ? p : p + 1],
        );
      }
    }
    for (let y = 0; y < height; y++) {
      const row = y * width;
      const above = y === 0 ? row : row - width;
      const below = y === height - 1 ? row : row + width;
      for (let x = 0; x < width; x++) {
        const value = Math.max(horizontal[above + x], horizontal[row + x], horizontal[below + x]);
        const i = (row + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
        pixels[i + 3] = 255;
      }
    }
  };
}
