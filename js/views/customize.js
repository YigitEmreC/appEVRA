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
const TABS = [['theme', 'Theme', 'palette'], ['buttons', 'Buttons', 'toggle'], ['layout', 'Layout', 'move']];

// Starts moving things on the screen (js/main.js listens for this).
const startMoving = () => window.dispatchEvent(new CustomEvent('evra-move'));

// Opens the panel, or closes it if it's already open.
export function openCustomizer({ button, tab } = {}) {
  if (current) { current(); return; }
  if (tab) lastTab = tab;

  const body = h('div', { class: 'cz-body' });
  const tabs = h('div', { class: 'segmented cz-tabs', role: 'tablist', 'aria-label': 'Customize' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('close', 18));
  // The way to move things sits above the tabs, so it's always one tap away.
  const moveBtn = h('button', { class: 'cz-move', type: 'button' },
    h('span', { class: 'card-icon' }, icon('move', 20)),
    h('span', null, h('strong', null, 'Move things on the screen'),
      h('small', null, 'Drag sections, buttons, tiles, rooms, scenes and tabs. Tap an eye to hide one.')),
    icon('right', 18));
  moveBtn.addEventListener('click', () => { close(); startMoving(); });
  const panel = h('aside', { class: 'cz-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cz-title' },
    h('header', { class: 'cz-head' },
      h('span', { class: 'card-icon custom-btn-icon' }, icon('palette', 20)),
      h('h2', { id: 'cz-title' }, 'Customize'),
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
  const picker = h('input', { type: 'color', value: c.accent || own, 'aria-label': 'Pick any accent colour' });
  picker.addEventListener('change', () => setCustom({ accent: picker.value.toUpperCase() }, { rerender: false }));
  const isCustom = c.accent && !ACCENTS.includes(c.accent);
  const accents = h('div', { class: 'cz-swatches', role: 'radiogroup', 'aria-label': 'Accent colour' },
    h('button', {
      type: 'button', role: 'radio', class: `cz-swatch auto${!c.accent ? ' active' : ''}`, 'aria-checked': String(!c.accent),
      title: 'The theme\'s own', 'aria-label': 'The theme\'s own accent', style: { '--sw': own }, onclick: () => setCustom({ accent: '' }, { rerender: false }),
    }, h('span', null, 'A')),
    ACCENTS.map((col) => h('button', {
      type: 'button', role: 'radio', class: `cz-swatch${c.accent === col ? ' active' : ''}`, 'aria-checked': String(c.accent === col),
      'aria-label': `Accent ${col}`, title: col, style: { '--sw': col }, onclick: () => setCustom({ accent: col }, { rerender: false }),
    })),
    h('label', { class: `cz-swatch any${isCustom ? ' active' : ''}`, title: 'Any colour', style: isCustom ? { '--sw': c.accent } : null }, icon('plus', 14), picker));

  // Effects: the theme's own mix, none, or any mix of layers.
  const inUse = new Set(skyFor(c));
  const effects = h('div', { class: 'cz-chips', role: 'group', 'aria-label': 'Background effects' },
    h('button', { type: 'button', class: `room-chip small${c.background === 'auto' ? ' active' : ''}`, 'aria-pressed': String(c.background === 'auto'), onclick: () => setCustom({ background: 'auto' }, { rerender: false }) }, 'Theme\'s own'),
    h('button', { type: 'button', class: `room-chip small${c.background === 'none' ? ' active' : ''}`, 'aria-pressed': String(c.background === 'none'), onclick: () => setCustom({ background: 'none' }, { rerender: false }) }, 'None'),
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
    group('Light or dark', null, choice('Light or dark', [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Auto', 'auto']], theme, (v) => setPrefs({ theme: v }))),
    group('Moving themes', 'Effects drift slowly behind everything, like on the Evra website. Night sky is the website\'s own.', h('div', { class: 'cz-palettes' }, PALETTES.filter((p) => p.motion).map(card))),
    group('Still themes', 'Every theme has a light and a dark version. Alarms stay red and heating stays amber.', h('div', { class: 'cz-palettes' }, PALETTES.filter((p) => !p.motion).map(card))),
    group('Background effects', 'Add or take away effects for the theme you are using. Picking a theme brings back its own effects.', effects,
      ...pick('Strength', 'skyStrength', [['subtle', 'Subtle'], ['normal', 'Normal'], ['strong', 'Strong']]),
      ...pick('Movement', 'skyMotion', [['still', 'Still'], ['calm', 'Calm'], ['normal', 'Lively']], 'Still keeps the picture but stops it moving.')),
    group('Accent colour', 'Buttons, switches and highlighted tabs.', accents),
    group('Shape and size', null,
      ...pick('Corners', 'corners', [['square', 'Square'], ['soft', 'Soft'], ['rounded', 'Rounded'], ['round', 'Round']]),
      ...pick('Spacing', 'density', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']]),
      ...pick('Text size', 'size', [['small', 'Smaller'], ['normal', 'Normal'], ['large', 'Larger']])),
    group('Tiles', null, switchRow('Colour tiles that are on', 'A device that\'s on fills its tile with its colour.', c.glow, (on) => setCustom({ glow: on }, { rerender: false }))),
    h('div', { class: 'btn-row cz-foot' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => resetCustom(['palette', 'accent', 'background', 'effects', 'skyStrength', 'skyMotion', 'corners', 'density', 'size', 'glow']) }, icon('refresh', 16), 'Reset the theme')),
  ];
}

// ---- buttons --------------------------------------------------------------------

function buttonsTab() {
  const c = getCustom();
  const preview = h('div', { class: 'cz-btn-preview' },
    h('button', { class: 'btn primary', type: 'button', tabindex: '-1' }, icon('check', 16), 'Main button'),
    h('button', { class: 'btn', type: 'button', tabindex: '-1' }, 'Button'),
    h('span', { class: 'room-chip active' }, 'Chip'),
    h('button', { class: 'quick-btn', type: 'button', tabindex: '-1', style: { '--tone': 'var(--p-sky)' } },
      h('span', { class: 'quick-icon' }, icon('sun', 20)), h('span', { class: 'quick-text' }, h('strong', null, 'Quick'), h('small', null, 'action'))));

  return [
    group('Preview', null, preview),
    group('All buttons', null,
      ...pick('Shape', 'btnShape', [['pill', 'Pill'], ['rounded', 'Rounded'], ['square', 'Square']], 'Buttons, chips, switches and quick actions.'),
      ...pick('Main buttons', 'btnStyle', [['filled', 'Filled'], ['soft', 'Soft'], ['outline', 'Outline']]),
      ...pick('Size', 'btnSize', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], 'Larger is easier to tap on the wall panel.'),
      ...pick('Depth', 'depth', [['flat', 'Flat'], ['soft', 'Soft'], ['raised', 'Raised'], ['glow', 'Glow']]),
      ...pick('When pressed', 'press', [['none', 'Still'], ['subtle', 'Subtle'], ['bouncy', 'Bouncy']])),
    group('Quick action buttons', null,
      ...pick('Look', 'quickLookStyle', [['card', 'Card'], ['tinted', 'Tinted'], ['outline', 'Outline'], ['solid', 'Solid']]),
      ...pick('Icons', 'iconStyle', [['bubble', 'Bubble'], ['circle', 'Circle'], ['plain', 'Plain']]),
      ...pick('Text', 'quickStyle', [['full', 'With description'], ['compact', 'Name only']])),
    group('Each quick action', 'Give each button its own name, colour and icon. Order and hiding are done on the screen.',
      HOME.quickActions.map((a) => quickEditor(a, c.quickLook[a.id] || {}))),
    h('div', { class: 'btn-row cz-foot' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => resetCustom(BUTTON_KEYS) }, icon('refresh', 16), 'Reset the buttons')),
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
  const name = h('input', { class: 'input', type: 'text', value: look.name || '', placeholder: a.name, maxlength: '24', 'aria-label': `Name for ${a.name}`, 'data-keep': `name-${a.id}` });
  name.addEventListener('change', () => save({ name: name.value.trim() }));
  const tone = look.tone || a.tone;
  return h('details', { class: 'cz-quick', open: Object.keys(look).length > 0 },
    h('summary', null,
      h('span', { class: 'quick-icon', style: { '--tone': tone } }, icon(look.icon || a.icon, 18)),
      h('strong', null, look.name || a.name),
      h('small', { class: 'muted' }, a.hint)),
    h('label', { class: 'field' }, h('span', null, 'Name'), name),
    h('div', { class: 'cz-swatches small', role: 'radiogroup', 'aria-label': `Colour for ${a.name}` },
      h('button', { type: 'button', class: `cz-swatch auto${!look.tone ? ' active' : ''}`, style: { '--sw': a.tone }, title: 'Its own colour', 'aria-label': 'Its own colour', onclick: () => save({ tone: '' }) }, h('span', null, 'A')),
      BUTTON_COLOURS.map(([col, label]) => h('button', {
        type: 'button', class: `cz-swatch${look.tone === col ? ' active' : ''}`, style: { '--sw': col }, title: label, 'aria-label': label,
        onclick: () => save({ tone: col }),
      }))),
    h('div', { class: 'cz-icons', role: 'radiogroup', 'aria-label': `Icon for ${a.name}` },
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
    ['sections', names(SECTIONS), 'Home'],
    ['indicators', names(INDICATORS), 'Climate card'],
    ['quick', quickNames, 'Quick action'],
    ['rooms', Object.fromEntries(sortedAreas().map((a) => [a.area_id, a.name])), 'Room'],
    ['scenes', names(SCENES), 'Scene'],
    ['nav', {}, 'Tab'],
    ['header', names(HEADER_ITEMS), 'Top bar'],
    ['tiles', Object.fromEntries(userDevices().map((d) => [d.id, deviceName(d)])), 'Tile'],
  ];
  const out = [];
  for (const [key, map, kind] of sources) {
    for (const id of c[key].hidden) {
      // Optional readings that start hidden aren't listed as "hidden by you".
      if (key === 'indicators' && (id === 'power' || id === 'lights')) continue;
      if (key !== 'nav' && !map[id]) continue;
      out.push({ key, id, label: `${kind}: ${map[id] || id[0].toUpperCase() + id.slice(1)}` });
    }
  }
  return out;
}

function layoutTab() {
  const c = getCustom();
  const hidden = hiddenThings(c);

  return [
    group('Hidden things', hidden.length ? 'Tap one to show it again.' : 'Nothing is hidden. To hide something, use Move things on the screen and tap its eye.',
      hidden.length ? h('ul', { class: 'cz-hidden-list' }, hidden.map((x) => h('li', null, h('button', {
        type: 'button', class: 'room-chip small', onclick: () => setCustom({ [x.key]: withFlag(getCustom()[x.key], 'hidden', x.id, false) }),
      }, icon('eye', 14), x.label)))) : null),
    group('Device tiles', null,
      switchRow('Group by room', 'A heading for each room. Off: one list in your own order.', c.groupRooms, (on) => setCustom({ groupRooms: on })),
      ...pick('Tile size', 'tileStyle', [['full', 'Full'], ['compact', 'Compact']], 'Compact shows just the name, state and switch. Single tiles can be made small or wide on the screen.'),
      ...pick('Tiles per row', 'columns', [['auto', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], 'On tablets and computers. Phones show one.')),
    group('Tabs', null,
      switchRow('Names under the tab icons', null, c.navLabels, (on) => setCustom({ navLabels: on }, { rerender: false })),
      switchRow('Energy and Remotes on phones', 'Adds them to the phone\'s tab bar too. Otherwise they\'re in Settings.', c.phoneTabs, (on) => setCustom({ phoneTabs: on }, { rerender: false }))),
    group('Page', null,
      switchRow('Section headings', '"Rooms", "Quick actions" and the room names above tiles.', c.sectionTitles, (on) => setCustom({ sectionTitles: on }, { rerender: false })),
      ...pick('Width on big screens', 'pageWidth', [['normal', 'Centred'], ['full', 'Full width']])),
    group('Your setup', 'Kept on this device. Copy it to use the same look on another phone or the wall panel.',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: copySetup }, icon('link', 16), 'Copy setup'),
        h('button', { class: 'btn', type: 'button', onclick: pasteSetup }, icon('edit', 16), 'Paste a setup')),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (confirm('Put the layout back to how Evra came? Your theme stays.')) { resetCustom(LAYOUT_KEYS); toast('Layout reset'); } },
        }, icon('refresh', 16), 'Reset the layout'),
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (confirm('Put the theme, buttons and layout back to how Evra came?')) { resetCustom(); toast('Back to the original look'); } },
        }, icon('refresh', 16), 'Reset everything'))),
  ];
}

async function copySetup() {
  const code = JSON.stringify(getCustom());
  try {
    await navigator.clipboard.writeText(code);
    toast('Setup copied. Use "Paste a setup" on the other screen.');
  } catch {
    prompt('Copy this setup code:', code);
  }
}

function pasteSetup() {
  const text = prompt('Paste a setup code copied from Evra:');
  if (!text) return;
  try {
    replaceCustom(JSON.parse(text));
    toast('Setup applied');
  } catch {
    toast('That isn\'t an Evra setup code', 'error');
  }
}
