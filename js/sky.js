// The moving background behind every screen. One layer holds every effect;
// the CSS shows the ones <html data-sky="aurora stars ..."> lists (see the
// "Moving backgrounds" part of css/app.css), so effects can be mixed freely.
// Everything moves with CSS animations on transforms, opacity and stroke
// offsets, so it stays smooth on phones and the wall panel.
//
// The Evra website's night background is aurora + stars + lines of light; its
// showcase sections are the gold lines with glowing lights.

import { istanbul, fireplace, mountains, retroMountains } from './sky-scenes.js';

const NS = 'http://www.w3.org/2000/svg';

// The website's lines of light, drawn on a 1440 x 1000 canvas.
const LINES = [
  'M-60 140C260 40 520 300 860 180S1360 20 1520 120',
  'M-80 320C300 200 640 470 980 320S1400 220 1540 300',
  'M-60 520C240 400 600 660 940 500S1380 400 1520 480',
  'M-60 700C320 600 660 840 1000 680S1400 600 1520 660',
  'M-80 860C300 760 600 980 960 840S1380 760 1540 820',
  'M1500 60C1180 200 900 40 600 180S120 260 -60 160',
  'M1500 420C1200 560 940 380 620 520S160 600 -60 500',
  'M1500 780C1160 900 880 720 560 860S140 940 -60 860',
];
// Long gold and blue lines that draw themselves, as on the website's showcase.
const DRAW = [
  'M-40 760C260 620 420 820 720 640S1180 380 1480 470',
  'M-40 300C300 420 520 180 860 300S1240 520 1480 380',
  'M-40 520C220 460 520 600 760 500S1220 300 1480 260',
];
// Connections: points joined by lines that carry little dashes along them.
const NODES = [[180, 220], [520, 140], [860, 260], [1240, 180], [320, 560], [700, 480], [1080, 600], [1320, 820], [160, 860], [560, 800], [940, 900]];
const LINKS = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [2, 6], [3, 6], [4, 5], [5, 6], [6, 7], [4, 8], [8, 9], [5, 9], [9, 10], [6, 10], [10, 7]];
// A wave across 2880 units that repeats every 1440, so sliding it left by
// half its width loops without a seam.
function wavePath(y, amp, count) {
  const w = 1440 / count;
  let d = `M0 ${y}`;
  for (let x = 0; x < 2880; x += w) d += ` Q${x + w / 4} ${y - amp} ${x + w / 2} ${y} T${x + w} ${y}`;
  return `${d} V300 H0Z`;
}

function svg(cls, viewBox, paths, { ratio = 'none', length } = {}) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('class', cls);
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('preserveAspectRatio', ratio);
  el.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (length) p.setAttribute('pathLength', String(length));
    el.append(p);
  }
  return el;
}

const div = (cls, n = 0) => {
  const el = document.createElement('div');
  el.className = cls;
  for (let i = 0; i < n; i++) el.append(document.createElement('span'));
  return el;
};

// The same "random" scatter every time, so the background doesn't jump about.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Particles: each span gets its own place, size, speed and colour as CSS variables.
function particles(cls, count, seed, make) {
  const el = div(cls);
  const r = seeded(seed);
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    for (const [k, v] of Object.entries(make(r, i))) s.style.setProperty(k, v);
    el.append(s);
  }
  return el;
}
const colour = (i) => `var(--m${(i % 3) + 1})`;

function beams() {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('class', 'sky-beams');
  el.setAttribute('viewBox', '0 0 1440 1000');
  el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  el.setAttribute('aria-hidden', 'true');
  for (const [a, b] of LINKS) {
    const [x1, y1] = NODES[a], [x2, y2] = NODES[b];
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`);
    el.append(p);
  }
  for (const [x, y] of NODES) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 5);
    el.append(c);
  }
  return el;
}

// Seagulls gliding across, flapping now and then.
function gulls() {
  return particles('sky-gulls', 7, 9, (r) => ({
    '--y': `${(8 + r() * 36).toFixed(1)}vh`, '--s': (0.6 + r() * 0.8).toFixed(2),
    '--d': `${(26 + r() * 24).toFixed(1)}s`, '--delay': `${(-r() * 40).toFixed(1)}s`, '--f': `${(0.7 + r() * 0.6).toFixed(2)}s`,
  }));
}

// Retro: a striped sun going down behind a neon grid that rolls towards you.
function retro() {
  const el = div('sky-retro');
  const ground = div('retro-ground');
  ground.append(div('retro-plane'));
  el.append(div('retro-glow'), div('retro-sun'), retroMountains(), div('retro-horizon'), ground);
  return el;
}

export function ensureSky() {
  if (document.querySelector('.sky')) return;
  const sky = div('sky');
  sky.setAttribute('aria-hidden', 'true');
  const waves = div('sky-waves');
  waves.append(
    svg('wave w1', '0 0 2880 300', [wavePath(120, 38, 3)]),
    svg('wave w2', '0 0 2880 300', [wavePath(150, 30, 4)]),
    svg('wave w3', '0 0 2880 300', [wavePath(185, 24, 2)]),
  );
  sky.append(
    div('sky-flow'),
    div('sky-glow'),
    div('sky-dusk'),
    div('sky-stars'),
    div('sky-galaxy', 2),
    div('sky-moon'),
    div('sky-aurora', 3),
    div('sky-orbs', 3),
    svg('sky-draw', '0 0 1440 1000', DRAW, { length: 1400 }),
    beams(),
    svg('sky-lines', '0 0 1440 1000', LINES),
    particles('sky-fireflies', 26, 7, (r, i) => ({
      '--x': `${(r() * 100).toFixed(1)}%`, '--y': `${(20 + r() * 75).toFixed(1)}%`, '--s': `${(3 + r() * 3).toFixed(1)}px`,
      '--dx': `${Math.round(r() * 160 - 80)}px`, '--dy': `${Math.round(r() * 120 - 60)}px`,
      '--d': `${(6 + r() * 8).toFixed(1)}s`, '--b': `${(2 + r() * 3).toFixed(1)}s`, '--delay': `${(-r() * 8).toFixed(1)}s`, '--c': colour(i),
    })),
    mountains(),
    retro(),
    istanbul(),
    gulls(),
    waves,
    fireplace(),
    particles('sky-embers', 42, 11, (r, i) => ({
      '--x': `${(r() * 100).toFixed(1)}%`, '--s': `${(2.5 + r() * 3.5).toFixed(1)}px`, '--sway': `${Math.round(r() * 120 - 60)}px`,
      '--d': `${(8 + r() * 10).toFixed(1)}s`, '--delay': `${(-r() * 18).toFixed(1)}s`, '--c': i % 4 === 3 ? 'var(--m2)' : (i % 2 ? 'var(--m1)' : 'var(--m3)'),
    })),
    particles('sky-snow', 50, 3, (r) => ({
      '--x': `${(r() * 100).toFixed(1)}%`, '--s': `${(2 + r() * 4).toFixed(1)}px`, '--sway': `${Math.round(r() * 80 - 40)}px`,
      '--d': `${(10 + r() * 14).toFixed(1)}s`, '--delay': `${(-r() * 24).toFixed(1)}s`, '--o': (0.4 + r() * 0.5).toFixed(2),
    })),
  );
  document.body.prepend(sky);
}
