// Rooms: what each room's sensors and devices say right now, as small icon badges
// for the room squares (Devices → Odalar) and the room pages.

import { store, entityArea, userDevices } from './store.js';
import { productForDevice } from './catalog.js';
import { dec, numVal, isOn } from './util.js';

const dom = (id) => id.split('.')[0];
const dc = (s) => s.attributes?.device_class;
const OCCUPANCY = ['occupancy', 'motion', 'presence'];
const OPENING = ['opening', 'door', 'window', 'garage_door'];

// What kind of room a name means (Turkish or English, with or without Turkish letters:
// "Çocuk odası" and "Cocuk odasi" are the same): it picks the room's icon and, on Home's
// house model, its furniture. Anything else is a plain room. The first match wins, so
// "Çocuk yatak odası" is a child's room and "Misafir banyosu" a bathroom.
const NAME_TYPES = [
  [/cocuk|bebek|kid|child|nursery|oyun/, 'kids', 'party'], [/tuvalet|\bwc\b|lavabo|toilet/, 'wc', 'droplet'],
  [/banyo|bath|dus|shower/, 'bath', 'droplet'], [/mutfak|kitchen|yemek|dining/, 'kitchen', 'dinner'],
  [/yatak|bed|uyku|misafir odasi|guest|ebeveyn|master/, 'bedroom', 'bed'], [/salon|oturma|living|lounge|\btv\b/, 'living', 'tv'],
  [/calisma|ofis|office|study/, 'office', 'devices'], [/bahce|balkon|teras|garden|balcony|terrace/, 'garden', 'sprout'],
  [/giris|koridor|antre|hall|entrance|\bhol\b/, 'hall', 'door'], [/garaj|garage|depo|kiler|storage/, 'storage', 'lock'],
  [/camasir|laundry/, 'laundry', 'air'],
];
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const fold = (name) => String(name || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
const typeEntry = (name) => {
  const n = fold(name);
  return NAME_TYPES.find(([re]) => re.test(n)) || [null, 'room', 'rooms'];
};
export const roomType = (name) => typeEntry(name)[1];
export const roomIcon = (name) => typeEntry(name)[2];

/** The entities of a room's devices (and ones placed in it directly), without hidden or technical ones. */
export function roomEntities(areaId) {
  const out = [];
  for (const s of store.states.values()) {
    const reg = store.entities.get(s.entity_id);
    if (!reg || reg.entity_category || reg.hidden_by || reg.disabled_by) continue;
    if (entityArea(s.entity_id) === areaId) out.push(s);
  }
  return out;
}

export function roomDevices(areaId) {
  return userDevices().filter((d) => d.area_id === areaId);
}

// Kettles report water temperature; that isn't the room's.
function fromKettle(s) {
  const dev = store.devices.get(store.entities.get(s.entity_id)?.device_id || '');
  return dev && productForDevice(dev)?.id === 'smart-kettle';
}

/**
 * Badges for a room: [{ key, icon, value, label, tone }] where tone is '', 'on'
 * (something happening), 'warn' (worth a look) or 'alarm'.
 */
export function roomBadges(areaId) {
  const ents = roomEntities(areaId);
  const ok = (s) => s.state !== 'unavailable' && s.state !== 'unknown';
  const pick = (test) => ents.filter((s) => test(s) && ok(s));
  const out = [];
  const avg = (list) => list.reduce((a, s) => a + numVal(s), 0) / list.length;

  const alarms = pick((s) => dom(s.entity_id) === 'binary_sensor' && ['smoke', 'gas', 'moisture', 'carbon_monoxide'].includes(dc(s)));
  if (alarms.length) {
    const firing = alarms.filter(isOn);
    const what = { smoke: 'Duman', gas: 'Gaz', moisture: 'Su kaçağı', carbon_monoxide: 'Karbonmonoksit' };
    out.push(firing.length
      ? { key: 'alarm', icon: 'alert', value: what[dc(firing[0])] || 'Alarm', label: 'Alarm', tone: 'alarm' }
      : { key: 'alarm', icon: 'smoke', value: 'Normal', label: 'Güvenlik sensörleri' });
  }
  const temps = pick((s) => dom(s.entity_id) === 'sensor' && dc(s) === 'temperature' && numVal(s) != null && !fromKettle(s));
  if (temps.length) out.push({ key: 'temp', icon: 'thermometer', value: `${dec(avg(temps))}°`, label: 'Sıcaklık' });
  const hums = pick((s) => dom(s.entity_id) === 'sensor' && dc(s) === 'humidity' && numVal(s) != null);
  if (hums.length) out.push({ key: 'hum', icon: 'droplet', value: `%${Math.round(avg(hums))}`, label: 'Nem', tone: avg(hums) < 35 ? 'warn' : '' });
  const co2 = pick((s) => dom(s.entity_id) === 'sensor' && dc(s) === 'carbon_dioxide' && numVal(s) != null);
  if (co2.length) { const v = Math.round(avg(co2)); out.push({ key: 'co2', icon: 'air', value: `${v} ppm`, label: 'CO₂', tone: v > 1200 ? 'warn' : '' }); }
  const pm = pick((s) => dom(s.entity_id) === 'sensor' && dc(s) === 'pm25' && numVal(s) != null);
  if (pm.length) { const v = Math.round(avg(pm)); out.push({ key: 'pm25', icon: 'air', value: `${v} µg`, label: 'PM2.5', tone: v > 35 ? 'warn' : '' }); }
  const motion = pick((s) => dom(s.entity_id) === 'binary_sensor' && OCCUPANCY.includes(dc(s)));
  if (motion.length) {
    const here = motion.some(isOn);
    out.push({ key: 'motion', icon: 'person', value: here ? 'Biri var' : 'Boş', label: 'Hareket', tone: here ? 'on' : '' });
  }
  const openings = pick((s) => dom(s.entity_id) === 'binary_sensor' && OPENING.includes(dc(s)));
  if (openings.length) {
    const open = openings.filter(isOn).length;
    out.push({ key: 'open', icon: 'window', value: open ? `${open} açık` : 'Kapalı', label: 'Kapı ve pencereler', tone: open ? 'warn' : '' });
  }
  const climates = pick((s) => dom(s.entity_id) === 'climate');
  if (climates.length) {
    const c = climates[0];
    const t = c.attributes.temperature;
    out.push({ key: 'heat', icon: 'thermostat', value: c.state === 'off' ? 'Kapalı' : t != null ? `${dec(t)}°` : 'Açık', label: 'Isıtma', tone: c.attributes.hvac_action === 'heating' ? 'heat' : '' });
  }
  const lights = pick((s) => dom(s.entity_id) === 'light');
  if (lights.length) {
    const lit = lights.filter(isOn).length;
    out.push({ key: 'lights', icon: 'bulb', value: lit ? `${lit}/${lights.length} açık` : 'Kapalı', label: 'Işıklar', tone: lit ? 'on' : '' });
  }
  const power = pick((s) => dom(s.entity_id) === 'sensor' && dc(s) === 'power' && s.attributes.unit_of_measurement === 'W' && numVal(s) != null);
  if (power.length) {
    const w = power.reduce((a, s) => a + numVal(s), 0);
    out.push({ key: 'power', icon: 'bolt', value: `${Math.round(w)} W`, label: 'Kullanılan güç', tone: w > 5 ? 'on' : '' });
  }
  const locks = pick((s) => dom(s.entity_id) === 'lock');
  if (locks.length) {
    const open = locks.some((s) => s.state === 'unlocked');
    out.push({ key: 'lock', icon: 'lock', value: open ? 'Kilitsiz' : 'Kilitli', label: 'Kilit', tone: open ? 'warn' : '' });
  }
  const covers = pick((s) => dom(s.entity_id) === 'cover');
  if (covers.length) {
    const open = covers.filter((s) => s.state === 'open' || s.state === 'opening').length;
    out.push({ key: 'cover', icon: 'blind', value: open ? `${open} açık` : 'Kapalı', label: 'Perdeler' });
  }
  const cams = pick((s) => dom(s.entity_id) === 'camera');
  if (cams.length) out.push({ key: 'camera', icon: 'camera', value: `${cams.length}`, label: 'Kamera' });
  return out;
}

// ---- floors -----------------------------------------------------------------------------
// Home Assistant's floors (store.floors). A room without a floor is on the ground floor,
// so a one-floor home needs nothing. Upper floors are "1. kat", "2. kat" (level 1, 2 …),
// the basement "Bodrum" (level -1). Shown in this order: ground, upper floors, basement.

export const GROUND = { floor_id: null, name: 'Zemin kat', level: 0 };

/** The floors in display order, ground floor first (it always exists). */
export function floorList() {
  const list = [...store.floors.values()];
  const up = list.filter((f) => (f.level ?? 1) >= 0 && f.level !== 0).sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
  const zero = list.filter((f) => f.level === 0);
  const down = list.filter((f) => (f.level ?? 1) < 0).sort((a, b) => b.level - a.level);
  return [...(zero.length ? zero : [GROUND]), ...up, ...down];
}

/** Rooms grouped by floor: [{ floor, rooms }]; rooms whose floor is gone go to the ground floor. */
export function roomsByFloor(rooms) {
  const floors = floorList();
  const ground = floors[0];
  return floors.map((f) => ({
    floor: f,
    rooms: rooms.filter((a) => (f === ground ? !a.floor_id || !store.floors.has(a.floor_id) || a.floor_id === f.floor_id : a.floor_id === f.floor_id)),
  }));
}

/** Adds the next upper floor ("1. kat", "2. kat" …) or the basement. */
export async function addFloor(kind) {
  const list = [...store.floors.values()];
  if (kind === 'basement') {
    if (list.some((f) => f.level < 0)) return null;
    return store.backend.createFloor('Bodrum', -1);
  }
  const next = Math.max(0, ...list.filter((f) => f.level > 0).map((f) => f.level)) + 1;
  return store.backend.createFloor(`${next}. kat`, next);
}
