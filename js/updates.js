// Wall panels (and phones) keep Evra open for weeks, so they'd keep showing an
// old version after an update. Every few minutes this asks the server which
// version it has: the CACHE name in sw.js, which changes with every release
// (tools/build_addon.py stamps it for each add-on version). When it differs
// from the version that's running, Evra reloads itself, but only when nobody
// is using it: the screen hidden, or untouched for two minutes, and nothing half
// done (an automation being edited, a chat, moving things on the screen, typing).

import { isEditing } from './custom.js';

const CHECK_EVERY = 10 * 60 * 1000;
const IDLE_FOR = 2 * 60 * 1000;

let running = null;   // the version this page started with
let waiting = false;  // a newer one is on the server
let lastUse = Date.now();

async function serverVersion() {
  const res = await fetch('sw.js', { cache: 'no-store' });
  if (!res.ok) return null;
  const m = /const CACHE = '([^']+)'/.exec(await res.text());
  return m ? m[1] : null;
}

function busy() {
  if (isEditing()) return true;
  if (/^#\/(chat|automations\/(edit|new))/.test(location.hash)) return true;
  if (document.querySelector('.cz-panel, dialog[open], [aria-modal="true"]')) return true;
  const el = document.activeElement;
  return !!el && (el.matches('input, textarea, select') || el.isContentEditable);
}

function maybeReload() {
  if (!waiting || busy()) return;
  if (document.hidden || Date.now() - lastUse > IDLE_FOR) location.reload();
}

async function check() {
  if (waiting) return;
  try {
    const v = await serverVersion();
    if (!v) return;
    if (running === null) running = v;
    else if (v !== running) waiting = true;
  } catch { /* offline: try again later */ }
  maybeReload();
}

export function watchForUpdates() {
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(type, () => { lastUse = Date.now(); }, { passive: true, capture: true });
  }
  // Coming back to the app is a good moment to look; going away is a good moment to reload.
  document.addEventListener('visibilitychange', () => { if (document.hidden) maybeReload(); else check(); });
  check();
  setInterval(check, CHECK_EVERY);
  setInterval(maybeReload, 30 * 1000);
}
