// Each person's customization: colour theme, moving background, shapes and
// spacing, and the order and visibility of sections, indicators, buttons,
// rooms, scenes, tabs and device tiles. Kept in this browser only, so a phone
// and the wall panel can each have their own. Changing it fires an
// "evra-custom" event; the app shell re-applies the look and re-draws the open
// screen unless the change says { rerender: false }.
//
// Edit mode (isEditing) is the on-screen way to arrange things: everything
// that can move gets a handle or can be dragged, and an eye to hide it.

import { paletteById, PRESETS, EFFECTS } from './themes.js';

const KEY = 'evra.custom';

// An arrangeable list: ids in the chosen order (unknown ids keep their own
// order after these) and the ids that are hidden.
const list = (hidden = [], extra = {}) => ({ order: [], hidden, ...extra });

export const DEFAULTS = {
  palette: 'evra',
  accent: '',                 // '' = the theme's own accent
  background: 'auto',         // auto (the theme's own) | none | custom (the effects below)
  effects: [],                // background layers when background is 'custom' (see EFFECTS)
  skyStrength: 'normal',      // subtle | normal | strong
  skyMotion: 'normal',        // still | calm | normal
  corners: 'rounded',         // square | soft | rounded | round
  density: 'comfortable',     // compact | comfortable | spacious
  size: 'normal',             // small | normal | large
  glow: true,                 // tiles take on their colour when on
  columns: 'auto',            // tiles per row on wider screens: auto | 1..4
  tileStyle: 'full',          // full | compact (name, state and switch only)
  groupRooms: true,           // tiles under a heading per room, or one list
  quickStyle: 'full',         // full | compact (icon and name only)
  navLabels: true,            // names under the navigation icons
  phoneTabs: false,           // Energy and Remotes in the phone's tab bar too
  pageWidth: 'normal',        // normal | full
  sectionTitles: true,        // "Rooms", "Quick actions" and room headings
  // Buttons
  btnShape: 'rounded',        // pill | rounded | square
  btnStyle: 'filled',         // filled | soft | outline   (main buttons)
  btnSize: 'normal',          // small | normal | large
  quickLookStyle: 'card',     // card | tinted | outline | solid   (quick action buttons)
  iconStyle: 'bubble',        // bubble | circle | plain
  depth: 'soft',              // flat | soft | raised | glow
  press: 'subtle',            // none | subtle | bouncy
  quickLook: {},              // quick action id -> { tone, icon, name }
  sections: list([], { half: ['climate', 'quick'] }),
  indicators: list(['power', 'lights']),
  quick: list(),
  rooms: list(),
  scenes: list(),
  nav: list(),
  header: list(),
  tiles: list([], { wide: [], small: [] }),
};

// Everything under "layout", for "Reset layout".
export const BUTTON_KEYS = ['btnShape', 'btnStyle', 'btnSize', 'quickLookStyle', 'iconStyle', 'depth', 'press', 'quickLook', 'quickStyle'];
export const LAYOUT_KEYS = ['sections', 'indicators', 'quick', 'rooms', 'scenes', 'nav', 'header', 'tiles',
  'columns', 'tileStyle', 'groupRooms', 'quickStyle', 'navLabels', 'phoneTabs', 'pageWidth', 'sectionTitles'];

// What can be arranged. The labels show while editing.
export const SECTIONS = [
  { id: 'climate', label: 'Room climate' },
  { id: 'quick', label: 'Quick actions' },
  { id: 'rooms', label: 'Room chips' },
  { id: 'devices', label: 'Device tiles' },
];
// group: 'top' sits in the card's heading, 'stat' in the readings row, 'chip'
// in the chips row. Things move within their own row.
export const INDICATORS = [
  { id: 'badge', label: 'Comfort badge', group: 'top' },
  { id: 'range', label: 'Comfortable range', group: 'top' },
  { id: 'humidity', label: 'Humidity', group: 'stat' },
  { id: 'outside', label: 'Outside temperature', group: 'stat' },
  { id: 'power', label: 'Power in use', group: 'stat' },
  { id: 'window', label: 'Windows and doors', group: 'chip' },
  { id: 'presence', label: 'Someone here', group: 'chip' },
  { id: 'lights', label: 'Lights on', group: 'chip' },
];
export const HEADER_ITEMS = [
  { id: 'title', label: 'Greeting and page name' },
  { id: 'clock', label: 'Date and time' },
  { id: 'mode', label: 'Light and dark button' },
  { id: 'status', label: 'Connection status' },
];
// Navigation tabs that can't be hidden, so the app can always be found again.
export const LOCKED_NAV = ['home', 'settings'];

// ---- reading and saving ----------------------------------------------------------

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

const str = (v, max = 40) => (typeof v === 'string' ? v.slice(0, max) : undefined);
// Each quick action's own colour, icon and name.
function cleanLook(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, look] of Object.entries(v)) {
    if (!look || typeof look !== 'object') continue;
    const tone = str(look.tone), icon = str(look.icon), name = str(look.name, 24);
    const one = {};
    if (tone && /^(#[\da-f]{6}|var\(--p-[a-z0-9-]+\))$/i.test(tone)) one.tone = tone;
    if (icon && /^[a-zA-Z]+$/.test(icon)) one.icon = icon;
    if (name && name.trim()) one.name = name.trim();
    if (Object.keys(one).length) out[id] = one;
  }
  return out;
}

const EFFECT_IDS = new Set(EFFECTS.map((e) => e.id));

function clean(saved) {
  const out = structuredClone(DEFAULTS);
  if (!saved || typeof saved !== 'object') return out;
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = saved[k];
    if (v == null) continue;
    if (Array.isArray(def)) out[k] = ids(v).filter((x) => k !== 'effects' || EFFECT_IDS.has(x));
    else if (k === 'quickLook') out[k] = cleanLook(v);
    else if (typeof def === 'object') {
      if (typeof v !== 'object') continue;
      for (const f of Object.keys(def)) if (v[f] !== undefined) out[k][f] = ids(v[f]);
    } else if (typeof v === typeof def) out[k] = v;
  }
  // Older setups named one background; that's now a mix of effects.
  if (PRESETS[out.background]) { out.effects = [...PRESETS[out.background]]; out.background = 'custom'; }
  return out;
}

let cache = null;
export function getCustom() {
  if (!cache) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    cache = clean(saved);
  }
  return cache;
}

const announce = (rerender) => window.dispatchEvent(new CustomEvent('evra-custom', { detail: { rerender } }));

function commit(next, rerender) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this visit only */ }
  announce(rerender);
}

export function setCustom(patch, { rerender = true } = {}) {
  commit(clean({ ...getCustom(), ...patch }), rerender);
}
export function replaceCustom(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('not a setup');
  commit(clean(obj), true);
}
export function resetCustom(keys) {
  if (!keys) { commit(structuredClone(DEFAULTS), true); return; }
  const patch = {};
  for (const k of keys) patch[k] = structuredClone(DEFAULTS[k]);
  setCustom(patch);
}

// ---- edit mode ---------------------------------------------------------------------

let editing = false;
export const isEditing = () => editing;
export function setEditing(on) {
  if (editing === !!on) return;
  editing = !!on;
  document.documentElement.classList.toggle('editing', editing);
  announce(true);
}

// ---- arranging -------------------------------------------------------------------

// items sorted by cfg.order; items the order doesn't know keep their place after.
export function ordered(items, cfg, key = (x) => x.id) {
  const pos = new Map((cfg?.order || []).map((id, i) => [id, i]));
  return items
    .map((x, i) => ({ x, i, p: pos.has(key(x)) ? pos.get(key(x)) : Infinity }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((o) => o.x);
}
export const isHidden = (cfg, id) => !!cfg?.hidden?.includes(id);

// Adds or removes id in one of a list's id arrays ('hidden', 'wide', 'small').
export function withFlag(cfg, field, id, on) {
  const set = new Set(cfg[field] || []);
  if (on) set.add(id); else set.delete(id);
  return { ...cfg, [field]: [...set] };
}

// `subset` is a new order for some of the ids in `all`; they take the places
// those ids had, so everything else keeps its position.
export function mergeOrder(all, subset) {
  const set = new Set(subset);
  const full = [...all, ...subset.filter((id) => !all.includes(id))];
  let i = 0;
  return full.map((id) => (set.has(id) ? subset[i++] : id));
}

// ---- the look ----------------------------------------------------------------------

const RADII = { square: [8, 7, 6], soft: [16, 13, 10], round: [32, 24, 18] };
const DENSITY = { compact: [10, 14], spacious: [22, 24] };
const ZOOM = { small: 0.92, large: 1.1 };
const SKY_OPACITY = { subtle: 0.45, normal: 0.75, strong: 1 };
const PASTEL_VARS = { sky: '--p-sky', splash: '--p-splash', denim: '--p-denim', seawash: '--p-seawash', stlouis: '--p-stlouis', mint: '--p-mint', gentle: '--p-gentle', stlouis2: '--p-stlouis-2', alpine: '--p-alpine', arctic: '--p-arctic' };
const SURFACE_VARS = { bg: '--bg', card: '--card', card2: '--card-2', card3: '--card-3', muted: '--muted', text: '--text', accent: '--accent', line: '--line', lineStrong: '--line-strong' };
const ROOT_CLASSES = ['no-glow', 'quick-compact', 'tiles-compact', 'nav-icons-only', 'phone-all-tabs', 'page-full', 'no-section-titles',
  'btn-pill', 'btn-square', 'btn-soft', 'btn-outline', 'btn-small', 'btn-large', 'qb-tinted', 'qb-outline', 'qb-solid',
  'qi-circle', 'qi-plain', 'depth-flat', 'depth-raised', 'depth-glow', 'press-none', 'press-bouncy'];

function luminance(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return 0.5;
  const lin = (v) => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}

// The background effects in use: the person's own mix, or the theme's.
export function skyFor(c = getCustom()) {
  if (c.background === 'none') return [];
  if (c.background === 'custom') return c.effects;
  return PRESETS[paletteById(c.palette).motion] || [];
}

let applied = [];
// Sets the custom look as inline CSS variables on <html>, which win over the
// stylesheet. Only what differs from the defaults is set, so the stylesheet
// (including the wall-panel layout) stays in charge of everything else.
export function applyLook(dark) {
  const c = getCustom();
  const root = document.documentElement;
  for (const p of applied) root.style.removeProperty(p);
  applied = [];
  const set = (k, v) => { root.style.setProperty(k, v); applied.push(k); };
  const pal = paletteById(c.palette);

  if (c.palette !== 'evra') {
    for (const [k, v] of Object.entries(pal.p)) set(PASTEL_VARS[k], v);
    for (const [k, v] of Object.entries(dark ? pal.dark : pal.light)) set(SURFACE_VARS[k], v);
    if (!dark) set('--violet', pal.light.accent);
  }
  if (c.accent) {
    const lum = luminance(c.accent);
    set('--accent-fill', c.accent);
    set('--accent-fill-ink', lum < 0.4 ? '#ffffff' : '#10162A');
    set('--accent', dark
      ? (lum < 0.3 ? `color-mix(in srgb, ${c.accent} 60%, #ffffff)` : c.accent)
      : (lum > 0.25 ? `color-mix(in srgb, ${c.accent} 50%, #0b1020)` : c.accent));
  }
  if (RADII[c.corners]) {
    const [r, md, sm] = RADII[c.corners];
    set('--radius', `${r}px`); set('--radius-md', `${md}px`); set('--radius-sm', `${sm}px`);
  }
  if (DENSITY[c.density]) {
    const [gap, pad] = DENSITY[c.density];
    set('--gap', `${gap}px`); set('--card-pad', `${pad}px`);
  }
  if (ZOOM[c.size]) set('zoom', String(ZOOM[c.size]));

  // Moving background: the sky layer (js/sky.js) shows whatever data-sky names.
  const sky = skyFor(c);
  if (sky.length) {
    root.setAttribute('data-sky', sky.join(' '));
    root.setAttribute('data-sky-motion', c.skyMotion);
    const m = pal.m || ['#2dffb0', '#7c5cff', '#22d3ee'];
    set('--m1', m[0]); set('--m2', m[1]); set('--m3', m[2]);
    set('--sky-op', String(SKY_OPACITY[c.skyStrength] ?? 0.75));
    root.setAttribute('data-sky-tone', dark ? 'dark' : 'light');
    set('--star', dark ? '#ffffff' : 'color-mix(in srgb, var(--accent) 60%, transparent)');
    // Cards let a little of the sky through.
    const card = getComputedStyle(root).getPropertyValue('--card').trim();
    if (card && !card.includes('color-mix')) set('--card', `color-mix(in srgb, ${card} ${dark ? 84 : 80}%, transparent)`);
  } else {
    root.removeAttribute('data-sky');
    root.removeAttribute('data-sky-motion');
    root.removeAttribute('data-sky-tone');
  }

  const classes = {
    'no-glow': !c.glow,
    'quick-compact': c.quickStyle === 'compact',
    'tiles-compact': c.tileStyle === 'compact',
    'nav-icons-only': !c.navLabels,
    'phone-all-tabs': c.phoneTabs,
    'page-full': c.pageWidth === 'full',
    'no-section-titles': !c.sectionTitles,
    // Buttons: only what differs from the default gets a class.
    [`btn-${c.btnShape}`]: c.btnShape !== 'rounded',
    [`btn-${c.btnStyle}`]: c.btnStyle !== 'filled',
    [`btn-${c.btnSize}`]: c.btnSize !== 'normal',
    [`qb-${c.quickLookStyle}`]: c.quickLookStyle !== 'card',
    [`qi-${c.iconStyle}`]: c.iconStyle !== 'bubble',
    [`depth-${c.depth}`]: c.depth !== 'soft',
    [`press-${c.press}`]: c.press !== 'subtle',
  };
  for (const k of ROOT_CLASSES) root.classList.toggle(k, !!classes[k]);
  if (c.columns === 'auto') root.removeAttribute('data-cols');
  else { root.setAttribute('data-cols', c.columns); set('--tile-cols', c.columns); }

  // The phone's status bar follows the background.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', bg);
}
