// Destek: when a device's own troubleshooting (its page, js/device-health.js) didn't help,
// the person reaches Evra support from here.
//
// The request is sent from inside the app, through the signed-in Evra account, to the
// website (POST /api/accounts/support, webEVRA lib/app-support.js), which e-mails it to the
// support inbox. That works the same on a phone, in the Home Assistant app and on a wall
// panel (kiosk), where WhatsApp / mail / phone links have nothing to open.
// The app adds what support needs (which device, its model, since when it's unreachable,
// what Home Assistant says); the website adds the plan from the database.
//
// What a home may ask for follows its plan (webEVRA public/data/settings.js → subscriptions):
//   Temel     a message, answered by e-mail
//   Güvence   + call me back: fast service, remote, same day
//   Premium   + priority WhatsApp, a home visit within 48 hours, the yearly maintenance visit
// Options outside the plan stay visible with a heavy lock and lead to the plans page.

import { store, deviceName, userDevices, areaName } from '../store.js';
import { h, toast, relTime } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import { productForDevice } from '../catalog.js';
import { member, isAdmin, plansUrl, accountToken, sendSupport } from '../account.js';
import { isOffline, offlineSince } from '../device-health.js';

export const SUPPORT = {
  phone: '+90 533 469 51 79',
  email: 'info@evrasmarthome.com',
};

const PLANS = ['temel', 'guvence', 'premium'];
const PLAN_NAMES = { temel: 'Temel', guvence: 'Güvence', premium: 'Premium' };
const PHONE_KEY = 'evra.supportPhone';

/** The home's plan: "temel", "guvence" or "premium" (admins get everything). */
export function supportPlan(u = member()) {
  if (isAdmin(u)) return 'premium';
  return PLANS.includes(u?.plan) ? u.plan : 'temel';
}
const has = (plan, need) => PLANS.indexOf(plan) >= PLANS.indexOf(need);

// What can be asked for. The same ids and plans as webEVRA lib/app-support.js.
const KINDS = [
  { id: 'message', need: 'temel', iconName: 'mail', title: 'Mesaj gönder', note: 'Yanıtımız e-postanıza gelir', phone: false },
  { id: 'call', need: 'guvence', iconName: 'phone', title: 'Beni arayın', note: 'Hızlı servis: uzaktan, aynı gün', phone: true },
  { id: 'whatsapp', need: 'premium', iconName: 'send', title: 'Öncelikli WhatsApp', note: 'WhatsApp üzerinden size yazarız', phone: true },
  { id: 'visit', need: 'premium', iconName: 'home', title: 'Ev ziyareti iste', note: '48 saat içinde evinizdeyiz', phone: true },
  { id: 'maintenance', need: 'premium', iconName: 'wrench', title: 'Bakım ziyareti ve pil değişimi', note: 'Yılda 1 kez, plana dahil', phone: true },
];
const DONE = {
  message: 'Yanıtımız hesabınızın e-posta adresine gelecek.',
  call: 'Bugün mesai saatleri içinde sizi arayacağız (hafta içi 9:00–18:00).',
  whatsapp: 'Öncelikli olarak WhatsApp üzerinden size yazacağız.',
  visit: 'Ziyaret için 48 saat içinde gün ve saat belirlemek üzere size ulaşacağız.',
  maintenance: 'Yıllık bakım ziyaretiniz için gün belirlemek üzere size ulaşacağız.',
};

export function renderSupport(root, cleanup, ctx) {
  const wanted = ctx?.query?.get('device') || '';
  const m = member();
  const plan = supportPlan(m);
  const devices = userDevices().slice().sort((a, b) => Number(isOffline(b)) - Number(isOffline(a)) || deviceName(a).localeCompare(deviceName(b), 'tr'));

  const select = h('select', { class: 'select', 'aria-label': 'Hangi cihaz?' },
    h('option', { value: '' }, 'Genel bir soru / cihaz seçmeden'),
    devices.map((d) => h('option', { value: d.id, selected: d.id === wanted }, `${deviceName(d)}${isOffline(d) ? ' · ulaşılamıyor' : ''}`)));
  const text = h('textarea', { class: 'input', rows: 4, maxlength: 1500, placeholder: 'Ne oluyor, ne zamandan beri ve neler denediniz? Örnek: Salon ampulü gece koptu, Yeniden bağla tuşuna bastım ama gelmedi.' });
  let savedPhone = '';
  try { savedPhone = localStorage.getItem(PHONE_KEY) || ''; } catch { /* none */ }
  const phone = h('input', { class: 'input', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, placeholder: '05xx xxx xx xx', value: savedPhone });
  const phoneField = h('label', { class: 'field' }, h('span', null, 'Size ulaşacağımız telefon'), phone);
  const details = h('pre', { class: 'support-details' });
  let info = '';

  const build = async () => {
    const d = store.devices.get(select.value);
    const lines = [];
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
    const offline = userDevices().filter(isOffline).slice(0, 10).map((x) => deviceName(x));
    if (offline.length) lines.push(`Ulaşılamayanlar: ${offline.join(', ')}`);
    lines.push(`Uygulama: ${store.status.mode || '-'} · ${store.status.state || '-'} · ${new Date().toLocaleString('tr-TR')}`);
    info = lines.join('\n');
    details.textContent = info;
  };
  select.addEventListener('change', build);
  build();

  // The kinds, as a choice; the ones outside the plan are locked.
  let chosen = 'message';
  const tiles = KINDS.map((k) => {
    const body = [
      h('span', { class: 'opt-icon' }, icon(k.iconName, 20)),
      h('span', { class: 'opt-text' }, h('strong', null, k.title), h('small', null, k.note)),
    ];
    if (!has(plan, k.need)) {
      const a = h('a', { class: 'support-opt locked', href: plansUrl(), target: '_blank', rel: 'noopener', title: `${PLAN_NAMES[k.need]} planıyla açılır` },
        body, h('span', { class: 'opt-lock' }, icon('lock', 30), h('small', null, `${PLAN_NAMES[k.need]} ile`)));
      // On a wall panel a new tab may not open: say where to upgrade too.
      a.addEventListener('click', () => toast(`${k.title} ${PLAN_NAMES[k.need]} planıyla gelir. Planınızı evrasmarthome.com/abonelik.html adresinden yükseltebilirsiniz.`));
      return a;
    }
    const b = h('button', { class: 'support-opt', type: 'button', role: 'radio', 'aria-checked': 'false', 'data-kind': k.id }, body);
    b.addEventListener('click', () => pick(k.id));
    return b;
  });
  const pick = (id) => {
    chosen = id;
    for (const t of tiles) if (t.dataset.kind) { const on = t.dataset.kind === id; t.classList.toggle('chosen', on); t.setAttribute('aria-checked', String(on)); }
    phoneField.hidden = !KINDS.find((k) => k.id === id)?.phone;
    send.textContent = id === 'message' ? 'Gönder' : `${KINDS.find((k) => k.id === id).title}: gönder`;
  };

  const send = h('button', { class: 'btn primary', type: 'button' }, 'Gönder');
  const status = h('p', { class: 'support-status', role: 'status' });
  const form = h('div', { class: 'support-form' });
  send.addEventListener('click', async () => {
    const kind = KINDS.find((k) => k.id === chosen);
    const message = text.value.trim();
    if (chosen === 'message' && !message) { toast('Sorunu birkaç kelimeyle yazın.', 'error'); text.focus(); return; }
    if (kind.phone && phone.value.replace(/\D/g, '').length < 10) { toast('Size ulaşabilmemiz için telefon numaranızı yazın.', 'error'); phone.focus(); return; }
    if (!accountToken()) { status.textContent = 'Göndermek için Evra hesabınızla giriş yapın (Ayarlar → Hesap). Ya da aşağıdaki numaradan bize ulaşın.'; return; }
    try { if (phone.value.trim()) localStorage.setItem(PHONE_KEY, phone.value.trim()); } catch { /* not kept */ }
    send.disabled = true;
    status.textContent = 'Gönderiliyor…';
    await build();
    const d = store.devices.get(select.value);
    try {
      const r = await sendSupport({
        kind: chosen, message, phone: phone.value.trim(),
        device: d ? deviceName(d) : '', details: info,
        from: `${location.host} · ${matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ? 'uygulama' : 'tarayıcı'}`,
      });
      form.replaceChildren(h('div', { class: 'support-done' },
        icon('check', 28),
        h('strong', null, 'Talebiniz bize ulaştı'),
        h('p', null, `Referans numaranız: ${r.ticket}`),
        h('p', { class: 'muted' }, DONE[r.kind] || DONE.message),
        r.priority ? h('p', { class: 'muted small' }, 'Premium: talebiniz öncelikli olarak işaretlendi.') : null));
    } catch (e) {
      send.disabled = false;
      status.textContent = `Gönderilemedi: ${e.message} Aşağıdaki numaradan bize ulaşabilirsiniz.`;
    }
  });

  const planLine = h('div', { class: 'support-plan' },
    h('span', null, 'Planınız: ', h('strong', null, PLAN_NAMES[plan]), m?.planFrom === 'home' ? h('small', { class: 'muted' }, ' (evin planı)') : null),
    plan !== 'premium' ? h('a', { class: 'link small', href: plansUrl(), target: '_blank', rel: 'noopener' }, 'Planı yükselt', icon('right', 14)) : null);

  const contact = has(plan, 'guvence')
    ? h('p', { class: 'muted small' }, 'Telefon: ', h('a', { href: `tel:${SUPPORT.phone.replace(/\s+/g, '')}` }, SUPPORT.phone), ` · E-posta: ${SUPPORT.email} · Hafta içi 9:00–18:00.`)
    : h('p', { class: 'muted small' }, `E-posta: ${SUPPORT.email} · Hafta içi 9:00–18:00.`);

  form.append(
    h('label', { class: 'field' }, h('span', null, 'Hangi cihaz?'), select),
    h('label', { class: 'field' }, h('span', null, 'Sorun'), text),
    h('div', { class: 'field' }, h('span', null, 'Nasıl yardımcı olalım?'), h('div', { class: 'support-opts', role: 'radiogroup' }, tiles)),
    phoneField,
    h('details', { class: 'support-more' }, h('summary', null, 'Mesaja eklenecek bilgiler'), details),
    h('div', { class: 'btn-row' }, send),
    status);
  pick(wanted && devices.find((d) => d.id === wanted && isOffline(d)) && has(plan, 'guvence') ? 'call' : 'message');

  const offline = userDevices().filter(isOffline);
  root.replaceChildren(...[
    h('p', { class: 'muted intro' }, 'Önce cihazın sayfasındaki "Bağlantı ve sorun giderme" adımlarını deneyin; çoğu sorun orada çözülür. Çözülmediyse buradan bize yazın: cihazın bilgileri talebe kendiliğinden eklenir.'),
    offline.length ? card({ title: 'Şu an ulaşılamayan cihazlar', iconName: 'wifi' },
      h('ul', { class: 'support-offline' }, offline.map((d) => h('li', null,
        h('span', null, deviceName(d), h('small', { class: 'muted' }, offlineSince(d) ? ` · ${relTime(offlineSince(d))} koptu` : '')),
        h('a', { class: 'link small', href: `#/devices/${encodeURIComponent(d.id)}` }, 'Sorun gider', icon('right', 14)))))) : null,
    card({ title: 'Evra desteğine yazın', iconName: 'sos' }, planLine, form, contact),
  ].filter(Boolean));
}
