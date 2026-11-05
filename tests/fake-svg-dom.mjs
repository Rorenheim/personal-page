// A minimal DOM for running js/widgets.js in Node: just enough to parse the glyph
// markup, query parts by class, and record how dots are created and changed.
import { runInNewContext } from "node:vm";

export class FakeElement {
  constructor(tag, attrs = {}, stats) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.stats = stats;
    this.style = {};
    this.dataset = {};
    this.handlers = {};
    const element = this;
    this.classList = {
      add(name) { element.setAttribute("class", [...new Set([...element.classes(), name])].join(" ")); },
      toggle(name, on) {
        const rest = element.classes().filter((c) => c !== name);
        element.setAttribute("class", (on ? [...rest, name] : rest).join(" "));
      },
      contains(name) { return element.classes().includes(name); },
    };
    if (tag === "circle") stats.created += 1;
  }
  classes() { return (this.attrs.class || "").split(/\s+/).filter(Boolean); }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) {
    if (this.tag === "circle") this.stats.writes += 1;
    this.attrs[name] = String(value);
  }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  get viewBox() {
    const [, , width, height] = (this.attrs.viewBox || "0 0 0 0").split(" ").map(Number);
    return { baseVal: { width, height } };
  }
  set innerHTML(html) {
    this.stats.innerHTML += 1;
    this.children = [];
    const stack = [this];
    for (const [, close, tag, rest] of html.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
      if (close) { stack.pop(); continue; }
      const attrs = Object.fromEntries([...rest.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
      const child = new FakeElement(tag, attrs, this.stats);
      stack.at(-1).appendChild(child);
      if (!rest.trim().endsWith("/")) stack.push(child);
    }
  }
  matchesSelector(selector) {
    if (selector.startsWith(".")) return selector.slice(1).split(".").every((c) => this.classes().includes(c));
    return this.tag === selector;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matchesSelector(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  closest() { return this.trigger || null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 200 }; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  matches() { return false; }
}

// Visible dots per part, in document order, as "cx,cy,r" strings.
export function snapshot(host) {
  const out = [];
  const walk = (el, path) => {
    for (const child of el.children) {
      if (child.tag === "circle") {
        if (child.attrs.r !== "0") out.push(`${path}:${child.attrs.cx},${child.attrs.cy},${child.attrs.r}`);
      } else {
        walk(child, `${path}/${child.classes().filter((c) => c !== "is-moving").join(".")}`);
      }
    }
  };
  walk(host, "");
  return out.sort();
}

export const GLYPHS = ["about", "work", "blog", "books", "principles", "invader", "linkedin", "github", "mail"];

export function loadWidgets(source, { elements = {} } = {}) {
  const stats = { created: 0, writes: 0, innerHTML: 0 };
  const frames = [];
  const timers = [];
  let now = 0;
  const hosts = GLYPHS.map((glyph) => {
    const host = new FakeElement("div", {}, stats);
    host.dataset.glyph = glyph;
    host.trigger = new FakeElement("a", { class: "card" }, stats);
    return host;
  });
  const document = {
    hidden: false,
    querySelectorAll() { return hosts; },
    getElementById(id) { return elements[id] || null; },
    addEventListener() {},
    createElementNS(_ns, tag) { return new FakeElement(tag, {}, stats); },
  };
  const window = {
    matchMedia(query) {
      return { matches: query.includes("hover: hover"), addEventListener() {} };
    },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
  };
  runInNewContext(source, { window, document, performance: { now: () => now } });
  return {
    hosts,
    stats,
    runTimers() { timers.splice(0).forEach((fn) => fn()); },
    frame(ms = 16) {
      now += ms;
      const pending = frames.splice(0);
      pending.forEach((fn) => fn(now));
      return pending.length;
    },
    pointer(host, type, x, y) {
      host.trigger.handlers[type]?.({ pointerType: "mouse", clientX: x, clientY: y });
    },
  };
}
