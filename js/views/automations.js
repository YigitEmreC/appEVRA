import { store } from '../store.js';
import { h, relTime, isAvailable, toast } from '../util.js';
import { icon } from '../icons.js';
import { toggle } from '../components.js';
import { renderAutomationEditor } from './automation-editor.js';

export function renderAutomations(root, cleanup, ctx) {
  const [first, second] = ctx.params;
  if (first === 'new') return renderAutomationEditor(root, cleanup, null);
  if (first === 'edit' && second) return renderAutomationEditor(root, cleanup, decodeURIComponent(second));

  const list = h('div', { class: 'auto-list' });
  const descriptions = new Map();
  let drawn = '';

  const draw = () => {
    const autos = store.all('automation').sort((a, b) => (a.attributes.friendly_name || '').localeCompare(b.attributes.friendly_name || ''));
    const key = autos.map((a) => a.entity_id + a.attributes.friendly_name).join('|');
    if (key === drawn) return;
    drawn = key;
    if (!autos.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('robot', 28),
        h('p', null, store.status.state === 'connected' ? 'No automations yet.' : 'Automations appear once the app is connected.'),
        h('a', { class: 'btn primary', href: '#/automations/new' }, icon('plus', 16), 'New automation')));
      return;
    }
    list.replaceChildren(...autos.map((a) => row(a.entity_id)));
  };

  function iconFor(label) {
    const l = label.toLowerCase();
    return /window|door/.test(l) ? 'window' : /presence|motion|kapkan/.test(l) ? 'person' : /heater|heat/.test(l) ? 'heater'
      : /\btv\b/.test(l) ? 'tv' : /light|led|lamp/.test(l) ? 'bulb' : /smoke|gas|leak|water|alarm/.test(l) ? 'alert' : 'robot';
  }

  function row(entityId) {
    const s0 = store.get(entityId);
    const name = h('h3', null, '–');
    const desc = h('p', { class: 'auto-desc' });
    const meta = h('p', { class: 'auto-meta' });
    const sw = toggle('Automation on or off', (on) => store.call('automation', on ? 'turn_on' : 'turn_off', entityId));
    const run = h('button', { class: 'btn ghost', type: 'button' }, icon('play', 14), 'Run now');
    run.addEventListener('click', async () => {
      const s = store.get(entityId);
      if (!confirm(`Run "${s?.attributes?.friendly_name}" now? It does everything the automation does, including sending IR codes.`)) return;
      try { await store.call('automation', 'trigger', entityId, { skip_condition: true }); toast('Automation started'); } catch { /* toast shown */ }
    });
    const configId = s0?.attributes?.id;
    const edit = configId ? h('a', { class: 'btn ghost', href: `#/automations/edit/${encodeURIComponent(configId)}` }, icon('edit', 14), 'Edit') : null;
    const del = configId ? h('button', { class: 'btn ghost danger-text', type: 'button' }, icon('trash', 14), 'Delete') : null;
    del?.addEventListener('click', async () => {
      const label = store.get(entityId)?.attributes?.friendly_name || 'this automation';
      if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
      try { await store.backend.deleteAutomation(configId); toast('Automation deleted'); } catch (e) { toast(`Couldn't delete: ${e.message}`, 'error'); }
    });
    const el = h('article', { class: 'auto-item' },
      h('div', { class: 'auto-top' },
        h('span', { class: 'auto-icon' }, icon(iconFor(s0?.attributes?.friendly_name || entityId), 20)),
        h('div', { class: 'auto-titles' }, name, meta), sw),
      desc,
      h('div', { class: 'auto-actions' }, run, edit, h('span', { class: 'sep' }), del));

    const tick = () => {
      const s = store.get(entityId);
      if (!s) return;
      name.textContent = s.attributes.friendly_name || entityId;
      sw.set(s.state === 'on', !isAvailable(s));
      el.classList.toggle('off', s.state !== 'on');
      el.classList.toggle('running', !!s.attributes.current);
      meta.textContent = `${s.attributes.current ? 'Running now' : s.state === 'on' ? 'On' : 'Off'} · last ran ${relTime(s.attributes.last_triggered)}`;
    };
    cleanup.push(store.watch(entityId, tick));
    const t = setInterval(tick, 30000);
    cleanup.push(() => clearInterval(t));
    if (configId) loadDescription(configId, desc);
    return el;
  }

  async function loadDescription(configId, el) {
    if (descriptions.has(configId)) { el.textContent = descriptions.get(configId); return; }
    try {
      const cfg = await store.backend.fetchAutomationConfig(configId);
      const text = cfg?.description || '';
      descriptions.set(configId, text);
      el.textContent = text;
    } catch { /* description is optional */ }
  }

  cleanup.push(store.onStatus(() => { drawn = ''; draw(); }));
  const poll = setInterval(draw, 1500);
  cleanup.push(() => clearInterval(poll));

  root.append(
    h('div', { class: 'toolbar' },
      h('p', { class: 'muted intro' }, 'Automations run inside Home Assistant, so they keep working when the app is closed.'),
      h('a', { class: 'btn primary', href: '#/automations/new' }, icon('plus', 16), 'New automation')),
    list,
  );
}
