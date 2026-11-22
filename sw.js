// Keeps the app's own files cached so it opens instantly and even without a
// connection. Home Assistant data is never cached.
const CACHE = 'evra-v25';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg',
  './js/boot.js', './js/main.js', './js/config.js', './js/catalog.js', './js/store.js', './js/util.js', './js/icons.js', './js/components.js',
  './js/ideas.js', './js/scenes.js', './js/views/scenes.js',
  // Look and layout (themes, moving backgrounds, on-screen editing)
  './js/custom.js', './js/themes.js', './js/sky.js', './js/sky-scenes.js', './js/edit.js', './js/views/customize.js',
  // The assistant's changes, and Evra accounts
  './js/assistant-actions.js', './js/speech.js', './js/push.js', './js/updates.js', './js/account.js', './js/views/account-ui.js', './js/views/auth-gate.js',
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

// Network first, so updates show up straight away; the cache is the fallback.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location.href).pathname)) return;
  event.respondWith(
    // "no-cache" makes the browser check the server for a newer file every time.
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html'))),
  );
});

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
