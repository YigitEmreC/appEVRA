// Destek: when a device's own troubleshooting (its page, js/device-health.js) didn't help,
// the person reaches Evra support from here. The message is prepared with what support
// needs (which device, its model, since when it's unreachable, what Home Assistant says,
// the home's plan), and they choose how to send it.
//
// What support a home gets follows its plan (webEVRA public/data/settings.js → subscriptions):
//   Temel     e-mail
//   Güvence   + phone: fast service, remote, same day
//   Premium   + priority WhatsApp, a home visit within 48 hours, a yearly maintenance visit
// Options outside the plan stay visible with a lock on them and lead to the plans page.
// Nothing is sent by the app itself; it only opens the mail app / the phone / WhatsApp.

import { store, deviceName, userDevices, areaName } from '../store.js';
import { h, toast, relTime } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { productForDevice } from '../catalog.js';
import { member, isAdmin, plansUrl } from '../account.js';
import { isOffline, offlineSince } from '../device-health.js';

export const SUPPORT = {
  phone: '+90 533 469 51 79',
  whatsapp: '905334695179',
  email: 'info@evrasmarthome.com',
};

const PLANS = ['temel', 'guvence', 'premium'];
const PLAN_NAMES = { temel: 'Temel', guvence: 'Güvence', premium: 'Premium' };

/** The home's plan: "temel", "guvence" or "premium" (admins get everything). */
export function supportPlan(u = member()) {
  if (isAdmin(u)) return 'premium';
  return PLANS.includes(u?.plan) ? u.plan : 'temel';
}
const has = (plan, need) => PLANS.indexOf(plan) >= PLANS.indexOf(need);

export function renderSupport(root, cleanup, ctx) {
  const wanted = ctx?.query?.get('device') || '';
  const m = member();
  const plan = supportPlan(m);
  const devices = userDevices().slice().sort((a, b) => Number(isOffline(b)) - Number(isOffline(a)) || deviceName(a).localeCompare(deviceName(b), 'tr'));

  const select = h('select', { class: 'select', 'aria-label': 'Hangi cihaz?' },
    h('option', { value: '' }, 'Genel bir soru / cihaz seçmeden'),
    devices.map((d) => h('option', { value: d.id, selected: d.id === wanted }, `${deviceName(d)}${isOffline(d) ? ' · ulaşılamıyor' : ''}`)));
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 1500, placeholder: 'Ne oluyor, ne zamandan beri ve neler denediniz? Örnek: Salon ampulü gece koptu, Yeniden bağla tuşuna bastım ama gelmedi.' });
  const details = h('pre', { class: 'support-details' });
  let info = '';

  const build = async () => {
    const d = store.devices.get(select.value);
    const lines = [];
    if (m?.name || m?.email) lines.push(`Kişi: ${[m.name, m.email].filter(Boolean).join(' · ')}`);
    lines.push(`Plan: ${PLAN_NAMES[plan]}`);
    if (d) {
      const p = productForDevice(d);
      lines.push(`Cihaz: ${deviceName(d)}${d.area_id ? ` (${areaName(d.area_id) || ''})` : ''}`);
      lines.push(`Ürün: ${p ? p.name : ''}${d.manufacturer || d.model ? ` · ${[d.manufacturer, d.model].filter(Boolean).join(' ')}` : ''}`);
      lines.push(`Durum: ${isOffline(d) ? `ulaşılamıyor${offlineSince(d) ? `, ${relTime(offlineSince(d))} koptu` : ''}` : 'bağlı'}`);
      try {
        const conn = (await store.backend?.connectionInfo?.(d)) || [];
        for (const c of conn) lines.push(`Home Assistant: ${c.domain} · ${c.state}${c.reason ? ` · ${String(c.reason).slice(0, 300)}` : ''}`);
      } catch { /* without it */ }
    }
    lines.push(`Evdeki ulaşılamayan cihaz sayısı: ${userDevices().filter(isOffline).length}`);
    lines.push(`Uygulama: ${store.status.mode || '-'} · ${store.status.state || '-'} · ${new Date().toLocaleString('tr-TR')}`);
    info = lines.join('\n');
    details.textContent = info;
  };
  select.addEventListener('change', build);
  build();

  const message = (kind) => {
    const what = text.value.trim();
    return `Merhaba Evra destek,\n${kind ? `${kind}\n` : ''}${what || '(sorun açıklaması yok)'}\n\n${info}`;
  };
  const subject = () => {
    const d = store.devices.get(select.value);
    return `Evra destek · ${PLAN_NAMES[plan]}${d ? ` · ${deviceName(d)}` : ''}`;
  };
  const wa = (kind) => `https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(message(kind))}`;

  // Every support option, with the plan it comes with. `link` is filled in just before it opens.
  const OPTIONS = [
    { need: 'temel', iconName: 'mail', title: 'E-posta ile yaz', note: 'Bütün planlarda', link: () => `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(message())}` },
    { need: 'guvence', iconName: 'phone', title: 'Telefonla ara', note: 'Hızlı servis: uzaktan, aynı gün', link: () => `tel:${SUPPORT.phone.replace(/\s+/g, '')}` },
    { need: 'premium', iconName: 'send', title: 'Öncelikli WhatsApp', note: 'Mesajınız sıranın önüne geçer', link: () => wa(''), blank: true },
    { need: 'premium', iconName: 'home', title: 'Ev ziyareti iste', note: '48 saat içinde evinizdeyiz', link: () => wa('Ev ziyareti istiyorum.'), blank: true },
    { need: 'premium', iconName: 'wrench', title: 'Bakım ziyareti ve pil değişimi', note: 'Yılda 1 kez, plana dahil', link: () => wa('Yıllık bakım ziyareti ve pil değişimi için gün almak istiyorum.'), blank: true },
  ];

  const tiles = OPTIONS.map((o) => {
    const open = has(plan, o.need);
    const body = [
      h('span', { class: 'opt-icon' }, icon(o.iconName, 20)),
      h('span', { class: 'opt-text' }, h('strong', null, o.title), h('small', null, o.note)),
    ];
    if (!open) {
      return h('a', {
        class: 'support-opt locked', href: plansUrl(), target: '_blank', rel: 'noopener',
        title: `${PLAN_NAMES[o.need]} planıyla açılır`,
      }, body, h('span', { class: 'opt-lock' }, icon('lock', 30), h('small', null, `${PLAN_NAMES[o.need]} ile`)));
    }
    const a = h('a', { class: 'support-opt', href: o.link(), ...(o.blank ? { target: '_blank', rel: 'noopener' } : {}) }, body);
    const sync = () => { a.href = o.link(); };
    a.addEventListener('pointerdown', sync);
    a.addEventListener('focus', sync);
    text.addEventListener('input', sync);
    select.addEventListener('change', () => setTimeout(sync, 400));
    return a;
  });

  const copyBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Mesajı kopyala');
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(message()); toast('Mesaj kopyalandı'); } catch { toast('Kopyalanamadı', 'error'); }
  });

  const planLine = h('div', { class: 'support-plan' },
    h('span', null, 'Planınız: ', h('strong', null, PLAN_NAMES[plan]), m?.planFrom === 'home' ? h('small', { class: 'muted' }, ' (evin planı)') : null),
    plan !== 'premium' ? h('a', { class: 'link small', href: plansUrl(), target: '_blank', rel: 'noopener' }, 'Planı yükselt', icon('right', 14)) : null);

  const contact = has(plan, 'guvence')
    ? `Telefon: ${SUPPORT.phone} · E-posta: ${SUPPORT.email} · Hafta içi 9:00–18:00. Birçok ayarı uzaktan yapabiliyoruz.`
    : `E-posta: ${SUPPORT.email} · Hafta içi 9:00–18:00.`;

  const offline = userDevices().filter(isOffline);
  root.replaceChildren(...[
    h('p', { class: 'muted intro' }, 'Önce cihazın sayfasındaki "Bağlantı ve sorun giderme" adımlarını deneyin; çoğu sorun orada çözülür. Çözülmediyse bize yazın: cihazın bilgileri mesaja kendiliğinden eklenir.'),
    offline.length ? card({ title: 'Şu an ulaşılamayan cihazlar', iconName: 'wifi' },
      h('ul', { class: 'support-offline' }, offline.map((d) => h('li', null,
        h('span', null, deviceName(d), h('small', { class: 'muted' }, offlineSince(d) ? ` · ${relTime(offlineSince(d))} koptu` : '')),
        h('a', { class: 'link small', href: `#/devices/${encodeURIComponent(d.id)}` }, 'Sorun gider', icon('right', 14)))))) : null,
    card({ title: 'Evra desteğine yazın', iconName: 'sos' },
      planLine,
      h('label', { class: 'field' }, h('span', null, 'Hangi cihaz?'), select),
      h('label', { class: 'field' }, h('span', null, 'Sorun'), text),
      h('details', { class: 'support-more' }, h('summary', null, 'Mesaja eklenecek bilgiler'), details),
      h('div', { class: 'support-opts' }, tiles),
      h('div', { class: 'btn-row' }, copyBtn),
      h('p', { class: 'muted small' }, contact)),
  ].filter(Boolean));
}
