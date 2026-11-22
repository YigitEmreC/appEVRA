// Small DOM and formatting helpers shared by every screen.

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'min', 'max', 'step']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function isAvailable(s) {
  return !!s && s.state !== 'unavailable' && s.state !== 'unknown';
}
export const isOn = (s) => !!s && s.state === 'on';

export function num(s, digits = 1) {
  const v = typeof s === 'object' && s ? parseFloat(s.state) : parseFloat(s);
  return Number.isFinite(v) ? v.toFixed(digits) : '–';
}
export function numVal(s) {
  const v = typeof s === 'object' && s ? parseFloat(s.state) : parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

export function relTime(iso) {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const clockText = (d = new Date()) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const hourText = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Colour helpers for the light strip.
export function lightCss(s) {
  if (!s || s.state !== 'on') return null;
  const a = s.attributes || {};
  const bri = a.brightness ?? 255;
  const l = 40 + (bri / 255) * 22;
  if (a.color_mode === 'color_temp' && a.color_temp_kelvin) return kelvinCss(a.color_temp_kelvin);
  if (Array.isArray(a.hs_color)) return `hsl(${a.hs_color[0]} ${a.hs_color[1]}% ${l}%)`;
  return 'hsl(38 90% 60%)';
}

// Relative luminance (0 = black, 1 = white) of an "hsl(...)" or "rgb(...)" colour.
export function cssLuminance(css) {
  let rgb = null;
  const hm = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(css || '');
  const rm = /rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(css || '');
  if (hm) {
    const hh = Number(hm[1]) / 360, s = Number(hm[2]) / 100, l = Number(hm[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    rgb = [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map((v) => v * 255);
  } else if (rm) rgb = [rm[1], rm[2], rm[3]].map(Number);
  if (!rgb) return 0.5;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

export function kelvinCss(k) {
  const t = clamp((k - 2500) / 4000, 0, 1);
  const warm = [255, 179, 107];
  const cool = [214, 230, 255];
  const c = warm.map((w, i) => Math.round(w + (cool[i] - w) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export function hexToHs(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat = max === 0 ? 0 : d / max;
  return [Math.round(hue), Math.round(sat * 100)];
}

export function rgbToHs([r, g, b]) {
  const hex = '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  return hexToHs(hex);
}

let toastTimer;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// Settings live in localStorage, wrapped so private windows still work.
const SETTINGS_KEY = 'smarthome.settings';
// The assistant runs on the computer that serves the app: localhost on that computer,
// its home-network address on a phone (phone mode, "Start Evra on phone.bat").
const defaultAssistantUrl = () => `http://${location.hostname || 'localhost'}:8765`;
export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { saved = {}; }
  const servedByHa = location.pathname.startsWith('/local/') || location.hostname === 'homeassistant.local';
  return {
    mode: saved.mode || (servedByHa ? 'live' : 'demo'),
    hassUrl: saved.hassUrl || (servedByHa ? location.origin : 'http://homeassistant.local'),
    theme: saved.theme || 'auto',
    devMode: saved.devMode === true,
    pricePerKwh: saved.pricePerKwh ?? 0.30,
    room: saved.room,
    remote: saved.remote,
    sceneRooms: saved.sceneRooms,
    lastScene: saved.lastScene,
    // The Evra assistant server (EvrAI/gemini_home_starter). Older versions saved the
    // default with every setting; that value counts as "not chosen".
    assistantUrl: (saved.assistantUrl && saved.assistantUrl !== 'http://localhost:8765') ? saved.assistantUrl : defaultAssistantUrl(),
    // Read the assistant's new replies aloud (js/speech.js).
    speakReplies: saved.speakReplies === true,
    // Evra accounts address, only when someone chose one; unset means the Evra website
    // (accountsUrl() in js/account.js). Older versions saved "accountsUrl" with every
    // setting, so that key is ignored and dropped on the next save.
    accountsServer: saved.accountsServer || undefined,
  };
}
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  // The default assistant address depends on where the app is opened, so it isn't saved.
  const { assistantUrl, ...kept } = next;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(assistantUrl === defaultAssistantUrl() ? kept : next)); } catch { /* not persisted */ }
  return next;
}

// Theme and developer mode: save, then tell the app shell and any open screen.
export function setPrefs(patch) {
  const next = saveSettings(patch);
  window.dispatchEvent(new CustomEvent('evra-prefs', { detail: next }));
  return next;
}
export const isDev = () => loadSettings().devMode;
export function effectiveTheme() {
  const { theme } = loadSettings();
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
