import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export const base = process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

export async function openBrowser(port = 9228) {
  const profile = await mkdtemp(join(tmpdir(), "portfolio-prebaked-"));
  const browser = spawn("chromium", [
    "--headless", "--no-sandbox", "--disable-dev-shm-usage",
    "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank",
  ], { stdio: "ignore" });
  let socket;
  async function close() {
    socket?.close();
    browser.kill();
    await Promise.race([new Promise((done) => browser.once("exit", done)), sleep(2000)]);
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  try {
    let targets;
    for (let i = 0; i < 100; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
      if (targets?.some((target) => target.type === "page")) break;
      await sleep(100);
    }
    assert(targets, "Chromium did not start");
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    };
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    async function until(expression) {
      for (let i = 0; i < 300; i++) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error(`Condition not reached: ${expression}`);
    }
    async function navigate(path) {
      await evaluate("window.__testNavigationReady = false");
      await send("Page.navigate", { url: `${base}${path}` });
      await until("document.readyState === 'complete' && window.__testNavigationReady !== false");
    }
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.bringToFront");
    return { send, evaluate, until, navigate, close, errors };
  } catch (error) {
    await close();
    throw error;
  }
}
