// Scenes: one tap sets a mood across the chosen rooms. Each scene says what
// lights, the TV and heater (through the IR remote), radiator valves, blinds,
// the door lock and the home appliances (robot vacuum, air purifier, fan,
// kettle) should do; only devices in the chosen rooms are touched. Plugs are
// left alone, since anything could be plugged into them.
//
// The person can add, edit and delete scenes (views/scene-editor.js). Until they
// change something, SCENES is the built-in list; after that it's their list, saved
// with js/appdata.js (key "scenes": { v: 1, list }). SCENES is updated in place, so
// modules that imported it see the current list.

import { HOME } from './config.js';
import { store, userDevices, deviceEntities, deviceName, ensurePower } from './store.js';
import { productForDevice } from './catalog.js';
import { sleep, loadSettings, saveSettings } from './util.js';
import { loadData, saveData, cachedData, onData } from './appdata.js';
import { notifyNow } from './notify-links.js';

export const WARM = 2700;
export const NEUTRAL = 4000;
export const COOL = 5000;

// light: { pct, kelvin } or { pct, hs } or { pct, effect: [...names], hs: fallback } or 'off'
// tv / heater: true (on) or false (off); climate: target °C or 'off'; cover: 'open' | 'close'; lock: true
// vacuum: 'clean' (start) | 'dock' (back to its base if it's out); purifier: 'auto' | 'sleep' | 'max' | 'off';
// fan: false (off) or a speed in %; kettle: true (switch on)
const DEFAULT_SCENES = [
  { id: 'morning', name: 'Sabah', icon: 'sunrise', tone: 'var(--p-splash)', text: 'Parlak, soğuk ışık, perdeler açık, oda ısınıyor ve su ısıtıcı çalışıyor.',
    light: { pct: 80, kelvin: COOL }, heater: true, climate: 21, cover: 'open', kettle: true, purifier: 'auto' },
  { id: 'afternoon', name: 'Öğleden sonra', icon: 'sun', tone: 'var(--p-stlouis-2)', text: 'Gün ışığı gibi nötr ışık, perdeler açık, ısıtma 20°.',
    light: { pct: 70, kelvin: NEUTRAL }, climate: 20, cover: 'open' },
  { id: 'night', name: 'Akşam', icon: 'moon', tone: 'var(--p-denim)', text: 'Akşam için loş, sıcak ışık ve perdeler kapalı.',
    light: { pct: 35, kelvin: WARM }, climate: 20, cover: 'close' },
  { id: 'sleep', name: 'Uyku', icon: 'bed', tone: 'var(--p-sky)', text: 'Işıklar, TV ve ısıtıcı kapalı, perdeler kapalı, ısıtma 17°, kapı kilitli, hava temizleyici uyku modunda ve süpürge istasyonunda.',
    light: 'off', tv: false, heater: false, climate: 17, cover: 'close', lock: true, purifier: 'sleep', fan: false, vacuum: 'dock' },
  { id: 'eco', name: 'Eko', icon: 'leaf', tone: 'var(--p-seawash)', text: 'Enerji tasarrufu: ışıklar, TV, ısıtıcı ve vantilatör kapalı, ısıtma 18°.',
    light: 'off', tv: false, heater: false, climate: 18, fan: false },
  { id: 'party', name: 'Parti', icon: 'party', tone: 'var(--p-gentle)', text: 'Işıklar tam parlaklıkta, hareketli gökkuşağı efektiyle.',
    light: { pct: 100, effect: ['Rainbow', 'Candy Cane'], hs: [320, 85] } },
  { id: 'movie', name: 'Film', icon: 'film', tone: 'var(--p-denim)', text: 'TV açık, yumuşak mor ışık, perdeler kapalı; temizlik yapan süpürge istasyonuna döner.',
    light: { pct: 15, hs: [265, 90] }, tv: true, cover: 'close', vacuum: 'dock' },
  { id: 'entertainment', name: 'Eğlence', icon: 'gamepad', tone: 'var(--p-splash)', text: 'Oyun ve diziler için TV açık, serin mavi ışık.',
    light: { pct: 50, hs: [215, 80] } , tv: true },
  { id: 'music', name: 'Müzik', icon: 'music', tone: 'var(--p-mint)', text: 'Müzik dinlerken yavaş, renkli bir ışık gösterisi.',
    light: { pct: 60, effect: ['Aurora', 'Ocean'], hs: [185, 70] } },
  { id: 'dinner', name: 'Akşam yemeği', icon: 'dinner', tone: '#E9BE7C', text: 'Sıcak ve yeterince parlak ışık, TV kapalı, oda 21°; temizlik yapan süpürge istasyonuna döner.',
    light: { pct: 60, kelvin: WARM }, tv: false, climate: 21, vacuum: 'dock' },
  { id: 'away', name: 'Dışarıda', icon: 'door', tone: 'var(--p-stlouis)', text: 'Evden çıkarken: ışıklar, TV, ısıtıcı ve vantilatör kapalı, ısıtma 17°, kapı kilitli ve robot süpürge temizliğe başlar.',
    light: 'off', tv: false, heater: false, climate: 17, lock: true, fan: false, vacuum: 'clean' },
  { id: 'cleaning', name: 'Temizlik', icon: 'vacuum', tone: 'var(--p-seawash)', text: 'Robot süpürge temizliğe başlar, perdeler açılır ve hava temizleyici tam hızda çalışır.',
    vacuum: 'clean', cover: 'open', purifier: 'max' },
];

// ---- the person's scenes -------------------------------------------------------------

const clone = (x) => JSON.parse(JSON.stringify(x));
export const SCENES = DEFAULT_SCENES.map(clone);
const useList = (value) => {
  const list = Array.isArray(value?.list) ? value.list.filter((s) => s && s.id && s.name) : DEFAULT_SCENES;
  SCENES.splice(0, SCENES.length, ...list.map(clone));
};
useList(cachedData('scenes'));
onData('scenes', useList);

export const isDefaultScene = (id) => DEFAULT_SCENES.some((s) => s.id === id);
export const defaultScene = (id) => clone(DEFAULT_SCENES.find((s) => s.id === id) || null);
export const scenesCustomised = () => Array.isArray(cachedData('scenes')?.list);

/** The saved list from the backend (the built-in one until the person changes something). */
export async function loadScenes() {
  useList(await loadData('scenes'));
  return SCENES;
}
async function store_(list) { await saveData('scenes', { v: 1, list: list.map(clone) }); }
/** Adds a new scene or replaces the one with the same id. */
export async function saveScene(scene) {
  const list = SCENES.map(clone);
  const i = list.findIndex((s) => s.id === scene.id);
  if (i >= 0) list[i] = clone(scene); else list.push(clone(scene));
  await store_(list);
}
export async function deleteScene(id) { await store_(SCENES.filter((s) => s.id !== id)); }
/** Back to the built-in scenes (the person's own ones go). */
export async function resetScenes() { await saveData('scenes', null); }

// A sentence for a scene from its settings, when the person didn't write one.
export function describeScene(s) {
  const parts = [];
  const pct = (l) => (l.pct != null ? `%${l.pct} ` : '');
  if (s.light === 'off') parts.push('ışıklar kapalı');
  else if (s.light) {
    const l = s.light;
    const colour = HOME.colorPresets.find((p) => p.data.hs_color && l.hs && p.data.hs_color[0] === l.hs[0])?.name.toLocaleLowerCase('tr-TR');
    if (l.effect?.length) parts.push(`ışıklar ${pct(l)}${l.effect[0]} efektiyle`.replace('  ', ' '));
    else if (l.hs) parts.push(`ışıklar ${pct(l)}${colour || 'renkli'}`);
    else parts.push(`ışıklar ${pct(l)}${(l.kelvin || WARM) <= 3000 ? 'sıcak beyaz' : (l.kelvin || WARM) >= 5000 ? 'soğuk beyaz' : 'nötr beyaz'}`);
  }
  if (s.tv != null) parts.push(s.tv ? 'TV açık' : 'TV kapalı');
  if (s.heater != null) parts.push(s.heater ? 'ısıtıcı açık' : 'ısıtıcı kapalı');
  if (s.climate === 'off') parts.push('ısıtma kapalı'); else if (s.climate != null) parts.push(`ısıtma ${s.climate}°`);
  if (s.cover) parts.push(s.cover === 'open' ? 'perdeler açık' : 'perdeler kapalı');
  if (s.lock) parts.push('kapı kilitli');
  if (s.vacuum) parts.push(s.vacuum === 'clean' ? 'robot süpürge temizliğe başlar' : 'süpürge istasyonuna döner');
  if (s.purifier) parts.push({ auto: 'hava temizleyici otomatik', sleep: 'hava temizleyici uyku modunda', max: 'hava temizleyici tam hızda', off: 'hava temizleyici kapalı' }[s.purifier]);
  if (s.fan === false) parts.push('vantilatör kapalı'); else if (s.fan != null) parts.push(`vantilatör %${s.fan}`);
  if (s.kettle) parts.push('su ısıtıcı çalışır');
  if (!parts.length) return 'Henüz bir şey ayarlanmadı.';
  const text = parts.join(', ');
  return `${text.charAt(0).toLocaleUpperCase('tr-TR')}${text.slice(1)}.`;
}

// ---- which rooms each scene uses (kept on this device) -----------------------------

// 'all', or a list of room (area) IDs.
export function sceneRooms(sceneId) {
  return loadSettings().sceneRooms?.[sceneId] || 'all';
}
export function setSceneRooms(sceneId, rooms) {
  const all = { ...(loadSettings().sceneRooms || {}) };
  all[sceneId] = rooms;
  saveSettings({ sceneRooms: all });
}

// ---- what a scene would do -----------------------------------------------------

const dom = (id) => id.split('.')[0];
const colourModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];

function lightStep(entity, want) {
  const a = store.get(entity)?.attributes || {};
  const modes = a.supported_color_modes || [];
  if (want === 'off') return { data: null, service: 'turn_off', text: 'kapalı' };
  const data = {};
  const words = [];
  const dimmable = modes.length && !modes.every((m) => m === 'onoff');
  if (dimmable) { data.brightness_pct = want.pct; words.push(`${want.pct}%`); }
  const effect = want.effect?.find((e) => (a.effect_list || []).includes(e));
  if (effect) { data.effect = effect; words.push(`${effect} efekti`); }
  else if (want.hs && modes.some((m) => colourModes.includes(m))) { data.hs_color = want.hs; words.push('renkli'); }
  else if (dimmable && (modes.includes('color_temp') || modes.some((m) => colourModes.includes(m)))) {
    const k = want.kelvin || WARM;
    data.color_temp_kelvin = k;
    words.push(k <= 3000 ? 'sıcak beyaz' : k >= 5000 ? 'soğuk beyaz' : 'nötr beyaz');
  }
  return { data, service: 'turn_on', text: words.length ? words.join(', ') : 'açık' };
}

// The air purifier's own modes, when it has them; otherwise a fan speed does the job.
function purifierStep(id, want) {
  const presets = store.get(id)?.attributes?.preset_modes || [];
  const preset = (name, pct) => (presets.includes(name)
    ? { data: { preset_mode: name }, service: 'set_preset_mode' }
    : { data: { percentage: pct }, service: 'turn_on' });
  if (want === 'off') return { service: 'turn_off', data: {}, text: 'kapalı' };
  if (want === 'sleep') return { ...preset('Sleep', 20), text: 'uyku modu' };
  if (want === 'max') return { service: 'turn_on', data: { percentage: 100 }, text: 'tam hız' };
  return { ...preset('Auto', 50), text: 'otomatik' };
}

// The steps a scene takes in the chosen rooms: [{ icon, device, text, run }].
export function planScene(scene, rooms = sceneRooms(scene.id)) {
  const inRooms = (d) => rooms === 'all' || rooms.includes(d.area_id);
  const steps = [];
  const devices = userDevices().filter(inRooms);
  for (const d of devices) {
    const ents = deviceEntities(d.id);
    const ids = ents.filter((e) => !e.entity_category && !e.hidden_by && store.get(e.entity_id)).map((e) => e.entity_id);
    const name = deviceName(d);
    // The IR kit set up for this home: TV and heater. (Its buttons are often
    // hidden in Home Assistant, since the app shows them as remotes.)
    const all = ents.map((e) => e.entity_id);
    if (all.includes(HOME.tv?.buttons?.power) || all.includes(HOME.heater?.buttons?.power)) {
      if (scene.tv != null && store.get(HOME.tv.buttons.power)) steps.push({ icon: 'tv', device: 'TV', text: scene.tv ? 'açık' : 'kapalı', run: () => ensurePower('tv', scene.tv), ir: true });
      if (scene.heater != null && store.get(HOME.heater.buttons.power)) steps.push({ icon: 'heater', device: 'Isıtıcı', text: scene.heater ? 'açık' : 'kapalı', run: () => ensurePower('heater', scene.heater), ir: true });
    }
    const product = productForDevice(d)?.id;
    for (const id of ids) {
      const d0 = dom(id);
      if (d0 === 'vacuum' && scene.vacuum) {
        const st = store.get(id)?.state;
        if (scene.vacuum === 'clean' && st !== 'cleaning') steps.push({ icon: 'vacuum', device: name, text: 'temizliğe başlar', run: () => store.call('vacuum', 'start', id) });
        if (scene.vacuum === 'dock' && ['cleaning', 'paused', 'idle', 'returning'].includes(st)) steps.push({ icon: 'vacuum', device: name, text: 'istasyona döner', run: () => store.call('vacuum', 'return_to_base', id) });
      } else if (d0 === 'fan' && product === 'air-purifier') {
        if (scene.purifier) {
          const s = purifierStep(id, scene.purifier);
          steps.push({ icon: 'air', device: name, text: s.text, run: () => store.call('fan', s.service, id, s.data) });
        }
      } else if (d0 === 'fan' && scene.fan != null) {
        steps.push(scene.fan === false
          ? { icon: 'fan', device: name, text: 'kapalı', run: () => store.call('fan', 'turn_off', id) }
          : { icon: 'fan', device: name, text: `%${scene.fan}`, run: () => store.call('fan', 'turn_on', id, { percentage: scene.fan }) });
      } else if (d0 === 'switch' && product === 'smart-kettle' && scene.kettle) {
        steps.push({ icon: 'kettle', device: name, text: 'çalışır', run: () => store.call('switch', 'turn_on', id) });
      } else if (d0 === 'light' && scene.light) {
        const s = lightStep(id, scene.light);
        steps.push({ icon: 'bulb', device: name, text: s.text, run: () => store.call('light', s.service, id, s.data || {}) });
      } else if (d0 === 'climate' && scene.climate != null) {
        steps.push(scene.climate === 'off'
          ? { icon: 'thermostat', device: name, text: 'kapalı', run: () => store.call('climate', 'turn_off', id) }
          : { icon: 'thermostat', device: name, text: `${scene.climate}°`, run: () => store.call('climate', 'set_temperature', id, { temperature: scene.climate }) });
      } else if (d0 === 'cover' && scene.cover) {
        steps.push({ icon: 'blind', device: name, text: scene.cover === 'open' ? 'açık' : 'kapalı', run: () => store.call('cover', scene.cover === 'open' ? 'open_cover' : 'close_cover', id) });
      } else if (d0 === 'lock' && scene.lock) {
        steps.push({ icon: 'lock', device: name, text: 'kilitli', run: () => store.call('lock', 'lock', id) });
      }
    }
  }
  return steps;
}

// Runs a scene. IR codes need a short gap between them or the receiver misses one.
export async function runScene(scene, rooms = sceneRooms(scene.id)) {
  const steps = planScene(scene, rooms);
  let lastIr = false;
  let failed = 0;
  for (const step of steps) {
    if (step.ir && lastIr) await sleep(600);
    try { await step.run(); } catch { failed++; }
    lastIr = !!step.ir;
  }
  saveSettings({ lastScene: { id: scene.id, at: Date.now() } });
  // A scene with its notification on (Bildirimler, or the scene editor) tells everyone.
  if (scene.notify?.on) notifyNow(scene.name, scene.notify.message || `${scene.name} sahnesi açıldı`);
  return { steps: steps.length, failed };
}
