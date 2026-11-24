// Evra's own data that isn't a Home Assistant entity: the person's scenes and remotes.
// The backend keeps it (live: Home Assistant's per-user storage, frontend/set_user_data,
// so it follows the person to every screen they sign in on; demo: this browser).
// A copy stays in localStorage so screens draw at once and still work offline.

import { store } from './store.js';

const LOCAL = 'evra.appdata.';
const cache = new Map(); // "<mode>:<key>" -> value
const subs = new Map();  // key -> Set of functions

const mode = () => store.backend?.mode || 'none';
const slot = (key) => `${mode()}:${key}`;

/** Resolves once the backend is connected (or after a while, so callers never hang). */
export function whenConnected(timeout = 12000) {
  if (store.status?.state === 'connected' && store.backend) return Promise.resolve(true);
  return new Promise((resolve) => {
    let off = () => {};
    const timer = setTimeout(() => { off(); resolve(false); }, timeout);
    off = store.onStatus((s) => {
      if (s.state === 'connected' && store.backend) { clearTimeout(timer); queueMicrotask(() => off()); resolve(true); }
    });
  });
}

/** The last known value, without waiting (null when nothing is known yet). */
export function cachedData(key) {
  const k = slot(key);
  if (cache.has(k)) return cache.get(k);
  let v = null;
  try { v = JSON.parse(localStorage.getItem(LOCAL + k) || 'null'); } catch { v = null; }
  cache.set(k, v);
  return v;
}

function remember(key, value) {
  const k = slot(key);
  cache.set(k, value);
  try { localStorage.setItem(LOCAL + k, JSON.stringify(value)); } catch { /* not kept */ }
  for (const fn of subs.get(key) || []) { try { fn(value); } catch { /* a closed screen */ } }
}

/** Fresh value from the backend (falls back to the last known one). */
export async function loadData(key) {
  await whenConnected();
  if (!store.backend?.getAppData) return cachedData(key);
  try {
    const value = await store.backend.getAppData(key);
    remember(key, value ?? null);
    return value ?? null;
  } catch {
    return cachedData(key);
  }
}

/** Saves a value; screens listening with onData() update at once. Throws if it couldn't be saved. */
export async function saveData(key, value) {
  const before = cachedData(key);
  remember(key, value);
  try {
    await whenConnected();
    if (!store.backend?.setAppData) throw new Error('bağlı değil');
    await store.backend.setAppData(key, value);
  } catch (e) {
    remember(key, before);
    throw e;
  }
}

export function onData(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key)?.delete(fn);
}
