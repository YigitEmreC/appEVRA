import { HOME } from './config.js';
import { store } from './store.js';
import { h, clockText, loadSettings, setPrefs, effectiveTheme, toast } from './util.js';
import { icon } from './icons.js';
import { createDemoBackend } from './backends/demo.js';
import { createLiveBackend } from './backends/live.js';
import { renderHome } from './views/home.js';
import { renderRemotes } from './views/remotes.js';
import { renderEnergy } from './views/energy.js';
import { renderAutomations } from './views/automations.js';
import { renderSettings } from './views/settings.js';
import { renderDevices } from './views/devices.js';
import { renderChat } from './views/chat.js';
import { renderScenes } from './views/scenes.js';

// "mobile: false" views are reached from links on phones and shown in the side bar on wide screens.
const VIEWS = [
  { id: 'home', label: 'Home', icon: 'home', render: renderHome, title: HOME.room },
  { id: 'devices', label: 'Devices', icon: 'devices', render: renderDevices, title: 'Devices' },
  { id: 'scenes', label: 'Scenes', icon: 'scenes', render: renderScenes, title: 'Scenes' },
  { id: 'automations', label: 'Automations', icon: 'robot', render: renderAutomations, title: 'Automations' },
  { id: 'energy', label: 'Energy', icon: 'chart', render: renderEnergy, title: 'Energy & climate', mobile: false },
  { id: 'remotes', label: 'Remotes', icon: 'remote', render: renderRemotes, title: 'Remotes', mobile: false },
  { id: 'chat', label: 'Assistant', icon: 'devil', render: renderChat, title: 'Assistant' },
  { id: 'settings', label: 'Settings', icon: 'gear', render: renderSettings, title: 'Settings' },
];
const SUBTITLES = { 'devices/add': 'Add a device', 'automations/new': 'New automation', 'automations/edit': 'Edit automation' };

// ---- theme and developer mode ------------------------------------------------

// The sun/moon button in the header flips between light and dark.
const themeBtn = h('button', { class: 'theme-btn', type: 'button' });
themeBtn.addEventListener('click', () => setPrefs({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }));

function applyTheme() {
  const { theme, devMode } = loadSettings();
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  // Without developer mode, anything marked .dev-only is hidden by the CSS.
  document.documentElement.classList.toggle('dev', devMode);
  const dark = effectiveTheme() === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
}
window.addEventListener('evra-prefs', applyTheme);

// ---- connection -------------------------------------------------------------

function connect() {
  if (store.backend) store.backend.disconnect();
  store.states.clear();
  store.apply({ type: 'all', states: [] });
  const settings = loadSettings();
  store.backend = settings.mode === 'live' ? createLiveBackend(settings.hassUrl) : createDemoBackend();
  store.setStatus({ mode: settings.mode, state: 'connecting', message: '' });
  store.backend.connect((msg) => store.apply(msg), (patch) => store.setStatus(patch));
}

// ---- shell ------------------------------------------------------------------

const title = h('h1', { class: 'top-title' });
const sub = h('p', { class: 'top-sub' });
const pill = h('a', { class: 'status-pill', href: '#/settings' });
const main = h('main', { id: 'view', tabindex: '-1' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
  h('a', { class: 'nav-brand', href: '#/home', 'aria-label': 'Evra home', title: 'Evra' }, icon('evra', 22)),
  VIEWS.map((v) => h('a', { href: `#/${v.id}`, 'data-view': v.id, class: `nav-item${v.mobile === false ? ' wide-only' : ''}${v.id === 'chat' ? ' nav-devil' : ''}` }, h('span', { class: 'nav-icon' }, icon(v.icon, 22)), h('span', { class: 'nav-label' }, v.label))));

document.getElementById('app').replaceChildren(
  h('header', { class: 'top' }, h('div', { class: 'top-left' }, title, sub), h('div', { class: 'top-right' }, themeBtn, pill)),
  nav,
  main,
);

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
let currentView = null;
let currentTitle = '';
function drawHeader() {
  if (!currentView) return;
  const date = new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  title.textContent = currentView.id === 'home' ? greeting() : currentTitle || currentView.title;
  sub.textContent = currentView.id === 'home' ? `${HOME.room} · ${date} · ${clockText()}` : `${date} · ${clockText()}`;
}
setInterval(drawHeader, 15000);

// No animations until the first states have drawn, so cards don't flick from
// "off" to "on" every time the app opens.
document.documentElement.classList.add('booting');
let booted = false;
store.onStatus((s) => {
  if (!booted && (s.state === 'connected' || s.state === 'error')) {
    booted = true;
    setTimeout(() => document.documentElement.classList.remove('booting'), 400);
  }
});

store.onStatus((s) => {
  const text = s.mode === 'demo'
    ? (s.state === 'error' ? 'Demo · problem' : 'Demo')
    : { connected: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', error: 'Offline', idle: 'Offline' }[s.state] || s.state;
  pill.className = `status-pill ${s.mode === 'demo' && s.state === 'connected' ? 'demo' : s.state}`;
  pill.replaceChildren(h('span', { class: 'status-dot' }), text);
  pill.title = s.message || text;
});

// ---- router -----------------------------------------------------------------

let cleanup = [];

function route() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const [id, ...params] = path.split('/').filter(Boolean);
  const view = VIEWS.find((v) => v.id === id) || VIEWS[0];
  for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
  cleanup = [];
  main.replaceChildren();
  main.className = `view view-${view.id}${params.length ? ' view-sub' : ''}`;
  currentView = view;
  currentTitle = SUBTITLES[`${view.id}/${params[0]}`] || (view.id === 'devices' && params[0] ? 'Device' : '');
  drawHeader();
  document.title = `${currentTitle || view.label} · Evra`;
  for (const a of nav.querySelectorAll('.nav-item')) a.classList.toggle('active', a.dataset.view === view.id);
  view.render(main, cleanup, { reconnect: connect, applyTheme, params, query: new URLSearchParams(qs || '') });
  main.scrollTop = 0;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
// Notifications sent by automations in demo mode show as a toast.
window.addEventListener('demo-notify', (e) => toast(`Notification: ${e.detail}`));
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener?.('change', applyTheme);

applyTheme();
connect();
route();

// Offline caching only works on https or localhost.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
}
