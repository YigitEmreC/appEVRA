// Devices that dropped off (a Wi-Fi bulb after the router restarted at night, a Zigbee
// sensor out of range): finding them, reconnecting them with one tap, and what to try
// when that doesn't help.
//
//   offlineDevices()           the person's devices whose every main entity is "unavailable"
//   offlineBanner(cleanup)     "3 cihaz ulaşılamıyor · Hepsini yeniden bağla" (Home, Devices)
//   connectionCard(d, cleanup) the device page's "Bağlantı ve sorun giderme" card
//
// Reconnecting (backends: reconnectDevice) reloads the device's own connection in Home
// Assistant (its config entry: a TP-Link bulb, an ESPHome module, a Shelly…), which makes
// Home Assistant look for it again; a Zigbee device is asked to report in again instead
// (reloading Zigbee would restart every Zigbee device in the home).
// The automatic version (Settings → Akıllı uyarılar → "Kopan cihazları yeniden bağla",
// js/home-care.js) does the same on the Pi, while everyone sleeps.

import { store, deviceName, deviceEntities, userDevices } from './store.js';
import { h, toast, relTime } from './util.js';
import { icon } from './icons.js';
import { card } from './components.js';
import { productForDevice } from './catalog.js';

const GRACE = 2 * 60 * 1000; // a device must be gone this long before we say so (not at start-up)

function mainStates(d) {
  return deviceEntities(d.id)
    .filter((e) => !e.entity_category && !e.hidden_by)
    .map((e) => store.get(e.entity_id))
    .filter(Boolean);
}

export function isOffline(d) {
  const list = mainStates(d);
  return list.length > 0 && list.every((s) => s.state === 'unavailable');
}

/** Since when the device has been unreachable (ISO time) or null. */
export function offlineSince(d) {
  if (!isOffline(d)) return null;
  const times = mainStates(d).map((s) => s.last_changed).filter(Boolean).sort();
  return times[times.length - 1] || null;
}

export function offlineDevices({ grace = GRACE } = {}) {
  const now = Date.now();
  return userDevices().filter((d) => {
    if (!isOffline(d)) return false;
    const since = Date.parse(offlineSince(d) || '');
    return !grace || !since || now - since > grace;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const entityIds = (d) => deviceEntities(d.id).filter((e) => !e.disabled_by).map((e) => e.entity_id);

/** Reconnects one device and waits (up to ~25 s) to see it back. Returns true if it's back. */
export async function reconnect(d) {
  const b = store.backend;
  if (!b?.reconnectDevice) throw new Error('Uygulama eve bağlı değil');
  await b.reconnectDevice(d, entityIds(d));
  for (let i = 0; i < 12; i++) {
    if (!isOffline(d)) return true;
    await sleep(2000);
  }
  return !isOffline(d);
}

/** Reconnects several devices; a shared connection (one account, many devices) is reloaded once. */
export async function reconnectAll(list) {
  const b = store.backend;
  if (!b?.reconnectDevice) throw new Error('Uygulama eve bağlı değil');
  const seen = new Set();
  for (const d of list) {
    const entries = (d.config_entries || []).filter((e) => !seen.has(e));
    const zigbee = (d.identifiers || []).some((i) => i[0] === 'zha');
    if (!zigbee && d.config_entries?.length && !entries.length) continue; // already reloaded with another device
    entries.forEach((e) => seen.add(e));
    try { await b.reconnectDevice(d, entityIds(d)); } catch { /* the next one */ }
  }
  for (let i = 0; i < 15; i++) {
    if (list.every((d) => !isOffline(d))) break;
    await sleep(2000);
  }
  return list.filter((d) => !isOffline(d)).length;
}

// ---- the banner on Home and Devices ----

export function offlineBanner(cleanup) {
  const box = h('div', { class: 'offline-slot' });
  let busy = false;
  let sig = null;
  const draw = () => {
    if (busy || document.hidden) return;
    const list = store.status.state === 'connected' ? offlineDevices() : [];
    const next = list.map((d) => d.id).join(',');
    if (next === sig) return;
    sig = next;
    if (!list.length) { box.replaceChildren(); return; }
    const names = list.slice(0, 3).map(deviceName).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '');
    const btn = h('button', { class: 'btn small primary', type: 'button' }, icon('refresh', 15), 'Hepsini yeniden bağla');
    btn.addEventListener('click', async () => {
      busy = true;
      btn.disabled = true;
      btn.textContent = 'Yeniden bağlanıyor…';
      try {
        const back = await reconnectAll(list);
        if (back === list.length) toast(`${back} cihaz yeniden bağlandı`);
        else toast(`${back}/${list.length} cihaz geri geldi. Gelmeyenin sayfasından sorun gidermeye bakın.`, back ? undefined : 'error');
      } catch (err) {
        toast(`Yeniden bağlanamadı: ${err.message}`, 'error');
      }
      busy = false;
      sig = null;
      draw();
    });
    const first = list.length === 1 ? `#/devices/${encodeURIComponent(list[0].id)}` : '#/devices';
    box.replaceChildren(h('div', { class: 'offline-banner', role: 'status' },
      icon('wifi', 20),
      h('div', { class: 'offline-text' },
        h('strong', null, list.length === 1 ? `${deviceName(list[0])} ulaşılamıyor` : `${list.length} cihaz ulaşılamıyor`),
        h('small', null, list.length === 1 ? `${relTime(offlineSince(list[0]))} koptu` : names)),
      h('div', { class: 'offline-actions' }, btn, h('a', { class: 'link small', href: first }, 'Sorun gider'))));
  };
  draw();
  const tick = setInterval(draw, 5000);
  cleanup.push(() => clearInterval(tick));
  return box;
}

// ---- the device page card ----

const ENTRY_STATE = {
  loaded: ['ok', 'Home Assistant bağlantısı hazır'],
  setup_retry: ['warn', 'Home Assistant cihaza ulaşamıyor, kendisi tekrar deniyor'],
  setup_in_progress: ['warn', 'Bağlantı kuruluyor'],
  setup_error: ['bad', 'Bağlantı kurulamadı'],
  migration_error: ['bad', 'Bağlantı güncellenemedi'],
  not_loaded: ['bad', 'Bağlantı kapalı'],
  failed_unload: ['bad', 'Bağlantı takıldı'],
};

function kindOfLink(d, p) {
  if ((d.identifiers || []).some((i) => i[0] === 'zha')) return 'zigbee';
  const proto = (p?.protocol || '').toLowerCase();
  if (proto.includes('bulut')) return 'cloud';
  if (proto.includes('bluetooth')) return 'bluetooth';
  if (proto.includes('zigbee') && !proto.includes('wi-fi')) return 'zigbee';
  if (proto.includes('thread')) return 'thread';
  return 'wifi';
}

const TIPS = {
  wifi: [
    'Elektriği var mı? Ampulde duvar anahtarı açık kalmalı; anahtar kapanınca ampul ağdan düşer.',
    'Elektriğini 10 saniye kesip geri verin (ampulde anahtarı kapatıp açın), 1 dakika bekleyip "Yeniden bağla"ya basın.',
    'Gece modem yeniden başladıysa cihazın adresi (IP) değişmiş olabilir. Modemde bu cihaza sabit IP (DHCP rezervasyonu) verilirse bir daha olmaz; Evra destek bunu uzaktan ayarlayabilir.',
    'Modemden uzaksa ya da arada kalın duvar varsa sinyal zayıftır; mesh Wi-Fi çözer.',
  ],
  zigbee: [
    'Pilli bir cihazsa düğmesine bir kez basın; uyanıp kendini bildirir.',
    'Pili bitmiş olabilir; pilini değiştirip düğmesine basın.',
    'Merkezden uzaksa araya bir Zigbee priz koymak ağı güçlendirir.',
    'Hâlâ gelmiyorsa cihazı kaldırıp yeniden eşleştirin (Cihazı kaldır → Cihaz ekle).',
  ],
  cloud: [
    'Bu cihaz üreticinin bulutu üzerinden bağlanır: evde internet var mı, üreticinin kendi uygulamasında çevrimiçi görünüyor mu kontrol edin.',
    'Cihazı elektrikten çekip geri takın, sonra "Yeniden bağla"ya basın.',
  ],
  bluetooth: [
    'Bluetooth köprüsüne (Klima ve TV Kumandası modülü) yakın olmalı; araya duvar girmesin.',
    'Cihazı kaldırıp tabanına yeniden oturtun ya da pilini kontrol edin.',
  ],
  thread: [
    'Elektriği ya da pili var mı kontrol edin; merkezin Thread çubuğu takılı olmalı.',
    'Cihazı yeniden başlatıp 1 dakika sonra "Yeniden bağla"ya basın.',
  ],
};

export function connectionCard(d, cleanup) {
  const p = productForDevice(d);
  const status = h('div', { class: 'conn-status' });
  const entryLine = h('p', { class: 'muted small conn-entry' });
  const result = h('p', { class: 'muted small', hidden: true });
  const tips = h('details', { class: 'conn-tips' },
    h('summary', null, 'Olmazsa ne yapmalı?'),
    h('ol', null, TIPS[kindOfLink(d, p)].map((t) => h('li', null, t))),
    p?.troubleshooting?.length ? h('a', { class: 'link small', href: `#/devices/add/${p.id}` }, 'Bu ürünün bütün sorunları ve çözümleri', icon('right', 14)) : null);

  const reconnectBtn = h('button', { class: 'btn primary', type: 'button' }, icon('refresh', 16), 'Yeniden bağla');
  const refreshBtn = h('button', { class: 'btn', type: 'button' }, 'Durumu yenile');

  const drawStatus = () => {
    const off = isOffline(d);
    const since = offlineSince(d);
    status.className = `conn-status ${off ? 'bad' : 'ok'}`;
    status.replaceChildren(icon(off ? 'alert' : 'check', 16),
      h('span', null, off ? `Ulaşılamıyor${since ? ` · ${relTime(since)} koptu` : ''}` : 'Bağlı ve çalışıyor'));
    tips.open = off;
  };
  const ids = deviceEntities(d.id).map((e) => e.entity_id);
  cleanup.push(store.watch(ids.length ? ids : ['__none__'], drawStatus));
  drawStatus();

  const loadEntry = async () => {
    entryLine.textContent = '';
    try {
      const info = (await store.backend?.connectionInfo?.(d)) || [];
      if (!info.length) return;
      entryLine.replaceChildren(...info.map((e) => {
        const [cls, text] = ENTRY_STATE[e.state] || ['warn', e.state];
        return h('span', { class: `conn-pill ${cls}` }, `${text}${e.reason ? ` (${e.reason})` : ''}`);
      }));
    } catch { /* not important */ }
  };
  loadEntry();

  reconnectBtn.addEventListener('click', async () => {
    reconnectBtn.disabled = refreshBtn.disabled = true;
    reconnectBtn.textContent = 'Yeniden bağlanıyor…';
    result.hidden = true;
    try {
      const back = await reconnect(d);
      result.textContent = back ? 'Cihaz yeniden bağlandı.' : 'Cihaz henüz geri gelmedi. Aşağıdaki adımları deneyin, sonra tekrar basın.';
      result.className = back ? 'muted small conn-ok' : 'muted small conn-bad';
      result.hidden = false;
      if (!back) tips.open = true;
      toast(back ? `${deviceName(d)} yeniden bağlandı` : `${deviceName(d)} henüz gelmedi`, back ? undefined : 'error');
    } catch (err) {
      toast(`Yeniden bağlanamadı: ${err.message}`, 'error');
    }
    reconnectBtn.disabled = refreshBtn.disabled = false;
    reconnectBtn.replaceChildren(icon('refresh', 16), 'Yeniden bağla');
    loadEntry();
  });
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    try { await store.backend?.refreshDevice?.(d, entityIds(d)); toast('Durum istendi'); } catch (err) { toast(`Olmadı: ${err.message}`, 'error'); }
    refreshBtn.disabled = false;
    loadEntry();
  });

  return card({ title: 'Bağlantı ve sorun giderme', iconName: 'wifi', className: 'conn-card' },
    status, entryLine,
    h('div', { class: 'btn-row' }, reconnectBtn, refreshBtn),
    result,
    h('p', { class: 'muted small' }, 'Yeniden bağla, Home Assistant\'ın bu cihazla bağlantısını baştan kurar; cihazın ayarları ve otomasyonları silinmez.'),
    tips);
}
