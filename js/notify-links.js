// Notifications tied to scenes and automations (the Bildirimler tab, the scene editor).
//
// Who gets them: only the phones and computers that switched on Evra notifications
// (js/push.js, Home Assistant's HTML5 push), so nothing arrives twice (not also from the
// Home Assistant app or its notification list). With no such device yet, the message goes to
// Home Assistant's own notification list, so it isn't lost.
//
// Scenes are Evra's own (js/scenes.js, run by the app), so a scene carries
// notify: { on, message } and runScene sends it right after it runs.
// Automations run on the Pi, so each one with a notification gets a small helper automation
// next to it (id evra_notify_<automation's id>) that fires when that automation runs
// (the automation_triggered event). That works with the app closed, and the person's own
// automation isn't touched.

import { store } from './store.js';
import { pushEntities } from './push.js';

export const LINK_PREFIX = 'evra_notify_';

/** Home Assistant actions that tell the household (also js/home-care.js, the automation editor). */
export function notifyActions(title, message) {
  const phones = pushEntities();
  return phones.length
    ? [{ action: 'notify.send_message', target: { entity_id: phones }, data: { title, message }, continue_on_error: true }]
    : [{ action: 'persistent_notification.create', data: { title, message } }];
}

/** Sends a notification now, from the app (a scene that just ran). Quietly; never throws. */
export async function notifyNow(title, message) {
  const b = store.backend;
  if (!b) return;
  if (b.mode !== 'live') {
    try { const { showHere } = await import('./push.js'); await showHere(title, message); } catch { /* demo */ }
    return;
  }
  for (const a of notifyActions(title, message)) {
    const [domain, service] = a.action.split('.');
    try { await b.callService(domain, service, a.data, a.target || {}); } catch { /* the others still go */ }
  }
}

// ---- automations ----

/** The automations a person made (not Evra's own helpers and alerts). */
export function userAutomations() {
  return [...store.states.values()]
    .filter((s) => s.entity_id.startsWith('automation.') && s.attributes?.id && !String(s.attributes.id).startsWith('evra_'))
    .map((s) => ({ entity_id: s.entity_id, id: String(s.attributes.id), name: s.attributes.friendly_name || s.entity_id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Config ids of automations that have a notification now. */
export function linkedAutomations() {
  const out = new Set();
  for (const s of store.states.values()) {
    const id = String(s.attributes?.id || '');
    if (s.entity_id.startsWith('automation.') && id.startsWith(LINK_PREFIX)) out.add(id.slice(LINK_PREFIX.length));
  }
  return out;
}

const defaultMessage = (name) => `${name} çalıştı`;

function linkConfig(auto, message) {
  return {
    alias: `Evra bildirimi: ${auto.name}`,
    description: 'Evra uygulaması kurdu (Bildirimler). Bağlı otomasyon çalışınca haber verir.',
    mode: 'queued', max: 10,
    triggers: [{ trigger: 'event', event_type: 'automation_triggered', event_data: { entity_id: auto.entity_id } }],
    actions: notifyActions(auto.name, message || defaultMessage(auto.name)),
  };
}

/** The message of an automation's notification, or null when it has none. */
export async function automationLink(auto) {
  const cfg = await store.backend?.fetchAutomationConfig(LINK_PREFIX + auto.id).catch(() => null);
  if (!cfg) return null;
  const a = [].concat(cfg.actions || []).find((x) => x.data?.message);
  return a?.data?.message || defaultMessage(auto.name);
}

export async function setAutomationLink(auto, message) {
  await store.backend.saveAutomation(LINK_PREFIX + auto.id, linkConfig(auto, message));
}

export async function removeAutomationLink(auto) {
  await store.backend.deleteAutomation(LINK_PREFIX + auto.id);
}

/** After a phone switched notifications on or off: the helpers send to the current list. */
export async function refreshAutomationLinks() {
  const linked = linkedAutomations();
  for (const auto of userAutomations()) {
    if (!linked.has(auto.id)) continue;
    try { await setAutomationLink(auto, await automationLink(auto)); } catch { /* the next one */ }
  }
}

// ---- automations written another way (EvrAI, ideas, older Evra, by hand) ----

const svcOf = (a) => (a && typeof a === 'object' ? a.action || a.service || '' : '');
const isHaAppNotify = (a) => svcOf(a) === 'notify.notify';
const isNote = (a) => svcOf(a) === 'persistent_notification.create';
const isEvraPush = (a) => svcOf(a) === 'notify.send_message'
  && [].concat(a.target?.entity_id ?? a.data?.entity_id ?? []).some((id) => store.entities.get(id)?.platform === 'html5');

/**
 * Actions with "tell the phones" written as Home Assistant's app (notify.notify, usually
 * next to a persistent notification with the same text) changed into Evra's notification
 * (notifyActions), so it arrives once, from Evra. Goes into choose / if / repeat / parallel
 * too. Returns [actions, changed].
 */
export function evraNotifySteps(actions) {
  let changed = false;
  const fix = (list) => {
    const arr = [].concat(list ?? []);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (isHaAppNotify(a)) {
        const title = a.data?.title || 'Evra';
        const message = a.data?.message || '';
        // Drop the persistent notification / Evra push with the same text right before it.
        while (out.length && (isNote(out[out.length - 1]) || isEvraPush(out[out.length - 1])) && out[out.length - 1].data?.message === message) out.pop();
        // ...and right after it.
        while (i + 1 < arr.length && (isNote(arr[i + 1]) || isEvraPush(arr[i + 1])) && arr[i + 1].data?.message === message) i++;
        out.push(...notifyActions(title, message));
        changed = true;
        continue;
      }
      out.push(nest(a));
    }
    return out;
  };
  const nest = (a) => {
    if (!a || typeof a !== 'object') return a;
    const b = { ...a };
    for (const k of ['then', 'else', 'sequence', 'default', 'parallel']) if (b[k] != null) b[k] = fix(b[k]);
    if (Array.isArray(b.choose)) b.choose = b.choose.map((c) => (c && c.sequence ? { ...c, sequence: fix(c.sequence) } : c));
    if (b.repeat?.sequence) b.repeat = { ...b.repeat, sequence: fix(b.repeat.sequence) };
    return b;
  };
  const result = fix(actions);
  return [result, changed];
}

/** An automation's config with Evra's notifications (see evraNotifySteps); null when nothing changed. */
export function evraNotifyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const key = cfg.actions ? 'actions' : cfg.action ? 'action' : null;
  if (!key) return null;
  const [actions, changed] = evraNotifySteps(cfg[key]);
  return changed ? { ...cfg, [key]: actions } : null;
}

/**
 * The household's automations that still notify through the Home Assistant app are saved
 * again with Evra's notification. Needs an admin account; quietly skips what it can't change.
 */
export async function migrateHaAppNotifications() {
  const b = store.backend;
  if (!b || b.mode !== 'live' || !pushEntities().length) return 0;
  let n = 0;
  for (const auto of userAutomations()) {
    try {
      const cfg = await b.fetchAutomationConfig(auto.id);
      if (!cfg || !JSON.stringify(cfg).includes('"notify.notify"')) continue;
      const fixed = evraNotifyConfig(cfg);
      if (fixed) { await b.saveAutomation(auto.id, fixed); n++; }
    } catch { /* the next one */ }
  }
  return n;
}
