// The Customize panel, opened from the bar at the bottom while customizing
// (and from Settings). Theme: light or dark, still and moving themes, the
// background's effects, accent, corners, spacing and size. Buttons: shape,
// style, size, depth, icons and each quick action's own colour, icon and
// name. Layout: options with no single spot on the screen (moving things is
// done on the screen itself). Every change applies straight away.

import { HOME } from '../config.js';
import { userDevices, deviceName, sortedAreas } from '../store.js';
import { SCENES } from '../scenes.js';
import { h, loadSettings, setPrefs, effectiveTheme, toast } from '../util.js';
import { icon } from '../icons.js';
import { toggle } from '../components.js';
import { PALETTES, ACCENTS, EFFECTS, BUTTON_COLOURS, BUTTON_ICONS, paletteById } from '../themes.js';
import { getCustom, setCustom, replaceCustom, resetCustom, skyFor, withFlag, LAYOUT_KEYS, BUTTON_KEYS, SECTIONS, INDICATORS, HEADER_ITEMS } from '../custom.js';

let current = null;
let lastTab = 'theme';
const TABS = [['theme', 'Tema', 'palette'], ['buttons', 'Düğmeler', 'toggle'], ['layout', 'Yerleşim', 'move']];

// Starts moving things on the screen (js/main.js listens for this).
const startMoving = () => window.dispatchEvent(new CustomEvent('evra-move'));

// Opens the panel, or closes it if it's already open.
export function openCustomizer({ button, tab } = {}) {
  if (current) { current(); return; }
  if (tab) lastTab = tab;

  const body = h('div', { class: 'cz-body' });
  const tabs = h('div', { class: 'segmented cz-tabs', role: 'tablist', 'aria-label': 'Özelleştir' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Kapat' }, icon('close', 18));
  // The way to move things sits above the tabs, so it's always one tap away.
  const moveBtn = h('button', { class: 'cz-move', type: 'button' },
    h('span', { class: 'card-icon' }, icon('move', 20)),
    h('span', null, h('strong', null, 'Ekranda yer değiştir'),
      h('small', null, 'Bölümleri, düğmeleri, kutuları, odaları, sahneleri ve sekmeleri sürükleyin. Gizlemek için göze dokunun.')),
    icon('right', 18));
  moveBtn.addEventListener('click', () => { close(); startMoving(); });
  const panel = h('aside', { class: 'cz-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cz-title' },
    h('header', { class: 'cz-head' },
      h('span', { class: 'card-icon custom-btn-icon' }, icon('palette', 20)),
      h('h2', { id: 'cz-title' }, 'Özelleştir'),
      closeBtn),
    moveBtn, tabs, body);
  const backdrop = h('div', { class: 'cz-backdrop' });
  document.body.append(backdrop, panel);
  // Read the layout once so the slide-in starts from off-screen.
  void panel.offsetWidth;
  backdrop.classList.add('show');
  panel.classList.add('show');

  const draw = () => {
    tabs.replaceChildren(...TABS.map(([id, label, ic]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(lastTab === id), class: lastTab === id ? 'active' : '',
      onclick: () => { lastTab = id; draw(); body.scrollTop = 0; },
    }, icon(ic, 16), label)));
    // Typing in a name box shouldn't lose its place when the panel re-draws.
    const focused = document.activeElement?.dataset?.keep;
    const pos = document.activeElement?.selectionStart;
    body.replaceChildren(...(lastTab === 'theme' ? themeTab() : lastTab === 'buttons' ? buttonsTab() : layoutTab()));
    if (focused) { const el = body.querySelector(`[data-keep="${focused}"]`); el?.focus(); if (pos != null) el?.setSelectionRange?.(pos, pos); }
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function close() {
    current = null;
    window.removeEventListener('evra-custom', draw);
    window.removeEventListener('evra-prefs', draw);
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('show');
    panel.classList.remove('show');
    setTimeout(() => { backdrop.remove(); panel.remove(); }, 260);
    button?.focus();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  window.addEventListener('evra-custom', draw);
  window.addEventListener('evra-prefs', draw);
  current = close;
  draw();
  closeBtn.focus();
}

// ---- building blocks -------------------------------------------------------------

function group(title, hint, ...kids) {
  return h('section', { class: 'cz-group' },
    h('h3', { class: 'cz-title' }, title),
    hint ? h('p', { class: 'muted small' }, hint) : null,
    kids);
}

// options: [[value, label, icon?]]
function choice(label, options, value, onPick) {
  return h('div', { class: 'segmented cz-seg', role: 'radiogroup', 'aria-label': label }, options.map(([v, text, ic]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(value === v), class: value === v ? 'active' : '',
    onclick: () => onPick(v),
  }, ic ? icon(ic, 16) : null, text)));
}

// A labelled choice that saves straight into the customization.
const pick = (title, key, options, hint, rerender = false) => [
  sub(title, hint),
  choice(title, options, getCustom()[key], (v) => setCustom({ [key]: v }, { rerender })),
];

function switchRow(title, hint, on, onChange) {
  const sw = toggle(title, onChange);
  sw.set(on);
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('strong', null, title), hint ? h('small', null, hint) : null), sw);
}

const sub = (title, hint) => h('div', { class: 'cz-sub' }, h('strong', null, title), hint ? h('small', { class: 'muted' }, hint) : null);

// ---- theme ---------------------------------------------------------------------

function themeTab() {
  const c = getCustom();
  const { theme } = loadSettings();
  const dark = effectiveTheme() === 'dark';

  const card = (p) => {
    const m = dark ? p.dark : p.light;
    const active = c.palette === p.id;
    return h('button', {
      type: 'button', class: `cz-palette${active ? ' active' : ''}`, 'aria-pressed': String(active),
      onclick: () => setCustom({ palette: p.id, background: 'auto', effects: [] }), // a theme always brings its own effects
    },
    h('span', { class: `cz-preview${p.motion ? ' moving' : ''}`, style: p.motion ? { background: m.bg, '--m1': p.m[0], '--m2': p.m[1], '--m3': p.m[2] } : { background: m.bg } },
      p.motion ? h('i', { class: 'cz-preview-glow' }) : null,
      h('span', { class: 'cz-preview-card', style: { background: m.card } },
        [p.p.sky, p.p.splash, p.p.seawash, p.p.denim].map((col) => h('i', { style: { background: col } })))),
    h('span', { class: 'cz-palette-name' }, active ? icon('check', 14) : null, p.name));
  };

  const own = paletteById(c.palette).p.sky;
  const picker = h('input', { type: 'color', value: c.accent || own, 'aria-label': 'İstediğiniz vurgu rengini seçin' });
  picker.addEventListener('change', () => setCustom({ accent: picker.value.toUpperCase() }, { rerender: false }));
  const isCustom = c.accent && !ACCENTS.includes(c.accent);
  const accents = h('div', { class: 'cz-swatches', role: 'radiogroup', 'aria-label': 'Vurgu rengi' },
    h('button', {
      type: 'button', role: 'radio', class: `cz-swatch auto${!c.accent ? ' active' : ''}`, 'aria-checked': String(!c.accent),
      title: 'Temanın kendi', 'aria-label': 'Temanın kendi vurgusu', style: { '--sw': own }, onclick: () => setCustom({ accent: '' }, { rerender: false }),
    }, h('span', null, 'A')),
    ACCENTS.map((col) => h('button', {
      type: 'button', role: 'radio', class: `cz-swatch${c.accent === col ? ' active' : ''}`, 'aria-checked': String(c.accent === col),
      'aria-label': `Vurgu ${col}`, title: col, style: { '--sw': col }, onclick: () => setCustom({ accent: col }, { rerender: false }),
    })),
    h('label', { class: `cz-swatch any${isCustom ? ' active' : ''}`, title: 'İstediğiniz renk', style: isCustom ? { '--sw': c.accent } : null }, icon('plus', 14), picker));

  // Effects: the theme's own mix, none, or any mix of layers.
  const inUse = new Set(skyFor(c));
  const effects = h('div', { class: 'cz-chips', role: 'group', 'aria-label': 'Arka plan efektleri' },
    h('button', { type: 'button', class: `room-chip small${c.background === 'auto' ? ' active' : ''}`, 'aria-pressed': String(c.background === 'auto'), onclick: () => setCustom({ background: 'auto' }, { rerender: false }) }, 'Temanın kendi'),
    h('button', { type: 'button', class: `room-chip small${c.background === 'none' ? ' active' : ''}`, 'aria-pressed': String(c.background === 'none'), onclick: () => setCustom({ background: 'none' }, { rerender: false }) }, 'Yok'),
    h('span', { class: 'cz-chip-sep' }),
    EFFECTS.map((e) => {
      const on = inUse.has(e.id);
      return h('button', {
        type: 'button', class: `room-chip small effect${on ? ' active' : ''}`, 'aria-pressed': String(on),
        onclick: () => {
          const next = new Set(skyFor(getCustom()));
          if (on) next.delete(e.id); else next.add(e.id);
          setCustom({ background: 'custom', effects: EFFECTS.map((x) => x.id).filter((id) => next.has(id)) }, { rerender: false });
        },
      }, on ? icon('check', 13) : icon('plus', 13), e.name);
    }));

  return [
    group('Açık ya da koyu', null, choice('Açık ya da koyu', [['light', 'Açık', 'sun'], ['dark', 'Koyu', 'moon'], ['auto', 'Otomatik', 'auto']], theme, (v) => setPrefs({ theme: v }))),
    group('Hareketli temalar', 'Efektler her şeyin arkasında yavaşça süzülür, Evra web sitesindeki gibi. Gece gökyüzü sitenin kendisi.', h('div', { class: 'cz-palettes' }, PALETTES.filter((p) => p.motion).map(card))),
    group('Sabit temalar', 'Her temanın açık ve koyu hali var. Alarmlar kırmızı, ısıtma kehribar renginde kalır.', h('div', { class: 'cz-palettes' }, PALETTES.filter((p) => !p.motion).map(card))),
    group('Arka plan efektleri', 'Kullandığınız temaya efekt ekleyin ya da çıkarın. Bir tema seçmek kendi efektlerini geri getirir.', effects,
      ...pick('Yoğunluk', 'skyStrength', [['subtle', 'Hafif'], ['normal', 'Normal'], ['strong', 'Güçlü']]),
      ...pick('Hareket', 'skyMotion', [['still', 'Durgun'], ['calm', 'Sakin'], ['normal', 'Canlı']], 'Durgun, resmi korur ama hareketini durdurur.')),
    group('Vurgu rengi', 'Düğmeler, anahtarlar ve seçili sekmeler.', accents),
    group('Biçim ve boyut', null,
      ...pick('Köşeler', 'corners', [['square', 'Köşeli'], ['soft', 'Yumuşak'], ['rounded', 'Yuvarlak'], ['round', 'Tam yuvarlak']]),
      ...pick('Boşluk', 'density', [['compact', 'Sıkışık'], ['comfortable', 'Rahat'], ['spacious', 'Geniş']]),
      ...pick('Yazı boyutu', 'size', [['small', 'Daha küçük'], ['normal', 'Normal'], ['large', 'Daha büyük']])),
    group('Kutular', null, switchRow('Açık cihazların kutusunu renklendir', 'Açık bir cihaz kutusunu kendi rengiyle doldurur.', c.glow, (on) => setCustom({ glow: on }, { rerender: false }))),
    h('div', { class: 'btn-row cz-foot' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => resetCustom(['palette', 'accent', 'background', 'effects', 'skyStrength', 'skyMotion', 'corners', 'density', 'size', 'glow']) }, icon('refresh', 16), 'Temayı sıfırla')),
  ];
}

// ---- buttons --------------------------------------------------------------------

function buttonsTab() {
  const c = getCustom();
  const preview = h('div', { class: 'cz-btn-preview' },
    h('button', { class: 'btn primary', type: 'button', tabindex: '-1' }, icon('check', 16), 'Ana düğme'),
    h('button', { class: 'btn', type: 'button', tabindex: '-1' }, 'Düğme'),
    h('span', { class: 'room-chip active' }, 'Etiket'),
    h('button', { class: 'quick-btn', type: 'button', tabindex: '-1', style: { '--tone': 'var(--p-sky)' } },
      h('span', { class: 'quick-icon' }, icon('sun', 20)), h('span', { class: 'quick-text' }, h('strong', null, 'Hızlı'), h('small', null, 'işlem'))));

  return [
    group('Önizleme', null, preview),
    group('Tüm düğmeler', null,
      ...pick('Biçim', 'btnShape', [['pill', 'Hap'], ['rounded', 'Yuvarlak'], ['square', 'Köşeli']], 'Düğmeler, etiketler, anahtarlar ve hızlı işlemler.'),
      ...pick('Ana düğmeler', 'btnStyle', [['filled', 'Dolu'], ['soft', 'Yumuşak'], ['outline', 'Çerçeveli']]),
      ...pick('Boyut', 'btnSize', [['small', 'Küçük'], ['normal', 'Normal'], ['large', 'Büyük']], 'Büyük olanlara duvar ekranında dokunmak daha kolaydır.'),
      ...pick('Derinlik', 'depth', [['flat', 'Düz'], ['soft', 'Yumuşak'], ['raised', 'Kabarık'], ['glow', 'Parlayan']]),
      ...pick('Basınca', 'press', [['none', 'Durgun'], ['subtle', 'Hafif'], ['bouncy', 'Zıplayan']])),
    group('Hızlı işlem düğmeleri', null,
      ...pick('Görünüm', 'quickLookStyle', [['card', 'Kart'], ['tinted', 'Renkli'], ['outline', 'Çerçeveli'], ['solid', 'Dolgun']]),
      ...pick('Simgeler', 'iconStyle', [['bubble', 'Balon'], ['circle', 'Daire'], ['plain', 'Sade']]),
      ...pick('Yazı', 'quickStyle', [['full', 'Açıklamalı'], ['compact', 'Yalnızca ad']])),
    group('Her hızlı işlem', 'Her düğmeye kendi adını, rengini ve simgesini verin. Sıralama ve gizleme ekranda yapılır.',
      HOME.quickActions.map((a) => quickEditor(a, c.quickLook[a.id] || {}))),
    h('div', { class: 'btn-row cz-foot' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => resetCustom(BUTTON_KEYS) }, icon('refresh', 16), 'Düğmeleri sıfırla')),
  ];
}

function quickEditor(a, look) {
  const save = (patch) => {
    const all = { ...getCustom().quickLook };
    const next = { ...(all[a.id] || {}), ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    if (Object.keys(next).length) all[a.id] = next; else delete all[a.id];
    setCustom({ quickLook: all });
  };
  const name = h('input', { class: 'input', type: 'text', value: look.name || '', placeholder: a.name, maxlength: '24', 'aria-label': `${a.name} için ad`, 'data-keep': `name-${a.id}` });
  name.addEventListener('change', () => save({ name: name.value.trim() }));
  const tone = look.tone || a.tone;
  return h('details', { class: 'cz-quick', open: Object.keys(look).length > 0 },
    h('summary', null,
      h('span', { class: 'quick-icon', style: { '--tone': tone } }, icon(look.icon || a.icon, 18)),
      h('strong', null, look.name || a.name),
      h('small', { class: 'muted' }, a.hint)),
    h('label', { class: 'field' }, h('span', null, 'Ad'), name),
    h('div', { class: 'cz-swatches small', role: 'radiogroup', 'aria-label': `${a.name} için renk` },
      h('button', { type: 'button', class: `cz-swatch auto${!look.tone ? ' active' : ''}`, style: { '--sw': a.tone }, title: 'Kendi rengi', 'aria-label': 'Kendi rengi', onclick: () => save({ tone: '' }) }, h('span', null, 'A')),
      BUTTON_COLOURS.map(([col, label]) => h('button', {
        type: 'button', class: `cz-swatch${look.tone === col ? ' active' : ''}`, style: { '--sw': col }, title: label, 'aria-label': label,
        onclick: () => save({ tone: col }),
      }))),
    h('div', { class: 'cz-icons', role: 'radiogroup', 'aria-label': `${a.name} için simge` },
      BUTTON_ICONS.map((ic) => {
        const on = (look.icon || a.icon) === ic;
        return h('button', { type: 'button', class: `cz-icon${on ? ' active' : ''}`, 'aria-label': ic, 'aria-checked': String(on), role: 'radio', onclick: () => save({ icon: ic === a.icon ? '' : ic }) }, icon(ic, 18));
      })));
}

// ---- layout --------------------------------------------------------------------

// Everything that's hidden, so it can be brought back without hunting for it.
function hiddenThings(c) {
  const names = (list) => Object.fromEntries(list.map((x) => [x.id, x.label || x.name]));
  const quickNames = Object.fromEntries(HOME.quickActions.map((a) => [a.id, c.quickLook[a.id]?.name || a.name]));
  const sources = [
    ['sections', names(SECTIONS), 'Ana sayfa'],
    ['indicators', names(INDICATORS), 'İklim kartı'],
    ['quick', quickNames, 'Hızlı işlem'],
    ['rooms', Object.fromEntries(sortedAreas().map((a) => [a.area_id, a.name])), 'Oda'],
    ['scenes', names(SCENES), 'Sahne'],
    ['nav', {}, 'Sekme'],
    ['header', names(HEADER_ITEMS), 'Üst çubuk'],
    ['tiles', Object.fromEntries(userDevices().map((d) => [d.id, deviceName(d)])), 'Kutu'],
  ];
  const out = [];
  for (const [key, map, kind] of sources) {
    for (const id of c[key].hidden) {
      // Optional readings that start hidden aren't listed as "hidden by you".
      if (key === 'indicators' && (id === 'power' || id === 'lights')) continue;
      if (key !== 'nav' && !map[id]) continue;
      out.push({ key, id, label: `${kind}: ${map[id] || id[0].toLocaleUpperCase('tr-TR') + id.slice(1)}` });
    }
  }
  return out;
}

function layoutTab() {
  const c = getCustom();
  const hidden = hiddenThings(c);

  return [
    group('Gizlenenler', hidden.length ? 'Yeniden göstermek için birine dokunun.' : 'Gizlenen bir şey yok. Bir şeyi gizlemek için Ekranda yer değiştir\'i açıp gözüne dokunun.',
      hidden.length ? h('ul', { class: 'cz-hidden-list' }, hidden.map((x) => h('li', null, h('button', {
        type: 'button', class: 'room-chip small', onclick: () => setCustom({ [x.key]: withFlag(getCustom()[x.key], 'hidden', x.id, false) }),
      }, icon('eye', 14), x.label)))) : null),
    group('Cihaz kutuları', null,
      switchRow('Odaya göre grupla', 'Her oda için bir başlık. Kapalıyken: kendi sıranızla tek liste.', c.groupRooms, (on) => setCustom({ groupRooms: on })),
      ...pick('Kutu boyutu', 'tileStyle', [['full', 'Tam'], ['compact', 'Sıkışık']], 'Sıkışık yalnızca adı, durumu ve anahtarı gösterir. Tek tek kutular ekranda küçük ya da geniş yapılabilir.'),
      ...pick('Satır başına kutu', 'columns', [['auto', 'Otomatik'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], 'Tablet ve bilgisayarlarda. Telefonlarda bir tane.')),
    group('Sekmeler', null,
      switchRow('Sekme simgelerinin altında adlar', null, c.navLabels, (on) => setCustom({ navLabels: on }, { rerender: false })),
      switchRow('Telefonda Enerji ve Kumandalar', 'Bunları telefonun sekme çubuğuna da ekler. Yoksa Ayarlar\'dadırlar.', c.phoneTabs, (on) => setCustom({ phoneTabs: on }, { rerender: false }))),
    group('Sayfa', null,
      switchRow('Bölüm başlıkları', '"Odalar", "Hızlı işlemler" ve kutuların üstündeki oda adları.', c.sectionTitles, (on) => setCustom({ sectionTitles: on }, { rerender: false })),
      ...pick('Büyük ekranda genişlik', 'pageWidth', [['normal', 'Ortada'], ['full', 'Tam genişlik']])),
    group('Ayarlarınız', 'Bu cihazda saklanır. Aynı görünümü başka bir telefonda ya da duvar ekranında kullanmak için kopyalayın.',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: copySetup }, icon('link', 16), 'Ayarları kopyala'),
        h('button', { class: 'btn', type: 'button', onclick: pasteSetup }, icon('edit', 16), 'Ayar yapıştır')),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (confirm('Yerleşim Evra\'nın ilk haline dönsün mü? Temanız kalır.')) { resetCustom(LAYOUT_KEYS); toast('Yerleşim sıfırlandı'); } },
        }, icon('refresh', 16), 'Yerleşimi sıfırla'),
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (confirm('Tema, düğmeler ve yerleşim Evra\'nın ilk haline dönsün mü?')) { resetCustom(); toast('İlk görünüme dönüldü'); } },
        }, icon('refresh', 16), 'Her şeyi sıfırla'))),
  ];
}

async function copySetup() {
  const code = JSON.stringify(getCustom());
  try {
    await navigator.clipboard.writeText(code);
    toast('Ayarlar kopyalandı. Diğer ekranda "Ayar yapıştır"ı kullanın.');
  } catch {
    prompt('Bu ayar kodunu kopyalayın:', code);
  }
}

function pasteSetup() {
  const text = prompt('Evra\'dan kopyalanan ayar kodunu yapıştırın:');
  if (!text) return;
  try {
    replaceCustom(JSON.parse(text));
    toast('Ayarlar uygulandı');
  } catch {
    toast('Bu bir Evra ayar kodu değil', 'error');
  }
}
