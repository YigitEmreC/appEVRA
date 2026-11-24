// The house model on Home (where the room chips used to be): the home's rooms as a small
// isometric doll's house, each room furnished after its name (js/rooms.js roomType), and
// every device as a glowing marker in its room, coloured by what it does (like the house
// tour on the Evra website). Rooms with a light on glow warm; alarms pulse red.
//
//   homeModel({ rooms, devices, loose, selected, onPick, onDevice, floors, floor, onFloor, enter, cleanup }) -> element
//     rooms     the areas to draw, in order (each becomes one room of the plan)
//     devices   the home's devices; loose: those without a room (a row under the house)
//     selected  the picked area_id or 'all'
//     onPick    (area_id | 'all') when a room (or "Tüm odalar") is tapped
//     onDevice  (device) when a marker is tapped
//     floors    with more than one floor: [{ key, name, level }]; the model shows one floor
//               (rooms = that floor's rooms) and up/down buttons and a floor list beside it
//     floor     the shown floor's key; onFloor(key) when another floor is chosen
//     enter     'up' | 'down': the floor was just changed that way (a short slide)
//
// Geometry: plan coordinates in metres-ish, x to the lower right, y to the lower left,
// z up; proj() turns them into SVG units. The back walls are at x = 0 and y = 0 (top left
// and top right on screen), so furniture stands against them and faces the viewer.
// Colours are CSS variables (--hm-*, the "House model" part of app.css), so themes recolour it.

import { store, deviceName, deviceEntities } from './store.js';
import { h, isOn, dec, numVal } from './util.js';
import { icon } from './icons.js';
import { kindOf, kindIcon } from './devices/cards.js';
import { productForDevice } from './catalog.js';
import { roomType, roomBadges } from './rooms.js';

const NS = 'http://www.w3.org/2000/svg';
const U = 40;                     // SVG units per plan unit
const CX = Math.cos(Math.PI / 6);
const ZS = 0.82;                  // isometric height scale
const T = 0.16;                   // wall thickness
const H_BACK = 1.3, H_IN = 0.9, H_FRONT = 0.2;
const DEPTH = 4.2;                // depth of a row of rooms
const MARKER_Z = 0.95;            // markers float at this height
const M = 0.14;                   // furniture keeps this far from the walls

const proj = (x, y, z = 0) => [(x - y) * CX * U, ((x + y) * 0.5 - z * ZS) * U];
const pts = (list) => list.map((p) => proj(...p).map((n) => n.toFixed(1)).join(',')).join(' ');

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  el.append(...kids.flat().filter(Boolean));
  return el;
}

// ---- drawing pieces ---------------------------------------------------------------

// A box standing on the floor at (x, y), w × d × hgt; only the three faces the viewer sees.
// Pieces resting on others are raised with lift().
function box(x, y, w, d, hgt, colour, cls = '') {
  const z = 0, t = hgt;
  return s('g', { class: `hm-box ${cls}`.trim(), style: `--c: var(--hm-${colour})` },
    s('polygon', { class: 'hm-l', points: pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t]]) }),
    s('polygon', { class: 'hm-r', points: pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t]]) }),
    s('polygon', { class: 'hm-t', points: pts([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]]) }));
}
const flat = (x, y, w, d, colour, z = 0.01, cls = 'hm-flat') => s('polygon', {
  class: cls, style: `--c: var(--hm-${colour})`, points: pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]]),
});
// A round rug: a circle on the floor (an ellipse on screen).
function roundRug(cx, cy, r, colour) {
  const list = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; list.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.01]); }
  return s('polygon', { class: 'hm-flat', style: `--c: var(--hm-${colour})`, points: pts(list) });
}
function plant(x, y, size = 1) {
  const p = 0.3 * size;
  const g = s('g', { class: 'hm-plant' }, box(x - p / 2, y - p / 2, p, p, 0.28 * size, 'pot'));
  for (const [dx, dy, z, r, b] of [[0.02, 0.1, 0.55, 0.22, 1], [-0.12, 0.04, 0.68, 0.2, 0], [0.12, -0.06, 0.7, 0.2, 1], [0, -0.02, 0.9, 0.19, 0]]) {
    const [cx, cy] = proj(x + dx * size, y + dy * size, z * size);
    g.append(s('circle', { class: b ? 'hm-leaf b' : 'hm-leaf', cx: cx.toFixed(1), cy: cy.toFixed(1), r: (r * size * U).toFixed(1) }));
  }
  return g;
}
// A circle on a box's front face (a washing machine's door).
function faceCircle(cx, y, cz, r) {
  const list = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; list.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]); }
  return s('polygon', { class: 'hm-porthole', points: pts(list) });
}
function bed(x, y, bw, bl, blanket = 'blanket') {
  return [
    box(x - 0.05, y, bw + 0.1, 0.12, 0.78, 'bedframe'),
    box(x, y + 0.1, bw, bl, 0.26, 'bedframe'),
    box(x + 0.05, y + 0.12, bw - 0.1, bl - 0.06, 0.14, 'linen'),
    box(x + 0.03, y + 0.12 + bl * 0.4, bw - 0.06, bl * 0.58, 0.16, blanket),
    box(x + 0.1, y + 0.2, bw / 2 - 0.16, 0.34, 0.12, 'linen-2'),
    box(x + bw / 2 + 0.06, y + 0.2, bw / 2 - 0.16, 0.34, 0.12, 'linen-2'),
  ].map((el, i) => (i >= 2 ? lift(el, i === 2 ? 0.26 : i === 3 ? 0.28 : 0.4) : el));
}
// Moves a drawn piece up by z (for pieces resting on others).
function lift(el, z) { el.setAttribute('transform', `translate(0 ${(-z * ZS * U).toFixed(1)})`); return el; }

// ---- furniture by kind of room --------------------------------------------------------
// Each returns [{ el, k }] where k (the piece's back corner, x + y) orders the drawing.

const piece = (el, x, y) => ({ el, k: x + y });

// A seam on a box's face (door and drawer lines, handles): a line through plan points.
const seam = (...list) => s('polyline', { class: 'hm-seam', points: pts(list) });
// A floor lamp: a thin pole with a shade (the shade glows while the room's light is on).
function floorLamp(x, y) {
  return s('g', null, box(x - 0.03, y - 0.03, 0.06, 0.06, 1.15, 'wood-dark'), box(x - 0.13, y - 0.13, 0.26, 0.26, 0.04, 'wood-dark'),
    lift(box(x - 0.16, y - 0.16, 0.32, 0.32, 0.24, 'lamp', 'hm-lamp'), 1.02));
}
// A small lamp standing on something at height z.
const tableLamp = (x, y, z) => lift(box(x, y, 0.2, 0.2, 0.2, 'lamp', 'hm-lamp'), z);
// An armchair facing the room (back against +x).
function armchair(x, y, colour = 'sofa-2') {
  return s('g', null, box(x, y, 0.62, 0.62, 0.32, colour), box(x + 0.44, y, 0.18, 0.62, 0.66, colour),
    box(x, y, 0.62, 0.14, 0.46, colour), box(x, y + 0.48, 0.62, 0.14, 0.46, colour),
    lift(box(x + 0.06, y + 0.14, 0.38, 0.34, 0.08, 'cushion'), 0.32));
}
// A wardrobe against the x = 0 wall, its doors facing the room.
function wardrobe(x, y, len, hgt = 1.3, colour = 'wood-light') {
  const fx = x + 0.58;
  return s('g', null, box(x, y, 0.58, len, hgt, colour),
    seam([fx, y + len / 2, 0.06], [fx, y + len / 2, hgt - 0.06]),
    seam([fx, y + len / 2 - 0.1, hgt * 0.5], [fx, y + len / 2 - 0.1, hgt * 0.62]),
    seam([fx, y + len / 2 + 0.1, hgt * 0.5], [fx, y + len / 2 + 0.1, hgt * 0.62]));
}
// A low cabinet against the y = 0 wall with drawers on its front.
function sideboard(x, y, w, hgt, colour) {
  const fy = y + 0.42;
  const g = s('g', null, box(x, y, w, 0.42, hgt, colour));
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 1; i < n; i++) g.append(seam([x + (w / n) * i, fy, 0.04], [x + (w / n) * i, fy, hgt - 0.04]));
  return g;
}
// A toilet against the x = 0 wall.
function toilet(x, y) {
  return s('g', null, box(x, y, 0.2, 0.46, 0.78, 'porcelain'), box(x + 0.2, y + 0.05, 0.42, 0.36, 0.36, 'porcelain'),
    lift(box(x + 0.22, y + 0.07, 0.38, 0.32, 0.04, 'linen-2'), 0.36));
}
// A washbasin with a mirror above it, against the y = 0 wall.
function basin(x, y, w = 0.56) {
  return s('g', null, box(x + w / 2 - 0.08, y + 0.08, 0.16, 0.16, 0.62, 'porcelain'),
    lift(box(x, y, w, 0.4, 0.12, 'porcelain'), 0.62), lift(box(x + 0.08, y + 0.08, w - 0.16, 0.24, 0.01, 'water'), 0.73),
    lift(box(x + 0.04, y - 0.02, w - 0.08, 0.04, 0.5, 'mirror'), 0.95));
}

const FURNISH = {
  living({ x, y, w, d }) {
    const sl = Math.min(2.2, d * 0.5), sy = y + d * 0.25;
    const tvw = Math.min(1.8, w * 0.42), tvx = x + w * 0.42;
    const tw = Math.min(0.8, w * 0.18), tx = x + w * 0.36, ty = y + d * 0.42;
    return [
      piece(s('g', null,
        box(x + M, sy, 0.86, sl, 0.34, 'sofa'), box(x + M, sy, 0.24, sl, 0.76, 'sofa'),
        box(x + M, sy, 0.86, 0.2, 0.5, 'sofa'), box(x + M, sy + sl - 0.2, 0.86, 0.2, 0.5, 'sofa'),
        lift(box(x + M + 0.24, sy + 0.22, 0.58, sl / 2 - 0.24, 0.1, 'cushion'), 0.34),
        lift(box(x + M + 0.24, sy + sl / 2 + 0.02, 0.58, sl / 2 - 0.24, 0.1, 'cushion'), 0.34),
        lift(box(x + M + 0.26, sy + 0.3, 0.14, 0.42, 0.3, 'sofa-2'), 0.44),
        lift(box(x + M + 0.26, sy + sl - 0.72, 0.14, 0.42, 0.3, 'toy'), 0.44)), x + M, sy),
      piece(floorLamp(x + M + 0.3, sy - 0.32), x + M + 0.15, sy - 0.47),
      piece(s('g', null, box(tx, ty, tw, 0.95, 0.24, 'table'), lift(box(tx + 0.12, ty + 0.2, 0.22, 0.3, 0.05, 'blanket'), 0.24),
        lift(box(tx + tw - 0.26, ty + 0.62, 0.12, 0.12, 0.18, 'pot'), 0.24)), tx, ty),
      piece(s('g', null, sideboard(tvx, y + M, tvw, 0.34, 'wood-dark'),
        lift(box(tvx + 0.15, y + M + 0.16, tvw - 0.3, 0.06, 0.66, 'screen', 'hm-tv'), 0.34),
        lift(box(tvx + tvw * 0.3, y + M + 0.26, tvw * 0.4, 0.1, 0.07, 'screen'), 0.34)), tvx, y + M),
      piece(armchair(x + w * 0.7, y + d * 0.66), x + w * 0.7, y + d * 0.66),
      piece(plant(x + w - 0.42, y + 0.45, 1.1), x + w - 0.6, y + 0.3),
    ];
  },
  bedroom({ x, y, w, d }) {
    const bw = Math.min(1.6, w * 0.4), bl = Math.min(2.1, d * 0.52);
    const bx = x + w * 0.52 - bw / 2, by = y + M;
    return [
      piece(s('g', null, ...bed(bx, by, bw, bl)), bx, by),
      piece(s('g', null, box(bx - 0.55, by + 0.05, 0.42, 0.42, 0.44, 'wood'), seam([bx - 0.55, by + 0.47, 0.22], [bx - 0.13, by + 0.47, 0.22]), tableLamp(bx - 0.44, by + 0.16, 0.44)), bx - 0.55, by),
      piece(s('g', null, box(bx + bw + 0.13, by + 0.05, 0.42, 0.42, 0.44, 'wood'), seam([bx + bw + 0.13, by + 0.47, 0.22], [bx + bw + 0.55, by + 0.47, 0.22]), tableLamp(bx + bw + 0.24, by + 0.16, 0.44)), bx + bw + 0.13, by),
      piece(box(bx + 0.1, by + bl + 0.22, bw - 0.2, 0.36, 0.4, 'sofa-2'), bx + 0.1, by + bl + 0.22),
      piece(wardrobe(x + M, y + d * 0.5, Math.min(1.5, d * 0.36)), x + M, y + d * 0.5),
      piece(plant(x + w - 0.42, y + d - 0.5, 0.9), x + w - 0.6, y + d - 0.7),
    ];
  },
  kitchen({ x, y, w, d }) {
    const cl = Math.max(1, Math.min(w * 0.62, w - 1.15, 3.2));
    const iw = Math.min(1.6, w * 0.36);
    const fy = y + M + 0.62;
    return [
      piece(s('g', null, box(x + M, y + M, cl, 0.62, 0.52, 'cabinet'),
        ...Array.from({ length: Math.max(1, Math.floor(cl / 0.6)) }, (_, i) => seam([x + M + 0.6 * (i + 1), fy, 0.04], [x + M + 0.6 * (i + 1), fy, 0.48])),
        lift(box(x + M, y + M, cl, 0.62, 0.05, 'counter'), 0.52),
        lift(box(x + M + cl * 0.15, y + M + 0.14, 0.44, 0.34, 0.01, 'water'), 0.575),
        lift(box(x + M + cl * 0.55, y + M + 0.12, 0.5, 0.38, 0.01, 'screen'), 0.575),
        lift(box(x + M, y + M, cl * 0.8, 0.34, 0.4, 'cabinet'), 0.98)), x + M, y + M),
      piece(s('g', null, box(x + M, y + M + 0.62, 0.62, Math.min(1.4, d * 0.32), 0.52, 'cabinet'),
        lift(box(x + M, y + M + 0.62, 0.62, Math.min(1.4, d * 0.32), 0.05, 'counter'), 0.52)), x + M, y + M + 0.62),
      piece(s('g', null, box(x + M + cl + 0.06, y + M, 0.7, 0.66, 1.32, 'steel'), seam([x + M + cl + 0.06, y + M + 0.66, 0.85], [x + M + cl + 0.76, y + M + 0.66, 0.85])), x + M + cl + 0.06, y + M),
      piece(s('g', null, box(x + w * 0.42, y + d * 0.52, iw, 0.78, 0.52, 'cabinet'), lift(box(x + w * 0.42, y + d * 0.52, iw, 0.78, 0.05, 'counter-light'), 0.52),
        lift(box(x + w * 0.42 + iw * 0.6, y + d * 0.52 + 0.2, 0.22, 0.22, 0.2, 'pot'), 0.57)), x + w * 0.42, y + d * 0.52),
      piece(box(x + w * 0.42 + 0.18, y + d * 0.52 + 0.95, 0.26, 0.26, 0.4, 'stool'), x + w * 0.42 + 0.18, y + d * 0.52 + 0.95),
      piece(box(x + w * 0.42 + 0.78, y + d * 0.52 + 0.95, 0.26, 0.26, 0.4, 'stool'), x + w * 0.42 + 0.78, y + d * 0.52 + 0.95),
      piece(plant(x + w - 0.4, y + d - 0.5, 0.8), x + w - 0.55, y + d - 0.65),
    ];
  },
  bath({ x, y, w, d }) {
    const tw = Math.min(1.7, w * 0.5);
    const sw = Math.min(1.3, Math.max(0.6, w - tw - M * 2 - 0.1));
    return [
      piece(s('g', null, box(x + M, y + M, sw, 1, 0.04, 'porcelain'), box(x + M + sw, y + M, 0.04, 1, 1.2, 'glass', 'hm-glass'),
        lift(box(x + M + 0.1, y + M - 0.02, 0.2, 0.04, 0.1, 'steel'), 1.5)), x + M, y + M),
      piece(s('g', null, box(x + w - M - tw, y + M, tw, 0.8, 0.46, 'porcelain'), lift(box(x + w - M - tw + 0.1, y + M + 0.1, tw - 0.2, 0.6, 0.02, 'water'), 0.44)), x + w - M - tw, y + M),
      piece(s('g', null, box(x + M, y + d * 0.4, 0.52, 0.85, 0.5, 'wood-light'), seam([x + M + 0.52, y + d * 0.4 + 0.425, 0.05], [x + M + 0.52, y + d * 0.4 + 0.425, 0.45]),
        lift(box(x + M, y + d * 0.4, 0.55, 0.85, 0.06, 'porcelain'), 0.5), lift(box(x + M + 0.1, y + d * 0.4 + 0.22, 0.32, 0.42, 0.01, 'water'), 0.56),
        lift(box(x + M - 0.02, y + d * 0.4 + 0.12, 0.04, 0.6, 0.55, 'mirror'), 0.82)), x + M, y + d * 0.4),
      piece(toilet(x + M, y + d * 0.72), x + M, y + d * 0.72),
      piece(lift(box(x + w * 0.55, y + M - 0.03, 0.4, 0.05, 0.5, 'blanket'), 0.7), x + w * 0.55, y + M),
    ];
  },
  wc({ x, y, w, d }) {
    return [
      piece(toilet(x + M, y + d * 0.42), x + M, y + d * 0.42),
      piece(basin(x + w * 0.42, y + M), x + w * 0.42, y + M),
      piece(lift(box(x + w - M - 0.4, y + M - 0.03, 0.3, 0.05, 0.42, 'blanket'), 0.75), x + w - M - 0.4, y + M),
      piece(plant(x + w - 0.38, y + d - 0.45, 0.7), x + w - 0.5, y + d - 0.6),
    ];
  },
  office({ x, y, w, d }) {
    const dw = Math.min(1.6, w * 0.45), dx = x + w * 0.3;
    return [
      piece(s('g', null, box(dx, y + M, 0.06, 0.7, 0.48, 'wood-dark'), box(dx + dw - 0.06, y + M, 0.06, 0.7, 0.48, 'wood-dark'),
        lift(box(dx, y + M, dw, 0.7, 0.05, 'wood'), 0.48), lift(box(dx + dw * 0.3, y + M + 0.12, dw * 0.4, 0.05, 0.38, 'screen', 'hm-tv'), 0.53),
        tableLamp(dx + dw - 0.3, y + M + 0.15, 0.53)), dx, y + M),
      piece(s('g', null, box(dx + dw * 0.35, y + M + 0.85, 0.5, 0.5, 0.3, 'sofa'), box(dx + dw * 0.35, y + M + 1.23, 0.5, 0.12, 0.66, 'sofa')), dx + dw * 0.35, y + M + 0.85),
      piece(s('g', null, box(x + M, y + d * 0.36, 0.38, Math.min(1.5, d * 0.38), 1.3, 'wood-light'),
        ...[0.35, 0.7, 1.05].map((z) => seam([x + M + 0.38, y + d * 0.36, z], [x + M + 0.38, y + d * 0.36 + Math.min(1.5, d * 0.38), z]))), x + M, y + d * 0.36),
      piece(plant(x + w - 0.42, y + 0.45, 1), x + w - 0.6, y + 0.3),
    ];
  },
  kids({ x, y, w, d }) {
    const bw = Math.min(1.05, w * 0.32), bl = Math.min(1.7, d * 0.42);
    const dx = x + w - M - 1.1;
    return [
      piece(s('g', null, ...bed(x + M + 0.05, y + M, bw, bl, 'toy')), x + M, y + M),
      piece(s('g', null, box(dx, y + M, 1.1, 0.55, 0.05, 'wood-light'), box(dx, y + M, 0.05, 0.55, 0.55, 'wood-light'), box(dx + 1.05, y + M, 0.05, 0.55, 0.55, 'wood-light'),
        lift(box(dx, y + M, 1.1, 0.55, 0.05, 'wood-light'), 0.55), tableLamp(dx + 0.8, y + M + 0.12, 0.6),
        lift(box(dx + 0.2, y + M + 0.15, 0.3, 0.22, 0.05, 'toy-2'), 0.6)), dx, y + M),
      piece(box(dx + 0.35, y + M + 0.7, 0.4, 0.4, 0.34, 'toy-2'), dx + 0.35, y + M + 0.7),
      piece(s('g', null, box(x + M, y + d * 0.6, 0.36, 1.1, 0.9, 'wood-light'),
        lift(box(x + M + 0.06, y + d * 0.6 + 0.12, 0.24, 0.16, 0.26, 'toy'), 0.9), lift(box(x + M + 0.06, y + d * 0.6 + 0.36, 0.24, 0.12, 0.2, 'blanket'), 0.9),
        lift(box(x + M + 0.06, y + d * 0.6 + 0.6, 0.24, 0.2, 0.3, 'toy-2'), 0.9)), x + M, y + d * 0.6),
      piece(s('g', null, box(x + w * 0.5, y + d * 0.68, 0.7, 0.45, 0.4, 'toy'), seam([x + w * 0.5, y + d * 0.68 + 0.45, 0.3], [x + w * 0.5 + 0.7, y + d * 0.68 + 0.45, 0.3])), x + w * 0.5, y + d * 0.68),
      piece(plant(x + w - 0.42, y + d - 0.5, 0.85), x + w - 0.6, y + d - 0.7),
    ];
  },
  hall({ x, y, w, d }) {
    return [
      piece(s('g', null, box(x + M, y + d * 0.3, 0.4, Math.min(1.3, d * 0.34), 0.62, 'wood-light'),
        seam([x + M + 0.4, y + d * 0.3, 0.32], [x + M + 0.4, y + d * 0.3 + Math.min(1.3, d * 0.34), 0.32])), x + M, y + d * 0.3),
      piece(lift(box(x + w * 0.4, y + M - 0.02, Math.min(0.7, w * 0.3), 0.04, 0.8, 'mirror'), 0.45), x + w * 0.4, y + M),
      piece(s('g', null, box(x + M + 0.12, y + d * 0.74, 0.08, 0.08, 1.4, 'wood-dark'), lift(box(x + M + 0.02, y + d * 0.74 - 0.1, 0.28, 0.28, 0.3, 'blanket'), 0.95)), x + M + 0.12, y + d * 0.74),
      piece(box(x + w * 0.4, y + M + 0.2, Math.min(0.9, w * 0.35), 0.36, 0.42, 'sofa-2'), x + w * 0.4, y + M + 0.2),
      piece(plant(x + w - 0.45, y + 0.5, 1), x + w - 0.6, y + 0.35),
    ];
  },
  garden({ x, y, w, d }) {
    return [
      piece(plant(x + 0.5, y + 0.5, 1.4), x + 0.3, y + 0.3),
      piece(plant(x + w - 0.5, y + 0.5, 1.2), x + w - 0.7, y + 0.3),
      piece(plant(x + 0.5, y + d - 0.6, 1), x + 0.3, y + d - 0.8),
      piece(s('g', null, box(x + w * 0.38, y + d * 0.36, 0.7, 1.5, 0.22, 'sofa-2'), box(x + w * 0.38, y + d * 0.36, 0.7, 0.3, 0.5, 'sofa-2'),
        lift(box(x + w * 0.38 + 0.08, y + d * 0.36 + 0.4, 0.54, 0.9, 0.06, 'cushion'), 0.22)), x + w * 0.38, y + d * 0.36),
      piece(box(x + w * 0.38 + 0.95, y + d * 0.5, 0.45, 0.45, 0.36, 'table'), x + w * 0.38 + 0.95, y + d * 0.5),
    ];
  },
  storage({ x, y, w, d }) {
    return [
      piece(s('g', null, box(x + M, y + M, Math.min(w * 0.6, 2.4), 0.45, 1.2, 'steel'),
        ...[0.4, 0.8].map((z) => seam([x + M, y + M + 0.45, z], [x + M + Math.min(w * 0.6, 2.4), y + M + 0.45, z]))), x + M, y + M),
      piece(s('g', null, box(x + M + 0.1, y + M + 0.65, 0.5, 0.5, 0.4, 'crate'), lift(box(x + M + 0.15, y + M + 0.7, 0.4, 0.4, 0.3, 'crate'), 0.4)), x + M + 0.1, y + M + 0.65),
      piece(box(x + M + 0.75, y + M + 0.7, 0.45, 0.45, 0.35, 'crate'), x + M + 0.75, y + M + 0.7),
      piece(box(x + M, y + d * 0.55, 0.45, Math.min(1.4, d * 0.33), 1, 'steel'), x + M, y + d * 0.55),
    ];
  },
  laundry({ x, y, w, d }) {
    const unit = (ux) => s('g', null, box(ux, y + M, 0.62, 0.62, 0.8, 'porcelain'), faceCircle(ux + 0.31, y + M + 0.62, 0.38, 0.2));
    return [
      piece(unit(x + M + 0.1), x + M + 0.1, y + M),
      piece(unit(x + M + 0.8), x + M + 0.8, y + M),
      piece(lift(box(x + M, y + M, Math.min(w * 0.6, 2), 0.34, 0.08, 'wood-light'), 1.1), x + M, y + M),
      piece(box(x + M, y + d * 0.55, 0.5, 0.5, 0.45, 'crate'), x + M, y + d * 0.55),
    ];
  },
  // A room whose name says nothing: a sitting corner, no bed (it could be anything).
  room({ x, y, w, d }) {
    return [
      piece(s('g', null, box(x + M, y + d * 0.3, 0.4, Math.min(1.4, d * 0.34), 1.2, 'wood-light'),
        ...[0.4, 0.8].map((z) => seam([x + M + 0.4, y + d * 0.3, z], [x + M + 0.4, y + d * 0.3 + Math.min(1.4, d * 0.34), z]))), x + M, y + d * 0.3),
      piece(armchair(x + w * 0.62, y + d * 0.3), x + w * 0.62, y + d * 0.3),
      piece(armchair(x + w * 0.62, y + d * 0.3 + 1.1, 'sofa'), x + w * 0.62, y + d * 0.3 + 1.1),
      piece(box(x + w * 0.62 - 0.6, y + d * 0.3 + 0.75, 0.45, 0.45, 0.34, 'table'), x + w * 0.62 - 0.6, y + d * 0.3 + 0.75),
      piece(floorLamp(x + w * 0.62 + 0.3, y + d * 0.3 - 0.35), x + w * 0.62 + 0.15, y + d * 0.3 - 0.5),
      piece(plant(x + 0.45, y + d - 0.5, 0.95), x + 0.3, y + d - 0.7),
    ];
  },
};
const RUGS = {
  living: ({ x, y, w, d }) => flat(x + w * 0.3, y + d * 0.28, w * 0.44, d * 0.44, 'rug'),
  bedroom: ({ x, y, w, d }) => flat(x + w * 0.52 - Math.min(1.6, w * 0.4) / 2 - 0.3, y + M + Math.min(2.1, d * 0.52) * 0.62, Math.min(1.6, w * 0.4) + 0.6, 1.05, 'rug-2'),
  kids: ({ x, y, w, d }) => roundRug(x + w * 0.58, y + d * 0.58, Math.min(w, d) * 0.24, 'rug-kids'),
  office: ({ x, y, w, d }) => flat(x + w * 0.28, y + M + 0.7, Math.min(1.6, w * 0.45) + 0.2, 1.2, 'rug'),
  hall: ({ x, y, w, d }) => flat(x + w * 0.36, y + d * 0.18, w * 0.28, d * 0.64, 'rug-2'),
  bath: ({ x, y, w, d }) => flat(x + w * 0.5, y + d * 0.45, Math.min(0.9, w * 0.3), 0.55, 'rug-2'),
  wc: ({ x, y, w, d }) => flat(x + M + 0.7, y + d * 0.42, 0.5, 0.46, 'rug-2'),
  room: ({ x, y, w, d }) => roundRug(x + w * 0.55, y + d * 0.3 + 0.95, Math.min(w, d) * 0.24, 'rug'),
};
const FLOOR = { bath: 'tile', wc: 'tile', laundry: 'tile', kitchen: 'wood-light', garden: 'deck', storage: 'concrete', hall: 'wood' };
const WEIGHT = { living: 1.4, kitchen: 1.15, bedroom: 1.2, kids: 1, office: 0.95, bath: 0.8, wc: 0.6, hall: 0.75, laundry: 0.7, storage: 0.8, garden: 1, room: 1.05 };

// Plank or tile lines on a floor.
function floorLines(r, kind) {
  const g = s('g', { class: `hm-lines ${kind}` });
  const step = kind === 'tile' ? 0.5 : kind === 'deck' ? 0.42 : 0.32;
  for (let v = r.y + step; v < r.y + r.d - 0.01; v += step) g.append(s('line', { x1: proj(r.x, v)[0], y1: proj(r.x, v)[1], x2: proj(r.x + r.w, v)[0], y2: proj(r.x + r.w, v)[1] }));
  if (kind === 'tile' || kind === 'concrete') {
    for (let u = r.x + step; u < r.x + r.w - 0.01; u += step) g.append(s('line', { x1: proj(u, r.y)[0], y1: proj(u, r.y)[1], x2: proj(u, r.y + r.d)[0], y2: proj(u, r.y + r.d)[1] }));
  }
  return g;
}

// ---- the plan -------------------------------------------------------------------------

function layout(rooms) {
  const n = rooms.length;
  // Rows as even as possible, so no room is left alone stretched across a whole row
  // (3 rooms: one row of 3; 5: 3 + 2; 7: 4 + 3).
  const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : n === 9 ? 3 : 4;
  const W = cols === 1 ? 5.4 : cols * 4.2;
  const rows = [];
  for (let i = 0; i < n; i += cols) rows.push(rooms.slice(i, i + cols));
  const rects = [];
  rows.forEach((row, r) => {
    const total = row.reduce((a, room) => a + WEIGHT[room.type], 0);
    let x = 0;
    row.forEach((room, c) => {
      const w = (W * WEIGHT[room.type]) / total;
      rects.push({ ...room, x, y: r * DEPTH, w, d: DEPTH, row: r, col: c, last: c === row.length - 1 });
      x += w;
    });
  });
  return { rects, rows: rows.length, W, D: rows.length * DEPTH };
}

// A window on a back wall: on the face y = 0 (along x) or x = 0 (along y).
function windowOn(axis, from, to) {
  const [z1, z2] = [0.42, 1.08];
  const at = (a, z) => (axis === 'x' ? [a, 0, z] : [0, a, z]);
  const mid = (from + to) / 2;
  return s('g', { class: 'hm-window' },
    s('polygon', { points: pts([at(from, z1), at(to, z1), at(to, z2), at(from, z2)]) }),
    s('polyline', { points: pts([at(mid, z1), at(mid, z2)]) }));
}

// An interior wall from a to b along an axis at position p, with a door gap [g1, g2].
function wallWithDoor(axis, p, a, b, g1, g2, hgt) {
  const seg = (u1, u2) => (u2 - u1 < 0.05 ? null : axis === 'x'
    ? box(u1, p - T / 2, u2 - u1, T, hgt, 'wall', 'hm-wall')
    : box(p - T / 2, u1, T, u2 - u1, hgt, 'wall', 'hm-wall'));
  return s('g', null, seg(a, g1), seg(g2, b));
}

// ---- markers --------------------------------------------------------------------------

// What a device is for: its marker colour (the website's category colours).
function markerGroup(device, kind) {
  if (kind === 'light') return 'light';
  if (kind === 'leak') return 'water';
  const cat = productForDevice(device)?.category;
  const BY_CAT = { hub: 'hub', network: 'hub', sensors: 'sensor', security: 'security', heating: 'heat', climate: 'heat', energy: 'power', covers: 'cover', appliances: 'appliance', pets: 'appliance', garden: 'water' };
  if (cat && BY_CAT[cat]) return BY_CAT[cat];
  const BY_KIND = {
    plug: 'power', relay: 'power', cover: 'cover', climate: 'heat', 'climate-sensor': 'heat', valve: 'heat', lock: 'security', siren: 'security',
    camera: 'security', smoke: 'security', gas: 'security', contact: 'security', motion: 'sensor', presence: 'sensor', co2: 'sensor',
    ir: 'hub', hub: 'hub', info: 'hub', vacuum: 'appliance', fan: 'appliance', feeder: 'appliance', litter: 'appliance', kettle: 'appliance',
  };
  return BY_KIND[kind] || 'hub';
}

const ALARM_DC = ['smoke', 'gas', 'moisture', 'carbon_monoxide', 'safety'];
/** A device's look on the model: { tone: 'on'|'off'|'warn'|'alarm'|'offline', text }. */
export function deviceTone(device, kind = kindOf(device)) {
  const list = deviceEntities(device.id).filter((e) => !e.entity_category && !e.hidden_by).map((e) => store.get(e.entity_id)).filter(Boolean);
  if (!list.length) return { tone: 'off', text: '' };
  const live = list.filter((st) => st.state !== 'unavailable' && st.state !== 'unknown');
  if (!live.length) return { tone: 'offline', text: 'Ulaşılamıyor' };
  const dom = (st) => st.entity_id.split('.')[0];
  const dc = (st) => st.attributes?.device_class;
  const find = (test) => live.find(test);
  if (live.some((st) => dom(st) === 'binary_sensor' && ALARM_DC.includes(dc(st)) && isOn(st))) return { tone: 'alarm', text: 'Alarm!' };
  if (kind === 'smoke' || kind === 'gas' || kind === 'leak') return { tone: 'off', text: 'Normal' };
  const light = live.filter((st) => dom(st) === 'light');
  if (light.length) {
    const on = light.find(isOn);
    const pct = on?.attributes?.brightness != null ? ` · %${Math.round((on.attributes.brightness / 255) * 100)}` : '';
    return on ? { tone: 'on', text: `Açık${pct}` } : { tone: 'off', text: 'Kapalı' };
  }
  const occ = find((st) => dom(st) === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(dc(st)));
  if (occ) return isOn(occ) ? { tone: 'on', text: 'Hareket var' } : { tone: 'off', text: 'Hareket yok' };
  const open = find((st) => dom(st) === 'binary_sensor' && ['opening', 'door', 'window', 'garage_door'].includes(dc(st)));
  if (open) return isOn(open) ? { tone: 'warn', text: 'Açık' } : { tone: 'off', text: 'Kapalı' };
  const climate = find((st) => dom(st) === 'climate');
  if (climate) {
    const t = climate.attributes.temperature;
    if (climate.state === 'off') return { tone: 'off', text: 'Kapalı' };
    return { tone: climate.attributes.hvac_action === 'heating' ? 'on' : 'off', text: `${climate.attributes.hvac_action === 'heating' ? 'Isıtıyor' : 'Hedef'}${t != null ? ` ${dec(t)}°` : ''}` };
  }
  const lock = find((st) => dom(st) === 'lock');
  if (lock) return lock.state === 'unlocked' ? { tone: 'warn', text: 'Kilitsiz' } : { tone: 'off', text: 'Kilitli' };
  const cover = find((st) => dom(st) === 'cover');
  if (cover) return cover.state === 'open' || cover.state === 'opening' ? { tone: 'on', text: 'Açık' } : { tone: 'off', text: 'Kapalı' };
  const media = find((st) => dom(st) === 'media_player');
  if (media) return media.state !== 'off' && media.state !== 'standby' ? { tone: 'on', text: 'Açık' } : { tone: 'off', text: 'Kapalı' };
  const vac = find((st) => dom(st) === 'vacuum');
  if (vac) return vac.state === 'cleaning' ? { tone: 'on', text: 'Temizliyor' } : { tone: 'off', text: vac.state === 'docked' ? 'İstasyonda' : 'Beklemede' };
  const fan = find((st) => dom(st) === 'fan');
  if (fan) return isOn(fan) ? { tone: 'on', text: 'Açık' } : { tone: 'off', text: 'Kapalı' };
  const sw = find((st) => dom(st) === 'switch');
  if (sw) {
    const w = find((st) => dom(st) === 'sensor' && dc(st) === 'power' && numVal(st) != null);
    return isOn(sw) ? { tone: 'on', text: `Açık${w ? ` · ${Math.round(numVal(w))} W` : ''}` } : { tone: 'off', text: 'Kapalı' };
  }
  const temp = find((st) => dom(st) === 'sensor' && dc(st) === 'temperature' && numVal(st) != null);
  if (temp) {
    const hum = find((st) => dom(st) === 'sensor' && dc(st) === 'humidity' && numVal(st) != null);
    return { tone: 'off', text: `${dec(numVal(temp))}°${hum ? ` · %${Math.round(numVal(hum))}` : ''}` };
  }
  return { tone: 'off', text: '' };
}

// Marker spots inside a room: rows across the back half (the room's label sits in the
// middle of its floor), then one row near the front when there are many.
function spots(r, n) {
  if (!n) return [];
  const cap = Math.max(1, Math.floor((r.w - 0.9) / 0.78));
  const rows = [r.y + 0.6, r.y + r.d * 0.36, r.y + r.d - 0.55];
  const x0 = r.x + 0.5, x1 = r.x + r.w - 0.5;
  const out = [];
  let left = n;
  for (let i = 0; i < rows.length && left > 0; i++) {
    const k = i === rows.length - 1 ? left : Math.min(cap, left);
    for (let j = 0; j < k; j++) out.push([x0 + ((x1 - x0) / k) * (j + 0.5) + (i === 1 ? 0.2 : 0), rows[i]]);
    left -= k;
  }
  return out;
}

// Short names for the floor list: 2, 1, Z (ground), B (basement).
const floorCode = (f) => (f.level > 0 ? String(f.level) : f.level < 0 ? (f.level === -1 ? 'B' : `B${-f.level}`) : 'Z');

/** Up / down buttons and the list of floors (top floor first). */
function floorNav(floors, current, onFloor) {
  const list = [...floors].sort((a, b) => b.level - a.level);
  const i = Math.max(0, list.findIndex((f) => f.key === current));
  const up = list[i - 1], down = list[i + 1];
  const go = (f) => () => { if (f) onFloor?.(f.key); };
  return h('div', { class: 'hm-floornav', role: 'group', 'aria-label': 'Katlar' },
    h('button', { type: 'button', class: 'hm-fbtn', disabled: !up, title: up ? `Yukarı: ${up.name}` : 'Yukarıda kat yok', 'aria-label': up ? `Yukarı: ${up.name}` : 'Yukarıda kat yok', onclick: go(up) }, icon('up', 16)),
    ...list.map((f) => h('button', {
      type: 'button', class: `hm-flevel${f.key === current ? ' active' : ''}`, title: f.name, 'aria-label': f.name,
      'aria-pressed': String(f.key === current), onclick: go(f.key === current ? null : f),
    }, floorCode(f))),
    h('button', { type: 'button', class: 'hm-fbtn', disabled: !down, title: down ? `Aşağı: ${down.name}` : 'Aşağıda kat yok', 'aria-label': down ? `Aşağı: ${down.name}` : 'Aşağıda kat yok', onclick: go(down) }, icon('down', 16)),
    h('span', { class: 'hm-fname' }, list[i]?.name || ''));
}

// ---- the component ------------------------------------------------------------------------

export function homeModel({ rooms, devices, loose = [], selected = 'all', onPick, onDevice, floors = [], floor = null, onFloor, enter = null, cleanup }) {
  const list = rooms.map((a) => ({ id: a.area_id, name: a.name, type: roomType(a.name) }));
  const wrap = h('div', { class: 'hm' });
  if (floors.length > 1) {
    wrap.classList.add('has-floors');
    wrap.append(floorNav(floors, floor, onFloor));
  }
  if (!list.length) {
    wrap.append(h('div', { class: 'hm-empty' }, icon('rooms', 28),
      h('p', null, floors.length > 1 ? 'Bu katta oda yok. Odaları Cihazlar > Odalar > Gelişmiş ayarlar\'dan katlara yerleştirin.' : 'Odalarınızı ekleyin; eviniz burada, cihazlarıyla birlikte görünür.'),
      h('a', { class: 'btn small', href: '#/devices?tab=rooms' }, icon('plus', 14), 'Oda ekle')));
    return wrap;
  }
  const plan = layout(list);
  const { W, D } = plan;

  // The drawing's frame: every corner of the walls, plus room above for markers.
  const corners = [];
  for (const x of [-T, W + T]) for (const y of [-T, D + T]) for (const z of [0, H_BACK]) corners.push(proj(x, y, z));
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const pad = 10;
  const vb = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad - 6, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 6 };
  const pct = (x, y, z) => { const [px, py] = proj(x, y, z); return [((px - vb.x) / vb.w) * 100, ((py - vb.y) / vb.h) * 100]; };

  const svg = s('svg', { class: 'hm-svg', viewBox: `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`, 'aria-hidden': 'true' });
  const defs = s('defs', null,
    s('radialGradient', { id: 'hm-glow' }, s('stop', { offset: '0', class: 'hm-glow-a' }), s('stop', { offset: '1', class: 'hm-glow-b' })));
  svg.append(defs);

  // Floors (with their rugs and light glow), one group per room so a picked room stands out.
  const roomGroups = new Map();
  const floorLayer = s('g', { class: 'hm-floors' });
  for (const r of plan.rects) {
    const kind = FLOOR[r.type] || 'wood';
    const floor = s('polygon', { class: 'hm-floor', style: `--c: var(--hm-floor-${kind})`, points: pts([[r.x, r.y, 0], [r.x + r.w, r.y, 0], [r.x + r.w, r.y + r.d, 0], [r.x, r.y + r.d, 0]]) });
    const clip = s('clipPath', { id: `hm-clip-${r.row}-${r.col}` }, s('polygon', { points: floor.getAttribute('points') }));
    defs.append(clip);
    const [cx, cy] = proj(r.x + r.w / 2, r.y + r.d / 2);
    const rx = ((r.w + r.d) / 2) * CX * U * 0.75;
    const glow = s('ellipse', { class: 'hm-room-glow', cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: (rx * 0.58).toFixed(1), fill: 'url(#hm-glow)', 'clip-path': `url(#hm-clip-${r.row}-${r.col})` });
    const alarm = s('polygon', { class: 'hm-room-alarm', points: floor.getAttribute('points') });
    const g = s('g', { class: 'hm-room', 'data-room': r.id }, floor, floorLines(r, kind), RUGS[r.type]?.(r), glow, alarm);
    g.addEventListener('click', () => onPick?.(selected === r.id ? 'all' : r.id));
    floorLayer.append(g);
    roomGroups.set(r.id, { floor: g });
  }
  svg.append(floorLayer);

  // The back walls with their windows.
  const back = s('g', { class: 'hm-walls' },
    box(-T, -T, W + T, T, H_BACK, 'wall', 'hm-wall'),
    box(-T, 0, T, D, H_BACK, 'wall', 'hm-wall'));
  for (const r of plan.rects) {
    if (r.row === 0) back.append(windowOn('x', r.x + r.w * 0.3, r.x + r.w * 0.7));
    if (r.col === 0) back.append(windowOn('y', r.y + r.d * 0.3, r.y + r.d * 0.66));
  }
  svg.append(back);

  // Row by row, back to front: each room's furniture, the wall on its right, then the wall in front of the row.
  for (let row = 0; row < plan.rows; row++) {
    const inRow = plan.rects.filter((r) => r.row === row);
    for (const r of inRow) {
      const items = (FURNISH[r.type] || FURNISH.room)(r).sort((a, b) => a.k - b.k);
      const g = s('g', { class: 'hm-room hm-furniture', 'data-room': r.id }, items.map((it) => it.el));
      g.addEventListener('click', () => onPick?.(selected === r.id ? 'all' : r.id));
      svg.append(g);
      roomGroups.get(r.id).furniture = g;
      if (!r.last) svg.append(wallWithDoor('y', r.x + r.w, r.y, r.y + r.d, r.y + r.d * 0.58, r.y + r.d * 0.58 + 0.9, H_IN));
    }
    if (row < plan.rows - 1) {
      const wall = s('g');
      // One door from each room of this row into the next.
      const gaps = inRow.map((r) => [r.x + r.w * 0.5 - 0.45, r.x + r.w * 0.5 + 0.45]);
      let from = 0;
      for (const [g1, g2] of gaps) { wall.append(wallWithDoor('x', (row + 1) * DEPTH, from, g2, g1, g2, H_IN)); from = g2; }
      wall.append(wallWithDoor('x', (row + 1) * DEPTH, from, W, W, W, H_IN));
      svg.append(wall);
    }
  }
  // The low front walls (cut away, like a doll's house).
  svg.append(s('g', { class: 'hm-walls' },
    box(0, D, W + T, T, H_FRONT, 'wall', 'hm-wall'),
    box(W, 0, T, D, H_FRONT, 'wall', 'hm-wall')));

  // ---- markers and labels (HTML on top, so they stay sharp and can be tapped) ----
  const layer = h('div', { class: 'hm-layer' });
  const byRoom = new Map(list.map((r) => [r.id, []]));
  for (const d of devices) if (byRoom.has(d.area_id)) byRoom.get(d.area_id).push(d);
  const markers = [];
  const MAX = 8;
  const dot = (d, i, style, room) => {
    const kind = kindOf(d);
    const tip = h('span', { class: 'hm-tip' });
    const btn = h('button', {
      type: 'button', class: `hm-dot hm-c-${markerGroup(d, kind)}`, style: `${style};--d:${((i % 5) * 0.37).toFixed(2)}s`,
      onclick: (e) => { e.stopPropagation(); onDevice?.(d); },
    }, h('span', { class: 'hm-ring', 'aria-hidden': 'true' }), icon(kindIcon(d), 15), tip);
    markers.push({ btn, tip, device: d, kind, room });
    return btn;
  };
  for (const r of plan.rects) {
    const devs = byRoom.get(r.id);
    const shownDevs = devs.length > MAX ? devs.slice(0, MAX - 1) : devs;
    const places = spots(r, shownDevs.length + (devs.length > MAX ? 1 : 0));
    shownDevs.forEach((d, i) => {
      const [left, top] = pct(places[i][0], places[i][1], MARKER_Z);
      layer.append(dot(d, i, `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%`, r.id));
    });
    if (devs.length > MAX) {
      const [left, top] = pct(places[MAX - 1][0], places[MAX - 1][1], MARKER_Z);
      layer.append(h('button', { type: 'button', class: 'hm-dot hm-more', style: `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%`, onclick: () => onPick?.(r.id), 'aria-label': `${r.name}: ${devs.length - MAX + 1} cihaz daha` }, `+${devs.length - MAX + 1}`));
    }
    const [lx, ly] = pct(r.x + r.w / 2, r.y + r.d / 2, 0);
    const reading = h('span', { class: 'hm-label-val' });
    const label = h('button', {
      type: 'button', class: `hm-label${selected === r.id ? ' active' : ''}`, style: `left:${lx.toFixed(2)}%;top:${ly.toFixed(2)}%`,
      'aria-pressed': String(selected === r.id), title: selected === r.id ? 'Bütün odaları göster' : `${r.name} odasını göster`,
      onclick: () => onPick?.(selected === r.id ? 'all' : r.id),
    }, h('span', { class: 'hm-label-name' }, r.name), reading);
    roomGroups.get(r.id).reading = reading;
    layer.append(label);
  }

  const frame = h('div', { class: `hm-frame${enter ? ` hm-enter-${enter}` : ''}`, style: `aspect-ratio: ${vb.w.toFixed(1)} / ${vb.h.toFixed(1)}` }, svg, layer);
  wrap.append(frame);
  if (loose.length) {
    wrap.append(h('div', { class: 'hm-loose' }, h('span', null, 'Odası olmayan:'),
      ...loose.slice(0, 12).map((d, i) => dot(d, i, '', null)),
      h('a', { class: 'link subtle', href: '#/devices' }, 'Oda seçin', icon('right', 14))));
  }
  wrap.classList.toggle('has-pick', selected !== 'all');
  for (const [id, g] of roomGroups) {
    const dim = selected !== 'all' && selected !== id;
    g.floor.classList.toggle('dim', dim);
    g.furniture?.classList.toggle('dim', dim);
    g.floor.classList.toggle('picked', selected === id);
  }
  for (const m of markers) m.btn.classList.toggle('dim', selected !== 'all' && m.room !== null && selected !== m.room);
  if (selected !== 'all') {
    wrap.append(h('button', { type: 'button', class: 'hm-all', onclick: () => onPick?.('all') }, icon('close', 14), 'Tüm odalar'));
  }

  // ---- live states: marker tones, room glow and alarms, the room label's reading ----
  let queued = false;
  const paint = () => {
    queued = false;
    for (const m of markers) {
      const { tone, text } = deviceTone(m.device, m.kind);
      m.btn.dataset.tone = tone;
      m.tip.textContent = text ? `${deviceName(m.device)} · ${text}` : deviceName(m.device);
      m.btn.setAttribute('aria-label', m.tip.textContent);
    }
    for (const r of plan.rects) {
      const badges = roomBadges(r.id);
      const g = roomGroups.get(r.id);
      const lit = badges.find((b) => b.key === 'lights')?.tone === 'on';
      const alarm = badges.some((b) => b.tone === 'alarm');
      g.floor.classList.toggle('lit', !!lit);
      g.furniture?.classList.toggle('lit', !!lit);
      g.floor.classList.toggle('alarm', alarm);
      g.furniture?.classList.toggle('tv-on', markers.some((m) => m.room === r.id && m.kind === 'ir' && m.btn.dataset.tone === 'on')
        || roomHasMediaOn(r.id));
      const temp = badges.find((b) => b.key === 'temp');
      g.reading.textContent = alarm ? '· Alarm' : temp ? temp.value : '';
    }
  };
  const ids = [];
  for (const d of [...devices, ...loose]) for (const e of deviceEntities(d.id)) ids.push(e.entity_id);
  for (const r of list) for (const st of store.states.values()) if (!ids.includes(st.entity_id) && store.entities.get(st.entity_id)?.area_id === r.id) ids.push(st.entity_id);
  if (ids.length) cleanup.push(store.watch(ids, () => { if (!queued) { queued = true; requestAnimationFrame(paint); } }));
  paint();
  return wrap;
}

function roomHasMediaOn(areaId) {
  for (const st of store.states.values()) {
    if (!st.entity_id.startsWith('media_player.')) continue;
    if (st.state === 'off' || st.state === 'standby' || st.state === 'unavailable') continue;
    const e = store.entities.get(st.entity_id);
    const area = e?.area_id || (e?.device_id ? store.devices.get(e.device_id)?.area_id : null);
    if (area === areaId) return true;
  }
  return false;
}
