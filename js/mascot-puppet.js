// Evra's mascot, alive: the little blue house with gloves and work boots that hangs out on
// the Assistant tab. (The small badge version for icons and avatars is js/mascot.js.)
// It's drawn here as an SVG puppet (body, face, antenna, rubber-hose arms and legs,
// gloves, boots) and moved every frame, so it can blink, look at the pointer, wave,
// think with a hand on its chin, talk, listen and hop.
//
//   const m = createMascot();           m.el goes in the page
//   m.set('thinking' | 'talking' | 'listening' | 'happy' | 'sad' | 'wave' | 'idle', ms?)
//   m.say('Merhaba!', ms?)              a comic speech bubble
//   m.lookAt(x, y)                      -1..1 each; null goes back to following the pointer
//   m.mode('stand' | 'peek')            whole body, or peeking over a ledge (phones)
//   m.destroy()
//
// Colours are CSS variables (--ms-*, the "Mascot puppet" part of app.css).

import { h } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const D2R = Math.PI / 180;
const PIV = { x: 124, y: 156 };              // the body turns and squashes around its bottom
const SHOULDER = { L: [77, 121], R: [170, 113] };
const HIP = { L: [101, 152], R: [148, 151] };
const FOOT = { L: [93, 186], R: [156, 185] };
const LEDGE = 140;                           // peek mode: the ledge the hands hold on to
const EYES = { L: { cx: 114, cy: 82, rx: 12.5, ry: 16 }, R: { cx: 142, cy: 79, rx: 12, ry: 16.5 } };

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  el.append(...kids.flat().filter(Boolean));
  return el;
}
const f = (n) => Math.round(n * 100) / 100;
// An outlined stroke: a thick dark line with a thinner coloured one on top.
const hose = (cls, width) => [s('path', { class: 'ms-ink-line', 'stroke-width': width + 3 }), s('path', { class: cls, 'stroke-width': width })];

// ---- the drawing ---------------------------------------------------------------------

function glove(id) {
  const finger = (x1, y1, x2, y2) => [
    s('line', { class: 'ms-ink-line', x1, y1, x2, y2, 'stroke-width': 7.6 }),
    s('line', { class: 'ms-glove-line', x1, y1, x2, y2, 'stroke-width': 5 }),
  ];
  return s('g', { class: 'ms-glove', id },
    finger(16, 4.5, 29, 9), finger(17, 1.5, 32, 3), finger(17, -1.5, 32, -3.5), finger(16, -4.5, 28.5, -9.5),
    s('ellipse', { class: 'ms-glove-fill', cx: 14, cy: 0, rx: 9.5, ry: 8.6 }),
    finger(11, -5, 18, -13.5),
    s('path', { class: 'ms-crease', d: 'M15 -2 Q19 0 15 3' }),
    s('rect', { class: 'ms-cuff', x: -3.5, y: -8.8, width: 9.5, height: 17.6, rx: 4.5 }),
    s('path', { class: 'ms-crease', d: 'M1.5 -6 L1.5 6' }));
}

function boot() {
  return s('g', { class: 'ms-boot' },
    s('path', { class: 'ms-boot-fill', d: 'M-11 4 L-12.5 33 Q-13 39 -7 40 L29 40 Q37 40 36.5 33 Q36 26 26 23.5 L13.5 20.5 L12 4 Z' }),
    s('path', { class: 'ms-stitch', d: 'M14 24 Q30 25 33.5 33' }),
    s('path', { class: 'ms-stitch', d: 'M-10 30 L30 31' }),
    s('polyline', { class: 'ms-lace', points: '3,8 10,11 3,14 10,17 4,20 11,22' }),
    ...[[3, 8], [3, 14], [4, 20], [10, 11], [10, 17]].map(([cx, cy]) => s('circle', { class: 'ms-eyelet', cx, cy, r: 1.3 })),
    s('rect', { class: 'ms-collar', x: -12.5, y: -3, width: 25, height: 10, rx: 4.5 }),
    s('rect', { class: 'ms-sole', x: -15.5, y: 39, width: 54, height: 7.5, rx: 3.2 }),
    s('path', { class: 'ms-tread', d: 'M-10 46.5 v-2.5 M-2 46.5 v-2.5 M6 46.5 v-2.5 M14 46.5 v-2.5 M22 46.5 v-2.5 M30 46.5 v-2.5' }));
}

function build(svg, uid) {
  const clipL = `ms-eye-l-${uid}`, clipR = `ms-eye-r-${uid}`, clipM = `ms-mouth-${uid}`;
  const mouthClipPath = s('path');
  svg.append(s('defs', null,
    s('clipPath', { id: clipL }, s('ellipse', { cx: EYES.L.cx, cy: EYES.L.cy, rx: EYES.L.rx, ry: EYES.L.ry })),
    s('clipPath', { id: clipR }, s('ellipse', { cx: EYES.R.cx, cy: EYES.R.cy, rx: EYES.R.rx, ry: EYES.R.ry })),
    s('clipPath', { id: clipM }, mouthClipPath)));

  const shadow = s('ellipse', { class: 'ms-shadow', cx: 124, cy: 232, rx: 74, ry: 6 });
  const legs = { L: hose('ms-hose', 7), R: hose('ms-hose', 7) };
  const boots = { L: s('g', null, boot()), R: s('g', null, boot()) };
  const arms = { L: hose('ms-hose', 7), R: hose('ms-hose', 7) };
  const gloves = { L: glove(), R: glove() };
  const legsG = s('g', { class: 'ms-legs' }, legs.L, legs.R, boots.L, boots.R);
  const armsBack = s('g', null, arms.L, arms.R);
  const armsFront = s('g');

  // Body: side, front, a highlight, then the roof and the antenna.
  const eye = (e, clip) => {
    const pupil = s('g', null,
      s('ellipse', { class: 'ms-pupil', cx: e.cx + 4.5, cy: e.cy + 2, rx: 5.2, ry: 7.4 }),
      s('circle', { class: 'ms-shine', cx: e.cx + 6.5, cy: e.cy - 1.5, r: 1.7 }));
    const lid = s('rect', { class: 'ms-lid', x: e.cx - e.rx - 1, y: e.cy - e.ry - 1, width: e.rx * 2 + 2, height: 0 });
    const lidEdge = s('line', { class: 'ms-lid-edge', x1: e.cx - e.rx - 1, x2: e.cx + e.rx + 1, y1: e.cy - e.ry, y2: e.cy - e.ry, opacity: 0 });
    const g = s('g', null,
      s('ellipse', { class: 'ms-eye', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry }),
      s('g', { 'clip-path': `url(#${clip})` }, pupil, lid, lidEdge),
      s('ellipse', { class: 'ms-eye-line', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry }));
    return { g, pupil, lid, lidEdge, e };
  };
  const eyeL = eye(EYES.L, clipL), eyeR = eye(EYES.R, clipR);
  const browL = s('g', null, s('path', { class: 'ms-ink-line', d: 'M101 63 Q111 52 123 59', 'stroke-width': 5.6 }), s('path', { class: 'ms-brow', d: 'M101 63 Q111 52 123 59', 'stroke-width': 2.6 }));
  const browR = s('g', null, s('path', { class: 'ms-ink-line', d: 'M134 56 Q146 46 156 57', 'stroke-width': 5.6 }), s('path', { class: 'ms-brow', d: 'M134 56 Q146 46 156 57', 'stroke-width': 2.6 }));
  const mouthFill = s('path', { class: 'ms-mouth' });
  const tongue = s('ellipse', { class: 'ms-tongue', cx: 123, cy: 120, rx: 9.5, ry: 6 });
  const teeth = s('rect', { class: 'ms-teeth', x: 100, y: 100, width: 46, height: 3 });
  const mouthLine = s('path', { class: 'ms-mouth-line' });
  const creaseL = s('path', { class: 'ms-crease-ink' });
  const nose = s('g', null, s('circle', { class: 'ms-nose', cx: 136, cy: 96, r: 4.8 }), s('circle', { class: 'ms-shine', cx: 134.6, cy: 94.4, r: 1.3 }));
  const face = s('g', { class: 'ms-face' }, browL, browR, eyeL.g, eyeR.g,
    s('g', null, mouthFill, s('g', { 'clip-path': `url(#${clipM})` }, teeth, tongue), mouthLine, creaseL), nose);

  const waves = [1, 2].map((i) => s('path', {
    class: 'ms-wave', d: `M${110 - i * 9} ${12 - i * 6} Q125 ${-2 - i * 12} ${140 + i * 9} ${12 - i * 6}`, opacity: 0,
  }));
  const antenna = s('g', { class: 'ms-antenna' },
    ...waves,
    s('path', { class: 'ms-ink-line', d: 'M110 11 Q125 -2 140 11', 'stroke-width': 8.4 }),
    s('path', { class: 'ms-roof-line', d: 'M110 11 Q125 -2 140 11', 'stroke-width': 5 }),
    s('circle', { class: 'ms-ball', cx: 125, cy: 25, r: 7.6 }),
    s('circle', { class: 'ms-shine', cx: 122.5, cy: 22.5, r: 1.8 }));
  const body = s('g', { class: 'ms-body' },
    s('path', { class: 'ms-side', d: 'M166 84 L180 94 L180 150 Q174 154 166 155 Z' }),
    s('path', { class: 'ms-front', d: 'M125 37 L68 91 Q67 124 70 155 Q118 163 167 155 L167 84 Z' }),
    s('path', { class: 'ms-hi', d: 'M76 96 Q74 124 77 148' }),
    face,
    s('path', { class: 'ms-ink-line', d: 'M53 93 L125 30 L193 87', 'stroke-width': 14.5, 'stroke-linejoin': 'round' }),
    s('path', { class: 'ms-roof-line', d: 'M53 93 L125 30 L193 87', 'stroke-width': 9.5, 'stroke-linejoin': 'round' }),
    antenna);
  const hit = s('ellipse', { class: 'ms-hit', cx: 124, cy: 96, rx: 64, ry: 70 });

  svg.append(shadow, legsG, armsBack, body, armsFront, gloves.L, gloves.R, hit);
  return { shadow, legs, boots, legsG, arms, gloves, armsBack, armsFront, body, face, eyeL, eyeR, browL, browR, mouthFill, mouthClipPath, tongue, teeth, mouthLine, creaseL, antenna, waves, hit };
}

// ---- poses ---------------------------------------------------------------------------
// Hands are offsets from the shoulders (or { abs: true } points), with the glove's angle
// in degrees (0 = fingers to the right, 90 = down). "front" draws the arm over the body.

const IDLE_HANDS = { L: { x: -40, y: 33, a: 150 }, R: { x: 55, y: -17, a: -14 } };

function pose(state, t, peek) {
  const sin = Math.sin, base = { by: 0, rot: 0, sx: 1, sy: 1, look: null, brow: [0, 0], o: 0.55, smile: 0.6, signal: 0, hands: { ...IDLE_HANDS }, tap: 0 };
  const breathe = sin(t * 2.1);
  base.sy = 1 + breathe * 0.012;
  base.sx = 1 - breathe * 0.008;
  base.rot = sin(t * 0.7) * 1.4;
  base.hands = {
    L: { ...IDLE_HANDS.L, y: IDLE_HANDS.L.y + sin(t * 1.3) * 2, a: IDLE_HANDS.L.a + sin(t * 1.1) * 6 },
    R: { ...IDLE_HANDS.R, y: IDLE_HANDS.R.y + sin(t * 1.5 + 1) * 2.5, a: IDLE_HANDS.R.a + sin(t * 1.2) * 5 },
  };
  if (peek) {
    base.hands = { L: { abs: true, x: 90, y: LEDGE - 16, a: 80 }, R: { abs: true, x: 158, y: LEDGE - 16, a: 100 } };
    base.rot = sin(t * 0.7) * 2;
  }
  switch (state) {
    case 'wave':
      base.hands.R = { x: 38, y: -64 + sin(t * 9) * 3, a: -80 + sin(t * 9) * 26 };
      base.smile = 0.9; base.o = 0.75; base.brow = [1, 1]; base.rot = sin(t * 4.5) * 3;
      break;
    case 'thinking':
      base.hands.R = { x: -32, y: 20 + sin(t * 6) * 1.2, a: -125, front: true };
      if (!peek) base.hands.L = { x: -8, y: 34, a: 95 };
      base.look = [0.55, -0.85]; base.brow = [0.2, 1.2]; base.o = 0.08; base.smile = 0.1; base.signal = 1;
      base.rot = 3 + sin(t * 1.4) * 2.5;
      break;
    case 'talking': {
      const beat = sin(t * 5.2);
      base.hands.R = { x: 50 + beat * 4, y: -10 - Math.abs(beat) * 10, a: -24 + beat * 16 };
      if (!peek) base.hands.L = { x: -46 - beat * 3, y: 8 + beat * 6, a: 190 - beat * 14 };
      base.o = 0.3 + Math.abs(sin(t * 13)) * 0.55 + Math.abs(sin(t * 7.3)) * 0.15;
      base.smile = 0.7; base.brow = [0.4 + beat * 0.3, 0.5 - beat * 0.3]; base.look = [0, 0.15];
      base.by = -Math.abs(sin(t * 5.2)) * 2.5; base.rot = beat * 2.5;
      break;
    }
    case 'listening':
      base.hands.R = { x: -4, y: -40, a: -105, front: false };
      base.rot = -5; base.look = [-0.6, -0.5]; base.brow = [1, 0.6]; base.o = 0.12; base.smile = 0.5; base.signal = -1;
      break;
    case 'happy': {
      const hop = Math.max(0, sin(t * 7.5));
      base.by = -hop * (peek ? 10 : 18);
      base.sy = 1 + hop * 0.05 - (1 - hop) * 0.04; base.sx = 2 - base.sy;
      base.hands.R = { x: 34, y: -62 + hop * 4, a: -72 };
      base.hands.L = { x: -34, y: -62 + hop * 4, a: 252 };
      base.o = 0.95; base.smile = 1; base.brow = [1.2, 1.2];
      break;
    }
    case 'sad':
      base.by = peek ? 8 : 2; base.sy = 0.97; base.sx = 1.02; base.rot = 0;
      if (!peek) base.hands = { L: { x: -10, y: 42, a: 98 }, R: { x: 12, y: 42, a: 82 } };
      base.look = [0, 0.8]; base.brow = [-0.9, -0.9]; base.o = 0.1; base.smile = -0.8;
      break;
    case 'poke':
      base.sy = 0.9; base.sx = 1.08; base.o = 0.9; base.smile = 1; base.brow = [1.4, 1.4]; base.look = [0, 0];
      break;
    default:
  }
  return base;
}

// The mouth: open o (0..1) and smile (-1 frown .. 1 grin).
function mouthShape(o, smile) {
  const lift = smile * 3.2;
  const L = [100.5, 104.5 - lift], R = [145.5, 101.5 - lift];
  const depth = 3 + o * 30 + Math.max(0, smile) * 2.5;
  const sag = smile < 0 ? -smile * 6 : 0; // a frown bows the top edge up
  const top = `M${f(L[0])} ${f(L[1])} Q123 ${f(105 - sag)} ${f(R[0])} ${f(R[1])}`;
  const bottom = `C${f(R[0] - 1)} ${f(R[1] + depth * 0.85 - sag)} ${f(L[0] + 6)} ${f(L[1] + depth * 1.02 - sag)} ${f(L[0])} ${f(L[1])}Z`;
  return { d: `${top} ${bottom}`, depth, L, R, sag };
}
function drawMouth(P, m, smile) {
  P.mouthFill.setAttribute('d', m.d);
  P.mouthLine.setAttribute('d', m.d);
  P.mouthClipPath.setAttribute('d', m.d);
  P.tongue.setAttribute('cy', f(m.L[1] + m.depth * 0.86 - m.sag));
  P.tongue.setAttribute('rx', f(8 + m.depth * 0.12));
  P.tongue.setAttribute('ry', f(2 + m.depth * 0.27));
  P.teeth.setAttribute('y', f(Math.min(m.L[1], m.R[1]) - 1));
  P.creaseL.setAttribute('d', `M${f(m.L[0] - 6)} ${f(m.L[1] - 4)} Q${f(m.L[0] - 5)} ${f(m.L[1] + 2)} ${f(m.L[0] + 1)} ${f(m.L[1] + 3)}`);
  P.creaseL.setAttribute('opacity', smile > 0.2 ? 1 : 0);
}

// ---- the puppet ----------------------------------------------------------------------

let uidSeq = 0;
export function createMascot() {
  const uid = ++uidSeq;
  const svg = s('svg', { class: 'puppet-svg', viewBox: '-24 -16 300 262', 'aria-hidden': 'true', focusable: 'false' });
  const P = build(svg, uid);
  const clip = h('div', { class: 'puppet-clip' }, svg);
  const bubble = h('div', { class: 'puppet-bubble', role: 'status', 'aria-live': 'polite' });
  const el = h('div', { class: 'puppet stand' }, clip, bubble);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'); // light mode: still pictures (util.js applyLite)
  let state = 'idle', until = 0, after = 'idle';
  let peek = false;
  let pointer = null, pointerAt = 0, forcedLook = null;
  let lookTarget = [0, 0], nextSaccade = 0;
  let blinkAt = 1.5, blinkLen = 0.16, doubleBlink = false;
  let fidget = null, nextFidget = 6;
  const cur = { by: 0, rot: 0, sx: 1, sy: 1, lx: 0, ly: 0, b0: 0, b1: 0, o: 0.55, smile: 0.6, signal: 0, tap: 0, hands: null };
  let wob = 0, wobV = 0;
  let raf = 0, last = 0, start = performance.now();
  let bubbleTimer = 0;
  let lastMouth = '';

  const toWorld = (px, py) => {
    const x = (px - PIV.x) * cur.sx, y = (py - PIV.y) * cur.sy;
    const c = Math.cos(cur.rot * D2R), sn = Math.sin(cur.rot * D2R);
    return [PIV.x + x * c - y * sn, PIV.y + cur.by + x * sn + y * c];
  };

  function placeArm(side, hand) {
    const sh = toWorld(...SHOULDER[side]);
    let wx, wy;
    if (hand.abs) [wx, wy] = [hand.x, hand.y + (peek ? Math.min(0, cur.by) : 0)];
    else [wx, wy] = [sh[0] + hand.x, sh[1] + hand.y];
    const a = hand.a * D2R;
    const dist = Math.hypot(wx - sh[0], wy - sh[1]);
    const cx = wx - Math.cos(a) * dist * 0.55, cy = wy - Math.sin(a) * dist * 0.55;
    const d = `M${f(sh[0])} ${f(sh[1])} Q${f(cx)} ${f(cy)} ${f(wx)} ${f(wy)}`;
    for (const p of P.arms[side]) p.setAttribute('d', d);
    const flip = side === 'L' ? ' scale(1 -1)' : '';
    P.gloves[side].setAttribute('transform', `translate(${f(wx)} ${f(wy)}) rotate(${f(hand.a)})${flip}`);
    const layer = hand.front ? P.armsFront : P.armsBack;
    if (P.arms[side][0].parentNode !== layer) layer.append(...P.arms[side]);
  }

  function placeLeg(side, footLift) {
    const hp = toWorld(...HIP[side]);
    const ft = [FOOT[side][0], FOOT[side][1] + footLift];
    const out = side === 'L' ? -1 : 1;
    const bow = 3 + Math.max(0, 1 - cur.sy) * 90;
    const mx = (hp[0] + ft[0]) / 2 + out * bow, my = (hp[1] + ft[1]) / 2;
    const d = `M${f(hp[0])} ${f(hp[1])} Q${f(mx)} ${f(my)} ${f(ft[0])} ${f(ft[1] + 2)}`;
    for (const p of P.legs[side]) p.setAttribute('d', d);
    const tap = side === 'R' ? cur.tap : 0;
    const flip = side === 'L' ? ' scale(-1 1)' : '';
    P.boots[side].setAttribute('transform', `translate(${f(ft[0])} ${f(ft[1])})${flip} rotate(${f(-tap)} -12 44)`);
  }

  function frame(now) {
    raf = 0;
    if (!el.isConnected) return;
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (until && t * 1000 >= until) { until = 0; setState(after); }

    // What the current state asks for, with a fidget on top while idle.
    let p = pose(state, t, peek);
    if (state === 'idle' && !reduce) {
      if (!fidget && t > nextFidget) {
        const kinds = peek ? ['wave', 'antenna', 'look'] : ['wave', 'tap', 'antenna', 'look', 'stretch'];
        fidget = { kind: kinds[Math.floor(Math.random() * kinds.length)], end: t + 1.8 };
        if (fidget.kind === 'antenna') wobV += 120;
      }
      if (fidget) {
        if (t > fidget.end) { fidget = null; nextFidget = t + 5 + Math.random() * 7; }
        else if (fidget.kind === 'wave') p = { ...p, hands: { ...p.hands, R: { x: 36, y: -60 + Math.sin(t * 9) * 3, a: -82 + Math.sin(t * 9) * 24 } }, smile: 0.9 };
        else if (fidget.kind === 'tap') p.tap = Math.max(0, Math.sin(t * 14)) * 14;
        else if (fidget.kind === 'stretch') { p.sy = 1.06; p.sx = 0.95; p.look = [0, -0.6]; }
        else if (fidget.kind === 'look') p.look = [Math.sin(t * 2.5) * 0.9, 0.1];
      }
    }

    // Where the eyes go: the state's look, else the pointer, else little glances around.
    if (forcedLook) lookTarget = forcedLook;
    else if (p.look) lookTarget = p.look;
    else if (pointer && now - pointerAt < 4000) lookTarget = pointer;
    else if (t > nextSaccade) { lookTarget = [Math.random() * 1.4 - 0.7, Math.random() * 0.8 - 0.3]; nextSaccade = t + 1.4 + Math.random() * 2.6; }

    const k = reduce ? 1 : 1 - Math.exp(-dt * 12);
    const kSlow = reduce ? 1 : 1 - Math.exp(-dt * 7);
    for (const key of ['by', 'rot', 'sx', 'sy', 'o', 'smile', 'signal', 'tap']) cur[key] += ((p[key] ?? 0) - cur[key]) * (key === 'o' ? Math.min(1, k * 1.6) : k);
    cur.lx += (lookTarget[0] - cur.lx) * Math.min(1, k * 1.4);
    cur.ly += (lookTarget[1] - cur.ly) * Math.min(1, k * 1.4);
    cur.b0 += (p.brow[0] - cur.b0) * kSlow;
    cur.b1 += (p.brow[1] - cur.b1) * kSlow;
    if (!cur.hands) cur.hands = JSON.parse(JSON.stringify(p.hands));
    for (const side of ['L', 'R']) {
      const want = p.hands[side];
      let have = cur.hands[side];
      if (!!want.abs !== !!have.abs) {
        // Switching between a ledge point and a shoulder offset: same spot, other terms.
        const sh = toWorld(...SHOULDER[side]);
        have = cur.hands[side] = want.abs
          ? { abs: true, x: sh[0] + have.x, y: sh[1] + have.y, a: have.a }
          : { x: have.x - sh[0], y: have.y - sh[1], a: have.a };
      }
      for (const key of ['x', 'y', 'a']) have[key] += (want[key] - have[key]) * kSlow;
      have.front = want.front;
    }

    // Antenna: a little spring that follows the body.
    const drive = -cur.rot * 1.6;
    wobV += (-70 * (wob - drive) - 7 * wobV) * dt;
    wob += wobV * dt;
    if (reduce) wob = drive;

    // Blinking.
    let blink = 0;
    if (!reduce) {
      if (t > blinkAt + blinkLen) {
        blinkAt = doubleBlink ? t + 0.12 : t + 2.2 + Math.random() * 3.6;
        doubleBlink = !doubleBlink && Math.random() < 0.22;
      }
      if (t >= blinkAt && t <= blinkAt + blinkLen) blink = Math.sin(((t - blinkAt) / blinkLen) * Math.PI);
    }
    if (state === 'happy') blink = Math.max(blink, 0.16);
    if (state === 'sad') blink = Math.max(blink, 0.3);
    paint(blink);
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  function paint(blink) {
    P.body.setAttribute('transform', `translate(${PIV.x} ${f(PIV.y + cur.by)}) rotate(${f(cur.rot)}) scale(${f(cur.sx)} ${f(cur.sy)}) translate(${-PIV.x} ${-PIV.y})`);
    P.face.setAttribute('transform', `translate(${f(cur.lx * 2.4)} ${f(cur.ly * 1.8)})`);
    for (const eye of [P.eyeL, P.eyeR]) {
      eye.pupil.setAttribute('transform', `translate(${f(cur.lx * 5 - 1.5)} ${f(cur.ly * 6)})`);
      const hgt = (eye.e.ry * 2 + 2) * blink;
      eye.lid.setAttribute('height', f(hgt));
      eye.lidEdge.setAttribute('y1', f(eye.e.cy - eye.e.ry - 1 + hgt));
      eye.lidEdge.setAttribute('y2', f(eye.e.cy - eye.e.ry - 1 + hgt));
      eye.lidEdge.setAttribute('opacity', blink > 0.05 ? 1 : 0);
    }
    // Raised brows go up; worried ones (below 0) tip their inner ends up.
    P.browL.setAttribute('transform', `translate(0 ${f(-cur.b0 * 3.5)}) rotate(${f(Math.min(0, cur.b0) * 7)} 112 58)`);
    P.browR.setAttribute('transform', `translate(0 ${f(-cur.b1 * 3.5)}) rotate(${f(-Math.min(0, cur.b1) * 7)} 145 52)`);
    const m = mouthShape(Math.max(0, cur.o), cur.smile);
    if (m.d !== lastMouth) { lastMouth = m.d; drawMouth(P, m, cur.smile); }
    P.antenna.setAttribute('transform', `rotate(${f(wob)} 125 32)`);
    const sig = cur.signal;
    const tt = performance.now() / 1000;
    P.waves.forEach((w, i) => {
      const phase = sig >= 0 ? (tt * 1.6 - i * 0.35) % 1 : 1 - ((tt * 1.6 + i * 0.35) % 1);
      w.setAttribute('opacity', f(Math.abs(sig) * Math.max(0, Math.sin(phase * Math.PI))));
    });
    placeArm('L', cur.hands.L);
    placeArm('R', cur.hands.R);
    const air = Math.min(0, cur.by);
    if (!peek) {
      placeLeg('L', air);
      placeLeg('R', air);
      P.shadow.setAttribute('rx', f(74 * (1 + air / 70)));
      P.shadow.setAttribute('opacity', f(1 + air / 60));
    }
  }

  function kick() { if (!raf && !reduce) { last = 0; raf = requestAnimationFrame(frame); } }

  function setState(next, ms = 0, then = 'idle') {
    if (next !== state && (next === 'happy' || next === 'poke' || next === 'wave')) wobV += 160;
    state = next;
    fidget = null;
    until = ms ? (performance.now() - start) + ms : 0;
    after = then;
    el.dataset.state = next;
    if (reduce) requestAnimationFrame(frame);
    kick();
  }

  function say(text, ms = 2800) {
    clearTimeout(bubbleTimer);
    if (!text) { bubble.classList.remove('show'); return; }
    bubble.textContent = text;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    if (ms) bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
  }

  const onMove = (e) => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width * 0.49, cy = r.top + r.height * 0.33;
    pointer = [Math.max(-1, Math.min(1, (e.clientX - cx) / 260)), Math.max(-1, Math.min(1, (e.clientY - cy) / 220))];
    pointerAt = performance.now();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  const LINES = ['Hihi, gıdıklanıyorum!', 'Evinize göz kulak oluyorum.', 'Bir şey mi soracaktınız?', 'Işıkları ben açmadım, söz!', 'Antenim her şeyi duyar.'];
  let lineAt = 0;
  P.hit.addEventListener('click', () => {
    setState('poke', 260, 'happy');
    setTimeout(() => { if (state === 'happy') setState('happy', 900); }, 270);
    say(LINES[lineAt++ % LINES.length], 2200);
  });
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);

  if (reduce) requestAnimationFrame(frame); else kick();

  return {
    el,
    set: (next, ms, then) => setState(next, ms, then),
    get state() { return state; },
    say,
    lookAt(x, y) { forcedLook = x == null ? null : [x, y]; kick(); },
    mode(m) {
      const p = m === 'peek';
      if (p === peek) return;
      peek = p;
      cur.hands = null;
      el.classList.toggle('peek', peek);
      el.classList.toggle('stand', !peek);
      P.legsG.style.display = peek ? 'none' : '';
      P.shadow.style.display = peek ? 'none' : '';
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(bubbleTimer);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      el.remove();
    },
  };
}
