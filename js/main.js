import { HOME } from './config.js';
import { store } from './store.js';
import { h, clockText, loadSettings, loadSiteConfig, setPrefs, effectiveTheme, toast, applyLite } from './util.js';
import { icon } from './icons.js';
import { mascot } from './mascot.js';
import { syncWake } from './wake.js';
import { startI18n } from './i18n.js';
import { createDemoBackend } from './backends/demo.js';
import { createLiveBackend } from './backends/live.js';
import { startWeather } from './weather.js';
import { loadScenes } from './scenes.js';
import { loadRemotes } from './remote-list.js';
import { renderHome } from './views/home.js';
import { renderRemotes } from './views/remotes.js';
import { renderEnergy } from './views/energy.js';
import { renderAutomations } from './views/automations.js';
import { renderSettings } from './views/settings.js';
import { renderDevices } from './views/devices.js';
import { renderChat } from './views/chat.js';
import { renderScenes } from './views/scenes.js';
import { renderSupport } from './views/support.js';
import { renderNotifications } from './views/notifications.js';
import { openCustomizer } from './views/customize.js';
import { getCustom, applyLook, ordered, isHidden, isEditing, setEditing, LOCKED_NAV, HEADER_ITEMS } from './custom.js';
import { arrangeable } from './edit.js';
import { ensureSky } from './sky.js';
import { renderAuthGate } from './views/auth-gate.js';
import { member, memberHome, canUseAssistant, onAccount, refreshMember, plansUrl, websiteOrigin } from './account.js';
import { showHere, refreshPush } from './push.js';
import { watchForUpdates } from './updates.js';

// Every part of Evra has loaded (js/boot.js stops waiting).
document.documentElement.dataset.evraStarted = '1';

// The Evra add-on's settings (evra-config.json) come first: everything below reads settings.
await loadSiteConfig();
// TR/EN (js/i18n.js): Turkish by default; in English the page's texts are swapped as they appear.
startI18n({ api: `${websiteOrigin() || 'https://evrasmarthome.com'}/api/i18n`, staticUrl: (lang) => new URL(`i18n/${lang}.json`, document.baseURI).href, loadIndex: () => import('./i18n-index.js') });

// "mobile: false" views are reached from links on phones and shown in the side bar on wide screens.
const VIEWS = [
  { id: 'home', label: 'Ana sayfa', icon: 'home', render: renderHome, title: HOME.room },
  { id: 'devices', label: 'Cihazlar', icon: 'devices', render: renderDevices, title: 'Cihazlar' },
  { id: 'scenes', label: 'Sahneler', icon: 'scenes', render: renderScenes, title: 'Sahneler' },
  { id: 'automations', label: 'Otomasyonlar', short: 'Otomasyon', icon: 'robot', render: renderAutomations, title: 'Otomasyonlar' },
  { id: 'energy', label: 'Enerji', icon: 'chart', render: renderEnergy, title: 'Enerji ve iklim', mobile: false },
  { id: 'remotes', label: 'Kumandalar', icon: 'remote', render: renderRemotes, title: 'Kumandalar', mobile: false },
  { id: 'chat', label: 'EvrAI', icon: 'devil', render: renderChat, title: 'EvrAI' },
  { id: 'notifications', label: 'Bildirimler', icon: 'bell', render: renderNotifications, title: 'Bildirimler', mobile: false },
  { id: 'support', label: 'Destek', icon: 'sos', render: renderSupport, title: 'Destek', mobile: false },
  { id: 'settings', label: 'Ayarlar', icon: 'gear', render: renderSettings, title: 'Ayarlar' },
  // Reached from Settings, not shown in the navigation.
];
const SUBTITLES = { 'devices/add': 'Cihaz ekle', 'devices/room': 'Oda', 'scenes/new': 'Yeni sahne', 'scenes/edit': 'Sahneyi düzenle', 'remotes/new': 'Kumanda ekle', 'automations/new': 'Yeni otomasyon', 'automations/edit': 'Otomasyonu düzenle' };

// ---- theme and developer mode ------------------------------------------------

// The sun/moon button in the header flips between light and dark.
const themeBtn = h('button', { class: 'theme-btn', type: 'button' });
themeBtn.addEventListener('click', () => setPrefs({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }));

// One button at the top right for everything about the look: it opens the
// Customize panel (themes, buttons, layout). From there, "Move things on the
// screen" starts moving mode; while moving, this button reads "Done" and a
// "Customize" button next to it goes back to the panel.
const customBtn = h('button', { class: 'theme-btn custom-btn', type: 'button' });
customBtn.addEventListener('click', () => { if (isEditing()) setEditing(false); else openPanel(); });
const backBtn = h('button', { class: 'theme-btn cz-back-btn', type: 'button', hidden: true, title: 'Özelleştir\'e dön', 'aria-label': 'Özelleştir\'e dön' },
  h('span', { class: 'custom-btn-icon' }, icon('palette', 16)), h('span', null, 'Özelleştir'));
backBtn.addEventListener('click', () => { setEditing(false); openPanel(); });
function paintCustomBtn() {
  const on = isEditing();
  customBtn.replaceChildren(...[h('span', { class: 'custom-btn-icon' }, icon(on ? 'check' : 'palette', 18)), on ? h('span', null, 'Bitti') : null].filter(Boolean));
  customBtn.setAttribute('aria-pressed', String(on));
  customBtn.setAttribute('aria-label', on ? 'Taşımayı bitir' : 'Özelleştir: temalar, düğmeler ve yerleşim');
  customBtn.title = on ? 'Bitti' : 'Özelleştir';
  if (on) customBtn.removeAttribute('aria-haspopup'); else customBtn.setAttribute('aria-haspopup', 'dialog');
  backBtn.hidden = !on;
}
// The Customize panel. Settings opens it too, with this event; detail.tab picks the tab.
const openPanel = (tab) => openCustomizer({ button: customBtn, tab });
window.addEventListener('evra-customize', (e) => { setEditing(false); openPanel(e.detail?.tab); });
// The panel's "Move things on the screen" asks for moving mode with this event.
window.addEventListener('evra-move', () => {
  setEditing(true);
  toast('Taşımak için sürükleyin. Gizlemek için göze dokunun. Bitti düğmesi yukarıda.');
});
// Escape while moving goes back to the panel.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isEditing() && !document.querySelector('.cz-panel')) { setEditing(false); openPanel(); }
});

function applyTheme() {
  const { theme, devMode } = loadSettings();
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  // Without developer mode, anything marked .dev-only is hidden by the CSS.
  document.documentElement.classList.toggle('dev', devMode);
  const dark = effectiveTheme() === 'dark';
  const label = dark ? 'Açık temaya geç' : 'Koyu temaya geç';
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
  // The person's own theme, background, shapes and spacing.
  ensureSky();
  applyLook(dark);
  applyLite();
  layoutHeader();
}

// The top bar in the person's order: the greeting and the date on the left,
// the light/dark button and connection status on the right (the customize
// and edit buttons always stay last). While editing, all of them show.
function layoutHeader() {
  const { header } = getCustom();
  const editing = isEditing();
  const parts = { title, clock: sub, mode: themeBtn, status: pill };
  for (const [id, el] of Object.entries(parts)) { el.dataset.id = id; el.hidden = !editing && isHidden(header, id); }
  const order = ordered(HEADER_ITEMS, header).map((i) => i.id);
  topLeft.replaceChildren(...order.filter((id) => id === 'title' || id === 'clock').map((id) => parts[id]));
  topRight.replaceChildren(...order.filter((id) => id === 'mode' || id === 'status').map((id) => parts[id]), backBtn, customBtn);
  const names = Object.fromEntries(HEADER_ITEMS.map((i) => [i.id, i.label]));
  arrangeable(topLeft, 'header', { whole: true, all: order, names });
  arrangeable(topRight, 'header', { whole: true, all: order, names });
  paintCustomBtn();
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
  startWeather();
  // The person's own scenes and remotes (js/appdata.js), so the assistant and every screen see them.
  loadScenes();
  loadRemotes();
}

// ---- shell ------------------------------------------------------------------

// Text sits in inner spans, so edit handles added next to it survive updates.
const titleText = h('span');
const subText = h('span');
const pillBody = h('span', { class: 'status-body' });
const title = h('h1', { class: 'top-title' }, titleText);
const sub = h('p', { class: 'top-sub' }, subText);
const pill = h('a', { class: 'status-pill', href: '#/settings' }, pillBody);
const topLeft = h('div', { class: 'top-left' });
const topRight = h('div', { class: 'top-right' });
const main = h('main', { id: 'view', tabindex: '-1' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Ana menü' });
const brand = h('a', { class: 'nav-brand', href: '#/home', 'aria-label': 'Evra ana sayfa', title: 'Evra' }, icon('evra', 22));

// Members whose account doesn't include the assistant (it comes with Premium) see its
// tab with a lock; tapping it opens the plans on the website instead. The assistant
// itself is never contacted for them (and the server checks membership either way).
const assistantBlocked = () => !!member() && !canUseAssistant();
nav.addEventListener('click', (e) => {
  const tab = e.target.closest?.('.nav-item.nav-locked');
  if (!tab || isEditing()) return;
  e.preventDefault();
  window.open(plansUrl(), '_blank', 'noopener');
});

// Tabs in the person's chosen order, without the ones they hid (while
// editing, hidden tabs show faded so they can be brought back). Screens with
// nav: false never get a tab.
function buildNav() {
  const { nav: cfg } = getCustom();
  const all = ordered(VIEWS.filter((v) => v.nav !== false), cfg);
  const tabs = all.filter((v) => isEditing() || LOCKED_NAV.includes(v.id) || !isHidden(cfg, v.id));
  const locked = (v) => v.id === 'chat' && assistantBlocked();
  nav.replaceChildren(brand, ...tabs.map((v) => h('a', {
    href: `#/${v.id}`, 'data-view': v.id, 'data-id': v.id, 'data-name': v.label,
    class: `nav-item${v.mobile === false ? ' wide-only' : ''}${v.id === 'chat' ? ' nav-devil' : ''}${locked(v) ? ' nav-locked' : ''}`,
    ...(locked(v) ? { title: 'Asistan Premium planla gelir. Planları görmek için dokunun.', 'aria-label': `${v.label} (kilitli: Premium planla gelir, planları açar)` } : {}),
  }, h('span', { class: 'nav-icon' }, v.id === 'chat' ? mascot(30, { locked: locked(v) }) : icon(v.icon, 22)),
  h('span', { class: 'nav-label' }, v.short || v.label))));
  arrangeable(nav, 'nav', { whole: true, locked: LOCKED_NAV, all: all.map((v) => v.id) });
  markActive();
}
function markActive() {
  for (const a of nav.querySelectorAll('.nav-item')) a.classList.toggle('active', a.dataset.view === currentView?.id);
}

// ---- sign in first ------------------------------------------------------------
// Nobody signed in: only the welcome screen (views/auth-gate.js). Signed in: the app.
// The connection to the home starts after sign-in, so live mode never asks for a
// Home Assistant login before the Evra one. A kept sign-in still opens the app
// offline (refreshMember keeps it unless the server says it ended).
const appEl = document.getElementById('app');
const shell = [h('header', { class: 'top' }, topLeft, topRight), nav, main];
let started = false;
let gateCleanup = [];
let signedIn = !!member();

function tidyGate() { for (const fn of gateCleanup) { try { fn(); } catch { /* ignore */ } } gateCleanup = []; }

function showApp() {
  tidyGate();
  appEl.classList.remove('gated');
  appEl.replaceChildren(...shell);
  if (!started) { started = true; buildNav(); connect(); }
  route();
}

function showGate() {
  for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
  cleanup = [];
  tidyGate();
  if (store.backend) { store.backend.disconnect(); store.backend = null; started = false; }
  appEl.classList.add('gated');
  appEl.replaceChildren(renderAuthGate(gateCleanup));
  document.title = 'Giriş · Evra';
}

// A change of account (or of what it may use) re-draws the tabs, or swaps app and welcome screen.
let lastBlocked = assistantBlocked();
let lastHome = memberHome()?.url || null;
onAccount(() => {
  if (!!member() !== signedIn) {
    signedIn = !!member();
    lastHome = memberHome()?.url || null;
    if (signedIn) { if (!location.hash || location.hash === '#/settings') location.hash = '#/home'; showApp(); } else showGate();
    return;
  }
  if (assistantBlocked() !== lastBlocked) { lastBlocked = assistantBlocked(); buildNav(); }
  // The account's home was linked or moved (Evra admin page): connect to it.
  const home = memberHome()?.url || null;
  if (home !== lastHome) {
    lastHome = home;
    if (started && loadSettings().hassUrl === home) { connect(); route({ keepScroll: true }); }
  }
});
refreshMember();
// "Hey EvrAI" (js/wake.js) follows its setting and whether the home has EvrAI.
syncWake();
onAccount(syncWake);
window.addEventListener('evra-prefs', syncWake);
// Pick up access changes (plan, app access), when the app comes back into view.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshMember(); });

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'İyi geceler' : hr < 12 ? 'Günaydın' : hr < 18 ? 'İyi günler' : 'İyi akşamlar';
}
let currentView = null;
let currentTitle = '';
function drawHeader() {
  if (!currentView) return;
  const date = new Date().toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
  titleText.textContent = currentView.id === 'home' ? greeting() : currentTitle || currentView.title;
  subText.textContent = currentView.id === 'home' ? `${HOME.room} · ${date} · ${clockText()}` : `${date} · ${clockText()}`;
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
    ? (s.state === 'error' ? 'Örnek ev · sorun' : 'Örnek ev')
    : { connected: 'Canlı', connecting: 'Bağlanıyor', reconnecting: 'Yeniden bağlanıyor', error: 'Çevrimdışı', idle: 'Çevrimdışı' }[s.state] || s.state;
  pill.classList.remove('demo', 'connected', 'connecting', 'reconnecting', 'error', 'idle');
  pill.classList.add(s.mode === 'demo' && s.state === 'connected' ? 'demo' : s.state);
  pillBody.replaceChildren(h('span', { class: 'status-dot' }), text);
  pill.title = s.message || text;
});

// ---- router -----------------------------------------------------------------

let cleanup = [];
let lastTab = -1;

// The header settles into an app bar once the page scrolls. Its height change moves
// the page by a few pixels, so it shrinks and grows back at different points; with
// one threshold that shift crossed it again and the header flickered.
const onScroll = () => {
  const root = document.documentElement;
  const y = window.scrollY;
  if (!root.classList.contains('scrolled') && y > 48) root.classList.add('scrolled');
  else if (root.classList.contains('scrolled') && y < 4) root.classList.remove('scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });

function route(opts) {
  if (!member()) return; // the welcome screen is up
  const keepScroll = opts?.keepScroll ? window.scrollY : null;
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const [id, ...params] = path.split('/').filter(Boolean);
  const view = VIEWS.find((v) => v.id === id) || VIEWS[0];
  for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
  cleanup = [];
  main.replaceChildren();
  main.className = `view view-${view.id}${params.length ? ' view-sub' : ''}`;
  currentView = view;
  currentTitle = SUBTITLES[`${view.id}/${params[0]}`] || (view.id === 'devices' && params[0] ? 'Cihaz' : '');
  drawHeader();
  document.title = `${currentTitle || (view.id === 'chat' ? view.title : view.label)} · Evra`;
  markActive();
  view.render(main, cleanup, { reconnect: connect, applyTheme, params, query: new URLSearchParams(qs || '') });
  // A new screen slides in from the side of the tab it belongs to (not on a re-draw in place).
  const tabs = [...nav.querySelectorAll('.nav-item')].map((a) => a.dataset.view);
  const at = tabs.indexOf(view.id);
  if (keepScroll === null) {
    main.style.setProperty('--enter-x', lastTab < 0 || at < 0 || at === lastTab ? '0px' : at > lastTab ? '22px' : '-22px');
    main.classList.add('view-enter');
    setTimeout(() => main.classList.remove('view-enter'), 700);
  }
  if (at >= 0) lastTab = at;
  main.scrollTop = 0;
  window.scrollTo(0, keepScroll ?? 0);
  onScroll();
}

// Customize changes: new look, new tab order, and the open screen re-drawn in place.
window.addEventListener('evra-custom', (e) => {
  applyTheme();
  buildNav();
  if (e.detail?.rerender !== false) route({ keepScroll: true });
});

window.addEventListener('hashchange', route);
// Notifications sent by automations in demo mode show as a toast.
window.addEventListener('demo-notify', (e) => toast(`Bildirim: ${e.detail}`));
// The ones meant for phones also appear as real notifications when they're on here.
window.addEventListener('demo-push', (e) => { showHere(e.detail.title, e.detail.message).catch(() => {}); });
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener?.('change', applyTheme);

applyTheme();
if (signedIn) showApp(); else showGate();

// Offline caching only works on https or localhost.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ });
}
// Reload by itself after an update, when nobody is using the screen (wall panels).
watchForUpdates();
// Once per visit, after connecting: make sure this device's notifications still reach it.
let pushChecked = false;
store.onStatus((s) => {
  if (pushChecked || s.state !== 'connected') return;
  pushChecked = true;
  refreshPush().catch(() => { /* not critical; Settings › Notifications shows the state */ });
});
