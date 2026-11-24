import { store, deviceName } from '../store.js';
import { h, relTime, isAvailable, toast } from '../util.js';
import { icon } from '../icons.js';
import { toggle } from '../components.js';
import { renderAutomationEditor } from './automation-editor.js';
import { CAPS, CATEGORIES, CATEGORY_LABEL, ideasForHome, buildIdea } from '../ideas.js';
import { takeTemplate } from '../assistant-actions.js';

export function renderAutomations(root, cleanup, ctx) {
  const [first, second] = ctx.params;
  // Prepared by the assistant ("Review in editor").
  if (ctx.query.get('template') === 'assistant') {
    const template = takeTemplate();
    if (!template) toast('Bu taslak artık yok.', 'error');
    return renderAutomationEditor(root, cleanup, first === 'edit' && second ? decodeURIComponent(second) : null, template);
  }
  if (first === 'new') {
    const ideaId = ctx.query.get('idea');
    if (!ideaId) return renderAutomationEditor(root, cleanup, null);
    // An idea is built from the home's devices, so wait for them on a fresh load.
    let started = false;
    const start = () => {
      if (started || !store.devices.size) return;
      started = true;
      const template = buildIdea(ideaId);
      if (!template) toast('Bu fikir, evde henüz olmayan cihazlar gerektiriyor.', 'error');
      renderAutomationEditor(root, cleanup, null, template);
    };
    cleanup.push(store.onRegistry(start));
    start();
    return;
  }
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
        h('p', null, store.status.state === 'connected' ? 'Henüz otomasyon yok.' : 'Uygulama bağlanınca otomasyonlar görünür.'),
        h('a', { class: 'btn primary', href: '#/automations/new' }, icon('plus', 16), 'Yeni otomasyon')));
      return;
    }
    list.replaceChildren(...autos.map((a) => row(a.entity_id)));
  };

  function iconFor(label) {
    const l = label.toLocaleLowerCase('tr-TR');
    if (/süpür|vacuum/.test(l)) return 'vacuum';
    if (/mama|feed/.test(l)) return 'paw';
    if (/kum kabı|litter/.test(l)) return 'litter';
    if (/su ısıtıcı|kettle|su hazır/.test(l)) return 'kettle';
    if (/vantilatör|\bfan\b/.test(l)) return 'fan';
    if (/temizleyici|purifier/.test(l)) return 'air';
    if (/pencere|kapı/.test(l)) return 'window';
    if (/hareket|varlık/.test(l)) return 'person';
    if (/ısıt|kombi|radyatör/.test(l)) return 'heater';
    if (/ışık|lamba/.test(l)) return 'bulb';
    if (/duman|gaz|kaçak/.test(l)) return 'alert';
    return /window|door/.test(l) ? 'window' : /presence|motion|kapkan/.test(l) ? 'person' : /heater|heat/.test(l) ? 'heater'
      : /\btv\b/.test(l) ? 'tv' : /light|led|lamp/.test(l) ? 'bulb' : /smoke|gas|leak|water|alarm/.test(l) ? 'alert' : 'robot';
  }

  function row(entityId) {
    const s0 = store.get(entityId);
    const name = h('h3', null, '–');
    const desc = h('p', { class: 'auto-desc' });
    const meta = h('p', { class: 'auto-meta' });
    const sw = toggle('Otomasyon açık ya da kapalı', (on) => store.call('automation', on ? 'turn_on' : 'turn_off', entityId));
    const run = h('button', { class: 'btn ghost', type: 'button' }, icon('play', 14), 'Şimdi çalıştır');
    run.addEventListener('click', async () => {
      const s = store.get(entityId);
      if (!confirm(`"${s?.attributes?.friendly_name}" şimdi çalıştırılsın mı? Otomasyonun yaptığı her şeyi yapar, kumanda kodlarını göndermek dahil.`)) return;
      try { await store.call('automation', 'trigger', entityId, { skip_condition: true }); toast('Otomasyon çalıştırıldı'); } catch { /* toast shown */ }
    });
    const configId = s0?.attributes?.id;
    const edit = configId ? h('a', { class: 'btn ghost', href: `#/automations/edit/${encodeURIComponent(configId)}` }, icon('edit', 14), 'Düzenle') : null;
    const del = configId ? h('button', { class: 'btn ghost danger-text', type: 'button' }, icon('trash', 14), 'Sil') : null;
    del?.addEventListener('click', async () => {
      const label = store.get(entityId)?.attributes?.friendly_name || 'bu otomasyon';
      if (!confirm(`"${label}" silinsin mi? Bu geri alınamaz.`)) return;
      try { await store.backend.deleteAutomation(configId); toast('Otomasyon silindi'); } catch (e) { toast(`Silinemedi: ${e.message}`, 'error'); }
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
      meta.textContent = `${s.attributes.current ? 'Şu an çalışıyor' : s.state === 'on' ? 'Açık' : 'Kapalı'} · son çalışma ${relTime(s.attributes.last_triggered)}`;
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
  const poll = setInterval(() => { if (!document.hidden) draw(); }, 1500);
  cleanup.push(() => clearInterval(poll));

  // ---- tabs: your automations, and ideas for the home's devices ----
  let tab = ctx.query.get('tab') === 'ideas' ? 'ideas' : 'mine';
  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const mine = h('div', { class: 'auto-mine' },
    h('p', { class: 'muted intro' }, 'Otomasyonlar merkezde çalışır; uygulama kapalıyken de çalışmaya devam eder.'), list);
  const ideas = h('div', { class: 'ideas' });
  const drawTabs = () => {
    const ready = ideasForHome().filter((i) => i.ready).length;
    tabs.replaceChildren(...[['mine', 'Otomasyonlarım', null], ['ideas', 'Fikirler', ready]].map(([id, label, count]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'active' : '',
      onclick: () => { tab = id; history.replaceState(null, '', id === 'ideas' ? '#/automations?tab=ideas' : '#/automations'); drawTabs(); show(); },
    }, label, count ? h('span', { class: 'tab-count' }, String(count)) : null)));
  };
  const show = () => {
    mine.hidden = tab !== 'mine';
    ideas.hidden = tab !== 'ideas';
    if (tab === 'ideas') drawIdeas(ideas);
  };
  // Ideas change when devices are added or removed.
  let regSig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.keys()].join('|');
    if (next === regSig) return;
    regSig = next;
    drawTabs();
    show();
  }));

  root.append(
    h('div', { class: 'toolbar' }, tabs, h('a', { class: 'btn primary', href: '#/automations/new', 'aria-label': 'Yeni otomasyon' }, icon('plus', 16),
      h('span', { class: 'wide-text' }, 'Yeni otomasyon'), h('span', { class: 'narrow-text' }, 'Yeni'))),
    mine,
    ideas,
  );
  drawTabs();
  show();
}

// ---- ideas ----------------------------------------------------------------------

const CATEGORY_TONE = {
  Lighting: 'var(--accent)', Comfort: 'var(--warm)', Entertainment: 'var(--cool)', Energy: 'var(--ok)',
  Safety: 'var(--danger)', Security: 'var(--violet)', Garden: 'var(--ok)', Appliances: 'var(--cool)', Pets: 'var(--warm)',
};

function drawIdeas(el) {
  const all = ideasForHome();
  const byCat = (a, b) => CATEGORIES.indexOf(a.idea.category) - CATEGORIES.indexOf(b.idea.category);
  const ready = all.filter((i) => i.ready).sort(byCat);
  const later = all.filter((i) => !i.ready).sort((a, b) => a.missing.length - b.missing.length || byCat(a, b));
  el.replaceChildren(
    h('p', { class: 'muted intro' }, 'Cihazlarınızın birlikte neler yapabileceğine dair fikirler. Hazır olanlar düzenleyicide doldurulmuş açılır; kaydetmeden önce her şeyi değiştirebilirsiniz.'),
    h('section', { class: 'idea-group' },
      h('h3', { class: 'group-title' }, 'Kurulmaya hazır', h('span', { class: 'muted' }, ` · ${ready.length}`)),
      ready.length ? h('div', { class: 'idea-grid' }, ready.map(ideaCard)) : h('p', { class: 'muted pad' }, 'Fikir görmek için bir cihaz ekleyin.')),
    later.length ? h('section', { class: 'idea-group' },
      h('h3', { class: 'group-title' }, 'Başka cihaz gerekiyor', h('span', { class: 'muted' }, ` · ${later.length}`)),
      h('p', { class: 'muted small' }, 'Bunlar henüz sizde olmayan Evra ürünleri gerektiriyor. Kesik çizgili etiketler eksik olanı gösterir; ürünü görmek için birine dokunun.'),
      h('div', { class: 'idea-grid' }, later.map(ideaCard))) : null,
  );
}

function capChip(cap, device, missing = false, optional = false) {
  const c = CAPS[cap];
  if (!c) return null;
  const label = device ? deviceName(device) : c.name;
  if (missing) {
    const why = optional ? `İsteğe bağlı: ${c.name}` : `Gerekli: ${c.name.toLocaleLowerCase('tr-TR')}`;
    return h('a', { class: `idea-chip missing${optional ? ' optional' : ''}`, href: `#/devices/add/${c.products[0]}`, title: `${why}. Katalogda görmek için dokunun.`, 'aria-label': `${why}. Katalogda görün.` },
      icon(c.icon, 14), label, optional ? h('span', { class: 'chip-note' }, 'isteğe bağlı') : icon('plus', 12));
  }
  return h('span', { class: 'idea-chip', title: c.name }, icon(c.icon, 14), label);
}

function ideaCard({ idea, ready, missing, uses, optionalMissing }) {
  const usedCaps = new Set();
  const used = uses.filter((u) => {
    // One chip per device, even if it does two jobs (motion and presence...).
    const key = u.device?.id || u.cap;
    if (usedCaps.has(key)) return false;
    usedCaps.add(key);
    return true;
  });
  return h('article', { class: `idea${ready ? '' : ' unavailable'}`, style: { '--tone': CATEGORY_TONE[idea.category] || 'var(--accent)' } },
    h('div', { class: 'idea-top' },
      h('span', { class: 'idea-icon' }, icon(idea.icon, 20)),
      h('div', { class: 'idea-titles' }, h('h4', null, idea.title), h('span', { class: 'idea-cat' }, CATEGORY_LABEL[idea.category] || idea.category)),
      ready ? null : h('span', { class: 'idea-lock', title: 'Başka cihaz gerekiyor' }, icon('lock', 14))),
    h('p', { class: 'idea-text' }, idea.text),
    h('div', { class: 'idea-chips' },
      used.map((u) => capChip(u.cap, u.device)),
      missing.map((c) => capChip(c, null, true)),
      ready ? optionalMissing.map((c) => capChip(c, null, true, true)) : null),
    ready ? h('a', { class: 'btn primary small', href: `#/automations/new?idea=${idea.id}` }, icon('sparkle', 14), 'Kur') : null);
}
