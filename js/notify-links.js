// Notifications tied to scenes and automations (the Bildirimler tab, the scene editor).
//
// Who gets them: the phones and computers that switched on Evra notifications (js/push.js,
// Home Assistant's HTML5 push), phones with the Home Assistant app (notify.notify), and
// Home Assistant's own notification list.
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

/** Home Assistant actions that tell everyone (also used by js/home-care.js). */
export function notifyActions(title, message) {
  const phones = pushEntities();
  return [
    ...(phones.length ? [{ action: 'notify.send_message', target: { entity_id: phones }, data: { title, message }, continue_on_error: true }] : []),
    // Phones with the Home Assistant app; without one this step fails, which mustn't stop the rest.
    { action: 'notify.notify', data: { title, message }, continue_on_error: true },
    { action: 'persistent_notification.create', data: { title, message } },
  ];
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
