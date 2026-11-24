// Rooms: what each room's sensors and devices say right now, as small icon badges
// for the room squares (Devices → Odalar) and the room pages.

import { store, entityArea, userDevices } from './store.js';
import { productForDevice } from './catalog.js';
import { dec, numVal, isOn } from './util.js';

const dom = (id) => id.split('.')[0];
const dc = (s) => s.attributes?.device_class;
const OCCUPANCY = ['occupancy', 'motion', 'presence'];
const OPENING = ['opening', 'door', 'window', 'garage_door'];

// An icon from the room's name (Turkish or English), else a generic one.
const NAME_ICONS = [
  [/yatak|bed|uyku/, 'bed'], [/mutfak|kitchen|yemek|dining/, 'dinner'], [/banyo|bath|tuvalet|wc|duş/, 'droplet'],
  [/salon|oturma|living|lounge|tv/, 'tv'], [/çocuk|bebek|kid|child|nursery|oyun/, 'party'], [/çalışma|ofis|office|study/, 'devices'],
  [/bahçe|balkon|teras|garden|balcony|terrace/, 'sprout'], [/giriş|koridor|antre|hall|entrance|hol/, 'door'],
  [/garaj|garage|depo|kiler/, 'lock'], [/çamaşır|laundry/, 'air'],
];
export function roomIcon(name) {
  const n = String(name || '').toLocaleLowerCase('tr-TR');
  return (NAME_ICONS.find(([re]) => re.test(n)) || [null, 'rooms'])[1];
}

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
