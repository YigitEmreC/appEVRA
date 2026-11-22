// Reusable UI pieces: cards, switches, sliders, IR buttons and charts.

import { h, hourText } from './util.js';
import { icon } from './icons.js';
import { store } from './store.js';

export function card({ title, iconName, extra, className = '' }, ...body) {
  return h('section', { class: `card ${className}` },
    title ? h('header', { class: 'card-head' },
      iconName ? h('span', { class: 'card-icon' }, icon(iconName, 20)) : null,
      h('h2', null, title),
      extra ? h('div', { class: 'card-extra' }, extra) : null) : null,
    body);
}

// An on/off switch. Returns the element with .set(on, disabled).
export function toggle(label, onChange) {
  const el = h('button', { class: 'switch', role: 'switch', 'aria-checked': 'false', 'aria-label': label, type: 'button' }, h('span', { class: 'knob' }));
  let on = false;
  el.addEventListener('click', () => {
    if (el.disabled) return;
    on = !on;
    el.setAttribute('aria-checked', String(on));
    const result = onChange(on);
    if (result && typeof result.catch === 'function') {
      result.catch(() => { on = !on; el.setAttribute('aria-checked', String(on)); });
    }
  });
  el.set = (value, disabled = false) => {
    on = !!value;
    el.setAttribute('aria-checked', String(on));
    el.disabled = disabled;
  };
  return el;
}

// A range slider that only sends when the finger lifts. Returns the wrapper with .set(value).
export function slider({ label, min = 0, max = 100, step = 1, unit = '%', onCommit }) {
  const out = h('output', { class: 'slider-value' });
  const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
  let dragging = false;
  input.addEventListener('input', () => { dragging = true; out.textContent = input.value + unit; paint(); });
  input.addEventListener('change', () => { dragging = false; onCommit(Number(input.value)); });
  function paint() {
    const pct = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }
  const wrap = h('div', { class: 'slider' }, h('div', { class: 'slider-top' }, h('span', null, label), out), input);
  wrap.set = (value, disabled = false) => {
    input.disabled = disabled;
    if (dragging || value == null) return;
    input.value = value;
    out.textContent = value + unit;
    paint();
  };
  return wrap;
}

// A button that presses a Home Assistant button entity (an IR code) and pulses
// when Home Assistant confirms the press.
export function irButton(entityId, { label, iconName, className = '', size = 22, text } = {}, cleanup) {
  const el = h('button', { class: `ir-btn ${className}`, type: 'button', 'aria-label': label, title: label },
    iconName ? icon(iconName, size) : null,
    text != null ? h('span', { class: 'ir-text' }, text) : null);
  el.addEventListener('click', async () => {
    el.classList.add('sending');
    try { await store.press(entityId); } catch { /* toast already shown */ }
    setTimeout(() => el.classList.remove('sending'), 250);
  });
  // A button's state is the time it was last pressed, so a new value from a
  // known previous value means Home Assistant confirmed a press.
  let prev;
  let pulseTimer;
  const off = store.watch(entityId, (s) => {
    el.disabled = !s || s.state === 'unavailable';
    const value = s ? s.state : null;
    if (prev && value && value !== prev && value !== 'unavailable' && value !== 'unknown') {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => el.classList.remove('pulse'), 800);
    }
    prev = value;
  });
  if (cleanup) cleanup.push(off);
  return el;
}

export function chip(iconName, text, className = '') {
  const label = h('span', null, text);
  const el = h('span', { class: `chip ${className}` }, icon(iconName, 16), label);
  el.setText = (t) => { label.textContent = t; };
  return el;
}

// ---- charts --------------------------------------------------------------

// A vertical fade used to fill the area under a line. Returns its url().
let gradientCount = 0;
function fadeFill(svg, cls) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const id = `fade-${++gradientCount}`;
  const defs = document.createElementNS(svgNS, 'defs');
  const lg = document.createElementNS(svgNS, 'linearGradient');
  lg.setAttribute('id', id);
  lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
  for (const [offset, part] of [['0', 'top'], ['1', 'bottom']]) {
    const stop = document.createElementNS(svgNS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('class', `fade-${part} ${cls}`);
    lg.append(stop);
  }
  defs.append(lg);
  svg.append(defs);
  return `url(#${id})`;
}

// Step line (each value holds until the next change) plus a filled area under
// it, with gaps where the sensor was unavailable.
function stepPaths(rows, { t0, t1, x, y, bottom }) {
  let line = '', area = '', pen = false, lastX = 0, lastY = 0, last = null;
  const f = (n) => n.toFixed(1);
  rows.forEach(([t, v], i) => {
    const next = i + 1 < rows.length ? rows[i + 1][0] : Math.min(Date.now(), t1);
    if (!Number.isFinite(v)) {
      if (pen) area += `L${f(lastX)},${bottom}Z`;
      pen = false;
      last = null;
      return;
    }
    const xa = x(Math.max(t, t0)), xb = x(Math.min(next, t1)), yy = y(v);
    if (pen) { line += `L${f(xa)},${f(yy)}`; area += `L${f(xa)},${f(yy)}`; }
    else { line += `M${f(xa)},${f(yy)}`; area += `M${f(xa)},${bottom}L${f(xa)},${f(yy)}`; }
    line += `L${f(xb)},${f(yy)}`;
    area += `L${f(xb)},${f(yy)}`;
    lastX = xb; lastY = yy; pen = true;
    last = [xb, yy];
  });
  if (pen) area += `L${f(lastX)},${bottom}Z`;
  return { line, area, last };
}

// A small chart without axes, stretched to the card width.
export function sparkline(rows, { start, end, height = 48, cls = '' }) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 300, H = height;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('aria-hidden', 'true');
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const parsed = rows.map(([t, v]) => [Date.parse(t), parseFloat(v)]);
  const values = parsed.map((r) => r[1]).filter(Number.isFinite);
  if (!values.length) return svg;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (H - 8);
  const { line, area } = stepPaths(parsed, { t0, t1, x, y, bottom: String(H) });
  const fill = fadeFill(svg, cls);
  for (const [d, c] of [[area, 'chart-area'], [line, 'chart-line']]) {
    if (!d) continue;
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', `${c} ${cls}`);
    if (c === 'chart-area') p.setAttribute('fill', fill);
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(p);
  }
  return svg;
}

// Drag to reorder the direct children of container that match `item`.
// Works with a mouse, a finger or a pen. A press on `handle` starts at once.
// With `anywhere`, the whole item can be dragged too: straight away with a
// mouse, and after a short press-and-hold with a finger, so the page still
// scrolls when someone just swipes. onEnd(el) runs after a drop that changed
// the order. Presses on `ignore` (buttons inside an item) never start a drag.
// When containers are nested, the innermost one that can drag wins.
export function sortable(container, { item, handle, ignore, onEnd, anywhere = false }) {
  let active = false;
  // Stops the page scrolling under a finger that's dragging. It has to be
  // there before the touch starts, so it's always on and checks `active`.
  container.addEventListener('touchmove', (ev) => { if (active) ev.preventDefault(); }, { passive: false });
  container.addEventListener('contextmenu', (ev) => { if (active || container.classList.contains('edit-zone')) ev.preventDefault(); });

  container.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.evraSorted) return;
    if (ignore && e.target.closest(ignore)) return;
    const grip = e.target.closest(handle);
    let el = grip?.closest(item);
    const byHandle = !!el && el.parentElement === container && el.matches(item);
    if (!byHandle) {
      if (!anywhere) return;
      el = e.target;
      while (el && el.parentElement !== container) el = el.parentElement;
      if (!el || !el.matches(item)) return;
    }
    e.evraSorted = true;
    if (byHandle || e.pointerType !== 'touch') { e.preventDefault(); start(e, el, byHandle ? grip : el); return; }

    // A finger on the item itself: wait for press-and-hold.
    const sx = e.clientX, sy = e.clientY;
    const timer = setTimeout(() => { stopWaiting(); navigator.vibrate?.(12); start(e, el, el); }, 380);
    const moved = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) stopWaiting(); };
    function stopWaiting() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', moved);
      window.removeEventListener('pointerup', stopWaiting);
      window.removeEventListener('pointercancel', stopWaiting);
    }
    window.addEventListener('pointermove', moved);
    window.addEventListener('pointerup', stopWaiting);
    window.addEventListener('pointercancel', stopWaiting);
  });

  function start(e, el, captor) {
    try { captor.setPointerCapture(e.pointerId); } catch { /* not supported or already gone */ }
    active = true;
    const before = [...container.children].indexOf(el);
    const sx = e.clientX, sy = e.clientY;
    let lifted = false;
    // A finger that held on gets the lifted look straight away; a mouse after it moves a little.
    const lift = () => { lifted = true; el.classList.add('dragging'); container.classList.add('sorting'); };
    if (e.pointerType === 'touch') lift();
    let scroll = 0;
    const scroller = setInterval(() => { if (scroll) window.scrollBy(0, scroll); }, 16);
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!lifted) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; lift(); }
      scroll = ev.clientY < 90 ? -10 : ev.clientY > window.innerHeight - 130 ? 10 : 0;
      // The child of this container under the pointer (things can be nested).
      let over = document.elementFromPoint(ev.clientX, ev.clientY);
      while (over && over.parentElement !== container) over = over.parentElement;
      if (!over || over === el || !over.matches(item)) return;
      const later = el.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING;
      container.insertBefore(el, later ? over.nextSibling : over);
    };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      active = false;
      clearInterval(scroller);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      el.classList.remove('dragging');
      container.classList.remove('sorting');
      if ([...container.children].indexOf(el) !== before) onEnd(el);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }
}

// A device tile: coloured icon, name, state line and an optional switch.
// Returns the card with .setState(text, on).
export function deviceCard({ title, iconName, tone, sw, className = '' }, ...body) {
  const state = h('p', { class: 'device-state' }, '–');
  const el = h('section', { class: `card device ${className}`, style: tone ? { '--tone': tone } : null },
    h('header', { class: 'device-head' },
      h('span', { class: 'device-icon' }, icon(iconName, 22)),
      h('div', { class: 'device-titles' }, h('h2', null, title), state),
      sw || null),
    body);
  el.setState = (text, on) => {
    state.textContent = text;
    el.classList.toggle('is-on', !!on);
  };
  return el;
}

// Chart width in drawing units roughly matches its width on screen, so the
// axis text stays readable on a phone as well as on a desktop.
const chartWidth = () => Math.round(window.innerWidth < 900 ? Math.max(280, Math.min(640, window.innerWidth - 72)) : 560);

// Line chart for numeric history. series: [{ rows: [[iso, state]], cls }]
export function lineChart({ series, start, end, height = 160, unit = '', band, digits = 1 }) {
  const W = chartWidth();
  const H = height, padL = 36, padR = 8, padT = 10, padB = 22;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const pts = series.map((s) => ({
    cls: s.cls,
    rows: s.rows.map(([t, v]) => [Date.parse(t), parseFloat(v)]),
  }));
  const values = pts.flatMap((s) => s.rows.map((r) => r[1]).filter(Number.isFinite));
  if (!values.length) {
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', W / 2); t.setAttribute('y', H / 2); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'chart-empty');
    t.textContent = 'No data in this period';
    svg.append(t);
    return svg;
  }
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  if (band && band.max > lo && band.min < hi) {
    const top = y(Math.min(band.max, hi)), bottom = y(Math.max(band.min, lo));
    add('rect', { x: padL, y: top, width: W - padL - padR, height: Math.max(0, bottom - top), class: 'chart-band' });
  }
  for (const v of [lo + pad, hi - pad]) {
    add('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'chart-grid' });
    add('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-label' }, v.toFixed(digits));
  }
  const ticks = W < 440 ? 2 : 4;
  for (let i = 0; i <= ticks; i++) {
    const t = t0 + ((t1 - t0) * i) / ticks;
    add('text', { x: x(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === ticks ? 'end' : 'middle', class: 'chart-label' }, hourText(t));
  }
  const bottom = (H - padB).toFixed(1);
  for (const s of pts) {
    const { line, area, last } = stepPaths(s.rows, { t0, t1, x, y, bottom });
    if (area) add('path', { d: area, class: `chart-area ${s.cls || ''}`, fill: fadeFill(svg, s.cls || '') });
    if (line) add('path', { d: line, class: `chart-line ${s.cls || ''}` });
    if (last) add('circle', { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 3.5, class: `chart-dot ${s.cls || ''}` });
  }
  svg.setAttribute('aria-label', `Chart${unit ? ' in ' + unit : ''}`);
  return svg;
}

// On/off timeline. rows: [{ label, rows: [[iso, state]], cls }]
export function timeline({ lanes, start, end }) {
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const wrap = h('div', { class: 'timeline' });
  for (const lane of lanes) {
    const bar = h('div', { class: 'tl-bar' });
    lane.rows.forEach(([t, s], i) => {
      const a = Math.max(Date.parse(t), t0);
      const b = Math.min(i + 1 < lane.rows.length ? Date.parse(lane.rows[i + 1][0]) : Math.min(Date.now(), t1), t1);
      if (b <= a) return;
      const cls = s === 'on' ? lane.cls : s === 'unavailable' || s === 'unknown' ? 'tl-gap' : null;
      if (!cls) return;
      bar.append(h('span', { class: `tl-seg ${cls}`, style: { left: ((a - t0) / (t1 - t0)) * 100 + '%', width: Math.max(0.3, ((b - a) / (t1 - t0)) * 100) + '%' } }));
    });
    wrap.append(h('div', { class: 'tl-lane' }, h('span', { class: 'tl-label' }, lane.label), bar));
  }
  wrap.append(h('div', { class: 'tl-axis' }, h('span', null, hourText(t0)), h('span', null, hourText((t0 + t1) / 2)), h('span', null, 'now')));
  return wrap;
}
