// Bildirimler: everything about notifications in one place.
//   1. This device: switch Evra notifications on (js/push.js) and send a test.
//   2. Add Evra to the home screen (iPhone needs it for notifications; Android installs it as an app).
//   3. Smart alerts (js/home-care.js): the home tells you about things by itself.
//   4. Scenes and automations: a notification when one of them runs (js/notify-links.js).
// The automation editor's "Bildirim gönder" step and the scene editor's notification switch
// do the same from where a scene or automation is made.

import { store } from '../store.js';
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { card, toggle } from '../components.js';
import { pushState, enablePush, disablePush, showHere, pushEntities } from '../push.js';
import { alertsCard } from '../home-care.js';
import { SCENES, saveScene, loadScenes } from '../scenes.js';
import { userAutomations, linkedAutomations, automationLink, setAutomationLink, removeAutomationLink, refreshAutomationLinks } from '../notify-links.js';

// Android / desktop Chrome offers to install the app once; keep the offer for the button below.
let installOffer = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installOffer = e; });
window.addEventListener('appinstalled', () => { installOffer = null; });

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(navigator.userAgent);
const installed = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

const PUSH_HINTS = {
  unsupported: 'Bu tarayıcı bildirim alamıyor. Telefonda Chrome (Android) ya da Safari (iPhone) kullanın.',
  insecure: 'Telefonlar yalnızca https:// ile açılan uygulamalara bildirim izni verir. Evra uygulamasını app.evrasmarthome.com adresinden ya da evinizin güvenli adresinden açın.',
  install: 'iPhone bildirimleri yalnızca ana ekrandan açılan uygulamaya gelir: önce aşağıdaki adımlarla Evra uygulamasını ana ekrana ekleyin, sonra oradan açıp bunu açın.',
  blocked: 'Evra bildirimleri engellenmiş. Telefonun ayarlarından (iPhone: Ayarlar → Bildirimler → Evra; Android: Ayarlar → Uygulamalar → Evra → Bildirimler) izin verip buraya dönün.',
  ready: 'Uyarılar (su kaçağı, duman, açık kalan kapı) ve seçtiğiniz sahne ve otomasyonlar, Evra kapalıyken bile bu cihaza gelir.',
  on: 'Uyarılar ve seçtiğiniz sahne ve otomasyonlar, Evra kapalıyken bile bu cihaza gelir.',
};

export function deviceNotifyCard(cleanup) {
  const hint = h('small');
  const sw = toggle('Bu cihazda bildirimler', async (on) => {
    try {
      if (on) { await enablePush(); toast('Bu cihazda bildirimler açıldı'); } else { await disablePush(); toast('Bu cihazda bildirimler kapatıldı'); }
      // The automations' notifications are sent to the list of devices saved with them.
      if (store.backend?.mode === 'live') setTimeout(() => refreshAutomationLinks(), 4000);
    } catch (e) {
      toast(`Bildirimler ${on ? 'açılamadı' : 'kapatılamadı'}: ${e.message}`, 'error');
    } finally {
      draw();
    }
  });
  const testBtn = h('button', { class: 'btn small', type: 'button' }, icon('bell', 16), 'Deneme gönder');
  testBtn.addEventListener('click', async () => {
    const title = 'Evra denemesi';
    const message = 'Bildirimler bu cihazda çalışıyor.';
    try {
      if (store.backend?.mode === 'live') {
        const targets = pushEntities();
        if (!targets.length) { toast('Home Assistant bu cihazı henüz listelemedi; birazdan tekrar deneyin', 'error'); return; }
        await store.call('notify', 'send_message', { entity_id: targets }, { title, message });
        toast(targets.length > 1 ? `${targets.length} Evra cihazına gönderildi` : 'Gönderildi');
      } else if (await showHere(title, message)) toast('Gönderildi');
    } catch { /* store.call already said why */ }
  });
  const draw = () => {
    const state = pushState();
    hint.textContent = PUSH_HINTS[state];
    sw.set(state === 'on', !['ready', 'on'].includes(state));
    testBtn.hidden = state !== 'on';
  };
  draw();
  const onVisible = () => { if (document.visibilityState === 'visible') draw(); };
  document.addEventListener('visibilitychange', onVisible);
  cleanup.push(() => document.removeEventListener('visibilitychange', onVisible));
  return card({ title: 'Bu cihaz', iconName: 'bell' },
    h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', null, 'Bildirimler'), hint), sw),
    h('div', { class: 'btn-row' }, testBtn));
}

// ---- add to the home screen ----

const STEPS = {
  ios: [
    'Evra uygulamasını iPhone’da Safari ile açın (app.evrasmarthome.com).',
    'Alttaki Paylaş düğmesine dokunun (yukarı oklu kare).',
    'Listeyi aşağı kaydırıp "Ana Ekrana Ekle"yi seçin, sağ üstte "Ekle"ye dokunun.',
    'Evra uygulamasını artık ana ekrandaki simgesinden açın; tam ekran bir uygulama gibi açılır.',
    'Bu sayfaya gelip "Bildirimler"i açın ve çıkan soruda "İzin Ver"e dokunun.',
  ],
  android: [
    'Evra uygulamasını telefonda Chrome ile açın (app.evrasmarthome.com).',
    'Sağ üstteki üç nokta (⋮) menüsüne dokunun.',
    '"Uygulamayı yükle" ya da "Ana ekrana ekle"yi seçin, sonra "Yükle"ye dokunun.',
    'Evra simgesi ana ekrana ve uygulama listesine gelir; oradan açın.',
    'Bu sayfaya gelip "Bildirimler"i açın ve çıkan soruda "İzin ver"e dokunun.',
  ],
};
const NOTES = {
  ios: 'iOS 16.4 ya da daha yeni bir sürüm gerekir. iPhone bildirimleri yalnızca ana ekrana eklenmiş uygulamaya gelir. Samsung ya da başka bir tarayıcı değil, Safari kullanın.',
  android: 'Samsung Internet kullanıyorsanız: alttaki menü (≡) → "Sayfayı ekle" → "Ana ekran". Bildirim gelmiyorsa telefonun pil tasarrufu ayarında Evra için kısıtlamayı kaldırın.',
};

function installCard() {
  const which = isAndroid() ? 'android' : 'ios';
  const list = h('ol', { class: 'install-steps' });
  const note = h('p', { class: 'muted small' });
  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const show = (k) => {
    list.replaceChildren(...STEPS[k].map((t) => h('li', null, t)));
    note.textContent = NOTES[k];
    for (const b of tabs.children) b.classList.toggle('active', b.dataset.k === k);
  };
  for (const [k, label] of [['ios', 'iPhone'], ['android', 'Android']]) {
    const b = h('button', { type: 'button', 'data-k': k }, label);
    b.addEventListener('click', () => show(k));
    tabs.append(b);
  }
  show(which);
  const installBtn = h('button', { class: 'btn primary', type: 'button', hidden: !installOffer }, icon('plus', 16), 'Evra uygulamasını yükle');
  installBtn.addEventListener('click', async () => {
    if (!installOffer) return;
    installOffer.prompt();
    try { await installOffer.userChoice; } catch { /* closed */ }
    installOffer = null;
    installBtn.hidden = true;
  });
  const done = installed();
  return card({ title: 'Ana ekrana ekleyin', iconName: 'tablet' },
    h('p', { class: 'muted small' }, done
      ? 'Evra bu cihazda ana ekrandan açılmış. Başka bir telefona eklemek için adımlar:'
      : 'Evra uygulamasını telefonun ana ekranına ekleyince tam ekran bir uygulama gibi açılır ve bildirim alabilir. Mağazadan indirmeye gerek yok.'),
    tabs, list, note, done ? null : installBtn);
}

// ---- scenes and automations ----

function messageInput(value, onSave) {
  const inp = h('input', { class: 'input', type: 'text', maxlength: 160, value, 'aria-label': 'Bildirim metni' });
  inp.addEventListener('change', () => onSave(inp.value.trim()));
  return inp;
}

function scenesCard() {
  const body = h('div', { class: 'notify-list' });
  const draw = () => body.replaceChildren(...(SCENES.length ? SCENES.map((s) => {
    const on = Boolean(s.notify?.on);
    const msgField = on ? h('label', { class: 'field notify-msg' }, h('span', null, 'Bildirim metni'),
      messageInput(s.notify.message || `${s.name} sahnesi açıldı`, async (v) => {
        try { await saveScene({ ...s, notify: { on: true, message: v } }); toast('Kaydedildi'); } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
      })) : null;
    const sw = toggle(s.name, async (want) => {
      try {
        await saveScene({ ...s, notify: want ? { on: true, message: s.notify?.message || `${s.name} sahnesi açıldı` } : undefined });
        toast(want ? `${s.name} açılınca bildirim gelecek` : `${s.name} bildirimi kapatıldı`);
      } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
      draw();
    });
    sw.set(on, false);
    return h('div', { class: 'notify-item' },
      h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', null, s.name), h('small', null, on ? 'Açılınca bildirim gelir' : 'Bildirim yok')), sw),
      msgField);
  }) : [h('p', { class: 'muted small' }, 'Henüz sahne yok.')]));
  draw();
  loadScenes().then(draw).catch(() => {});
  return card({ title: 'Sahne bildirimleri', iconName: 'scenes' },
    h('p', { class: 'muted small' }, 'Seçtiğiniz sahne açılınca (uygulamadan, duvar ekranından ya da EvrAI ile) evdekilere bildirim gider. Sahneyi düzenlerken de açabilirsiniz.'),
    body);
}

function automationsCard() {
  const body = h('div', { class: 'notify-list' });
  const draw = () => {
    if (!store.backend) { body.replaceChildren(h('p', { class: 'muted small' }, 'Evinize bağlanınca otomasyonlarınız burada görünür.')); return; }
    const autos = userAutomations();
    const linked = linkedAutomations();
    if (!autos.length) { body.replaceChildren(h('p', { class: 'muted small' }, 'Henüz otomasyon yok. Otomasyonlar ekranından ekleyebilirsiniz.')); return; }
    body.replaceChildren(...autos.map((a) => {
      const on = linked.has(a.id);
      const msgSlot = h('div');
      if (on) {
        automationLink(a).then((m) => {
          msgSlot.replaceChildren(h('label', { class: 'field notify-msg' }, h('span', null, 'Bildirim metni'),
            messageInput(m || `${a.name} çalıştı`, async (v) => {
              try { await setAutomationLink(a, v); toast('Kaydedildi'); } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
            })));
        });
      }
      const sw = toggle(a.name, async (want) => {
        try {
          if (want) await setAutomationLink(a, `${a.name} çalıştı`); else await removeAutomationLink(a);
          toast(want ? `${a.name} çalışınca bildirim gelecek` : `${a.name} bildirimi kapatıldı`);
        } catch (e) { toast(`Kaydedilemedi: ${e.message}`, 'error'); }
        setTimeout(draw, 1200);
      });
      sw.set(on, false);
      return h('div', { class: 'notify-item' },
        h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('strong', null, a.name), h('small', null, on ? 'Çalışınca bildirim gelir' : 'Bildirim yok')), sw),
        msgSlot);
    }));
  };
  draw();
  return card({ title: 'Otomasyon bildirimleri', iconName: 'robot' },
    h('p', { class: 'muted small' }, 'Seçtiğiniz otomasyon çalışınca bildirim gelir; Evra kapalıyken de çalışır. Otomasyon oluştururken "Ne yapılsın" bölümüne "Bildirim gönder" adımı ekleyerek istediğiniz anda istediğiniz metni de gönderebilirsiniz.'),
    body,
    h('div', { class: 'btn-row' }, h('a', { class: 'btn ghost small', href: '#/automations/new' }, icon('plus', 16), 'Bildirimli otomasyon oluştur')));
}

export function renderNotifications(root, cleanup) {
  root.replaceChildren(
    deviceNotifyCard(cleanup),
    installCard(),
    alertsCard(),
    scenesCard(),
    automationsCard(),
  );
}
