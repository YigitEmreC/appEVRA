// Demo backend: a pretend Home Assistant built from the snapshot taken on
// 13 November 2026. It answers the same calls as the live backend, keeps rooms,
// devices and automations between reloads, can create any catalogue product,
// and runs automations with a small interpreter so they behave like the real ones.

import { HOME } from '../config.js';
import { productById } from '../catalog.js';
import { sleep, rgbToHs } from '../util.js';

const SNAPSHOT = new URL('../../../ha-snapshot/', import.meta.url);
const WORLD_KEY = 'smarthome.demo.v2';

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
const nowIso = () => new Date().toISOString();
const randId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Entities each kind of product gets when added in the demo.
const battery = { domain: 'sensor', suffix: 'battery', label: 'Battery', state: '100', attrs: { device_class: 'battery', unit_of_measurement: '%', state_class: 'measurement' }, category: 'diagnostic' };
const temperature = (v) => ({ domain: 'sensor', suffix: 'temperature', label: 'Temperature', state: v, attrs: { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' } });
const humidity = (v) => ({ domain: 'sensor', suffix: 'humidity', label: 'Humidity', state: v, attrs: { device_class: 'humidity', unit_of_measurement: '%', state_class: 'measurement' } });
const illuminance = { domain: 'sensor', suffix: 'illuminance', label: 'Light level', state: '140', attrs: { device_class: 'illuminance', unit_of_measurement: 'lx', state_class: 'measurement' } };
const EFFECTS = ['Off', 'Aurora', 'Candy Cane', 'Christmas', 'Flicker', 'Ocean', 'Rainbow', 'Raindrop', 'Spring', 'Sunrise', 'Sunset', 'Valentines'];

function templatesFor(product) {
  switch (product.kind) {
    case 'motion': return [{ domain: 'binary_sensor', suffix: 'occupancy', label: 'Occupancy', state: 'off', attrs: { device_class: 'occupancy' } }, illuminance, battery];
    case 'presence': return [{ domain: 'binary_sensor', suffix: 'occupancy', label: 'Presence', state: 'off', attrs: { device_class: 'occupancy' } }, illuminance];
    case 'climate-sensor': return [temperature('21.4'), humidity('46'), battery];
    case 'contact': return [{ domain: 'binary_sensor', suffix: '', label: '', state: 'off', attrs: { device_class: 'opening' } }, battery];
    case 'smoke': return [{ domain: 'binary_sensor', suffix: 'smoke', label: 'Smoke', state: 'off', attrs: { device_class: 'smoke' } }, battery];
    case 'gas': return [{ domain: 'binary_sensor', suffix: 'gas', label: 'Gas', state: 'off', attrs: { device_class: 'gas' } }];
    case 'leak': return [{ domain: 'binary_sensor', suffix: 'water', label: 'Water leak', state: 'off', attrs: { device_class: 'moisture' } }, battery];
    case 'button': return [{ domain: 'event', suffix: 'press', label: 'Press', state: 'unknown', attrs: { device_class: 'button', event_types: ['single', 'double', 'long'], event_type: null } }, battery];
    case 'camera': return [
      { domain: 'camera', suffix: '', label: '', state: 'idle', attrs: { motion_detection: true } },
      { domain: 'binary_sensor', suffix: 'motion', label: 'Motion', state: 'off', attrs: { device_class: 'motion' } },
      ...(product.id === 'camera-indoor' ? [{ domain: 'switch', suffix: 'privacy', label: 'Privacy mode', state: 'off', attrs: { icon: 'mdi:eye-off' } }] : []),
    ];
    case 'valve': return product.id === 'irrigation'
      ? [{ domain: 'valve', suffix: '', label: '', state: 'closed', attrs: { device_class: 'water', supported_features: 3 } }, battery]
      : [{ domain: 'valve', suffix: '', label: '', state: 'open', attrs: { device_class: 'water', supported_features: 3 } }];
    case 'siren': return [{ domain: 'siren', suffix: '', label: '', state: 'off', attrs: {} }];
    case 'lock': return [{ domain: 'lock', suffix: '', label: '', state: 'locked', attrs: {} }, battery];
    case 'climate': return [{ domain: 'climate', suffix: '', label: '', state: 'heat', attrs: { current_temperature: 20.5, temperature: 21, min_temp: 5, max_temp: 30, target_temp_step: 0.5, hvac_modes: ['off', 'heat'], hvac_action: 'heating' } },
      ...(product.id === 'trv' ? [battery] : [])];
    case 'relay': return [{ domain: 'switch', suffix: '', label: '', state: 'off', attrs: {} }];
    case 'ir': return [['ac_power', 'AC power'], ['ac_temp_up', 'AC temperature up'], ['ac_temp_down', 'AC temperature down'], ['tv_power', 'TV power'], ['tv_volume_up', 'TV volume up'], ['tv_volume_down', 'TV volume down']]
      .map(([suffix, label]) => ({ domain: 'button', suffix, label, state: 'unknown', attrs: {} }));
    case 'co2': return [{ domain: 'sensor', suffix: 'co2', label: 'CO₂', state: '640', attrs: { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm', state_class: 'measurement' } }, temperature('22.1'), humidity('41')];
    case 'plug': return [
      { domain: 'switch', suffix: '', label: '', state: 'on', attrs: {} },
      { domain: 'sensor', suffix: 'power', label: 'Power', state: '12.0', attrs: { device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' } },
      { domain: 'sensor', suffix: 'energy_today', label: 'Energy today', state: '0.050', attrs: { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' } },
    ];
    case 'light':
      if (product.id === 'wall-switch') return [{ domain: 'light', suffix: '', label: '', state: 'off', attrs: { supported_color_modes: ['onoff'], color_mode: null } }];
      return [{ domain: 'light', suffix: '', label: '', state: 'on', attrs: {
        supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', brightness: 200, color_temp_kelvin: 2700, hs_color: null,
        min_color_temp_kelvin: 2500, max_color_temp_kelvin: 6500, ...(product.id === 'led-strip' ? { effect: 'off', effect_list: EFFECTS } : {}),
      } }];
    case 'cover': return [{ domain: 'cover', suffix: '', label: '', state: 'open', attrs: { current_position: 100, device_class: product.coverClass || 'blind', supported_features: 15 } }];
    default: return [];
  }
}

export function createDemoBackend() {
  let emit = () => {};
  const states = new Map();
  const devices = new Map();
  const areas = new Map();
  const entities = new Map();
  const automations = new Map();   // config id -> config
  const scenes = new Map();
  const log = new Map();           // entity_id -> [[iso, state]] recorded while running
  const timers = [];
  const running = new Map();       // config id -> run context
  const flows = new Map();
  let historyData = null;
  let shift = 0;
  let joinTimer = null;
  let saveTimer = null;
  let lastMinute = '';

  // ---- persistence -------------------------------------------------------------

  let blockSave = false;
  function save() {
    if (blockSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (blockSave) return;
      try {
        localStorage.setItem(WORLD_KEY, JSON.stringify({
          v: 2,
          states: [...states.values()], devices: [...devices.values()], areas: [...areas.values()],
          entities: [...entities.values()], automations: [...automations.values()],
        }));
      } catch { /* storage full or blocked: the demo just won't persist */ }
    }, 800);
  }

  function loadSaved() {
    try {
      const w = JSON.parse(localStorage.getItem(WORLD_KEY) || 'null');
      if (!w || w.v !== 2) return false;
      for (const s of w.states) states.set(s.entity_id, s);
      for (const d of w.devices) devices.set(d.id, d);
      for (const a of w.areas) areas.set(a.area_id, a);
      for (const e of w.entities) entities.set(e.entity_id, e);
      for (const c of w.automations) automations.set(c.id, c);
      return true;
    } catch { return false; }
  }

  function emitRegistry() {
    emit({ type: 'registry', devices: [...devices.values()], areas: [...areas.values()], entities: [...entities.values()] });
  }

  // ---- states ------------------------------------------------------------------

  function record(id, state) {
    if (!log.has(id)) log.set(id, []);
    const arr = log.get(id);
    arr.push([nowIso(), state]);
    if (arr.length > 500) arr.shift();
  }

  function set(id, state, attrs) {
    const old = states.get(id);
    if (!old) return;
    const next = {
      ...old,
      state: state === undefined ? old.state : String(state),
      attributes: attrs ? { ...old.attributes, ...attrs } : old.attributes,
      last_updated: nowIso(),
    };
    if (next.state !== old.state) next.last_changed = next.last_updated;
    states.set(id, next);
    if (next.state !== old.state) record(id, next.state);
    emit({ type: 'update', entity_id: id, state: next });
    save();
    deviceBehaviour(id, old, next);
    if (next.state !== old.state) checkStateTriggers(id, old, next);
  }

  const stateOf = (id) => states.get(id)?.state;
  const siblings = (id) => {
    const dev = entities.get(id)?.device_id;
    return dev ? [...entities.values()].filter((e) => e.device_id === dev).map((e) => e.entity_id) : [];
  };

  // Things devices do by themselves, like a plug's power dropping when switched off.
  function deviceBehaviour(id, old, next) {
    if (id.startsWith('switch.') && old.state !== next.state) {
      for (const sib of siblings(id)) {
        const a = states.get(sib)?.attributes;
        if (a?.device_class === 'power') set(sib, next.state === 'on' ? (sib === HOME.plug.power ? '8.9' : '12.0') : '0.0');
        if (a?.device_class === 'current') set(sib, next.state === 'on' ? '0.07' : '0.00');
      }
    }
  }

  function snapshot(id) {
    const s = states.get(id);
    return s ? { id, state: s.state, attributes: { ...s.attributes } } : null;
  }

  // ---- actions (services) ------------------------------------------------------------

  function lightOn(id, data) {
    const a = { ...states.get(id).attributes };
    const modes = a.supported_color_modes || [];
    if (data.brightness_pct != null) a.brightness = Math.round((data.brightness_pct / 100) * 255);
    if (data.brightness != null) a.brightness = data.brightness;
    if (modes.includes('onoff') && modes.length === 1) { set(id, 'on', { color_mode: 'onoff' }); return; }
    if (a.brightness == null || a.brightness === 0) a.brightness = 255;
    if (data.rgb_color) data = { ...data, hs_color: rgbToHs(data.rgb_color) };
    if (data.hs_color) { a.hs_color = data.hs_color; a.color_mode = 'hs'; a.color_temp_kelvin = null; if (a.effect) a.effect = 'off'; }
    if (data.color_temp_kelvin) { a.color_temp_kelvin = data.color_temp_kelvin; a.color_mode = 'color_temp'; a.hs_color = null; if (a.effect) a.effect = 'off'; }
    if (data.effect) a.effect = data.effect === 'Off' ? 'off' : data.effect;
    set(id, 'on', a);
  }

  function moveCover(id, target) {
    const s = states.get(id);
    const from = s.attributes.current_position ?? (s.state === 'open' ? 100 : 0);
    if (from === target) return;
    set(id, target > from ? 'opening' : 'closing');
    const t = setTimeout(() => set(id, target === 0 ? 'closed' : 'open', { current_position: target }), 1600);
    timers.push(t);
  }

  async function service(domain, svc, data = {}, target = {}) {
    let ids = [].concat(target?.entity_id ?? data.entity_id ?? []);
    if (domain === 'homeassistant') {
      for (const id of ids) await service(id.split('.')[0], svc, data, { entity_id: id });
      return;
    }
    if (domain === 'scene' && svc === 'create') {
      const snaps = [].concat(data.snapshot_entities || []).map(snapshot).filter(Boolean);
      scenes.set('scene.' + data.scene_id, snaps);
      return;
    }
    if (domain === 'persistent_notification' || domain === 'notify') {
      window.dispatchEvent(new CustomEvent('demo-notify', { detail: data.message || data.title || 'Notification' }));
      return;
    }
    if (domain === 'zha' && svc === 'permit') return;
    for (const id of ids) {
      if (domain === 'scene' && svc === 'turn_on') {
        for (const snap of scenes.get(id) || []) set(snap.id, snap.state, snap.attributes);
        continue;
      }
      if (!states.has(id)) throw new Error(`${id} doesn't exist in the demo`);
      const cur = stateOf(id);
      switch (domain) {
        case 'light':
          if (svc === 'turn_on' || (svc === 'toggle' && cur !== 'on')) lightOn(id, data); else set(id, 'off');
          break;
        case 'switch': case 'input_boolean': case 'siren': case 'fan':
          set(id, svc === 'turn_on' ? 'on' : svc === 'turn_off' ? 'off' : cur === 'on' ? 'off' : 'on');
          break;
        case 'button':
          set(id, nowIso());
          break;
        case 'automation':
          if (svc === 'trigger') runAutomation(states.get(id).attributes.id, { id: 'manual', manual: true }, data.skip_condition !== false);
          else set(id, svc === 'turn_on' ? 'on' : svc === 'turn_off' ? 'off' : cur === 'on' ? 'off' : 'on');
          break;
        case 'select': set(id, data.option); break;
        case 'number': set(id, String(data.value)); break;
        case 'cover':
          if (svc === 'open_cover') moveCover(id, 100);
          else if (svc === 'close_cover') moveCover(id, 0);
          else if (svc === 'set_cover_position') moveCover(id, Math.round(data.position));
          else if (svc === 'stop_cover') set(id, (states.get(id).attributes.current_position ?? 0) > 0 ? 'open' : 'closed');
          else if (svc === 'toggle') moveCover(id, cur === 'closed' ? 100 : 0);
          break;
        case 'lock':
          set(id, svc === 'unlock' || svc === 'open' ? 'unlocked' : 'locked');
          break;
        case 'valve':
          set(id, svc === 'open_valve' ? 'open' : svc === 'close_valve' ? 'closed' : cur === 'open' ? 'closed' : 'open');
          break;
        case 'climate':
          if (svc === 'set_temperature') set(id, data.hvac_mode || cur, { temperature: Number(data.temperature) });
          else if (svc === 'set_hvac_mode') set(id, data.hvac_mode, { hvac_action: data.hvac_mode === 'off' ? 'off' : 'heating' });
          else if (svc === 'turn_off') set(id, 'off', { hvac_action: 'off' });
          else if (svc === 'turn_on') set(id, 'heat', { hvac_action: 'heating' });
          break;
        case 'update': {
          const a = states.get(id).attributes;
          if (svc === 'install') {
            if (cur !== 'on') throw new Error(`${a.friendly_name || id} is already up to date`);
            set(id, 'on', { in_progress: true });
            timers.push(setTimeout(() => set(id, 'off', { in_progress: false, installed_version: a.latest_version }), 3000));
          } else if (svc === 'skip') set(id, 'off', { skipped_version: a.latest_version });
          break;
        }
        default:
          throw new Error(`${domain}.${svc} isn't simulated in the demo`);
      }
    }
  }

  // ---- automation interpreter ---------------------------------------------------------

  const autoEntityFor = (configId) => [...states.values()].find((s) => s.entity_id.startsWith('automation.') && s.attributes.id === configId)?.entity_id;
  const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

  function triggerMatches(t, id, old, next) {
    const type = t.trigger || t.platform;
    if (!list(t.entity_id).includes(id) || t.attribute) return false;
    if (type === 'state') {
      if (t.to != null && !list(t.to).map(String).includes(next.state)) return false;
      if (t.from != null && !list(t.from).map(String).includes(old.state)) return false;
      return true;
    }
    if (type === 'numeric_state') {
      const inside = (x) => Number.isFinite(x) && (t.above == null || x > Number(t.above)) && (t.below == null || x < Number(t.below));
      return inside(parseFloat(next.state)) && !inside(parseFloat(old.state));
    }
    return false;
  }

  // Is the state a trigger waits for still true? (for "...for 10 minutes")
  function triggerHolds(t, s) {
    if (!s) return false;
    const type = t.trigger || t.platform;
    if (type === 'state') return t.to == null || list(t.to).map(String).includes(s.state);
    if (type === 'numeric_state') {
      const x = parseFloat(s.state);
      return Number.isFinite(x) && (t.above == null || x > Number(t.above)) && (t.below == null || x < Number(t.below));
    }
    return false;
  }

  // Triggers with "for": started when the state is reached, cancelled if it changes back.
  const pendingFor = new Map();
  function checkStateTriggers(id, old, next) {
    for (const [configId, cfg] of automations) {
      const ent = autoEntityFor(configId);
      if (!ent || stateOf(ent) !== 'on') continue;
      let fired = false;
      list(cfg.triggers || cfg.trigger).forEach((t, i) => {
        if (!list(t.entity_id).includes(id) || t.attribute) return;
        const key = `${configId}#${i}`;
        if (t.for != null) {
          if (!triggerHolds(t, next)) { clearTimeout(pendingFor.get(key)); pendingFor.delete(key); return; }
          if (triggerMatches(t, id, old, next) && !pendingFor.has(key)) {
            pendingFor.set(key, setTimeout(() => {
              pendingFor.delete(key);
              if (stateOf(ent) === 'on' && triggerHolds(t, states.get(id))) runAutomation(configId, { id: t.id, entity_id: id, from_state: old, to_state: states.get(id) });
            }, delayMs(t.for)));
          }
          return;
        }
        if (!fired && triggerMatches(t, id, old, next)) {
          fired = true;
          runAutomation(configId, { id: t.id, entity_id: id, from_state: old, to_state: next });
        }
      });
    }
  }

  function checkTimeTriggers() {
    const d = new Date();
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (hhmm === lastMinute) return;
    lastMinute = hhmm;
    for (const [configId, cfg] of automations) {
      const ent = autoEntityFor(configId);
      if (!ent || stateOf(ent) !== 'on') continue;
      const trig = list(cfg.triggers || cfg.trigger).find((t) => (t.trigger || t.platform) === 'time' && list(t.at).some((at) => String(at).slice(0, 5) === hhmm));
      if (trig) runAutomation(configId, { id: trig.id, platform: 'time' });
    }
  }

  const timeToMinutes = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

  function conditionPasses(c, ctx) {
    const type = c.condition;
    if (type === 'state') return list(c.entity_id).every((id) => list(c.state).map(String).includes(stateOf(id)));
    if (type === 'numeric_state') return list(c.entity_id).every((id) => {
      const v = parseFloat(stateOf(id));
      return Number.isFinite(v) && (c.above == null || v > Number(c.above)) && (c.below == null || v < Number(c.below));
    });
    if (type === 'time') {
      const d = new Date();
      const mins = d.getHours() * 60 + d.getMinutes();
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      if (c.weekday && !list(c.weekday).includes(days[d.getDay()])) return false;
      const after = c.after ? timeToMinutes(c.after) : null;
      const before = c.before ? timeToMinutes(c.before) : null;
      if (after != null && before != null && after > before) return mins >= after || mins < before;
      return (after == null || mins >= after) && (before == null || mins < before);
    }
    if (type === 'trigger') return list(c.id).includes(ctx.trigger?.id);
    if (type === 'and') return list(c.conditions).every((x) => conditionPasses(x, ctx));
    if (type === 'or') return list(c.conditions).some((x) => conditionPasses(x, ctx));
    if (type === 'not') return !list(c.conditions).some((x) => conditionPasses(x, ctx));
    return true; // templates and other kinds can't be evaluated in the demo
  }

  const delayMs = (d) => {
    if (typeof d === 'number') return d * 1000;
    if (typeof d === 'string') { const [h, m, s] = d.split(':').map(Number); return ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000; }
    return ((d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0)) * 1000 + (d.milliseconds || 0);
  };

  async function runSequence(actions, ctx) {
    for (const a of list(actions)) {
      if (ctx.cancelled) return;
      if (a.action || a.service) {
        const [domain, svc] = (a.action || a.service).split('.');
        try { await service(domain, svc, a.data || {}, a.target || {}); } catch (e) { console.warn('Demo automation step failed:', e.message); }
      } else if (a.delay != null) {
        let left = delayMs(a.delay);
        while (left > 0 && !ctx.cancelled) { await sleep(Math.min(left, 250)); left -= 250; }
      } else if (a.repeat) {
        for (let i = 0; i < (a.repeat.count || 1) && !ctx.cancelled; i++) await runSequence(a.repeat.sequence, ctx);
      } else if (a.if) {
        await runSequence(list(a.if).every((c) => conditionPasses(c, ctx)) ? a.then : a.else, ctx);
      } else if (a.choose) {
        const opt = list(a.choose).find((o) => list(o.conditions).every((c) => conditionPasses(c, ctx)));
        await runSequence(opt ? opt.sequence : a.default, ctx);
      } else if (a.stop != null) {
        return;
      }
    }
  }

  async function runAutomation(configId, trigger, skipConditions = false) {
    const cfg = automations.get(configId);
    const ent = autoEntityFor(configId);
    if (!cfg || !ent) return;
    const mode = cfg.mode || 'single';
    const current = running.get(configId);
    if (current && mode === 'single') return;
    if (current && mode === 'restart') current.cancelled = true;
    if (current && mode === 'queued') await current.done;
    if (!skipConditions && !list(cfg.conditions || cfg.condition).every((c) => conditionPasses(c, { trigger }))) return;
    const ctx = { cancelled: false, trigger };
    ctx.done = (async () => {
      set(ent, undefined, { last_triggered: nowIso(), current: 1 });
      await runSequence(cfg.actions || cfg.action, ctx);
    })();
    running.set(configId, ctx);
    try { await ctx.done; } finally {
      if (running.get(configId) === ctx) { running.delete(configId); set(ent, undefined, { current: 0 }); }
    }
  }

  // ---- devices from the catalogue -------------------------------------------------

  function uniqueEntityId(base) {
    let id = base, i = 2;
    while (states.has(id) || entities.has(id)) id = `${base}_${i++}`;
    return id;
  }

  function addEntity(deviceId, entityId, name, state, attrs, category) {
    const t = nowIso();
    states.set(entityId, { entity_id: entityId, state: String(state), attributes: { friendly_name: name, ...attrs }, last_changed: t, last_updated: t });
    entities.set(entityId, { entity_id: entityId, device_id: deviceId, area_id: null, hidden_by: null, entity_category: category || null, disabled_by: null, name: null, original_name: name, platform: 'demo' });
    emit({ type: 'update', entity_id: entityId, state: states.get(entityId) });
  }

  function createDevice(product) {
    const id = 'demo_' + randId();
    const brand = product.model.split(' ')[0];
    devices.set(id, {
      id, name: product.name, name_by_user: null, manufacturer: brand, model: product.model.replace(/\s*\(.*\)$/, ''),
      sw_version: '1.0.0', area_id: null, entry_type: null, product: product.id,
    });
    const base = slug(product.name);
    for (const t of templatesFor(product)) {
      const eid = uniqueEntityId(`${t.domain}.${base}${t.suffix ? '_' + t.suffix : ''}`);
      addEntity(id, eid, `${product.name}${t.label ? ' ' + t.label : ''}`, t.state, t.attrs, t.category);
    }
    emitRegistry();
    save();
    return id;
  }

  // ---- loading and live-ish behaviour ---------------------------------------------

  function toState(e, changed) {
    const attributes = { friendly_name: e.name, ...(e.attrs || {}) };
    if (e.class) attributes.device_class = e.class;
    if (e.unit) attributes.unit_of_measurement = e.unit;
    return { entity_id: e.id, state: String(e.state), attributes, last_changed: changed, last_updated: changed };
  }

  function buildFromSnapshot(home, autos, hist) {
    const changed = new Date(Date.parse(home.generated) + shift).toISOString();
    for (const a of home.areas) areas.set(a.id, { area_id: a.id, name: a.name });
    const areaByName = (n) => [...areas.values()].find((a) => a.name === n)?.area_id || null;
    const addRegistry = (e, deviceId) => entities.set(e.id, {
      entity_id: e.id, device_id: deviceId, area_id: null, hidden_by: e.hidden ? 'user' : null,
      entity_category: e.category || null, disabled_by: null, name: null, original_name: e.name, platform: 'snapshot',
    });
    for (const d of home.devices) {
      devices.set(d.id, {
        id: d.id, name: d.name, name_by_user: null, manufacturer: d.manufacturer, model: d.model, sw_version: d.firmware,
        area_id: areaByName(d.area), entry_type: d.manufacturer === 'Home Assistant' ? 'service' : null,
      });
      for (const e of d.entities) { states.set(e.id, toState(e, changed)); addRegistry(e, d.id); }
    }
    for (const e of home.entitiesWithoutDevice) { states.set(e.id, toState(e, changed)); addRegistry(e, null); }
    for (const [id, rows] of Object.entries(hist.series)) {
      const last = rows[rows.length - 1];
      if (last && states.has(id)) states.get(id).last_changed = new Date(Date.parse(last[0]) + shift).toISOString();
    }
    for (const a of autos) automations.set(a.config.id, a.config);
  }

  async function connect(onMessage, setStatus) {
    emit = onMessage;
    setStatus({ mode: 'demo', state: 'connecting', message: 'Loading the snapshot' });
    try {
      const [home, autos, hist] = await Promise.all(
        ['home.json', 'automations.json', 'history.json'].map((f) => fetch(new URL(f, SNAPSHOT)).then((r) => {
          if (!r.ok) throw new Error(`${f} not found`);
          return r.json();
        })),
      );
      historyData = hist;
      shift = Date.now() - Date.parse(hist.to);
      const restored = loadSaved();
      if (!restored) buildFromSnapshot(home, autos, hist);
      // States first, so screens built when the registry arrives already have them.
      emit({ type: 'all', states: [...states.values()] });
      emitRegistry();
      setStatus({ mode: 'demo', state: 'connected', message: restored ? 'Demo home (your changes are kept on this device)' : `Snapshot from ${new Date(home.generated).toLocaleDateString()}` });
      startTicking();
    } catch (e) {
      setStatus({ mode: 'demo', state: 'error', message: `Demo data missing (${e.message}). Run the app from the SMART folder.` });
    }
  }

  function startTicking() {
    // Plugs that are on wobble around their usual power and add up energy.
    timers.push(setInterval(() => {
      for (const s of states.values()) {
        if (s.attributes.device_class !== 'power' || !s.entity_id.startsWith('sensor.')) continue;
        const sw = siblings(s.entity_id).find((id) => id.startsWith('switch.') && !entities.get(id)?.entity_category);
        if (sw && stateOf(sw) !== 'on') continue;
        const base = s.entity_id === HOME.plug.power ? 8.7 : 11.5;
        const w = base + Math.random() * 0.5;
        set(s.entity_id, w.toFixed(1));
        const energy = siblings(s.entity_id).find((id) => states.get(id)?.attributes.device_class === 'energy' && /today/.test(id));
        if (energy) set(energy, (parseFloat(stateOf(energy)) + (w * 5) / 3600 / 1000).toFixed(4));
      }
    }, 5000));
    // Rooms drift a little; heated rooms warm towards their target.
    timers.push(setInterval(() => {
      const t = parseFloat(stateOf(HOME.climate.temperature));
      if (Number.isFinite(t)) {
        // The heater warms the room towards about 24°, without it the room cools towards about 19°
        // (it used to keep climbing as long as the heater was on).
        const goal = stateOf(HOME.heater.tracker) === 'on' ? 24 : 19;
        // A room far past the goal (from before this limit) settles quickly.
        const size = Math.abs(goal - t) > 3 ? 0.5 : 0.1;
        if (Math.abs(goal - t) >= 0.1 && Math.random() < 0.6) set(HOME.climate.temperature, (t + Math.sign(goal - t) * size).toFixed(1));
      }
      for (const s of states.values()) {
        if (!s.entity_id.startsWith('climate.')) continue;
        const cur = s.attributes.current_temperature, target = s.attributes.temperature;
        if (cur == null) continue;
        const goal = s.state === 'off' ? 17 : target;
        if (Math.abs(goal - cur) >= 0.1) set(s.entity_id, undefined, { current_temperature: Math.round((cur + Math.sign(goal - cur) * 0.1) * 10) / 10, hvac_action: s.state === 'off' ? 'off' : goal > cur ? 'heating' : 'idle' });
      }
    }, 45000));
    timers.push(setInterval(checkTimeTriggers, 15000));
  }

  function disconnect() {
    for (const t of timers) { clearInterval(t); clearTimeout(t); }
    for (const t of pendingFor.values()) clearTimeout(t);
    pendingFor.clear();
    timers.length = 0;
    clearTimeout(joinTimer);
    for (const ctx of running.values()) ctx.cancelled = true;
  }

  async function fetchHistory(ids, startIso, endIso) {
    const start = Date.parse(startIso), end = Date.parse(endIso);
    const out = {};
    for (const id of ids) {
      const base = (historyData?.series[id] || []).map(([t, s]) => [new Date(Date.parse(t) + shift).toISOString(), s]);
      const all = [...base, ...(log.get(id) || [])];
      const before = all.filter(([t]) => Date.parse(t) < start).pop();
      const rows = all.filter(([t]) => { const v = Date.parse(t); return v >= start && v <= end; });
      if (before) rows.unshift([new Date(start).toISOString(), before[1]]);
      else if (!rows.length && states.has(id)) rows.push([new Date(start).toISOString(), states.get(id).state]);
      out[id] = rows;
    }
    return out;
  }

  // ---- the backend interface ---------------------------------------------------------

  return {
    mode: 'demo',
    connect,
    disconnect,
    callService: async (domain, svc, data, target) => { await sleep(100); return service(domain, svc, data, target); },
    fetchHistory,

    // automations
    async fetchAutomationConfig(configId) { return automations.get(configId) ? structuredClone(automations.get(configId)) : null; },
    async saveAutomation(configId, config) {
      await sleep(200);
      const cfg = { ...structuredClone(config), id: configId };
      automations.set(configId, cfg);
      let ent = autoEntityFor(configId);
      if (ent) set(ent, undefined, { friendly_name: cfg.alias, mode: cfg.mode || 'single' });
      else {
        ent = uniqueEntityId('automation.' + slug(cfg.alias || 'automation'));
        addEntity(null, ent, cfg.alias || 'Automation', 'on', { id: configId, mode: cfg.mode || 'single', last_triggered: null, current: 0 });
        emitRegistry();
      }
      save();
    },
    async deleteAutomation(configId) {
      await sleep(150);
      const ent = autoEntityFor(configId);
      automations.delete(configId);
      if (ent) { states.delete(ent); entities.delete(ent); emit({ type: 'update', entity_id: ent, state: null }); emitRegistry(); }
      save();
    },

    // rooms
    async createArea(name) {
      let id = slug(name), i = 2;
      while (areas.has(id)) id = `${slug(name)}_${i++}`;
      const area = { area_id: id, name };
      areas.set(id, area);
      emitRegistry(); save();
      return area;
    },
    async renameArea(areaId, name) { const a = areas.get(areaId); if (a) { a.name = name; emitRegistry(); save(); } },
    async deleteArea(areaId) {
      areas.delete(areaId);
      for (const d of devices.values()) if (d.area_id === areaId) d.area_id = null;
      emitRegistry(); save();
    },

    // devices
    async updateDevice(deviceId, patch) {
      const d = devices.get(deviceId);
      if (!d) throw new Error('device not found');
      if ('name_by_user' in patch) {
        // Like Home Assistant, entity names follow the device name ("<device> <entity>").
        const prev = d.name_by_user || d.name;
        d.name_by_user = patch.name_by_user || null;
        const next = d.name_by_user || d.name;
        if (prev !== next) {
          for (const e of entities.values()) {
            if (e.device_id !== deviceId) continue;
            const fn = states.get(e.entity_id)?.attributes?.friendly_name || '';
            if (e.label == null) e.label = fn.startsWith(prev) ? fn.slice(prev.length).trim() : null;
            if (e.label != null) set(e.entity_id, undefined, { friendly_name: [next, e.label].filter(Boolean).join(' ') });
          }
        }
      }
      if ('area_id' in patch) d.area_id = patch.area_id || null;
      emitRegistry(); save();
    },
    async removeDevice(deviceId) {
      await sleep(300);
      for (const e of [...entities.values()]) {
        if (e.device_id !== deviceId) continue;
        entities.delete(e.entity_id);
        states.delete(e.entity_id);
        emit({ type: 'update', entity_id: e.entity_id, state: null });
      }
      devices.delete(deviceId);
      emitRegistry(); save();
    },

    // pairing
    async permitJoin(seconds, product) {
      clearTimeout(joinTimer);
      if (product) joinTimer = setTimeout(() => createDevice(product), 4500);
    },
    async stopJoin() { clearTimeout(joinTimer); },
    async flowStart(handler, product) {
      const flowId = randId();
      flows.set(flowId, { handler, product });
      const host = { name: 'host', type: 'string', required: true };
      const user = { name: 'username', type: 'string', required: true };
      const pass = { name: 'password', required: true, selector: { text: { type: 'password' } } };
      const schema = {
        tplink: [host, user, pass],
        shelly: [host],
        esphome: [host, { name: 'port', type: 'integer', default: 6053 }],
        onvif: [{ name: 'name', type: 'string', default: product?.name || 'Camera' }, host, { name: 'port', type: 'integer', default: 2020 }, user, pass],
      }[handler] || [host];
      return { type: 'form', flow_id: flowId, handler, step_id: 'user', data_schema: schema, errors: {} };
    },
    async flowSubmit(flowId, data) {
      const f = flows.get(flowId);
      if (!f) return { type: 'abort', reason: 'unknown_flow' };
      if (!data.host || !/^[\w.-]+$/.test(String(data.host).trim())) {
        return { type: 'form', flow_id: flowId, step_id: 'user', data_schema: (await this.flowStart(f.handler, f.product)).data_schema, errors: { host: 'Enter an IP address like 192.168.88.50' } };
      }
      await sleep(1400);
      flows.delete(flowId);
      if (f.product) createDevice(f.product);
      return { type: 'create_entry', title: f.product?.name || 'Device' };
    },
    async flowAbort(flowId) { flows.delete(flowId); },
    async matterCommission(code, product) {
      const digits = String(code).replace(/\D/g, '');
      if (!/^MT:/.test(code) && digits.length !== 11 && digits.length !== 21) throw new Error('A Matter code has 11 digits, or starts with MT: when taken from a QR code');
      await sleep(2500);
      if (product) createDevice(product);
    },
    async cloudAdd(product) { await sleep(1200); return createDevice(product); },

    // demo-only controls
    simulate: {
      toggleWindow() { set(HOME.window.contact, stateOf(HOME.window.contact) === 'on' ? 'off' : 'on'); },
      walkIn() { this.trigger(HOME.presence.occupancy); },
      nudgeTemperature(delta) {
        const t = parseFloat(stateOf(HOME.climate.temperature));
        if (Number.isFinite(t)) set(HOME.climate.temperature, (t + delta).toFixed(1));
      },
      // Fire a sensor: motion/presence clear again after their timeout.
      trigger(entityId) {
        const s = states.get(entityId);
        if (!s) return;
        if (entityId.startsWith('event.')) { set(entityId, nowIso(), { event_type: 'single' }); return; }
        if (s.state === 'on' && !['occupancy', 'motion', 'presence'].includes(s.attributes.device_class)) { set(entityId, 'off'); return; }
        set(entityId, 'on');
        if (['occupancy', 'motion', 'presence'].includes(s.attributes.device_class)) {
          const secs = entityId === HOME.presence.occupancy ? (parseFloat(stateOf(HOME.presence.timeout)) || 15) : 20;
          timers.push(setTimeout(() => set(entityId, 'off'), secs * 1000));
        }
      },
      set(entityId, state) { set(entityId, state); },
      // Pretend Home Assistant has a new version, to try installing updates.
      updateAvailable() {
        const id = 'update.home_assistant_core_update';
        const a = states.get(id)?.attributes;
        if (!a) return;
        const [y, m, p] = String(a.installed_version || '2026.11.1').split('.').map(Number);
        set(id, 'on', { latest_version: `${y}.${m}.${(p || 0) + 1}`, release_summary: 'Bug fixes and small improvements.', in_progress: false });
      },
    },
    resetDemo() {
      clearTimeout(saveTimer);
      blockSave = true;
      try { localStorage.removeItem(WORLD_KEY); } catch { /* nothing saved */ }
    },
  };
}
