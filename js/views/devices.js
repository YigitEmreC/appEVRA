import { CATEGORIES, PRODUCTS, productById, productForDevice, PAIRING_LABEL } from '../catalog.js';
import { store, userDevices, sortedAreas, deviceName, areaName, deviceEntities } from '../store.js';
import { h, num, numVal, isAvailable, toast, sleep, fold } from '../util.js';
import { icon } from '../icons.js';
import { mascot } from '../mascot.js';
import { card } from '../components.js';
import { deviceCardFor, kindIcon } from '../devices/cards.js';
import { roomBadges, roomEntities, roomIcon, roomDevices } from '../rooms.js';

export function renderDevices(root, cleanup, ctx) {
  const [first, second] = ctx.params;
  if (first === 'add' && second) return renderProduct(root, cleanup, productById(second));
  if (first === 'add') return renderCatalog(root, cleanup);
  if (first === 'room' && second) return renderRoom(root, cleanup, decodeURIComponent(second));
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
  if (main.length && main.every((s) => s.state === 'unavailable')) return { text: 'Çevrimdışı', cls: 'bad' };
  const batt = states.find((s) => s.attributes.device_class === 'battery');
  const v = numVal(batt);
  if (v != null && v < 20) return { text: `Pil %${num(batt, 0)}`, cls: 'warn' };
  return null;
}

function roomSelect(current, onChange) {
  const sel = h('select', { class: 'select', 'aria-label': 'Oda' },
    h('option', { value: '' }, 'Odasız'),
    sortedAreas().map((a) => h('option', { value: a.area_id, selected: a.area_id === current }, a.name)),
    h('option', { value: '__new__' }, 'Yeni oda…'));
  sel.addEventListener('change', async () => {
    if (sel.value === '__new__') {
      const name = prompt('Yeni odanın adı');
      if (!name || !name.trim()) { sel.value = current || ''; return; }
      try {
        const area = await store.backend.createArea(name.trim());
        await waitFor(() => store.areas.has(area.area_id));
        sel.replaceChildren(h('option', { value: '' }, 'Odasız'), ...sortedAreas().map((a) => h('option', { value: a.area_id }, a.name)), h('option', { value: '__new__' }, 'Yeni oda…'));
        sel.value = area.area_id;
        onChange(area.area_id);
      } catch (e) { toast(`Oda oluşturulamadı: ${e.message}`, 'error'); sel.value = current || ''; }
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

// "Akıllı Priz", plus maker and model number in developer mode. Devices
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
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Cihaz ara', 'aria-label': 'Cihaz ara' });
  search.addEventListener('input', () => { query = fold(search.value.trim()); draw(); });

  const drawTabs = () => tabs.replaceChildren(...[['devices', 'Cihazlar'], ['rooms', 'Odalar']].map(([id, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'active' : '',
    onclick: () => { tab = id; history.replaceState(null, '', id === 'rooms' ? '#/devices?tab=rooms' : '#/devices'); drawTabs(); draw(); },
  }, label)));

  let panelOff = [];
  cleanup.push(() => panelOff.forEach((fn) => fn()));
  function draw() {
    panelOff.splice(0).forEach((fn) => fn());
    search.hidden = tab !== 'devices';
    body.replaceChildren(tab === 'rooms' ? roomsPanel() : devicesPanel());
  }

  function devicesPanel() {
    const devs = userDevices().filter((d) => !query || fold(`${deviceName(d)} ${d.model} ${productForDevice(d)?.name || ''}`).includes(query));
    if (!devs.length) {
      return h('div', { class: 'empty' }, icon('devices', 28), h('p', null, query ? 'Eşleşen cihaz yok.' : 'Henüz cihaz yok.'),
        h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Cihaz ekle'));
    }
    const groups = sortedAreas().map((a) => ({ name: a.name, list: devs.filter((d) => d.area_id === a.area_id) })).filter((g) => g.list.length);
    const loose = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id));
    if (loose.length) groups.push({ name: 'Odası olmayanlar', list: loose });
    return h('div', { class: 'list-groups' }, groups.map((g) => h('section', { class: 'list-group' },
      h('h3', { class: 'group-title' }, g.name, h('span', { class: 'muted' }, ` · ${g.list.length}`)),
      h('div', { class: 'list' }, g.list.map(deviceRow)))));
  }

  // Rooms as squares, each with its sensors' icons and readings, plus a square to add one.
  // Tapping a room opens its page (renderRoom) to rename, delete or fill it.
  function roomsPanel() {
    const devs = userDevices();
    const rooms = sortedAreas();
    const squares = rooms.map((a) => roomSquare(a, devs.filter((d) => d.area_id === a.area_id).length));
    const ids = rooms.flatMap((a) => roomEntities(a.area_id).map((s) => s.entity_id));
    let queued = false;
    // Readings change all the time: repaint the badges, at most once a frame.
    if (ids.length) panelOff.push(store.watch(ids, () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; squares.forEach((q) => q.paint()); });
    }));
    const loose = devs.filter((d) => !d.area_id || !store.areas.has(d.area_id));
    return h('div', { class: 'rooms-panel' },
      h('div', { class: 'room-grid' }, squares, addRoomSquare()),
      loose.length ? h('p', { class: 'muted small' }, `${loose.length} cihaz henüz bir odada değil. Bir odaya taşımak için odayı açın.`) : null);
  }

  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.area_id}:${d.name_by_user}`).join('|') + '#' + [...store.areas.values()].map((a) => a.area_id + a.name).join('|');
    if (next !== sig) { sig = next; draw(); }
  }));
  drawTabs();
  root.append(h('div', { class: 'toolbar' }, tabs, h('a', { class: 'btn primary', href: '#/devices/add' }, icon('plus', 16), 'Cihaz ekle')), search, body);
}

// ---- rooms ---------------------------------------------------------------------------------

const badge = (b, big = false) => h('span', { class: `room-badge${b.tone ? ' ' + b.tone : ''}`, title: `${b.label}: ${b.value}` },
  icon(b.icon, big ? 18 : 14), big ? h('span', { class: 'room-badge-text' }, h('small', null, b.label), h('strong', null, b.value)) : h('span', null, b.value));

function roomSquare(a, count) {
  const badges = h('div', { class: 'room-badges' });
  const paint = () => {
    const list = roomBadges(a.area_id);
    badges.replaceChildren(...(list.length ? list.map((b) => badge(b)) : [h('span', { class: 'muted small' }, count ? 'Sensör yok' : 'Boş oda')]));
  };
  paint();
  const el = h('a', { class: 'room-square', href: `#/devices/room/${encodeURIComponent(a.area_id)}`, 'aria-label': `${a.name}, ${count} cihaz` },
    h('div', { class: 'room-sq-head' },
      h('span', { class: 'room-sq-icon' }, icon(roomIcon(a.name), 22)),
      h('span', { class: 'room-sq-count' }, `${count} cihaz`)),
    h('strong', { class: 'room-sq-name' }, a.name),
    badges);
  el.paint = paint;
  return el;
}

function addRoomSquare() {
  const input = h('input', { class: 'input', placeholder: 'Salon, Mutfak…', 'aria-label': 'Yeni oda adı', maxlength: 40 });
  const add = h('button', { class: 'btn primary small', type: 'submit' }, icon('plus', 14), 'Oda ekle');
  const form = h('form', { class: 'room-square add' },
    h('div', { class: 'room-sq-head' }, h('span', { class: 'room-sq-icon' }, icon('plus', 22))),
    h('strong', { class: 'room-sq-name' }, 'Yeni oda'),
    input, add);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { toast('Önce odanın adını yazın', 'error'); input.focus(); return; }
    if ([...store.areas.values()].some((x) => fold(x.name) === fold(name))) { toast('Bu adda bir oda zaten var', 'error'); return; }
    add.disabled = true;
    try { await store.backend.createArea(name); toast(`${name} eklendi`); } catch (err) { toast(`Oda eklenemedi: ${err.message}`, 'error'); add.disabled = false; }
  });
  return form;
}

// One room: its readings, its devices, and moving other devices in.
function renderRoom(root, cleanup, areaId) {
  const local = [];
  cleanup.push(() => local.forEach((fn) => fn()));
  const draw = () => {
    local.splice(0).forEach((fn) => fn());
    const a = store.areas.get(areaId);
    if (!a) {
      root.replaceChildren(backLink('#/devices?tab=rooms', 'Odalar'),
        h('div', { class: 'empty' }, icon('rooms', 28), h('p', null, store.status.state === 'connected' ? 'Bu oda artık yok.' : 'Yükleniyor…')));
      return;
    }
    const devs = roomDevices(areaId);
    const badges = h('div', { class: 'room-badges big' });
    const paint = () => {
      const list = roomBadges(areaId);
      badges.replaceChildren(...(list.length ? list.map((b) => badge(b, true)) : [h('p', { class: 'muted small' }, 'Bu odada henüz sensör yok. Sıcaklık, hareket ya da kapı/pencere sensörü eklediğinizde burada görünür.')]));
    };
    paint();
    const ids = roomEntities(areaId).map((s) => s.entity_id);
    if (ids.length) local.push(store.watch(ids, paint));

    const rename = h('button', { class: 'btn small ghost', type: 'button' }, icon('edit', 14), 'Adını değiştir');
    rename.addEventListener('click', async () => {
      const name = prompt('Odanın yeni adı', a.name);
      if (!name || !name.trim() || name.trim() === a.name) return;
      if ([...store.areas.values()].some((x) => x.area_id !== areaId && fold(x.name) === fold(name.trim()))) { toast('Bu adda bir oda zaten var', 'error'); return; }
      try { await store.backend.renameArea(areaId, name.trim()); toast('Odanın adı değişti'); } catch (err) { toast(`Adı değiştirilemedi: ${err.message}`, 'error'); }
    });
    const del = h('button', { class: 'btn small danger', type: 'button' }, icon('trash', 14), 'Odayı sil');
    del.addEventListener('click', async () => {
      if (!confirm(`"${a.name}" odası silinsin mi? İçindeki ${devs.length} cihaz bağlı kalır, yalnızca odasız olur.`)) return;
      try { await store.backend.deleteArea(areaId); toast(`${a.name} silindi`); location.hash = '#/devices?tab=rooms'; } catch (err) { toast(`Silinemedi: ${err.message}`, 'error'); }
    });

    // Devices elsewhere (another room or none) that can be moved in.
    const others = userDevices().filter((d) => d.area_id !== areaId);
    const move = h('select', { class: 'select', 'aria-label': 'Bu odaya cihaz taşı' },
      h('option', { value: '' }, 'Bu odaya bir cihaz taşıyın…'),
      others.map((d) => h('option', { value: d.id }, `${deviceName(d)}${d.area_id && store.areas.has(d.area_id) ? ` (${areaName(d.area_id)})` : ''}`)));
    move.addEventListener('change', async () => {
      const d = store.devices.get(move.value);
      if (!d) return;
      try { await store.backend.updateDevice(d.id, { area_id: areaId }); toast(`${deviceName(d)} ${a.name} odasına taşındı`); } catch (err) { toast(`Taşınamadı: ${err.message}`, 'error'); move.value = ''; }
    });

    root.replaceChildren(
      backLink('#/devices?tab=rooms', 'Odalar'),
      h('header', { class: 'detail-head' },
        h('span', { class: 'detail-icon' }, icon(roomIcon(a.name), 26)),
        h('div', null, h('h2', null, a.name), h('p', { class: 'muted' }, `${devs.length} cihaz`)),
        h('div', { class: 'room-head-actions' }, rename, del)),
      card({ title: 'Şu an', iconName: 'radar' }, badges),
      card({ title: 'Bu odadaki cihazlar', iconName: 'devices' },
        devs.length ? h('div', { class: 'list' }, devs.map(deviceRow)) : h('p', { class: 'muted' }, 'Bu odada henüz cihaz yok.'),
        h('div', { class: 'room-move' }, others.length ? move : null,
          h('a', { class: 'btn small ghost', href: '#/devices/add' }, icon('plus', 14), 'Yeni cihaz ekle'))));
  };
  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const a = store.areas.get(areaId);
    const next = `${a?.name}|` + [...store.devices.values()].map((d) => `${d.id}:${d.area_id}:${d.name_by_user}`).join('|');
    if (next !== sig) { sig = next; draw(); }
  }));
}

// ---- device details -----------------------------------------------------------------------

function renderDetail(root, cleanup, deviceId) {
  const local = [];
  cleanup.push(() => local.forEach((fn) => fn()));
  const draw = () => {
    local.splice(0).forEach((fn) => fn());
    const d = store.devices.get(deviceId);
    if (!d) {
      root.replaceChildren(backLink('#/devices', 'Cihazlar'),
        h('div', { class: 'empty' }, icon('devices', 28), h('p', null, store.status.state === 'connected' ? 'Bu cihaz artık yok.' : 'Yükleniyor…')));
      return;
    }
    const p = productForDevice(d);
    const nameInput = h('input', { class: 'input', value: deviceName(d), 'aria-label': 'Cihaz adı' });
    const saveName = h('button', { class: 'btn', type: 'submit' }, 'Kaydet');
    const nameForm = h('form', { class: 'inline-form' }, nameInput, saveName);
    nameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) { toast('Ad boş olamaz', 'error'); return; }
      try { await store.backend.updateDevice(d.id, { name_by_user: name }); toast('Ad kaydedildi'); } catch (err) { toast(`Adı değiştirilemedi: ${err.message}`, 'error'); }
    });
    const room = roomSelect(d.area_id, async (areaId) => {
      try { await store.backend.updateDevice(d.id, { area_id: areaId }); toast(areaId ? `${areaName(areaId)} odasına taşındı` : 'Odasından çıkarıldı'); } catch (err) { toast(`Taşınamadı: ${err.message}`, 'error'); }
    });
    const remove = h('button', { class: 'btn danger', type: 'button' }, icon('trash', 16), 'Cihazı kaldır');
    remove.addEventListener('click', async () => {
      if (!confirm(`${deviceName(d)} ağdan kaldırılsın mı? Yeniden kullanmak için tekrar eşleştirmeniz gerekir.`)) return;
      remove.disabled = true;
      try {
        const r = await store.backend.removeDevice(d.id, d);
        toast(r?.hidden ? `${deviceName(d)} kaldırıldı. Ulaşılamadığı için yeniden kullanmak üzere tekrar eşleştirin.` : `${deviceName(d)} kaldırıldı`);
        location.hash = '#/devices';
      } catch (err) {
        toast(`Kaldırılamadı: ${err.message}`, 'error');
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
      backLink('#/devices', 'Cihazlar'),
      h('header', { class: 'detail-head' },
        h('span', { class: 'detail-icon' }, icon(kindIcon(d), 26)),
        h('div', null, h('h2', null, deviceName(d)), h('p', { class: 'muted' }, productLine(p, d, true)))),
      h('div', { class: 'detail-grid' },
        h('div', { class: 'detail-main' }, deviceCardFor(d, local)),
        h('div', { class: 'detail-side' },
          card({ title: 'Ayarlar', iconName: 'gear' },
            h('label', { class: 'field' }, h('span', null, 'Ad'), nameForm),
            h('label', { class: 'field' }, h('span', null, 'Oda'), room)),
          p ? card({ title: 'Bu ürün hakkında', iconName: p.icon },
            h('p', null, p.summary),
            p.emergency ? h('p', { class: 'alarm-note static' }, icon('alert', 16), p.emergency) : null,
            p.note ? h('p', { class: 'muted small' }, p.note) : null,
            p.troubleshooting?.length ? h('a', { class: 'link', href: `#/devices/add/${p.id}` }, 'Sorunlar ve çözümleri', icon('right', 14)) : null,
            h('p', { class: 'muted small' }, p.protocol, h('span', { class: 'dev-only' }, ` · ${PAIRING_LABEL[p.pairing]}${d.sw_version ? ' · yazılım ' + d.sw_version : ''}`))) : null,
          card({ title: 'Varlıklar', iconName: 'devices', className: 'dev-only' }, entityRows),
          card({ title: 'Kaldır', iconName: 'trash', className: 'danger-zone' },
            h('p', { class: 'muted small' }, 'Cihazın merkezle bağlantısını keser ve uygulamadan siler.'), remove))),
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
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Evra ürünlerinde ara', 'aria-label': 'Ürün ara' });
  const body = h('div', { class: 'catalog' });
  const draw = () => {
    const matches = PRODUCTS.filter((p) => !query || fold(`${p.name} ${p.nameEn || ''} ${p.model} ${p.protocol}`).includes(query));
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
    if (!body.children.length) body.append(h('p', { class: 'muted pad' }, 'Eşleşen ürün yok.'));
  };
  search.addEventListener('input', () => { query = fold(search.value.trim()); draw(); });
  draw();
  root.append(backLink('#/devices', 'Cihazlar'), h('p', { class: 'muted intro' }, `Eklediğiniz ürünü seçin. Evra kataloğunda ${PRODUCTS.length} ürün var.`), search, body);
}

// ---- add a device: one product ---------------------------------------------------------------

// What the catalogue says about a product: introduction, features, how it works with Evra,
// what Evra might say, and requests to try (a tap asks Evra).
function productAbout(p) {
  const ask = (q) => `#/chat?ask=${encodeURIComponent(q)}`;
  return card({ title: 'Ürün tanıtımı', iconName: p.icon },
    h('p', null, p.summary),
    p.features?.length ? h('ul', { class: 'feature-list' }, p.features.map((f) => h('li', null, icon('check', 14), f))) : null,
    p.emergency ? h('p', { class: 'alarm-note static' }, icon('alert', 16), p.emergency) : null,
    p.howItWorks ? h('div', { class: 'product-works' }, h('h4', null, 'Çalışma şekli'), h('p', null, p.howItWorks)) : null,
    p.evraSays ? h('p', { class: 'evra-says' }, h('span', { class: 'evra-says-who' }, mascot(18), 'EvrAI'), p.evraSays) : null,
    p.examples?.length ? h('div', { class: 'product-asks' }, h('h4', null, 'Evra\'ya sorun'),
      h('div', { class: 'chips' }, p.examples.map((q) => h('a', { class: 'room-chip small', href: ask(q) }, q)))) : null);
}

// The catalogue's problems and solutions, each opening on tap.
function productTrouble(p) {
  if (!p.troubleshooting?.length) return null;
  return card({ title: 'Sorunlar ve çözümleri', iconName: 'alert' },
    h('div', { class: 'trouble-list' }, p.troubleshooting.map((t) => h('details', { class: 'trouble' },
      h('summary', null, t.problem), h('p', null, t.solution)))),
    h('p', { class: 'muted small' }, 'Çözemezseniz Evra destek ekibine WhatsApp\'tan yazın; birçok ayarı uzaktan yapabiliyoruz.'));
}

function renderProduct(root, cleanup, p) {
  if (!p) {
    root.append(backLink('#/devices/add', 'Tüm ürünler'), h('div', { class: 'empty' }, h('p', null, 'Bilinmeyen ürün.')));
    return;
  }
  const panel = h('div', { class: 'pair-panel' });
  let alive = true;
  let stopJoin = null;
  cleanup.push(() => { alive = false; if (stopJoin) stopJoin(); });

  root.append(
    backLink('#/devices/add', 'Tüm ürünler'),
    h('header', { class: 'detail-head' },
      h('span', { class: 'detail-icon' }, icon(p.icon, 26)),
      h('div', null, h('h2', null, p.name), h('p', { class: 'muted' }, `${p.model} · ${p.protocol}`))),
    h('div', { class: 'detail-grid' },
      h('div', { class: 'detail-main' },
        card({ title: 'Bağlayın', iconName: 'link' }, panel)),
      h('div', { class: 'detail-side' },
        productAbout(p),
        p.setup?.length ? card({ title: 'Kurulum (Evra teknisyeni)', iconName: 'check' }, h('ol', { class: 'steps' }, p.setup.map((s) => h('li', null, s)))) : null,
        productTrouble(p))),
  );

  // A device of this product that was removed while it couldn't be reached is only
  // hidden (live.js removeDevice). Pairing the product again brings it back, and it
  // counts as the new device.
  const hidden = [...store.devices.values()].filter((d) => d.disabled_by === 'user' && productForDevice(d)?.id === p.id).map((d) => d.id);
  const before = new Set([...store.devices.keys()].filter((id) => !hidden.includes(id)));
  const newDeviceId = () => [...store.devices.keys()].find((id) => !before.has(id) && !store.devices.get(id)?.disabled_by);
  const bringBack = () => hidden.forEach((id) => store.backend.updateDevice(id, { disabled_by: null }).catch(() => {}));

  // Empty parts (no hint, no title) are skipped; replaceChildren would print them as "null".
  function show(...kids) { if (alive) panel.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

  // Final step: name it and pick a room.
  function finish(deviceId) {
    const d = store.devices.get(deviceId);
    const nameInput = h('input', { class: 'input', value: d ? deviceName(d) : p.name, 'aria-label': 'Ad' });
    let areaId = null;
    const room = roomSelect(null, (id) => { areaId = id; });
    const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 16), 'Kaydet');
    const form = h('form', { class: 'stack' },
      h('p', { class: 'success-line' }, icon('check', 18), `${p.name} bağlandı.`),
      h('label', { class: 'field' }, h('span', null, 'Ad'), nameInput),
      h('label', { class: 'field' }, h('span', null, 'Oda'), room),
      save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await store.backend.updateDevice(deviceId, { name_by_user: nameInput.value.trim() || null, area_id: areaId });
        toast(`${nameInput.value.trim() || p.name} eklendi`);
        location.hash = `#/devices/${encodeURIComponent(deviceId)}`;
      } catch (err) { toast(`Kaydedilemedi: ${err.message}`, 'error'); save.disabled = false; }
    });
    show(form);
  }

  async function awaitDevice(message, timeout = 25000) {
    show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), message));
    const ok = await waitFor(() => !!newDeviceId(), timeout);
    if (!alive) return;
    if (ok) finish(newDeviceId());
    else show(h('p', null, 'Merkez kabul etti ama yeni cihaz henüz görünmedi. Bir dakika sürebilir; cihaz listesinde görünecek.'),
      h('a', { class: 'btn', href: '#/devices' }, 'Cihazlara dön'));
  }

  const notConnected = () => {
    if (store.status.state === 'connected') return false;
    toast('Önce merkeze bağlanın (Ayarlar)', 'error');
    return true;
  };

  // ---- each pairing method ----
  if (p.pairing === 'none') {
    show(h('p', null, p.note || 'Bu ürünün eşleştirilmesi gerekmez.'), h('a', { class: 'btn', href: '#/devices/add' }, 'Ürünlere dön'));
    return;
  }

  if (p.pairing === 'zigbee') {
    const start = h('button', { class: 'btn primary', type: 'button' }, icon('link', 16), 'Eşleştirmeyi başlat');
    show(h('p', null, 'Eşleştirme, merkezi yaklaşık 4 dakika yeni Zigbee cihazlarına açar.'),
      p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null, start);
    start.addEventListener('click', async () => {
      if (notConnected()) return;
      try { await store.backend.permitJoin(254, p); } catch (err) { toast(`Eşleştirme başlatılamadı: ${err.message}`, 'error'); return; }
      bringBack();
      stopJoin = () => store.backend.stopJoin();
      const ends = Date.now() + 254000;
      const count = h('strong', null, '4:14');
      const stop = h('button', { class: 'btn ghost', type: 'button' }, 'Durdur');
      stop.addEventListener('click', () => { stopJoin?.(); stopJoin = null; alive && renderAgain(); });
      show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Cihaz bekleniyor… ', count),
        p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null,
        h('p', { class: 'muted small' }, 'Eşleşirken cihazı merkeze yakın tutun. Pilli cihazlarda uyanık kalması için birkaç saniyede bir düğmeye basın.'),
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
        show(h('p', null, 'Bağlanan olmadı. Cihazın eşleştirme modunda ve merkeze yakın olduğunu kontrol edip tekrar deneyin.'), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Tekrar dene'));
      }
    });
    return;
  }

  if (p.pairing === 'matter') {
    const code = h('input', { class: 'input', inputmode: 'numeric', placeholder: '1234-567-8901', 'aria-label': 'Matter kodu' });
    const go = h('button', { class: 'btn primary', type: 'submit' }, icon('link', 16), 'Bağlan');
    const form = h('form', { class: 'stack' }, p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null,
      h('label', { class: 'field' }, h('span', null, 'Matter eşleştirme kodu'), code), go);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (notConnected()) return;
      if (!code.value.trim()) { toast('Önce Matter kodunu girin', 'error'); return; }
      go.disabled = true;
      show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Bağlanıyor… bu bir dakika sürebilir.'));
      try { await store.backend.matterCommission(code.value.trim(), p); bringBack(); await awaitDevice('Bağlandı. Görünmesi bekleniyor…'); }
      catch (err) { show(h('p', { class: 'error-line' }, `Bağlanılamadı: ${err.message}`), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Tekrar dene')); }
    });
    show(form);
    return;
  }

  if (p.pairing === 'cloud') {
    const kids = [h('p', null, p.note || 'Bu ürün üreticisinin bulutu üzerinden bağlanır.'),
      h('p', { class: 'muted small' }, 'Üreticinin hesabını (Xiaomi, Petkit, Tuya / Smart Life) merkeze bir kez bağlayın; cihazları buraya kendiliğinden gelir.')];
    if (store.backend?.mode === 'demo') {
      const add = h('button', { class: 'btn primary', type: 'button' }, icon('plus', 16), 'Ekle (örnek ev)');
      add.addEventListener('click', async () => { add.disabled = true; const id = await store.backend.cloudAdd(p); finish(id); });
      kids.push(add);
    } else if (store.backend?.integrationUrl) {
      kids.push(h('a', { class: 'btn primary', href: store.backend.integrationUrl(p.integration), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Hesabı merkeze bağla'));
    }
    show(...kids);
    return;
  }

  // 'flow': a Home Assistant setup form. Its texts (titles, explanations, field
  // names, help, errors) are the integration's own, from Home Assistant.
  const domain = p.integration;
  let tr = {};
  const T = (key, fallback, ph) => fillIn(tr[`component.${domain}.config.${key}`] ?? fallback, ph);
  const start = h('button', { class: 'btn primary', type: 'button' }, icon('link', 16), 'Kurulumu başlat');
  show(p.pairHint ? h('p', { class: 'hint' }, icon('sparkle', 16), p.pairHint) : null, start);
  start.addEventListener('click', async () => {
    if (notConnected()) return;
    start.disabled = true;
    show(h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), 'Aranıyor…'));
    tr = await flowTexts(domain);
    if (!(await offerFound())) begin();
  });

  async function begin() {
    bringBack();
    try { renderStep(await store.backend.flowStart(domain, p)); }
    catch (err) { show(h('p', { class: 'error-line' }, `Kurulum başlatılamadı: ${err.message}`), fallbackLink()); }
  }

  // Home Assistant finds many Wi-Fi devices by itself (Tapo, Shelly, ESPHome) and
  // keeps a setup waiting for each. Offer those first; setting the same device up
  // again by address would stop with "already in progress".
  async function offerFound(note) {
    let found = [];
    try { found = (await store.backend.flowProgress?.(domain)) || []; } catch { /* older Home Assistant: just ask for the address */ }
    if (!alive) return true;
    if (!found.length) return false;
    const nameOf = (f) => { const tp = f.context?.title_placeholders || {}; return tp.name || Object.values(tp)[0] || p.name; };
    show(
      note ? h('p', { class: 'hint' }, icon('sparkle', 16), note) : null,
      h('p', null, found.length === 1 ? 'Home Assistant ağınızda bunu buldu:' : 'Home Assistant ağınızda bunları buldu:'),
      h('div', { class: 'found-list' }, found.map((f) => h('div', { class: 'found-row' },
        icon(p.icon, 18), h('span', { class: 'found-name' }, nameOf(f)),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => openFlow(f.flow_id) }, 'Kur')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: begin }, 'Başka birini adresiyle kur'));
    return true;
  }

  async function openFlow(flowId) {
    try { renderStep(await store.backend.flowGet(flowId)); }
    catch (err) { show(h('p', { class: 'error-line' }, `Bu kurulum açılamadı: ${err.message}`), fallbackLink()); }
  }

  function fallbackLink() {
    return store.backend?.integrationUrl
      ? h('a', { class: 'btn', href: store.backend.integrationUrl(domain), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Merkezde kur')
      : null;
  }

  // The step's title and explanation, when the integration has them.
  function heading(step) {
    const ph = step.description_placeholders || {};
    const title = T(`step.${step.step_id}.title`, null, ph);
    const desc = T(`step.${step.step_id}.description`, null, ph);
    return [title ? h('h3', { class: 'flow-title' }, title) : null, desc ? richText(desc) : null];
  }

  async function renderStep(step) {
    if (!alive || !step) return;
    const ph = step.description_placeholders || {};
    if (step.type === 'create_entry') { awaitDevice(`${step.title || p.name} eklendi. Cihazı bekleniyor…`); return; }
    if (step.type === 'abort') {
      if (step.reason === 'already_in_progress' && await offerFound('Home Assistant bu cihazı zaten kuruyor. Buradan devam edin:')) return;
      const reason = T(`abort.${step.reason}`, ABORTS[step.reason] || `Kurulum durdu: ${String(step.reason).replace(/_/g, ' ')}`, ph);
      show(h('p', { class: 'error-line' }, reason), h('button', { class: 'btn primary', type: 'button', onclick: renderAgain }, 'Baştan başla'));
      return;
    }
    if (step.type === 'menu') {
      const opts = Array.isArray(step.menu_options) ? step.menu_options.map((o) => [o, null]) : Object.entries(step.menu_options || {});
      show(...heading(step), h('div', { class: 'btn-row' }, opts.map(([opt, label]) =>
        h('button', { class: 'btn', type: 'button', onclick: async () => renderStep(await store.backend.flowSubmit(step.flow_id, { next_step_id: opt })) },
          T(`step.${step.step_id}.menu_options.${opt}`, label || pretty(opt), ph)))));
      return;
    }
    // Home Assistant is busy (waiting for the device, downloading, ...): look again shortly.
    if (step.type === 'progress') {
      show(...heading(step), h('p', { class: 'waiting' }, h('span', { class: 'spinner' }), T(`progress.${step.progress_action}`, 'İşlem sürüyor…', ph)));
      await sleep(2000);
      if (alive) openFlow(step.flow_id);
      return;
    }
    if (step.type === 'progress_done' || step.type === 'external_done') { openFlow(step.flow_id); return; }
    // A sign-in on the maker's website, in another tab.
    if (step.type === 'external') {
      show(...heading(step),
        h('p', null, 'Bu adım üreticinin web sitesini açar. Orada giriş yapın, sonra buraya dönün.'),
        h('div', { class: 'btn-row' },
          step.url ? h('a', { class: 'btn primary', href: step.url, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Giriş sayfasını aç') : null,
          h('button', { class: 'btn', type: 'button', onclick: () => openFlow(step.flow_id) }, 'Giriş yaptım, devam et')));
      return;
    }
    if (step.type !== 'form') {
      show(h('p', null, 'Bu adım merkezin kendi ekranında tamamlanmalı.'), fallbackLink());
      return;
    }

    const sid = step.step_id;
    const errors = step.errors || {};
    const errorText = (code) => T(`error.${code}`, readableError(code), ph);
    const fieldText = (f, section) => {
      const at = section ? `step.${sid}.sections.${section}` : `step.${sid}`;
      return {
        label: T(`${at}.data.${f.name}`, FIELD_LABELS[f.name] || pretty(f.name), ph),
        help: T(`${at}.data_description.${f.name}`, null, ph),
        error: section ? (errors[section]?.[f.name] ?? errors[f.name]) : errors[f.name],
      };
    };
    const fields = (step.data_schema || []).map((f) => {
      if (f.type !== 'expandable') return formField(f, fieldText(f), errorText);
      // A folded group of fields ("Advanced options"); its values go in their own object.
      const kids = (f.schema || []).map((k) => formField(k, fieldText(k, f.name), errorText));
      const box = h('details', { class: 'flow-section', open: !!f.expanded || kids.some((k) => k.hasError) },
        h('summary', null, T(`step.${sid}.sections.${f.name}.name`, pretty(f.name), ph)),
        T(`step.${sid}.sections.${f.name}.description`, null, ph) ? richText(T(`step.${sid}.sections.${f.name}.description`, null, ph)) : null,
        kids.map((k) => k.el));
      return {
        name: f.name,
        el: box,
        value: () => { const o = {}; for (const k of kids) { const v = k.value(); if (v !== undefined) o[k.name] = v; } return o; },
      };
    });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, fields.length ? 'Devam' : 'Kur');
    const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => { store.backend.flowAbort(step.flow_id); renderAgain(); } }, 'İptal');
    const form = h('form', { class: 'stack' },
      ...heading(step),
      errors.base ? h('p', { class: 'error-line' }, errorText(errors.base)) : null,
      fields.map((f) => f.el), h('div', { class: 'btn-row' }, submit, cancel));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      for (const f of fields) { const v = f.value(); if (v !== undefined) data[f.name] = v; }
      submit.disabled = true;
      try { renderStep(await store.backend.flowSubmit(step.flow_id, data)); }
      catch (err) { toast(`Kurulum başarısız: ${err.message}`, 'error'); submit.disabled = false; }
    });
    show(form);
  }

  function renderAgain() {
    root.replaceChildren();
    renderProduct(root, cleanup, p);
  }
}

const FIELD_LABELS = { host: 'IP adresi', port: 'Port', username: 'Kullanıcı adı', password: 'Şifre', name: 'Ad' };
const ABORTS = {
  already_configured: 'Bu cihaz zaten kurulu.',
  already_in_progress: 'Home Assistant bu cihazı zaten kuruyor. Kurulumu Home Assistant\'ta bitirin.',
  no_devices_found: 'Ağda cihaz bulunamadı.',
  cannot_connect: 'Cihaza ulaşılamadı.',
};

const pretty = (s) => { const t = String(s).replace(/_/g, ' '); return t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1); };

// Home Assistant texts have {placeholders} for names and addresses.
const fillIn = (text, ph) => (text == null ? text : String(text).replace(/\{(\w+)\}/g, (m, k) => (ph && ph[k] != null ? String(ph[k]) : m)));

// The integration's texts once per visit (asked for in Turkish; Home Assistant fills gaps with English).
const textCache = new Map();
async function flowTexts(domain) {
  if (textCache.has(domain)) return textCache.get(domain);
  let t = {};
  try { t = (await store.backend.flowTranslations?.(domain)) || {}; } catch { /* fall back to plain field names */ }
  textCache.set(domain, t);
  return t;
}

// Explanations use a little Markdown: paragraphs, [links](https://…), `code`, **bold**.
function richText(text) {
  const box = h('div', { class: 'flow-desc' });
  for (const para of String(text).split(/\n{2,}/)) {
    const p = h('p');
    const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
    let last = 0, m;
    while ((m = re.exec(para))) {
      if (m.index > last) p.append(para.slice(last, m.index));
      if (m[1]) p.append(h('a', { href: m[2], target: '_blank', rel: 'noopener' }, m[1]));
      else if (m[3]) p.append(h('code', null, m[3]));
      else p.append(h('strong', null, m[4]));
      last = re.lastIndex;
    }
    if (last < para.length) p.append(para.slice(last));
    box.append(p);
  }
  return box;
}

function readableError(code) {
  return { cannot_connect: 'Cihaza ulaşılamadı. Adresi kontrol edin.', invalid_auth: 'Kullanıcı adı ya da şifre hatalı.', unknown: 'Bir sorun oluştu.' }[code] || String(code);
}

// Turns one field of a Home Assistant form into an input.
function formField(f, { label, help, error }, errorText) {
  const sel = f.selector ? Object.keys(f.selector)[0] : null;
  const type = sel || f.type || 'string';
  const required = f.required || (f.optional === false);
  const helpEl = help ? h('small', { class: 'muted' }, help) : null;
  const errEl = error ? h('small', { class: 'error-line' }, errorText(error)) : null;
  let input;
  if (type === 'boolean') {
    input = h('input', { type: 'checkbox', checked: !!f.default });
    return {
      name: f.name,
      hasError: !!error,
      el: h('div', { class: 'field' }, h('label', { class: 'check-field' }, input, h('span', null, label)), helpEl, errEl),
      value: () => input.checked,
    };
  }
  if (type === 'select' || f.options) {
    const opts = f.options || f.selector?.select?.options || [];
    const pairs = Array.isArray(opts) ? opts.map((o) => (Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o])) : Object.entries(opts);
    input = h('select', { class: 'select' }, pairs.map(([v, l]) => h('option', { value: v, selected: v === f.default }, l)));
  } else {
    const password = (type === 'text' && f.selector?.text?.type === 'password') || f.name === 'password';
    const numeric = ['integer', 'float', 'number'].includes(type);
    input = h('input', { class: 'input', type: password ? 'password' : numeric ? 'number' : 'text', value: f.default ?? '', required, autocomplete: password ? 'current-password' : 'off' });
  }
  return {
    name: f.name,
    hasError: !!error,
    el: h('label', { class: 'field' }, h('span', null, label, required ? '' : ' (isteğe bağlı)'), input, helpEl, errEl),
    value: () => {
      if (input.value === '' && !required) return undefined;
      if (type === 'integer') return parseInt(input.value, 10);
      if (['float', 'number'].includes(type)) return parseFloat(input.value);
      return input.value;
    },
  };
}
