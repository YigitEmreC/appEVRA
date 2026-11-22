import { CATEGORIES, PRODUCTS, productById, productForDevice, PAIRING_LABEL } from '../catalog.js';
import { store, userDevices, sortedAreas, deviceName, areaName, deviceEntities } from '../store.js';
import { h, num, numVal, isAvailable, toast, sleep } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { deviceCardFor, kindIcon } from '../devices/cards.js';

export function renderDevices(root, cleanup, ctx) {
  const [first, second] = ctx.params;
  if (first === 'add' && second) return renderProduct(root, cleanup, productById(second));
  if (first === 'add') return renderCatalog(root, cleanup);
  if (first) return renderDetail(root, cleanup, decodeURIComponent(first));
  return renderList(root, cleanup, ctx.query.get('tab') === 'rooms' ? 'rooms' : 'devices');
}

// ---- helpers ---------------------------------------------------------------------

function backLink(href, text) {
  return h('a', { class: 'back-link', href }, icon('left', 16), text);
}

function deviceStatus(d) {
  const ents = deviceEntities(d.id);
  const states = ents.map((e) => store.get(e.entity_id)).filter(Boolean);
  const main = states.filter((s) => !store.entities.get(s.entity_id)?.entity_category);
  if (main.length && main.every((s) => s.state === 'unavailable')) return { text: 'Offline', cls: 'bad' };
  const batt = states.find((s) => s.attributes.device_class === 'battery');
  const v = numVal(batt);
  if (v != null && v < 20) return { text: `Battery ${num(batt, 0)}%`, cls: 'warn' };
  return null;
}

function roomSelect(current, onChange) {
  const sel = h('select', { class: 'select', 'aria-label': 'Room' },
    h('option', { value: '' }, 'No room'),
    sortedAreas().map((a) => h('option', { value: a.area_id, selected: a.area_id === current }, a.name)),
    h('option', { value: '__new__' }, 'New room…'));
  sel.addEventListener('change', async () => {
    if (sel.value === '__new__') {
      const name = prompt('Name for the new room');
      if (!name || !name.trim()) { sel.value = current || ''; return; }
      try {
        const area = await store.backend.createArea(name.trim());
        await waitFor(() => store.areas.has(area.area_id));
        sel.replaceChildren(h('option', { value: '' }, 'No room'), ...sortedAreas().map((a) => h('option', { value: a.area_id }, a.name)), h('option', { value: '__new__' }, 'New room…'));
        sel.value = area.area_id;
        onChange(area.area_id);
      } catch (e) { toast(`Couldn't create the room: ${e.message}`, 'error'); sel.value = current || ''; }
      return;
    }
    onChange(sel.value || null);
  });
  return sel;
}

async function waitFor(test, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (test()) return true;
    await sleep(250);
  }
  return false;
}

// "Evra Smart Plug", plus maker and model number in developer mode. Devices
// that aren't in the catalogue keep their model, since it's all there is.
function productLine(p, d, withMaker = false) {
  const extra = [withMaker ? d.manufacturer : null, d.model].filter((v) => v && v !== p?.name);
  if (!p) return [withMaker ? d.manufacturer : null, d.model].filter(Boolean).join(' · ');
  return [p.name, extra.length ? h('span', { class: 'dev-only' }, ` · ${extra.join(' · ')}`) : null];
}

function deviceRow(d) {
  const p = productForDevice(d);
  const status = deviceStatus(d);
  return h('a', { class: 'list-row', href: `#/devices/${encodeURIComponent(d.id)}` },
    h('span', { class: 'row-icon' }, icon(kindIcon(d), 20)),
    h('span', { class: 'row-text' }, h('strong', null, deviceName(d)), h('small', null, productLine(p, d))),
    status ? h('span', { class: `pill ${status.cls}` }, status.text) : null,
    icon('right', 16));
}

// ---- list and rooms -------------------------------------------------------------------

function renderList(root, cleanup, initialTab) {
  let tab = initialTab;
  let query = '';
  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const body = h('div', { class: 'devices-body' });
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search devices', 'aria-label': 'Search devices' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });

  const drawTabs = () => tabs.replaceChildren(...[['devices', 'Devices'], ['rooms', 'Rooms']].map(([id, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'active' : '',
    onclick: () => { tab = id; history.replaceState(null, '', id === 'rooms' ? '#/devices?tab=rooms' : '#/devices'); drawTabs(); draw(); },
  }, label)));

  function draw() {
    search.hidden = tab !== 'devices';
    body.replaceChildren(tab === 'rooms' ? roomsPanel() : devicesPanel());
  }

  function devicesPanel() {
    const devs = userDevices().filter((d) => !query || `${deviceName(d)} ${d.model} ${productForDevice(d)?.name || ''}`.toLowerCase().includes(query));
    if (!devs.length) {
      return h('div', { class: 'empty' }, icon('devices', 28), h('p', null, query ? 'No devices match.' : 'No devices yet.'),
        h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Add a device'));
    }
    const groups = sortedAreas().map((a) => ({ name: a.name, list: devs.filter((d) => d.area_id === a.area_id) })).filter((g) => g.list.length);
    const loose = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id));
    if (loose.length) groups.push({ name: 'Not in a room', list: loose });
    return h('div', { class: 'list-groups' }, groups.map((g) => h('section', { class: 'list-group' },
      h('h3', { class: 'group-title' }, g.name, h('span', { class: 'muted' }, ` · ${g.list.length}`)),
      h('div', { class: 'list' }, g.list.map(deviceRow)))));
  }

  function roomsPanel() {
    const input = h('input', { class: 'input', placeholder: 'Living room, Kitchen, Bedroom…', 'aria-label': 'New room name' });
    const add = h('button', { class: 'btn primary', type: 'submit' }, icon('plus', 16), 'Add room');
    const form = h('form', { class: 'inline-form' }, input, add);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { toast('Type a name for the room first', 'error'); return; }
      if ([...store.areas.values()].some((a) => a.name.toLowerCase() === name.toLowerCase())) { toast('There is already a room with that name', 'error'); return; }
      add.disabled = true;
      try { await store.backend.createArea(name); toast(`${name} added`); } catch (err) { toast(`Couldn't add the room: ${err.message}`, 'error'); }
      add.disabled = false;
    });
    const devs = userDevices();
    const rooms = sortedAreas();
    return h('div', { class: 'rooms-panel' },
      card({ title: 'New room', iconName: 'plus' }, form),
      rooms.length ? h('div', { class: 'list' }, rooms.map((a) => {
        const count = devs.filter((d) => d.area_id === a.area_id).length;
        const rename = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Rename ${a.name}`, title: 'Rename' }, icon('edit', 16));
        const del = h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': `Delete ${a.name}`, title: 'Delete' }, icon('trash', 16));
        rename.addEventListener('click', async () => {
          const name = prompt('Rename room', a.name);
          if (!name || !name.trim() || name.trim() === a.name) return;
          try { await store.backend.renameArea(a.area_id, name.trim()); } catch (err) { toast(`Couldn't rename: ${err.message}`, 'error'); }
        });
        del.addEventListener('click', async () => {
          if (!confirm(`Delete the room "${a.name}"? Its ${count} device${count === 1 ? '' : 's'} stay connected, just without a room.`)) return;
          try { await store.backend.deleteArea(a.area_id); toast(`${a.name} deleted`); } catch (err) { toast(`Couldn't delete: ${err.message}`, 'error'); }
        });
        return h('div', { class: 'list-row static' },
          h('span', { class: 'row-icon' }, icon('rooms', 20)),
          h('span', { class: 'row-text' }, h('strong', null, a.name), h('small', null, `${count} device${count === 1 ? '' : 's'}`)),
          rename, del);
      })) : h('p', { class: 'muted pad' }, 'No rooms yet.'));
  }

  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.area_id}:${d.name_by_user}`).join('|') + '#' + [...store.areas.values()].map((a) => a.area_id + a.name).join('|');
    if (next !== sig) { sig = next; draw(); }
  }));
  drawTabs();
  root.append(h('div', { class: 'toolbar' }, tabs, h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Add device')), search, body);
}

// ---- device details -----------------------------------------------------------------------

function renderDetail(root, cleanup, deviceId) {
  const local = [];
  cleanup.push(() => local.forEach((fn) => fn()));
  const draw = () => {
    local.splice(0).forEach((fn) => fn());
    const d = store.devices.get(deviceId);
    if (!d) {
      root.replaceChildren(backLink('#/devices', 'Devices'),
        h('div', { class: 'empty' }, icon('devices', 28), h('p', null, store.status.state === 'connected' ? 'This device no longer exists.' : 'Loading…')));
      return;
    }
    const p = productForDevice(d);
    const nameInput = h('input', { class: 'input', value: deviceName(d), 'aria-label': 'Device name' });
    const saveName = h('button', { class: 'btn', type: 'submit' }, 'Save');
    const nameForm = h('form', { class: 'inline-form' }, nameInput, saveName);
    nameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) { toast('The name can\'t be empty', 'error'); return; }
      try { await store.backend.updateDevice(d.id, { name_by_user: name }); toast('Name saved'); } catch (err) { toast(`Couldn't rename: ${err.message}`, 'error'); }
    });
    const room = roomSelect(d.area_id, async (areaId) => {
      try { await store.backend.updateDevice(d.id, { area_id: areaId }); toast(areaId ? `Moved to ${areaName(areaId)}` : 'Removed from its room'); } catch (err) { toast(`Couldn't move it: ${err.message}`, 'error'); }
    });
    const remove = h('button', { class: 'btn danger', type: 'button' }, icon('trash', 16), 'Remove device');
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove ${deviceName(d)} from the network? To use it again you'll need to pair it again.`)) return;
      remove.disabled = true;
      try {
        await store.backend.removeDevice(d.id, d);
        toast(`${deviceName(d)} removed`);
        location.hash = '#/devices';
      } catch (err) {
        toast(`Couldn't remove it: ${err.message}`, 'error');
        remove.disabled = false;
      }
    });
    const ents = deviceEntities(d.id);
    const entityRows = h('ul', { class: 'entity-rows' });
    local.push(store.watch(ents.length ? ents.map((e) => e.entity_id) : ['__none__'], () => {
      entityRows.replaceChildren(...ents.map((e) => {
        const s = store.get(e.entity_id);
        const unit = s?.attributes?.unit_of_measurement || '';
        return h('li', null, h('span', null, s?.attributes?.friendly_name || e.original_name || e.entity_id, h('small', { class: 'muted' }, ` ${e.entity_id}`)),
          h('strong', null, s ? `${s.state}${unit ? ' ' + unit : ''}` : '–'));
      }));
    }));
    root.replaceChildren(
      backLink('#/devices', 'Devices'),
      h('header', { class: 'detail-head' },
        h('span', { class: 'detail-icon' }, icon(kindIcon(d), 26)),
        h('div', null, h('h2', null, deviceName(d)), h('p', { class: 'muted' }, productLine(p, d, true)))),
      h('div', { class: 'detail-grid' },
        h('div', { class: 'detail-main' }, deviceCardFor(d, local)),
        h('div', { class: 'detail-side' },
          card({ title: 'Settings', iconName: 'gear' },
            h('label', { class: 'field' }, h('span', null, 'Name'), nameForm),
            h('label', { class: 'field' }, h('span', null, 'Room'), room)),
          p ? card({ title: 'About this product', iconName: p.icon },
            h('p', null, p.summary),
            p.emergency ? h('p', { class: 'alarm-note static' }, icon('alert', 16), p.emergency) : null,
            p.note ? h('p', { class: 'muted small' }, p.note) : null,
            h('p', { class: 'muted small' }, p.protocol, h('span', { class: 'dev-only' }, ` · ${PAIRING_LABEL[p.pairing]}${d.sw_version ? ' · firmware ' + d.sw_version : ''}`))) : null,
          card({ title: 'Entities', iconName: 'devices', className: 'dev-only' }, entityRows),
          card({ title: 'Remove', iconName: 'trash', className: 'danger-zone' },
            h('p', { class: 'muted small' }, 'Disconnects the device from the hub and deletes it from the app.'), remove))),
    );
  };
  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const d = store.devices.get(deviceId);
    const next = d ? `${d.name_by_user}:${d.area_id}:${deviceEntities(d.id).length}:${store.areas.size}` : 'gone';
    if (next !== sig) { sig = next; draw(); }
  }));
}

// ---- add a device: catalogue ------------------------------------------------------------------

function renderCatalog(root, cleanup) {
  let query = '';
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search the Evra range', 'aria-label': 'Search products' });
  const body = h('div', { class: 'catalog' });
  const draw = () => {
    const matches = PRODUCTS.filter((p) => !query || `${p.name} ${p.nameTr} ${p.model} ${p.protocol}`.toLowerCase().includes(query));
    body.replaceChildren(...CATEGORIES.map((c) => {
      const list = matches.filter((p) => p.category === c.id);
      if (!list.length) return null;
      return h('section', { class: 'catalog-group' },
        h('h3', { class: 'group-title' }, c.name),
        h('div', { class: 'product-grid' }, list.map((p) => h('a', { class: 'product-tile', href: `#/devices/add/${p.id}` },
          h('span', { class: 'row-icon' }, icon(p.icon, 22)),
          h('span', { class: 'row-text' }, h('strong', null, p.name), h('small', null, p.model)),
          h('span', { class: `pill pairing-${p.pairing}` }, PAIRING_LABEL[p.pairing])))));
    }).filter(Boolean));
    if (!body.children.length) body.append(h('p', { class: 'muted pad' }, 'No products match.'));
  };
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
  draw();
  root.append(backLink('#/devices', 'Devices'), h('p', { class: 'muted intro' }, `Pick the product you're adding. ${PRODUCTS.length} products in the Evra range.`), search, body);
}

// ---- add a device: one product ---------------------------------------------------------------

function renderProduct(root, cleanup, p) {
  if (!p) {
    root.append(backLink('#/devices/add', 'All products'), h('div', { class: 'empty' }, h('p', null, 'Unknown product.')));
    return;
  }
  const panel = h('div', { class: 'pair-panel' });
  let alive = true;
  let stopJoin = null;
  cleanup.push(() => { alive = false; if (stopJoin) stopJoin(); });

  root.append(
    backLink('#/devices/add', 'All products'),
    h('header', { class: 'detail-head' },
      h('span', { class: 'detail-icon' }, icon(p.icon, 26)),
      h('div', null, h('h2', null, p.name), h('p', { class: 'muted' }, `${p.model} · ${p.protocol}`))),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'detail-main' },
        card({ title: 'Connect it', iconName: 'link' }, panel)),
      h('div', { class: 'detail-side' },
        card({ title: 'About', iconName: p.icon }, h('p', null, p.summary),
          p.emergency ? h('p', { class: 'alarm-note static' }, icon('alert', 16), p.emergency) : null),
        card({ title: 'Installation', iconName: 'check' }, h('ol', { class: 'steps' }, p.setup.map((s) => h('li', null, s)))))),
  );

  const before = new Set(store.devices.keys());
  const newDeviceId = () => [...store.devices.keys()].find((id) => !before.has(id));

  function show(...kids) { if (alive) panel.replaceChildren(...kids); }

  // Final step: name it and pick a room.
  function finish(deviceId) {
    const d = store.devices.get(deviceId);
    const nameInput = h('input', { class: 'input', value: d ? deviceName(d) : p.name, 'aria-label': 'Name' });
    let areaId = null;
    const room = roomSelect(null, (id) => { areaId = id; });
    const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 16), 'Save');
    const form = h('form', { class: 'stack' },
      h('p', { class: 'success-line' }, icon('check', 18), `${p.name} is connected.`),
      h('label', { class: 'field' }, h('span', null, 'Name'), nameInput),
      h('label', { class: 'field' }, h('span', null, 'Room'), room),
      save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await store.backend.updateDevice(deviceId, { name_by_user: nameInput.value.trim() || null, area_id: areaId });
        toast(`${nameInput.value.trim() || p.name} added`);
        location.hash = `#/devices/${encodeURIComponent(deviceId)}`;
      } catch (err) { toast(`Couldn't save: ${err.message}`, 'error'); save.disabled = false; }
    });
    show(form);
  }

  async function awaitDevice(message, timeout = 25000) {
    show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), message));
    const ok = await waitFor(() => !!newDeviceId(), timeout);
    if (!alive) return;
    if (ok) finish(newDeviceId());
    else show(h('p', null, 'Home Assistant accepted it, but no new device has appeared yet. It may take a minute; it will show up in the device list.'),
      h('a', { class: 'btn', href: '#/devices' }, 'Back to devices'));
  }

  const notConnected = () => {
    if (store.status.state === 'connected') return false;
    toast('Connect to Home Assistant first (Settings)', 'error');
    return true;
  };

  // ---- each pairing method ----
  if (p.pairing === 'none') {
    show(h('p', null, p.note || 'This product doesn\'t need pairing.'), h('a', { class: 'btn', href: '#/devices/add' }, 'Back to products'));
    return;
  }

  if (p.pairing === 'zigbee') {
    const start = h('button', { class: 'btn primary', type: 'button' }, icon('link', 16), 'Start pairing');
    show(h('p', null, 'Pairing opens the hub to new Zigbee devices for about 4 minutes.'),
      p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null, start);
    start.addEventListener('click', async () => {
      if (notConnected()) return;
      try { await store.backend.permitJoin(254, p); } catch (err) { toast(`Couldn't start pairing: ${err.message}`, 'error'); return; }
      stopJoin = () => store.backend.stopJoin();
      const ends = Date.now() + 254000;
      const count = h('strong', null, '4:14');
      const stop = h('button', { class: 'btn ghost', type: 'button' }, 'Stop');
      stop.addEventListener('click', () => { stopJoin?.(); stopJoin = null; alive && renderAgain(); });
      show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Waiting for the device… ', count),
        p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null,
        h('p', { class: 'muted small' }, 'Keep the device close to the hub while it pairs. Battery devices: press the button every few seconds to keep them awake.'),
        stop);
      while (alive && Date.now() < ends && stopJoin) {
        const id = newDeviceId();
        if (id) { stopJoin(); stopJoin = null; finish(id); return; }
        const left = Math.max(0, Math.round((ends - Date.now()) / 1000));
        count.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        await sleep(500);
      }
      if (alive && stopJoin) {
        stopJoin = null;
        show(h('p', null, 'Nothing joined. Check the device is in pairing mode and close to the hub, then try again.'), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Try again'));
      }
    });
    return;
  }

  if (p.pairing === 'matter') {
    const code = h('input', { class: 'input', inputmode: 'numeric', placeholder: '1234-567-8901', 'aria-label': 'Matter code' });
    const go = h('button', { class: 'btn primary', type: 'submit' }, icon('link', 16), 'Connect');
    const form = h('form', { class: 'stack' }, p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null,
      h('label', { class: 'field' }, h('span', null, 'Matter pairing code'), code), go);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (notConnected()) return;
      if (!code.value.trim()) { toast('Enter the Matter code first', 'error'); return; }
      go.disabled = true;
      show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Connecting… this can take a minute.'));
      try { await store.backend.matterCommission(code.value.trim(), p); await awaitDevice('Connected. Waiting for it to appear…'); }
      catch (err) { show(h('p', { class: 'error-line' }, `Couldn't connect: ${err.message}`), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Try again')); }
    });
    show(form);
    return;
  }

  if (p.pairing === 'cloud') {
    const kids = [h('p', null, p.note || 'This product connects through its maker\'s cloud.'),
      h('p', { class: 'muted small' }, 'Link the maker\'s account (Tuya / Smart Life) in Home Assistant once; its devices then appear here by themselves.')];
    if (store.backend?.mode === 'demo') {
      const add = h('button', { class: 'btn primary', type: 'button' }, icon('plus', 16), 'Add it (demo)');
      add.addEventListener('click', async () => { add.disabled = true; const id = await store.backend.cloudAdd(p); finish(id); });
      kids.push(add);
    } else if (store.backend?.integrationUrl) {
      kids.push(h('a', { class: 'btn primary', href: store.backend.integrationUrl(p.integration), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Link the account in Home Assistant'));
    }
    show(...kids);
    return;
  }

  // 'flow': a Home Assistant setup form.
  const start = h('button', { class: 'btn primary', type: 'button' }, icon('link', 16), 'Start setup');
  show(p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null, start);
  start.addEventListener('click', async () => {
    if (notConnected()) return;
    try { renderStep(await store.backend.flowStart(p.integration, p)); }
    catch (err) { show(h('p', { class: 'error-line' }, `Couldn't start the setup: ${err.message}`), fallbackLink()); }
  });

  function fallbackLink() {
    return store.backend?.integrationUrl
      ? h('a', { class: 'btn', href: store.backend.integrationUrl(p.integration), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Set it up in Home Assistant')
      : null;
  }

  function renderStep(step) {
    if (!alive || !step) return;
    if (step.type === 'create_entry') { awaitDevice(`${step.title || p.name} added. Waiting for its device…`); return; }
    if (step.type === 'abort') {
      const reason = { already_configured: 'This device is already set up.', no_devices_found: 'No device was found on the network.', cannot_connect: 'Couldn\'t reach the device.' }[step.reason] || `Setup stopped: ${step.reason}`;
      show(h('p', { class: 'error-line' }, reason), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Start again'));
      return;
    }
    if (step.type === 'menu') {
      show(h('p', null, 'Choose how to continue:'), h('div', { class: 'btn-row' }, (Array.isArray(step.menu_options) ? step.menu_options : Object.keys(step.menu_options || {})).map((opt) =>
        h('button', { class: 'btn', type: 'button', onclick: async () => renderStep(await store.backend.flowSubmit(step.flow_id, { next_step_id: opt })) }, String(opt).replace(/_/g, ' ')))));
      return;
    }
    if (step.type !== 'form') {
      show(h('p', null, 'This step has to be finished in Home Assistant.'), fallbackLink());
      return;
    }
    const fields = (step.data_schema || []).map((f) => formField(f, step.errors?.[f.name]));
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Continue');
    const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => { store.backend.flowAbort(step.flow_id); renderAgain(); } }, 'Cancel');
    const form = h('form', { class: 'stack' },
      step.errors?.base ? h('p', { class: 'error-line' }, readableError(step.errors.base)) : null,
      fields.map((f) => f.el), h('div', { class: 'btn-row' }, submit, cancel));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      for (const f of fields) { const v = f.value(); if (v !== undefined) data[f.name] = v; }
      submit.disabled = true;
      try { renderStep(await store.backend.flowSubmit(step.flow_id, data)); }
      catch (err) { toast(`Setup failed: ${err.message}`, 'error'); submit.disabled = false; }
    });
    show(form);
  }

  function renderAgain() {
    root.replaceChildren();
    renderProduct(root, cleanup, p);
  }
}

const FIELD_LABELS = { host: 'IP address', port: 'Port', username: 'Username', password: 'Password', name: 'Name' };

function readableError(code) {
  return { cannot_connect: 'Couldn\'t reach the device. Check the address.', invalid_auth: 'Wrong username or password.', unknown: 'Something went wrong.' }[code] || String(code);
}

// Turns one field of a Home Assistant form into an input.
function formField(f, error) {
  const sel = f.selector ? Object.keys(f.selector)[0] : null;
  const type = sel || f.type || 'string';
  const label = FIELD_LABELS[f.name] || String(f.name).replace(/_/g, ' ');
  const required = f.required || (f.optional === false);
  let input;
  if (type === 'boolean') {
    input = h('input', { type: 'checkbox', checked: !!f.default });
    return {
      name: f.name,
      el: h('label', { class: 'check-field' }, input, h('span', null, label)),
      value: () => input.checked,
    };
  }
  if (type === 'select' || f.options) {
    const opts = f.options || f.selector?.select?.options || [];
    const pairs = Array.isArray(opts) ? opts.map((o) => (Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o])) : Object.entries(opts);
    input = h('select', { class: 'select' }, pairs.map(([v, l]) => h('option', { value: v, selected: v === f.default }, l)));
  } else {
    const password = type === 'text' && f.selector?.text?.type === 'password' || f.name === 'password';
    const numeric = ['integer', 'float', 'number'].includes(type);
    input = h('input', { class: 'input', type: password ? 'password' : numeric ? 'number' : 'text', value: f.default ?? '', required, autocomplete: password ? 'current-password' : 'off' });
  }
  return {
    name: f.name,
    el: h('label', { class: 'field' }, h('span', null, label, required ? '' : ' (optional)'), input, error ? h('small', { class: 'error-line' }, readableError(error)) : null),
    value: () => {
      if (input.value === '' && !required) return undefined;
      if (['integer'].includes(type)) return parseInt(input.value, 10);
      if (['float', 'number'].includes(type)) return parseFloat(input.value);
      return input.value;
    },
  };
}
