// Live hover effect for HUD buttons.
// Only the element under the pointer grows and tilts towards the cursor in 3D; its neighbours stay put. Everything runs on springs in one rAF loop and the
// loop sleeps once every element is back at rest.
//
// Usage: give elements `data-mag` (optional value = strength, default 1) as direct children of a
// container, then call useMagnify(containerRef, 'groupName').

import { useEffect } from 'react';

const GROW = 0.08;        // extra scale at full hover (a slight grow, not a big pop)
const TILT = 8;           // max tilt in degrees
const PRESS = 0.92;
const STIFF = 260;
const DAMP = 20;
const EDGE = 8;           // px kept clear between a grown button and the window edge

const items = [];
let pointer = null;
let pressedEl = null;
let raf = 0;
let last = 0;
let lastMeasure = 0;
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function spring(c, key, target, dt) {
  const v = `v${key}`;
  c[v] = (c[v] || 0) + ((target - c[key]) * STIFF - (c[v] || 0) * DAMP) * dt;
  c[key] += c[v] * dt;
}

function atRest(c) {
  return Math.abs(c.s - 1) < 0.002 && Math.abs(c.x) < 0.2 && Math.abs(c.y) < 0.2
    && Math.abs(c.rx) < 0.1 && Math.abs(c.ry) < 0.1
    && Math.abs(c.vs || 0) < 0.01 && Math.abs(c.vx || 0) < 0.5 && Math.abs(c.vy || 0) < 0.5;
}

function measure(it) {
  const r = it.el.getBoundingClientRect();
  if (!r.width || !it.el.offsetWidth) return;
  it.base = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, k: r.width / it.el.offsetWidth };
}

function kick() {
  if (!raf && !reduced) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  raf = 0;
  const dt = Math.min(0.034, (now - last) / 1000);
  last = now;

  // refresh resting geometry (layout / window size may have changed)
  if (now - lastMeasure > 500) {
    lastMeasure = now;
    for (const it of items) if (!it.base || atRest(it.cur)) measure(it);
  }

  // targets: scale + tilt from the pointer
  for (const it of items) {
    const t = (it.t = { s: 1, x: 0, y: 0, rx: 0, ry: 0 });
    if (!pointer || !it.base) continue;
    const b = it.base;
    const dx = pointer.x - b.cx, dy = pointer.y - b.cy;
    const ox = Math.max(0, Math.abs(dx) - b.w / 2), oy = Math.max(0, Math.abs(dy) - b.h / 2);
    const d = Math.hypot(ox, oy);
    if (d > 0) continue;                       // only the element under the pointer reacts
    t.s = 1 + GROW * it.strength;
    {
      t.rx = -(dy / (b.h / 2)) * TILT;
      t.ry = (dx / (b.w / 2)) * TILT;
    }
    if (pressedEl === it.el) t.s *= PRESS;
    // slide the grown element back inside the window, so buttons at the screen edge are never cut off
    const hw = (b.w * t.s) / 2, hh = (b.h * t.s) / 2;
    const W = window.innerWidth, H = window.innerHeight;
    let sx = 0, sy = 0;
    if (b.cx - hw < EDGE) sx = EDGE - (b.cx - hw);
    else if (b.cx + hw > W - EDGE) sx = W - EDGE - (b.cx + hw);
    if (b.cy - hh < EDGE) sy = EDGE - (b.cy - hh);
    else if (b.cy + hh > H - EDGE) sy = H - EDGE - (b.cy + hh);
    t.x = sx / b.k;                            // translate() is in the element's own (unscaled) pixels
    t.y = sy / b.k;
  }

  let moving = false;
  for (const it of items) {
    const c = it.cur;
    for (const key of ['s', 'x', 'y', 'rx', 'ry']) spring(c, key, it.t[key], dt);
    if (atRest(c) && !pointer) {
      Object.assign(c, { s: 1, x: 0, y: 0, rx: 0, ry: 0, vs: 0, vx: 0, vy: 0, vrx: 0, vry: 0 });
      it.el.style.transform = '';
      it.el.style.zIndex = '';
      continue;
    }
    moving = true;
    it.el.style.transform = `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) perspective(520px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${c.s.toFixed(4)})`;
    it.el.style.zIndex = c.s > 1.02 ? '30' : '';
  }
  if (moving || pointer) raf = requestAnimationFrame(frame);
}

function onMove(e) {
  pointer = { x: e.clientX, y: e.clientY };
  kick();
}
function onDown(e) {
  pointer = { x: e.clientX, y: e.clientY };
  pressedEl = e.target.closest?.('[data-mag]') || null;
  kick();
}
function onUp(e) {
  pressedEl = null;
  if (e.pointerType !== 'mouse') pointer = null;
  kick();
}
function onLeave(e) {
  if (!e.relatedTarget) {
    pointer = null;
    kick();
  }
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  document.addEventListener('mouseout', onLeave);
  window.addEventListener('blur', () => { pointer = null; pressedEl = null; kick(); });
  window.addEventListener('resize', () => { for (const it of items) it.base = null; lastMeasure = 0; kick(); });
}

export function registerMagnifyGroup(container, group) {
  listen();
  const drop = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].container === container) {
        items[i].el.style.transform = '';
        items[i].el.style.zIndex = '';
        items.splice(i, 1);
      }
    }
  };
  const scan = () => {
    drop();
    container.querySelectorAll(':scope > [data-mag]').forEach((el) => {
      items.push({
        el, container, group,
        strength: Number(el.dataset.mag) || 1,
        base: null,
        cur: { s: 1, x: 0, y: 0, rx: 0, ry: 0 },
        t: { s: 1, x: 0, y: 0, rx: 0, ry: 0 },
      });
    });
    lastMeasure = 0;
    kick();
  };
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(container, { childList: true });
  return () => {
    mo.disconnect();
    drop();
  };
}

export function useMagnify(ref, group) {
  useEffect(() => {
    if (!ref.current) return undefined;
    return registerMagnifyGroup(ref.current, group);
  }, [ref, group]);
}
