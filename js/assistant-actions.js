// Carries out a change the Evra assistant prepared, once the person approved it,
// and checks it really happened. The assistant server never changes anything:
// it only describes the change; this file does it through the app's own backend
// (demo or live), exactly as the screens would.

import { HOME } from './config.js';
import { store, ensurePower, deviceName } from './store.js';
import { sleep, setPrefs } from './util.js';
import { SCENES, runScene } from './scenes.js';

const TEMPLATE_KEY = 'evra.template';

// Waits until test() is true (or gives up), for changes that arrive a moment later.
async function until(test, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(200);
  }
  return test();
}

const stateOf = (id) => store.get(id)?.state;
const nameOf = (id) => store.get(id)?.attributes?.friendly_name || id;

async function control(steps) {
  const lines = [];
  let failed = 0;
  let lastIr = false;
  for (const s of steps) {
    try {
      if (s.power) {
        // The TV / heater: a toggle-style infrared code, sent only if the tracker says it's in the other state.
        if (lastIr) await sleep(600);
        const pressed = await ensurePower(s.power, s.on);
        lastIr = true;
        const ok = await until(() => (stateOf(HOME[s.power].tracker) === 'on') === s.on, 3000);
        lines.push(`${s.power === 'tv' ? 'TV' : 'Heater'} ${s.on ? 'on' : 'off'}${pressed ? '' : ' (it already was)'}${ok ? '' : ' (not confirmed)'}`);
        if (!ok) failed++;
        continue;
      }
      lastIr = false;
      await store.call(s.domain, s.service, s.entity_id, s.data || {});
      const want = { turn_on: 'on', turn_off: 'off', open_cover: 'open', close_cover: 'closed', open_valve: 'open', close_valve: 'closed' }[s.service];
      let ok = true;
      if (want) ok = await until(() => stateOf(s.entity_id) === want, s.domain === 'cover' ? 5000 : 3000);
      if (s.service === 'set_temperature') ok = await until(() => Number(store.get(s.entity_id)?.attributes?.temperature) === Number(s.data.temperature));
      if (s.service === 'set_cover_position') ok = await until(() => store.get(s.entity_id)?.attributes?.current_position === s.data.position, 5000);
      lines.push(`${nameOf(s.entity_id)} ${ok ? `is ${stateOf(s.entity_id)}` : 'didn\'t confirm the change'}`);
      if (!ok) failed++;
    } catch (e) {
      failed++;
      lines.push(`${nameOf(s.entity_id)}: ${e.message}`);
    }
  }
  return { ok: failed === 0, detail: lines.join('; ') };
}

// Runs one approved proposal. Returns { ok, detail } in plain words.
export async function runProposal(p) {
  const a = p.action || {};
  const b = store.backend;
  if (!b) return { ok: false, detail: 'The app isn\'t connected.' };
  try {
    switch (a.type) {
      case 'control':
        return await control(a.steps || []);
      case 'press': {
        for (let i = 0; i < (a.times || 1); i++) {
          await store.press(a.entity_id);
          if (i < a.times - 1) await sleep(400);
        }
        return { ok: true, detail: `Pressed ${nameOf(a.entity_id)}${a.times > 1 ? ` ${a.times} times` : ''}` };
      }
      case 'scene': {
        const scene = SCENES.find((s) => s.id === a.scene);
        if (!scene) return { ok: false, detail: 'That scene no longer exists.' };
        const r = await runScene(scene, a.rooms || 'all');
        if (!r.steps) return { ok: false, detail: 'Nothing in those rooms for this scene to change.' };
        return { ok: !r.failed, detail: r.failed ? `${r.failed} of ${r.steps} changes didn't work` : `${scene.name} started (${r.steps} change${r.steps === 1 ? '' : 's'})` };
      }
      case 'automation_save': {
        const id = a.automation_id || String(Date.now());
        await b.saveAutomation(id, a.config);
        const saved = await b.fetchAutomationConfig(id);
        const ok = saved && saved.alias === a.config.alias;
        return { ok: !!ok, detail: ok ? `Automation '${a.config.alias}' saved and on` : 'Saved, but it couldn\'t be read back' };
      }
      case 'automation_delete': {
        await b.deleteAutomation(a.automation_id);
        const gone = !(await b.fetchAutomationConfig(a.automation_id));
        return { ok: gone, detail: gone ? 'Automation deleted' : 'It still exists' };
      }
      case 'automation_state': {
        await store.call('automation', a.service, a.entity_id, a.service === 'trigger' ? { skip_condition: true } : {});
        if (a.service === 'trigger') return { ok: true, detail: 'Started' };
        const want = a.service === 'turn_on' ? 'on' : 'off';
        const ok = await until(() => stateOf(a.entity_id) === want);
        return { ok, detail: ok ? `Automation switched ${want}` : 'The automation didn\'t confirm' };
      }
      case 'room_create': {
        const area = await b.createArea(a.name);
        await until(() => store.areas.has(area.area_id));
        return { ok: true, detail: `Room '${a.name}' created` };
      }
      case 'room_rename': {
        await b.renameArea(a.area_id, a.name);
        const ok = await until(() => store.areas.get(a.area_id)?.name === a.name);
        return { ok, detail: ok ? `Renamed to '${a.name}'` : 'The new name didn\'t show up' };
      }
      case 'room_delete': {
        await b.deleteArea(a.area_id);
        const ok = await until(() => !store.areas.has(a.area_id));
        return { ok, detail: ok ? 'Room deleted' : 'The room is still there' };
      }
      case 'device_update': {
        await b.updateDevice(a.device_id, a.patch);
        const ok = await until(() => {
          const d = store.devices.get(a.device_id);
          return d && Object.entries(a.patch).every(([k, v]) => (d[k] ?? null) === (v ?? null));
        });
        const d = store.devices.get(a.device_id);
        return { ok, detail: ok ? ('name_by_user' in a.patch ? `Now called '${deviceName(d)}'` : `Moved to ${store.areas.get(d?.area_id)?.name || 'no room'}`) : 'The change didn\'t show up' };
      }
      case 'device_remove': {
        const d = store.devices.get(a.device_id);
        if (!d) return { ok: false, detail: 'That device is already gone.' };
        await b.removeDevice(a.device_id, d);
        const ok = await until(() => !store.devices.has(a.device_id), 8000);
        return { ok, detail: ok ? `${deviceName(d)} removed` : 'It\'s still listed' };
      }
      case 'device_add':
        location.hash = `#/devices/add/${encodeURIComponent(a.product)}`;
        return { ok: true, detail: 'Opened the Add device page; the person finishes the pairing there (nothing added yet)' };
      case 'update_install': {
        await store.call('update', 'install', a.entity_id);
        const ok = await until(() => store.get(a.entity_id)?.attributes?.in_progress || stateOf(a.entity_id) === 'off', 8000);
        return { ok, detail: ok ? (stateOf(a.entity_id) === 'off' ? 'Update installed' : 'Update installing') : 'The update didn\'t start' };
      }
      case 'setting':
        setPrefs(a.patch);
        return { ok: true, detail: 'Setting changed' };
      default:
        return { ok: false, detail: `The app doesn't know how to do '${a.type}'.` };
    }
  } catch (e) {
    return { ok: false, detail: e.message || String(e) };
  }
}

// "Review in editor": opens the automation editor filled in with the proposal.
export function openInEditor(p) {
  const a = p.action || {};
  try { sessionStorage.setItem(TEMPLATE_KEY, JSON.stringify(a.config)); } catch { /* storage blocked */ }
  location.hash = a.automation_id ? `#/automations/edit/${encodeURIComponent(a.automation_id)}?template=assistant` : '#/automations/new?template=assistant';
}

export function takeTemplate() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TEMPLATE_KEY) || 'null');
    sessionStorage.removeItem(TEMPLATE_KEY);
    return t;
  } catch { return null; }
}
