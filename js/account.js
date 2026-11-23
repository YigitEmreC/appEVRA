// Evra accounts in the app: signing in, who is signed in, and what they may use.
// Talks to an accounts service by its base address:
//   the Evra website (the default):          https://evrasmarthome.com/api/accounts
//     the website's own member accounts (D1); the assistant comes with the Premium plan
//   the stand-in on this computer:           http://localhost:8770/api  (tools/accounts/server.py)
//     its own members, made by its admin; for working without the website
// Both answer the same requests; /status says which kind it is ("website" or not).
//
// This only decides what the app shows. The assistant server checks membership
// itself on every request, so hiding a tab isn't the only protection.

import { loadSettings, saveSettings, setAccountHome } from './util.js';

export const WEBSITE_ACCOUNTS = 'https://evrasmarthome.com/api/accounts';
export const LOCAL_ACCOUNTS = 'http://localhost:8770/api';
const KEY = 'evra.account'; // { token, user }

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
let current = read();
const subs = new Set();

function write(value) {
  current = value;
  try { if (value) localStorage.setItem(KEY, JSON.stringify(value)); else localStorage.removeItem(KEY); } catch { /* not kept */ }
  for (const fn of subs) fn(member());
}

export const accountsUrl = () => (loadSettings().accountsServer || WEBSITE_ACCOUNTS).replace(/\/+$/, '');
/** The website's own pages (sign-up, forgotten password, Hesabım) live next to its accounts API. */
export const websiteOrigin = () => { try { return new URL(accountsUrl()).origin; } catch { return ''; } };
export const member = () => current?.user || null;
export const accountToken = () => current?.token || null;
export const isAdmin = (u = member()) => !!u && !u.disabled && u.role === 'admin';
export const canUseAssistant = (u = member()) => !!u && !u.disabled && (u.role === 'admin' || !!u.features?.ai);
export function onAccount(fn) { subs.add(fn); return () => subs.delete(fn); }
/** The member's home: { id, name, url } (url = its Home Assistant's internet address), or null. */
export const memberHome = (u = member()) => (u?.home?.url ? u.home : null);
// The shared app (app.evrasmarthome.com) connects to this home by itself (util.js placeDefaults).
setAccountHome(() => memberHome()?.url || null);

function unreachable() {
  let host = '';
  try { host = new URL(accountsUrl()).hostname; } catch { /* a bad address */ }
  return ['localhost', '127.0.0.1'].includes(host)
    ? 'Evra accounts on this computer isn\'t running. Start it with "Start Evra.bat", or switch back to the Evra website in Settings (developer mode).'
    : `Can't reach Evra accounts at ${host || accountsUrl()}. Check the internet connection and try again.`;
}

async function api(method, path, body, auth = true) {
  let res;
  try {
    res = await fetch(accountsUrl() + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth && accountToken() ? { Authorization: `Bearer ${accountToken()}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error(unreachable()), { status: 0 });
  }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && auth && accountToken()) write(null); // the sign-in ended (signed out elsewhere, switched off, password reset)
  if (!res.ok) throw Object.assign(new Error(j.error || `Evra accounts answered ${res.status}.`), { status: res.status });
  return j;
}

// Switch accounts server (the website or this computer). A sign-in belongs to one
// server, so this signs out here without telling the old one.
export function useAccountsServer(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  saveSettings({ accountsServer: clean && clean !== WEBSITE_ACCOUNTS ? clean : undefined });
  write(null);
}

export const accountStatus = () => api('GET', '/status', null, false);
// On the website the username is the member's e-mail address.
export async function signIn(username, password) { const j = await api('POST', '/login', { username, password }, false); write(j); return j.user; }
// First admin, on this computer's stand-in only (the website's first admin is made in its D1 Console).
export async function setUp(name, username, password) { const j = await api('POST', '/setup', { name, username, password }, false); write(j); return j.user; }
export async function signOutAccount() {
  try { await api('POST', '/logout'); } catch { /* signed out here anyway */ }
  write(null);
}
// Fresh details (an admin may have changed this member's access, or their plan changed).
export async function refreshMember() {
  if (!accountToken()) return null;
  try {
    const u = await api('GET', '/me');
    const before = JSON.stringify(member());
    current = { ...current, user: u };
    if (JSON.stringify(u) !== before) write(current);
    return u;
  } catch (e) {
    return e.status === 401 ? null : member();
  }
}
export const changePassword = (currentPassword, newPassword) => api('POST', '/me/password', { current: currentPassword, new: newPassword });
// Admins and app access are managed in the website's database (evra_app_access), not in the app.
