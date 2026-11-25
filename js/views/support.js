// Destek: when a device's own troubleshooting (its page, js/device-health.js) didn't help,
// the person reaches Evra support from here. The message is prepared with what support
// needs (which device, its model, since when it's unreachable, what Home Assistant says),
// and they choose how to send it: WhatsApp, a phone call or e-mail. Nothing is sent by
// the app itself; it only opens WhatsApp / the phone / the mail app with the text.

import { store, deviceName, userDevices, areaName } from '../store.js';
import { h, toast, relTime } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { productForDevice } from '../catalog.js';
import { member } from '../account.js';
import { isOffline, offlineSince } from '../device-health.js';

export const SUPPORT = {
  phone: '+90 533 469 51 79',
  whatsapp: '905334695179',
  email: 'info@evrasmarthome.com',
};

export function renderSupport(root, cleanup, ctx) {
  const wanted = ctx?.query?.get('device') || '';
  const devices = userDevices().slice().sort((a, b) => Number(isOffline(b)) - Number(isOffline(a)) || deviceName(a).localeCompare(deviceName(b), 'tr'));

  const select = h('select', { class: 'select', 'aria-label': 'Hangi cihaz?' },
    h('option', { value: '' }, 'Genel bir soru / cihaz seçmeden'),
    devices.map((d) => h('option', { value: d.id, selected: d.id === wanted }, `${deviceName(d)}${isOffline(d) ? ' · ulaşılamıyor' : ''}`)));
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 1500, placeholder: 'Ne oluyor, ne zamandan beri ve neler denediniz? Örnek: Salon ampulü gece koptu, Yeniden bağla\'ya bastım ama gelmedi.' });
  const details = h('pre', { class: 'support-details' });
  let info = '';

  const build = async () => {
    const d = store.devices.get(select.value);
    const lines = [];
    const m = member();
    if (m?.name || m?.email) lines.push(`Kişi: ${[m.name, m.email].filter(Boolean).join(' · ')}`);
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
    const off = userDevices().filter(isOffline).length;
    lines.push(`Evdeki ulaşılamayan cihaz sayısı: ${off}`);
    lines.push(`Uygulama: ${store.status.mode || '-'} · ${store.status.state || '-'} · ${new Date().toLocaleString('tr-TR')}`);
    info = lines.join('\n');
    details.textContent = info;
  };
  select.addEventListener('change', build);
  build();

  const message = () => {
    const what = text.value.trim();
    return `Merhaba Evra destek,\n${what || '(sorun açıklaması yok)'}\n\n${info}`;
  };
  const waBtn = h('a', { class: 'btn primary', target: '_blank', rel: 'noopener' }, icon('send', 16), 'WhatsApp\'tan gönder');
  const mailBtn = h('a', { class: 'btn' }, 'E-posta gönder');
  const callBtn = h('a', { class: 'btn', href: `tel:${SUPPORT.phone.replace(/\s+/g, '')}` }, 'Telefonla ara');
  const copyBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Mesajı kopyala');
  const syncLinks = () => {
    waBtn.href = `https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(message())}`;
    mailBtn.href = `mailto:${SUPPORT.email}?subject=${encodeURIComponent('Evra destek' + (store.devices.get(select.value) ? ' · ' + deviceName(store.devices.get(select.value)) : ''))}&body=${encodeURIComponent(message())}`;
  };
  [waBtn, mailBtn].forEach((b) => b.addEventListener('pointerdown', syncLinks));
  [waBtn, mailBtn].forEach((b) => b.addEventListener('focus', syncLinks));
  syncLinks();
  text.addEventListener('input', syncLinks);
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(message()); toast('Mesaj kopyalandı'); } catch { toast('Kopyalanamadı', 'error'); }
  });

  const offline = userDevices().filter(isOffline);
  root.replaceChildren(
    h('p', { class: 'muted intro' }, 'Önce cihazın sayfasındaki "Bağlantı ve sorun giderme" adımlarını deneyin; çoğu sorun orada çözülür. Çözülmediyse bize yazın: cihazın bilgileri mesaja kendiliğinden eklenir.'),
    offline.length ? card({ title: 'Şu an ulaşılamayan cihazlar', iconName: 'wifi' },
      h('ul', { class: 'support-offline' }, offline.map((d) => h('li', null,
        h('span', null, deviceName(d), h('small', { class: 'muted' }, offlineSince(d) ? ` · ${relTime(offlineSince(d))} koptu` : '')),
        h('a', { class: 'link small', href: `#/devices/${encodeURIComponent(d.id)}` }, 'Sorun gider', icon('right', 14)))))) : null,
    card({ title: 'Evra desteğine yazın', iconName: 'sos' },
      h('label', { class: 'field' }, h('span', null, 'Hangi cihaz?'), select),
      h('label', { class: 'field' }, h('span', null, 'Sorun'), text),
      h('details', { class: 'support-more' }, h('summary', null, 'Mesaja eklenecek bilgiler'), details),
      h('div', { class: 'btn-row' }, waBtn, mailBtn, callBtn, copyBtn),
      h('p', { class: 'muted small' }, `Telefon ve WhatsApp: ${SUPPORT.phone} · E-posta: ${SUPPORT.email} · Hafta içi 9:00–18:00. Birçok ayarı uzaktan yapabiliyoruz; gerekirse eve geliyoruz.`)),
  );
}
