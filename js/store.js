// The single source of truth: entity states, plus the device, room and entity
// registries. Screens "watch" what they show and re-draw their own pieces.

import { HOME } from './config.js';
import { productForDevice } from './catalog.js';
import { sleep, toast } from './util.js';

const subs = new Map();      // entity_id -> Set of callbacks
const statusSubs = new Set();
const registrySubs = new Set();

export const store = {
  states: new Map(),
  devices: new Map(),        // device_id -> device registry entry
  areas: new Map(),          // area_id -> { area_id, name }
  entities: new Map(),       // entity_id -> entity registry entry
  backend: null,
  status: { mode: null, state: 'idle', message: '' },

  get(id) { return this.states.get(id) || null; },

  all(domain) {
    return [...this.states.values()].filter((s) => s.entity_id.startsWith(domain + '.'));
  },

  // Calls fn(...states) now and again whenever any of the ids change.
  watch(ids, fn) {
    const list = [].concat(ids);
    const run = () => fn(...list.map((i) => this.get(i)));
    for (const id of list) {
      if (!subs.has(id)) subs.set(id, new Set());
      subs.get(id).add(run);
    }
    run();
    return () => { for (const id of list) subs.get(id)?.delete(run); };
  },

  onStatus(fn) {
    statusSubs.add(fn);
    fn(this.status);
    return () => statusSubs.delete(fn);
  },

  setStatus(patch) {
    Object.assign(this.status, patch);
    for (const fn of statusSubs) fn(this.status);
  },

  // Called whenever devices, rooms or entity assignments change.
  onRegistry(fn) {
    registrySubs.add(fn);
    fn();
    return () => registrySubs.delete(fn);
  },

  // Backends send { type: 'all' | 'update' | 'registry', ... }.
  apply(msg) {
    if (msg.type === 'all') {
      this.states.clear();
      for (const s of msg.states) this.states.set(s.entity_id, s);
      const fns = new Set();
      for (const set of subs.values()) for (const fn of set) fns.add(fn);
      for (const fn of fns) fn();
    } else if (msg.type === 'update') {
      if (msg.state) this.states.set(msg.entity_id, msg.state);
      else this.states.delete(msg.entity_id);
      for (const fn of subs.get(msg.entity_id) || []) fn();
    } else if (msg.type === 'registry') {
      this.devices = new Map(msg.devices.map((d) => [d.id, d]));
      this.areas = new Map(msg.areas.map((a) => [a.area_id, a]));
      this.entities = new Map(msg.entities.map((e) => [e.entity_id, e]));
      for (const fn of registrySubs) fn();
    }
  },

  async call(domain, service, target, data = {}) {
    if (!this.backend) throw new Error('Not connected');
    const t = typeof target === 'string' ? { entity_id: target } : target;
    try {
      return await this.backend.callService(domain, service, data, t);
    } catch (e) {
      toast(`Couldn't ${service.replace(/_/g, ' ')}: ${e.message}`, 'error');
      throw e;
    }
  },

  press(entityId) { return this.call('button', 'press', entityId); },
};

// ---- registry helpers ---------------------------------------------------------

const SYSTEM_MAKERS = ['Home Assistant', 'Official apps', 'Met.no', 'mdeweerd', 'Home Assistant Community Apps'];

export function deviceName(d) { return d?.name_by_user || d?.name || 'Device'; }
export function areaName(id) { return store.areas.get(id)?.name || null; }

export function deviceEntities(deviceId) {
  return [...store.entities.values()].filter((e) => e.device_id === deviceId && !e.disabled_by);
}

export function entityArea(entityId) {
  const e = store.entities.get(entityId);
  if (!e) return null;
  if (e.area_id) return e.area_id;
  return e.device_id ? store.devices.get(e.device_id)?.area_id || null : null;
}

// Devices shown in Home and the Devices screen (hides Home Assistant's own parts).
export function isUserDevice(d) {
  if (!d) return false;
  if (productForDevice(d)) return true;
  if (d.entry_type === 'service') return false;
  if (SYSTEM_MAKERS.includes(d.manufacturer)) return false;
  if (d.model === 'Home Assistant App' || d.name === 'Sun' || d.name === 'Raspberry Pi') return false;
  return deviceEntities(d.id).some((e) => !e.entity_category);
}

export function userDevices() {
  return [...store.devices.values()].filter(isUserDevice)
    .sort((a, b) => deviceName(a).localeCompare(deviceName(b)));
}

export function sortedAreas() {
  return [...store.areas.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Friendly entity label: "Room · Device · Entity".
export function entityLabel(entityId) {
  const s = store.get(entityId);
  const e = store.entities.get(entityId);
  const dev = e?.device_id ? store.devices.get(e.device_id) : null;
  const name = s?.attributes?.friendly_name || e?.name || e?.original_name || entityId;
  const room = areaName(entityArea(entityId));
  return [room, name].filter(Boolean).join(' · ') || (dev ? deviceName(dev) : entityId);
}

// ---- heater and TV power through their trackers ---------------------------------

// Switch the heater or TV on or off using its tracker, so a toggle code is only
// sent when the device is believed to be in the other state.
export async function ensurePower(device, wantOn) {
  const cfg = HOME[device];
  const isOnNow = store.get(cfg.tracker)?.state === 'on';
  if (isOnNow === wantOn) return false;
  await store.press(cfg.buttons.power);
  return true;
}

// Correct a tracker without sending anything to the device.
export function setTracker(device, on) {
  return store.call('input_boolean', on ? 'turn_on' : 'turn_off', HOME[device].tracker);
}

export async function runQuickAction(action) {
  for (const step of action.steps) {
    if (step.ensure) await ensurePower(step.ensure, step.on);
    else if (step.press) await store.press(step.press);
    else if (step.call) {
      const [domain, service] = step.call.split('.');
      await store.call(domain, service, step.target, step.data || {});
    } else if (step.wait) await sleep(step.wait);
  }
}
