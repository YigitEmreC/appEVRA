// Notifications on this phone or computer, sent by Home Assistant.
//
// Live: Home Assistant's "HTML5 Push Notifications" integration does the sending.
// This device asks the browser for a push subscription (with the integration's
// public key, websocket command notify/html5/appkey) and registers it with
// POST /api/notify.html5. Home Assistant then adds a notify entity for it, which
// automations reach with notify.send_message. sw.js shows what arrives.
// Demo: nothing is registered; the demo's own notifications are shown on this
// device instead (see "demo-push" in main.js).
//
// Phones only allow this on https:// (or http://localhost), and an iPhone only
// for an app added to the home screen (iOS 16.4 or newer).

import { store } from './store.js';
import { loadSettings, saveSettings } from './util.js';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// What this device can do right now:
//   unsupported  the browser has no web push
//   insecure     the app isn't on https:// (phones refuse push on plain http)
//   install      iPhone: add Evra to the home screen first
//   blocked      notifications were refused in the browser's site settings
//   ready        can be switched on (off at the moment)
//   on           switched on
export function pushState() {
  if (!window.isSecureContext) return 'insecure';
  if (isIos() && !installed()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return loadSettings().notifyHere && Notification.permission === 'granted' ? 'on' : 'ready';
}

async function worker() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, no) => setTimeout(() => no(new Error('the app\'s background worker didn\'t start; reload and try again')), 8000)),
  ]);
  return reg;
}

function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const sameKey = (sub, key) => {
  const old = sub.options?.applicationServerKey;
  if (!old) return false;
  const a = new Uint8Array(old), b = keyBytes(key);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

// A name Home Assistant shows for this device (it becomes the notify entity's name).
export function deviceLabel() {
  const ua = navigator.userAgent;
  const what = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || isIos() ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Device';
  return `Evra ${what}`;
}

// Switches notifications on: permission, subscription, registration with Home Assistant.
export async function enablePush(name = deviceLabel()) {
  const backend = store.backend;
  if (!backend) throw new Error('Not connected yet');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this app in the browser\'s settings' : 'Notifications weren\'t allowed');
  const reg = await worker();
  const key = await backend.pushKey();
  if (key) {
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await backend.pushRegister(sub.toJSON(), name);
  }
  saveSettings({ notifyHere: true });
}

// Browsers sometimes drop or renew a push subscription; Home Assistant would then
// keep sending to a dead address and this device would quietly stop getting
// alerts. So each time Evra connects (live, notifications on), it makes sure the
// subscription exists and registers it again. Home Assistant keeps the same name
// for the same subscription, so nothing piles up.
export async function refreshPush() {
  if (pushState() !== 'on' || store.backend?.mode !== 'live') return;
  const reg = await worker();
  const key = await store.backend.pushKey();
  if (!key) return;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await store.backend.pushRegister(sub.toJSON(), deviceLabel());
}

// Switches them off here and tells Home Assistant to forget this device.
export async function disablePush() {
  saveSettings({ notifyHere: false });
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  try { await store.backend?.pushUnregister(sub.toJSON()); } catch { /* Home Assistant unreachable; the subscription still ends */ }
  await sub.unsubscribe().catch(() => {});
}

// A notification shown by this device itself (demo mode, and the test button).
export async function showHere(title, body) {
  if (pushState() !== 'on') return false;
  const reg = await worker().catch(() => null);
  if (!reg) return false;
  await reg.showNotification(title || 'Evra', { body, icon: new URL('icons/icon-192.png', reg.scope).href, tag: `evra-${Date.now()}` });
  return true;
}

// The notify entities Home Assistant made for devices registered this way.
export function pushEntities() {
  return [...store.entities.values()]
    .filter((e) => e.platform === 'html5' && e.entity_id.startsWith('notify.') && !e.disabled_by)
    .map((e) => e.entity_id);
}
