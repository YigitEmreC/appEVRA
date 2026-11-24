// Scene editor: #/scenes/new and #/scenes/edit/<id>. A scene is a set of choices per
// kind of device (lights, TV, heater, heating, curtains, lock, appliances); planScene()
// turns them into changes for the rooms chosen on the Scenes screen.

import { HOME } from '../config.js';
import { store, userDevices, deviceEntities } from '../store.js';
import { productForDevice } from '../catalog.js';
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { SCENES, WARM, NEUTRAL, COOL, planScene, saveScene, deleteScene, isDefaultScene, defaultScene, describeScene, loadScenes } from '../scenes.js';

const ICONS = ['sunrise', 'sun', 'moon', 'bed', 'leaf', 'party', 'film', 'gamepad', 'music', 'dinner', 'door', 'vacuum', 'tv', 'heater', 'bulb', 'flame', 'home', 'sparkle'];
const TONES = ['var(--p-splash)', 'var(--p-stlouis-2)', 'var(--p-denim)', 'var(--p-sky)', 'var(--p-seawash)', 'var(--p-gentle)', 'var(--p-mint)', 'var(--p-stlouis)', '#E9BE7C'];
const WHITES = [['warm', 'Sıcak beyaz', WARM], ['neutral', 'Nötr beyaz', NEUTRAL], ['cool', 'Soğuk beyaz', COOL]];

// What kinds of device this home has, so only rows that do something are shown.
function homeHas() {
  const has = new Set(['light']);
  for (const d of userDevices()) {
    const p = productForDevice(d);
    for (const e of deviceEntities(d.id)) {
      const dom = e.entity_id.split('.')[0];
      if (dom === 'climate') has.add('climate');
      if (dom === 'cover') has.add('cover');
      if (dom === 'lock') has.add('lock');
      if (dom === 'vacuum') has.add('vacuum');
      if (dom === 'fan') has.add(p?.id === 'air-purifier' ? 'purifier' : 'fan');
      if (dom === 'switch' && p?.id === 'smart-kettle') has.add('kettle');
    }
  }
  if (store.get(HOME.tv?.buttons?.power)) has.add('tv');
  if (store.get(HOME.heater?.buttons?.power)) has.add('heater');
  return has;
}

export function renderSceneEditor(root, cleanup, sceneId) {
  const existing = sceneId ? SCENES.find((s) => s.id === sceneId) : null;
  if (sceneId && !existing) {
    root.append(h('a', { class: 'back-link', href: '#/scenes' }, icon('left', 16), 'Sahneler'),
      h('div', { class: 'empty' }, h('p', null, 'Bu sahne bulunamadı.')));
    loadScenes().then((list) => { if (list.some((s) => s.id === sceneId)) location.reload(); });
    return;
  }
  const draft = existing ? JSON.parse(JSON.stringify(existing))
    : { id: `custom-${Date.now().toString(36)}`, name: '', icon: 'sparkle', tone: 'var(--p-sky)', text: '', light: { pct: 70, kelvin: WARM } };
  // A description we wrote automatically gets rewritten as settings change.
  let autoText = !draft.text || draft.text === describeScene(draft);
  const has = homeHas();
  const shown = (key) => has.has(key) || draft[key] != null;

  const preview = h('div', { class: 'scene-preview' });
  const paintPreview = () => {
    const steps = planScene(draft, 'all');
    preview.replaceChildren(
      h('p', { class: 'scene-text' }, draft.text && !autoText ? draft.text : describeScene(draft)),
      steps.length
        ? h('ul', { class: 'scene-steps-list' }, steps.map((s) => h('li', null, icon(s.icon, 16), h('span', null, s.device), h('strong', null, s.text))))
        : h('p', { class: 'muted small' }, 'Bu ayarlar evinizde şu an bir şeyi değiştirmiyor.'));
  };
  const changed = () => { if (autoText) textInput.placeholder = describeScene(draft); paintPreview(); };

  // ---- name, icon, colour, description ----
  const nameInput = h('input', { class: 'input', value: draft.name, maxlength: 30, placeholder: 'Örneğin: Kitap okuma', 'aria-label': 'Sahne adı' });
  nameInput.addEventListener('input', () => { draft.name = nameInput.value; });
  const textInput = h('textarea', { class: 'input', rows: 2, maxlength: 200, placeholder: describeScene(draft), 'aria-label': 'Açıklama' });
  textInput.value = autoText ? '' : draft.text;
  textInput.addEventListener('input', () => { autoText = !textInput.value.trim(); draft.text = textInput.value.trim(); paintPreview(); });

  const iconRow = h('div', { class: 'pick-grid', role: 'radiogroup', 'aria-label': 'Simge' });
  const paintIcons = () => iconRow.replaceChildren(...ICONS.map((n) => h('button', {
    type: 'button', class: `pick-icon${draft.icon === n ? ' active' : ''}`, role: 'radio', 'aria-checked': String(draft.icon === n), 'aria-label': n,
    onclick: () => { draft.icon = n; paintIcons(); },
  }, icon(n, 20))));
  paintIcons();
  const toneRow = h('div', { class: 'pick-grid', role: 'radiogroup', 'aria-label': 'Renk' });
  const paintTones = () => toneRow.replaceChildren(...TONES.map((t, i) => h('button', {
    type: 'button', class: `pick-tone${draft.tone === t ? ' active' : ''}`, role: 'radio', 'aria-checked': String(draft.tone === t),
    'aria-label': `Renk ${i + 1}`, style: { '--tone': t }, onclick: () => { draft.tone = t; paintTones(); },
  })));
  paintTones();

  // ---- the choices, one row per kind of device ----
  // seg(): a segmented choice; value null means "leave it alone".
  const seg = (label, options, get, set, extra = null) => {
    const box = h('div', { class: 'segmented small', role: 'radiogroup', 'aria-label': label });
    const paint = () => box.replaceChildren(...options.map(([v, l]) => {
      const on = JSON.stringify(get()) === JSON.stringify(v);
      return h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: on ? 'active' : '', onclick: () => { set(v); paint(); if (extra) extra.refresh(); changed(); } }, l);
    }));
    paint();
    return h('div', { class: 'scene-row' }, h('span', { class: 'scene-row-label' }, label), box, extra);
  };
  const keyed = (key) => [() => (draft[key] === undefined ? null : draft[key]), (v) => { if (v === null) delete draft[key]; else draft[key] = v; }];

  // Lights: leave, off, or on with a brightness and a white or a colour.
  const lightMode = () => (draft.light === 'off' ? 'off' : draft.light ? 'on' : null);
  const lightExtra = h('div', { class: 'scene-row-extra' });
  lightExtra.refresh = () => {
    if (lightMode() !== 'on') { lightExtra.replaceChildren(); return; }
    const l = draft.light;
    const bright = h('input', { type: 'range', min: 1, max: 100, value: l.pct ?? 70, 'aria-label': 'Parlaklık' });
    const brightText = h('span', { class: 'muted small' }, `%${l.pct ?? 70}`);
    bright.addEventListener('input', () => { l.pct = Number(bright.value); brightText.textContent = `%${l.pct}`; changed(); });
    const colours = [...WHITES.map(([id, name, k]) => ({ id, name, data: { kelvin: k } })),
      ...HOME.colorPresets.filter((p) => p.data.hs_color).map((p) => ({ id: p.name, name: p.name, data: { hs: p.data.hs_color }, css: p.css }))];
    const current = l.hs ? colours.find((c) => c.data.hs && c.data.hs[0] === l.hs[0])?.id : WHITES.find(([, , k]) => k === (l.kelvin || WARM))?.[0];
    const sel = h('select', { class: 'select', 'aria-label': 'Işık rengi' }, colours.map((c) => h('option', { value: c.id, selected: c.id === current }, c.name)));
    sel.addEventListener('change', () => {
      const c = colours.find((x) => x.id === sel.value);
      delete l.hs; delete l.kelvin;
      Object.assign(l, c.data);
      changed();
    });
    const keepEffect = l.effect?.length
      ? h('label', { class: 'check-field' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) l.effect = draft._effect; else { draft._effect = l.effect; delete l.effect; } changed(); } }),
        h('span', null, `Destekleyen ışıklarda "${l.effect[0]}" efekti`))
      : null;
    if (l.effect) draft._effect = l.effect;
    lightExtra.replaceChildren(...[h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, 'Parlaklık'), bright, brightText), sel, keepEffect].filter(Boolean));
  };
  lightExtra.refresh();
  const lightRow = seg('Işıklar', [[null, 'Dokunma'], ['off', 'Kapat'], ['on', 'Aç']], lightMode, (v) => {
    if (v === null) delete draft.light; else if (v === 'off') draft.light = 'off'; else if (!draft.light || draft.light === 'off') draft.light = { pct: 70, kelvin: WARM };
  }, lightExtra);

  const numberExtra = (key, { min, max, step, unit, label, fallback }) => {
    const box = h('div', { class: 'scene-row-extra' });
    box.refresh = () => {
      const v = draft[key];
      if (typeof v !== 'number') { box.replaceChildren(); return; }
      const input = h('input', { class: 'input short', type: 'number', min, max, step, value: v, 'aria-label': label });
      input.addEventListener('input', () => { const n = Number(input.value); if (Number.isFinite(n)) { draft[key] = Math.min(max, Math.max(min, n)); changed(); } });
      box.replaceChildren(h('div', { class: 'inline-fields' }, h('span', { class: 'muted small' }, label), input, h('span', { class: 'muted' }, unit)));
    };
    box.refresh();
    box.fallback = fallback;
    return box;
  };
  const climateExtra = numberExtra('climate', { min: 5, max: 30, step: 0.5, unit: '°C', label: 'Hedef', fallback: 21 });
  const fanExtra = numberExtra('fan', { min: 10, max: 100, step: 10, unit: '%', label: 'Hız', fallback: 60 });
  const [cGet, cSet] = keyed('climate');
  const [fGet, fSet] = keyed('fan');

  const rows = [
    lightRow,
    shown('tv') ? seg('TV', [[null, 'Dokunma'], [true, 'Aç'], [false, 'Kapat']], ...keyed('tv')) : null,
    shown('heater') ? seg('Isıtıcı', [[null, 'Dokunma'], [true, 'Aç'], [false, 'Kapat']], ...keyed('heater')) : null,
    shown('climate') ? seg('Isıtma', [[null, 'Dokunma'], ['off', 'Kapat'], ['set', 'Sıcaklık']],
      () => (typeof draft.climate === 'number' ? 'set' : cGet()), (v) => cSet(v === 'set' ? (typeof draft.climate === 'number' ? draft.climate : 21) : v), climateExtra) : null,
    shown('cover') ? seg('Perdeler', [[null, 'Dokunma'], ['open', 'Aç'], ['close', 'Kapat']], ...keyed('cover')) : null,
    shown('lock') ? seg('Kapı kilidi', [[null, 'Dokunma'], [true, 'Kilitle']], ...keyed('lock')) : null,
    shown('vacuum') ? seg('Robot süpürge', [[null, 'Dokunma'], ['clean', 'Temizliğe başla'], ['dock', 'İstasyona gönder']], ...keyed('vacuum')) : null,
    shown('purifier') ? seg('Hava temizleyici', [[null, 'Dokunma'], ['auto', 'Otomatik'], ['sleep', 'Uyku'], ['max', 'Tam hız'], ['off', 'Kapat']], ...keyed('purifier')) : null,
    shown('fan') ? seg('Vantilatör', [[null, 'Dokunma'], [false, 'Kapat'], ['set', 'Aç']],
      () => (typeof draft.fan === 'number' ? 'set' : fGet()), (v) => fSet(v === 'set' ? (typeof draft.fan === 'number' ? draft.fan : 60) : v), fanExtra) : null,
    shown('kettle') ? seg('Su ısıtıcı', [[null, 'Dokunma'], [true, 'Çalıştır']], ...keyed('kettle')) : null,
  ];

  // ---- saving ----
  const save = h('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Kaydet');
  save.addEventListener('click', async () => {
    const name = draft.name.trim();
    if (!name) { toast('Sahneye bir ad verin', 'error'); nameInput.focus(); return; }
    if (SCENES.some((s) => s.id !== draft.id && s.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) { toast('Bu adda bir sahne zaten var', 'error'); return; }
    const out = { ...draft, name };
    delete out._effect;
    out.text = autoText ? describeScene(out) : draft.text;
    if (out.text === 'Henüz bir şey ayarlanmadı.') { toast('En az bir ayar seçin', 'error'); return; }
    save.disabled = true;
    try {
      await saveScene(out);
      toast(existing ? `${name} kaydedildi` : `${name} eklendi`);
      location.hash = '#/scenes';
    } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); save.disabled = false; }
  });
  const remove = existing ? h('button', { class: 'btn danger', type: 'button' }, icon('trash', 16), 'Sil') : null;
  remove?.addEventListener('click', async () => {
    if (!confirm(`"${existing.name}" sahnesi silinsin mi?${isDefaultScene(existing.id) ? ' Hazır sahneleri Sahneler ekranının altından geri getirebilirsiniz.' : ''}`)) return;
    try { await deleteScene(existing.id); toast(`${existing.name} silindi`); location.hash = '#/scenes'; } catch (e) { toast(`Silinemedi: ${e.message}`, 'error'); }
  });
  const restore = existing && isDefaultScene(existing.id) ? h('button', { class: 'btn ghost', type: 'button' }, icon('refresh', 16), 'Hazır haline döndür') : null;
  restore?.addEventListener('click', async () => {
    try { await saveScene(defaultScene(existing.id)); toast(`${existing.name} hazır haline döndü`); location.hash = '#/scenes'; } catch (e) { toast(`Olmadı: ${e.message}`, 'error'); }
  });

  root.append(
    h('a', { class: 'back-link', href: '#/scenes' }, icon('left', 16), 'Sahneler'),
    h('div', { class: 'editor scene-editor' },
      card({ title: 'Sahne', iconName: draft.icon },
        h('label', { class: 'field' }, h('span', null, 'Ad'), nameInput),
        h('div', { class: 'field' }, h('span', null, 'Simge'), iconRow),
        h('div', { class: 'field' }, h('span', null, 'Renk'), toneRow),
        h('label', { class: 'field' }, h('span', null, 'Açıklama (isteğe bağlı)'), textInput)),
      card({ title: 'Ne yapsın', iconName: 'sparkle' },
        h('p', { class: 'muted small' }, 'Her cihaz türü için seçin. "Dokunma" seçilenler değişmez. Hangi odalarda çalışacağını Sahneler ekranında seçersiniz.'),
        h('div', { class: 'scene-rows' }, rows)),
      card({ title: 'Önizleme (bütün ev)', iconName: 'eye' }, preview)),
    h('div', { class: 'editor-bar' }, save, restore, h('span', { class: 'sep' }), remove));
  paintPreview();
}
