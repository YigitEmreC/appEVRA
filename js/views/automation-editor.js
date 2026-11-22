// Automation editor: build an automation from plain "When / Only if / Then"
// rows, or edit the raw configuration as JSON for anything more advanced.

import { HOME } from '../config.js';
import { store, entityArea, areaName } from '../store.js';
import { h, toast, isDev, setPrefs } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';

// ---- entity lists for the pickers ------------------------------------------------

const STATE_DOMAINS = ['binary_sensor', 'switch', 'light', 'lock', 'cover', 'input_boolean', 'button', 'event', 'siren', 'valve', 'climate', 'media_player'];
const CONTROL_DOMAINS = ['light', 'switch', 'cover', 'lock', 'valve', 'siren', 'climate', 'input_boolean', 'fan', 'scene', 'automation'];

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
    const room = areaName(entityArea(s.entity_id)) || 'Not in a room';
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room).push(s);
  }
  const sel = h('select', { class: 'select', 'aria-label': 'Device' },
    h('option', { value: '' }, 'Choose…'),
    [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([room, items]) => h('optgroup', { label: room },
      items.sort((a, b) => (a.attributes.friendly_name || '').localeCompare(b.attributes.friendly_name || ''))
        .map((s) => h('option', { value: s.entity_id, selected: s.entity_id === value }, s.attributes.friendly_name || s.entity_id)))));
  if (value && !list.some((s) => s.entity_id === value)) sel.append(h('option', { value, selected: true }, value));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function select(options, value, onChange, label) {
  const sel = h('select', { class: 'select', 'aria-label': label || 'Option' }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function input(value, onChange, attrs = {}) {
  const el = h('input', { class: 'input', value: value ?? '', ...attrs });
  el.addEventListener('input', () => onChange(el.value));
  return el;
}

const domainOf = (id) => (id || '').split('.')[0];

// What a device can "become", for triggers and conditions.
function stateOptions(entityId) {
  const s = store.get(entityId);
  const d = domainOf(entityId);
  const cls = s?.attributes?.device_class;
  if (d === 'binary_sensor') {
    if (['opening', 'door', 'window', 'garage_door'].includes(cls)) return [['on', 'opens'], ['off', 'closes']];
    if (['occupancy', 'motion', 'presence'].includes(cls)) return [['on', 'detects someone'], ['off', 'clears']];
    if (['smoke', 'gas', 'moisture'].includes(cls)) return [['on', 'raises the alarm'], ['off', 'goes back to clear']];
    return [['on', 'turns on'], ['off', 'turns off']];
  }
  if (d === 'button' || d === 'event') return [['', 'is pressed']];
  if (d === 'lock') return [['locked', 'locks'], ['unlocked', 'unlocks']];
  if (d === 'cover') return [['open', 'opens'], ['closed', 'closes']];
  if (d === 'valve') return [['open', 'opens'], ['closed', 'closes']];
  if (d === 'climate') return [['heat', 'starts heating'], ['off', 'turns off']];
  if (d === 'media_player') return [['playing', 'starts playing'], ['paused', 'pauses'], ['off', 'turns off']];
  return [['on', 'turns on'], ['off', 'turns off']];
}

function serviceOptions(entityId) {
  switch (domainOf(entityId)) {
    case 'light': return [['turn_on', 'Turn on'], ['turn_off', 'Turn off'], ['toggle', 'Toggle']];
    case 'cover': return [['open_cover', 'Open'], ['close_cover', 'Close'], ['stop_cover', 'Stop'], ['set_cover_position', 'Set position']];
    case 'lock': return [['lock', 'Lock'], ['unlock', 'Unlock']];
    case 'valve': return [['open_valve', 'Open'], ['close_valve', 'Close']];
    case 'climate': return [['set_temperature', 'Set temperature'], ['turn_on', 'Turn on'], ['turn_off', 'Turn off']];
    case 'scene': return [['turn_on', 'Activate']];
    case 'automation': return [['trigger', 'Run'], ['turn_on', 'Switch on'], ['turn_off', 'Switch off']];
    default: return [['turn_on', 'Turn on'], ['turn_off', 'Turn off'], ['toggle', 'Toggle']];
  }
}

// ---- config <-> builder ---------------------------------------------------------------

const KNOWN = { trigger: ['trigger', 'platform', 'entity_id', 'to', 'from', 'above', 'below', 'at', 'event', 'offset'], condition: ['condition', 'entity_id', 'state', 'after', 'before', 'weekday'] };
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

// Returns builder state, or null if the configuration uses things the builder can't show.
export function fromConfig(cfg) {
  try {
    const state = { alias: cfg.alias || '', description: cfg.description || '', mode: cfg.mode || 'single', triggers: [], conditions: [], actions: [] };
    for (const t of [].concat(cfg.triggers || cfg.trigger || [])) {
      const type = t.trigger || t.platform;
      const extra = extras(t, KNOWN.trigger);
      if (type === 'state' && single(t.entity_id) && !t.attribute && !t.for) state.triggers.push({ type: 'state', entity_id: single(t.entity_id), to: t.to ?? '', from: t.from, extra });
      else if (type === 'numeric_state' && single(t.entity_id) && !t.for) state.triggers.push({ type: 'numeric', entity_id: single(t.entity_id), direction: t.above != null ? 'above' : 'below', value: t.above ?? t.below, extra });
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
      if (svc === 'persistent_notification.create' || svc === 'notify.notify') {
        const msg = a.data?.message || '';
        const next = acts[i + 1];
        const push = svc === 'notify.notify' || ((next?.action || next?.service) === 'notify.notify' && next.data?.message === msg);
        if (svc === 'persistent_notification.create' && push) i++;
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
  const cfg = { alias: st.alias.trim() || 'New automation', description: st.description.trim(), mode: st.mode, triggers: [], conditions: [], actions: [] };
  for (const t of st.triggers) {
    if (t.type === 'state') cfg.triggers.push({ ...t.extra, trigger: 'state', entity_id: t.entity_id, ...(t.from != null && t.from !== '' ? { from: t.from } : {}), ...(t.to !== '' && t.to != null ? { to: t.to } : {}) });
    else if (t.type === 'numeric') cfg.triggers.push({ ...t.extra, trigger: 'numeric_state', entity_id: t.entity_id, [t.direction]: Number(t.value) });
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
      if (a.push) cfg.actions.push({ action: 'notify.notify', data: { title: cfg.alias, message: a.message } });
    }
  }
  return cfg;
}

function validate(st) {
  if (!st.alias.trim()) return 'Give the automation a name.';
  if (!st.triggers.length) return 'Add at least one "When".';
  if (!st.actions.length) return 'Add at least one "Then".';
  for (const t of st.triggers) {
    if ((t.type === 'state' || t.type === 'numeric') && !t.entity_id) return 'Choose a device for every "When".';
    if (t.type === 'numeric' && (t.value === '' || !Number.isFinite(Number(t.value)))) return 'Enter a number for the value trigger.';
    if (t.type === 'time' && !/^\d\d:\d\d$/.test(t.at)) return 'Enter a time like 07:30.';
  }
  for (const c of st.conditions) {
    if (c.type === 'state' && !c.entity_id) return 'Choose a device for every "Only if".';
    if (c.type === 'time' && !c.after && !c.before) return 'Enter a start or end time for the time window.';
  }
  for (const a of st.actions) {
    if ((a.type === 'service' || a.type === 'press') && !a.entity_id) return 'Choose a device for every "Then".';
    if (a.type === 'notify' && !a.message.trim()) return 'Write the notification text.';
  }
  return null;
}

// ---- the screen ---------------------------------------------------------------------------

export function renderAutomationEditor(root, cleanup, configId) {
  const isNew = !configId;
  const id = configId || String(Date.now());
  let st = { alias: '', description: '', mode: 'single', triggers: [{ type: 'state', entity_id: '', to: 'on', extra: {} }], conditions: [], actions: [{ type: 'service', entity_id: '', service: 'turn_on', data: {} }] };
  let jsonMode = false;
  let jsonText = '';
  const body = h('div', { class: 'editor' });
  const actionsBar = h('div', { class: 'editor-bar' });

  root.append(h('a', { class: 'back-link', href: '#/automations' }, icon('left', 16), 'Automations'), body, actionsBar);

  async function load() {
    if (isNew) { draw(); return; }
    body.replaceChildren(h('p', { class: 'muted pad' }, 'Loading…'));
    let cfg = null;
    for (let i = 0; i < 20 && !store.backend; i++) await new Promise((r) => setTimeout(r, 200));
    try { cfg = await store.backend.fetchAutomationConfig(configId); } catch { cfg = null; }
    if (!cfg) { body.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'This automation couldn\'t be loaded.'))); return; }
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
    const on = h('button', { class: 'btn primary', type: 'button' }, 'Turn on developer mode');
    on.addEventListener('click', () => { setPrefs({ devMode: true }); draw(); });
    return card({ title: st.alias || 'Advanced automation', iconName: 'robot' },
      h('p', null, 'This automation uses steps the simple editor can\'t show, such as choices, repeats or templates. It can be edited as JSON in developer mode.'),
      h('div', { class: 'btn-row' }, on));
  }

  function drawBar(locked = false) {
    const save = h('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Save');
    save.addEventListener('click', onSave);
    const toggleJson = h('button', { class: 'btn ghost dev-only', type: 'button' }, jsonMode ? 'Back to the simple editor' : 'Edit as JSON');
    toggleJson.addEventListener('click', () => {
      if (jsonMode) {
        let cfg;
        try { cfg = JSON.parse(jsonText); } catch (e) { toast(`The JSON isn't valid: ${e.message}`, 'error'); return; }
        const built = fromConfig(cfg);
        if (!built) { toast('This automation uses things the simple editor can\'t show; keep editing it as JSON.', 'error'); return; }
        st = built; jsonMode = false;
      } else {
        jsonText = JSON.stringify(toConfig(st), null, 2); jsonMode = true;
      }
      draw();
    });
    const del = !isNew ? h('button', { class: 'btn danger', type: 'button' }, icon('trash', 16), 'Delete') : null;
    del?.addEventListener('click', async () => {
      if (!confirm(`Delete "${st.alias || 'this automation'}"? This can't be undone.`)) return;
      try { await store.backend.deleteAutomation(id); toast('Automation deleted'); location.hash = '#/automations'; }
      catch (e) { toast(`Couldn't delete: ${e.message}`, 'error'); }
    });
    // Locked (needs developer mode to edit): deleting still works.
    actionsBar.replaceChildren(...[locked ? null : save, locked ? null : toggleJson, h('span', { class: 'sep' }), del].filter(Boolean));
  }

  async function onSave() {
    let cfg;
    if (jsonMode) {
      try { cfg = JSON.parse(jsonText); } catch (e) { toast(`The JSON isn't valid: ${e.message}`, 'error'); return; }
      if (!cfg.alias) { toast('The JSON needs an "alias" (the name).', 'error'); return; }
      if (!(cfg.triggers || cfg.trigger)) { toast('The JSON needs "triggers".', 'error'); return; }
    } else {
      const problem = validate(st);
      if (problem) { toast(problem, 'error'); return; }
      cfg = toConfig(st);
    }
    try {
      await store.backend.saveAutomation(id, cfg);
      toast(isNew ? 'Automation created' : 'Automation saved');
      location.hash = '#/automations';
    } catch (e) { toast(`Couldn't save: ${e.message}`, 'error'); }
  }

  function jsonEditor() {
    const area = h('textarea', { class: 'json', spellcheck: 'false', 'aria-label': 'Automation as JSON' });
    area.value = jsonText;
    area.addEventListener('input', () => { jsonText = area.value; });
    return card({ title: 'Automation as JSON', iconName: 'edit' },
      h('p', { class: 'muted small' }, 'The full Home Assistant configuration. Use this for anything the simple editor can\'t do, such as choices, repeats or templates.'),
      area);
  }

  // ---- builder ----
  function builder() {
    const redraw = () => draw();
    return h('div', { class: 'builder' },
      card({ title: 'Name', iconName: 'edit' },
        h('label', { class: 'field' }, h('span', null, 'Name'), input(st.alias, (v) => { st.alias = v; }, { placeholder: 'Evening lights' })),
        h('label', { class: 'field' }, h('span', null, 'Description (optional)'), input(st.description, (v) => { st.description = v; }, { placeholder: 'What it does, in a sentence' })),
        h('label', { class: 'field' }, h('span', null, 'If it\'s triggered again while running'),
          select([['single', 'Ignore the new trigger'], ['restart', 'Start over'], ['queued', 'Run again afterwards']], st.mode, (v) => { st.mode = v; }, 'Mode'))),
      section('When', 'clock', 'Any of these starts the automation.', st.triggers, triggerRow, () => st.triggers.push({ type: 'state', entity_id: '', to: 'on', extra: {} }), 'Add a trigger', redraw),
      section('Only if', 'check', 'Optional. All of these must be true.', st.conditions, conditionRow, () => st.conditions.push({ type: 'time', after: '18:00', before: '23:00', weekday: [], extra: {} }), 'Add a condition', redraw),
      section('Then', 'play', 'Done in this order.', st.actions, actionRow, () => st.actions.push({ type: 'service', entity_id: '', service: 'turn_on', data: {} }), 'Add an action', redraw, true),
    );
  }

  function section(title, iconName, hint, items, rowFn, addFn, addLabel, redraw, orderable = false) {
    const rows = items.map((item, i) => h('div', { class: 'rule-row' },
      h('div', { class: 'rule-fields' }, rowFn(item, redraw)),
      h('div', { class: 'rule-tools' },
        orderable && i > 0 ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move up', title: 'Move up', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; redraw(); } }, icon('up', 16)) : null,
        h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'Remove', title: 'Remove', onclick: () => { items.splice(i, 1); redraw(); } }, icon('trash', 16)))));
    const add = h('button', { class: 'btn ghost add-rule', type: 'button', onclick: () => { addFn(); redraw(); } }, icon('plus', 16), addLabel);
    return card({ title, iconName }, h('p', { class: 'muted small' }, hint), rows, add);
  }

  function triggerRow(t, redraw) {
    const typeSel = select([['state', 'A device changes'], ['numeric', 'A value goes above or below'], ['time', 'At a time of day'], ['sun', 'At sunrise or sunset']], t.type, (v) => {
      Object.assign(t, { type: v, entity_id: '', to: 'on', direction: 'above', value: '', at: '07:00', event: 'sunset', offset: 0 });
      redraw();
    }, 'Trigger type');
    if (t.type === 'state') {
      const list = entitiesFor((s) => STATE_DOMAINS.includes(domainOf(s.entity_id)));
      const opts = t.entity_id ? stateOptions(t.entity_id) : [];
      return [typeSel, entityPicker(list, t.entity_id, (v) => { t.entity_id = v; t.to = stateOptions(v)[0][0]; t.from = undefined; redraw(); }),
        t.entity_id ? select(opts, t.to ?? '', (v) => { t.to = v; }, 'State') : null];
    }
    if (t.type === 'numeric') {
      const list = entitiesFor((s) => domainOf(s.entity_id) === 'sensor' && Number.isFinite(parseFloat(s.state)));
      const unit = store.get(t.entity_id)?.attributes?.unit_of_measurement || '';
      return [typeSel, entityPicker(list, t.entity_id, (v) => { t.entity_id = v; redraw(); }),
        h('div', { class: 'inline-fields' },
          select([['above', 'goes above'], ['below', 'drops below']], t.direction, (v) => { t.direction = v; }, 'Direction'),
          input(t.value, (v) => { t.value = v; }, { type: 'number', step: 'any', placeholder: 'Value', 'aria-label': 'Value' }),
          unit ? h('span', { class: 'muted' }, unit) : null)];
    }
    if (t.type === 'time') return [typeSel, input(t.at, (v) => { t.at = v; }, { type: 'time', 'aria-label': 'Time' })];
    return [typeSel, h('div', { class: 'inline-fields' },
      select([['sunrise', 'Sunrise'], ['sunset', 'Sunset']], t.event, (v) => { t.event = v; }, 'Sun event'),
      input(t.offset, (v) => { t.offset = v; }, { type: 'number', step: '5', 'aria-label': 'Offset in minutes' }),
      h('span', { class: 'muted small' }, 'minutes (− before, + after)'))];
  }

  function conditionRow(c, redraw) {
    const typeSel = select([['time', 'Within a time window'], ['state', 'A device is in a state']], c.type, (v) => {
      Object.assign(c, { type: v, entity_id: '', state: 'on', after: '18:00', before: '23:00', weekday: [] });
      redraw();
    }, 'Condition type');
    if (c.type === 'time') {
      const days = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
      return [typeSel,
        h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'From'), input(c.after, (v) => { c.after = v; }, { type: 'time', 'aria-label': 'From' }),
          h('span', { class: 'muted small' }, 'to'), input(c.before, (v) => { c.before = v; }, { type: 'time', 'aria-label': 'To' })),
        h('div', { class: 'day-picks' }, days.map(([d, l]) => {
          const on = c.weekday.includes(d);
          return h('button', { class: `day${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), onclick: () => { c.weekday = on ? c.weekday.filter((x) => x !== d) : [...c.weekday, d]; redraw(); } }, l);
        }), h('span', { class: 'muted small' }, c.weekday.length ? '' : 'every day'))];
    }
    const list = entitiesFor((s) => STATE_DOMAINS.includes(domainOf(s.entity_id)) && !['button', 'event'].includes(domainOf(s.entity_id)));
    const opts = c.entity_id ? stateOptions(c.entity_id).map(([v, l]) => [v, l.replace(/^(opens|closes|detects someone|clears|turns on|turns off|locks|unlocks|starts heating|raises the alarm|goes back to clear)$/, (m) => ({ opens: 'is open', closes: 'is closed', 'detects someone': 'sees someone', clears: 'is clear', 'turns on': 'is on', 'turns off': 'is off', locks: 'is locked', unlocks: 'is unlocked', 'starts heating': 'is heating', 'raises the alarm': 'is alarming', 'goes back to clear': 'is clear' }[m]))]) : [];
    return [typeSel, entityPicker(list, c.entity_id, (v) => { c.entity_id = v; c.state = stateOptions(v)[0][0]; redraw(); }),
      c.entity_id ? select(opts, c.state, (v) => { c.state = v; }, 'State') : null];
  }

  function actionRow(a, redraw) {
    const typeSel = select([['service', 'Control a device'], ['press', 'Press a remote button'], ['delay', 'Wait'], ['notify', 'Send a notification']], a.type, (v) => {
      Object.assign(a, { type: v, entity_id: '', service: 'turn_on', data: {}, seconds: 30, message: '', push: false });
      redraw();
    }, 'Action type');
    if (a.type === 'service') {
      const list = entitiesFor((s) => CONTROL_DOMAINS.includes(domainOf(s.entity_id)) && !(s.entity_id.startsWith('scene.led_before')));
      const parts = [typeSel, entityPicker(list, a.entity_id, (v) => { a.entity_id = v; a.service = serviceOptions(v)[0][0]; a.data = {}; redraw(); })];
      if (a.entity_id) {
        parts.push(select(serviceOptions(a.entity_id), a.service, (v) => { a.service = v; a.data = {}; redraw(); }, 'What to do'));
        const d = domainOf(a.entity_id);
        if (d === 'light' && a.service === 'turn_on') {
          const modes = store.get(a.entity_id)?.attributes?.supported_color_modes || [];
          const presetOpts = [['', 'Keep its colour'], ...HOME.colorPresets.filter((p) => (p.data.hs_color ? modes.some((m) => ['hs', 'xy', 'rgb'].includes(m)) : modes.length && !modes.every((m) => m === 'onoff'))).map((p) => [p.name, p.name])];
          const current = HOME.colorPresets.find((p) => JSON.stringify(p.data.hs_color || p.data.color_temp_kelvin) === JSON.stringify(a.data.hs_color || a.data.color_temp_kelvin))?.name || '';
          parts.push(h('div', { class: 'inline-fields' },
            h('span', { class: 'muted small' }, 'Brightness'),
            input(a.data.brightness_pct ?? '', (v) => { a.data.brightness_pct = v === '' ? '' : Number(v); }, { type: 'number', min: 1, max: 100, placeholder: '%', 'aria-label': 'Brightness percent' }),
            presetOpts.length > 1 ? select(presetOpts, current, (v) => {
              const p = HOME.colorPresets.find((x) => x.name === v);
              delete a.data.hs_color; delete a.data.color_temp_kelvin;
              if (p) Object.assign(a.data, p.data);
            }, 'Colour') : null));
        }
        if (d === 'cover' && a.service === 'set_cover_position') parts.push(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Position'), input(a.data.position ?? 50, (v) => { a.data.position = Number(v); }, { type: 'number', min: 0, max: 100, 'aria-label': 'Position percent' }), h('span', { class: 'muted' }, '%')));
        if (d === 'climate' && a.service === 'set_temperature') parts.push(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Target'), input(a.data.temperature ?? 21, (v) => { a.data.temperature = Number(v); }, { type: 'number', step: 0.5, 'aria-label': 'Target temperature' }), h('span', { class: 'muted' }, '°C')));
      }
      return parts;
    }
    if (a.type === 'press') {
      const list = [...store.states.values()].filter((s) => domainOf(s.entity_id) === 'button' && !store.entities.get(s.entity_id)?.entity_category);
      return [typeSel, entityPicker(list, a.entity_id, (v) => { a.entity_id = v; })];
    }
    if (a.type === 'delay') {
      return [typeSel, h('div', { class: 'inline-fields' }, input(a.seconds, (v) => { a.seconds = v; }, { type: 'number', min: 1, 'aria-label': 'Seconds' }), h('span', { class: 'muted' }, 'seconds'))];
    }
    return [typeSel,
      input(a.message, (v) => { a.message = v; }, { placeholder: 'Message, for example "The window is still open"', 'aria-label': 'Message' }),
      h('label', { class: 'check-field' }, h('input', { type: 'checkbox', checked: !!a.push, onchange: (e) => { a.push = e.target.checked; } }), h('span', null, 'Also send to phones with the Home Assistant app'))];
  }

  load();
}
