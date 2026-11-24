import { HOME } from '../config.js';
import { store, ensurePower, setTracker } from '../store.js';
import { h, isOn, isAvailable, clamp, loadSettings, saveSettings, toast } from '../util.js';
import { icon } from '../icons.js';
import { card, toggle, irButton } from '../components.js';
import { irModules, sendCode, buttonCode, remoteType, keyInfo, forgetServices } from '../ir.js';
import { whenConnected } from '../appdata.js';
import {
  remotes, loadRemotes, onRemotes, saveRemote, deleteRemote, builtinAvailable, builtinModule, remoteName,
  missingBuiltins, restoreBuiltins,
} from '../remote-list.js';
import { renderRemoteNew } from './remote-new.js';

// The Remotes screen: every remote of the home (each sending through its own IR module),
// notices when there's no IR module or its firmware can't send database codes yet,
// adding remotes from the IR code database (#/remotes/new) and removing them.
export function renderRemotes(root, cleanup, ctx = {}) {
  if (ctx.params?.[0] === 'new') return renderRemoteNew(root, cleanup);
  const local = [];
  cleanup.push(() => local.splice(0).forEach((fn) => fn()));
  let modules = null;
  let sig = '';
  const draw = () => {
    if (!modules) return;
    local.splice(0).forEach((fn) => fn());
    root.replaceChildren(...screen(modules, local));
  };
  const refresh = async () => {
    forgetServices();
    modules = await irModules();
    draw();
  };
  root.append(h('p', { class: 'muted pad' }, 'Kumandalar yükleniyor…'));
  whenConnected().then(() => Promise.all([loadRemotes(), irModules()])).then(([, m]) => { modules = m; draw(); });
  cleanup.push(onRemotes(() => draw()));
  // A module added, removed or renamed changes what can be sent where.
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.name_by_user}:${d.area_id}`).join('|');
    if (next !== sig) { const first = !sig; sig = next; if (!first && modules) refresh(); }
  }));
}

function notice(iconName, title, text, action) {
  return h('div', { class: 'notice-card' },
    h('span', { class: 'notice-icon' }, icon(iconName, 22)),
    h('div', null, h('strong', null, title), h('p', { class: 'muted small' }, text), action || null));
}

function screen(modules, cleanup) {
  const list = remotes().filter(builtinAvailable);
  const out = [];
  if (!modules.length) {
    out.push(notice('remote', 'IR modülü ekleyin',
      'Kumandalar sinyali bir IR modülünden (Klima ve TV Kumandası) gönderir. Her odaya bir modül koyabilirsiniz; her kumanda kendi modülünü kullanır, böylece sinyal doğru cihaza gider.',
      h('a', { class: 'btn primary small', href: '#/devices/add/ir-remote' }, icon('plus', 14), 'IR modülü ekle')));
  } else if (!modules.some((m) => m.service)) {
    out.push(notice('alert', 'IR modülünün yazılımı güncellenmeli',
      'Kod veritabanından kumanda eklemek için IR modülünde Evra\'nın "her kodu gönder" eylemi (send_raw) olmalı. ESPHome\'da modülün ayarlarına ekleyip yeniden yükleyin (ayrıntılar ir-module-esphome.yaml dosyasında). Mevcut TV ve ısıtıcı kumandaları çalışmaya devam eder.'));
  }
  out.push(h('div', { class: 'toolbar' },
    h('p', { class: 'muted intro' }, 'Her kumanda kendi IR modülünden gönderir. Yeni bir cihaz için kod veritabanından kumanda ekleyin; markasının bütün tuşları gelir.'),
    h('a', { class: 'btn primary', href: '#/remotes/new' }, icon('plus', 16), 'Kumanda ekle')));

  if (list.length) out.push(slider(list, modules, cleanup));
  else {
    const missing = missingBuiltins();
    out.push(h('div', { class: 'empty' }, icon('remote', 28), h('p', null, 'Henüz kumanda yok.'),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn primary', href: '#/remotes/new' }, icon('plus', 16), 'Kumanda ekle'),
        missing.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => restoreBuiltins().catch((e) => toast(`Olmadı: ${e.message}`, 'error')) }, icon('refresh', 16), 'TV ve ısıtıcı kumandalarını geri getir') : null)));
  }
  if (modules.length) out.push(modulesCard(modules, list));
  return out;
}

function modulesCard(modules, list) {
  const uses = (m) => list.filter((r) => (r.kind === 'builtin' ? builtinModule(r) : r.module) === m.id).length;
  return card({ title: 'IR modülleri', iconName: 'remote' },
    h('p', { class: 'muted small' }, 'Her modül yalnızca kendi kumandalarının sinyalini gönderir. Adını ve odasını Cihazlar ekranından değiştirebilirsiniz.'),
    h('div', { class: 'list' }, modules.map((m) => h('a', { class: 'list-row', href: `#/devices/${encodeURIComponent(m.id)}` },
      h('span', { class: 'row-icon' }, icon('remote', 20)),
      h('span', { class: 'row-text' }, h('strong', null, m.name), h('small', null, [m.room || 'Odasız', `${uses(m)} kumanda`].join(' · '))),
      h('span', { class: `pill ${m.service ? 'ok' : 'warn'}` }, m.service ? 'Her kodu gönderir' : 'Yazılım güncellenmeli'),
      icon('right', 16)))));
}

// One remote at a time: swipe sideways, or use the tabs and arrows above.
function slider(list, modules, cleanup) {
  const items = list.map((r) => ({
    id: r.id,
    name: remoteName(r),
    iconName: r.kind === 'builtin' ? (r.builtin === 'tv' ? 'tv' : 'heater') : remoteType(r.type).icon,
    el: h('div', { class: 'remote-stack' },
      r.kind === 'builtin' ? (r.builtin === 'tv' ? tvRemote(cleanup) : heaterRemote(cleanup)) : codeRemote(r, modules),
      manage(r, modules)),
  }));
  const last = items.length - 1;
  let index = Math.max(0, items.findIndex((r) => r.id === loadSettings().remote));

  const slides = items.map((r) => h('div', { class: 'remote-slide', id: `remote-${r.id}`, role: 'tabpanel', 'aria-label': `${r.name} kumandası` }, r.el));
  const track = h('div', { class: 'remote-track' }, slides);
  const tabs = items.map((r, i) => h('button', {
    type: 'button', role: 'tab', 'aria-controls': `remote-${r.id}`, onclick: () => go(i),
  }, icon(r.iconName, 16), r.name));
  const tabBar = h('div', { class: 'segmented remote-tabs', role: 'tablist', 'aria-label': 'Kumandalar' }, tabs);
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Önceki kumanda', title: 'Önceki kumanda', onclick: () => go(index - 1) }, icon('left', 20));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sonraki kumanda', title: 'Sonraki kumanda', onclick: () => go(index + 1) }, icon('right', 20));
  tabBar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    go(index + (e.key === 'ArrowRight' ? 1 : -1));
    tabs[index].focus();
  });

  // The track takes the height of the remote on show, so a short remote doesn't
  // leave a tall one's height of empty space below it.
  const fitHeight = () => { if (slides[index]) track.style.height = `${slides[index].offsetHeight}px`; };

  function mark(i) {
    index = i;
    tabs.forEach((t, k) => {
      t.classList.toggle('active', k === i);
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    // Keys on the remote that's off screen can't be reached with Tab.
    slides.forEach((s, k) => { s.inert = k !== i; });
    prev.disabled = i === 0;
    next.disabled = i === last;
    fitHeight();
    saveSettings({ remote: items[i].id });
  }

  function go(i, smooth = true) {
    i = clamp(i, 0, last);
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    mark(i);
  }

  // Swiping: when the scroll settles on another remote, select it.
  let settle;
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = clamp(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)), 0, last);
      if (i !== index) mark(i);
    }, 90);
  }, { passive: true });

  // Keep the shown remote lined up when the window changes width.
  let lastWidth = 0;
  const ro = new ResizeObserver(() => {
    fitHeight();
    if (track.clientWidth !== lastWidth) { lastWidth = track.clientWidth; track.scrollLeft = index * track.clientWidth; }
  });
  slides.forEach((s) => ro.observe(s));
  ro.observe(track);
  cleanup.push(() => { ro.disconnect(); clearTimeout(settle); });

  const el = h('div', { class: 'remote-slider' },
    h('div', { class: 'remote-nav' }, items.length > 1 ? prev : null, tabBar, items.length > 1 ? next : null),
    track);
  requestAnimationFrame(() => { mark(index); go(index, false); });
  return el;
}

// Renaming a remote, moving it to another IR module, or removing it.
function manage(r, modules) {
  const box = h('details', { class: 'remote-manage' }, h('summary', null, icon('edit', 14), 'Kumandayı düzenle'));
  const remove = h('button', { class: 'btn small danger', type: 'button' }, icon('trash', 14), 'Kumandayı kaldır');
  remove.addEventListener('click', async () => {
    if (!confirm(`${remoteName(r)} kumandası kaldırılsın mı?${r.kind === 'builtin' ? ' Tuşları IR modülünde kalır; bu ekrandan geri getirebilirsiniz.' : ''}`)) return;
    try { await deleteRemote(r.id); toast(`${remoteName(r)} kaldırıldı`); } catch (e) { toast(`Kaldırılamadı: ${e.message}`, 'error'); }
  });
  if (r.kind === 'builtin') {
    const m = modules.find((x) => x.id === builtinModule(r));
    box.append(h('p', { class: 'muted small' }, `Bu kumandanın tuşları ${m ? m.name : 'IR modülü'} modülüne öğretildi ve oradan gönderilir.`), h('div', { class: 'btn-row' }, remove));
    return box;
  }
  const name = h('input', { class: 'input', value: r.name, maxlength: 30, 'aria-label': 'Kumanda adı' });
  const mod = h('select', { class: 'select', 'aria-label': 'IR modülü' },
    modules.map((m) => h('option', { value: m.id, selected: m.id === r.module }, `${m.name}${m.room ? ` (${m.room})` : ''}${m.service ? '' : ' · yazılım güncellenmeli'}`)),
    modules.some((m) => m.id === r.module) ? null : h('option', { value: r.module || '', selected: true }, 'Bulunamayan modül'));
  const save = h('button', { class: 'btn small primary', type: 'button' }, icon('check', 14), 'Kaydet');
  save.addEventListener('click', async () => {
    const n = name.value.trim();
    if (!n) { toast('Kumandaya bir ad verin', 'error'); return; }
    try { await saveRemote({ ...r, name: n, module: mod.value }); toast('Kumanda kaydedildi'); } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
  });
  box.append(
    h('label', { class: 'field' }, h('span', null, 'Ad'), name),
    h('label', { class: 'field' }, h('span', null, 'Hangi IR modülünden gönderilsin'), mod),
    r.brand ? h('p', { class: 'muted small' }, `Kodlar: ${r.brand}, IR kod veritabanı (${r.set}).`) : null,
    h('div', { class: 'btn-row' }, save, h('span', { class: 'sep' }), remove));
  return box;
}

// A remote from the code database: the usual keys in their usual places, the rest below.
function codeRemote(r, modules) {
  const m = modules.find((x) => x.id === r.module);
  const byKey = new Map(r.buttons.filter((b) => b.k !== 'x').map((b) => [b.k, b]));
  const extras = r.buttons.filter((b) => b.k === 'x');
  const why = !m ? 'Bu kumandanın IR modülü bulunamadı; "Kumandayı düzenle"den başka bir modül seçin.'
    : !m.service ? `${m.name} modülünün yazılımı güncellenmeli; şimdilik bu kumanda gönderemez.` : null;
  const key = (k, cls = 'key', opts = {}) => {
    const b = typeof k === 'string' ? byKey.get(k) : k;
    if (!b) return null;
    const info = keyInfo(b.k);
    const label = b.l || info?.label || b.k;
    const el = h('button', { class: `ir-btn ${cls}`, type: 'button', 'aria-label': label, title: label, disabled: !!why },
      opts.icon !== false && info?.icon ? icon(info.icon, opts.size || 22) : h('span', { class: 'ir-text' }, opts.text || label));
    el.addEventListener('click', async () => {
      el.classList.add('sending');
      try { await sendCode(m, buttonCode(b)); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 800); } catch { /* toast already shown */ }
      setTimeout(() => el.classList.remove('sending'), 250);
    });
    return el;
  };
  const row = (keys, cls) => {
    const kids = keys.map((k) => key(k)).filter(Boolean);
    return kids.length ? h('div', { class: `remote-row ${cls || (kids.length >= 5 ? 'five' : kids.length === 4 ? 'four' : kids.length === 2 ? 'two' : 'three')}` }, kids) : null;
  };
  const has = (...ks) => ks.some((k) => byKey.has(k));
  const digits = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const t = remoteType(r.type);
  return card({ title: remoteName(r), iconName: t.icon, className: 'remote code-remote',
    extra: h('span', { class: 'remote-module' }, icon('remote', 14), m ? m.name : 'Modül yok') },
  why ? h('p', { class: 'hint warn' }, icon('alert', 16), why) : null,
  row(['power', 'input', 'mute', 'netflix', 'youtube'].filter((k) => byKey.has(k))),
  row(['power_on', 'power_off'].filter((k) => byKey.has(k)), 'two'),
  row(['back', 'home', 'menu', 'exit', 'info', 'guide'].filter((k) => byKey.has(k))),
  has('up', 'down', 'left', 'right', 'ok') ? h('div', { class: 'dpad' },
    key('up', 'dp up', { size: 28 }), key('left', 'dp left', { size: 28 }), key('ok', 'dp ok', { text: 'OK' }),
    key('right', 'dp right', { size: 28 }), key('down', 'dp down', { size: 28 })) : null,
  has('vol_up', 'vol_down', 'ch_up', 'ch_down') ? h('div', { class: 'rockers' },
    has('vol_up', 'vol_down') ? h('div', { class: 'rocker' }, key('vol_up', 'rk'), h('span', { class: 'rocker-label' }, 'SES'), key('vol_down', 'rk')) : null,
    has('ch_up', 'ch_down') ? h('div', { class: 'rocker' }, key('ch_up', 'rk'), h('span', { class: 'rocker-label' }, 'KNL'), key('ch_down', 'rk')) : null) : null,
  has('temp_up', 'temp_down') ? h('div', { class: 'temp-keys' },
    key('temp_down', 'key big cool', { size: 30 }), h('span', { class: 'temp-keys-label' }, 'Sıcaklık'), key('temp_up', 'key big warm', { size: 30 })) : null,
  row(['mode', 'fan_speed', 'swing', 'timer', 'sleep'].filter((k) => byKey.has(k))),
  row(['rewind', 'play', 'pause', 'stop', 'forward'].filter((k) => byKey.has(k)), 'five'),
  row(['prev', 'record', 'next'].filter((k) => byKey.has(k))),
  has('red', 'green', 'yellow', 'blue') ? h('div', { class: 'remote-row four colour-keys' },
    ['red', 'green', 'yellow', 'blue'].map((c) => key(c, `key colour ${c}`, { icon: false, text: ' ' }))) : null,
  digits.some((d) => byKey.has(d)) ? h('div', { class: 'numpad' },
    digits.map((d) => key(d, 'key digit', { icon: false })), key('d0', 'key digit zero', { icon: false })) : null,
  extras.length ? h('details', { class: 'remote-extras' },
    h('summary', null, `Diğer tuşlar (${extras.length})`),
    h('div', { class: 'extra-keys' }, extras.map((b) => key(b, 'key small-text', { icon: false })))) : null);
}

function powerHeader(device, cleanup) {
  const cfg = HOME[device];
  const sw = toggle(`${cfg.name} aç ya da kapat`, (on) => ensurePower(device, on));
  const label = h('span', { class: 'remote-state' }, '–');
  const fix = h('button', { class: 'link small', type: 'button' }, 'Düzelt');
  fix.addEventListener('click', () => setTracker(device, store.get(cfg.tracker)?.state !== 'on'));
  cleanup.push(store.watch(cfg.tracker, (t) => {
    sw.set(isOn(t), !isAvailable(t));
    label.textContent = !isAvailable(t) ? 'Bilinmiyor' : isOn(t) ? 'Açık' : 'Kapalı';
    fix.title = isOn(t) ? 'Bir şey göndermeden kapalı olarak işaretle' : 'Bir şey göndermeden açık olarak işaretle';
  }));
  return h('div', { class: 'remote-head' }, label, fix, sw);
}

function tvRemote(cleanup) {
  const b = HOME.tv.buttons;
  const ir = (id, opts) => irButton(id, opts, cleanup);
  return card({ title: 'TV kumandası', iconName: 'tv', extra: powerHeader('tv', cleanup), className: 'remote tv-remote' },
    h('div', { class: 'remote-row three' },
      ir(b.power, { label: 'Güç', iconName: 'power', className: 'key danger' }),
      ir(b.input, { label: 'Kaynak', iconName: 'input', className: 'key' }),
      ir(b.netflix, { label: 'Netflix', iconName: 'netflix', className: 'key netflix' })),
    h('div', { class: 'remote-row three' },
      ir(b.hdmi1, { label: 'HDMI 1', text: 'HDMI 1', className: 'key small-text' }),
      ir(b.hdmi2, { label: 'HDMI 2', text: 'HDMI 2', className: 'key small-text' }),
      ir(b.hdmi3, { label: 'HDMI 3', text: 'HDMI 3', className: 'key small-text' })),
    h('div', { class: 'remote-row two' },
      ir(b.back, { label: 'Geri', iconName: 'back', className: 'key' }),
      ir(b.home, { label: 'Ana menü', iconName: 'home', className: 'key' })),
    h('div', { class: 'dpad' },
      ir(b.up, { label: 'Yukarı', iconName: 'up', className: 'dp up', size: 28 }),
      ir(b.left, { label: 'Sol', iconName: 'left', className: 'dp left', size: 28 }),
      ir(b.ok, { label: 'OK', text: 'OK', className: 'dp ok' }),
      ir(b.right, { label: 'Sağ', iconName: 'right', className: 'dp right', size: 28 }),
      ir(b.down, { label: 'Aşağı', iconName: 'down', className: 'dp down', size: 28 })),
    h('div', { class: 'remote-row two' },
      ir(b.settings, { label: 'Ayarlar', iconName: 'gear', className: 'key' }),
      ir(b.exit, { label: 'Çıkış', iconName: 'close', className: 'key' })),
    h('div', { class: 'rockers' },
      h('div', { class: 'rocker' },
        ir(b.volumeUp, { label: 'Sesi aç', iconName: 'plus', className: 'rk' }),
        h('span', { class: 'rocker-label' }, 'SES'),
        ir(b.volumeDown, { label: 'Sesi kıs', iconName: 'minus', className: 'rk' })),
      ir(b.mute, { label: 'Mute', iconName: 'mute', className: 'key mute' }),
      h('div', { class: 'rocker' },
        ir(b.channelUp, { label: 'Sonraki kanal', iconName: 'up', className: 'rk' }),
        h('span', { class: 'rocker-label' }, 'KNL'),
        ir(b.channelDown, { label: 'Önceki kanal', iconName: 'down', className: 'rk' }))),
    h('div', { class: 'remote-row five' },
      ir(b.rewind, { label: 'Geri sar', iconName: 'rewind', className: 'key' }),
      ir(b.play, { label: 'Oynat', iconName: 'play', className: 'key' }),
      ir(b.pause, { label: 'Duraklat', iconName: 'pause', className: 'key' }),
      ir(b.stop, { label: 'Durdur', iconName: 'stop', className: 'key' }),
      ir(b.forward, { label: 'İleri sar', iconName: 'forward', className: 'key' })),
    h('div', { class: 'numpad' },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ir(b.digits[n], { label: String(n), text: String(n), className: 'key digit' })),
      ir(b.digits[0], { label: '0', text: '0', className: 'key digit zero' })));
}

function heaterRemote(cleanup) {
  const b = HOME.heater.buttons;
  const ir = (id, opts) => irButton(id, opts, cleanup);
  return card({ title: 'Isıtıcı kumandası', iconName: 'heater', extra: powerHeader('heater', cleanup), className: 'remote heater-remote' },
    h('div', { class: 'remote-row three' },
      ir(b.power, { label: 'Güç', iconName: 'power', className: 'key danger' }),
      ir(b.lock, { label: 'Kilit', iconName: 'lock', className: 'key' }),
      ir(b.toggle, { label: 'Aç/kapat', iconName: 'toggle', className: 'key' })),
    h('div', { class: 'temp-keys' },
      ir(b.tempDown, { label: 'Sıcaklığı düşür', iconName: 'minus', className: 'key big cool', size: 30 }),
      h('span', { class: 'temp-keys-label' }, 'Sıcaklık'),
      ir(b.tempUp, { label: 'Sıcaklığı artır', iconName: 'plus', className: 'key big warm', size: 30 })),
    h('div', { class: 'remote-row three' },
      ir(b.eco, { label: 'ECO modu', iconName: 'leaf', text: 'ECO', className: 'key labelled' }),
      ir(b.performance, { label: 'Performans modu', iconName: 'flame', text: 'Boost', className: 'key labelled' }),
      ir(b.sleep, { label: 'Uyku modu', iconName: 'moon', text: 'Uyku', className: 'key labelled' })),
    h('p', { class: 'card-foot muted dev-only' }, 'Güç kodu, yukarıdaki anahtarla yalnızca takip edilen durum ısıtıcının diğer konumda olduğunu söylediğinde gönderilir. Kırmızı tuş kodu her zaman gönderir.'));
}
