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
  return Number.isFinite(v) ? dec(v, digits) : '–';
}
// A number the Turkish way: 24,5 and 1.400.
// For searching: lower case the Turkish way and without accents, so "isik" finds "Işık".
export const fold = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
export const dec = (v, digits = 1) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function numVal(s) {
  const v = typeof s === 'object' && s ? parseFloat(s.state) : parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

export function relTime(iso) {
  if (!iso) return 'hiç';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'hiç';
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}

export const clockText = (d = new Date()) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
export const hourText = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

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

// Defaults from the place serving the app. The Evra add-on on the Pi writes
// evra-config.json next to index.html, so phones and wall panels need no setup:
//   mode          "live"
//   hassUrl       "auto" = this host on port 8123, "origin" = this very address
//                 (Home Assistant's sidebar), or a full address
//   hassUrlHttps  Home Assistant's internet address, used instead when Evra
//                 itself was opened over https:// (see siteHassUrl)
//   assistantUrl  the assistant's address, may be relative ("/assistant")
// Elsewhere (the dev server on a PC) there is no file and nothing changes.
// main.js loads it before anything reads the settings.
let site = {};
const SITE_KEY = 'evra.site';
// Never waits more than a few seconds, so a slow connection can't hold Evra on
// "Loading Evra…". When the file can't be read (offline, the Pi or tunnel down),
// the last one that was read is used, so an installed app doesn't fall back to demo mode.
export async function loadSiteConfig() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch('evra-config.json', { cache: 'no-store', signal: ctrl.signal });
    if (res.status === 404) { site = {}; try { localStorage.removeItem(SITE_KEY); } catch { /* storage blocked */ } return; }
    const data = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
    if (!data || typeof data !== 'object') throw new Error('no usable settings file');
    site = data;
    try { localStorage.setItem(SITE_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
  } catch {
    try { site = JSON.parse(localStorage.getItem(SITE_KEY) || '{}') || {}; } catch { site = {}; }
  } finally {
    clearTimeout(timer);
  }
}
function siteHassUrl() {
  // Opened through the secure internet address (e.g. https://home.example.com via
  // Cloudflare Tunnel): Home Assistant's own internet address. Opened on the home
  // network (http://<Pi>:8099, wall panels): straight to the Pi, no internet needed.
  if (location.protocol === 'https:' && site.hassUrlHttps) return String(site.hassUrlHttps).replace(/\/+$/, '');
  const v = site.hassUrl;
  if (!v) return null;
  if (v === 'origin') return location.origin;
  if (v === 'auto') return `${location.protocol}//${location.hostname}:8123`;
  return String(v).replace(/\/+$/, '');
}
function siteAssistantUrl() {
  try { return site.assistantUrl ? new URL(site.assistantUrl, location.href).href.replace(/\/+$/, '') : null; } catch { return null; }
}

// The assistant runs on the Evra website (webEVRA functions/api/assistant.js), for every
// home and every place the app is opened. evra-config.json can point elsewhere.
export const WEBSITE_ASSISTANT = 'https://evrasmarthome.com/api/assistant';
const defaultAssistantUrl = () => siteAssistantUrl() || WEBSITE_ASSISTANT;
// The old assistant on a computer (port 8765) was the default before; it counts as "not chosen".
const oldAssistant = (u) => /:8765\/?$/.test(String(u || ''));
// The home in the signed-in Evra account (its Home Assistant's internet address),
// for the one app everyone opens (app.evrasmarthome.com). js/account.js hands this
// in, because it imports this file and can't be imported back.
let accountHome = () => null;
export function setAccountHome(getUrl) { accountHome = getUrl; }
function accountHomeUrl() {
  try { const u = accountHome(); return u ? String(u).replace(/\/+$/, '') : null; } catch { return null; }
}

// What these settings are when nobody chose them. They depend on where the app was
// opened, so they're never saved: moving the Pi or the add-on can't leave stale ones.
// Which Home Assistant, in order: the add-on's settings file (on the Pi and wall
// panels, so they stay local and work without internet), then the home in the Evra
// account (the shared app), then the old guesses.
function placeDefaults() {
  const servedByHa = location.pathname.startsWith('/local/') || location.hostname === 'homeassistant.local';
  const fromSite = siteHassUrl();
  const fromAccount = fromSite ? null : accountHomeUrl();
  return {
    mode: site.mode === 'live' || site.mode === 'demo' ? site.mode : (servedByHa || fromAccount ? 'live' : 'demo'),
    hassUrl: fromSite || fromAccount || (servedByHa ? location.origin : 'http://homeassistant.local:8123'),
    assistantUrl: defaultAssistantUrl(),
  };
}
/** Which Home Assistant this place would use by itself (for Settings > Connection). */
export const homeSource = () => (siteHassUrl() ? 'site' : accountHomeUrl() ? 'account' : null);
export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { saved = {}; }
  const place = placeDefaults();
  return {
    mode: saved.mode || place.mode,
    hassUrl: saved.hassUrl || place.hassUrl,
    theme: saved.theme || 'auto',
    devMode: saved.devMode === true,
    pricePerKwh: saved.pricePerKwh ?? 3.0,
    room: saved.room,
    remote: saved.remote,
    sceneRooms: saved.sceneRooms,
    lastScene: saved.lastScene,
    // The Evra assistant (on the website). Older versions saved the old default (a
    // computer's port 8765) with every setting; that value counts as "not chosen".
    assistantUrl: (saved.assistantUrl && !oldAssistant(saved.assistantUrl)) ? saved.assistantUrl : defaultAssistantUrl(),
    // Read the assistant's new replies aloud (js/speech.js).
    speakReplies: saved.speakReplies === true,
    // Consent to send questions and device states abroad for the assistant (KVKK m.9):
    // { version, at } once given on this device (views/chat.js, js/legal.js).
    aiConsent: saved.aiConsent || null,
    // Notifications on this device are switched on (js/push.js).
    notifyHere: saved.notifyHere === true,
    // Evra accounts address, only when someone chose one; unset means the Evra website
    // (accountsUrl() in js/account.js). Older versions saved "accountsUrl" with every
    // setting, so that key is ignored and dropped on the next save.
    accountsServer: saved.accountsServer || undefined,
    // The place for the weather (js/weather.js): { name, admin1, country, latitude, longitude, timezone }.
    weatherLocation: saved.weatherLocation || null,
  };
}
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  // Mode and addresses that equal this place's defaults aren't saved (see placeDefaults).
  const place = placeDefaults();
  const kept = { ...next };
  for (const key of ['mode', 'hassUrl', 'assistantUrl']) if (kept[key] === place[key]) delete kept[key];
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(kept)); } catch { /* not persisted */ }
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
