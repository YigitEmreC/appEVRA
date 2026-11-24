import { HOME } from '../config.js';
import { store, runQuickAction, userDevices, sortedAreas, entityArea, deviceName, areaName } from '../store.js';
import { h, num, numVal, relTime, isOn, isAvailable, toast, loadSettings, saveSettings } from '../util.js';
import { icon } from '../icons.js';
import { outsideNow, onWeather } from '../weather.js';
import { chip, sortable } from '../components.js';
import { deviceCardFor } from '../devices/cards.js';
import { getCustom, setCustom, ordered, isHidden, withFlag, mergeOrder, isEditing, SECTIONS, INDICATORS } from '../custom.js';
import { arrangeable } from '../edit.js';
import { mascot } from '../mascot.js';
import { member, canUseAssistant, onAccount, plansUrl } from '../account.js';
import { homeModel } from '../home-model.js';
import { roomsByFloor } from '../rooms.js';

// Home follows the person's layout (js/custom.js). In edit mode everything
// here can be dragged and hidden on the screen itself: the sections, the quick
// action buttons, the climate card's readings and chips, the rooms (their order
// sets the house model's plan) and the device tiles (which can also be made wide or small).
export function renderHome(root, cleanup) {
  const custom = getCustom();
  const editing = isEditing();
  const shown = (cfg, id) => editing || !isHidden(cfg, id);
  const sections = ordered(SECTIONS, custom.sections).filter((s) => shown(custom.sections, s.id));
  const shows = (id) => sections.some((s) => s.id === id);
  // The rooms in the chosen order; hidden rooms leave Home (not the Devices screen).
  const rooms = () => ordered(sortedAreas(), getCustom().rooms, (a) => a.area_id).filter((a) => shown(getCustom().rooms, a.area_id));
  // Without the house model there's no way to pick a room, so show them all.
  let room = shows('rooms') && !isHidden(custom.sections, 'rooms') ? loadSettings().room || 'all' : 'all';
  // The floor shown on the house model (its floor_id; null = ground floor), when there are floors.
  let floorKey = loadSettings().homeFloor ?? null;
  let floorEnter = null;
  const alerts = h('div', { class: 'alerts' });
  const heroSlot = h('div', { class: 'hero-slot' });
  const model = h('div', { class: 'home-model' });
  // While editing, the rooms show as chips too, to drag into order or hide.
  const chips = h('div', { class: 'room-chips', role: 'tablist', 'aria-label': 'Odalar' });
  const devicesSlot = h('div', { class: 'devices-slot' });
  let local = [];

  const parts = {
    climate: heroSlot,
    quick: quickActions(custom, editing),
    rooms: [h('div', { class: 'section-row' }, h('h2', { class: 'section-title' }, 'Odalar'),
      h('div', { class: 'section-links' },
        h('a', { class: 'link', href: '#/devices?tab=rooms' }, icon('plus', 14), 'Oda'),
        h('a', { class: 'link', href: '#/devices/add' }, icon('plus', 14), 'Cihaz ekle'))), model, chips],
    devices: devicesSlot,
  };
  // Each section is a block. On wide screens a "half" block sits next to
  // another half one. While editing, blocks can be dragged anywhere on them.
  const blocks = h('div', { class: 'home-blocks' });
  for (const s of sections) {
    if (!parts[s.id]) continue;
    blocks.append(h('div', { class: `home-block${custom.sections.half.includes(s.id) ? ' half' : ''}`, 'data-id': s.id, 'data-name': s.label }, parts[s.id]));
  }
  arrangeable(blocks, 'sections', {
    all: ordered(SECTIONS, custom.sections).map((s) => s.id),
    big: true,
    flag: { field: 'half', cls: 'half', icon: 'widen', label: 'Yarım genişlik (büyük ekranlarda yan yana)' },
  });
  root.append(alerts, blocks);

  // Evra's mascot: a small button that opens the assistant. When the home's plan doesn't
  // include it, the mascot wears a gold lock and opens the plans on the website instead.
  const fab = h('a', { class: 'mascot-fab' });
  const drawFab = () => {
    const open = canUseAssistant();
    fab.replaceChildren(mascot(46, { locked: !open && Boolean(member()) }));
    fab.href = open ? '#/chat' : plansUrl();
    if (open) { fab.removeAttribute('target'); fab.removeAttribute('rel'); } else { fab.target = '_blank'; fab.rel = 'noopener'; }
    fab.title = open ? "EvrAI'ya sor" : 'EvrAI Premium planla gelir: planları gör';
    fab.setAttribute('aria-label', fab.title);
  };
  drawFab();
  cleanup.push(onAccount(drawFab));
  root.append(fab);

  function draw() {
    for (const fn of local) { try { fn(); } catch { /* ignore */ } }
    local = [];
    if (room !== 'all' && !rooms().some((a) => a.area_id === room)) room = 'all';
    if (shows('rooms')) drawRooms();
    if (shows('climate')) heroSlot.replaceChildren(hero(room, local, custom.indicators, editing));
    if (shows('devices')) drawDevices();
  }

  const pickRoom = (id) => { room = id; saveSettings({ room: id }); draw(); };
  // A marker on the house model: its room's tiles, with its own tile brought into view.
  function showDevice(d) {
    const target = d.area_id && rooms().some((a) => a.area_id === d.area_id) ? d.area_id : 'all';
    if (room !== target) pickRoom(target);
    const tile = shows('devices') && devicesSlot.querySelector(`.device[data-id="${CSS.escape(d.id)}"]`);
    if (!tile) { location.hash = `#/devices/${encodeURIComponent(d.id)}`; return; }
    tile.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    tile.classList.remove('flash');
    void tile.offsetWidth;
    tile.classList.add('flash');
  }

  function drawRooms() {
    const devs = userDevices();
    const loose = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id));
    // With rooms on more than one floor the model shows one floor, with a floor switch.
    const groups = roomsByFloor(rooms()).filter((g) => g.rooms.length);
    const keyOf = (g) => g.floor.floor_id ?? null;
    let cur = groups.find((g) => keyOf(g) === floorKey) || groups[0];
    // A picked room (also from a device marker) shows its own floor, and that floor stays.
    const roomFloor = room !== 'all' ? groups.find((g) => g.rooms.some((a) => a.area_id === room)) : null;
    if (roomFloor) { cur = roomFloor; floorKey = keyOf(roomFloor); }
    const multi = groups.length > 1;
    const floors = multi ? groups.map((g) => ({ key: keyOf(g), name: g.floor.name, level: g.floor.level ?? 0 })) : [];
    const onFloor = (key) => {
      const from = floors.find((f) => f.key === (cur ? keyOf(cur) : null));
      const to = floors.find((f) => f.key === key);
      floorEnter = from && to ? (to.level > from.level ? 'up' : 'down') : null;
      floorKey = key;
      saveSettings({ homeFloor: key });
      const g = groups.find((x) => keyOf(x) === key);
      if (room !== 'all' && !g?.rooms.some((a) => a.area_id === room)) { room = 'all'; saveSettings({ room: 'all' }); }
      draw();
    };
    model.replaceChildren(homeModel({
      rooms: multi ? cur.rooms : rooms(), devices: devs, loose: !multi || cur === groups[0] ? loose : [], selected: room, onPick: pickRoom, onDevice: showDevice,
      floors, floor: cur ? keyOf(cur) : null, onFloor, enter: floorEnter, cleanup: local,
    }));
    floorEnter = null;
    chips.hidden = !editing;
    if (!editing) { chips.replaceChildren(); return; }
    const count = (areaId) => devs.filter((d) => (d.area_id || null) === areaId).length;
    chips.replaceChildren(
      roomChip(null, 'Tüm odalar', devs.length, room === 'all', () => pickRoom('all')),
      ...rooms().map((a) => roomChip(a.area_id, a.name, count(a.area_id), room === a.area_id, () => pickRoom(a.area_id))),
      h('a', { class: 'room-chip add', href: '#/devices?tab=rooms' }, icon('plus', 14), 'Oda'),
    );
    arrangeable(chips, 'rooms', { whole: true, all: ordered(sortedAreas(), getCustom().rooms, (a) => a.area_id).map((a) => a.area_id) });
  }

  // Tiles in the chosen order; hidden ones only show (faded) while editing.
  const visible = (list) => {
    const t = getCustom().tiles;
    const sorted = ordered(list, t);
    return editing ? sorted : sorted.filter((d) => !t.hidden.includes(d.id));
  };

  function drawDevices() {
    const devs = userDevices();
    const roomIds = new Set(rooms().map((a) => a.area_id));
    if (room !== 'all') {
      const list = visible(devs.filter((d) => d.area_id === room));
      devicesSlot.replaceChildren(list.length ? grid(list) : emptyRoom());
      return;
    }
    // Tiles of hidden rooms stay off Home.
    const onHome = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id) || roomIds.has(d.area_id));
    if (!getCustom().groupRooms) {
      const list = visible(onHome);
      devicesSlot.replaceChildren(list.length ? grid(list) : emptyRoom());
      return;
    }
    const groups = rooms().map((a) => ({ title: a.name, id: a.area_id, list: visible(devs.filter((d) => d.area_id === a.area_id)) }))
      .filter((s) => s.list.length);
    const loose = visible(devs.filter((d) => !d.area_id || !store.areas.has(d.area_id)));
    if (loose.length) groups.push({ title: 'Odası olmayanlar', id: null, list: loose });
    devicesSlot.replaceChildren(...(groups.length ? groups.map((s) => h('section', { class: 'room-section' },
      h('div', { class: 'section-row' }, h('h3', { class: 'room-title' }, s.title), h('span', { class: 'muted small' }, `${s.list.length} cihaz`)),
      grid(s.list))) : [emptyRoom()]));
  }

  function grid(list) {
    const t = getCustom().tiles;
    const g = h('div', { class: `grid devices${editing ? ' arranging' : ''}` });
    g.append(...list.map((d) => {
      const el = deviceCardFor(d, local);
      el.dataset.id = d.id;
      el.classList.toggle('tile-wide', t.wide.includes(d.id));
      el.classList.toggle('tile-small', t.small.includes(d.id));
      if (editing) tileTools(el, d, g);
      return el;
    }));
    if (editing) sortable(g, { item: '.device', handle: '.tile-grip', ignore: '.tile-tool', anywhere: true, onEnd: () => saveOrder(g) });
    return g;
  }

  // ---- editing tiles ---------------------------------------------------------------

  // A grid holds only part of the home's tiles; their new order takes their
  // old places in the overall order, so other rooms keep theirs.
  function saveOrder(g) {
    const t = getCustom().tiles;
    const mine = [...g.children].map((el) => el.dataset.id);
    setCustom({ tiles: { ...t, order: mergeOrder(ordered(userDevices(), t).map((d) => d.id), mine) } }, { rerender: false });
  }

  function tileTools(el, device, g) {
    // The tile's own controls sleep while editing.
    for (const kid of el.children) kid.inert = true;
    const name = deviceName(device);
    const tool = (ic, label, onclick) => h('button', { type: 'button', class: 'tile-tool', title: label, 'aria-label': `${label}: ${name}`, onclick }, icon(ic, 16));
    const move = (by) => {
      const sib = by < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!sib) return;
      g.insertBefore(el, by < 0 ? sib : sib.nextSibling);
      saveOrder(g);
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    // Wide, small and hidden are on/off flags in the tiles list.
    const flagTool = (ic, label, cls, field, paint) => {
      const btn = tool(ic, label, () => {
        const on = !el.classList.contains(cls);
        el.classList.toggle(cls, on);
        btn.setAttribute('aria-pressed', String(on));
        paint?.(on);
        setCustom({ tiles: withFlag(getCustom().tiles, field, device.id, on) }, { rerender: false });
      });
      btn.setAttribute('aria-pressed', String(el.classList.contains(cls)));
      return btn;
    };
    const wideBtn = flagTool('widen', 'Geniş kutu', 'tile-wide', 'wide');
    const smallBtn = flagTool('minus', 'Küçük kutu', 'tile-small', 'small');
    const hideBtn = flagTool('eye', 'Ana sayfadan gizle', 'tile-hidden', 'hidden', (hidden) => hideBtn.replaceChildren(icon(hidden ? 'eyeOff' : 'eye', 16)));
    if (getCustom().tiles.hidden.includes(device.id)) { el.classList.add('tile-hidden'); hideBtn.setAttribute('aria-pressed', 'true'); hideBtn.replaceChildren(icon('eyeOff', 16)); }
    el.prepend(h('div', { class: 'tile-tools' },
      h('span', { class: 'tile-grip', title: 'Taşımak için sürükleyin', 'aria-hidden': 'true' }, icon('grip', 18), h('small', null, 'Drag')),
      h('span', { class: 'sep' }),
      tool('left', 'Öne al', () => move(-1)),
      tool('right', 'Arkaya al', () => move(1)),
      wideBtn, smallBtn, hideBtn));
  }

  function emptyRoom() {
    return h('div', { class: 'empty' }, icon('devices', 28),
      h('p', null, store.status.state === 'connected' ? 'Burada henüz cihaz yok.' : 'Uygulama bağlanınca cihazlar görünür.'),
      h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Cihaz ekle'));
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

  // Safety alerts across the whole home. They can't be moved or hidden.
  const drawAlerts = () => {
    const active = [...store.states.values()].filter((s) => s.entity_id.startsWith('binary_sensor.') && s.state === 'on'
      && ['smoke', 'gas', 'moisture'].includes(s.attributes.device_class));
    alerts.replaceChildren(...active.map((s) => {
      const what = { smoke: 'Duman algılandı', gas: 'Gaz algılandı', moisture: 'Su kaçağı algılandı' }[s.attributes.device_class];
      const where = areaName(entityArea(s.entity_id));
      const tip = { smoke: 'Yangın varsa 112\'yi arayın.', gas: 'Ateş yakmayın, elektrik düğmelerine dokunmayın, pencereleri açın ve 187\'yi arayın.', moisture: 'Ana su vananız varsa kapatın.' }[s.attributes.device_class];
      const dev = store.devices.get(store.entities.get(s.entity_id)?.device_id);
      return h('div', { class: 'alert-banner', role: 'alert' }, icon('alert', 22),
        h('div', null, h('strong', null, `${what}${where ? ' · ' + where : ''}`), h('p', null, `${dev ? deviceName(dev) : s.attributes.friendly_name}. ${tip}`)));
    }));
  };
  const alertTick = setInterval(() => { if (!document.hidden) drawAlerts(); }, 2000); // not while the app is in the background
  cleanup.push(() => clearInterval(alertTick));
  drawAlerts();
}

function roomChip(id, name, count, active, onclick) {
  return h('button', {
    class: `room-chip${active ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(active), onclick,
    'data-id': id, 'data-name': name,
  }, name, h('span', { class: 'count' }, String(count)));
}

// ---- room card --------------------------------------------------------------------

function entitiesIn(roomId, test) {
  return [...store.states.values()].filter((s) => {
    if (!test(s)) return false;
    if (store.entities.get(s.entity_id)?.entity_category) return false;
    return roomId === 'all' || entityArea(s.entity_id) === roomId;
  });
}

function hero(roomId, cleanup, ind, editing) {
  const show = (id) => editing || !isHidden(ind, id);
  const inRow = (group) => ordered(INDICATORS.filter((i) => i.group === group), ind).filter((i) => show(i.id)).map((i) => i.id);
  const allIds = ordered(INDICATORS, ind).map((i) => i.id);
  const named = (el, id) => { el.dataset.id = id; el.dataset.name = INDICATORS.find((i) => i.id === id).label; return el; };
  const c = HOME.climate;
  const isTemp = (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature';
  const isHum = (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'humidity';
  const temps = entitiesIn(roomId, isTemp);
  const tempId = roomId === 'all' && store.get(c.temperature) ? c.temperature : (temps.find((s) => s.entity_id === c.temperature) || temps[0])?.entity_id;
  const humId = tempId === c.temperature ? c.humidity : entitiesIn(roomId, isHum)[0]?.entity_id;
  const useComfort = tempId === c.temperature;
  const label = roomId === 'all' ? (tempId ? areaName(entityArea(tempId)) || 'Ev' : 'Ev') : areaName(roomId);

  const temp = h('span', { class: 'hero-num' }, '–');
  const badge = named(h('span', { class: 'badge' }, '–'), 'badge');
  const humidity = h('strong', null, '–');
  const outside = h('strong', null, '–');
  const power = h('strong', null, '–');
  // Text lives in a first text node, so edit handles added after it survive updates.
  const range = named(h('span', { class: 'hero-range' }, ''), 'range');
  const stats = {
    humidity: named(h('span', { class: 'stat' }, icon('droplet', 16), humidity, h('small', null, 'nem')), 'humidity'),
    outside: named(h('span', { class: 'stat' }, icon('cloud', 16), outside, h('small', null, 'dışarıda')), 'outside'),
    power: named(h('span', { class: 'stat' }, icon('bolt', 16), power, h('small', null, 'kullanımda')), 'power'),
  };
  // The badge and the range line each sit alone in a small holder, so they
  // get the same eye as everything else while editing.
  const badgeBox = h('span', { class: 'hero-badge-box' }, show('badge') ? badge : null);
  const rangeBox = h('div', { class: 'hero-range-box' }, show('range') ? range : null);
  const statRow = inRow('stat');
  const statsEl = statRow.length ? h('div', { class: 'hero-stats' }, statRow.map((id) => stats[id])) : null;
  const el = h('section', { class: 'hero tone-muted' },
    h('div', { class: 'hero-top' }, h('span', { class: 'hero-label' }, icon('thermometer', 16), label ? `İçeride · ${label}` : 'İçeride'), badgeBox),
    h('div', { class: 'hero-temp' }, temp, h('span', { class: 'hero-deg' }, '°')),
    rangeBox,
    statsEl);
  for (const box of [badgeBox, rangeBox, statsEl]) if (box) arrangeable(box, 'indicators', { whole: true, all: allIds });

  // Outside: the place chosen in Settings (js/weather.js), else the hub's weather entity.
  const drawOutside = () => {
    const o = outsideNow();
    outside.textContent = o?.temperature != null ? `${Math.round(o.temperature)}°` : '–';
    const old = stats.outside.querySelector('svg.icon');
    if (o && old && old.dataset.name !== o.icon) { const n = icon(o.icon, 16); n.dataset.name = o.icon; old.replaceWith(n); }
    stats.outside.title = o ? [o.text, o.apparent != null ? `hissedilen ${Math.round(o.apparent)}°` : '', o.place].filter(Boolean).join(' · ') : '';
  };
  cleanup.push(onWeather(drawOutside));
  const ids = [tempId, humId, c.comfortTempMin, c.comfortTempMax, c.comfortHumMin, HOME.weather].filter(Boolean);
  cleanup.push(store.watch(ids, () => {
    const t = tempId ? store.get(tempId) : null, hu = humId ? store.get(humId) : null, w = store.get(HOME.weather);
    const lo = useComfort ? numVal(store.get(c.comfortTempMin)) ?? 19 : 19;
    const hi = useComfort ? numVal(store.get(c.comfortTempMax)) ?? 27 : 25;
    const tv = numVal(t), hv = numVal(hu);
    temp.textContent = tempId ? (isAvailable(t) ? num(t) : '–') : '–';
    humidity.textContent = hu && isAvailable(hu) ? `${num(hu, 0)}%` : '–';
    if (w !== undefined) drawOutside();
    range.firstChild.textContent = tempId ? `${lo}° ile ${hi}° arası rahat` : 'Bu odanın iklimini görmek için bir sıcaklık sensörü ekleyin';
    let tone = 'muted', text = tempId ? 'Ölçüm yok' : 'Sensör yok';
    if (tv != null) {
      if (tv < lo) { tone = 'cool'; text = 'Serin'; } else if (tv > hi) { tone = 'warm'; text = 'Sıcak'; } else { tone = 'ok'; text = 'Rahat'; }
      if (hv != null && hv < (useComfort ? numVal(store.get(c.comfortHumMin)) ?? 40 : 35)) text += ' · kuru hava';
    }
    badge.firstChild.textContent = text;
    el.className = `hero tone-${tone}`;
  }));

  const openChip = named(chip('window', '–'), 'window');
  const presenceChip = named(chip('person', '–'), 'presence');
  const lightsChip = named(chip('bulb', '–'), 'lights');
  // Chips keep their edit classes when their colour changes.
  const tone = (el, cls) => { el.classList.remove('ok', 'warn', 'accent', 'live'); if (cls) el.classList.add(...cls.split(' ')); };
  const drawChips = () => {
    if (show('power')) {
      const watts = entitiesIn(roomId, (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'power' && s.attributes.unit_of_measurement === 'W')
        .map(numVal).filter((v) => v != null);
      power.textContent = watts.length ? `${Math.round(watts.reduce((a, b) => a + b, 0))} W` : '–';
    }
    const lights = entitiesIn(roomId, (s) => s.entity_id.startsWith('light.'));
    const lit = lights.filter(isOn).length;
    lightsChip.hidden = !lights.length;
    tone(lightsChip, lit ? 'accent' : '');
    lightsChip.setText(lit ? `${lit} ışık açık` : 'Işıklar kapalı');
    const contacts = entitiesIn(roomId, (s) => s.entity_id.startsWith('binary_sensor.') && ['opening', 'door', 'window', 'garage_door'].includes(s.attributes.device_class));
    const open = contacts.filter((s) => s.state === 'on');
    if (!contacts.length) { openChip.hidden = true; } else {
      openChip.hidden = false;
      if (open.length === 1) { tone(openChip, 'warn'); openChip.setText(`${open[0].attributes.friendly_name} açık`); }
      else if (open.length > 1) { tone(openChip, 'warn'); openChip.setText(`${open.length} açık`); }
      else { tone(openChip, 'ok'); openChip.setText(contacts.length === 1 ? `${contacts[0].attributes.friendly_name} kapalı` : 'Hepsi kapalı'); }
    }
    const occ = entitiesIn(roomId, (s) => s.entity_id.startsWith('binary_sensor.') && ['occupancy', 'presence', 'motion'].includes(s.attributes.device_class)
      && !store.entities.get(s.entity_id)?.hidden_by);
    if (!occ.length) { presenceChip.hidden = true; } else {
      presenceChip.hidden = false;
      const here = occ.filter((s) => s.state === 'on');
      if (here.length) { tone(presenceChip, 'accent live'); presenceChip.setText('Evde biri var'); }
      else {
        const last = occ.map((s) => s.last_changed).sort().pop();
        tone(presenceChip, ''); presenceChip.setText(`Boş · son görülme ${relTime(last)}`);
      }
    }
  };
  const tick = setInterval(() => { if (!document.hidden) drawChips(); }, 3000);
  cleanup.push(() => clearInterval(tick));
  drawChips();
  const chipEls = { window: openChip, presence: presenceChip, lights: lightsChip };
  const chipRow = inRow('chip');
  if (chipRow.length) {
    const row = h('div', { class: 'hero-chips' }, chipRow.map((id) => chipEls[id]));
    el.append(row);
    arrangeable(row, 'indicators', { whole: true, all: allIds });
  }
  return el;
}

// ---- quick actions ---------------------------------------------------------------------

function quickActions(custom, editing) {
  const actions = ordered(HOME.quickActions, custom.quick).filter((a) => editing || !isHidden(custom.quick, a.id));
  if (!actions.length) return null;
  const row = h('div', { class: 'quick-row' }, actions.map((a) => {
    // The person's own colour, icon and name for this button, if they chose any.
    const look = custom.quickLook[a.id] || {};
    const name = look.name || a.name;
    const btn = h('button', { class: `quick-btn q-${a.id}`, type: 'button', style: { '--tone': look.tone || a.tone }, 'data-id': a.id, 'data-name': name },
      h('span', { class: 'quick-icon' }, icon(look.icon || a.icon, 20)),
      h('span', { class: 'quick-text' }, h('strong', null, name), h('small', null, a.hint)));
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('busy')) return;
      btn.classList.add('busy');
      try { await runQuickAction(a); toast(`${name} tamam`); } catch { /* toast shown */ }
      btn.classList.remove('busy');
    });
    return btn;
  }));
  arrangeable(row, 'quick', { whole: true, all: ordered(HOME.quickActions, custom.quick).map((a) => a.id) });
  return h('section', { class: 'quick' }, h('h2', { class: 'section-title' }, 'Hızlı işlemler'), row);
}
