// Adding a remote (#/remotes/new): the kind of device, the IR module that will send its
// signals, the brand, then a code set from the IR code database (IRDB). Each set can be
// tried with its power key before it's chosen; all of the set's keys come with it.

import { h, toast, saveSettings, fold } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { whenConnected } from '../appdata.js';
import { REMOTE_TYPES, remoteType, irModules, irdbIndex, irdbCodes, buildButtons, buttonCode, sendCode } from '../ir.js';
import { saveRemote } from '../remote-list.js';

export function renderRemoteNew(root, cleanup) {
  let alive = true;
  cleanup.push(() => { alive = false; });
  const st = { type: null, module: null, brand: null, set: null, buttons: null, modules: [] };

  const typeBox = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Cihaz türü' });
  const moduleBox = h('div', { class: 'stack' });
  const brandBox = h('div', { class: 'stack' });
  const setBox = h('div', { class: 'stack' });
  const nameBox = h('div', { class: 'stack' });
  const sections = {
    module: card({ title: '2. Hangi IR modülünden gönderilsin?', iconName: 'remote' }, moduleBox),
    brand: card({ title: '3. Marka', iconName: 'search' }, brandBox),
    set: card({ title: '4. Kod seti', iconName: 'sparkle' }, setBox),
    name: card({ title: '5. Adı ve kaydet', iconName: 'check' }, nameBox),
  };
  const show = (key, on) => { sections[key].hidden = !on; };

  // ---- 1. the kind of device ----
  const paintTypes = () => typeBox.replaceChildren(...REMOTE_TYPES.map((t) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(st.type === t.id), class: `room-chip${st.type === t.id ? ' active' : ''}`,
    onclick: () => { st.type = t.id; st.brand = null; st.set = null; paintTypes(); paintModules(); paintBrands(); },
  }, icon(t.icon, 16), t.name)));

  // ---- 2. the IR module ----
  function paintModules() {
    show('module', !!st.type);
    if (!st.type) return;
    const usable = st.modules.filter((m) => m.service);
    if (!st.modules.length) {
      moduleBox.replaceChildren(h('p', { class: 'muted' }, 'Evde henüz bir IR modülü yok. Kumandalar sinyali bir IR modülünden gönderir.'),
        h('a', { class: 'btn primary small', href: '#/devices/add/ir-remote' }, icon('plus', 14), 'IR modülü ekle'));
      return;
    }
    if (!st.module && usable.length === 1) st.module = usable[0].id;
    moduleBox.replaceChildren(
      h('div', { class: 'list' }, st.modules.map((m) => h('label', { class: `list-row choice${m.service ? '' : ' disabled'}` },
        h('input', { type: 'radio', name: 'ir-module', value: m.id, checked: st.module === m.id, disabled: !m.service, onchange: () => { st.module = m.id; paintSets(); } }),
        h('span', { class: 'row-text' }, h('strong', null, m.name), h('small', null, m.service ? (m.room || 'Odasız') : 'Yazılımı güncellenmeli: her kodu gönderemiyor'))))),
      usable.length ? h('p', { class: 'muted small' }, 'Modülü, kumandanın cihazını görebileceği odadakinden seçin.')
        : h('p', { class: 'hint warn' }, icon('alert', 16), 'Hiçbir IR modülü her kodu gönderemiyor. ESPHome\'da modüle Evra\'nın send_raw eylemini ekleyip yeniden yükleyin (ir-module-esphome.yaml).'));
  }

  // ---- 3. the brand ----
  let index = null;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Marka ara (LG, Samsung, Sony…)', 'aria-label': 'Marka ara' });
  const brandList = h('div', { class: 'chips brand-list' });
  search.addEventListener('input', () => paintBrandList());
  const sets = () => (index || []).filter((x) => remoteType(st.type).folders.test(x.folder));
  function paintBrandList() {
    const q = fold(search.value.trim());
    const brands = [...new Set(sets().map((x) => x.brand))].sort((a, b) => a.localeCompare(b, 'tr'));
    const shown = brands.filter((b) => !q || fold(b).includes(q));
    brandList.replaceChildren(...(shown.length ? shown.slice(0, 120).map((b) => h('button', {
      type: 'button', class: `room-chip small${st.brand === b ? ' active' : ''}`,
      onclick: () => { st.brand = b; st.set = null; paintBrandList(); paintSets(); },
    }, b)) : [h('p', { class: 'muted small' }, q ? `"${search.value}" bulunamadı. "Diğer" türünde aramayı deneyin.` : 'Bu türde marka yok.')]));
  }
  async function paintBrands() {
    show('brand', !!st.type);
    show('set', false);
    show('name', false);
    if (!st.type) return;
    if (!index) {
      brandBox.replaceChildren(h('p', { class: 'muted small' }, 'Kod veritabanı yükleniyor…'));
      try { index = await irdbIndex(); } catch (e) {
        brandBox.replaceChildren(h('p', { class: 'error-line' }, `Kod veritabanına ulaşılamadı: ${e.message}. İnternet bağlantınızı kontrol edin.`),
          h('button', { class: 'btn small', type: 'button', onclick: paintBrands }, icon('refresh', 14), 'Tekrar dene'));
        return;
      }
      if (!alive) return;
    }
    brandBox.replaceChildren(search, brandList,
      st.type === 'ac' ? h('p', { class: 'muted small' }, 'Klimaların çoğu her tuşta bütün ayarları birlikte gönderir; veritabanındaki klima kodları birkaç markayla sınırlı.') : null);
    paintBrandList();
  }

  // ---- 4. the code set ----
  async function paintSets() {
    show('set', !!st.brand);
    show('name', !!st.set);
    if (!st.brand) return;
    const files = sets().filter((x) => x.brand === st.brand);
    const module = st.modules.find((m) => m.id === st.module);
    setBox.replaceChildren(
      h('p', { class: 'muted small' }, files.length > 1
        ? 'Bu markanın birden fazla kod seti var. Cihazınızı açıp "Güç\'ü dene"ye basın; tepki veren seti seçin.'
        : 'Cihazınızı açıp "Güç\'ü dene"ye basarak kodların çalıştığını görebilirsiniz.'),
      h('div', { class: 'list' }, files.map((f) => {
        const info = h('small', null, `${f.folder} · ${f.file.replace('.csv', '')} · yükleniyor…`);
        const test = h('button', { class: 'btn small', type: 'button', disabled: true }, icon('power', 14), 'Güç\'ü dene');
        const use = h('button', { class: `btn small ${st.set === f.path ? 'primary' : 'ghost'}`, type: 'button', disabled: true }, st.set === f.path ? 'Seçildi' : 'Bunu kullan');
        let built = null;
        irdbCodes(f.path).then((rows) => {
          built = buildButtons(rows);
          const power = built.buttons.find((b) => b.k === 'power') || built.buttons.find((b) => b.k === 'power_on');
          info.textContent = `${f.folder} · set ${f.file.replace('.csv', '')} · ${built.buttons.length} tuş${built.skipped ? ` · ${built.skipped} desteklenmeyen kod` : ''}`;
          use.disabled = !built.buttons.length;
          test.disabled = !power || !module?.service;
          if (!module?.service) test.title = 'Önce her kodu gönderebilen bir IR modülü seçin';
          test.onclick = async () => {
            try { await sendCode(module, buttonCode(power)); toast('Güç kodu gönderildi. Cihaz tepki verdi mi?'); } catch { /* toast already shown */ }
          };
        }).catch((e) => { info.textContent = `Kodlar alınamadı: ${e.message}`; });
        use.addEventListener('click', () => {
          if (!built) return;
          st.set = f.path;
          st.buttons = built.buttons;
          paintSets();
          paintName();
        });
        return h('div', { class: 'list-row static set-row' },
          h('span', { class: 'row-icon' }, icon(remoteType(st.type).icon, 20)),
          h('span', { class: 'row-text' }, h('strong', null, `${st.brand} ${remoteType(st.type).name}`), info),
          test, use);
      })));
  }

  // ---- 5. name and save ----
  function paintName() {
    show('name', !!st.set);
    if (!st.set) return;
    const t = remoteType(st.type);
    const name = h('input', { class: 'input', value: `${st.brand} ${t.name}`, maxlength: 30, 'aria-label': 'Kumanda adı' });
    const save = h('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Kumandayı kaydet');
    save.addEventListener('click', async () => {
      const n = name.value.trim();
      if (!n) { toast('Kumandaya bir ad verin', 'error'); return; }
      if (!st.module) { toast('Bir IR modülü seçin', 'error'); return; }
      const remote = { id: `r-${Date.now().toString(36)}`, kind: 'codes', name: n, type: st.type, brand: st.brand, set: st.set, module: st.module, buttons: st.buttons };
      save.disabled = true;
      try {
        await saveRemote(remote);
        saveSettings({ remote: remote.id });
        toast(`${n} eklendi`);
        location.hash = '#/remotes';
      } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); save.disabled = false; }
    });
    const keys = st.buttons.filter((b) => b.k !== 'x').length;
    nameBox.replaceChildren(
      h('p', { class: 'muted small' }, `${st.buttons.length} tuş gelecek: ${keys} tanesi yerinde (güç, ses, kanal, yön tuşları…), ${st.buttons.length - keys} tanesi "Diğer tuşlar" altında.`),
      h('label', { class: 'field' }, h('span', null, 'Ad'), name),
      h('div', { class: 'btn-row' }, save));
  }

  root.append(
    h('a', { class: 'back-link', href: '#/remotes' }, icon('left', 16), 'Kumandalar'),
    h('div', { class: 'editor remote-new' },
      card({ title: '1. Ne için?', iconName: 'remote' }, typeBox),
      sections.module, sections.brand, sections.set, sections.name,
      h('p', { class: 'muted small' }, 'Kodlar açık IR kod veritabanından (IRDB, github.com/probonopd/irdb) alınır; yalnızca seçtiğiniz markanın dosyası indirilir.')));
  Object.keys(sections).forEach((k) => show(k, false));
  paintTypes();
  whenConnected().then(() => irModules()).then((m) => { if (!alive) return; st.modules = m; paintModules(); });
}
