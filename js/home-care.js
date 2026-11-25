// Looking after the home by itself, in Settings:
//   - Smart alerts: Home Assistant automations that tell the household about things on
//     their own (a door or window left open, batteries running out, a morning summary).
//     They run on the Pi, so they work while the app is closed, and arrive on the phones
//     with Evra notifications on (js/push.js) and in Home Assistant's notifications.
//   - Automatic backups: Home Assistant's own weekly backup, kept on the Pi (Güvence and
//     Premium plans). Needs Home Assistant 2025.1 or newer.
// Nothing here goes through the assistant; it's plain Home Assistant.

import { store } from './store.js';
import { h, toast } from './util.js';
import { icon } from './icons.js';
import { card, toggle } from './components.js';
import { pushEntities } from './push.js';
import { member, plansUrl } from './account.js';

// ---- smart alerts ----

const OPENINGS = ['door', 'window', 'opening', 'garage_door'];
const LOW = "{% set ns = namespace(l=[]) %}{% for s in states.sensor if s.attributes.device_class == 'battery' and s.state | is_number and s.state | float(100) < 20 %}{% set ns.l = ns.l + [s.name ~ ' %' ~ (s.state | float | round(0) | int)] %}{% endfor %}";
const WEATHER_TR = "{% set tr = {'sunny':'güneşli','clear-night':'açık','cloudy':'bulutlu','partlycloudy':'parçalı bulutlu','rainy':'yağmurlu','snowy':'karlı','snowy-rainy':'karla karışık yağmurlu','fog':'sisli','windy':'rüzgârlı','windy-variant':'rüzgârlı','pouring':'sağanak yağışlı','lightning':'şimşekli','lightning-rainy':'gök gürültülü','hail':'dolu yağışlı'} %}";

// Each alert's message goes to the phones with Evra notifications and to Home Assistant's own list.
function tell(title, message) {
  const phones = pushEntities();
  return [
    ...(phones.length ? [{ action: 'notify.send_message', target: { entity_id: phones }, data: { title, message }, continue_on_error: true }] : []),
    { action: 'persistent_notification.create', data: { title, message } },
  ];
}

// One main entity per device that has its own connection (not Zigbee: reloading Zigbee would
// restart every Zigbee device), to reload that connection when the device drops off.
function reconnectTargets() {
  const out = [];
  for (const d of store.devices.values()) {
    if (d.disabled_by || d.entry_type === 'service' || !(d.config_entries || []).length) continue;
    if ((d.identifiers || []).some((i) => i[0] === 'zha')) continue;
    const e = [...store.entities.values()].find((x) => x.device_id === d.id && !x.entity_category && !x.disabled_by && !x.hidden_by);
    if (e) out.push(e.entity_id);
  }
  return out;
}

const ALERTS = [
  {
    id: 'evra_auto_reconnect', title: 'Kopan cihazları yeniden bağla',
    hint: 'Bir cihaz 10 dakika ulaşılamaz kalırsa (gece modem yeniden başlayınca kopan ampuller gibi) sistem onu kendiliğinden yeniden bağlar; olmazsa size haber verir. Yeni cihaz ekledikten sonra bunu bir kez kapatıp açın.',
    config() {
      const ids = reconnectTargets();
      if (!ids.length) throw new Error('Yeniden bağlanabilecek cihaz yok');
      return {
        alias: 'Evra: kopan cihazları yeniden bağla', description: 'Evra uygulaması kurdu (Ayarlar → Akıllı uyarılar).', mode: 'queued', max: 25,
        triggers: [{ trigger: 'state', entity_id: ids, to: 'unavailable', for: { minutes: 10 } }],
        actions: [
          { action: 'homeassistant.reload_config_entry', target: { entity_id: '{{ trigger.entity_id }}' }, continue_on_error: true },
          { delay: { minutes: 3 } },
          {
            if: [{ condition: 'template', value_template: "{{ is_state(trigger.entity_id, 'unavailable') }}" }],
            then: tell('Cihaz bağlanamadı', '{{ trigger.to_state.name }} 13 dakikadır ulaşılamıyor; yeniden bağlamayı denedim ama gelmedi. Elektriğini kontrol edin ya da uygulamada cihazın sayfasından sorun gidermeye bakın.'),
          },
        ],
      };
    },
  },
  {
    id: 'evra_alert_open', title: 'Açık kalan kapı ve pencereler', hint: 'Bir kapı ya da pencere 1 saatten uzun açık kalınca haber verir.',
    config() {
      const ids = store.all('binary_sensor').filter((s) => OPENINGS.includes(s.attributes?.device_class)).map((s) => s.entity_id);
      if (!ids.length) throw new Error('Evde kapı ya da pencere sensörü yok');
      return {
        alias: 'EvrAI uyarısı: açık kalan kapı ve pencereler', description: 'Evra uygulaması kurdu (Ayarlar → Akıllı uyarılar).', mode: 'parallel',
        triggers: [{ trigger: 'state', entity_id: ids, to: 'on', for: { hours: 1 } }],
        actions: tell('Açık kaldı', '{{ trigger.to_state.name }} 1 saattir açık.'),
      };
    },
  },
  {
    id: 'evra_alert_battery', title: 'Biten piller', hint: 'Pili %20\'nin altına düşen sensörleri her sabah 10:00\'da söyler.',
    config: () => ({
      alias: 'EvrAI uyarısı: biten piller', description: 'Evra uygulaması kurdu (Ayarlar → Akıllı uyarılar).', mode: 'single',
      triggers: [{ trigger: 'time', at: '10:00:00' }],
      conditions: [{ condition: 'template', value_template: `${LOW}{{ ns.l | count > 0 }}` }],
      actions: tell('Pil değiştirme zamanı', `Pili azalan sensörler: ${LOW}{{ ns.l | join(', ') }}`),
    }),
  },
  {
    id: 'evra_alert_morning', title: 'Sabah özeti', hint: 'Her sabah 08:00\'de: hava, açık kapı ve pencereler, yanık kalan ışıklar.',
    config: () => ({
      alias: 'EvrAI: sabah özeti', description: 'Evra uygulaması kurdu (Ayarlar → Akıllı uyarılar).', mode: 'single',
      triggers: [{ trigger: 'time', at: '08:00:00' }],
      actions: tell('Günaydın', `${WEATHER_TR}{% set w = states.weather | list | first %}{% if w %}Dışarısı {{ w.attributes.temperature | round(0) }}°, {{ tr.get(w.state, w.state) }}. {% endif %}`
        + "{% set open = states.binary_sensor | selectattr('state', 'eq', 'on') | selectattr('attributes.device_class', 'in', ['door', 'window', 'opening', 'garage_door']) | map(attribute='name') | list %}"
        + "{% if open %}Açık: {{ open | join(', ') }}. {% else %}Kapı ve pencereler kapalı. {% endif %}"
        + "{% set on = states.light | selectattr('state', 'eq', 'on') | list | count %}{% if on %}{{ on }} ışık yanık.{% endif %}"),
    }),
  },
];

export function alertsCard() {
  const rows = ALERTS.map((a) => {
    const sw = toggle(a.title, async (on) => {
      const b = store.backend;
      try {
        if (!b) throw new Error('Uygulama eve bağlı değil');
        if (on) { await b.saveAutomation(a.id, a.config()); toast(`${a.title}: açıldı`); }
        else { await b.deleteAutomation(a.id); toast(`${a.title}: kapatıldı`); }
      } catch (e) {
        toast(`${a.title}: ${e.message}`, 'error');
      }
      refresh();
    });
    return { a, sw, row: h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', null, a.title), h('small', null, a.hint)), sw) };
  });
  async function refresh() {
    for (const r of rows) {
      let on = false;
      try { on = Boolean(await store.backend?.fetchAutomationConfig(r.a.id)); } catch { on = false; }
      r.sw.set(on, !store.backend);
    }
  }
  refresh();
  return card({ title: 'Akıllı uyarılar', iconName: 'bell' },
    h('p', { class: 'muted small' }, 'Ev kendisi haber verir: uygulama kapalıyken de çalışır. Telefonlara gelmesi için bu cihazda Bildirimler açık olmalı; uyarılar Home Assistant\'ın bildirimlerinde de görünür.'),
    ...rows.map((r) => r.row));
}

// ---- automatic backups ----

const BACKUP_PLANS = ['guvence', 'premium'];
const when = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function backupCard() {
  const u = member();
  const allowed = u && (u.role === 'admin' || BACKUP_PLANS.includes(u.plan));
  if (!allowed) {
    return card({ title: 'Otomatik yedek', iconName: 'shield' },
      h('p', { class: 'muted small' }, 'Evinizin sistemi her hafta kendiliğinden yedeklenir; bir sorun olursa her şey bir dokunuşla geri gelir. Güvence ve Premium planlarla gelir.'),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: plansUrl(), target: '_blank', rel: 'noopener' }, icon('lock', 16), 'Planları gör')));
  }
  const status = h('p', { class: 'muted small' }, 'Yükleniyor…');
  const now = h('button', { class: 'btn small', type: 'button' }, icon('refresh', 14), 'Şimdi yedek al');
  const sw = toggle('Haftalık otomatik yedek', async (on) => {
    const b = store.backend;
    try {
      if (on) {
        const agents = (await b.backupAgents())?.agents || [];
        const local = agents.find((x) => /\.local$/.test(x.agent_id)) || agents[0];
        if (!local) throw new Error('Home Assistant yedek yeri bulamadı');
        const patch = {
          create_backup: { agent_ids: [local.agent_id], include_all_addons: true, include_database: true },
          retention: { copies: 4, days: null },
          schedule: { recurrence: 'custom_days', days: ['sun'], time: '03:30' },
        };
        try { await b.backupConfigure({ ...patch, automatic_backups_configured: true }); } catch { await b.backupConfigure(patch); }
        toast('Otomatik yedek açıldı: her pazar 03:30, son 4 yedek saklanır');
      } else {
        await b.backupConfigure({ schedule: { recurrence: 'never' } });
        toast('Otomatik yedek kapatıldı');
      }
    } catch (e) {
      toast(`Yedek ayarı değiştirilemedi: ${e.message}. Home Assistant → Ayarlar → Sistem → Yedekler'den de yapılabilir.`, 'error');
    }
    refresh();
  });
  now.addEventListener('click', async () => {
    now.disabled = true;
    try { await store.backend.backupNow(); toast('Yedek alınıyor; birkaç dakika sürer'); } catch (e) { toast(`Yedek başlatılamadı: ${e.message}`, 'error'); }
    now.disabled = false;
    setTimeout(refresh, 4000);
  });
  async function refresh() {
    const b = store.backend;
    if (b?.mode !== 'live' || !b.backupConfig) {
      status.textContent = 'Yedekler evin Home Assistant\'ında tutulur; örnek evde yedek yok.';
      sw.set(false, true); now.hidden = true;
      return;
    }
    try {
      const [cfg, info] = await Promise.all([b.backupConfig(), b.backupInfo().catch(() => null)]);
      const sched = cfg?.config?.schedule || {};
      const on = sched.recurrence && sched.recurrence !== 'never';
      sw.set(on, false);
      const list = (info?.backups || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
      status.textContent = `${on ? 'Açık' : 'Kapalı'} · son yedek: ${when(list[0]?.date)}${list.length ? ` · ${list.length} yedek` : ''}`;
      now.hidden = false;
    } catch (e) {
      status.textContent = `Yedek bilgisi okunamadı (${e.message}). Bu özellik Home Assistant 2025.1 ve sonrasını ister.`;
      sw.set(false, true);
    }
  }
  refresh();
  return card({ title: 'Otomatik yedek', iconName: 'shield' },
    h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', null, 'Haftalık otomatik yedek'), h('small', null, 'Her pazar 03:30, Pi\'de; son 4 yedek saklanır.')), sw),
    status, h('div', { class: 'btn-row' }, now));
}
