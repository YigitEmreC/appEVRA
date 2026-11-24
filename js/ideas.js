// Automation ideas: what the Evra range can do when products work together.
//
// Each idea lists the kinds of device it needs ("needs") and, sometimes, ones
// that make it better ("optional"). An idea whose needs are all in the home is
// ready: "Kur" opens the automation editor filled in with the home's real
// devices. The others show which products are missing.
//
// Room names go in brackets in messages ("(Salon)"), because Turkish case
// endings depend on the word and a template can't pick the right one.

import { HOME } from './config.js';
import { store, userDevices, deviceEntities, deviceName, areaName } from './store.js';
import { productForDevice } from './catalog.js';

// ---- what devices can do, and which catalogue products do it ------------------

export const CAPS = {
  motion: { name: 'Hareket sensörü', icon: 'person', products: ['motion', 'presence'] },
  presence: { name: 'Varlık sensörü (radar)', icon: 'radar', products: ['presence'] },
  contact: { name: 'Kapı/pencere sensörü', icon: 'door', products: ['contact'] },
  climate: { name: 'Sıcaklık sensörü', icon: 'thermometer', products: ['climate-sensor', 'co2'] },
  co2: { name: 'CO₂ sensörü', icon: 'air', products: ['co2'] },
  light: { name: 'Akıllı ışık', icon: 'bulb', products: ['led-strip', 'bulb', 'wall-switch'] },
  colour: { name: 'Renkli ışık', icon: 'bulb', products: ['led-strip', 'bulb'] },
  plug: { name: 'Akıllı priz', icon: 'plug', products: ['plug', 'zigbee-plug'] },
  power: { name: 'Enerji ölçen priz', icon: 'bolt', products: ['plug', 'zigbee-plug', 'energy-meter'] },
  tv: { name: 'TV kumandası (IR)', icon: 'tv', products: ['ir-remote'] },
  heater: { name: 'Isıtıcı kumandası (IR)', icon: 'heater', products: ['ir-remote'] },
  trv: { name: 'Radyatör vanası ya da termostat', icon: 'thermostat', products: ['trv', 'thermostat'] },
  boiler: { name: 'Kombi rölesi', icon: 'toggle', products: ['boiler-relay'] },
  smoke: { name: 'Duman dedektörü', icon: 'smoke', products: ['smoke'] },
  gas: { name: 'Gaz dedektörü', icon: 'alert', products: ['gas'] },
  leak: { name: 'Su kaçağı sensörü', icon: 'droplet', products: ['leak'] },
  waterValve: { name: 'Ana su vanası', icon: 'valve', products: ['water-valve'] },
  siren: { name: 'İç mekân sireni', icon: 'siren', products: ['siren'] },
  sos: { name: 'Acil durum düğmesi', icon: 'sos', products: ['sos'] },
  camera: { name: 'İç mekân kamerası', icon: 'camera', products: ['camera-indoor'] },
  outdoorCam: { name: 'Dış mekân kamerası', icon: 'camera', products: ['camera-outdoor'] },
  lock: { name: 'Akıllı kapı kilidi', icon: 'lock', products: ['lock'] },
  cover: { name: 'Perde ya da stor motoru', icon: 'blind', products: ['blind-chain', 'blind-tube', 'curtain', 'shutter'] },
  irrigation: { name: 'Sulama vanası', icon: 'sprout', products: ['irrigation'] },
  // Home appliances and pets
  vacuum: { name: 'Robot süpürge', icon: 'vacuum', products: ['robot-vacuum'] },
  purifier: { name: 'Hava temizleyici', icon: 'air', products: ['air-purifier'] },
  pm25: { name: 'PM2.5 ölçümü (hava temizleyici)', icon: 'air', products: ['air-purifier'] },
  fan: { name: 'Akıllı vantilatör', icon: 'fan', products: ['smart-fan'] },
  feeder: { name: 'Mama makinesi', icon: 'paw', products: ['pet-feeder'] },
  foodLevel: { name: 'Mama seviyesi (mama makinesi)', icon: 'paw', products: ['pet-feeder'] },
  litter: { name: 'Akıllı kum kabı', icon: 'litter', products: ['cat-litter'] },
  litterBin: { name: 'Atık haznesi (kum kabı)', icon: 'litter', products: ['cat-litter'] },
  kettle: { name: 'Akıllı su ısıtıcı', icon: 'kettle', products: ['smart-kettle'] },
  kettleTemp: { name: 'Su sıcaklığı (su ısıtıcı)', icon: 'kettle', products: ['smart-kettle'] },
};

// Category ids stay English (they pick the colour); CATEGORY_LABEL is what's shown.
export const CATEGORIES = ['Lighting', 'Comfort', 'Appliances', 'Pets', 'Entertainment', 'Energy', 'Safety', 'Security', 'Garden'];
export const CATEGORY_LABEL = {
  Lighting: 'Aydınlatma', Comfort: 'Konfor', Appliances: 'Ev aletleri', Pets: 'Evcil hayvan', Entertainment: 'Eğlence',
  Energy: 'Enerji', Safety: 'Emniyet', Security: 'Güvenlik', Garden: 'Bahçe',
};

// ---- finding the home's devices ------------------------------------------------

const dom = (id) => id.split('.')[0];
const dc = (id) => store.get(id)?.attributes?.device_class;
const OCCUPANCY = ['occupancy', 'motion', 'presence'];
const OPENING = ['opening', 'door', 'window', 'garage_door'];

// The entity of a device that does a given job.
const FIND = {
  motion: (id) => dom(id) === 'binary_sensor' && OCCUPANCY.includes(dc(id)),
  presence: (id) => dom(id) === 'binary_sensor' && OCCUPANCY.includes(dc(id)),
  contact: (id) => dom(id) === 'binary_sensor' && OPENING.includes(dc(id)),
  climate: (id) => dom(id) === 'sensor' && dc(id) === 'temperature',
  humidity: (id) => dom(id) === 'sensor' && dc(id) === 'humidity',
  co2: (id) => dom(id) === 'sensor' && dc(id) === 'carbon_dioxide',
  light: (id) => dom(id) === 'light',
  colour: (id) => dom(id) === 'light' && (store.get(id)?.attributes?.supported_color_modes || []).some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m)),
  plug: (id) => dom(id) === 'switch',
  power: (id) => dom(id) === 'sensor' && dc(id) === 'power',
  trv: (id) => dom(id) === 'climate',
  boiler: (id) => dom(id) === 'switch',
  smoke: (id) => dom(id) === 'binary_sensor' && dc(id) === 'smoke',
  gas: (id) => dom(id) === 'binary_sensor' && dc(id) === 'gas',
  leak: (id) => dom(id) === 'binary_sensor' && dc(id) === 'moisture',
  waterValve: (id) => dom(id) === 'valve',
  siren: (id) => dom(id) === 'siren',
  sos: (id) => dom(id) === 'event' || (dom(id) === 'binary_sensor' && !dc(id)),
  camera: (id) => dom(id) === 'switch' && /privacy/.test(id),
  outdoorCam: (id) => dom(id) === 'binary_sensor' && OCCUPANCY.includes(dc(id)),
  lock: (id) => dom(id) === 'lock',
  cover: (id) => dom(id) === 'cover',
  irrigation: (id) => dom(id) === 'valve',
  vacuum: (id) => dom(id) === 'vacuum',
  purifier: (id) => dom(id) === 'fan',
  pm25: (id) => dom(id) === 'sensor' && dc(id) === 'pm25',
  fan: (id) => dom(id) === 'fan',
  feeder: (id) => dom(id) === 'button',
  foodLevel: (id) => dom(id) === 'sensor' && (/food/.test(id) || !!store.get(id)?.attributes?.options),
  litter: (id) => dom(id) === 'button',
  litterBin: (id) => dom(id) === 'sensor' && /waste|bin/.test(id),
  kettle: (id) => dom(id) === 'switch',
  kettleTemp: (id) => dom(id) === 'sensor' && dc(id) === 'temperature',
};

function mainEntities(device) {
  return deviceEntities(device.id).filter((e) => !e.entity_category && !e.hidden_by && store.get(e.entity_id)).map((e) => e.entity_id);
}

// Everything the home has, grouped by job: { cap: [{ device, entity }] }.
export function scanHome() {
  const have = {};
  const add = (cap, device, entity) => { (have[cap] ||= []).push({ device, entity }); };
  for (const d of userDevices()) {
    const p = productForDevice(d);
    if (!p) continue;
    const ids = mainEntities(d);
    for (const [cap, def] of Object.entries(CAPS)) {
      if (!def.products.includes(p.id)) continue;
      if (cap === 'tv' || cap === 'heater') {
        // The IR remote can only work the TV or heater once their codes are learned.
        if (store.get(HOME[cap]?.buttons?.power)) add(cap, d, HOME[cap].buttons.power);
        continue;
      }
      const entity = ids.find(FIND[cap]);
      if (entity) add(cap, d, entity);
    }
    const hum = ids.find(FIND.humidity);
    if (hum) add('humidity', d, hum);
  }
  return have;
}

// ---- small builders for automation configs ---------------------------------------

const KELVIN_WARM = 2700; // the editor's "Sıcak beyaz" preset
const KELVIN_COOL = 5500; // its "Soğuk beyaz" preset
const PURPLE = [275, 90];

function lightData(entity, pct, kelvin = KELVIN_WARM, hs = null) {
  const modes = store.get(entity)?.attributes?.supported_color_modes || [];
  if (!modes.length || modes.every((m) => m === 'onoff')) return undefined;
  const data = { brightness_pct: pct };
  if (hs && modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m))) data.hs_color = hs;
  else if (modes.includes('color_temp') || modes.some((m) => ['hs', 'xy', 'rgb'].includes(m))) data.color_temp_kelvin = kelvin;
  return data;
}
const act = (entity, service, data) => ({ action: `${dom(entity)}.${service}`, target: { entity_id: entity }, ...(data ? { data } : {}) });
const lightOn = (entity, pct, kelvin, hs) => act(entity, 'turn_on', lightData(entity, pct, kelvin, hs));
const press = (entity) => ({ action: 'button.press', target: { entity_id: entity } });
const wait = (seconds) => ({ delay: { seconds } });
const note = (title, message) => ({ action: 'persistent_notification.create', data: { title, message } });
// Also to phones. Without the Home Assistant app on a phone, notify.notify doesn't
// exist; continue_on_error stops that from ending the automation.
const urgent = (title, message) => [note(title, message), { action: 'notify.notify', data: { title, message }, continue_on_error: true }];
const minutes = (m) => (m ? { for: { minutes: m } } : {});
const when = (entity, to, forMin) => ({ trigger: 'state', entity_id: entity, ...(to != null ? { to } : {}), ...minutes(forMin) });
const drops = (entity, below, forMin) => ({ trigger: 'numeric_state', entity_id: entity, below, ...minutes(forMin) });
const rises = (entity, above, forMin) => ({ trigger: 'numeric_state', entity_id: entity, above, ...minutes(forMin) });
const at = (hhmm) => ({ trigger: 'time', at: `${hhmm}:00` });
const sun = (event, offsetMin = 0) => ({ trigger: 'sun', event, ...(offsetMin ? { offset: `${offsetMin < 0 ? '-' : ''}00:${String(Math.abs(offsetMin)).padStart(2, '0')}:00` } : {}) });
const is = (entity, state) => ({ condition: 'state', entity_id: entity, state });
const between = (after, before, weekday) => ({ condition: 'time', after: `${after}:00`, before: `${before}:00`, ...(weekday ? { weekday } : {}) });
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const dark = () => is('sun.sun', 'below_horizon');
const inRoom = (x) => ` (${x.room})`;

// Only press a toggle-style power code when the tracker says it's in the other state.
function powerIf(device, wantOn) {
  const cfg = HOME[device];
  return { condition: is(cfg.tracker, wantOn ? 'off' : 'on'), action: press(cfg.buttons.power) };
}

// "Everyone has left": phones away from home (Home Assistant's zone.home counts the
// people at home, once the Home Assistant app is on their phones), the door
// locked, or nobody seen for half an hour.
function leftHome(x) {
  const phones = store.get('zone.home') ? [drops('zone.home', 1)] : [];
  if (x.has('lock')) return [...phones, when(x.lock, 'locked')];
  if (x.has('motion')) return [...phones, when(x.motion, 'off', 30)];
  return phones.length ? phones : [at('10:00')];
}

// ---- the ideas ---------------------------------------------------------------------------
//
// build(x) gets the chosen devices: x.motion, x.light ... (entity IDs), x.room
// (room name for messages) and x.has(cap) for optional extras.

export const IDEAS = [
  // ---- lighting
  {
    id: 'welcome-light', category: 'Lighting', icon: 'bulb', needs: ['motion', 'light'],
    title: 'Hava karardıktan sonra girince ışık yansın',
    text: 'Gün batımından sonra hareket sensörü birini görünce ışık sıcak beyaz yanar.',
    build: (x) => ({ alias: 'Karanlıkta karşılama ışığı', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [dark(), between('16:00', '23:30')], actions: [lightOn(x.light, 70)] }),
  },
  {
    id: 'empty-room-off', category: 'Lighting', icon: 'bulb', needs: ['motion', 'light'],
    title: 'Oda boşalınca ışıklar sönsün',
    text: '10 dakika kimse görülmezse ışık kendiliğinden kapanır.',
    build: (x) => ({ alias: 'Boş odada ışıkları kapat', mode: 'single', triggers: [when(x.motion, 'off', 10)], conditions: [is(x.light, 'on')], actions: [act(x.light, 'turn_off')] }),
  },
  {
    id: 'night-path', category: 'Lighting', icon: 'moon', needs: ['motion', 'light'],
    title: 'Gece kalkınca loş ışık',
    text: 'Gece yarısı ile 06:00 arasında hareket olunca ışık iki dakikalığına %10 yanar, kimsenin gözü kamaşmaz.',
    build: (x) => ({ alias: 'Gece yol ışığı', mode: 'restart', triggers: [when(x.motion, 'on')], conditions: [between('00:00', '06:00')], actions: [lightOn(x.light, 10), wait(120), act(x.light, 'turn_off')] }),
  },
  {
    id: 'sunset-lights', category: 'Lighting', icon: 'sun', needs: ['light'],
    title: 'Gün batımında ışıklar yansın',
    text: 'Mevsim ne olursa olsun, gün batımından çeyrek saat önce ışık sıcak beyaz yanar.',
    build: (x) => ({ alias: 'Gün batımında ışıkları aç', mode: 'single', triggers: [sun('sunset', -15)], conditions: [], actions: [lightOn(x.light, 60)] }),
  },
  {
    id: 'wake-up-light', category: 'Lighting', icon: 'sun', needs: ['light'],
    title: 'Hafta içi uyandırma ışığı',
    text: 'Hafta içi 07:00\'de ışık loş ve sıcak başlar, beş dakika sonra parlak ve soğuk beyaza geçer.',
    build: (x) => ({ alias: 'Uyandırma ışığı', mode: 'single', triggers: [at('07:00')], conditions: [between('06:00', '10:00', WEEKDAYS)], actions: [lightOn(x.light, 20), wait(300), lightOn(x.light, 100, KELVIN_COOL)] }),
  },
  {
    id: 'bedtime-lights', category: 'Lighting', icon: 'moon', needs: ['light'],
    title: 'Yatma saatinde ışıklar sönsün',
    text: '00:30\'da hâlâ açık olan ışık kapanır.',
    build: (x) => ({ alias: 'Yatma saatinde ışıkları kapat', mode: 'single', triggers: [at('00:30')], conditions: [is(x.light, 'on')], actions: [act(x.light, 'turn_off')] }),
  },

  // ---- comfort
  {
    id: 'window-heater-off', category: 'Comfort', icon: 'window', needs: ['contact', 'heater'],
    title: 'Pencere açılınca ısıtıcı kapansın',
    text: 'Pencere iki dakika açık kalırsa ısıtıcı kapanır, sokağı ısıtmazsınız.',
    build: (x) => {
      const p = powerIf('heater', false);
      return { alias: 'Pencere açıkken ısıtıcıyı kapat', mode: 'single', triggers: [when(x.contact, 'on', 2)], conditions: [p.condition], actions: [p.action, note('Isıtıcı kapandı', `Pencere açık olduğu için ısıtıcı kapatıldı${inRoom(x)}.`)] };
    },
  },
  {
    id: 'cold-heater-on', category: 'Comfort', icon: 'heater', needs: ['climate', 'heater'], optional: ['contact'],
    title: 'Oda soğuyunca ısıtıcı açılsın',
    text: 'On dakika 18°\'nin altında kalırsa ısıtıcı açılır (pencere sensörü varsa yalnızca pencere kapalıyken).',
    build: (x) => {
      const p = powerIf('heater', true);
      return { alias: 'Soğukta ısıtıcıyı aç', mode: 'single', triggers: [drops(x.climate, 18, 10)], conditions: [p.condition, ...(x.has('contact') ? [is(x.contact, 'off')] : [])], actions: [p.action] };
    },
  },
  {
    id: 'warm-heater-off', category: 'Comfort', icon: 'thermometer', needs: ['climate', 'heater'],
    title: 'Yeterince ısınınca ısıtıcı kapansın',
    text: 'Beş dakika 23°\'nin üstünde kalırsa ısıtıcı enerji tasarrufu için kapanır.',
    build: (x) => {
      const p = powerIf('heater', false);
      return { alias: 'Isınınca ısıtıcıyı kapat', mode: 'single', triggers: [rises(x.climate, 23, 5)], conditions: [p.condition], actions: [p.action] };
    },
  },
  {
    id: 'morning-warmup', category: 'Comfort', icon: 'flame', needs: ['heater'],
    title: 'Kalkmadan oda ısınsın',
    text: 'Hafta içi 06:45\'te ısıtıcı açılır, alarm çaldığında oda sıcacık olur.',
    build: () => {
      const p = powerIf('heater', true);
      return { alias: 'Sabah ısıtması', mode: 'single', triggers: [at('06:45')], conditions: [between('06:00', '10:00', WEEKDAYS), p.condition], actions: [p.action] };
    },
  },
  {
    id: 'heater-bedtime', category: 'Comfort', icon: 'moon', needs: ['heater'],
    title: 'Yatma saatinde ısıtıcı kapansın',
    text: '23:30\'da ısıtıcı hâlâ çalışıyorsa kapanır.',
    build: () => {
      const p = powerIf('heater', false);
      return { alias: 'Yatma saatinde ısıtıcıyı kapat', mode: 'single', triggers: [at('23:30')], conditions: [p.condition], actions: [p.action] };
    },
  },
  {
    id: 'dry-air', category: 'Comfort', icon: 'droplet', needs: ['climate'],
    title: 'Kuru hava uyarısı',
    text: 'Nem yarım saat %35\'in altında kalırsa odayı havalandırmanızı ya da nemlendirici kullanmanızı hatırlatır.',
    build: (x) => ({ alias: 'Kuru hava uyarısı', mode: 'single', triggers: [drops(x.humidity || x.climate, 35, 30)], conditions: [], actions: [note('Kuru hava', `Nem %35'in altında${inRoom(x)}. Bir nemlendirici ya da ısıtıcının yanına konan bir kap su işe yarar.`)] }),
  },
  {
    id: 'window-reminder', category: 'Comfort', icon: 'window', needs: ['contact'],
    title: 'Açık kalan pencere hatırlatması',
    text: 'Pencere 15 dakika açık kalırsa hatırlatma gelir.',
    build: (x) => ({ alias: 'Pencere açık kaldı', mode: 'single', triggers: [when(x.contact, 'on', 15)], conditions: [], actions: [note('Pencere açık', `Pencere 15 dakikadır açık${inRoom(x)}.`)] }),
  },
  {
    id: 'rain-window', category: 'Comfort', icon: 'cloud', needs: ['contact'],
    title: 'Yağmur başlıyor, pencere açık',
    text: 'Hava durumuna bakar: pencere açıkken yağmur başlarsa telefonunuza uyarı gelir.',
    build: (x) => ({ alias: 'Pencere açıkken yağmur', mode: 'single', triggers: [when(HOME.weather, 'rainy')], conditions: [is(x.contact, 'on')], actions: urgent('Yağmur var, pencere açık', `Yağmur başlıyor ve pencere açık${inRoom(x)}.`) }),
  },
  {
    id: 'co2-air', category: 'Comfort', icon: 'air', needs: ['co2'],
    title: 'Odayı havalandırma zamanı',
    text: 'CO₂ on dakika 1.200 ppm\'in üstünde kalırsa pencereyi açmanızı hatırlatır.',
    build: (x) => ({ alias: 'Odayı havalandır', mode: 'single', triggers: [rises(x.co2, 1200, 10)], conditions: [], actions: [note('Hava ağırlaştı', `CO₂ 1.200 ppm'in üstünde${inRoom(x)}. Birkaç dakika pencereyi açın.`)] }),
  },
  {
    id: 'co2-fresh', category: 'Comfort', icon: 'window', needs: ['co2', 'contact'],
    title: 'Hava tazelendi: pencereyi kapatın',
    text: 'Pencere açıkken CO₂ 600 ppm\'in altına inince havanın tazelendiğini ve kapatabileceğinizi söyler.',
    build: (x) => ({ alias: 'Hava yeniden taze', mode: 'single', triggers: [drops(x.co2, 600)], conditions: [is(x.contact, 'on')], actions: [note('Taze hava', `Hava yeniden taze${inRoom(x)}. Pencereyi kapatabilirsiniz.`)] }),
  },
  {
    id: 'trv-window', category: 'Comfort', icon: 'thermostat', needs: ['contact', 'trv'],
    title: 'Pencere açıkken radyatör kapansın',
    text: 'Pencere bir dakika açık kalırsa radyatör vanası kapanır, ısı kaçmaz.',
    build: (x) => ({ alias: 'Pencere açıkken radyatörü kapat', mode: 'single', triggers: [when(x.contact, 'on', 1)], conditions: [], actions: [act(x.trv, 'turn_off')] }),
  },
  {
    id: 'boiler-cold', category: 'Comfort', icon: 'toggle', needs: ['climate', 'boiler'],
    title: 'Oda soğuyunca kombi çalışsın',
    text: 'On dakika 19°\'nin altında kalırsa kombi rölesi ısıtmayı açar.',
    build: (x) => ({ alias: 'Soğukta kombiyi aç', mode: 'single', triggers: [drops(x.climate, 19, 10)], conditions: [], actions: [act(x.boiler, 'turn_on')] }),
  },
  {
    id: 'blinds-heat', category: 'Comfort', icon: 'sun', needs: ['cover', 'climate'],
    title: 'Hava ısınınca perdeler kapansın',
    text: 'Gündüz 26°\'nin üstüne çıkınca güneşi dışarıda tutmak için perdeler kapanır.',
    build: (x) => ({ alias: 'Sıcakta perdeleri kapat', mode: 'single', triggers: [rises(x.climate, 26, 15)], conditions: [is('sun.sun', 'above_horizon')], actions: x.all('cover').map((c) => act(c, 'close_cover')) }),
  },
  {
    id: 'purifier-pm25', category: 'Comfort', icon: 'air', needs: ['purifier', 'pm25'],
    title: 'Hava kirlenince temizleyici hızlansın',
    text: 'PM2.5 beş dakika 35 µg/m³\'ün üstünde kalırsa hava temizleyici %80 hızda çalışır.',
    build: (x) => ({ alias: 'Kirli havada temizleyiciyi hızlandır', mode: 'single', triggers: [rises(x.pm25, 35, 5)], conditions: [], actions: [act(x.purifier, 'turn_on', { percentage: 80 })] }),
  },
  {
    id: 'purifier-clean', category: 'Comfort', icon: 'air', needs: ['purifier', 'pm25'],
    title: 'Hava temizlenince otomatik moda dönsün',
    text: 'PM2.5 on beş dakika 12 µg/m³\'ün altında kalınca hava temizleyici yeniden otomatik moda geçer.',
    build: (x) => ({ alias: 'Temiz havada otomatik mod', mode: 'single', triggers: [drops(x.pm25, 12, 15)], conditions: [is(x.purifier, 'on')], actions: [act(x.purifier, 'set_preset_mode', { preset_mode: 'Auto' })] }),
  },
  {
    id: 'purifier-window', category: 'Comfort', icon: 'window', needs: ['purifier', 'contact'],
    title: 'Pencere açıkken temizleyici dursun',
    text: 'Pencere iki dakika açık kalırsa hava temizleyici boşuna çalışmasın diye kapanır.',
    build: (x) => ({ alias: 'Pencere açıkken temizleyiciyi kapat', mode: 'single', triggers: [when(x.contact, 'on', 2)], conditions: [is(x.purifier, 'on')], actions: [act(x.purifier, 'turn_off')] }),
  },
  {
    id: 'purifier-sleep', category: 'Comfort', icon: 'moon', needs: ['purifier'],
    title: 'Gece temizleyici sessize geçsin',
    text: '23:00\'te hava temizleyici uykunuzu bölmemek için sessiz uyku moduna geçer.',
    build: (x) => ({ alias: 'Gece temizleyici uyku modu', mode: 'single', triggers: [at('23:00')], conditions: [is(x.purifier, 'on')], actions: [act(x.purifier, 'set_preset_mode', { preset_mode: 'Sleep' })] }),
  },
  {
    id: 'fan-warm', category: 'Comfort', icon: 'fan', needs: ['fan', 'climate'],
    title: 'Oda ısınınca vantilatör açılsın',
    text: 'Oda on dakika 27°\'nin üstünde kalırsa vantilatör %60 hızda açılır.',
    build: (x) => ({ alias: 'Sıcakta vantilatörü aç', mode: 'single', triggers: [rises(x.climate, 27, 10)], conditions: [], actions: [act(x.fan, 'turn_on', { percentage: 60 })] }),
  },
  {
    id: 'fan-cool-off', category: 'Comfort', icon: 'fan', needs: ['fan', 'climate'],
    title: 'Serinleyince vantilatör kapansın',
    text: 'Oda on dakika 24°\'nin altında kalırsa vantilatör kapanır.',
    build: (x) => ({ alias: 'Serinleyince vantilatörü kapat', mode: 'single', triggers: [drops(x.climate, 24, 10)], conditions: [is(x.fan, 'on')], actions: [act(x.fan, 'turn_off')] }),
  },

  // ---- home appliances
  {
    id: 'vacuum-away', category: 'Appliances', icon: 'vacuum', needs: ['vacuum'], optional: ['lock', 'motion'],
    title: 'Herkes evden çıkınca süpürge temizlesin',
    text: 'Kapıyı kilitleyip çıktığınızda (kilit yoksa evde yarım saat kimse görülmeyince) robot süpürge temizliğe başlar. Gündüz 08:00 ile 20:00 arası çalışır.',
    build: (x) => ({ alias: 'Evden çıkınca süpür', mode: 'single', triggers: leftHome(x), conditions: [between('08:00', '20:00'), is(x.vacuum, 'docked')],
      actions: [act(x.vacuum, 'start'), note('Temizlik başladı', 'Evde kimse yok, robot süpürge temizliğe başladı.')] }),
  },
  {
    id: 'vacuum-home', category: 'Appliances', icon: 'vacuum', needs: ['vacuum', 'lock'],
    title: 'Eve gelince süpürge istasyonuna dönsün',
    text: 'Kapının kilidini açtığınızda temizlik sürüyorsa süpürge istasyonuna döner, ayağınıza dolanmaz.',
    build: (x) => ({ alias: 'Eve gelince süpürgeyi istasyona gönder', mode: 'single', triggers: [when(x.lock, 'unlocked')], conditions: [is(x.vacuum, 'cleaning')], actions: [act(x.vacuum, 'return_to_base')] }),
  },
  {
    id: 'vacuum-error', category: 'Appliances', icon: 'vacuum', needs: ['vacuum'],
    title: 'Süpürge takılırsa haber ver',
    text: 'Robot süpürge sıkışırsa ya da hata verirse telefonunuza bildirim gelir.',
    build: (x) => ({ alias: 'Süpürge takıldı', mode: 'single', triggers: [when(x.vacuum, 'error')], conditions: [],
      actions: urgent('Robot süpürge takıldı', `Robot süpürge bir hata verdi${inRoom(x)}. Bir yere sıkışmış ya da fırçasına bir şey dolanmış olabilir.`) }),
  },
  {
    id: 'kettle-morning', category: 'Appliances', icon: 'kettle', needs: ['kettle'],
    title: 'Sabah su hazır olsun',
    text: 'Hafta içi 07:00\'de su ısıtıcı çalışır; kalktığınızda çay ya da kahve suyu hazırdır. Akşamdan su doldurmayı unutmayın.',
    build: (x) => ({ alias: 'Sabah su ısıtıcı', mode: 'single', triggers: [at('07:00')], conditions: [between('06:00', '10:00', WEEKDAYS)], actions: [act(x.kettle, 'turn_on')] }),
  },
  {
    id: 'kettle-ready', category: 'Appliances', icon: 'kettle', needs: ['kettleTemp'],
    title: 'Su ısınınca haber ver',
    text: 'Su ısıtıcıdaki su 80°\'yi geçince bildirim gelir; başında beklemezsiniz.',
    build: (x) => ({ alias: 'Su hazır', mode: 'single', triggers: [rises(x.kettleTemp, 80)], conditions: [], actions: [note('Su hazır', 'Su ısıtıcıdaki su ısındı.')] }),
  },
  {
    id: 'kettle-forgot', category: 'Appliances', icon: 'kettle', needs: ['kettle'],
    title: 'Unutulan su ısıtıcı kapansın',
    text: 'Su ısıtıcı 20 dakikadan uzun açık kalırsa kapanır ve size haber verilir.',
    build: (x) => ({ alias: 'Unutulan su ısıtıcıyı kapat', mode: 'single', triggers: [when(x.kettle, 'on', 20)], conditions: [], actions: [act(x.kettle, 'turn_off'), note('Su ısıtıcı kapandı', '20 dakikadır açık olduğu için su ısıtıcı kapatıldı.')] }),
  },

  // ---- pets
  {
    id: 'feeder-schedule', category: 'Pets', icon: 'paw', needs: ['feeder'],
    title: 'Belirli saatlerde mama versin',
    text: 'Her gün 08:00 ve 19:00\'da mama makinesi bir öğün verir. Saatleri kendinize göre değiştirin.',
    build: (x) => ({ alias: 'Saatli mama', mode: 'single', triggers: [at('08:00'), at('19:00')], conditions: [], actions: [press(x.feeder)] }),
  },
  {
    id: 'feeder-low', category: 'Pets', icon: 'paw', needs: ['foodLevel'],
    title: 'Mama azalınca haber ver',
    text: 'Mama makinesinin haznesi azalınca ya da boşalınca telefonunuza bildirim gelir.',
    build: (x) => ({ alias: 'Mama azaldı', mode: 'single', triggers: [when(x.foodLevel, 'Low'), when(x.foodLevel, 'Empty')], conditions: [],
      actions: urgent('Mama azaldı', 'Mama makinesinin haznesi azaldı ya da boşaldı. Doldurmayı unutmayın.') }),
  },
  {
    id: 'litter-full', category: 'Pets', icon: 'litter', needs: ['litterBin'],
    title: 'Kum kabının haznesi dolunca haber ver',
    text: 'Atık haznesi %80 dolunca boşaltmanız için bildirim gelir.',
    build: (x) => ({ alias: 'Kum kabı haznesi dolu', mode: 'single', triggers: [rises(x.litterBin, 80)], conditions: [], actions: [note('Hazne dolu', 'Kum kabının atık haznesi %80 doldu. Boşaltma zamanı.')] }),
  },
  {
    id: 'litter-daily', category: 'Pets', icon: 'litter', needs: ['litter'],
    title: 'Kum kabı her gün bir tur daha temizlesin',
    text: 'Kendi otomatik temizliğine ek olarak kum kabı her gün 13:00\'te bir kez daha temizlenir, koku birikmez.',
    build: (x) => ({ alias: 'Öğlen kum kabı temizliği', mode: 'single', triggers: [at('13:00')], conditions: [], actions: [press(x.litter)] }),
  },

  // ---- entertainment
  {
    id: 'tv-ambient', category: 'Entertainment', icon: 'tv', needs: ['tv', 'colour'],
    title: 'TV açılınca film ışığı',
    text: 'Akşam TV\'yi açınca ışık yumuşak bir mora kısılır.',
    build: (x) => ({ alias: 'TV ile film ışığı', mode: 'single', triggers: [when(HOME.tv.tracker, 'on')], conditions: [dark()], actions: [lightOn(x.colour, 20, KELVIN_WARM, PURPLE)] }),
  },
  {
    id: 'tv-off-empty', category: 'Entertainment', icon: 'tv', needs: ['motion', 'tv'],
    title: 'Kimse izlemiyorsa TV kapansın',
    text: 'TV açıkken 30 dakika hareket olmazsa kapanır.',
    build: (x) => {
      const p = powerIf('tv', false);
      return { alias: 'Kimse izlemiyorsa TV\'yi kapat', mode: 'single', triggers: [when(x.motion, 'off', 30)], conditions: [p.condition], actions: [p.action] };
    },
  },

  // ---- energy
  {
    id: 'standby-killer', category: 'Energy', icon: 'bolt', needs: ['power'],
    title: 'Bekleme gücünü kes',
    text: 'Prize takılı cihaz yarım saat 2 W\'tan az çekerse priz kapanır.',
    build: (x) => ({ alias: 'Bekleme gücünü kes', mode: 'single', triggers: [drops(x.power, 2, 30)], conditions: [is(x.plugOfPower, 'on')], actions: [act(x.plugOfPower, 'turn_off')] }),
  },
  {
    id: 'appliance-done', category: 'Energy', icon: 'bell', needs: ['power'],
    title: 'Makine bitince haber ver',
    text: 'Prizin gücü üç dakika 5 W\'ın altına inince bildirim gelir: çamaşır makinesi ya da bulaşık makinesi için kullanışlı.',
    build: (x) => ({ alias: 'Makine bitti', mode: 'single', triggers: [drops(x.power, 5, 3)], conditions: [], actions: [note('Bitti', `Prize takılı cihaz işini bitirdi (${x.powerName}).`)] }),
  },
  {
    id: 'plug-off-empty', category: 'Energy', icon: 'plug', needs: ['motion', 'plug'],
    title: 'Kimse yokken priz kapansın',
    text: 'Bir saat hareket olmazsa priz kapanır: açık unutulan ısıtıcı, ütü ya da hoparlör için.',
    build: (x) => ({ alias: 'Kimse yokken prizi kapat', mode: 'single', triggers: [when(x.motion, 'off', 60)], conditions: [is(x.plug, 'on')], actions: [act(x.plug, 'turn_off')] }),
  },
  {
    id: 'trv-empty', category: 'Energy', icon: 'thermostat', needs: ['motion', 'trv'],
    title: 'Boş odalarda ısıtmayı düşür',
    text: '30 dakika kimse görülmezse radyatör 17°\'ye iner.',
    build: (x) => ({ alias: 'Boş odada ısıtmayı düşür', mode: 'single', triggers: [when(x.motion, 'off', 30)], conditions: [], actions: [act(x.trv, 'set_temperature', { temperature: 17 })] }),
  },
  {
    id: 'leaving-home', category: 'Energy', icon: 'lock', needs: ['lock', 'light'], optional: ['plug'],
    title: 'Çıkarken her şey kapansın',
    text: 'Gündüz kapıyı kilitleyince ışıklar (ve varsa priz) kapanır.',
    build: (x) => ({ alias: 'Çıkarken her şeyi kapat', mode: 'single', triggers: [when(x.lock, 'locked')], conditions: [between('07:00', '20:00')],
      actions: [...x.all('light').map((l) => act(l, 'turn_off')), ...(x.has('plug') ? [act(x.plug, 'turn_off')] : [])] }),
  },
  {
    id: 'fan-empty', category: 'Energy', icon: 'fan', needs: ['fan', 'motion'],
    title: 'Oda boşalınca vantilatör kapansın',
    text: 'Odada 20 dakika kimse görülmezse vantilatör kapanır.',
    build: (x) => ({ alias: 'Boş odada vantilatörü kapat', mode: 'single', triggers: [when(x.motion, 'off', 20)], conditions: [is(x.fan, 'on')], actions: [act(x.fan, 'turn_off')] }),
  },

  // ---- covers
  {
    id: 'blinds-sunset', category: 'Lighting', icon: 'blind', needs: ['cover'],
    title: 'Gün batımında perdeler kapansın',
    text: 'Gün batımında perdeler ya da storlar kendiliğinden kapanır.',
    build: (x) => ({ alias: 'Gün batımında perdeleri kapat', mode: 'single', triggers: [sun('sunset')], conditions: [], actions: x.all('cover').map((c) => act(c, 'close_cover')) }),
  },
  {
    id: 'blinds-morning', category: 'Lighting', icon: 'blind', needs: ['cover'],
    title: 'Sabah perdeler açılsın',
    text: 'Hafta içi 07:30\'da perdeler gün ışığını içeri almak için açılır.',
    build: (x) => ({ alias: 'Sabah perdeleri aç', mode: 'single', triggers: [at('07:30')], conditions: [between('06:00', '10:00', WEEKDAYS)], actions: x.all('cover').map((c) => act(c, 'open_cover')) }),
  },

  // ---- safety
  {
    id: 'smoke-alarm', category: 'Safety', icon: 'smoke', needs: ['smoke'], optional: ['light', 'siren'],
    title: 'Duman: herkesi uyar, çıkış yolunu aydınlat',
    text: 'Duman algılanınca ailenin telefonlarına acil uyarı gider, tüm ışıklar tam yanar ve siren çalar.',
    build: (x) => ({ alias: 'Duman alarmı', mode: 'single', triggers: [when(x.smoke, 'on')], conditions: [],
      actions: [...(x.has('siren') ? [act(x.siren, 'turn_on')] : []), ...x.all('light').map((l) => lightOn(l, 100, KELVIN_COOL)), ...urgent('Duman algılandı', `Duman algılandı${inRoom(x)}. Yangın varsa 112'yi arayın.`)] }),
  },
  {
    id: 'gas-alarm', category: 'Safety', icon: 'alert', needs: ['gas'], optional: ['siren'],
    title: 'Gaz kaçağı alarmı',
    text: 'Gaz algılanınca ne yapılacağını söyleyen acil bir uyarı gider ve siren çalar.',
    build: (x) => ({ alias: 'Gaz kaçağı alarmı', mode: 'single', triggers: [when(x.gas, 'on')], conditions: [],
      actions: [...(x.has('siren') ? [act(x.siren, 'turn_on')] : []), ...urgent('Gaz algılandı', `Gaz algılandı${inRoom(x)}. Ateş yakmayın, düğmelere dokunmayın, pencereleri açın ve 187'yi arayın.`)] }),
  },
  {
    id: 'leak-alert', category: 'Safety', icon: 'droplet', needs: ['leak'],
    title: 'Su kaçağı uyarısı',
    text: 'Çamaşır makinesinin ya da lavabonun altında su olunca telefonunuza acil uyarı gelir.',
    build: (x) => ({ alias: 'Su kaçağı uyarısı', mode: 'single', triggers: [when(x.leak, 'on')], conditions: [], actions: urgent('Su kaçağı', `Su algılandı${inRoom(x)}.`) }),
  },
  {
    id: 'leak-shutoff', category: 'Safety', icon: 'valve', needs: ['leak', 'waterValve'],
    title: 'Su kaçağında suyu kes',
    text: 'Kaçak sensörü ıslandığı anda ana su vanası kapanır ve size haber verilir.',
    build: (x) => ({ alias: 'Kaçakta suyu kes', mode: 'single', triggers: [when(x.leak, 'on')], conditions: [], actions: [act(x.waterValve, 'close_valve'), ...urgent('Su kesildi', `Su kaçağı algılandığı için ana su vanası kapatıldı${inRoom(x)}.`)] }),
  },
  {
    id: 'sos-alert', category: 'Safety', icon: 'sos', needs: ['sos'], optional: ['light'],
    title: 'Acil durum düğmesi aileyi uyarsın',
    text: 'Acil durum düğmesine basılınca acil uyarı gider ve yardıma gelenler görebilsin diye ışıklar yanar.',
    build: (x) => ({ alias: 'Acil durum düğmesine basıldı', mode: 'single', triggers: [when(x.sos, null)], conditions: [],
      actions: [...x.all('light').map((l) => lightOn(l, 100, KELVIN_COOL)), ...urgent('Acil durum düğmesi', `Acil durum düğmesine basıldı${inRoom(x)}.`)] }),
  },
  {
    id: 'inactivity', category: 'Safety', icon: 'radar', needs: ['presence'],
    title: '12 saat hareket yok',
    text: 'Yalnız yaşayan bir yakınınız için: radar 12 saat kimseyi görmezse aile uyarılır.',
    build: (x) => ({ alias: '12 saattir hareket yok', mode: 'single', triggers: [when(x.presence, 'off', 720)], conditions: [], actions: urgent('Hareket yok', `12 saattir kimse görülmedi${inRoom(x)}.`) }),
  },

  // ---- security
  {
    id: 'night-movement', category: 'Security', icon: 'person', needs: ['motion'],
    title: 'Gece hareket uyarısı',
    text: '01:00 ile 06:00 arasındaki hareket telefonunuza uyarı gönderir. Gece kullanılmayan odalar ya da evde yokken için en iyisi.',
    build: (x) => ({ alias: 'Gece hareket', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [between('01:00', '06:00')], actions: urgent('Gece hareket', `Hareket algılandı${inRoom(x)}.`) }),
  },
  {
    id: 'auto-lock', category: 'Security', icon: 'lock', needs: ['lock'],
    title: 'Gece kapı kilitlensin',
    text: '23:00\'te ön kapı kilitli değilse kilitlenir.',
    build: (x) => ({ alias: 'Gece kapıyı kilitle', mode: 'single', triggers: [at('23:00')], conditions: [is(x.lock, 'unlocked')], actions: [act(x.lock, 'lock')] }),
  },
  {
    id: 'unlocked-reminder', category: 'Security', icon: 'lock', needs: ['lock'],
    title: 'Kilitsiz kalan kapı',
    text: 'On dakika kilitsiz kalırsa kapı kendini kilitler ve size haber verilir.',
    build: (x) => ({ alias: 'Kapı kilitsiz kaldı', mode: 'single', triggers: [when(x.lock, 'unlocked', 10)], conditions: [], actions: [act(x.lock, 'lock'), note('Kapı kilitlendi', 'Ön kapı 10 dakika kilitsiz kaldığı için kilitlendi.')] }),
  },
  {
    id: 'away-siren', category: 'Security', icon: 'siren', needs: ['motion', 'lock', 'siren'],
    title: 'Evde yokken hareket olursa siren',
    text: 'Hafta içi 09:00–17:00 arası kapı kilitliyken hareket olursa siren çalar ve size haber verilir.',
    build: (x) => ({ alias: 'Hırsız sireni', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [is(x.lock, 'locked'), between('09:00', '17:00', WEEKDAYS)],
      actions: [act(x.siren, 'turn_on'), ...urgent('Evde yokken hareket', `Kapı kilitliyken hareket algılandı${inRoom(x)}.`)] }),
  },
  {
    id: 'camera-privacy', category: 'Security', icon: 'camera', needs: ['camera', 'motion'],
    title: 'Evdeyken kamera başka yere baksın',
    text: 'Evde hareket olunca iç mekân kamerası gizlilik moduna geçer ve lensini kapatır.',
    build: (x) => ({ alias: 'Evdeyken kamera gizliliği', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [is(x.camera, 'off')], actions: [act(x.camera, 'turn_on')] }),
  },
  {
    id: 'doorstep-light', category: 'Security', icon: 'camera', needs: ['outdoorCam', 'light'],
    title: 'Kapıda biri varsa ışık ve uyarı',
    text: 'Hava karardıktan sonra dış kamera birini görünce ışık üç dakika yanar ve uyarı gelir.',
    build: (x) => ({ alias: 'Kapıda biri var', mode: 'restart', triggers: [when(x.outdoorCam, 'on')], conditions: [dark()],
      actions: [note('Dışarıda biri var', 'Dış kamera birini gördü.'), lightOn(x.light, 100, KELVIN_COOL), wait(180), act(x.light, 'turn_off')] }),
  },

  // ---- garden
  {
    id: 'garden-water', category: 'Garden', icon: 'sprout', needs: ['irrigation'],
    title: 'Her sabah bitkileri sula',
    text: '07:00\'de sulama vanası 15 dakikalığına açılır.',
    build: (x) => ({ alias: 'Sabah sulaması', mode: 'single', triggers: [at('07:00')], conditions: [], actions: [act(x.irrigation, 'open_valve'), wait(900), act(x.irrigation, 'close_valve')] }),
  },
];

// ---- putting it together ------------------------------------------------------------

// Every idea with whether it can be set up now, the devices it would use and
// what's missing.
export function ideasForHome() {
  const have = scanHome();
  return IDEAS.map((idea) => {
    const missing = idea.needs.filter((c) => !have[c]?.length);
    const pick = choose(idea, have);
    const uses = [...idea.needs, ...(idea.optional || [])].filter((c) => have[c]?.length).map((c) => ({ cap: c, device: pick[c]?.device }));
    return { idea, ready: !missing.length, missing, uses, optionalMissing: (idea.optional || []).filter((c) => !have[c]?.length) };
  });
}

// Picks one device per need, preferring a room that has all of them.
function choose(idea, have) {
  const caps = [...idea.needs, ...(idea.optional || [])];
  const rooms = new Map();
  for (const c of idea.needs) for (const { device } of have[c] || []) rooms.set(device.area_id, (rooms.get(device.area_id) || 0) + 1);
  const best = [...rooms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const out = {};
  for (const c of caps) {
    const list = have[c] || [];
    out[c] = list.find((x) => x.device.area_id === best) || list[0];
  }
  return out;
}

// The automation config for an idea, using this home's devices. Null if it can't be built.
export function buildIdea(id) {
  const idea = IDEAS.find((i) => i.id === id);
  if (!idea) return null;
  const have = scanHome();
  if (idea.needs.some((c) => !have[c]?.length)) return null;
  const pick = choose(idea, have);
  const first = pick[idea.needs[0]];
  const powerDevice = pick.power?.device;
  const x = {
    has: (c) => !!have[c]?.length,
    all: (c) => (have[c] || []).map((v) => v.entity),
    room: (first && areaName(first.device.area_id)) || 'ev',
    humidity: (have.humidity || []).find((v) => v.device.area_id === first?.device.area_id)?.entity || have.humidity?.[0]?.entity,
    // The switch on the same plug as the power reading.
    plugOfPower: powerDevice ? mainEntities(powerDevice).find(FIND.plug) : null,
    powerName: powerDevice ? deviceName(powerDevice) : 'priz',
  };
  for (const [c, v] of Object.entries(pick)) if (v) x[c] = v.entity;
  try {
    const cfg = idea.build(x);
    return { description: idea.text, ...cfg };
  } catch (e) {
    console.warn('Idea could not be built', id, e);
    return null;
  }
}
