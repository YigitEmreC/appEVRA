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

// What to try, built for this device: how it gets power (a bulb on a wall switch, a plug,
// a battery sensor, a module behind the fuse box…), how it talks to the hub (Wi-Fi, Zigbee,
// the maker's cloud, Bluetooth, Thread), its brand (Tapo, ESPHome, the cloud app's name) and a
// few notes for the product itself. Catalog ids: js/catalog.js.
const POWER_OF = {
  panel: 'wired', motion: 'battery', 'climate-sensor': 'battery', contact: 'battery', presence: 'usb',
  smoke: 'battery', leak: 'battery', sos: 'battery', 'camera-indoor': 'usb', gas: 'plugin',
  'water-valve': 'plugin', siren: 'usb', 'camera-outdoor': 'plugin', lock: 'lock', trv: 'battery',
  'boiler-relay': 'wired', thermostat: 'wired', co2: 'usb', plug: 'plug', bulb: 'bulb', 'led-strip': 'strip',
  'wall-switch': 'wired', 'zigbee-plug': 'plug', 'energy-meter': 'wired', 'blind-chain': 'recharge',
  'blind-tube': 'wired', curtain: 'plugin', shutter: 'wired', irrigation: 'battery', mesh: 'plugin',
  'ir-remote': 'usb', 'robot-vacuum': 'dock', 'air-purifier': 'appliance', 'pet-feeder': 'appliance',
  'cat-litter': 'appliance', 'smart-kettle': 'kettle', 'smart-fan': 'appliance',
};
// Zigbee devices on mains power also carry the Zigbee network for the battery ones near them.
const ZIGBEE_ROUTERS = new Set(['presence', 'gas', 'water-valve', 'thermostat', 'zigbee-plug', 'energy-meter', 'shutter', 'blind-tube']);
const POWER_TIPS = {
  bulb: ['Elektriği var mı? Ampulün duvar anahtarı açık kalmalı; anahtar kapanınca ampul ağdan düşer.', 'Duvar anahtarını kapatıp 10 saniye sonra açın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  strip: ['Şeridin adaptörü prize takılı mı, kontrol kutusunun ışığı yanıyor mu?', 'Şeridin adaptörünü prizden çekip 10 saniye sonra geri takın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  plug: ['Akıllı priz duvardaki prize tam oturmuş mu, üzerindeki ışık yanıyor mu?', 'Akıllı prizi duvardan çekip 10 saniye sonra geri takın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  plugin: ['Cihazın adaptörü ya da fişi prize takılı mı, ışığı yanıyor mu?', 'Fişini çekip 10 saniye sonra geri takın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  usb: ['USB kablosu ve adaptörü takılı mı, cihazın ışığı yanıyor mu? Zayıf bir telefon şarj aleti de kopmalara yol açabilir.', 'USB kablosunu çekip 10 saniye sonra geri takın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  battery: ['Pili bitmiş olabilir: uygulamada pil seviyesine bakın, düşükse pilini değiştirin.', 'Cihazın düğmesine bir kez basın ya da pilini çıkarıp geri takın; uyanıp kendini bildirir.'],
  lock: ['Kilidin pilleri zayıflayınca önce bağlantısını kapatır: uygulamada pil seviyesine bakın, düşükse pillerini değiştirin. Kapı yine anahtarla ve parmak iziyle açılır.', 'Kilidin tuş takımına bir kez dokunun; kilit uyanır ve kendini bildirir.'],
  recharge: ['Motorun pili şarjlıdır: bittiyse şarj kablosuyla doldurun (birkaç saat sürer).', 'Motorun düğmesine bir kez basın; uyanıp kendini bildirir.'],
  wired: ['Bağlı olduğu hattın sigortası açık mı? Elektrik kesintisinden sonra modül birkaç dakika geç gelebilir.', 'İlgili sigortayı 10 saniye indirip kaldırın; 1 dakika bekleyip "Yeniden bağla"ya basın. Sigorta kutusunun dışında elektrik işine kendiniz girmeyin.'],
  appliance: ['Cihazın kendisi açık mı, fişi takılı mı?', 'Fişini çekip 10 saniye sonra geri takın; cihaz açılınca 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  kettle: ['Su ısıtıcının tabanı prize takılı mı, ısıtıcı tabanına oturmuş mu?', 'Tabanın fişini çekip 10 saniye sonra geri takın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  dock: ['Süpürge şarj istasyonunda mı, istasyonun fişi takılı mı? Pili bitip bir yerde kaldıysa istasyona taşıyın.', 'Süpürgenin açma düğmesine birkaç saniye basılı tutup yeniden başlatın; 1 dakika bekleyip "Yeniden bağla"ya basın.'],
  unknown: ['Cihazın elektriği ya da pili var mı, ışığı yanıyor mu?', 'Cihazın elektriğini 10 saniye kesip geri verin (pilliyse pilini çıkarıp takın); 1 dakika bekleyip "Yeniden bağla"ya basın.'],
};
const CLOUD_APP = { tuya: 'Tuya / Smart Life', xiaomi_miio: 'Xiaomi Home', petkit: 'PETKIT' };
const PRODUCT_NOTES = {
  'ir-remote': ['Modül bağlı görünüyor ama klima ya da televizyon tepki vermiyorsa sorun bağlantıda değil, kızılötesi ışıktadır: modülü klimayı ve televizyonu doğrudan görecek bir yere koyun.'],
  'camera-indoor': ['Kameranın ışığı kırmızı yanıp sönüyorsa Wi-Fi ağını bulamıyordur; modemin adı ya da şifresi değiştiyse Destek sekmesinden bize yazın.'],
  'camera-outdoor': ['Kameranın ışığı kırmızı yanıp sönüyorsa Wi-Fi ağını bulamıyordur; dışarıda sinyal zayıfsa kameraya yakın bir mesh ünitesi çözer.'],
  panel: ['Ekran açık ama Evra boş görünüyorsa ekranın kendisini yeniden başlatın (ekranın ayarları → yeniden başlat).'],
  'robot-vacuum': ['Süpürge bağlı ama haritası kaybolduysa ya da temizlik yarıda kalıyorsa bu bir bağlantı sorunu değildir; üreticinin uygulamasında hata mesajına bakın.'],
  'pet-feeder': ['Elektrik kesilince yedek pille mama vermeye devam eder ama Wi-Fi kapanır; elektrik gelince kendiliğinden bağlanır.'],
  'boiler-relay': ['Röle bağlı ama kombi çalışmıyorsa sorun kombi tarafındadır: kombinin kendi ekranında hata kodu var mı bakın.'],
  thermostat: ['Termostat ekranı yanıyor ama ayarlar gelmiyorsa merkezle bağlantısı kopmuştur; önce sigortayı deneyin.'],
  lock: ['Merkezin Thread çubuğu takılı olmalı; kapı merkezden çok uzaksa araya bir Thread cihazı (ör. Matter priz) ağı güçlendirir.'],
  mesh: ['Deco uygulamasında bütün üniteler çevrimiçi mi bakın; ana ünite modeme kabloyla bağlı olmalı.'],
  gas: ['Dedektörü uzun süre prizden çekmeyin: çekiliyken gaz kaçağını algılamaz.'],
  smoke: ['Test düğmesine basınca öterse dedektör çalışıyordur; sorun yalnızca merkezle bağlantıdadır.'],
  'water-valve': ['Vana kolunun motoru ana vanaya sıkıca oturmalı; bağlantı gelse de vana dönmüyorsa kelepçeyi kontrol edin.'],
};

function kindOfLink(d, p) {
  const ids = (d.identifiers || []).map((i) => i[0]);
  if (ids.includes('zha')) return 'zigbee';
  if (ids.includes('matter') && p?.id === 'lock') return 'thread';
  const proto = (p?.protocol || '').toLowerCase();
  if (proto.includes('bulut') || p?.pairing === 'cloud') return 'cloud';
  if (proto.includes('bluetooth')) return 'bluetooth';
  if (proto.includes('zigbee') && !proto.includes('wi-fi')) return 'zigbee';
  if (proto.includes('thread')) return 'thread';
  return 'wifi';
}

function powerOf(d, p) {
  if (p && POWER_OF[p.id]) return POWER_OF[p.id];
  // Not one of ours: a battery entity says it runs on batteries.
  const battery = deviceEntities(d.id).some((e) => /battery/.test(e.entity_id) || e.original_device_class === 'battery' || e.device_class === 'battery');
  return battery ? 'battery' : 'unknown';
}

/** The steps for this device, in the order worth trying. */
export function tipsFor(d, p = productForDevice(d)) {
  const link = kindOfLink(d, p);
  const power = powerOf(d, p);
  const ids = (d.identifiers || []).map((i) => i[0]);
  const maker = `${d.manufacturer || ''} ${p?.model || ''}`.toLowerCase();
  const tips = [...POWER_TIPS[power]];
  if (link === 'wifi') {
    if (ids.includes('tplink') || p?.integration === 'tplink' || /tapo|tp-link/.test(maker)) {
      tips.push('Bu bir Tapo cihazı: telefondan Tapo uygulamasını açın. Telefon ağda cihazı arar; gece "uyuyan" cihaz uyanır ve geri gelir. "Yeniden bağla" da aynı aramayı yapar.');
    }
    if (ids.includes('esphome') || /esphome/i.test(p?.protocol || '')) {
      tips.push('Cihazın ışığı yanıp sönüyorsa Wi-Fi ağına bağlanamıyordur: modemin adı ya da şifresi değiştiyse cihazın yeniden kurulması gerekir; Destek sekmesinden bize yazın.');
    }
    // Written out whole (not pieced together) so each sentence has its translation.
    tips.push({
      bulb: 'Gece modem yeniden başladıysa cihazın adresi (IP) değişmiş olabilir. Modemde bu cihaza sabit IP (DHCP rezervasyonu) verilirse bir daha olmaz. Modemine erişilemeyen (kiralık) evlerde kalıcı çözüm için Evra Ağ Kutusu (evin içinde küçük bir router) kurabiliriz ya da Zigbee ampullere geçebilirsiniz; Destek sekmesinden bize yazın.',
      plug: 'Gece modem yeniden başladıysa cihazın adresi (IP) değişmiş olabilir. Modemde bu cihaza sabit IP (DHCP rezervasyonu) verilirse bir daha olmaz. Modemine erişilemeyen (kiralık) evlerde kalıcı çözüm için Evra Ağ Kutusu (evin içinde küçük bir router) kurabiliriz ya da Zigbee prize geçebilirsiniz; Destek sekmesinden bize yazın.',
    }[p?.id] || 'Gece modem yeniden başladıysa cihazın adresi (IP) değişmiş olabilir. Modemde bu cihaza sabit IP (DHCP rezervasyonu) verilirse bir daha olmaz. Modemine erişilemeyen (kiralık) evlerde kalıcı çözüm için Evra Ağ Kutusu (evin içinde küçük bir router) kurabiliriz; Destek sekmesinden bize yazın.');
    tips.push('Modemden uzaksa ya da arada kalın duvar varsa sinyal zayıftır; mesh Wi-Fi çözer.');
  } else if (link === 'zigbee') {
    tips.push(ZIGBEE_ROUTERS.has(p?.id)
      ? 'Bu cihaz Zigbee ağını da güçlendirir: o koptuğunda yakınındaki pilli sensörler de kopabilir, önce bunu geri getirin.'
      : 'Merkezden uzaksa araya bir Zigbee priz koymak ağı güçlendirir.');
    tips.push('Hâlâ gelmiyorsa cihazı kaldırıp yeniden eşleştirin (Cihazı kaldır → Cihaz ekle).');
  } else if (link === 'cloud') {
    const app = CLOUD_APP[p?.integration];
    tips.push(app
      ? `Bu cihaz üreticinin bulutu üzerinden bağlanır: evde internet var mı, ${app} uygulamasında çevrimiçi görünüyor mu kontrol edin.`
      : 'Bu cihaz üreticinin bulutu üzerinden bağlanır: evde internet var mı, üreticinin kendi uygulamasında çevrimiçi görünüyor mu kontrol edin.');
  } else if (link === 'bluetooth') {
    tips.push('Bluetooth köprüsüne (Klima ve TV Kumandası modülü) yakın olmalı; araya duvar girmesin.');
  } else if (link === 'thread' && p?.id !== 'lock') {
    tips.push('Merkezin Thread çubuğu takılı olmalı; cihaz merkezden çok uzaksa Thread ağı zayıf kalır.');
  }
  return [...tips, ...(PRODUCT_NOTES[p?.id] || [])];
}

export function connectionCard(d, cleanup) {
  const p = productForDevice(d);
  const status = h('div', { class: 'conn-status' });
  const entryLine = h('p', { class: 'muted small conn-entry' });
  const result = h('p', { class: 'muted small', hidden: true });
  // First the connection steps for this kind of device, then this product's own known
  // problems and fixes (js/catalog-details.js), then Evra support with everything filled in.
  const tips = h('details', { class: 'conn-tips' },
    h('summary', null, 'Olmazsa ne yapmalı?'),
    h('ol', null, tipsFor(d, p).map((t) => h('li', null, t))));
  const known = p?.troubleshooting?.length ? h('details', { class: 'conn-tips known-issues' },
    h('summary', null, `${p.name}: bilinen sorunlar ve çözümleri (${p.troubleshooting.length})`),
    h('div', { class: 'issue-list' }, p.troubleshooting.map((t) => h('details', { class: 'issue' },
      h('summary', null, t.problem),
      h('p', null, t.solution))))) : null;
  const support = h('div', { class: 'support-cta' },
    h('div', null, h('strong', null, 'Hâlâ çözülmedi mi?'), h('small', { class: 'muted' }, 'Cihazın bilgileri mesaja kendiliğinden eklenir.')),
    h('a', { class: 'btn small', href: `#/support?device=${encodeURIComponent(d.id)}` }, icon('sos', 15), 'Evra desteğine yaz'));

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
    tips, known, support);
}
