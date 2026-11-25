// Settings › Güncellemeler and Sistem: Home Assistant's own "Updates" page and its restart
// menu, inside Evra.
//
// Updates: every update.* entity Home Assistant has (Home Assistant itself, the operating
// system, the Supervisor, add-ons, device firmware). Each one shows its versions, release
// notes, progress, and can be installed (with a backup first where it supports one) or
// skipped. "Check for updates" asks the Supervisor to look again.
// System: quick reload, restart Home Assistant (also in safe mode), restart or shut down the
// Pi, check the configuration, and what the Pi runs (versions, disk).
// All of it needs an admin account in Home Assistant; for others it says so.

import { store } from '../store.js';
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';

// update.* supported_features (Home Assistant's UpdateEntityFeature)
const F_INSTALL = 1, F_PROGRESS = 4, F_BACKUP = 8, F_NOTES = 16;
const has = (s, f) => ((s?.attributes?.supported_features || 0) & f) === f;

// Home Assistant, its OS and the Supervisor first, then add-ons, then devices.
function rank(s) {
  const id = s.entity_id;
  if (/home_assistant_core/.test(id)) return 0;
  if (/home_assistant_operating_system/.test(id)) return 1;
  if (/home_assistant_supervisor/.test(id)) return 2;
  return store.entities.get(id)?.platform === 'hassio' ? 3 : 4;
}
const titleOf = (s) => s.attributes?.title || s.attributes?.friendly_name || s.entity_id;
const inProgress = (s) => s.attributes?.in_progress === true || typeof s.attributes?.in_progress === 'number';
const percent = (s) => (typeof s.attributes?.update_percentage === 'number' ? s.attributes.update_percentage
  : typeof s.attributes?.in_progress === 'number' ? s.attributes.in_progress : null);

let isAdminCache = null;
async function isHaAdmin() {
  if (isAdminCache != null) return isAdminCache;
  try { isAdminCache = (await store.backend?.currentUser?.())?.is_admin ?? (store.backend?.mode !== 'live'); } catch { isAdminCache = false; }
  return isAdminCache;
}

const NEED_ADMIN = 'Bunun için Evra uygulaması Home Assistant’a yönetici hesabıyla bağlı olmalı (Ayarlar → Bağlantı).';

// ---- updates ----

export function updatesCard(cleanup) {
  const list = h('div', { class: 'upd-list' });
  const summary = h('p', { class: 'muted small' }, 'Yükleniyor…');
  const backupBox = h('input', { type: 'checkbox', checked: true });
  const checkBtn = h('button', { class: 'btn small', type: 'button' }, icon('refresh', 15), 'Güncellemeleri kontrol et');
  const notes = new Map(); // entity_id -> open release notes element (kept across redraws)
  let watching = () => {};

  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    try {
      await store.backend?.refreshUpdates?.(store.all('update').map((s) => s.entity_id));
      toast('Güncellemeler kontrol ediliyor; bulunanlar birazdan burada görünür');
    } catch (e) { toast(`Kontrol edilemedi: ${e.message}`, 'error'); }
    setTimeout(() => { checkBtn.disabled = false; }, 4000);
  });

  const install = async (s, btn) => {
    if (!confirm(`${titleOf(s)} ${s.attributes.latest_version || ''} sürümüne güncellensin mi?${rank(s) <= 2 ? ' Home Assistant güncelleme sırasında birkaç dakika ulaşılamaz olur; Evra kendisi yeniden bağlanır.' : ''}`)) return;
    btn.disabled = true;
    const data = has(s, F_BACKUP) && backupBox.checked ? { backup: true } : {};
    try {
      await store.backend.callService('update', 'install', data, { entity_id: s.entity_id });
      toast(`${titleOf(s)} güncelleniyor`);
    } catch (e) {
      // Home Assistant's own update drops the connection while it restarts; that isn't a failure.
      if (rank(s) <= 2 && /bağlı değil|yanıt vermedi|closed|lost/i.test(e.message)) toast(`${titleOf(s)} güncelleniyor; Home Assistant yeniden başlayınca Evra kendisi bağlanır`);
      else { toast(`${titleOf(s)} güncellenemedi: ${e.message}`, 'error'); btn.disabled = false; }
    }
  };
  const skip = async (s) => {
    try { await store.backend.callService('update', 'skip', {}, { entity_id: s.entity_id }); toast(`${titleOf(s)} ${s.attributes.latest_version} atlandı`); } catch (e) { toast(`Atlanamadı: ${e.message}`, 'error'); }
  };
  const unskip = async (s) => {
    try { await store.backend.callService('update', 'clear_skipped', {}, { entity_id: s.entity_id }); } catch (e) { toast(`Olmadı: ${e.message}`, 'error'); }
  };
  const notesFor = (s) => {
    const body = h('div', { class: 'upd-notes-body' }, 'Yükleniyor…');
    const d = h('details', { class: 'upd-notes' }, h('summary', null, 'Sürüm notları'), body);
    let loaded = false;
    d.addEventListener('toggle', async () => {
      if (!d.open || loaded) return;
      loaded = true;
      let text = '';
      if (has(s, F_NOTES)) { try { text = await store.backend.releaseNotes(s.entity_id); } catch { text = ''; } }
      if (!text && s.attributes.release_summary) text = s.attributes.release_summary;
      body.replaceChildren(
        text ? h('pre', { class: 'upd-notes-text' }, String(text).slice(0, 4000)) : h('p', { class: 'muted small' }, 'Bu güncelleme için not yok.'),
        s.attributes.release_url ? h('a', { class: 'link small', href: s.attributes.release_url, target: '_blank', rel: 'noopener' }, 'Bütün notlar', icon('external', 13)) : null);
    });
    return d;
  };

  const row = (s) => {
    const busy = inProgress(s);
    const pct = percent(s);
    const installBtn = h('button', { class: 'btn small primary', type: 'button', disabled: busy || !has(s, F_INSTALL) }, busy ? 'Güncelleniyor…' : 'Güncelle');
    installBtn.addEventListener('click', () => install(s, installBtn));
    const skipBtn = h('button', { class: 'btn small ghost', type: 'button', hidden: busy }, 'Atla');
    skipBtn.addEventListener('click', () => skip(s));
    if (!notes.has(s.entity_id)) notes.set(s.entity_id, notesFor(s));
    return h('div', { class: 'upd-item' },
      h('div', { class: 'upd-head' },
        h('div', { class: 'upd-name' }, h('strong', null, titleOf(s)),
          h('small', { class: 'muted' }, `${s.attributes.installed_version || '?'} → ${s.attributes.latest_version || '?'}`)),
        h('div', { class: 'btn-row' }, installBtn, has(s, F_INSTALL) ? skipBtn : null)),
      busy ? h('div', { class: 'upd-progress' }, h('span', { style: `width:${pct ?? 30}%`, class: pct == null ? 'indeterminate' : '' })) : null,
      !has(s, F_INSTALL) ? h('p', { class: 'muted small' }, 'Bu güncelleme buradan kurulamıyor; cihazın kendi uygulamasından yapılır.') : null,
      notes.get(s.entity_id));
  };

  const draw = () => {
    const all = store.all('update').sort((a, b) => rank(a) - rank(b) || titleOf(a).localeCompare(titleOf(b), 'tr'));
    const avail = all.filter((s) => s.state === 'on' || inProgress(s));
    const skipped = all.filter((s) => s.state === 'off' && s.attributes?.skipped_version);
    const current = all.filter((s) => s.state === 'off' && !s.attributes?.skipped_version);
    summary.textContent = !all.length ? 'Home Assistant henüz güncelleme bilgisi vermedi.'
      : avail.length ? `${avail.length} güncelleme var.` : 'Her şey güncel.';
    list.replaceChildren(
      ...avail.map(row),
      skipped.length ? h('details', { class: 'upd-more' }, h('summary', null, `Atlanan güncellemeler (${skipped.length})`),
        ...skipped.map((s) => {
          const b = h('button', { class: 'btn small ghost', type: 'button' }, 'Geri al');
          b.addEventListener('click', () => unskip(s));
          return h('div', { class: 'upd-line' }, h('span', null, `${titleOf(s)} ${s.attributes.skipped_version}`), b);
        })) : null,
      current.length ? h('details', { class: 'upd-more' }, h('summary', null, `Güncel olanlar (${current.length})`),
        ...current.map((s) => h('div', { class: 'upd-line' }, h('span', null, titleOf(s)), h('small', { class: 'muted' }, s.attributes.installed_version || '')))) : null);
    // Follow these entities (progress, a new version); a new update entity shows on the next check.
    watching();
    const ids = all.map((s) => s.entity_id);
    watching = ids.length ? store.watch(ids, () => queueMicrotask(redrawSoon)) : () => {};
  };
  let pending = false;
  const redrawSoon = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; draw(); }, 300); };
  const timer = setInterval(draw, 30000);
  cleanup.push(() => { clearInterval(timer); watching(); });

  const body = h('div', { class: 'upd-body' });
  isHaAdmin().then((ok) => {
    if (!ok) { body.replaceChildren(h('p', { class: 'muted small' }, NEED_ADMIN)); return; }
    draw();
    body.replaceChildren(summary,
      h('label', { class: 'check-field' }, backupBox, h('span', null, 'Güncellemeden önce yedek al (destekleyen güncellemelerde)')),
      list, h('div', { class: 'btn-row' }, checkBtn));
  });
  return card({ title: 'Güncellemeler', iconName: 'refresh', className: 'updates-card' }, body);
}

// ---- system ----

export function systemCard() {
  const info = h('div', { class: 'sys-info muted small' });
  const result = h('p', { class: 'muted small', hidden: true, role: 'status' });
  const b = () => store.backend;
  const say = (text) => { result.hidden = false; result.textContent = text; };
  const away = 'Evra bağlantıyı kaybedecek ve Home Assistant açılınca kendisi yeniden bağlanacak (1–3 dakika).';

  const action = (label, iconName, hint, run, { danger = false, ask = null } = {}) => {
    const btn = h('button', { class: `btn small${danger ? ' danger' : ''}`, type: 'button' }, icon(iconName, 15), SHORT[label] || label);
    btn.addEventListener('click', async () => {
      if (ask && !confirm(ask)) return;
      btn.disabled = true;
      try { await run(); } catch (e) {
        // Restarting drops the connection on purpose.
        if (/bağlı değil|yanıt vermedi|closed|lost/i.test(e.message)) say(away);
        else toast(`${label}: ${e.message}`, 'error');
      }
      setTimeout(() => { btn.disabled = false; }, 5000);
    });
    return h('div', { class: 'sys-row' }, h('div', { class: 'setting-text' }, h('strong', null, label), h('small', null, hint)), btn);
  };

  // The buttons say it short; the title next to them says it in full.
  const SHORT = {
    'Yapılandırmayı kontrol et': 'Kontrol et', 'Hızlı yeniden yükle': 'Yeniden yükle',
    'Home Assistant’ı yeniden başlat': 'Yeniden başlat', 'Güvenli modda yeniden başlat': 'Güvenli mod',
    'Pi’yi yeniden başlat': 'Yeniden başlat', 'Pi’yi kapat': 'Kapat',
  };
  const rows = [
    action('Yapılandırmayı kontrol et', 'check', 'Yeniden başlatmadan önce Home Assistant ayarlarında hata var mı bakar.', async () => {
      say('Kontrol ediliyor…');
      const r = await b().checkConfig();
      say(r?.result === 'valid' ? 'Yapılandırma geçerli; güvenle yeniden başlatabilirsiniz.' : `Yapılandırmada hata var: ${String(r?.errors || r?.result || '').slice(0, 400)}`);
    }),
    action('Hızlı yeniden yükle', 'refresh', 'Otomasyonları, sahneleri ve YAML ayarlarını yeniden yükler; Home Assistant kapanmaz.', async () => {
      await b().callService('homeassistant', 'reload_all', {}, {});
      say('Ayarlar yeniden yüklendi.');
    }),
    action('Home Assistant’ı yeniden başlat', 'power', 'Takılan bir entegrasyon ya da yeni bir ayar için. Pi kapanmaz.', async () => {
      say(away);
      await b().callService('homeassistant', 'restart', {}, {});
    }, { ask: 'Home Assistant yeniden başlatılsın mı? 1–3 dakika kontrol edilemez.' }),
    action('Güvenli modda yeniden başlat', 'shield', 'Bir eklenti ya da özel entegrasyon sorun çıkarıyorsa: Home Assistant yalnızca kendi parçalarıyla açılır.', async () => {
      say(away);
      await b().callService('homeassistant', 'restart', { safe_mode: true }, {});
    }, { ask: 'Home Assistant güvenli modda yeniden başlatılsın mı? Özel entegrasyonlar bir sonraki normal yeniden başlatmaya kadar çalışmaz.' }),
    action('Pi’yi yeniden başlat', 'power', 'Bütün sistemi (Pi’yi) kapatıp açar. Takılmalarda ve sistem güncellemelerinden sonra.', async () => {
      say(away);
      await b().callService('hassio', 'host_reboot', {}, {});
    }, { danger: true, ask: 'Pi yeniden başlatılsın mı? Ev 2–5 dakika kontrol edilemez; otomasyonlar o sırada çalışmaz.' }),
    action('Pi’yi kapat', 'power', 'Pi tamamen kapanır. Yeniden açmak için fişini çekip takmak gerekir; uzaktan açılamaz.', async () => {
      say('Pi kapanıyor. Yeniden açmak için fişini çekip geri takın.');
      await b().callService('hassio', 'host_shutdown', {}, {});
    }, { danger: true, ask: 'Pi KAPATILSIN mı? Uzaktan geri açılamaz; biri fişini çekip takana kadar ev çevrimdışı kalır.' }),
  ];

  const body = h('div', { class: 'sys-body' });
  isHaAdmin().then(async (ok) => {
    if (!ok) { body.replaceChildren(h('p', { class: 'muted small' }, NEED_ADMIN)); return; }
    body.replaceChildren(info, ...rows, result);
    try {
      const s = await b().systemInfo?.();
      if (!s) return;
      const gb = (n) => (typeof n === 'number' ? `${n.toFixed(1)} GB` : '?');
      const parts = [
        s.core && `Home Assistant ${s.core}`,
        s.os && `İşletim sistemi ${s.os}`,
        s.board && `Cihaz: ${s.board}`,
        s.disk_total && `Disk: ${gb(s.disk_used)} / ${gb(s.disk_total)} dolu${s.disk_total && s.disk_used / s.disk_total > 0.85 ? ' (doluluk yüksek)' : ''}`,
      ].filter(Boolean);
      info.textContent = parts.join(' · ');
    } catch { /* no Supervisor (not Home Assistant OS): only the buttons */ }
  });
  return card({ title: 'Sistem', iconName: 'cpu' }, body);
}
