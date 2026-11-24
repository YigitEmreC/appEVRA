// Device cards: one renderer that gives every kind of product the right
// controls. Kind comes from the catalogue product, or is guessed from the
// device's entities for devices that aren't in the catalogue.

import { HOME } from '../config.js';
import { productForDevice } from '../catalog.js';
import { store, ensurePower, setTracker, deviceEntities, deviceName } from '../store.js';
import { h, num, numVal, dec, relTime, isOn, isAvailable, lightCss, cssLuminance, hexToHs, loadSettings, isDev } from '../util.js';
import { icon } from '../icons.js';
import { toggle, slider, irButton, deviceCard, sparkline } from '../components.js';

// Evra palette: Kawaii Sky Blue #9AAFDD, Splashy Blue #9ED5FD, Pastel Denim #B3C6EA,
// Gentle Blue #B8CBE4, St. Louis #CFDBE7 / #CDD7F0, Sea Wash Green #B3C6B3,
// Light Neutral Green #DAE7D1. Heating stays warm amber, alarms stay red.
const HEAT = '#E9BE7C';
const ALARM = '#F27D89';
// Pastels refer to the --p-* tokens so colour themes (js/themes.js) recolour the tiles.
const TONES = {
  plug: 'var(--p-seawash)', relay: HEAT, cover: 'var(--p-denim)', climate: HEAT, lock: 'var(--p-seawash)', valve: 'var(--p-splash)',
  siren: ALARM, camera: 'var(--p-stlouis-2)', motion: 'var(--p-sky)', presence: 'var(--p-sky)', contact: 'var(--p-gentle)', alarm: ALARM,
  button: ALARM, co2: 'var(--p-seawash)', ir: 'var(--p-splash)', 'climate-sensor': 'var(--p-mint)', generic: 'var(--p-stlouis)',
  vacuum: 'var(--p-sky)', fan: 'var(--p-splash)', feeder: 'var(--p-seawash)', litter: 'var(--p-gentle)', kettle: HEAT,
};
const KIND_ICON = {
  light: 'bulb', plug: 'plug', relay: 'toggle', cover: 'blind', climate: 'thermostat', lock: 'lock', valve: 'valve', siren: 'siren',
  camera: 'camera', motion: 'person', presence: 'radar', contact: 'door', smoke: 'smoke', gas: 'alert', leak: 'droplet',
  button: 'sos', 'climate-sensor': 'thermometer', co2: 'air', ir: 'remote', generic: 'devices', info: 'devices', hub: 'cpu',
  vacuum: 'vacuum', fan: 'fan', feeder: 'paw', litter: 'litter', kettle: 'kettle',
};

// ---- picking entities --------------------------------------------------------

function entityList(deviceId) {
  return deviceEntities(deviceId).map((e) => e.entity_id);
}
function pick(ids, test) {
  const blank = { state: 'unavailable', attributes: {} };
  return ids.find((id) => test(id, store.get(id) || blank, store.entities.get(id))) || null;
}
const main = (id, s, e) => !e?.entity_category;
const domainOf = (id) => id.split('.')[0];
const dc = (s) => s.attributes.device_class;

export function kindOf(device) {
  const product = productForDevice(device);
  if (product) return product.kind;
  const ids = entityList(device.id);
  const has = (test) => !!pick(ids, test);
  if (has((id) => domainOf(id) === 'light')) return 'light';
  if (has((id) => domainOf(id) === 'cover')) return 'cover';
  if (has((id) => domainOf(id) === 'climate')) return 'climate';
  if (has((id) => domainOf(id) === 'lock')) return 'lock';
  if (has((id) => domainOf(id) === 'valve')) return 'valve';
  if (has((id) => domainOf(id) === 'siren')) return 'siren';
  if (has((id) => domainOf(id) === 'camera')) return 'camera';
  if (has((id) => domainOf(id) === 'vacuum')) return 'vacuum';
  if (has((id) => domainOf(id) === 'fan')) return 'fan';
  if (has((id, s) => domainOf(id) === 'switch' && main(id, s, store.entities.get(id))) && has((id, s) => dc(s) === 'power')) return 'plug';
  if (has((id, s, e) => domainOf(id) === 'switch' && main(id, s, e))) return 'relay';
  if (has((id, s) => dc(s) === 'smoke')) return 'smoke';
  if (has((id, s) => dc(s) === 'gas')) return 'gas';
  if (has((id, s) => dc(s) === 'moisture')) return 'leak';
  if (has((id, s) => ['occupancy', 'presence', 'motion'].includes(dc(s)))) return 'motion';
  if (has((id, s) => ['opening', 'door', 'window', 'garage_door'].includes(dc(s)))) return 'contact';
  if (has((id, s) => dc(s) === 'carbon_dioxide')) return 'co2';
  if (has((id, s) => dc(s) === 'temperature' && domainOf(id) === 'sensor')) return 'climate-sensor';
  if (has((id, s, e) => domainOf(id) === 'button' && main(id, s, e))) return 'ir';
  return 'generic';
}

export function kindIcon(device) {
  const p = productForDevice(device);
  return p?.icon || KIND_ICON[kindOf(device)] || 'devices';
}

// ---- shared bits ----------------------------------------------------------------

function footer(device, ids, cleanup, extra = []) {
  const batt = pick(ids, (id, s) => dc(s) === 'battery');
  const battEl = h('span', { class: 'muted small batt' });
  if (batt) {
    cleanup.push(store.watch(batt, (s) => {
      const v = numVal(s);
      battEl.replaceChildren(icon('battery', 15), isAvailable(s) ? `%${num(s, 0)}` : '–');
      battEl.classList.toggle('low', v != null && v < 20);
    }));
  }
  return h('div', { class: 'card-foot' }, extra, batt ? battEl : null, h('span', { class: 'sep' }),
    h('a', { class: 'link subtle', href: `#/devices/${encodeURIComponent(device.id)}` }, 'Ayrıntılar', icon('right', 14)));
}

// Demo mode, developer mode only: a button to pretend the sensor fired.
function simulateButton(entityId, label) {
  if (store.backend?.mode !== 'demo' || !entityId) return null;
  return h('button', { class: 'btn mini-btn dev-only', type: 'button', onclick: () => store.backend.simulate.trigger(entityId) }, icon('sparkle', 14), label);
}

// ---- the renderer ------------------------------------------------------------------

export function deviceCardFor(device, cleanup) {
  const kind = kindOf(device);
  const product = productForDevice(device);
  const ids = entityList(device.id);
  const ctx = { device, product, ids, cleanup, title: deviceName(device), iconName: product?.icon || KIND_ICON[kind] || 'devices' };
  const build = BUILDERS[kind] || BUILDERS.generic;
  const el = build(ctx);
  el.dataset.device = device.id;
  return el;
}

const BUILDERS = {
  light: lightCard,
  plug: plugCard,
  relay: relayCard,
  cover: coverCard,
  climate: climateCard,
  lock: lockCard,
  valve: valveCard,
  siren: sirenCard,
  camera: cameraCard,
  motion: (c) => sensorCard(c, 'motion'),
  presence: (c) => sensorCard(c, 'motion'),
  contact: (c) => sensorCard(c, 'contact'),
  smoke: (c) => alarmCard(c, 'smoke', 'Duman algılandı'),
  gas: (c) => alarmCard(c, 'gas', 'Gaz algılandı'),
  leak: (c) => alarmCard(c, 'moisture', 'Su algılandı'),
  button: buttonCard,
  'climate-sensor': climateSensorCard,
  co2: co2Card,
  ir: irCard,
  vacuum: vacuumCard,
  fan: fanCard,
  feeder: feederCard,
  litter: litterCard,
  kettle: kettleCard,
  generic: genericCard,
  info: genericCard,
  hub: genericCard,
};

// ---- lights -------------------------------------------------------------------------

function presetMatches(p, a) {
  if (p.data.hs_color && a.color_mode === 'hs' && Array.isArray(a.hs_color)) {
    const dh = Math.abs(((p.data.hs_color[0] - a.hs_color[0] + 540) % 360) - 180);
    return dh < 8 && Math.abs(p.data.hs_color[1] - a.hs_color[1]) < 15;
  }
  if (p.data.color_temp_kelvin && a.color_mode === 'color_temp' && a.color_temp_kelvin) {
    return Math.abs(p.data.color_temp_kelvin - a.color_temp_kelvin) < 400;
  }
  return false;
}

function lightCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'light');
  const sw = toggle(`${title} aç ya da kapat`, (on) => store.call('light', on ? 'turn_on' : 'turn_off', id));
  const s0 = store.get(id);
  const modes = s0?.attributes?.supported_color_modes || [];
  const dimmable = modes.some((m) => m !== 'onoff');
  const colour = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));
  const whites = modes.includes('color_temp') || colour;
  const bri = dimmable ? slider({ label: 'Parlaklık', min: 1, max: 100, onCommit: (v) => store.call('light', 'turn_on', id, { brightness_pct: v }) }) : null;
  const presets = HOME.colorPresets.filter((p) => (p.data.hs_color ? colour : whites));
  const swatchButtons = presets.map((p) => h('button', {
    class: 'swatch', type: 'button', title: p.name, 'aria-label': p.name, 'aria-pressed': 'false', style: { '--swatch': p.css },
    onclick: () => store.call('light', 'turn_on', id, p.data),
  }));
  const swatches = presets.length ? h('div', { class: 'swatches' }, swatchButtons,
    colour ? h('label', { class: 'swatch custom', title: 'İstediğiniz rengi seçin' }, icon('plus', 16),
      h('input', { type: 'color', 'aria-label': 'İstediğiniz rengi seçin', onchange: (e) => { const hs = hexToHs(e.target.value); if (hs) store.call('light', 'turn_on', id, { hs_color: hs }); } })) : null) : null;
  const effect = s0?.attributes?.effect_list?.length
    ? h('select', { class: 'select', 'aria-label': 'Işık efekti', onchange: (e) => store.call('light', 'turn_on', id, { effect: e.target.value }) })
    : null;
  const c = deviceCard({ title, iconName, tone: HOME.tones.light, sw, className: 'light-card' },
    bri, swatches, effect ? h('label', { class: 'field inline' }, h('span', null, 'Efekt'), effect) : null, footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const avail = isAvailable(s), on = isOn(s), a = s?.attributes || {};
    sw.set(on, !avail);
    const pct = a.brightness ? Math.round((a.brightness / 255) * 100) : null;
    bri?.set(pct, !on);
    const glow = lightCss(s);
    if (glow) {
      c.style.setProperty('--tone', glow);
      // Dark, saturated light colours get a white icon, pale ones a navy one.
      c.style.setProperty('--tone-ink', cssLuminance(glow) < 0.3 ? '#ffffff' : '#1A2240');
    }
    const effectName = a.effect && a.effect !== 'off' ? a.effect : null;
    const preset = on ? presets.find((p) => presetMatches(p, a)) : null;
    const detail = dimmable ? [`%${pct ?? '–'}`, effectName || preset?.name || (colour ? 'Özel renk' : null)].filter(Boolean).join(' · ') : 'Açık';
    c.setState(!avail ? 'Ulaşılamıyor' : on ? detail : 'Kapalı', on);
    swatchButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(on && presets[i] === preset)));
    if (effect) {
      const list = a.effect_list || [];
      if (effect.options.length !== list.length) effect.replaceChildren(...list.map((e) => h('option', { value: e }, e)));
      effect.value = effectName || 'Kapalı';
      effect.disabled = !on;
    }
  }));
  return c;
}

// ---- plugs and relays ------------------------------------------------------------------

function plugCard({ device, ids, cleanup, title, iconName }) {
  const swId = pick(ids, (i, s, e) => domainOf(i) === 'switch' && main(i, s, e));
  const powerId = pick(ids, (i, s) => dc(s) === 'power');
  const energyId = pick(ids, (i, s) => dc(s) === 'energy' && /today/.test(i)) || pick(ids, (i, s) => dc(s) === 'energy');
  const sw = toggle(`${title} aç ya da kapat`, (on) => store.call('switch', on ? 'turn_on' : 'turn_off', swId));
  const watts = h('div', { class: 'big-number' }, '–');
  const today = h('span', null, '');
  const graph = h('div', { class: 'spark-wrap' });
  const c = deviceCard({ title, iconName, tone: TONES.plug, sw, className: 'plug-card' },
    h('div', { class: 'plug-now' }, watts, h('p', { class: 'muted small' }, today)),
    powerId ? graph : null,
    footer(device, ids, cleanup, powerId ? [h('span', { class: 'muted small' }, 'Son 3 saat')] : []));

  const HOURS = 3;
  let rows = null;
  const span = () => [new Date(Date.now() - HOURS * 3600 * 1000).toISOString(), new Date().toISOString()];
  const draw = () => { if (rows) { const [start, end] = span(); graph.replaceChildren(sparkline(rows, { start, end, cls: 'c-plug' })); } };
  async function load() {
    if (!powerId || !store.backend || store.status.state !== 'connected') return;
    const [start, end] = span();
    try { rows = (await store.backend.fetchHistory([powerId], start, end))[powerId] || []; draw(); } catch { /* optional */ }
  }
  let last = null;
  cleanup.push(store.onStatus((s) => { if (s.state !== last) { last = s.state; load(); } }));

  cleanup.push(store.watch([swId, powerId, energyId].filter(Boolean), () => {
    const s = store.get(swId), w = powerId ? store.get(powerId) : null, t = energyId ? store.get(energyId) : null;
    const on = isOn(s);
    sw.set(on, !isAvailable(s));
    watts.replaceChildren(...[w && isAvailable(w) ? num(w) : (on ? 'Açık' : 'Kapalı'), w ? h('small', null, ' W') : null].filter(Boolean));
    const kwh = numVal(t);
    today.textContent = kwh != null ? `bugün ${dec(kwh, 3)} kWh · ≈ ${dec(kwh * loadSettings().pricePerKwh, 2)} ₺` : '';
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : on ? 'Açık' : 'Kapalı', on);
    if (rows && w && isAvailable(w)) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || lastRow[1] !== w.state) { rows.push([new Date().toISOString(), w.state]); draw(); }
    }
  }));
  return c;
}

function relayCard({ device, ids, cleanup, title, iconName }) {
  const swId = pick(ids, (i, s, e) => domainOf(i) === 'switch' && main(i, s, e));
  const sw = toggle(`${title} aç ya da kapat`, (on) => store.call('switch', on ? 'turn_on' : 'turn_off', swId));
  const c = deviceCard({ title, iconName, tone: TONES.relay, sw }, footer(device, ids, cleanup));
  cleanup.push(store.watch(swId, (s) => { sw.set(isOn(s), !isAvailable(s)); c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : isOn(s) ? 'Açık' : 'Kapalı', isOn(s)); }));
  return c;
}

// ---- covers --------------------------------------------------------------------------------

function coverCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'cover');
  const btn = (svc, ico, label) => h('button', { class: 'ir-btn', type: 'button', 'aria-label': label, title: label, onclick: () => store.call('cover', svc, id) }, icon(ico, 20), h('span', { class: 'ir-text' }, label));
  const pos = slider({ label: 'Konum', min: 0, max: 100, onCommit: (v) => store.call('cover', 'set_cover_position', id, { position: v }) });
  const c = deviceCard({ title, iconName, tone: TONES.cover },
    h('div', { class: 'cover-row' }, btn('open_cover', 'up', 'Aç'), btn('stop_cover', 'stop', 'Durdur'), btn('close_cover', 'down', 'Kapat')),
    pos, footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const p = s?.attributes?.current_position;
    pos.set(p ?? null, !isAvailable(s));
    pos.hidden = p == null;
    const text = !isAvailable(s) ? 'Ulaşılamıyor' : s.state === 'opening' ? 'Açılıyor…' : s.state === 'closing' ? 'Kapanıyor…'
      : s.state === 'closed' ? 'Kapalı' : p != null ? `Açık · %${p}` : 'Açık';
    c.setState(text, isAvailable(s) && s.state !== 'closed');
  }));
  return c;
}

// ---- heating ----------------------------------------------------------------------------------

function climateCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'climate');
  const sw = toggle(`${title} ısıtmayı aç ya da kapat`, (on) => store.call('climate', 'set_hvac_mode', id, { hvac_mode: on ? 'heat' : 'off' }));
  const current = h('div', { class: 'big-number' }, '–');
  const target = h('span', { class: 'target-value' }, '–');
  let targetVal = null;
  const step = (dir) => {
    const s = store.get(id);
    const st = s?.attributes?.target_temp_step || 0.5;
    const next = Math.min(s?.attributes?.max_temp ?? 35, Math.max(s?.attributes?.min_temp ?? 5, (targetVal ?? 20) + dir * st));
    targetVal = next;
    target.textContent = `${dec(next)}°`;
    clearTimeout(step.t);
    step.t = setTimeout(() => store.call('climate', 'set_temperature', id, { temperature: next }), 700);
  };
  const c = deviceCard({ title, iconName, tone: TONES.climate, sw },
    h('div', { class: 'climate-now' }, current, h('p', { class: 'muted small' }, 'Oda şu an')),
    h('div', { class: 'stepper' },
      h('button', { class: 'ir-btn round', type: 'button', 'aria-label': 'Hedefi düşür', onclick: () => step(-1) }, icon('minus', 20)),
      h('span', { class: 'stepper-label' }, 'Hedef ', target),
      h('button', { class: 'ir-btn round', type: 'button', 'aria-label': 'Hedefi yükselt', onclick: () => step(1) }, icon('plus', 20))),
    footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const a = s?.attributes || {};
    const on = isAvailable(s) && s.state !== 'off';
    sw.set(on, !isAvailable(s));
    current.replaceChildren(a.current_temperature != null ? dec(a.current_temperature) : '–', h('small', null, ' °C'));
    if (a.temperature != null) { targetVal = Number(a.temperature); target.textContent = `${dec(targetVal)}°`; }
    const action = a.hvac_action === 'heating' ? 'Isıtıyor' : a.hvac_action === 'idle' ? 'Hedefte' : null;
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : on ? [action || 'Açık', a.temperature != null ? `hedef ${dec(a.temperature)}°` : null].filter(Boolean).join(' ') : 'Kapalı', on);
  }));
  return c;
}

// ---- security ------------------------------------------------------------------------------------

function lockCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'lock');
  const action = h('button', { class: 'btn primary wide', type: 'button' });
  action.addEventListener('click', () => {
    const locked = store.get(id)?.state === 'locked';
    if (locked && !confirm(`${title} kilidi açılsın mı?`)) return;
    store.call('lock', locked ? 'unlock' : 'lock', id);
  });
  const c = deviceCard({ title, iconName, tone: TONES.lock, className: 'lock-card' }, action, footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const locked = s?.state === 'locked';
    action.replaceChildren(icon(locked ? 'lock' : 'lock', 18), locked ? 'Kilidi aç' : 'Kilitle');
    action.disabled = !isAvailable(s);
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : locked ? 'Kilitli' : s.state === 'unlocked' ? 'Kilidi açık' : s.state, locked);
    c.classList.toggle('warn-state', isAvailable(s) && !locked);
  }));
  return c;
}

function valveCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'valve') || pick(ids, (i, s, e) => domainOf(i) === 'switch' && main(i, s, e));
  const isValve = id && domainOf(id) === 'valve';
  const sw = toggle(`${title} aç ya da kapat`, (open) => isValve
    ? store.call('valve', open ? 'open_valve' : 'close_valve', id)
    : store.call('switch', open ? 'turn_on' : 'turn_off', id));
  const c = deviceCard({ title, iconName, tone: TONES.valve, sw }, footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const open = s?.state === 'open' || s?.state === 'on';
    sw.set(open, !isAvailable(s));
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : open ? 'Açık, su akıyor' : 'Kapalı', open);
  }));
  return c;
}

function sirenCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'siren');
  const action = h('button', { class: 'btn wide', type: 'button' });
  action.addEventListener('click', () => {
    const on = store.get(id)?.state === 'on';
    if (!on && !confirm(`${title} şimdi çalsın mı? Çok yüksek seslidir.`)) return;
    store.call('siren', on ? 'turn_off' : 'turn_on', id);
  });
  const c = deviceCard({ title, iconName, tone: TONES.siren, className: 'siren-card' }, action, footer(device, ids, cleanup));
  cleanup.push(store.watch(id, (s) => {
    const on = s?.state === 'on';
    action.replaceChildren(icon(on ? 'stop' : 'siren', 18), on ? 'Sireni durdur' : 'Sireni dene');
    action.classList.toggle('danger', on);
    action.disabled = !isAvailable(s);
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : on ? 'Çalıyor' : 'Sessiz', on);
    c.classList.toggle('alarm', on);
  }));
  return c;
}

function cameraCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'camera');
  const motionId = pick(ids, (i, s) => dc(s) === 'motion');
  const privacyId = pick(ids, (i) => domainOf(i) === 'switch' && /privacy/.test(i));
  const frame = h('div', { class: 'camera-frame' });
  const stamp = h('span', { class: 'camera-stamp' });
  frame.append(stamp);
  const sw = privacyId ? toggle('Gizlilik modu', (on) => store.call('switch', on ? 'turn_on' : 'turn_off', privacyId)) : null;
  const c = deviceCard({ title, iconName, tone: TONES.camera, className: 'camera-card' }, frame,
    footer(device, ids, cleanup, [privacyId ? h('label', { class: 'mini-toggle' }, sw, h('span', { class: 'muted small' }, 'Gizlilik')) : null, simulateButton(motionId, 'Hareket')]));
  const live = store.backend?.mode === 'live' && store.backend.hassUrl;
  const refresh = () => {
    const s = store.get(id);
    const privacy = privacyId && store.get(privacyId)?.state === 'on';
    stamp.textContent = privacy ? 'Gizlilik modu açık' : new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    frame.classList.toggle('private', !!privacy);
    if (live && s?.attributes?.access_token && !privacy) {
      frame.style.backgroundImage = `url("${store.backend.hassUrl}/api/camera_proxy/${id}?token=${s.attributes.access_token}&t=${Date.now()}")`;
    }
  };
  const t = setInterval(refresh, 10000);
  cleanup.push(() => clearInterval(t));
  cleanup.push(store.watch([id, motionId, privacyId].filter(Boolean), () => {
    const s = store.get(id);
    const motion = motionId && store.get(motionId)?.state === 'on';
    refresh();
    frame.classList.toggle('demo', !live);
    sw?.set(store.get(privacyId)?.state === 'on');
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : motion ? 'Hareket görüldü' : 'İzliyor', !!motion);
  }));
  return c;
}

// ---- sensors -------------------------------------------------------------------------------------

function sensorCard({ device, ids, cleanup, title, iconName, product }, type) {
  const isMotion = type === 'motion';
  const id = isMotion
    ? pick(ids, (i, s) => ['occupancy', 'presence', 'motion'].includes(dc(s)) && domainOf(i) === 'binary_sensor')
    : pick(ids, (i, s) => ['opening', 'door', 'window', 'garage_door'].includes(dc(s)));
  const luxId = pick(ids, (i, s) => dc(s) === 'illuminance');
  const extra = h('span', { class: 'muted small' });
  const c = deviceCard({ title, iconName, tone: isMotion ? TONES.motion : TONES.contact },
    footer(device, ids, cleanup, [extra, simulateButton(id, isMotion ? 'Hareket' : 'Aç/kapa')]));
  const draw = () => {
    const s = store.get(id);
    const on = isOn(s);
    const text = !isAvailable(s) ? 'Ulaşılamıyor'
      : isMotion ? (on ? 'Biri var' : `Boş · ${relTime(s.last_changed)}`)
        : (on ? 'Açık' : 'Kapalı');
    c.setState(text, on);
    const lux = luxId ? store.get(luxId) : null;
    extra.textContent = lux && isAvailable(lux) ? `${num(lux, 0)} lx` : '';
  };
  cleanup.push(store.watch([id, luxId].filter(Boolean), draw));
  const t = setInterval(draw, 30000);
  cleanup.push(() => clearInterval(t));
  return c;
}

function alarmCard({ device, ids, cleanup, title, iconName, product }, cls, alarmText) {
  const id = pick(ids, (i, s) => dc(s) === cls);
  const note = product?.emergency ? h('p', { class: 'alarm-note' }, icon('alert', 16), product.emergency) : null;
  if (note) note.hidden = true;
  const c = deviceCard({ title, iconName, tone: TONES.alarm, className: 'alarm-card' }, note,
    footer(device, ids, cleanup, [simulateButton(id, 'Alarmı dene')]));
  cleanup.push(store.watch(id, (s) => {
    const on = isOn(s);
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : on ? alarmText : 'Sorun yok', on);
    c.classList.toggle('alarm', on);
    if (note) note.hidden = !on;
  }));
  return c;
}

function buttonCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'event') || pick(ids, (i, s, e) => main(i, s, e));
  const c = deviceCard({ title, iconName, tone: TONES.button }, footer(device, ids, cleanup, [simulateButton(id, 'Bas')]));
  const draw = () => {
    const s = store.get(id);
    const when = s && isAvailable(s) ? relTime(s.state) : null;
    const recent = s && Date.now() - Date.parse(s.state) < 120000;
    c.setState(!s ? 'Ulaşılamıyor' : when && when !== 'never' ? `Basıldı: ${when}${s.attributes.event_type ? ' · ' + s.attributes.event_type : ''}` : 'Henüz basılmadı', !!recent);
    c.classList.toggle('alarm', !!recent);
  };
  cleanup.push(store.watch(id, draw));
  const t = setInterval(draw, 30000);
  cleanup.push(() => clearInterval(t));
  return c;
}

function climateSensorCard({ device, ids, cleanup, title, iconName }) {
  const tId = pick(ids, (i, s) => dc(s) === 'temperature' && domainOf(i) === 'sensor');
  const hId = pick(ids, (i, s) => dc(s) === 'humidity' && domainOf(i) === 'sensor');
  const temp = h('div', { class: 'big-number' }, '–');
  const c = deviceCard({ title, iconName, tone: TONES['climate-sensor'] }, temp, footer(device, ids, cleanup));
  cleanup.push(store.watch([tId, hId].filter(Boolean), () => {
    const t = store.get(tId), hu = hId ? store.get(hId) : null;
    temp.replaceChildren(isAvailable(t) ? num(t) : '–', h('small', null, ' °C'));
    c.setState(!isAvailable(t) ? 'Ulaşılamıyor' : hu && isAvailable(hu) ? `nem %${num(hu, 0)}` : 'Sıcaklık', false);
  }));
  return c;
}

function co2Card({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i, s) => dc(s) === 'carbon_dioxide');
  const tId = pick(ids, (i, s) => dc(s) === 'temperature');
  const value = h('div', { class: 'big-number' }, '–');
  const c = deviceCard({ title, iconName, tone: TONES.co2 }, value, footer(device, ids, cleanup));
  cleanup.push(store.watch([id, tId].filter(Boolean), () => {
    const s = store.get(id), v = numVal(s);
    value.replaceChildren(isAvailable(s) ? num(s, 0) : '–', h('small', null, ' ppm'));
    const level = v == null ? null : v < 800 ? ['Temiz hava', '#B3C6B3'] : v < 1200 ? ['Hava ağırlaşıyor', HEAT] : ['Pencere açın', ALARM];
    if (level) c.style.setProperty('--tone', level[1]);
    const t = tId ? store.get(tId) : null;
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : [level?.[0], t && isAvailable(t) ? `${num(t)}°` : null].filter(Boolean).join(' · '), v != null && v >= 800);
  }));
  return c;
}

// ---- infrared kit ------------------------------------------------------------------------------------

function trackerFix(device) {
  const btn = h('button', { class: 'link subtle', type: 'button' });
  btn.addEventListener('click', () => setTracker(device, store.get(HOME[device].tracker)?.state !== 'on'));
  btn.update = (on) => { btn.textContent = on ? 'Aslında açık değil mi?' : 'Aslında kapalı değil mi?'; btn.title = 'Bir şey göndermeden durumu düzelt'; };
  return btn;
}

function irCard({ device, ids, cleanup, title, iconName }) {
  const ir = (eid, opts) => irButton(eid, opts, cleanup);
  // The IR module set up for this home: TV and heater with their trackers.
  if (ids.includes(HOME.tv.buttons.power)) {
    const tvSw = toggle('TV aç ya da kapat', (on) => ensurePower('tv', on));
    const heaterSw = toggle('Isıtıcı aç ya da kapat', (on) => ensurePower('heater', on));
    const tvState = h('span', { class: 'muted small' });
    const heaterState = h('span', { class: 'muted small' });
    const tvFix = trackerFix('tv');
    const heaterFix = trackerFix('heater');
    const b = HOME.tv.buttons, hb = HOME.heater.buttons;
    const c = deviceCard({ title, iconName, tone: TONES.ir, className: 'ir-card' },
      h('div', { class: 'ir-section' },
        h('div', { class: 'ir-line' }, icon('tv', 18), h('strong', null, 'TV'), tvState, h('span', { class: 'sep' }), tvSw),
        h('div', { class: 'tv-mini' },
          h('div', { class: 'vol' }, ir(b.volumeDown, { label: 'Sesi kıs', iconName: 'minus', className: 'round flat' }), h('span', { class: 'vol-label' }, icon('volume', 18)), ir(b.volumeUp, { label: 'Sesi aç', iconName: 'plus', className: 'round flat' })),
          ir(b.mute, { label: 'Sessiz', iconName: 'mute', className: 'round' }),
          ir(b.input, { label: 'Kaynak', iconName: 'input', className: 'round' }),
          ir(b.netflix, { label: 'Netflix', iconName: 'netflix', className: 'round netflix' }))),
      h('div', { class: 'ir-section' },
        h('div', { class: 'ir-line' }, icon('heater', 18), h('strong', null, 'Isıtıcı'), heaterState, h('span', { class: 'sep' }), heaterSw),
        h('div', { class: 'mode-row four' },
          ir(hb.tempDown, { label: 'Sıcaklığı düşür', iconName: 'minus', className: 'mode' }),
          ir(hb.tempUp, { label: 'Sıcaklığı artır', iconName: 'plus', className: 'mode' }),
          ir(hb.eco, { label: 'ECO modu', iconName: 'leaf', text: 'ECO', className: 'mode' }),
          ir(hb.performance, { label: 'Güçlü', iconName: 'flame', text: 'Güçlü', className: 'mode' }))),
      h('div', { class: 'card-foot' }, h('a', { class: 'link', href: '#/remotes' }, 'Tüm kumandalar', icon('right', 14)), h('span', { class: 'sep' }), tvFix, heaterFix,
        h('a', { class: 'link subtle', href: `#/devices/${encodeURIComponent(device.id)}` }, 'Ayrıntılar', icon('right', 14))));
    cleanup.push(store.watch([HOME.tv.tracker, HOME.heater.tracker], (tv, heater) => {
      tvSw.set(isOn(tv), !isAvailable(tv)); heaterSw.set(isOn(heater), !isAvailable(heater));
      tvState.textContent = isOn(tv) ? 'Açık' : 'Kapalı';
      heaterState.textContent = isOn(heater) ? 'Açık' : 'Kapalı';
      tvFix.update(isOn(tv)); heaterFix.update(isOn(heater));
      c.setState([isOn(tv) ? 'TV açık' : 'TV kapalı', isOn(heater) ? 'ısıtıcı açık' : 'ısıtıcı kapalı'].join(' · '), isOn(tv) || isOn(heater));
    }));
    return c;
  }
  // Any other IR kit: a grid of its learned buttons.
  const buttons = ids.filter((i) => domainOf(i) === 'button' && !store.entities.get(i)?.entity_category);
  const c = deviceCard({ title, iconName, tone: TONES.ir },
    h('div', { class: 'ir-grid' }, buttons.map((i) => ir(i, { label: store.get(i)?.attributes?.friendly_name || i, text: (store.get(i)?.attributes?.friendly_name || i).replace(title, '').trim(), className: 'mini' }))),
    footer(device, ids, cleanup));
  c.setState(`${buttons.length} kumanda tuşu`, false);
  return c;
}

// ---- home appliances ----------------------------------------------------------------------------------

function actionButton(ico, label, onclick) {
  return h('button', { class: 'ir-btn', type: 'button', 'aria-label': label, title: label, onclick }, icon(ico, 20), h('span', { class: 'ir-text' }, label));
}

// A value set with − and + (portions, target temperature), sent a moment after the last tap.
function numberStepper(numberId, label, unit, cleanup) {
  const value = h('span', { class: 'target-value' }, '–');
  let n = null;
  let timer = null;
  const step = (dir) => {
    const a = store.get(numberId)?.attributes || {};
    const st = Number(a.step) || 1;
    n = Math.min(Number(a.max ?? 100), Math.max(Number(a.min ?? 0), (n ?? Number(a.min ?? 0)) + dir * st));
    value.textContent = `${n}${unit}`;
    clearTimeout(timer);
    timer = setTimeout(() => store.call('number', 'set_value', numberId, { value: n }), 600);
  };
  cleanup.push(() => clearTimeout(timer));
  const el = h('div', { class: 'stepper' },
    h('button', { class: 'ir-btn round', type: 'button', 'aria-label': `Azalt: ${label}`, onclick: () => step(-1) }, icon('minus', 20)),
    h('span', { class: 'stepper-label' }, `${label} `, value),
    h('button', { class: 'ir-btn round', type: 'button', 'aria-label': `Artır: ${label}`, onclick: () => step(1) }, icon('plus', 20)));
  el.update = (s) => { if (s && isAvailable(s)) { n = Number(s.state); value.textContent = `${n}${unit}`; } };
  return el;
}

function vacuumCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'vacuum');
  const call = (svc) => () => store.call('vacuum', svc, id);
  const c = deviceCard({ title, iconName, tone: TONES.vacuum },
    h('div', { class: 'cover-row' }, actionButton('play', 'Temizle', call('start')), actionButton('pause', 'Duraklat', call('pause')), actionButton('home', 'İstasyona', call('return_to_base'))),
    footer(device, ids, cleanup));
  const TEXT = { cleaning: 'Temizliyor', docked: 'Şarj istasyonunda', returning: 'İstasyona dönüyor', paused: 'Duraklatıldı', idle: 'Bekliyor', error: 'Yardım gerekiyor' };
  cleanup.push(store.watch(id, (s) => {
    const st = s?.state;
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : TEXT[st] || st, st === 'cleaning' || st === 'returning');
    c.classList.toggle('warn-state', st === 'error');
  }));
  return c;
}

// Fans and air purifiers: on/off, speed and their modes; a purifier also shows the air (PM2.5) and its filter.
function fanCard({ device, ids, cleanup, title, iconName }) {
  const id = pick(ids, (i) => domainOf(i) === 'fan');
  const pmId = pick(ids, (i, s) => dc(s) === 'pm25');
  const filterId = pick(ids, (i) => domainOf(i) === 'sensor' && /filter/.test(i));
  const sw = toggle(`${title} aç ya da kapat`, (on) => store.call('fan', on ? 'turn_on' : 'turn_off', id));
  const speed = slider({ label: 'Hız', min: 1, max: 100, onCommit: (v) => store.call('fan', 'set_percentage', id, { percentage: v }) });
  const presets = store.get(id)?.attributes?.preset_modes || [];
  const modeButtons = presets.map((m) => h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => store.call('fan', 'set_preset_mode', id, { preset_mode: m }) }, m));
  const modes = presets.length ? h('div', { class: 'segmented fan-modes', role: 'group', 'aria-label': `${title} modu` }, modeButtons) : null;
  const air = pmId ? h('div', { class: 'big-number' }, '–') : null;
  const filter = filterId ? h('span', { class: 'muted small' }) : null;
  const c = deviceCard({ title, iconName, tone: TONES.fan, sw }, air, speed, modes, footer(device, ids, cleanup, [filter]));
  cleanup.push(store.watch([id, pmId, filterId].filter(Boolean), () => {
    const s = store.get(id), a = s?.attributes || {};
    const on = isOn(s);
    sw.set(on, !isAvailable(s));
    speed.set(a.percentage ?? null, !on);
    modeButtons.forEach((b, i) => { const active = on && a.preset_mode === presets[i]; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    let quality = null;
    if (pmId) {
      const pm = store.get(pmId), v = numVal(pm);
      air.replaceChildren(isAvailable(pm) ? num(pm, 0) : '–', h('small', null, ' µg/m³ PM2,5'));
      quality = v == null ? null : v <= 12 ? 'Temiz hava' : v <= 35 ? 'Orta hava' : 'Kötü hava';
      if (v != null) c.style.setProperty('--tone', v <= 12 ? '#B3C6B3' : v <= 35 ? HEAT : ALARM);
    }
    if (filter) { const f = store.get(filterId); filter.textContent = f && isAvailable(f) ? `Filtre %${num(f, 0)}` : ''; }
    const detail = on ? [a.preset_mode, a.percentage != null ? `%${a.percentage}` : null].filter(Boolean).join(' · ') || 'Açık' : 'Kapalı';
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : [quality, detail].filter(Boolean).join(' · '), on);
  }));
  return c;
}

function feederCard({ device, ids, cleanup, title, iconName }) {
  const feedId = pick(ids, (i) => domainOf(i) === 'button' && /feed/.test(i)) || pick(ids, (i, s, e) => domainOf(i) === 'button' && main(i, s, e));
  const portionsId = pick(ids, (i) => domainOf(i) === 'number');
  const levelId = pick(ids, (i) => domainOf(i) === 'sensor' && /food|level/.test(i));
  const portions = portionsId ? numberStepper(portionsId, 'Porsiyon', '', cleanup) : null;
  const feed = h('button', { class: 'btn primary wide', type: 'button' }, icon('paw', 18), 'Şimdi mama ver');
  feed.addEventListener('click', async () => {
    feed.disabled = true;
    try { await store.call('button', 'press', feedId); } finally { setTimeout(() => { feed.disabled = false; }, 1500); }
  });
  const c = deviceCard({ title, iconName, tone: TONES.feeder }, portions, feed, footer(device, ids, cleanup));
  const draw = () => {
    const f = store.get(feedId), lvl = levelId ? store.get(levelId) : null;
    portions?.update(store.get(portionsId));
    const fed = f && isAvailable(f) && f.state !== 'unknown' ? `Mama verildi: ${relTime(f.state)}` : 'Uygulamadan henüz mama verilmedi';
    const low = lvl && ['Low', 'Empty'].includes(lvl.state);
    c.setState([lvl && isAvailable(lvl) ? `Mama: ${({ Enough: 'yeterli', Low: 'az', Empty: 'bitti' })[lvl.state] || lvl.state}` : null, fed].filter(Boolean).join(' · '), !!(f && Date.now() - Date.parse(f.state) < 120000));
    c.classList.toggle('warn-state', !!low);
  };
  cleanup.push(store.watch([feedId, portionsId, levelId].filter(Boolean), draw));
  const t = setInterval(draw, 30000);
  cleanup.push(() => clearInterval(t));
  return c;
}

function litterCard({ device, ids, cleanup, title, iconName }) {
  const cleanId = pick(ids, (i) => domainOf(i) === 'button' && /clean/.test(i)) || pick(ids, (i, s, e) => domainOf(i) === 'button' && main(i, s, e));
  const wasteId = pick(ids, (i) => domainOf(i) === 'sensor' && /waste/.test(i));
  const visitsId = pick(ids, (i) => domainOf(i) === 'sensor' && /visit|use/.test(i));
  const clean = h('button', { class: 'btn wide', type: 'button' }, icon('sparkle', 18), 'Şimdi temizle');
  clean.addEventListener('click', async () => {
    clean.disabled = true;
    try { await store.call('button', 'press', cleanId); } finally { setTimeout(() => { clean.disabled = false; }, 1500); }
  });
  const c = deviceCard({ title, iconName, tone: TONES.litter }, clean, footer(device, ids, cleanup));
  const draw = () => {
    const w = wasteId ? store.get(wasteId) : null, v = visitsId ? store.get(visitsId) : null, cl = store.get(cleanId);
    const level = numVal(w);
    c.setState([
      level != null ? `Atık haznesi %${Math.round(level)}` : null,
      v && isAvailable(v) ? `bugün ${num(v, 0)} kullanım` : null,
      cl && isAvailable(cl) && cl.state !== 'unknown' ? `temizlendi: ${relTime(cl.state)}` : null,
    ].filter(Boolean).join(' · ') || 'Hazır', false);
    c.classList.toggle('warn-state', level != null && level >= 80);
  };
  cleanup.push(store.watch([cleanId, wasteId, visitsId].filter(Boolean), draw));
  const t = setInterval(draw, 30000);
  cleanup.push(() => clearInterval(t));
  return c;
}

function kettleCard({ device, ids, cleanup, title, iconName }) {
  const swId = pick(ids, (i, s, e) => domainOf(i) === 'switch' && main(i, s, e));
  const tempId = pick(ids, (i, s) => dc(s) === 'temperature' && domainOf(i) === 'sensor');
  const targetId = pick(ids, (i) => domainOf(i) === 'number');
  const sw = toggle(`${title} ısıtmayı aç ya da kapat`, (on) => store.call('switch', on ? 'turn_on' : 'turn_off', swId));
  const water = h('div', { class: 'big-number' }, '–');
  const target = targetId ? numberStepper(targetId, 'Isıt', '°', cleanup) : null;
  const c = deviceCard({ title, iconName, tone: TONES.kettle, sw },
    h('div', { class: 'climate-now' }, water, h('p', { class: 'muted small' }, 'Su şu an')), target, footer(device, ids, cleanup));
  cleanup.push(store.watch([swId, tempId, targetId].filter(Boolean), () => {
    const s = store.get(swId), t = tempId ? store.get(tempId) : null, goal = targetId ? store.get(targetId) : null;
    const on = isOn(s);
    sw.set(on, !isAvailable(s));
    water.replaceChildren(t && isAvailable(t) ? num(t, 0) : '–', h('small', null, ' °C'));
    target?.update(goal);
    const reached = on && t && goal && numVal(t) >= numVal(goal);
    c.setState(!isAvailable(s) ? 'Ulaşılamıyor' : !on ? 'Kapalı' : reached ? `Hazır · ${num(goal, 0)}°, sıcak tutuluyor` : `${goal ? num(goal, 0) : '…'}° için ısıtıyor`, on);
  }));
  return c;
}

// ---- anything else ---------------------------------------------------------------------------------------

function genericCard({ device, ids, cleanup, title, iconName, product }) {
  const shown = ids.filter((i) => !store.entities.get(i)?.entity_category).slice(0, 4);
  const rows = h('ul', { class: 'entity-rows' });
  const c = deviceCard({ title, iconName, tone: TONES.generic }, rows, footer(device, ids, cleanup));
  cleanup.push(store.watch(shown.length ? shown : ['__none__'], () => {
    rows.replaceChildren(...shown.map((i) => {
      const s = store.get(i);
      const unit = s?.attributes?.unit_of_measurement || '';
      return h('li', null, h('span', null, (s?.attributes?.friendly_name || i).replace(title, '').trim() || 'Durum'), h('strong', null, s ? `${s.state}${unit ? ' ' + unit : ''}` : '–'));
    }));
    c.setState(isDev() ? (product ? product.model : `${ids.length} varlık`) : (product?.name || 'Bağlı'), false);
  }));
  return c;
}
