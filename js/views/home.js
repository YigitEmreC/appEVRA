import { HOME } from '../config.js';
import { store, runQuickAction, userDevices, sortedAreas, entityArea, deviceName, areaName } from '../store.js';
import { h, num, numVal, relTime, isOn, isAvailable, toast, loadSettings, saveSettings } from '../util.js';
import { icon } from '../icons.js';
import { chip } from '../components.js';
import { deviceCardFor } from '../devices/cards.js';

export function renderHome(root, cleanup) {
  let room = loadSettings().room || 'all';
  const alerts = h('div', { class: 'alerts' });
  const heroSlot = h('div', { class: 'hero-slot' });
  const chips = h('div', { class: 'room-chips', role: 'tablist', 'aria-label': 'Rooms' });
  const devicesSlot = h('div', { class: 'devices-slot' });
  let local = [];

  root.append(
    alerts,
    h('div', { class: 'home-top' }, heroSlot, quickActions()),
    h('div', { class: 'section-row' }, h('h2', { class: 'section-title' }, 'Rooms'),
      h('a', { class: 'link', href: '#/devices/add' }, icon('plus', 14), 'Add device')),
    chips,
    devicesSlot,
  );

  function draw() {
    for (const fn of local) { try { fn(); } catch { /* ignore */ } }
    local = [];
    if (room !== 'all' && !store.areas.has(room)) room = 'all';
    drawChips();
    heroSlot.replaceChildren(hero(room, local));
    drawDevices();
  }

  function drawChips() {
    const devs = userDevices();
    const count = (areaId) => devs.filter((d) => (d.area_id || null) === areaId).length;
    const pickRoom = (id) => { room = id; saveSettings({ room: id }); draw(); };
    chips.replaceChildren(
      roomChip('All rooms', devs.length, room === 'all', () => pickRoom('all')),
      ...sortedAreas().map((a) => roomChip(a.name, count(a.area_id), room === a.area_id, () => pickRoom(a.area_id))),
      h('a', { class: 'room-chip add', href: '#/devices?tab=rooms' }, icon('plus', 14), 'Room'),
    );
  }

  function drawDevices() {
    const devs = userDevices();
    if (room !== 'all') {
      const list = devs.filter((d) => d.area_id === room);
      devicesSlot.replaceChildren(list.length ? grid(list) : emptyRoom());
      return;
    }
    const sections = sortedAreas().map((a) => ({ title: a.name, id: a.area_id, list: devs.filter((d) => d.area_id === a.area_id) }))
      .filter((s) => s.list.length);
    const loose = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id));
    if (loose.length) sections.push({ title: 'Not in a room', id: null, list: loose });
    devicesSlot.replaceChildren(...(sections.length ? sections.map((s) => h('section', { class: 'room-section' },
      h('div', { class: 'section-row' }, h('h3', { class: 'room-title' }, s.title), h('span', { class: 'muted small' }, `${s.list.length} device${s.list.length === 1 ? '' : 's'}`)),
      grid(s.list))) : [emptyRoom()]));
  }

  function grid(list) {
    return h('div', { class: 'grid devices' }, list.map((d) => deviceCardFor(d, local)));
  }

  function emptyRoom() {
    return h('div', { class: 'empty' }, icon('devices', 28),
      h('p', null, store.status.state === 'connected' ? 'No devices here yet.' : 'Devices appear once the app is connected.'),
      h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Add a device'));
  }

  // Re-draw when devices or rooms change (not on every state change).
  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.area_id}:${d.name_by_user}`).join('|') + '#' + [...store.areas.values()].map((a) => a.area_id + a.name).join('|');
    if (next === sig) return;
    sig = next;
    draw();
  }));
  cleanup.push(() => { for (const fn of local) { try { fn(); } catch { /* ignore */ } } });

  // Safety alerts across the whole home.
  const drawAlerts = () => {
    const active = [...store.states.values()].filter((s) => s.entity_id.startsWith('binary_sensor.') && s.state === 'on'
      && ['smoke', 'gas', 'moisture'].includes(s.attributes.device_class));
    alerts.replaceChildren(...active.map((s) => {
      const what = { smoke: 'Smoke detected', gas: 'Gas detected', moisture: 'Water leak detected' }[s.attributes.device_class];
      const where = areaName(entityArea(s.entity_id));
      const tip = { smoke: 'If there is a fire, call 112.', gas: 'No flames, don\'t touch switches, open windows and call 187.', moisture: 'Close the main water valve if you have one.' }[s.attributes.device_class];
      const dev = store.devices.get(store.entities.get(s.entity_id)?.device_id);
      return h('div', { class: 'alert-banner', role: 'alert' }, icon('alert', 22),
        h('div', null, h('strong', null, `${what}${where ? ' · ' + where : ''}`), h('p', null, `${dev ? deviceName(dev) : s.attributes.friendly_name}. ${tip}`)));
    }));
  };
  const alertTick = setInterval(drawAlerts, 2000);
  cleanup.push(() => clearInterval(alertTick));
  drawAlerts();
}

function roomChip(name, count, active, onclick) {
  return h('button', { class: `room-chip${active ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(active), onclick },
    name, h('span', { class: 'count' }, String(count)));
}

// ---- room card --------------------------------------------------------------------

function entitiesIn(roomId, test) {
  return [...store.states.values()].filter((s) => {
    if (!test(s)) return false;
    if (store.entities.get(s.entity_id)?.entity_category) return false;
    return roomId === 'all' || entityArea(s.entity_id) === roomId;
  });
}

function hero(roomId, cleanup) {
  const c = HOME.climate;
  const isTemp = (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature';
  const isHum = (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'humidity';
  const temps = entitiesIn(roomId, isTemp);
  const tempId = roomId === 'all' && store.get(c.temperature) ? c.temperature : (temps.find((s) => s.entity_id === c.temperature) || temps[0])?.entity_id;
  const humId = tempId === c.temperature ? c.humidity : entitiesIn(roomId, isHum)[0]?.entity_id;
  const useComfort = tempId === c.temperature;
  const label = roomId === 'all' ? (tempId ? areaName(entityArea(tempId)) || 'Home' : 'Home') : areaName(roomId);

  const temp = h('span', { class: 'hero-num' }, '–');
  const badge = h('span', { class: 'badge' }, '–');
  const humidity = h('strong', null, '–');
  const outside = h('strong', null, '–');
  const range = h('span', { class: 'hero-range' });
  const el = h('section', { class: 'hero tone-muted' },
    h('div', { class: 'hero-top' }, h('span', { class: 'hero-label' }, icon('thermometer', 16), label ? `Inside · ${label}` : 'Inside'), badge),
    h('div', { class: 'hero-temp' }, temp, h('span', { class: 'hero-deg' }, '°')),
    range,
    h('div', { class: 'hero-stats' },
      h('span', { class: 'stat' }, icon('droplet', 16), humidity, h('small', null, 'humidity')),
      h('span', { class: 'stat' }, icon('cloud', 16), outside, h('small', null, 'outside'))));

  const ids = [tempId, humId, c.comfortTempMin, c.comfortTempMax, c.comfortHumMin, HOME.weather].filter(Boolean);
  cleanup.push(store.watch(ids, () => {
    const t = tempId ? store.get(tempId) : null, hu = humId ? store.get(humId) : null, w = store.get(HOME.weather);
    const lo = useComfort ? numVal(store.get(c.comfortTempMin)) ?? 19 : 19;
    const hi = useComfort ? numVal(store.get(c.comfortTempMax)) ?? 27 : 25;
    const tv = numVal(t), hv = numVal(hu);
    temp.textContent = tempId ? (isAvailable(t) ? num(t) : '–') : '–';
    humidity.textContent = hu && isAvailable(hu) ? `${num(hu, 0)}%` : '–';
    const wt = w?.attributes?.temperature;
    outside.textContent = wt != null ? `${Math.round(wt)}°` : '–';
    range.textContent = tempId ? `Comfortable between ${lo}° and ${hi}°` : 'Add a temperature sensor to this room to see its climate';
    let tone = 'muted', text = tempId ? 'No reading' : 'No sensor';
    if (tv != null) {
      if (tv < lo) { tone = 'cool'; text = 'Chilly'; } else if (tv > hi) { tone = 'warm'; text = 'Warm'; } else { tone = 'ok'; text = 'Comfortable'; }
      if (hv != null && hv < (useComfort ? numVal(store.get(c.comfortHumMin)) ?? 40 : 35)) text += ' · dry air';
    }
    badge.textContent = text;
    el.className = `hero tone-${tone}`;
  }));

  const openChip = chip('window', '–');
  const presenceChip = chip('person', '–');
  const drawChips = () => {
    const contacts = entitiesIn(roomId, (s) => s.entity_id.startsWith('binary_sensor.') && ['opening', 'door', 'window', 'garage_door'].includes(s.attributes.device_class));
    const open = contacts.filter((s) => s.state === 'on');
    if (!contacts.length) { openChip.hidden = true; } else {
      openChip.hidden = false;
      if (open.length === 1) { openChip.className = 'chip warn'; openChip.setText(`${open[0].attributes.friendly_name} open`); }
      else if (open.length > 1) { openChip.className = 'chip warn'; openChip.setText(`${open.length} open`); }
      else { openChip.className = 'chip ok'; openChip.setText(contacts.length === 1 ? `${contacts[0].attributes.friendly_name} closed` : 'All closed'); }
    }
    const occ = entitiesIn(roomId, (s) => s.entity_id.startsWith('binary_sensor.') && ['occupancy', 'presence', 'motion'].includes(s.attributes.device_class)
      && !store.entities.get(s.entity_id)?.hidden_by);
    if (!occ.length) { presenceChip.hidden = true; } else {
      presenceChip.hidden = false;
      const here = occ.filter((s) => s.state === 'on');
      if (here.length) { presenceChip.className = 'chip accent live'; presenceChip.setText('Someone is here'); }
      else {
        const last = occ.map((s) => s.last_changed).sort().pop();
        presenceChip.className = 'chip'; presenceChip.setText(`Empty · seen ${relTime(last)}`);
      }
    }
  };
  const tick = setInterval(drawChips, 3000);
  cleanup.push(() => clearInterval(tick));
  drawChips();
  el.append(h('div', { class: 'hero-chips' }, openChip, presenceChip));
  return el;
}

// ---- quick actions ---------------------------------------------------------------------

function quickActions() {
  return h('section', { class: 'quick' },
    h('h2', { class: 'section-title' }, 'Quick actions'),
    h('div', { class: 'quick-row' }, HOME.quickActions.map((a) => {
      const btn = h('button', { class: `quick-btn q-${a.id}`, type: 'button', style: { '--tone': a.tone } },
        h('span', { class: 'quick-icon' }, icon(a.icon, 20)),
        h('span', { class: 'quick-text' }, h('strong', null, a.name), h('small', null, a.hint)));
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('busy')) return;
        btn.classList.add('busy');
        try { await runQuickAction(a); toast(`${a.name} done`); } catch { /* toast shown */ }
        btn.classList.remove('busy');
      });
      return btn;
    })));
}
