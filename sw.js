// Keeps the app's own files cached so it opens instantly and even without a
// connection. Home Assistant data is never cached.
const CACHE = 'evra-v21';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg',
  './js/main.js', './js/config.js', './js/catalog.js', './js/store.js', './js/util.js', './js/icons.js', './js/components.js',
  './js/ideas.js', './js/scenes.js', './js/views/scenes.js',
  // Look and layout (themes, moving backgrounds, on-screen editing)
  './js/custom.js', './js/themes.js', './js/sky.js', './js/sky-scenes.js', './js/edit.js', './js/views/customize.js',
  // The assistant's changes, and Evra accounts
  './js/assistant-actions.js', './js/speech.js', './js/account.js', './js/views/account-ui.js', './js/views/auth-gate.js',
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
