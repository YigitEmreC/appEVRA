// Automation ideas: what the Evra range can do when products work together.
//
// Each idea lists the kinds of device it needs ("needs") and, sometimes, ones
// that make it better ("optional"). An idea whose needs are all in the home is
// ready: "Set it up" opens the automation editor filled in with the home's real
// devices. The others show which products are missing.

import { HOME } from './config.js';
import { store, userDevices, deviceEntities, deviceName, areaName } from './store.js';
import { productForDevice } from './catalog.js';

// ---- what devices can do, and which catalogue products do it ------------------

export const CAPS = {
  motion: { name: 'Motion sensor', icon: 'person', products: ['motion', 'presence'] },
  presence: { name: 'Presence sensor (radar)', icon: 'radar', products: ['presence'] },
  contact: { name: 'Door or window sensor', icon: 'door', products: ['contact'] },
  climate: { name: 'Temperature sensor', icon: 'thermometer', products: ['climate-sensor', 'co2'] },
  co2: { name: 'CO₂ sensor', icon: 'air', products: ['co2'] },
  light: { name: 'Smart light', icon: 'bulb', products: ['led-strip', 'bulb', 'wall-switch'] },
  colour: { name: 'Colour light', icon: 'bulb', products: ['led-strip', 'bulb'] },
  plug: { name: 'Smart plug', icon: 'plug', products: ['plug', 'zigbee-plug'] },
  power: { name: 'Energy-metering plug', icon: 'bolt', products: ['plug', 'zigbee-plug', 'energy-meter'] },
  tv: { name: 'TV remote (IR kit)', icon: 'tv', products: ['ir-kit'] },
  heater: { name: 'Heater remote (IR kit)', icon: 'heater', products: ['ir-kit'] },
  trv: { name: 'Radiator valve or thermostat', icon: 'thermostat', products: ['trv', 'thermostat'] },
  boiler: { name: 'Boiler relay', icon: 'toggle', products: ['boiler-relay'] },
  smoke: { name: 'Smoke detector', icon: 'smoke', products: ['smoke'] },
  gas: { name: 'Gas detector', icon: 'alert', products: ['gas'] },
  leak: { name: 'Water leak sensor', icon: 'droplet', products: ['leak'] },
  waterValve: { name: 'Main water valve', icon: 'valve', products: ['water-valve'] },
  siren: { name: 'Indoor siren', icon: 'siren', products: ['siren'] },
  sos: { name: 'Emergency button', icon: 'sos', products: ['sos'] },
  camera: { name: 'Indoor camera', icon: 'camera', products: ['camera-indoor'] },
  outdoorCam: { name: 'Outdoor camera', icon: 'camera', products: ['camera-outdoor'] },
  lock: { name: 'Smart door lock', icon: 'lock', products: ['lock'] },
  cover: { name: 'Blind or curtain motor', icon: 'blind', products: ['blind-chain', 'blind-tube', 'curtain', 'shutter'] },
  irrigation: { name: 'Irrigation valve', icon: 'sprout', products: ['irrigation'] },
};

export const CATEGORIES = ['Lighting', 'Comfort', 'Entertainment', 'Energy', 'Safety', 'Security', 'Garden'];

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
        // The IR kit can only work the TV or heater once their codes are learned.
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

const KELVIN_WARM = 2700; // the editor's "Warm white" preset
const KELVIN_COOL = 5500; // its "Cool white" preset
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
const urgent = (title, message) => [note(title, message), { action: 'notify.notify', data: { title, message } }];
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

// Only press a toggle-style power code when the tracker says it's in the other state.
function powerIf(device, wantOn) {
  const cfg = HOME[device];
  return { condition: is(cfg.tracker, wantOn ? 'off' : 'on'), action: press(cfg.buttons.power) };
}

// ---- the ideas ---------------------------------------------------------------------------
//
// build(x) gets the chosen devices: x.motion, x.light ... (entity IDs), x.room
// (room name for messages) and x.has(cap) for optional extras.

export const IDEAS = [
  // ---- lighting
  {
    id: 'welcome-light', category: 'Lighting', icon: 'bulb', needs: ['motion', 'light'],
    title: 'Light on when you walk in after dark',
    text: 'When the motion sensor sees someone after sunset, the light comes on in warm white.',
    build: (x) => ({ alias: 'Welcome light after dark', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [dark(), between('16:00', '23:30')], actions: [lightOn(x.light, 70)] }),
  },
  {
    id: 'empty-room-off', category: 'Lighting', icon: 'bulb', needs: ['motion', 'light'],
    title: 'Lights off when the room is empty',
    text: 'Nobody seen for 10 minutes: the light switches off by itself.',
    build: (x) => ({ alias: 'Lights off in an empty room', mode: 'single', triggers: [when(x.motion, 'off', 10)], conditions: [is(x.light, 'on')], actions: [act(x.light, 'turn_off')] }),
  },
  {
    id: 'night-path', category: 'Lighting', icon: 'moon', needs: ['motion', 'light'],
    title: 'Soft night light for late-night trips',
    text: 'Between midnight and 6:00, movement turns the light on at 10% for two minutes, so nobody is dazzled.',
    build: (x) => ({ alias: 'Night path light', mode: 'restart', triggers: [when(x.motion, 'on')], conditions: [between('00:00', '06:00')], actions: [lightOn(x.light, 10), wait(120), act(x.light, 'turn_off')] }),
  },
  {
    id: 'sunset-lights', category: 'Lighting', icon: 'sun', needs: ['light'],
    title: 'Lights on at sunset',
    text: 'A quarter of an hour before sunset, the light comes on in warm white, whatever the season.',
    build: (x) => ({ alias: 'Lights on at sunset', mode: 'single', triggers: [sun('sunset', -15)], conditions: [], actions: [lightOn(x.light, 60)] }),
  },
  {
    id: 'wake-up-light', category: 'Lighting', icon: 'sun', needs: ['light'],
    title: 'Wake-up light on weekdays',
    text: 'At 7:00 on weekdays the light starts dim and warm, then turns bright and cool five minutes later.',
    build: (x) => ({ alias: 'Wake-up light', mode: 'single', triggers: [at('07:00')], conditions: [between('06:00', '10:00', WEEKDAYS)], actions: [lightOn(x.light, 20), wait(300), lightOn(x.light, 100, KELVIN_COOL)] }),
  },
  {
    id: 'bedtime-lights', category: 'Lighting', icon: 'moon', needs: ['light'],
    title: 'Lights off at bedtime',
    text: 'At 00:30 any light still on switches off.',
    build: (x) => ({ alias: 'Lights off at bedtime', mode: 'single', triggers: [at('00:30')], conditions: [is(x.light, 'on')], actions: [act(x.light, 'turn_off')] }),
  },

  // ---- comfort
  {
    id: 'window-heater-off', category: 'Comfort', icon: 'window', needs: ['contact', 'heater'],
    title: 'Heater off when a window opens',
    text: 'A window open for two minutes switches the heater off, so you don\'t heat the street.',
    build: (x) => {
      const p = powerIf('heater', false);
      return { alias: 'Heater off while a window is open', mode: 'single', triggers: [when(x.contact, 'on', 2)], conditions: [p.condition], actions: [p.action, note('Heater off', `The heater was switched off because a window in ${x.room} is open.`)] };
    },
  },
  {
    id: 'cold-heater-on', category: 'Comfort', icon: 'heater', needs: ['climate', 'heater'], optional: ['contact'],
    title: 'Heater on when the room gets cold',
    text: 'Below 18° for ten minutes, the heater switches on (only with the window closed, if there\'s a window sensor).',
    build: (x) => {
      const p = powerIf('heater', true);
      return { alias: 'Heater on when cold', mode: 'single', triggers: [drops(x.climate, 18, 10)], conditions: [p.condition, ...(x.has('contact') ? [is(x.contact, 'off')] : [])], actions: [p.action] };
    },
  },
  {
    id: 'warm-heater-off', category: 'Comfort', icon: 'thermometer', needs: ['climate', 'heater'],
    title: 'Heater off when it\'s warm enough',
    text: 'Above 23° for five minutes, the heater switches off to save energy.',
    build: (x) => {
      const p = powerIf('heater', false);
      return { alias: 'Heater off when warm', mode: 'single', triggers: [rises(x.climate, 23, 5)], conditions: [p.condition], actions: [p.action] };
    },
  },
  {
    id: 'morning-warmup', category: 'Comfort', icon: 'flame', needs: ['heater'],
    title: 'Warm room before you get up',
    text: 'At 6:45 on weekdays the heater switches on, so the room is warm when the alarm goes.',
    build: () => {
      const p = powerIf('heater', true);
      return { alias: 'Morning warm-up', mode: 'single', triggers: [at('06:45')], conditions: [between('06:00', '10:00', WEEKDAYS), p.condition], actions: [p.action] };
    },
  },
  {
    id: 'heater-bedtime', category: 'Comfort', icon: 'moon', needs: ['heater'],
    title: 'Heater off at bedtime',
    text: 'At 23:30 the heater switches off if it\'s still running.',
    build: () => {
      const p = powerIf('heater', false);
      return { alias: 'Heater off at bedtime', mode: 'single', triggers: [at('23:30')], conditions: [p.condition], actions: [p.action] };
    },
  },
  {
    id: 'dry-air', category: 'Comfort', icon: 'droplet', needs: ['climate'],
    title: 'Dry air warning',
    text: 'Humidity under 35% for half an hour sends a reminder to air the room or use a humidifier.',
    build: (x) => ({ alias: 'Dry air warning', mode: 'single', triggers: [drops(x.humidity || x.climate, 35, 30)], conditions: [], actions: [note('Dry air', `Humidity in ${x.room} is below 35%. A humidifier, or a bowl of water near the heater, helps.`)] }),
  },
  {
    id: 'window-reminder', category: 'Comfort', icon: 'window', needs: ['contact'],
    title: 'Window left open reminder',
    text: 'A window open for 15 minutes sends a reminder.',
    build: (x) => ({ alias: 'Window left open', mode: 'single', triggers: [when(x.contact, 'on', 15)], conditions: [], actions: [note('Window open', `A window in ${x.room} has been open for 15 minutes.`)] }),
  },
  {
    id: 'rain-window', category: 'Comfort', icon: 'cloud', needs: ['contact'],
    title: 'Rain is starting and a window is open',
    text: 'Uses the weather forecast: when it turns rainy while a window is open, your phone gets a warning.',
    build: (x) => ({ alias: 'Rain with a window open', mode: 'single', triggers: [when(HOME.weather, 'rainy')], conditions: [is(x.contact, 'on')], actions: urgent('Rain and an open window', `It's starting to rain and a window in ${x.room} is open.`) }),
  },

  // ---- entertainment
  {
    id: 'tv-ambient', category: 'Entertainment', icon: 'tv', needs: ['tv', 'colour'],
    title: 'Movie light when the TV goes on',
    text: 'In the evening, switching the TV on dims the light to a soft purple.',
    build: (x) => ({ alias: 'Movie light with the TV', mode: 'single', triggers: [when(HOME.tv.tracker, 'on')], conditions: [dark()], actions: [lightOn(x.colour, 20, KELVIN_WARM, PURPLE)] }),
  },
  {
    id: 'tv-off-empty', category: 'Entertainment', icon: 'tv', needs: ['motion', 'tv'],
    title: 'TV off when nobody is watching',
    text: 'No movement for 30 minutes while the TV is on: it switches off.',
    build: (x) => {
      const p = powerIf('tv', false);
      return { alias: 'TV off when nobody is watching', mode: 'single', triggers: [when(x.motion, 'off', 30)], conditions: [p.condition], actions: [p.action] };
    },
  },

  // ---- energy
  {
    id: 'standby-killer', category: 'Energy', icon: 'bolt', needs: ['power'],
    title: 'Cut standby power',
    text: 'When what\'s on the plug uses under 2 W for half an hour, the plug switches off.',
    build: (x) => ({ alias: 'Cut standby power', mode: 'single', triggers: [drops(x.power, 2, 30)], conditions: [is(x.plugOfPower, 'on')], actions: [act(x.plugOfPower, 'turn_off')] }),
  },
  {
    id: 'appliance-done', category: 'Energy', icon: 'bell', needs: ['power'],
    title: 'Tell me when the appliance is done',
    text: 'When the plug\'s power drops below 5 W for three minutes, you get a notification: handy for a washing machine or kettle.',
    build: (x) => ({ alias: 'Appliance finished', mode: 'single', triggers: [drops(x.power, 5, 3)], conditions: [], actions: [note('Finished', `What's plugged into ${x.powerName} has finished.`)] }),
  },
  {
    id: 'plug-off-empty', category: 'Energy', icon: 'plug', needs: ['motion', 'plug'],
    title: 'Plug off when nobody is around',
    text: 'No movement for an hour switches the plug off: for a heater, iron or speakers left on.',
    build: (x) => ({ alias: 'Plug off when nobody is around', mode: 'single', triggers: [when(x.motion, 'off', 60)], conditions: [is(x.plug, 'on')], actions: [act(x.plug, 'turn_off')] }),
  },

  // ---- security (works now)
  {
    id: 'night-movement', category: 'Security', icon: 'person', needs: ['motion'],
    title: 'Movement alert at night',
    text: 'Movement between 1:00 and 6:00 sends an alert to your phone. Best for rooms nobody uses at night, or when you\'re away.',
    build: (x) => ({ alias: 'Movement at night', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [between('01:00', '06:00')], actions: urgent('Movement at night', `Movement in ${x.room}.`) }),
  },

  // ---- safety (need more products)
  {
    id: 'smoke-alarm', category: 'Safety', icon: 'smoke', needs: ['smoke'], optional: ['light', 'siren'],
    title: 'Smoke: alert everyone and light the way out',
    text: 'Smoke sends an urgent alert to the family\'s phones, turns every light on full and sounds the siren.',
    build: (x) => ({ alias: 'Smoke alarm', mode: 'single', triggers: [when(x.smoke, 'on')], conditions: [],
      actions: [...urgent('Smoke detected', `Smoke in ${x.room}. If there is a fire, call 112.`), ...x.all('light').map((l) => lightOn(l, 100, KELVIN_COOL)), ...(x.has('siren') ? [act(x.siren, 'turn_on')] : [])] }),
  },
  {
    id: 'gas-alarm', category: 'Safety', icon: 'alert', needs: ['gas'], optional: ['siren'],
    title: 'Gas leak alarm',
    text: 'Gas sends an urgent alert with what to do, and sounds the siren.',
    build: (x) => ({ alias: 'Gas leak alarm', mode: 'single', triggers: [when(x.gas, 'on')], conditions: [],
      actions: [...urgent('Gas detected', `Gas in ${x.room}. No flames, don't touch switches, open the windows and call 187.`), ...(x.has('siren') ? [act(x.siren, 'turn_on')] : [])] }),
  },
  {
    id: 'leak-alert', category: 'Safety', icon: 'droplet', needs: ['leak'],
    title: 'Water leak alert',
    text: 'Water under the washing machine or sink sends an urgent alert to your phone.',
    build: (x) => ({ alias: 'Water leak alert', mode: 'single', triggers: [when(x.leak, 'on')], conditions: [], actions: urgent('Water leak', `Water detected in ${x.room}.`) }),
  },
  {
    id: 'leak-shutoff', category: 'Safety', icon: 'valve', needs: ['leak', 'waterValve'],
    title: 'Shut the water off on a leak',
    text: 'The moment the leak sensor gets wet, the main water valve closes and you\'re told.',
    build: (x) => ({ alias: 'Shut the water on a leak', mode: 'single', triggers: [when(x.leak, 'on')], conditions: [], actions: [act(x.waterValve, 'close_valve'), ...urgent('Water shut off', `A leak was detected in ${x.room}, so the main water valve was closed.`)] }),
  },
  {
    id: 'sos-alert', category: 'Safety', icon: 'sos', needs: ['sos'], optional: ['light'],
    title: 'Emergency button alerts the family',
    text: 'A press of the emergency button sends an urgent alert and turns the lights on, so helpers can see.',
    build: (x) => ({ alias: 'Emergency button pressed', mode: 'single', triggers: [when(x.sos, null)], conditions: [],
      actions: [...urgent('Emergency button', `The emergency button in ${x.room} was pressed.`), ...x.all('light').map((l) => lightOn(l, 100, KELVIN_COOL))] }),
  },
  {
    id: 'inactivity', category: 'Safety', icon: 'radar', needs: ['presence'],
    title: 'No movement for 12 hours',
    text: 'For a relative living alone: if the radar sees nobody for 12 hours, the family is alerted.',
    build: (x) => ({ alias: 'No movement for 12 hours', mode: 'single', triggers: [when(x.presence, 'off', 720)], conditions: [], actions: urgent('No movement', `Nobody has been seen in ${x.room} for 12 hours.`) }),
  },
  {
    id: 'co2-air', category: 'Comfort', icon: 'air', needs: ['co2'],
    title: 'Time to air the room',
    text: 'CO₂ above 1,200 ppm for ten minutes sends a reminder to open a window.',
    build: (x) => ({ alias: 'Air the room', mode: 'single', triggers: [rises(x.co2, 1200, 10)], conditions: [], actions: [note('Stuffy air', `CO₂ in ${x.room} is above 1,200 ppm. Open a window for a few minutes.`)] }),
  },
  {
    id: 'co2-fresh', category: 'Comfort', icon: 'window', needs: ['co2', 'contact'],
    title: 'Fresh again: close the window',
    text: 'While a window is open, CO₂ dropping below 600 ppm tells you the air is fresh and you can close it.',
    build: (x) => ({ alias: 'Air is fresh again', mode: 'single', triggers: [drops(x.co2, 600)], conditions: [is(x.contact, 'on')], actions: [note('Fresh air', `The air in ${x.room} is fresh again. You can close the window.`)] }),
  },
  {
    id: 'trv-window', category: 'Comfort', icon: 'thermostat', needs: ['contact', 'trv'],
    title: 'Radiator closes while a window is open',
    text: 'A window open for a minute turns the radiator valve off, so heat doesn\'t escape.',
    build: (x) => ({ alias: 'Radiator off while a window is open', mode: 'single', triggers: [when(x.contact, 'on', 1)], conditions: [], actions: [act(x.trv, 'turn_off')] }),
  },
  {
    id: 'trv-empty', category: 'Energy', icon: 'thermostat', needs: ['motion', 'trv'],
    title: 'Lower heating in empty rooms',
    text: 'Nobody seen for 30 minutes: the radiator drops to 17°.',
    build: (x) => ({ alias: 'Lower heating in an empty room', mode: 'single', triggers: [when(x.motion, 'off', 30)], conditions: [], actions: [act(x.trv, 'set_temperature', { temperature: 17 })] }),
  },
  {
    id: 'boiler-cold', category: 'Comfort', icon: 'toggle', needs: ['climate', 'boiler'],
    title: 'Boiler heats when the room is cold',
    text: 'Below 19° for ten minutes, the boiler relay switches the heating on.',
    build: (x) => ({ alias: 'Boiler on when cold', mode: 'single', triggers: [drops(x.climate, 19, 10)], conditions: [], actions: [act(x.boiler, 'turn_on')] }),
  },

  // ---- covers
  {
    id: 'blinds-sunset', category: 'Lighting', icon: 'blind', needs: ['cover'],
    title: 'Close the blinds at sunset',
    text: 'At sunset the blinds or curtains close by themselves.',
    build: (x) => ({ alias: 'Close blinds at sunset', mode: 'single', triggers: [sun('sunset')], conditions: [], actions: x.all('cover').map((c) => act(c, 'close_cover')) }),
  },
  {
    id: 'blinds-morning', category: 'Lighting', icon: 'blind', needs: ['cover'],
    title: 'Open the blinds in the morning',
    text: 'At 7:30 on weekdays the blinds open slowly to let daylight in.',
    build: (x) => ({ alias: 'Open blinds in the morning', mode: 'single', triggers: [at('07:30')], conditions: [between('06:00', '10:00', WEEKDAYS)], actions: x.all('cover').map((c) => act(c, 'open_cover')) }),
  },
  {
    id: 'blinds-heat', category: 'Comfort', icon: 'sun', needs: ['cover', 'climate'],
    title: 'Close the blinds when it gets hot',
    text: 'Above 26° in daylight, the blinds close to keep the sun out.',
    build: (x) => ({ alias: 'Blinds down in the heat', mode: 'single', triggers: [rises(x.climate, 26, 15)], conditions: [is('sun.sun', 'above_horizon')], actions: x.all('cover').map((c) => act(c, 'close_cover')) }),
  },

  // ---- security (need more products)
  {
    id: 'auto-lock', category: 'Security', icon: 'lock', needs: ['lock'],
    title: 'Lock the door at night',
    text: 'At 23:00 the front door locks if it isn\'t already.',
    build: (x) => ({ alias: 'Lock the door at night', mode: 'single', triggers: [at('23:00')], conditions: [is(x.lock, 'unlocked')], actions: [act(x.lock, 'lock')] }),
  },
  {
    id: 'unlocked-reminder', category: 'Security', icon: 'lock', needs: ['lock'],
    title: 'Door left unlocked',
    text: 'Unlocked for ten minutes: the door locks itself and you\'re told.',
    build: (x) => ({ alias: 'Door left unlocked', mode: 'single', triggers: [when(x.lock, 'unlocked', 10)], conditions: [], actions: [act(x.lock, 'lock'), note('Door locked', 'The front door was unlocked for 10 minutes, so it was locked.')] }),
  },
  {
    id: 'leaving-home', category: 'Energy', icon: 'lock', needs: ['lock', 'light'], optional: ['plug'],
    title: 'Everything off when you leave',
    text: 'Locking the door during the day switches the lights off (and the plug, if you have one).',
    build: (x) => ({ alias: 'Everything off when leaving', mode: 'single', triggers: [when(x.lock, 'locked')], conditions: [between('07:00', '20:00')],
      actions: [...x.all('light').map((l) => act(l, 'turn_off')), ...(x.has('plug') ? [act(x.plug, 'turn_off')] : [])] }),
  },
  {
    id: 'away-siren', category: 'Security', icon: 'siren', needs: ['motion', 'lock', 'siren'],
    title: 'Siren for movement while you\'re out',
    text: 'On weekdays 9:00 to 17:00, movement while the door is locked sounds the siren and alerts you.',
    build: (x) => ({ alias: 'Intruder siren', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [is(x.lock, 'locked'), between('09:00', '17:00', WEEKDAYS)],
      actions: [act(x.siren, 'turn_on'), ...urgent('Movement while you\'re out', `Movement in ${x.room} while the door is locked.`)] }),
  },
  {
    id: 'camera-privacy', category: 'Security', icon: 'camera', needs: ['camera', 'motion'],
    title: 'Camera looks away when you\'re home',
    text: 'Movement at home switches the indoor camera to privacy mode, closing its lens.',
    build: (x) => ({ alias: 'Camera privacy when home', mode: 'single', triggers: [when(x.motion, 'on')], conditions: [is(x.camera, 'off')], actions: [act(x.camera, 'turn_on')] }),
  },
  {
    id: 'doorstep-light', category: 'Security', icon: 'camera', needs: ['outdoorCam', 'light'],
    title: 'Light and alert for someone at the door',
    text: 'After dark, the outdoor camera seeing someone turns a light on for three minutes and sends an alert.',
    build: (x) => ({ alias: 'Someone at the door', mode: 'restart', triggers: [when(x.outdoorCam, 'on')], conditions: [dark()],
      actions: [note('Someone outside', 'The outdoor camera saw someone.'), lightOn(x.light, 100, KELVIN_COOL), wait(180), act(x.light, 'turn_off')] }),
  },

  // ---- garden
  {
    id: 'garden-water', category: 'Garden', icon: 'sprout', needs: ['irrigation'],
    title: 'Water the plants every morning',
    text: 'At 7:00 the irrigation valve opens for 15 minutes.',
    build: (x) => ({ alias: 'Morning watering', mode: 'single', triggers: [at('07:00')], conditions: [], actions: [act(x.irrigation, 'open_valve'), wait(900), act(x.irrigation, 'close_valve')] }),
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
    room: (first && areaName(first.device.area_id)) || 'the home',
    humidity: (have.humidity || []).find((v) => v.device.area_id === first?.device.area_id)?.entity || have.humidity?.[0]?.entity,
    // The switch on the same plug as the power reading.
    plugOfPower: powerDevice ? mainEntities(powerDevice).find(FIND.plug) : null,
    powerName: powerDevice ? deviceName(powerDevice) : 'the plug',
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
