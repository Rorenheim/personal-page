import { drawInkSource, inkMask, sameBytes } from "./ink-mask.js";

let canvas = null;
let inkCtx = null;
let values = new Uint8Array(0);
let inkHorizontal = new Uint8Array(0);
let previous = null;

self.onmessage = async ({ data }) => {
  const { id, bitmap, width, height, sourceWidth, sourceHeight, check } = data;
  try {
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      inkCtx = canvas.getContext("2d", { willReadFrequently: true });
      values = new Uint8Array(width * height);
      inkHorizontal = new Uint8Array(values.length);
      previous = null;
    }
    drawInkSource(inkCtx, bitmap, width, height, sourceWidth, sourceHeight);
    bitmap.close();
    const frame = inkCtx.getImageData(0, 0, width, height);
    inkMask(frame, width, height, values, inkHorizontal);
    if (check) {
      self.postMessage({ id, type: "check", values: values.slice() });
      return;
    }
    if (sameBytes(previous, values)) {
      self.postMessage({ id, type: "same" });
      return;
    }
    previous = previous || new Uint8Array(values.length);
    previous.set(values);
    inkCtx.putImageData(frame, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    self.postMessage({ id, type: "mask", blob });
  } catch (error) {
    bitmap?.close?.();
    self.postMessage({ id, type: "error", message: String(error) });
  }
};
