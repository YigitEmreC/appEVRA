// Carries out a change the Evra assistant prepared, once the person approved it,
// and checks it really happened. The assistant server never changes anything:
// it only describes the change; this file does it through the app's own backend
// (demo or live), exactly as the screens would.

import { HOME } from './config.js';
import { store, ensurePower, deviceName } from './store.js';
import { sleep, setPrefs } from './util.js';
import { SCENES, runScene } from './scenes.js';
import { evraNotifyConfig } from './notify-links.js';

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
// Card results are in Turkish, like Evra (they're also sent back to Evra as what happened).
const STATE_TR = { on: 'açık', off: 'kapalı', open: 'açık', closed: 'kapalı', heat: 'ısıtıyor', unavailable: 'ulaşılamıyor' };
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
        lines.push(`${s.power === 'tv' ? 'TV' : 'Isıtıcı'} ${s.on ? 'açık' : 'kapalı'}${pressed ? '' : ' (zaten öyleydi)'}${ok ? '' : ' (doğrulanamadı)'}`);
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
      lines.push(`${nameOf(s.entity_id)} ${ok ? `şimdi: ${STATE_TR[stateOf(s.entity_id)] || stateOf(s.entity_id)}` : 'değişikliği doğrulamadı'}`);
      if (!ok) failed++;
    } catch (e) {
      failed++;
      lines.push(`${nameOf(s.entity_id)}: ${e.message}`);
    }
  }
  return { ok: failed === 0, detail: lines.join('; ') };
}

// The assistant may never touch these, whatever a card says. The server already refuses
// them (webEVRA lib/assistant/home.js BLOCKED_DOMAINS); this is the second lock, in case a
// card was tampered with on the way.
const NEVER = /\b(lock|camera|alarm_control_panel|person|device_tracker|shell_command|rest_command|python_script|hassio|pyscript|command_line|recorder|system_log)\.[a-z0-9_]+/;
const touchesBlocked = (a) => NEVER.test(JSON.stringify(a || {}));

// Runs one approved proposal. Returns { ok, detail } in plain words.
export async function runProposal(p) {
  const a = p.action || {};
  const b = store.backend;
  if (!b) return { ok: false, detail: 'Uygulama bağlı değil.' };
  if (touchesBlocked(a)) return { ok: false, detail: 'Kilitler, kameralar ve alarmlar asistanla değiştirilemez; bunu uygulamadan kendiniz yapın.' };
  try {
    switch (a.type) {
      case 'control':
        return await control(a.steps || []);
      case 'press': {
        for (let i = 0; i < (a.times || 1); i++) {
          await store.press(a.entity_id);
          if (i < a.times - 1) await sleep(400);
        }
        return { ok: true, detail: `${nameOf(a.entity_id)} basıldı${a.times > 1 ? ` (${a.times} kez)` : ''}` };
      }
      case 'scene': {
        const scene = SCENES.find((s) => s.id === a.scene);
        if (!scene) return { ok: false, detail: 'Bu sahne artık yok.' };
        const r = await runScene(scene, a.rooms || 'all');
        if (!r.steps) return { ok: false, detail: 'Bu odalarda sahnenin değiştireceği bir şey yok.' };
        return { ok: !r.failed, detail: r.failed ? `${r.steps} değişiklikten ${r.failed} tanesi olmadı` : `${scene.name} başladı (${r.steps} değişiklik)` };
      }
      case 'automation_save': {
        const id = a.automation_id || String(Date.now());
        // "Tell the phones" goes through Evra's notifications, not the Home Assistant app.
        await b.saveAutomation(id, evraNotifyConfig(a.config) || a.config);
        const saved = await b.fetchAutomationConfig(id);
        const ok = saved && saved.alias === a.config.alias;
        return { ok: !!ok, detail: ok ? `'${a.config.alias}' otomasyonu kaydedildi ve açık` : 'Kaydedildi ama geri okunamadı' };
      }
      case 'automation_delete': {
        await b.deleteAutomation(a.automation_id);
        const gone = !(await b.fetchAutomationConfig(a.automation_id));
        return { ok: gone, detail: gone ? 'Otomasyon silindi' : 'Hâlâ duruyor' };
      }
      case 'automation_state': {
        await store.call('automation', a.service, a.entity_id, a.service === 'trigger' ? { skip_condition: true } : {});
        if (a.service === 'trigger') return { ok: true, detail: 'Çalıştırıldı' };
        const want = a.service === 'turn_on' ? 'on' : 'off';
        const ok = await until(() => stateOf(a.entity_id) === want);
        return { ok, detail: ok ? `Otomasyon ${want === 'on' ? 'açıldı' : 'kapatıldı'}` : 'Otomasyon doğrulamadı' };
      }
      case 'room_create': {
        const area = await b.createArea(a.name);
        await until(() => store.areas.has(area.area_id));
        return { ok: true, detail: `'${a.name}' odası oluşturuldu` };
      }
      case 'room_rename': {
        await b.renameArea(a.area_id, a.name);
        const ok = await until(() => store.areas.get(a.area_id)?.name === a.name);
        return { ok, detail: ok ? `Yeni adı '${a.name}'` : 'Yeni ad görünmedi' };
      }
      case 'room_delete': {
        await b.deleteArea(a.area_id);
        const ok = await until(() => !store.areas.has(a.area_id));
        return { ok, detail: ok ? 'Oda silindi' : 'Oda hâlâ duruyor' };
      }
      case 'device_update': {
        await b.updateDevice(a.device_id, a.patch);
        const ok = await until(() => {
          const d = store.devices.get(a.device_id);
          return d && Object.entries(a.patch).every(([k, v]) => (d[k] ?? null) === (v ?? null));
        });
        const d = store.devices.get(a.device_id);
        return { ok, detail: ok ? ('name_by_user' in a.patch ? `Yeni adı '${deviceName(d)}'` : `Şimdi: ${store.areas.get(d?.area_id)?.name || 'odasız'}`) : 'Değişiklik görünmedi' };
      }
      case 'device_remove': {
        const d = store.devices.get(a.device_id);
        if (!d) return { ok: false, detail: 'Bu cihaz zaten yok.' };
        const r = await b.removeDevice(a.device_id, d);
        const ok = await until(() => !store.devices.has(a.device_id) || Boolean(store.devices.get(a.device_id)?.disabled_by), 8000);
        return { ok, detail: ok ? `${deviceName(d)} kaldırıldı${r?.hidden ? ' (ulaşılamadığı için gizlendi; yeniden kullanmak için tekrar eşleştirilmeli)' : ''}` : 'Hâlâ listede' };
      }
      case 'device_add':
        location.hash = `#/devices/add/${encodeURIComponent(a.product)}`;
        return { ok: true, detail: 'Cihaz ekle sayfası açıldı; eşleştirme orada tamamlanır (henüz bir şey eklenmedi)' };
      case 'update_install': {
        await store.call('update', 'install', a.entity_id);
        const ok = await until(() => store.get(a.entity_id)?.attributes?.in_progress || stateOf(a.entity_id) === 'off', 8000);
        return { ok, detail: ok ? (stateOf(a.entity_id) === 'off' ? 'Güncelleme kuruldu' : 'Güncelleme kuruluyor') : 'Güncelleme başlamadı' };
      }
      case 'setting':
        setPrefs(a.patch);
        return { ok: true, detail: 'Ayar değişti' };
      default:
        return { ok: false, detail: `Uygulama '${a.type}' işlemini bilmiyor.` };
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
