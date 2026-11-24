// Keeps the app's own files cached so it opens instantly and even without a
// connection. Home Assistant data is never cached.
const CACHE = 'evra-v38';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg',
  './js/boot.js', './js/main.js', './js/config.js', './js/catalog.js', './js/catalog-details.js', './js/weather.js', './js/views/location-ui.js', './js/appdata.js', './js/rooms.js', './js/home-model.js', './js/mascot-puppet.js', './js/ir.js', './js/remote-list.js', './js/views/scene-editor.js', './js/views/remote-new.js', './js/store.js', './js/util.js', './js/icons.js', './js/components.js',
  './js/ideas.js', './js/scenes.js', './js/views/scenes.js',
  // Look and layout (themes, moving backgrounds, on-screen editing)
  './js/custom.js', './js/themes.js', './js/sky.js', './js/sky-scenes.js', './js/edit.js', './js/views/customize.js',
  // The assistant's changes, and Evra accounts
  './js/assistant-actions.js', './js/speech.js', './js/push.js', './js/updates.js', './js/account.js', './js/views/account-ui.js', './js/views/auth-gate.js', './js/legal.js', './js/mascot.js', './js/wake.js', './js/home-care.js',
  './js/backends/demo.js', './js/backends/live.js', './js/devices/cards.js',
  './js/views/home.js', './js/views/devices.js', './js/views/remotes.js', './js/views/energy.js',
  './js/views/automations.js', './js/views/automation-editor.js', './js/views/chat.js', './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, so updates show up straight away, but never waiting long: on a
// slow or patchy connection (mobile data, a tunnel) one stalled file would leave
// Evra on "Loading Evra…". After NETWORK_WAIT the saved copy is used, and the
// network's answer still refreshes the cache for next time. Server errors (a
// Cloudflare page when the hub or tunnel is down) count as no answer, so Evra
// still opens from its saved copy. sw.js and evra-config.json get longer, as
// they say which version and which Home Assistant this is.
const NETWORK_WAIT = 3000;
const LIVE_WAIT = 6000;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location.href).pathname)) return;
  const live = /\/(sw\.js|evra-config\.json)$/.test(url.pathname);
  event.respondWith(networkOrSaved(event, live ? LIVE_WAIT : NETWORK_WAIT));
});

function networkOrSaved(event, wait) {
  // "no-cache" makes the browser check the server for a newer file every time.
  const network = fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.status >= 500) throw new Error(`server error ${res.status}`);
    if (res.ok) { const copy = res.clone(); return caches.open(CACHE).then((c) => c.put(event.request, copy)).then(() => res, () => res); }
    return res;
  });
  event.waitUntil(network.catch(() => {})); // let a slow answer still reach the cache
  const slow = new Promise((resolve) => setTimeout(() => resolve('slow'), wait));
  return Promise.race([network.catch(() => 'failed'), slow]).then(async (first) => {
    if (first !== 'slow' && first !== 'failed') return first;
    const saved = await caches.match(event.request);
    if (saved) return saved;
    // Nothing saved yet: keep waiting for the network if it's only slow.
    if (first === 'slow') { try { return await network; } catch { /* fall through */ } }
    if (event.request.mode === 'navigate') { const page = await caches.match('./index.html'); if (page) return page; }
    return Response.error();
  });
}

// ---- notifications from Home Assistant (js/push.js) ----------------------------------
// The "HTML5 Push Notifications" integration sends JSON: title, body, tag,
// timestamp, data (with any url given in the automation) and whatever else the
// automation added. Evra shows it with its own icon and name.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  const options = {
    body: d.body || d.message || '',
    icon,
    tag: d.tag,
    timestamp: d.timestamp,
    requireInteraction: !!d.requireInteraction,
    data: { ...(d.data || {}), url: d.url || d.data?.url },
  };
  if (d.image) options.image = d.image;
  if (Array.isArray(d.actions)) options.actions = d.actions.slice(0, 2);
  event.waitUntil(self.registration.showNotification(d.title || 'Evra', options));
});

// A tap opens Evra (or brings it to the front), on the page the automation named if
// that page is part of Evra; anything else opens the home screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  let target = new URL('./#/home', scope);
  try {
    const asked = event.notification.data?.url;
    if (asked) {
      const u = new URL(asked, scope);
      if (u.href.startsWith(scope)) target = u;
    }
  } catch { /* not a usable address */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(scope));
    if (!open) return self.clients.openWindow(target.href);
    return open.focus().then((c) => (event.notification.data?.url && c.navigate ? c.navigate(target.href) : c)).catch(() => open);
  }));
});
