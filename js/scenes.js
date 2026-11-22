// Scenes: one tap sets a mood across the chosen rooms. Each scene says what
// lights, the TV and heater (through the IR kit), radiator valves, blinds and
// the door lock should do; only devices in the chosen rooms are touched. Plugs
// are left alone, since anything could be plugged into them.

import { HOME } from './config.js';
import { store, userDevices, deviceEntities, deviceName, ensurePower } from './store.js';
import { sleep, loadSettings, saveSettings } from './util.js';

const WARM = 2700;
const NEUTRAL = 4000;
const COOL = 5000;

// light: { pct, kelvin } or { pct, hs } or { pct, effect: [...names], hs: fallback } or 'off'
// tv / heater: true (on) or false (off); climate: target °C or 'off'; cover: 'open' | 'close'; lock: true
export const SCENES = [
  { id: 'morning', name: 'Morning', icon: 'sunrise', tone: '#9ED5FD', text: 'Bright, cool light, blinds open and the room warming up.',
    light: { pct: 80, kelvin: COOL }, heater: true, climate: 21, cover: 'open' },
  { id: 'afternoon', name: 'Afternoon', icon: 'sun', tone: '#CFDBE7', text: 'Neutral daylight-style light and blinds open, heating at 20°.',
    light: { pct: 70, kelvin: NEUTRAL }, climate: 20, cover: 'open' },
  { id: 'night', name: 'Night', icon: 'moon', tone: '#B3C6EA', text: 'Dim, warm light for the evening and blinds closed.',
    light: { pct: 35, kelvin: WARM }, climate: 20, cover: 'close' },
  { id: 'sleep', name: 'Sleep', icon: 'bed', tone: '#9AAFDD', text: 'Lights, TV and heater off, blinds closed, heating down to 17° and the door locked.',
    light: 'off', tv: false, heater: false, climate: 17, cover: 'close', lock: true },
  { id: 'eco', name: 'Eco', icon: 'leaf', tone: '#B3C6B3', text: 'Saves energy: lights, TV and heater off, heating down to 18°.',
    light: 'off', tv: false, heater: false, climate: 18 },
  { id: 'party', name: 'Party', icon: 'party', tone: '#B8CBE4', text: 'Lights on full with a moving rainbow effect.',
    light: { pct: 100, effect: ['Rainbow', 'Candy Cane'], hs: [320, 85] } },
  { id: 'movie', name: 'Movie', icon: 'film', tone: '#B3C6EA', text: 'TV on, a soft purple glow and blinds closed.',
    light: { pct: 15, hs: [265, 90] }, tv: true, cover: 'close' },
  { id: 'entertainment', name: 'Entertainment', icon: 'gamepad', tone: '#9ED5FD', text: 'TV on with cool blue light for games and shows.',
    light: { pct: 50, hs: [215, 80] } , tv: true },
  { id: 'music', name: 'Music', icon: 'music', tone: '#DAE7D1', text: 'A slow, colourful light show to listen to music by.',
    light: { pct: 60, effect: ['Aurora', 'Ocean'], hs: [185, 70] } },
  { id: 'dinner', name: 'Dinner', icon: 'dinner', tone: '#E9BE7C', text: 'Warm, bright-enough light, TV off and the room at 21°.',
    light: { pct: 60, kelvin: WARM }, tv: false, climate: 21 },
];

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
  if (want === 'off') return { data: null, service: 'turn_off', text: 'off' };
  const data = {};
  const words = [];
  const dimmable = modes.length && !modes.every((m) => m === 'onoff');
  if (dimmable) { data.brightness_pct = want.pct; words.push(`${want.pct}%`); }
  const effect = want.effect?.find((e) => (a.effect_list || []).includes(e));
  if (effect) { data.effect = effect; words.push(`${effect} effect`); }
  else if (want.hs && modes.some((m) => colourModes.includes(m))) { data.hs_color = want.hs; words.push('colour'); }
  else if (dimmable && (modes.includes('color_temp') || modes.some((m) => colourModes.includes(m)))) {
    const k = want.kelvin || WARM;
    data.color_temp_kelvin = k;
    words.push(k <= 3000 ? 'warm white' : k >= 5000 ? 'cool white' : 'neutral white');
  }
  return { data, service: 'turn_on', text: words.length ? words.join(', ') : 'on' };
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
      if (scene.tv != null && store.get(HOME.tv.buttons.power)) steps.push({ icon: 'tv', device: 'TV', text: scene.tv ? 'on' : 'off', run: () => ensurePower('tv', scene.tv), ir: true });
      if (scene.heater != null && store.get(HOME.heater.buttons.power)) steps.push({ icon: 'heater', device: 'Heater', text: scene.heater ? 'on' : 'off', run: () => ensurePower('heater', scene.heater), ir: true });
    }
    for (const id of ids) {
      const d0 = dom(id);
      if (d0 === 'light' && scene.light) {
        const s = lightStep(id, scene.light);
        steps.push({ icon: 'bulb', device: name, text: s.text, run: () => store.call('light', s.service, id, s.data || {}) });
      } else if (d0 === 'climate' && scene.climate != null) {
        steps.push(scene.climate === 'off'
          ? { icon: 'thermostat', device: name, text: 'off', run: () => store.call('climate', 'turn_off', id) }
          : { icon: 'thermostat', device: name, text: `${scene.climate}°`, run: () => store.call('climate', 'set_temperature', id, { temperature: scene.climate }) });
      } else if (d0 === 'cover' && scene.cover) {
        steps.push({ icon: 'blind', device: name, text: scene.cover === 'open' ? 'open' : 'closed', run: () => store.call('cover', scene.cover === 'open' ? 'open_cover' : 'close_cover', id) });
      } else if (d0 === 'lock' && scene.lock) {
        steps.push({ icon: 'lock', device: name, text: 'locked', run: () => store.call('lock', 'lock', id) });
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
  return { steps: steps.length, failed };
}
