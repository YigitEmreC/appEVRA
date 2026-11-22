// The illustrated parts of the moving background: Istanbul (the shore, the
// Bosphorus bridge and Kız Kulesi), the fireplace, the mountains and the retro
// horizon. Each is one SVG drawn from simple shapes; colours come from CSS
// variables (see "Illustrated scenes" in css/app.css), so they follow the
// theme, light or dark. Movement is CSS animation on transforms and opacity.

const NS = 'http://www.w3.org/2000/svg';

// An SVG element: S('path', { d, class }, ...children)
function S(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const k of kids.flat(Infinity)) if (k) e.append(k);
  return e;
}
const r1 = (n) => Math.round(n * 10) / 10;
// A vertical gradient whose colours are CSS colours (variables allowed).
function vgrad(id, stops) {
  return S('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    stops.map(([offset, colour, opacity = 1]) => S('stop', { offset, style: `stop-color:${colour};stop-opacity:${opacity}` })));
}
function rgrad(id, stops, attrs = {}) {
  return S('radialGradient', { id, ...attrs },
    stops.map(([offset, colour, opacity = 1]) => S('stop', { offset, style: `stop-color:${colour};stop-opacity:${opacity}` })));
}
function svgRoot(cls, viewBox, ratio) {
  return S('svg', { class: cls, viewBox, preserveAspectRatio: ratio, 'aria-hidden': 'true' });
}
// The same "random" numbers every time, so the drawing doesn't change between loads.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// y on a line through points, at x.
function along(points, x) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
const line = (pts) => 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');
const rect = (x, y, w, h) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
// An arched window: x, y = top left.
const arch = (x, y, w, h) => `M${r1(x)} ${r1(y + h)}V${r1(y + w / 2)}A${r1(w / 2)} ${r1(w / 2)} 0 0 1 ${r1(x + w)} ${r1(y + w / 2)}V${r1(y + h)}Z`;

// ---- Istanbul --------------------------------------------------------------------

// A minaret: slender shaft, two balconies, a pointed cap.
function minaret(x, base, h, w) {
  const top = base - h;
  let d = rect(x - w, top, 2 * w, h);
  for (const f of [0.6, 0.8]) d += rect(x - w * 1.9, base - h * f, w * 3.8, Math.max(1.2, w * 0.8));
  d += `M${r1(x - w * 1.1)} ${r1(top)}L${r1(x)} ${r1(top - h * 0.22)}L${r1(x + w * 1.1)} ${r1(top)}Z`;
  return d;
}
// A mosque in the Ottoman style: hall, drum, main dome, half domes, small
// domes, a finial and two or four minarets.
function mosque(cx, base, r, { inner = true, tall = 3.4 } = {}) {
  const y0 = base - 0.9 * r, yd = y0 - 0.3 * r;
  let d = rect(cx - 2.3 * r, y0, 4.6 * r, base - y0);
  d += rect(cx - 1.02 * r, yd, 2.04 * r, y0 - yd);
  d += `M${r1(cx - r)} ${r1(yd)}A${r1(r)} ${r1(0.92 * r)} 0 0 1 ${r1(cx + r)} ${r1(yd)}Z`;
  d += rect(cx - 0.7, yd - 0.92 * r - 0.5 * r, 1.4, 0.5 * r);
  for (const s of [-1, 1]) {
    const c = cx + s * 1.3 * r;
    d += `M${r1(c - 0.58 * r)} ${r1(y0)}A${r1(0.58 * r)} ${r1(0.5 * r)} 0 0 1 ${r1(c + 0.58 * r)} ${r1(y0)}Z`;
    const c2 = cx + s * 2 * r;
    d += `M${r1(c2 - 0.28 * r)} ${r1(y0)}A${r1(0.28 * r)} ${r1(0.26 * r)} 0 0 1 ${r1(c2 + 0.28 * r)} ${r1(y0)}Z`;
  }
  const mins = [[2.65, tall]];
  if (inner) mins.push([1.7, tall * 0.78]);
  for (const [off, hgt] of mins) for (const s of [-1, 1]) d += minaret(cx + s * off * r, base, hgt * r, Math.max(1.1, 0.12 * r));
  return d;
}
// A row of buildings with their tops on `ground` (a function of x); returns
// the shapes and some lit windows.
function buildings(r, from, to, ground, { min = 6, max = 22, skip = [], roofs = 0.3 } = {}) {
  let d = '';
  const windows = [];
  for (let x = from; x < to;) {
    const w = 10 + r() * 20;
    if (!skip.some(([a, b]) => x + w > a && x < b)) {
      const base = ground(x + w / 2) + 4;
      const h = min + r() * (max - min);
      d += rect(x, base - h, w, h);
      if (r() < roofs) d += `M${r1(x - 1)} ${r1(base - h)}L${r1(x + w / 2)} ${r1(base - h - w * 0.3)}L${r1(x + w + 1)} ${r1(base - h)}Z`;
      for (let wy = base - h + 3; wy < base - 4; wy += 5) {
        for (let wx = x + 2.5; wx < x + w - 3; wx += 5) if (r() < 0.22) windows.push([wx, wy]);
      }
    }
    x += w + r() * 3;
  }
  return { d, windows };
}

// Kız Kulesi, the Maiden's Tower, on its island; x is the tower's middle and the water is at 300.
function maidensTower(cx) {
  const x = (n) => cx + n; // offsets from the middle
  const g = S('g', { class: 'kk' });
  g.append(
    S('path', { class: 'kk-rock', d: `M${x(-77)} 302Q${x(-69)} 293 ${x(-53)} 292L${x(-29)} 290Q${x(-3)} 287 ${x(25)} 289L${x(53)} 291Q${x(69)} 294 ${x(75)} 302Z` }),
    S('path', { class: 'kk-stone', d: rect(x(-69), 284, 136, 9) + rect(x(-69), 280, 6, 4) + rect(x(-55), 280, 6, 4) + rect(x(49), 280, 6, 4) + rect(x(61), 280, 6, 4) }),
    // Left wing with a little dome; right wing with a pitched roof.
    S('path', { class: 'kk-body', d: rect(x(-61), 266, 36, 18) + `M${x(-52)} 266A9 8 0 0 1 ${x(-34)} 266Z` + rect(x(-43.6), 252, 1.2, 6) }),
    S('path', { class: 'kk-body', d: rect(x(25), 264, 38, 20) + `M${x(22)} 264L${x(44)} 252L${x(66)} 264Z` }),
    // The main body, cornice, the upper tower, its balcony, the lantern, the roof.
    S('path', { class: 'kk-body', d: rect(x(-25), 236, 50, 48) + rect(x(-29), 231, 58, 5) + rect(x(-15), 196, 30, 35) + rect(x(-20), 191, 40, 5) + rect(x(-11), 167, 22, 4) + `M${x(-12)} 167L${x(0)} 130L${x(12)} 167Z` + rect(x(-0.6), 118, 1.2, 12) }),
    S('path', { class: 'kk-facet', d: rect(x(-7), 196, 4, 35) + rect(x(5), 196, 4, 35) + rect(x(-25), 236, 7, 48) }),
    S('path', { class: 'kk-rail', d: [-18, -12, -6, 0, 6, 12, 18].map((n) => rect(x(n) - 0.5, 186, 1, 5)).join('') + rect(x(-19), 185.5, 38, 1) }),
    S('path', { class: 'kk-lantern', d: rect(x(-9), 171, 18, 20) }),
    S('path', { class: 'kk-flag', d: `M${x(0.6)} 119l9 3.2-9 3.2Z` }),
    S('path', {
      class: 'kk-win',
      d: [-18, -4, 10].map((n) => arch(x(n), 244, 8, 13) + arch(x(n), 264, 8, 13)).join('')
        + [-11, 1].map((n) => arch(x(n), 202, 5, 12)).join('') + arch(x(-55), 270, 6, 9) + arch(x(-41), 270, 6, 9) + arch(x(32), 270, 6, 10) + arch(x(46), 270, 6, 10),
    }),
  );
  return g;
}

export function istanbul() {
  const r = seeded(21);
  const el = svgRoot('sky-istanbul', '0 0 1440 400', 'xMaxYMax slice');
  const SUN = [1150, 262], TOWER = 1265, MOON_X = 1120;
  // The sun path and the moon path on the water.
  const glitterPath = (cx, cls) => {
    const g = S('g', { class: cls });
    for (let y = 304; y < 398; y += 5) {
      const w = 46 - (y - 300) * 0.25 + r() * 18;
      const p = S('path', { d: `M${r1(cx - w / 2 + (r() - 0.5) * 14)} ${y}h${r1(w)}` });
      p.style.animationDelay = `${(-r() * 3).toFixed(2)}s`;
      g.append(p);
    }
    return g;
  };

  // Hills and shores.
  const hazePts = [[0, 282], [90, 270], [200, 276], [320, 262], [460, 272], [600, 258], [760, 268], [900, 252], [1040, 262], [1180, 246], [1320, 262], [1440, 256]];
  const nearPts = [[0, 236], [60, 226], [130, 214], [210, 210], [280, 220], [340, 236], [400, 256], [460, 276], [520, 292], [560, 302]];
  const far = buildings(r, 440, 1440, () => 296, { min: 5, max: 20, skip: [[1150, 1210]] });
  const near = buildings(r, 6, 520, (x) => along(nearPts, x), { min: 7, max: 17, skip: [[120, 262], [366, 396]], roofs: 0.5 });

  // The bridge: towers at 540 and 1000, the main cable hangs to y 250 mid-span.
  const T1 = 540, T2 = 1000, TOP = 150, DECK = 264, A1 = 430, A2 = 1110;
  const cableY = (x) => {
    if (x < T1) return TOP + ((DECK - 2 - TOP) * (T1 - x)) / (T1 - A1);
    if (x > T2) return TOP + ((DECK - 2 - TOP) * (x - T2)) / (A2 - T2);
    const t = (x - T1) / (T2 - T1);
    return (1 - t) ** 2 * TOP + 2 * t * (1 - t) * 350 + t ** 2 * TOP;
  };
  let hangers = '';
  for (let x = A1 + 14; x < A2 - 6; x += 12) if (Math.abs(x - T1) > 6 && Math.abs(x - T2) > 6) hangers += `M${x} ${r1(cableY(x))}V${DECK}`;
  const tower = (x) => rect(x - 5, TOP, 10, 300 - TOP) + [TOP + 6, 196, 240].map((y) => rect(x - 8, y, 16, 4)).join('') + rect(x - 7, TOP - 4, 14, 5);
  const lamps = [];
  const streaks = [];
  for (let x = A1 + 10; x < A2; x += 20) {
    lamps.push(S('circle', { class: 'ist-lamp', cx: x, cy: DECK - 2.5, r: 1.8, style: `animation-delay:${(-(x % 9) / 3).toFixed(2)}s` }));
    if ((x / 20) % 2 < 1) streaks.push(S('path', { class: 'ist-streak', d: `M${x} 305v${r1(8 + r() * 10)}`, style: `animation-delay:${(-r() * 3).toFixed(2)}s` }));
  }

  // Water: highlights drifting across.
  const waves = S('g', { class: 'ist-waves' });
  for (let i = 0; i < 34; i++) {
    const y = 304 + r() * 92, w = 20 + r() * 70;
    waves.append(S('path', { d: `M${r1(r() * 1440)} ${r1(y)}h${r1(w)}`, style: `animation-delay:${(-r() * 12).toFixed(1)}s;opacity:${(0.15 + (y - 300) / 400).toFixed(2)}` }));
  }

  const windows = (list, cls) => S('path', { class: cls, d: list.map(([x, y]) => rect(x, y, 2, 2.4)).join('') });
  const twinkle = (list, n) => list.filter((_, i) => i % n === 0).map(([x, y]) => S('rect', { class: 'ist-twinkle', x: r1(x), y: r1(y), width: 2, height: 2.4, style: `animation-delay:${(-r() * 5).toFixed(1)}s` }));

  // Kız Kulesi's reflection, faded and rippling.
  // The mask sits outside the flip, so it fades from the waterline down.
  const reflection = S('g', { class: 'kk-reflection', mask: 'url(#ist-fade)' }, S('g', { class: 'kk-flip' }, S('g', { class: 'kk-ripple' }, maidensTower(TOWER))));

  el.append(
    S('defs', {},
      vgrad('ist-water-g', [[0, 'var(--i-water-top)'], [0.35, 'var(--i-water-mid)'], [1, 'var(--i-water-bot)']]),
      vgrad('ist-haze-g', [[0, 'var(--i-haze)'], [1, 'var(--i-haze2)']]),
      vgrad('ist-far-g', [[0, 'var(--i-far)'], [1, 'var(--i-far2)']]),
      vgrad('ist-near-g', [[0, 'var(--i-near)'], [1, 'var(--i-near2)']]),
      vgrad('ist-sun-g', [[0, 'var(--m3)'], [1, 'var(--m1)']]),
      rgrad('ist-sunglow-g', [[0, 'var(--m3)', 0.55], [0.4, 'var(--m1)', 0.25], [1, 'var(--m1)', 0]]),
      rgrad('ist-beacon-g', [[0, '#fff3c4', 0.9], [0.35, '#ffd27a', 0.35], [1, '#ffd27a', 0]]),
      S('linearGradient', { id: 'ist-beam-g', x1: 0, y1: 0, x2: 1, y2: 0 }, S('stop', { offset: 0, style: 'stop-color:#fff1c2;stop-opacity:0.55' }), S('stop', { offset: 1, style: 'stop-color:#fff1c2;stop-opacity:0' })),
      S('linearGradient', { id: 'ist-fade-g', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, style: 'stop-color:#fff;stop-opacity:0.5' }), S('stop', { offset: 1, style: 'stop-color:#fff;stop-opacity:0' })),
      S('mask', { id: 'ist-fade', maskUnits: 'userSpaceOnUse', x: 1150, y: 300, width: 240, height: 100 }, S('rect', { x: 1150, y: 300, width: 240, height: 100, fill: 'url(#ist-fade-g)' })),
    ),
    // The setting sun (with the sunset glow) behind the far hills.
    S('g', { class: 'ist-sun' }, S('circle', { cx: SUN[0], cy: SUN[1], r: 170, fill: 'url(#ist-sunglow-g)' }), S('circle', { cx: SUN[0], cy: SUN[1], r: 30, fill: 'url(#ist-sun-g)' })),
    S('path', { class: 'ist-haze', fill: 'url(#ist-haze-g)', d: line(hazePts) + 'V300H0Z' + mosque(1180, 250, 18) }),
    S('path', { class: 'ist-far', fill: 'url(#ist-far-g)', d: 'M440 300V292H1440V300Z' + far.d + mosque(830, 294, 11, { inner: false, tall: 3.6 }) }),
    windows(far.windows, 'ist-win'),
    // Bridge
    S('path', { class: 'ist-bridge', d: tower(T1) + tower(T2) + rect(A1, DECK, A2 - A1, 6) + rect(A2 - 6, DECK, 6, 300 - DECK) }),
    S('path', { class: 'ist-hangers', d: hangers }),
    S('path', { class: 'ist-cable', d: `M${A1} ${DECK - 2}L${T1} ${TOP}Q770 350 ${T2} ${TOP}L${A2} ${DECK - 2}` }),
    S('path', { class: 'ist-deck-glow', d: `M${A1} ${DECK + 3}H${A2}` }),
    ...lamps,
    // Water
    S('rect', { class: 'ist-water', x: 0, y: 298, width: 1440, height: 102, fill: 'url(#ist-water-g)' }),
    waves,
    glitterPath(SUN[0], 'ist-sunpath'),
    glitterPath(MOON_X, 'ist-moonpath'),
    ...streaks,
    reflection,
    // The European side: a hill with a great mosque, Galata Tower and houses.
    S('path', {
      class: 'ist-near', fill: 'url(#ist-near-g)',
      d: line(nearPts) + 'V302H0Z' + mosque(192, 214, 24) + near.d
        + rect(372, 200, 18, 52) + rect(369, 206, 24, 4) + `M368 200L381 170L394 200Z`,
    }),
    windows(near.windows, 'ist-win'),
    ...twinkle([...far.windows, ...near.windows], 6),
    // Kız Kulesi: the lantern's glow, a slow beam, the tower itself.
    S('circle', { class: 'kk-glow', cx: TOWER, cy: 181, r: 26, fill: 'url(#ist-beacon-g)' }),
    S('path', { class: 'kk-beam', d: `M${TOWER} 181L${TOWER + 420} 150L${TOWER + 420} 212Z`, fill: 'url(#ist-beam-g)' }),
    maidensTower(TOWER),
  );
  return el;
}

// ---- Fireplace -------------------------------------------------------------------

// One tongue of flame from base, leaning a little.
function tongue(cx, base, w, h, lean) {
  return `M${r1(cx - w / 2)} ${base}C${r1(cx - w / 2)} ${r1(base - h * 0.35)} ${r1(cx - w * 0.32 + lean * 0.3)} ${r1(base - h * 0.62)} ${r1(cx + lean)} ${r1(base - h)}`
    + `C${r1(cx + w * 0.3 + lean * 0.3)} ${r1(base - h * 0.6)} ${r1(cx + w / 2)} ${r1(base - h * 0.36)} ${r1(cx + w / 2)} ${base}Z`;
}

export function fireplace() {
  const r = seeded(5);
  const el = svgRoot('sky-fire', '0 0 1440 420', 'xMidYMax slice');
  const BASE = 382;
  const layer = (cls, fill, count, from, to, wMin, wMax, hMin, hMax) => {
    const g = S('g', { class: cls, fill });
    for (let i = 0; i < count; i++) {
      const cx = from + ((to - from) * i) / (count - 1) + (r() - 0.5) * 16;
      const middle = 1 - Math.abs(cx - 720) / 260;
      const h = hMin + (hMax - hMin) * Math.max(0, middle) * (0.75 + r() * 0.25);
      g.append(S('path', {
        class: 'fl', d: tongue(cx, BASE, wMin + r() * (wMax - wMin), h, (r() - 0.5) * 30),
        style: `--d:${(0.7 + r() * 0.9).toFixed(2)}s;animation-delay:${(-r() * 2).toFixed(2)}s`,
      }));
    }
    return g;
  };
  // A log: bark, a cut end with rings, and glowing cracks.
  const log = (cx, cy, len, thick, angle) => S('g', { transform: `translate(${cx} ${cy}) rotate(${angle})` },
    S('rect', { class: 'log-bark', x: -len / 2, y: -thick / 2, width: len, height: thick, rx: thick / 2, fill: 'url(#log-g)' }),
    S('ellipse', { class: 'log-end', cx: len / 2 - thick * 0.28, cy: 0, rx: thick * 0.3, ry: thick / 2 - 1 }),
    S('ellipse', { class: 'log-ring', cx: len / 2 - thick * 0.28, cy: 0, rx: thick * 0.17, ry: thick * 0.3 }),
    S('path', { class: 'log-crack', d: `M${-len * 0.3} ${-thick * 0.15}q${len * 0.08} ${thick * 0.2} ${len * 0.17} 0t${len * 0.18} 0M${-len * 0.05} ${thick * 0.2}q${len * 0.08} -${thick * 0.18} ${len * 0.2} 0` }));
  el.append(
    S('defs', {},
      vgrad('fl-outer', [[0, 'var(--m2)', 0], [0.35, 'var(--m2)', 0.75], [1, 'var(--m1)', 0.95]]),
      vgrad('fl-mid', [[0, 'var(--m1)', 0], [0.3, 'var(--m1)', 0.9], [1, 'var(--m3)', 1]]),
      vgrad('fl-inner', [[0, 'var(--m3)', 0], [0.4, '#fff3c0', 0.95], [1, '#fffbe8', 1]]),
      vgrad('log-g', [[0, 'var(--f-bark-top)'], [1, 'var(--f-bark)']]),
      rgrad('coal-g', [[0, '#fff1a8', 1], [0.35, 'var(--m3)', 0.95], [0.7, 'var(--m1)', 0.8], [1, 'var(--m2)', 0]]),
      rgrad('halo-g', [[0, 'var(--m3)', 0.5], [0.5, 'var(--m1)', 0.22], [1, 'var(--m1)', 0]]),
    ),
    S('ellipse', { class: 'fire-halo', cx: 720, cy: 300, rx: 420, ry: 260, fill: 'url(#halo-g)' }),
    log(690, 372, 340, 30, -16),
    S('ellipse', { class: 'fire-coals', cx: 720, cy: 392, rx: 240, ry: 24, fill: 'url(#coal-g)' }),
    layer('fl-layer outer', 'url(#fl-outer)', 9, 560, 880, 80, 120, 120, 280),
    layer('fl-layer mid', 'url(#fl-mid)', 7, 595, 845, 60, 80, 90, 210),
    layer('fl-layer inner', 'url(#fl-inner)', 5, 645, 795, 40, 56, 60, 130),
    log(720, 394, 440, 36, -6),
    log(740, 386, 380, 32, 12),
  );
  return el;
}

// ---- Mountains -------------------------------------------------------------------

const RIDGE_PTS = [
  [[0, 200], [90, 170], [180, 190], [300, 120], [390, 160], [470, 135], [560, 175], [680, 95], [790, 150], [880, 125], [990, 175], [1110, 100], [1220, 150], [1320, 120], [1440, 160]],
  [[0, 240], [120, 190], [220, 225], [340, 160], [450, 215], [560, 180], [690, 235], [800, 170], [930, 225], [1040, 185], [1160, 240], [1270, 190], [1380, 230], [1440, 210]],
  [[0, 285], [150, 235], [280, 270], [420, 225], [560, 280], [720, 240], [880, 290], [1020, 250], [1180, 285], [1320, 245], [1440, 270]],
];
// Snow on each peak higher than `below`, with a ragged lower edge.
function caps(points, below) {
  let d = '';
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    if (py > below || py > points[i - 1][1] || py > points[i + 1][1]) continue;
    const L = points[i - 1], R = points[i + 1], f = 0.32;
    const pl = [px + (L[0] - px) * f, py + (L[1] - py) * f], pr = [px + (R[0] - px) * f, py + (R[1] - py) * f];
    const m = (a, t, dy) => [pl[0] + (pr[0] - pl[0]) * t, pl[1] + (pr[1] - pl[1]) * t + dy];
    d += line([[px, py], pr, m(pl, 0.8, -6), m(pl, 0.62, 5), m(pl, 0.42, -4), m(pl, 0.22, 6), pl]) + 'Z';
  }
  return d;
}
// A pine: tiers getting wider towards the ground.
function pine(x, base, h) {
  const w = h * 0.42;
  const pts = [[0, -1], [0.35, -0.66], [0.2, -0.66], [0.45, -0.36], [0.28, -0.36], [0.5, -0.08], [0.06, -0.08], [0.06, 0]];
  const right = pts.map(([px, py]) => [x + px * w, base + py * h]);
  const left = pts.slice(1).reverse().map(([px, py]) => [x - px * w, base + py * h]);
  return line([...right, ...left]) + 'Z';
}

export function mountains() {
  const r = seeded(13);
  const el = svgRoot('sky-mountains', '0 0 1440 360', 'xMidYMax slice');
  let trees = rect(0, 344, 1440, 16);
  for (let x = -6; x < 1450; x += 8 + r() * 10) trees += pine(x, 350 + r() * 6, 30 + r() * 44);
  el.append(
    S('defs', {},
      vgrad('mt1-g', [[0, 'var(--mt1a)'], [1, 'var(--mt1b)']]),
      vgrad('mt2-g', [[0, 'var(--mt2a)'], [1, 'var(--mt2b)']]),
      vgrad('mt3-g', [[0, 'var(--mt3a)'], [1, 'var(--mt3b)']]),
      vgrad('mist-g', [[0, 'var(--mt-mist)', 0], [0.5, 'var(--mt-mist)', 0.5], [1, 'var(--mt-mist)', 0]]),
    ),
    S('path', { class: 'mt-ridge', fill: 'url(#mt1-g)', d: line(RIDGE_PTS[0]) + 'V360H0Z' }),
    S('path', { class: 'mt-rim', d: line(RIDGE_PTS[0]) }),
    S('path', { class: 'mt-caps', d: caps(RIDGE_PTS[0], 170) }),
    S('rect', { class: 'mt-mist', x: -200, y: 170, width: 1840, height: 70, fill: 'url(#mist-g)' }),
    S('path', { class: 'mt-ridge', fill: 'url(#mt2-g)', d: line(RIDGE_PTS[1]) + 'V360H0Z' }),
    S('path', { class: 'mt-caps two', d: caps(RIDGE_PTS[1], 175) }),
    S('rect', { class: 'mt-mist two', x: -200, y: 230, width: 1840, height: 60, fill: 'url(#mist-g)' }),
    S('path', { class: 'mt-ridge', fill: 'url(#mt3-g)', d: line(RIDGE_PTS[2]) + 'V360H0Z' }),
    S('path', { class: 'mt-trees', d: trees }),
  );
  return el;
}

// ---- Retro horizon ---------------------------------------------------------------

// Neon mountains on the horizon, in front of the striped sun.
export function retroMountains() {
  const el = svgRoot('retro-mountains', '0 0 1440 120', 'none');
  const pts = [[0, 120], [0, 92], [80, 70], [150, 96], [240, 40], [330, 88], [420, 60], [500, 100], [580, 84], [640, 112], [800, 112], [860, 82], [950, 104], [1030, 50], [1120, 92], [1200, 30], [1290, 86], [1370, 66], [1440, 90], [1440, 120]];
  el.append(
    S('defs', {}, vgrad('retro-m-g', [[0, 'var(--m2)', 0.35], [1, 'var(--bg)', 1]])),
    S('path', { class: 'retro-m-fill', fill: 'url(#retro-m-g)', d: line(pts) + 'Z' }),
    S('path', { class: 'retro-m-edge', d: line(pts.slice(1, -1)) }),
  );
  return el;
}
