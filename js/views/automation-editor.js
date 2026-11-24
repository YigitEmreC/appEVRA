// Automation editor: build an automation from plain "When / Only if / Then"
// rows, or edit the raw configuration as JSON for anything more advanced.

import { HOME } from '../config.js';
import { store, entityArea, areaName } from '../store.js';
import { h, toast, isDev, setPrefs } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { pushEntities } from '../push.js';

// notify.notify (the Home Assistant app), or notify.send_message to the devices
// registered from Evra (any other send_message target is an ordinary action).
function isPhoneStep(a) {
  const svc = a?.action || a?.service;
  if (svc === 'notify.notify') return true;
  if (svc !== 'notify.send_message') return false;
  const ids = [].concat(a.target?.entity_id ?? a.data?.entity_id ?? []);
  // A device that has since been removed counts too; saving again drops it.
  return ids.length > 0 && ids.every((id) => {
    const e = store.entities.get(id);
    return e ? e.platform === 'html5' : id.startsWith('notify.');
  });
}

// ---- entity lists for the pickers ------------------------------------------------

const STATE_DOMAINS = ['binary_sensor', 'switch', 'light', 'lock', 'cover', 'input_boolean', 'button', 'event', 'siren', 'valve', 'climate', 'media_player', 'weather', 'vacuum', 'fan'];
// Conditions can also check whether it's dark (the sun) and the weather.
const CONDITION_DOMAINS = [...STATE_DOMAINS.filter((d) => !['button', 'event'].includes(d)), 'sun'];
const CONTROL_DOMAINS = ['light', 'switch', 'cover', 'lock', 'valve', 'siren', 'climate', 'input_boolean', 'fan', 'vacuum', 'scene', 'automation'];
// Sensors with a fixed list of states (such as a feeder's food level) can be watched like a device.
const isEnumSensor = (s) => s.entity_id.startsWith('sensor.') && Array.isArray(s.attributes?.options);
const ENUM_TR = { Enough: 'Yeterli', Low: 'Az', Empty: 'Boş', Full: 'Dolu' };
const PRESET_TR = { Auto: 'Otomatik', Sleep: 'Uyku', Favorite: 'Favori', Normal: 'Normal', Nature: 'Doğal rüzgâr' };

function entitiesFor(test) {
  return [...store.states.values()].filter((s) => {
    const reg = store.entities.get(s.entity_id);
    if (reg?.entity_category) return false;
    return test(s, reg);
  });
}

function entityPicker(list, value, onChange) {
  const groups = new Map();
  for (const s of list) {
    const room = areaName(entityArea(s.entity_id)) || 'Odasız';
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room).push(s);
  }
  const sel = h('select', { class: 'select', 'aria-label': 'Cihaz' },
    h('option', { value: '' }, 'Seçin…'),
    [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([room, items]) => h('optgroup', { label: room },
      items.sort((a, b) => (a.attributes.friendly_name || '').localeCompare(b.attributes.friendly_name || '', 'tr'))
        .map((s) => h('option', { value: s.entity_id, selected: s.entity_id === value }, s.attributes.friendly_name || s.entity_id)))));
  if (value && !list.some((s) => s.entity_id === value)) sel.append(h('option', { value, selected: true }, value));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function select(options, value, onChange, label) {
  const sel = h('select', { class: 'select', 'aria-label': label || 'Seçenek' }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function input(value, onChange, attrs = {}) {
  const el = h('input', { class: 'input', value: value ?? '', ...attrs });
  el.addEventListener('input', () => onChange(el.value));
  return el;
}

const domainOf = (id) => (id || '').split('.')[0];

// What a device can "become", for triggers and conditions:
// [value, as a trigger ("…olunca"), as a condition ("…ise")].
function stateOptions(entityId) {
  const s = store.get(entityId);
  const d = domainOf(entityId);
  const cls = s?.attributes?.device_class;
  const onOff = [['on', 'açılınca', 'açıksa'], ['off', 'kapanınca', 'kapalıysa']];
  if (d === 'binary_sensor') {
    if (['opening', 'door', 'window', 'garage_door'].includes(cls)) return [['on', 'açılınca', 'açıksa'], ['off', 'kapanınca', 'kapalıysa']];
    if (['occupancy', 'motion', 'presence'].includes(cls)) return [['on', 'birini görünce', 'birini görüyorsa'], ['off', 'kimseyi görmeyince', 'kimseyi görmüyorsa']];
    if (['smoke', 'gas', 'moisture'].includes(cls)) return [['on', 'alarm verince', 'alarm veriyorsa'], ['off', 'normale dönünce', 'normaldeyse']];
    return onOff;
  }
  if (d === 'sensor' && Array.isArray(s?.attributes?.options)) return s.attributes.options.map((o) => [o, `${ENUM_TR[o] || o} olunca`, `${ENUM_TR[o] || o} ise`]);
  if (d === 'button' || d === 'event') return [['', 'basılınca', 'basılınca']];
  if (d === 'lock') return [['locked', 'kilitlenince', 'kilitliyse'], ['unlocked', 'kilidi açılınca', 'kilitli değilse']];
  if (d === 'cover' || d === 'valve') return [['open', 'açılınca', 'açıksa'], ['closed', 'kapanınca', 'kapalıysa']];
  if (d === 'climate') return [['heat', 'ısıtmaya başlayınca', 'ısıtıyorsa'], ['off', 'kapanınca', 'kapalıysa']];
  if (d === 'media_player') return [['playing', 'oynatmaya başlayınca', 'oynatıyorsa'], ['paused', 'duraklayınca', 'duraklatılmışsa'], ['off', 'kapanınca', 'kapalıysa']];
  if (d === 'vacuum') return [['cleaning', 'temizliğe başlayınca', 'temizlik yapıyorsa'], ['docked', 'istasyona dönünce', 'istasyondaysa'], ['returning', 'istasyona dönerken', 'istasyona dönüyorsa'], ['error', 'hata verince', 'hata veriyorsa']];
  if (d === 'sun') return [['below_horizon', 'batınca', 'batmışsa (karanlık)'], ['above_horizon', 'doğunca', 'doğmuşsa (gündüz)']];
  if (d === 'weather') return [['rainy', 'yağmur başlayınca', 'yağmurluysa'], ['pouring', 'sağanak başlayınca', 'sağanak varsa'], ['snowy', 'kar başlayınca', 'karlıysa'], ['lightning-rainy', 'fırtına çıkınca', 'fırtınalıysa'], ['sunny', 'güneş açınca', 'güneşliyse'], ['cloudy', 'bulutlanınca', 'bulutluysa']];
  return onOff;
}

function serviceOptions(entityId) {
  switch (domainOf(entityId)) {
    case 'light': return [['turn_on', 'Aç'], ['turn_off', 'Kapat'], ['toggle', 'Aç/kapat']];
    case 'cover': return [['open_cover', 'Aç'], ['close_cover', 'Kapat'], ['stop_cover', 'Durdur'], ['set_cover_position', 'Konuma getir']];
    case 'lock': return [['lock', 'Kilitle'], ['unlock', 'Kilidi aç']];
    case 'valve': return [['open_valve', 'Aç'], ['close_valve', 'Kapat']];
    case 'climate': return [['set_temperature', 'Sıcaklığı ayarla'], ['turn_on', 'Aç'], ['turn_off', 'Kapat']];
    case 'fan': return [['turn_on', 'Aç'], ['turn_off', 'Kapat'], ['toggle', 'Aç/kapat'], ['set_preset_mode', 'Mod seç']];
    case 'vacuum': return [['start', 'Temizliğe başla'], ['pause', 'Duraklat'], ['stop', 'Durdur'], ['return_to_base', 'İstasyona dön']];
    case 'scene': return [['turn_on', 'Etkinleştir']];
    case 'automation': return [['trigger', 'Çalıştır'], ['turn_on', 'Etkinleştir'], ['turn_off', 'Devre dışı bırak']];
    default: return [['turn_on', 'Aç'], ['turn_off', 'Kapat'], ['toggle', 'Aç/kapat']];
  }
}

// ---- config <-> builder ---------------------------------------------------------------

const KNOWN = { trigger: ['trigger', 'platform', 'entity_id', 'to', 'from', 'above', 'below', 'at', 'event', 'offset', 'for'], condition: ['condition', 'entity_id', 'state', 'after', 'before', 'weekday'] };
const extras = (obj, known) => Object.fromEntries(Object.entries(obj).filter(([k]) => !known.includes(k)));
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const toSeconds = (d) => {
  if (typeof d === 'number') return d;
  if (typeof d === 'string') { const [hh, mm, ss] = d.split(':').map(Number); return (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0); }
  return (d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0) + Math.round((d.milliseconds || 0) / 1000);
};
const offsetMinutes = (o) => {
  if (!o) return 0;
  const neg = String(o).startsWith('-');
  return (neg ? -1 : 1) * Math.round(toSeconds(String(o).replace('-', '')) / 60);
};
const offsetString = (m) => { const a = Math.abs(m); return `${m < 0 ? '-' : ''}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}:00`; };
const single = (x) => (Array.isArray(x) ? (x.length === 1 ? x[0] : null) : x);
// "for at least N minutes" on a trigger, both ways. '' means no wait; null
// means a value the builder can't show (such as a template).
const forMinutes = (f) => {
  if (f == null) return '';
  if (typeof f === 'string' && !/^\d+(:\d+){0,2}$/.test(f)) return null;
  if (typeof f === 'object' && Object.values(f).some((v) => typeof v !== 'number')) return null;
  const s = toSeconds(f);
  return Number.isFinite(s) ? Math.round(s / 0.6) / 100 : null;
};
const forConfig = (m) => {
  const s = Math.round(Number(m) * 60);
  if (!Number.isFinite(s) || s <= 0) return {};
  const parts = { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
  return { for: Object.fromEntries(Object.entries(parts).filter(([, v]) => v)) };
};

// Returns builder state, or null if the configuration uses things the builder can't show.
export function fromConfig(cfg) {
  try {
    const state = { alias: cfg.alias || '', description: cfg.description || '', mode: cfg.mode || 'single', triggers: [], conditions: [], actions: [] };
    for (const t of [].concat(cfg.triggers || cfg.trigger || [])) {
      const type = t.trigger || t.platform;
      const extra = extras(t, KNOWN.trigger);
      if (forMinutes(t.for) === null) return null;
      if (type === 'state' && single(t.entity_id) && !t.attribute) state.triggers.push({ type: 'state', entity_id: single(t.entity_id), to: t.to ?? '', from: t.from, forMin: forMinutes(t.for), extra });
      else if (type === 'numeric_state' && single(t.entity_id) && !t.attribute && (t.above == null || t.below == null)) state.triggers.push({ type: 'numeric', entity_id: single(t.entity_id), direction: t.above != null ? 'above' : 'below', value: t.above ?? t.below, forMin: forMinutes(t.for), extra });
      else if (type === 'time' && single(t.at) && /^\d\d:\d\d/.test(single(t.at))) state.triggers.push({ type: 'time', at: hhmm(single(t.at)), extra });
      else if (type === 'sun') state.triggers.push({ type: 'sun', event: t.event || 'sunset', offset: offsetMinutes(t.offset), extra });
      else return null;
    }
    for (const c of [].concat(cfg.conditions || cfg.condition || [])) {
      if (c.condition === 'time') state.conditions.push({ type: 'time', after: hhmm(c.after), before: hhmm(c.before), weekday: c.weekday ? [].concat(c.weekday) : [], extra: extras(c, KNOWN.condition) });
      else if (c.condition === 'state' && single(c.entity_id) && single(c.state) != null) state.conditions.push({ type: 'state', entity_id: single(c.entity_id), state: String(single(c.state)), extra: extras(c, KNOWN.condition) });
      else return null;
    }
    const acts = [].concat(cfg.actions || cfg.action || []);
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      const svc = a.action || a.service;
      if (a.delay != null && Object.keys(a).length === 1) { state.actions.push({ type: 'delay', seconds: toSeconds(a.delay) }); continue; }
      if (!svc) return null;
      if (svc === 'persistent_notification.create' || isPhoneStep(a)) {
        // One "Send a notification" step is up to three actions: Home Assistant's
        // own notification, then (to phones) Evra devices and the Home Assistant app.
        const msg = a.data?.message || '';
        let push = svc !== 'persistent_notification.create';
        while (isPhoneStep(acts[i + 1]) && acts[i + 1].data?.message === msg) { push = true; i++; }
        state.actions.push({ type: 'notify', message: msg, push });
        continue;
      }
      const target = single(a.target?.entity_id ?? a.data?.entity_id ?? a.entity_id);
      if (!target) return null;
      const [domain, service] = svc.split('.');
      const data = { ...(a.data || {}) };
      delete data.entity_id;
      if (domain === 'button' && service === 'press') state.actions.push({ type: 'press', entity_id: target });
      else if (domainOf(target) === domain || domain === 'homeassistant') state.actions.push({ type: 'service', entity_id: target, service, data });
      else return null;
    }
    return state;
  } catch { return null; }
}

export function toConfig(st) {
  const cfg = { alias: st.alias.trim() || 'Yeni otomasyon', description: st.description.trim(), mode: st.mode, triggers: [], conditions: [], actions: [] };
  for (const t of st.triggers) {
    if (t.type === 'state') cfg.triggers.push({ ...t.extra, trigger: 'state', entity_id: t.entity_id, ...(t.from != null && t.from !== '' ? { from: t.from } : {}), ...(t.to !== '' && t.to != null ? { to: t.to } : {}), ...forConfig(t.forMin) });
    else if (t.type === 'numeric') cfg.triggers.push({ ...t.extra, trigger: 'numeric_state', entity_id: t.entity_id, [t.direction]: Number(t.value), ...forConfig(t.forMin) });
    else if (t.type === 'time') cfg.triggers.push({ ...t.extra, trigger: 'time', at: `${t.at}:00` });
    else if (t.type === 'sun') cfg.triggers.push({ ...t.extra, trigger: 'sun', event: t.event, ...(t.offset ? { offset: offsetString(Number(t.offset)) } : {}) });
  }
  for (const c of st.conditions) {
    if (c.type === 'time') cfg.conditions.push({ ...c.extra, condition: 'time', ...(c.after ? { after: `${c.after}:00` } : {}), ...(c.before ? { before: `${c.before}:00` } : {}), ...(c.weekday.length ? { weekday: c.weekday } : {}) });
    else if (c.type === 'state') cfg.conditions.push({ ...c.extra, condition: 'state', entity_id: c.entity_id, state: c.state });
  }
  for (const a of st.actions) {
    if (a.type === 'service') {
      const data = Object.fromEntries(Object.entries(a.data || {}).filter(([, v]) => v !== '' && v != null));
      cfg.actions.push({ action: `${domainOf(a.entity_id)}.${a.service}`, target: { entity_id: a.entity_id }, ...(Object.keys(data).length ? { data } : {}) });
    } else if (a.type === 'press') cfg.actions.push({ action: 'button.press', target: { entity_id: a.entity_id } });
    else if (a.type === 'delay') cfg.actions.push({ delay: { seconds: Number(a.seconds) || 0 } });
    else if (a.type === 'notify') {
      cfg.actions.push({ action: 'persistent_notification.create', data: { title: cfg.alias, message: a.message } });
      if (a.push) {
        // Devices that switched on notifications in Evra (Settings › Notifications).
        // First, so they're reached even if the next step fails.
        const evra = pushEntities();
        if (evra.length) cfg.actions.push({ action: 'notify.send_message', target: { entity_id: evra }, data: { title: cfg.alias, message: a.message }, continue_on_error: true });
        // Phones with the Home Assistant app; without one this step fails, which mustn't end the automation.
        cfg.actions.push({ action: 'notify.notify', data: { title: cfg.alias, message: a.message }, continue_on_error: true });
      }
    }
  }
  return cfg;
}

function validate(st) {
  if (!st.alias.trim()) return 'Otomasyona bir ad verin.';
  if (!st.triggers.length) return 'En az bir "Ne zaman" ekleyin.';
  if (!st.actions.length) return 'En az bir "Ne yapılsın" ekleyin.';
  for (const t of st.triggers) {
    if ((t.type === 'state' || t.type === 'numeric') && !t.entity_id) return 'Her "Ne zaman" için bir cihaz seçin.';
    if (t.type === 'numeric' && (t.value === '' || !Number.isFinite(Number(t.value)))) return 'Değer tetikleyicisi için bir sayı girin.';
    if (t.type === 'time' && !/^\d\d:\d\d$/.test(t.at)) return '07:30 gibi bir saat girin.';
  }
  for (const c of st.conditions) {
    if (c.type === 'state' && !c.entity_id) return 'Her "Yalnızca şu durumda" için bir cihaz seçin.';
    if (c.type === 'time' && !c.after && !c.before) return 'Zaman aralığı için bir başlangıç ya da bitiş saati girin.';
  }
  for (const a of st.actions) {
    if ((a.type === 'service' || a.type === 'press') && !a.entity_id) return 'Her "Ne yapılsın" için bir cihaz seçin.';
    if (a.type === 'notify' && !a.message.trim()) return 'Bildirim metnini yazın.';
  }
  return null;
}

// ---- the screen ---------------------------------------------------------------------------

// template: a ready configuration to start a new automation from (an idea).
export function renderAutomationEditor(root, cleanup, configId, template = null) {
  const isNew = !configId;
  const id = configId || String(Date.now());
  let st = { alias: '', description: '', mode: 'single', triggers: [{ type: 'state', entity_id: '', to: 'on', extra: {} }], conditions: [], actions: [{ type: 'service', entity_id: '', service: 'turn_on', data: {} }] };
  let jsonMode = false;
  let jsonText = '';
  const body = h('div', { class: 'editor' });
  const actionsBar = h('div', { class: 'editor-bar' });

  root.append(h('a', { class: 'back-link', href: '#/automations' }, icon('left', 16), 'Otomasyonlar'), body, actionsBar);

  async function load() {
    if (template) {
      // A new automation from an idea, or a draft from the assistant (new or a change to this one).
      const built = fromConfig(template);
      if (built) st = built;
      else { jsonMode = true; jsonText = JSON.stringify(template, null, 2); st.alias = template.alias || ''; }
      body.replaceChildren();
      root.insertBefore(h('p', { class: 'hint idea-hint' }, icon('sparkle', 16),
        isNew ? 'Cihazlarınızla sizin için dolduruldu. İstediğinizi değiştirip Kaydet\'e basın.' : 'Asistanın önerdiği değişiklikler dolduruldu. Kontrol edip mevcut sürümün yerine geçmesi için Kaydet\'e basın.'), body);
      draw();
      return;
    }
    if (isNew) { draw(); return; }
    body.replaceChildren(h('p', { class: 'muted pad' }, 'Yükleniyor…'));
    let cfg = null;
    for (let i = 0; i < 20 && !store.backend; i++) await new Promise((r) => setTimeout(r, 200));
    try { cfg = await store.backend.fetchAutomationConfig(configId); } catch { cfg = null; }
    if (!cfg) { body.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'Bu otomasyon yüklenemedi.'))); return; }
    const built = fromConfig(cfg);
    if (built) st = built;
    else { jsonMode = true; jsonText = JSON.stringify(stripId(cfg), null, 2); st.alias = cfg.alias || ''; }
    draw();
  }

  const stripId = (cfg) => { const c = { ...cfg }; delete c.id; return c; };

  function draw() {
    // An automation the simple editor can't show needs developer mode (JSON).
    const locked = jsonMode && !isDev();
    body.replaceChildren(locked ? needsDevMode() : jsonMode ? jsonEditor() : builder());
    drawBar(locked);
  }

  function needsDevMode() {
    const on = h('button', { class: 'btn primary', type: 'button' }, 'Geliştirici modunu aç');
    on.addEventListener('click', () => { setPrefs({ devMode: true }); draw(); });
    return card({ title: st.alias || 'Gelişmiş otomasyon', iconName: 'robot' },
      h('p', null, 'Bu otomasyon basit düzenleyicinin gösteremediği adımlar kullanıyor (seçimler, tekrarlar ya da şablonlar gibi). Geliştirici modunda JSON olarak düzenlenebilir.'),
      h('div', { class: 'btn-row' }, on));
  }

  function drawBar(locked = false) {
    const save = h('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Kaydet');
    save.addEventListener('click', onSave);
    const toggleJson = h('button', { class: 'btn ghost dev-only', type: 'button' }, jsonMode ? 'Basit düzenleyiciye dön' : 'JSON olarak düzenle');
    toggleJson.addEventListener('click', () => {
      if (jsonMode) {
        let cfg;
        try { cfg = JSON.parse(jsonText); } catch (e) { toast(`JSON geçerli değil: ${e.message}`, 'error'); return; }
        const built = fromConfig(cfg);
        if (!built) { toast('Bu otomasyon basit düzenleyicinin gösteremediği şeyler kullanıyor; JSON olarak düzenlemeye devam edin.', 'error'); return; }
        st = built; jsonMode = false;
      } else {
        jsonText = JSON.stringify(toConfig(st), null, 2); jsonMode = true;
      }
      draw();
    });
    const del = !isNew ? h('button', { class: 'btn danger', type: 'button' }, icon('trash', 16), 'Sil') : null;
    del?.addEventListener('click', async () => {
      if (!confirm(`"${st.alias || 'Bu otomasyon'}" silinsin mi? Bu geri alınamaz.`)) return;
      try { await store.backend.deleteAutomation(id); toast('Otomasyon silindi'); location.hash = '#/automations'; }
      catch (e) { toast(`Silinemedi: ${e.message}`, 'error'); }
    });
    // Locked (needs developer mode to edit): deleting still works.
    actionsBar.replaceChildren(...[locked ? null : save, locked ? null : toggleJson, h('span', { class: 'sep' }), del].filter(Boolean));
  }

  async function onSave() {
    let cfg;
    if (jsonMode) {
      try { cfg = JSON.parse(jsonText); } catch (e) { toast(`JSON geçerli değil: ${e.message}`, 'error'); return; }
      if (!cfg.alias) { toast('JSON\'da bir "alias" (ad) olmalı.', 'error'); return; }
      if (!(cfg.triggers || cfg.trigger)) { toast('JSON\'da "triggers" olmalı.', 'error'); return; }
    } else {
      const problem = validate(st);
      if (problem) { toast(problem, 'error'); return; }
      cfg = toConfig(st);
    }
    try {
      await store.backend.saveAutomation(id, cfg);
      toast(isNew ? 'Otomasyon oluşturuldu' : 'Otomasyon kaydedildi');
      location.hash = '#/automations';
    } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
  }

  function jsonEditor() {
    const area = h('textarea', { class: 'json', spellcheck: 'false', 'aria-label': 'JSON olarak otomasyon' });
    area.value = jsonText;
    area.addEventListener('input', () => { jsonText = area.value; });
    return card({ title: 'JSON olarak otomasyon', iconName: 'edit' },
      h('p', { class: 'muted small' }, 'Tam Home Assistant yapılandırması. Basit düzenleyicinin yapamadığı her şey için (seçimler, tekrarlar, şablonlar) bunu kullanın.'),
      area);
  }

  // ---- builder ----
  function builder() {
    const redraw = () => draw();
    return h('div', { class: 'builder' },
      card({ title: 'Ad', iconName: 'edit' },
        h('label', { class: 'field' }, h('span', null, 'Ad'), input(st.alias, (v) => { st.alias = v; }, { placeholder: 'Akşam ışıkları' })),
        h('label', { class: 'field' }, h('span', null, 'Açıklama (isteğe bağlı)'), input(st.description, (v) => { st.description = v; }, { placeholder: 'Ne yaptığı, tek cümleyle' })),
        h('label', { class: 'field' }, h('span', null, 'Çalışırken yeniden tetiklenirse'),
          select([['single', 'Yeni tetiklemeyi yok say'], ['restart', 'Baştan başla'], ['queued', 'Bitince yeniden çalıştır']], st.mode, (v) => { st.mode = v; }, 'Mod'))),
      section('Ne zaman', 'clock', 'Bunlardan herhangi biri otomasyonu başlatır.', st.triggers, triggerRow, () => st.triggers.push({ type: 'state', entity_id: '', to: 'on', extra: {} }), 'Tetikleyici ekle', redraw),
      section('Yalnızca şu durumda', 'check', 'İsteğe bağlı. Hepsi doğru olmalı.', st.conditions, conditionRow, () => st.conditions.push({ type: 'time', after: '18:00', before: '23:00', weekday: [], extra: {} }), 'Koşul ekle', redraw),
      section('Ne yapılsın', 'play', 'Bu sırayla yapılır.', st.actions, actionRow, () => st.actions.push({ type: 'service', entity_id: '', service: 'turn_on', data: {} }), 'Eylem ekle', redraw, true),
    );
  }

  function section(title, iconName, hint, items, rowFn, addFn, addLabel, redraw, orderable = false) {
    const rows = items.map((item, i) => h('div', { class: 'rule-row' },
      h('div', { class: 'rule-fields' }, rowFn(item, redraw)),
      h('div', { class: 'rule-tools' },
        orderable && i > 0 ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Yukarı taşı', title: 'Yukarı taşı', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; redraw(); } }, icon('up', 16)) : null,
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Kaldır', title: 'Kaldır', onclick: () => { items.splice(i, 1); redraw(); } }, icon('trash', 16)))));
    const add = h('button', { class: 'btn ghost add-rule', type: 'button', onclick: () => { addFn(); redraw(); } }, icon('plus', 16), addLabel);
    return card({ title, iconName }, h('p', { class: 'muted small' }, hint), rows, add);
  }

  function triggerRow(t, redraw) {
    const typeSel = select([['state', 'Bir cihaz değişince'], ['numeric', 'Bir değer yükselince ya da düşünce'], ['time', 'Belirli bir saatte'], ['sun', 'Gün doğumu ya da batımında']], t.type, (v) => {
      Object.assign(t, { type: v, entity_id: '', to: 'on', direction: 'above', value: '', at: '07:00', event: 'sunset', offset: 0, forMin: '' });
      redraw();
    }, 'Tetikleyici türü');
    // "...and stays that way for N minutes" (empty = straight away).
    const forField = () => h('div', { class: 'inline-fields' },
      h('span', { class: 'muted small' }, 'en az'),
      input(t.forMin ?? '', (v) => { t.forMin = v; }, { type: 'number', min: 0, step: 'any', placeholder: '0', 'aria-label': 'En az bu kadar dakika', class: 'input short' }),
      h('span', { class: 'muted small' }, 'dakika boyunca'));
    if (t.type === 'state') {
      const list = entitiesFor((s) => STATE_DOMAINS.includes(domainOf(s.entity_id)) || isEnumSensor(s));
      const opts = t.entity_id ? stateOptions(t.entity_id) : [];
      const instant = ['button', 'event'].includes(domainOf(t.entity_id));
      return [typeSel, entityPicker(list, t.entity_id, (v) => { t.entity_id = v; t.to = stateOptions(v)[0][0]; t.from = undefined; redraw(); }),
        t.entity_id ? select(opts.map(([v, l]) => [v, l]), t.to ?? '', (v) => { t.to = v; }, 'Durum') : null,
        t.entity_id && !instant ? forField() : null];
    }
    if (t.type === 'numeric') {
      // zone.home counts the people at home (phones with the Home Assistant app).
      const list = entitiesFor((s) => ['sensor', 'zone'].includes(domainOf(s.entity_id)) && Number.isFinite(parseFloat(s.state)));
      const unit = store.get(t.entity_id)?.attributes?.unit_of_measurement || '';
      return [typeSel, entityPicker(list, t.entity_id, (v) => { t.entity_id = v; redraw(); }),
        h('div', { class: 'inline-fields' },
          select([['above', 'üstüne çıkınca'], ['below', 'altına düşünce']], t.direction, (v) => { t.direction = v; }, 'Yön'),
          input(t.value, (v) => { t.value = v; }, { type: 'number', step: 'any', placeholder: 'Değer', 'aria-label': 'Değer' }),
          unit ? h('span', { class: 'muted' }, unit) : null),
        forField()];
    }
    if (t.type === 'time') return [typeSel, input(t.at, (v) => { t.at = v; }, { type: 'time', 'aria-label': 'Saat' })];
    return [typeSel, h('div', { class: 'inline-fields' },
      select([['sunrise', 'Gün doğumu'], ['sunset', 'Gün batımı']], t.event, (v) => { t.event = v; }, 'Güneş olayı'),
      input(t.offset, (v) => { t.offset = v; }, { type: 'number', step: '5', 'aria-label': 'Dakika olarak fark' }),
      h('span', { class: 'muted small' }, 'dakika (− önce, + sonra)'))];
  }

  function conditionRow(c, redraw) {
    const typeSel = select([['time', 'Belirli saatler arasında'], ['state', 'Bir cihaz şu durumdaysa']], c.type, (v) => {
      Object.assign(c, { type: v, entity_id: '', state: 'on', after: '18:00', before: '23:00', weekday: [] });
      redraw();
    }, 'Koşul türü');
    if (c.type === 'time') {
      const days = [['mon', 'Pzt'], ['tue', 'Sal'], ['wed', 'Çar'], ['thu', 'Per'], ['fri', 'Cum'], ['sat', 'Cmt'], ['sun', 'Paz']];
      return [typeSel,
        h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Başlangıç'), input(c.after, (v) => { c.after = v; }, { type: 'time', 'aria-label': 'Başlangıç' }),
          h('span', { class: 'muted small' }, 'bitiş'), input(c.before, (v) => { c.before = v; }, { type: 'time', 'aria-label': 'Bitiş' })),
        h('div', { class: 'day-picks' }, days.map(([d, l]) => {
          const on = c.weekday.includes(d);
          return h('button', { class: `day${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), onclick: () => { c.weekday = on ? c.weekday.filter((x) => x !== d) : [...c.weekday, d]; redraw(); } }, l);
        }), h('span', { class: 'muted small' }, c.weekday.length ? '' : 'her gün'))];
    }
    const list = entitiesFor((s) => CONDITION_DOMAINS.includes(domainOf(s.entity_id)) || isEnumSensor(s));
    const opts = c.entity_id ? stateOptions(c.entity_id).map(([v, , l]) => [v, l]) : [];
    return [typeSel, entityPicker(list, c.entity_id, (v) => { c.entity_id = v; c.state = stateOptions(v)[0][0]; redraw(); }),
      c.entity_id ? select(opts, c.state, (v) => { c.state = v; }, 'Durum') : null];
  }

  function actionRow(a, redraw) {
    const typeSel = select([['service', 'Bir cihazı kontrol et'], ['press', 'Bir düğmeye bas'], ['delay', 'Bekle'], ['notify', 'Bildirim gönder']], a.type, (v) => {
      Object.assign(a, { type: v, entity_id: '', service: 'turn_on', data: {}, seconds: 30, message: '', push: false });
      redraw();
    }, 'Eylem türü');
    if (a.type === 'service') {
      const list = entitiesFor((s) => CONTROL_DOMAINS.includes(domainOf(s.entity_id)) && !(s.entity_id.startsWith('scene.led_before')));
      const parts = [typeSel, entityPicker(list, a.entity_id, (v) => { a.entity_id = v; a.service = serviceOptions(v)[0][0]; a.data = {}; redraw(); })];
      if (a.entity_id) {
        parts.push(select(serviceOptions(a.entity_id), a.service, (v) => { a.service = v; a.data = {}; redraw(); }, 'Ne yapılsın'));
        const d = domainOf(a.entity_id);
        if (d === 'light' && a.service === 'turn_on') {
          const modes = store.get(a.entity_id)?.attributes?.supported_color_modes || [];
          const presetOpts = [['', 'Rengini koru'], ...HOME.colorPresets.filter((p) => (p.data.hs_color ? modes.some((m) => ['hs', 'xy', 'rgb'].includes(m)) : modes.length && !modes.every((m) => m === 'onoff'))).map((p) => [p.name, p.name])];
          const current = HOME.colorPresets.find((p) => JSON.stringify(p.data.hs_color || p.data.color_temp_kelvin) === JSON.stringify(a.data.hs_color || a.data.color_temp_kelvin))?.name || '';
          parts.push(h('div', { class: 'inline-fields' },
            h('span', { class: 'muted small' }, 'Parlaklık'),
            input(a.data.brightness_pct ?? '', (v) => { a.data.brightness_pct = v === '' ? '' : Number(v); }, { type: 'number', min: 1, max: 100, placeholder: '%', 'aria-label': 'Parlaklık yüzdesi' }),
            presetOpts.length > 1 ? select(presetOpts, current, (v) => {
              const p = HOME.colorPresets.find((x) => x.name === v);
              delete a.data.hs_color; delete a.data.color_temp_kelvin;
              if (p) Object.assign(a.data, p.data);
            }, 'Renk') : null));
        }
        if (d === 'cover' && a.service === 'set_cover_position') parts.push(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Konum'), input(a.data.position ?? 50, (v) => { a.data.position = Number(v); }, { type: 'number', min: 0, max: 100, 'aria-label': 'Konum yüzdesi' }), h('span', { class: 'muted' }, '%')));
        if (d === 'climate' && a.service === 'set_temperature') parts.push(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Hedef'), input(a.data.temperature ?? 21, (v) => { a.data.temperature = Number(v); }, { type: 'number', step: 0.5, 'aria-label': 'Hedef sıcaklık' }), h('span', { class: 'muted' }, '°C')));
        if (d === 'fan' && a.service === 'turn_on') parts.push(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Hız'), input(a.data.percentage ?? '', (v) => { a.data.percentage = v === '' ? '' : Number(v); }, { type: 'number', min: 1, max: 100, placeholder: '%', 'aria-label': 'Hız yüzdesi' }), h('span', { class: 'muted' }, '%')));
        if (d === 'fan' && a.service === 'set_preset_mode') {
          const presets = store.get(a.entity_id)?.attributes?.preset_modes || [];
          if (!a.data.preset_mode && presets.length) a.data.preset_mode = presets[0];
          parts.push(select(presets.map((p) => [p, PRESET_TR[p] || p]), a.data.preset_mode, (v) => { a.data.preset_mode = v; }, 'Mod'));
        }
      }
      return parts;
    }
    if (a.type === 'press') {
      const list = [...store.states.values()].filter((s) => domainOf(s.entity_id) === 'button' && !store.entities.get(s.entity_id)?.entity_category);
      return [typeSel, entityPicker(list, a.entity_id, (v) => { a.entity_id = v; })];
    }
    if (a.type === 'delay') {
      return [typeSel, h('div', { class: 'inline-fields' }, input(a.seconds, (v) => { a.seconds = v; }, { type: 'number', min: 1, 'aria-label': 'Saniye' }), h('span', { class: 'muted' }, 'saniye'))];
    }
    return [typeSel,
      input(a.message, (v) => { a.message = v; }, { placeholder: 'Mesaj, örneğin "Pencere hâlâ açık"', 'aria-label': 'Mesaj' }),
      h('label', { class: 'check-field' }, h('input', { type: 'checkbox', checked: !!a.push, onchange: (e) => { a.push = e.target.checked; } }), h('span', null, 'Telefonlara da gönder (Evra bildirimleri ya da Home Assistant uygulaması)'))];
  }

  load();
}
