// Evra's mascot: a waving blue house with a cream roof and a wifi antenna, in rings.
// The rings, the antenna's tip and the waving glove take the theme's colours (CSS
// variables, so it follows every theme and light/dark without re-drawing); the house
// itself always looks the same. Drawn as SVG with createElementNS (no innerHTML).
//
// Where it appears: the assistant's tab, the chat's avatar and the small button on
// Home (views/home.js). For members whose home has no Premium plan it's shown with a
// gold lock, and tapping it opens the plans on the website (plansUrl in account.js).

import { h } from './util.js';
import { icon } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const INK = '#1a1110';
const CREAM = '#fff3df';

/** The mascot's SVG, size px square. */
export function mascotSvg(size = 28) {
  const svg = el('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'mascot-svg', 'aria-hidden': 'true' });
  // Rings: theme colours from the outside in, then the dark hole the house waves from.
  [[49, 'var(--mascot-r1)'], [44, 'var(--mascot-r2)'], [39.5, 'var(--mascot-r3)'], [35, 'var(--mascot-r4)'], [30.5, 'var(--mascot-hole)']]
    .forEach(([r, fill]) => svg.append(el('circle', { cx: 50, cy: 50, r, style: `fill:${fill}`, stroke: INK, 'stroke-width': 0.9 })));
  const g = el('g', { class: 'mascot-house' });
  // Antenna: a wifi arc and a ball on the roof's tip.
  g.append(el('path', { d: 'M38 9.5 Q50 2.5 62 9.5', fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round' }));
  g.append(el('path', { d: 'M38 9.5 Q50 2.5 62 9.5', fill: 'none', stroke: CREAM, 'stroke-width': 3.6, 'stroke-linecap': 'round' }));
  g.append(el('circle', { cx: 50, cy: 17, r: 4.2, style: 'fill:var(--mascot-r2)', stroke: INK, 'stroke-width': 1 }));
  // The house: a blue body with a darker side.
  g.append(el('path', { d: 'M25 50 L50 26 L75 49 L72 83 Q50 91 29 84 Z', fill: '#37b6f6', stroke: INK, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
  g.append(el('path', { d: 'M69 46.5 L75 49 L72 83 L67 84.5 Z', fill: '#1f6fe0', stroke: INK, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }));
  // The roof: a cream bar with a dark outline.
  g.append(el('path', { d: 'M13 54 L50 21 L87 54', fill: 'none', stroke: INK, 'stroke-width': 9.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.append(el('path', { d: 'M13 54 L50 21 L87 54', fill: 'none', stroke: CREAM, 'stroke-width': 6.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  // Brows, eyes, nose, mouth and tongue.
  g.append(el('path', { d: 'M34 42 Q39 37.5 45 40.5', fill: 'none', stroke: CREAM, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  g.append(el('path', { d: 'M51 38.5 Q56.5 34 62.5 37.5', fill: 'none', stroke: CREAM, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  for (const [cx, cy] of [[40.5, 52.5], [56.5, 50.5]]) {
    g.append(el('ellipse', { cx, cy, rx: 6.2, ry: 8.4, fill: CREAM, stroke: INK, 'stroke-width': 1.1 }));
    g.append(el('ellipse', { class: 'mascot-pupil', cx: cx + 1.3, cy: cy + 1.8, rx: 2.7, ry: 4.1, fill: INK }));
    g.append(el('circle', { cx: cx + 0.6, cy: cy - 0.4, r: 1, fill: '#fff' }));
  }
  g.append(el('circle', { cx: 50.5, cy: 63, r: 2.6, fill: '#d9a441', stroke: INK, 'stroke-width': 0.9 }));
  g.append(el('path', { d: 'M37 66 Q49 84 63 64.5 Q50 71 37 66 Z', fill: '#4a1010', stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
  g.append(el('path', { d: 'M43.5 73 Q50.5 80.5 57 72 Q50 75.5 43.5 73 Z', fill: '#ff6b6b' }));
  // The waving arm and glove.
  const hand = el('g', { class: 'mascot-hand' });
  hand.append(el('path', { d: 'M70 78 L80 68', fill: 'none', stroke: '#3a3536', 'stroke-width': 4.2, 'stroke-linecap': 'round' }));
  hand.append(el('path', {
    d: 'M78 71 L74.5 61 Q73.5 58 76.5 58.5 L80 65 L79.5 54.5 Q80 51.5 83 52.5 L84.5 63 L87.5 54 Q89.5 52 91.5 54.5 L89.5 64.5 L93.5 59.5 Q96 58.5 96.5 61.5 L91.5 71.5 Q87.5 78 80.5 75.5 Z',
    style: 'fill:var(--mascot-r2)', stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round',
  }));
  g.append(hand);
  svg.append(g);
  return svg;
}

/**
 * The mascot as an element: <span class="mascot">. locked adds the gold lock badge
 * (the home's plan doesn't include the assistant).
 */
export function mascot(size = 28, { locked = false } = {}) {
  return h('span', { class: `mascot${locked ? ' is-locked' : ''}`, style: `--mascot-size:${size}px` },
    mascotSvg(size),
    locked ? h('span', { class: 'mascot-lock', 'aria-hidden': 'true' }, icon('lock', Math.max(9, Math.round(size * 0.32)))) : null);
}
