import { HOME } from '../config.js';
import { store } from '../store.js';
import { h, num, numVal, isAvailable, loadSettings, saveSettings, setPrefs, toast, effectiveTheme, homeSource, liteWanted } from '../util.js';
import { getCustom, setCustom } from '../custom.js';
import { PALETTES } from '../themes.js';
import { icon } from '../icons.js';
import { card, toggle } from '../components.js';
import { signOut } from '../backends/live.js';
import { accountPanel } from './account-ui.js';
import { openLegal } from '../legal.js';
import { locationCard } from './location-ui.js';
import { backupCard } from '../home-care.js';
import { wakeAvailable } from '../wake.js';
import { getLang, setLang } from '../i18n.js';
import { accountsUrl, useAccountsServer, WEBSITE_ACCOUNTS, LOCAL_ACCOUNTS, member, memberHome, canUseAssistant } from '../account.js';

export function renderSettings(root, cleanup, { reconnect }) {
  const settings = loadSettings();

  // ---- connection -------------------------------------------------------
  const statusLine = h('p', { class: 'status-line' });
  cleanup.push(store.onStatus((s) => {
    const label = { connected: 'Bağlı', connecting: 'Bağlanıyor…', reconnecting: 'Yeniden bağlanıyor…', error: 'Sorun', idle: 'Bağlı değil' }[s.state] || s.state;
    statusLine.replaceChildren(...[h('span', { class: `status-dot ${s.state}` }), `${s.mode === 'demo' ? 'Örnek ev' : 'Canlı'} · ${label}`, s.message ? h('span', { class: 'muted' }, ` — ${s.message}`) : null].filter(Boolean));
  }));

  let mode = settings.mode;
  const modeTabs = h('div', { class: 'segmented', role: 'tablist' });
  const urlInput = h('input', { class: 'input', type: 'url', value: settings.hassUrl, 'aria-label': 'Merkez (Home Assistant) adresi', placeholder: 'http://homeassistant.local:8123' });
  const urlField = h('label', { class: 'field' }, h('span', null, 'Merkez (Home Assistant) adresi'), urlInput);
  const liveHelp = h('p', { class: 'muted small' }, 'Bağlan, Home Assistant\'ın kendi giriş sayfasını açar. Şifreniz yalnızca Home Assistant\'a gider; uygulama bu cihazda bir oturum anahtarı saklar.');
  // Where the home's address comes from by itself: the Evra add-on on the Pi, or the Evra account.
  const home = memberHome();
  const source = homeSource();
  const homeNote = source === 'account'
    ? h('p', { class: 'hint' }, icon('home', 16), `Evra hesabınız sizi ${home?.name ? `"${home.name}" evine` : 'evinize'} kendiliğinden bağlar.`)
    : source === 'site'
      ? h('p', { class: 'hint' }, icon('home', 16), 'Bu Evra evinizin merkezinden açıldı, bu yüzden ona doğrudan bağlanır.')
      : (member() && settings.mode === 'demo'
        ? h('p', { class: 'hint' }, icon('home', 16), 'Evra hesabınız henüz bir eve bağlı değil, bu yüzden örnek ev gösteriliyor. Eviniz kurulunca Evra hesabınızı ona bağlar.')
        : null);
  const drawMode = () => {
    modeTabs.replaceChildren(...[['demo', 'Örnek ev'], ['live', 'Canlı']].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(mode === id), class: mode === id ? 'active' : '',
      onclick: () => { mode = id; drawMode(); },
    }, label)));
    urlField.hidden = mode !== 'live';
    liveHelp.hidden = mode !== 'live';
  };
  drawMode();

  const connectBtn = h('button', { class: 'btn primary', type: 'button' }, 'Bağlan');
  connectBtn.addEventListener('click', () => {
    let url = urlInput.value.trim().replace(/\/+$/, '');
    if (mode === 'live' && !/^https?:\/\//.test(url)) { toast('The address must start with http:// or https://', 'error'); return; }
    saveSettings({ mode, hassUrl: url || settings.hassUrl });
    reconnect();
  });
  const signOutBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Çıkış yap');
  signOutBtn.addEventListener('click', () => { signOut(); toast('Home Assistant oturumu kapatıldı'); if (loadSettings().mode === 'live') reconnect(); });

  // ---- demo controls ----------------------------------------------------
  const demoCard = card({ title: 'Örnek ev araçları', iconName: 'sparkle', className: 'dev-only' },
    h('p', { class: 'muted small' }, 'Uygulamayı ve taklit edilen otomasyonları denemek için odada bir şeyler olmuş gibi yapın.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.toggleWindow() }, icon('window', 16), 'Pencereyi aç / kapat'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.walkIn() }, icon('person', 16), 'Biri içeri girsin'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.nudgeTemperature(-0.5) }, icon('minus', 16), '0.5°'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.nudgeTemperature(0.5) }, icon('plus', 16), '0.5°'),
      h('button', { class: 'btn', type: 'button', onclick: () => { store.backend?.simulate?.updateAvailable(); toast('Yeni bir Home Assistant güncellemesi var'); } }, icon('refresh', 16), 'Güncelleme varmış gibi yap')),
    h('p', { class: 'muted small' }, 'Örnek evde değiştirdiğiniz cihazlar, odalar ve otomasyonlar bu cihazda saklanır.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn danger', type: 'button', onclick: () => {
        if (!confirm('Örnek ev sıfırlansın mı? Cihazlar, odalar ve otomasyonlar ilk haline döner.')) return;
        store.backend?.resetDemo?.();
        reconnect();
        toast('Örnek ev ilk haline döndü');
      } }, icon('refresh', 16), 'Örnek evi sıfırla')));
  cleanup.push(store.onStatus((s) => { demoCard.hidden = s.mode !== 'demo'; }));

  // ---- preferences -------------------------------------------------------
  const themeTabs = h('div', { class: 'segmented theme-tabs', role: 'radiogroup', 'aria-label': 'Görünüm' });
  // Language: set once here, kept on this device (i18n.js). Turkish is the default.
  // The names stay in their own language, whatever language is chosen.
  const langTabs = h('div', { class: 'segmented lang-tabs', role: 'radiogroup', 'aria-label': 'Dil / Language / اللغة', 'data-no-i18n': '' });
  const drawLang = () => {
    const cur = getLang();
    langTabs.replaceChildren(...[['tr', 'Türkçe'], ['en', 'English'], ['ar', 'العربية']].map(([id, label]) => h('button', {
      type: 'button', role: 'radio', lang: id, 'aria-checked': String(cur === id), class: cur === id ? 'active' : '',
      onclick: () => { if (getLang() !== id) setLang(id); },
    }, label)));
  };
  drawLang();
  window.addEventListener('evra-lang', drawLang);
  cleanup.push(() => window.removeEventListener('evra-lang', drawLang));
  const devSwitch = toggle('Geliştirici modu', (on) => { setPrefs({ devMode: on }); toast(on ? 'Geliştirici modu açık' : 'Geliştirici modu kapalı'); });
  // Light mode for slow devices (util.js applyLite) and the "Hey EvrAI" wake word (js/wake.js).
  const liteTabs = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Hafif mod' });
  const wakeSwitch = wakeAvailable() ? toggle('Hey EvrAI', (on) => {
    setPrefs({ wakeWord: on });
    toast(on ? '"Hey EvrAI" açık: bu cihaz dinliyor' : '"Hey EvrAI" kapalı');
  }) : null;
  const drawPrefs = () => {
    const { theme, devMode } = loadSettings();
    themeTabs.replaceChildren(...[['light', 'Açık', 'sun'], ['dark', 'Koyu', 'moon'], ['auto', 'Otomatik', 'auto']].map(([id, label, ic]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(theme === id), class: theme === id ? 'active' : '',
      title: id === 'auto' ? 'Bu cihazın açık/koyu ayarını izle' : `Her zaman ${label.toLocaleLowerCase('tr-TR')} tema`,
      onclick: () => setPrefs({ theme: id }),
    }, icon(ic, 16), label)));
    devSwitch.set(devMode);
    const { lite, wakeWord } = loadSettings();
    liteTabs.replaceChildren(...[['auto', 'Otomatik'], ['on', 'Açık'], ['off', 'Kapalı']].map(([id, label]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(lite === id), class: lite === id ? 'active' : '',
      onclick: () => setPrefs({ lite: id }),
    }, label)));
    wakeSwitch?.set(wakeWord, !canUseAssistant());
  };
  drawPrefs();
  window.addEventListener('evra-prefs', drawPrefs);
  cleanup.push(() => window.removeEventListener('evra-prefs', drawPrefs));
  const price = h('input', { class: 'input', type: 'number', min: 0, step: 0.01, value: settings.pricePerKwh, 'aria-label': 'kWh başına elektrik fiyatı' });
  price.addEventListener('change', () => {
    const v = parseFloat(price.value);
    if (Number.isFinite(v) && v >= 0) { saveSettings({ pricePerKwh: v }); toast('Fiyat kaydedildi'); } else toast('2,50 gibi bir fiyat girin', 'error');
  });

  // ---- batteries -----------------------------------------------------------
  const batteryList = h('ul', { class: 'battery-list' });
  cleanup.push(store.watch(HOME.batteries.map((b) => b.entity), (...states) => {
    batteryList.replaceChildren(...HOME.batteries.map((b, i) => {
      const s = states[i];
      const v = numVal(s);
      return h('li', null, icon('battery', 18), h('span', null, b.name),
        h('strong', { class: v != null && v < 20 ? 'low' : '' }, isAvailable(s) ? `${num(s, 0)}%` : 'offline'));
    }));
  }));

  root.append(
    h('div', { class: 'shortcut-row' },
      h('a', { class: 'shortcut', href: '#/energy' }, icon('chart', 20), h('span', null, 'Enerji ve iklim'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/remotes' }, icon('remote', 20), h('span', null, 'Kumandalar'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/devices?tab=rooms' }, icon('rooms', 20), h('span', null, 'Odalar'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/notifications' }, icon('bell', 20), h('span', null, 'Bildirimler'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/support' }, icon('sos', 20), h('span', null, 'Destek'), icon('right', 16))),
    card({ title: 'Evra hesabı', iconName: 'person', className: 'account-card' }, accountPanel(cleanup), accountsServerField()),
    card({ title: 'Bağlantı', iconName: 'home' }, statusLine, homeNote, modeTabs, urlField, liveHelp, h('div', { class: 'btn-row' }, connectBtn, signOutBtn)),
    locationCard(cleanup),
    backupCard(),
    lookCard(),
    card({ title: 'Tercihler', iconName: 'gear' },
      settingRow('Dil', 'Uygulamanın dili. Bu cihazda saklanır; varsayılan Türkçe.', langTabs),
      settingRow('Görünüm', 'Otomatik, bu cihazın açık/koyu ayarını izler.', themeTabs),
      settingRow('Geliştirici modu', 'Teknik ayrıntıları gösterir: varlık listeleri, model ve yazılım numaraları, JSON düzenleme ve örnek ev araçları.', devSwitch),
      settingRow('Hafif mod', `Bulanıklık ve hareketli arka planı kapatır; duvar paneli gibi yavaş cihazlar akıcı kalır. Otomatik: bu cihazda şu an ${liteWanted() ? 'açık' : 'kapalı'}.`, liteTabs),
      wakeSwitch ? settingRow('"Hey EvrAI" ile uyandır', 'Elleriniz doluyken: "Hey EvrAI" deyin, sonra sorunuzu sorun. Açıkken bu cihaz ortamı dinler ve ses, tarayıcının ses tanıma hizmetine (Google) gider; yalnızca duvar paneli gibi sabit cihazlarda açın. Uygulama arka plandayken dinlemez.', wakeSwitch) : null,
      h('label', { class: 'field' }, h('span', null, 'Elektrik fiyatı (kWh başına ₺)'), price)),
    demoCard,
    card({ title: 'Sensör pilleri', iconName: 'battery' }, batteryList),
    legalCard(),
    h('p', { class: 'muted small about' }, 'Evra · Home Assistant üzerinde çalışır', h('span', { class: 'dev-only' }, ' · ürün listesi js/catalog.js içinde')),
  );
}

// Gizlilik ve koşullar: the legal texts (js/legal.js) and the assistant consent,
// which can be taken back here (KVKK: consent can be withdrawn at any time).
function legalCard() {
  const consentLine = h('p', { class: 'muted small' });
  const withdraw = h('button', { class: 'btn ghost small', type: 'button' }, 'Onayı geri al');
  const paint = () => {
    const c = loadSettings().aiConsent;
    consentLine.textContent = c
      ? `Yapay zekâ asistanı için açık rıza verildi (${new Date(c.at).toLocaleDateString('tr-TR')}).`
      : 'Yapay zekâ asistanı için açık rıza verilmedi; asistan ilk açıldığında sorulur.';
    withdraw.hidden = !c;
  };
  withdraw.addEventListener('click', () => {
    saveSettings({ aiConsent: null });
    paint();
    toast('Onay geri alındı. Asistan, tekrar onay verene kadar kullanılamaz.');
  });
  paint();
  const open = (id, label) => h('button', { class: 'btn ghost small', type: 'button', onclick: () => openLegal(id) }, icon('external', 14), label);
  return card({ title: 'Gizlilik ve koşullar', iconName: 'lock' },
    h('div', { class: 'btn-row' },
      open('gizlilik', 'Gizlilik ve KVKK'), open('kosullar', 'Kullanım koşulları'), open('yapayzeka', 'Yapay zekâ onayı')),
    h('div', { class: 'btn-row' }, consentLine, withdraw));
}

// Developer mode: where Evra accounts live. The local service on this computer,
// or the Evra website, whose members are in Cloudflare D1.
function accountsServerField() {
  const input = h('input', { class: 'input', id: 'accounts-url', type: 'url', value: accountsUrl(), placeholder: WEBSITE_ACCOUNTS, spellcheck: 'false' });
  const save = h('button', { class: 'btn small', type: 'submit' }, 'Bu adresi kullan');
  const pick = (url, label) => h('button', { class: 'btn small ghost', type: 'button', onclick: () => { input.value = url; form.requestSubmit(); } }, label);
  const form = h('form', { class: 'stack dev-only accounts-server' },
    h('div', { class: 'field' }, h('label', { for: 'accounts-url' }, 'Evra hesapları adresi'), input,
      h('small', { class: 'muted' }, `Evra web sitesi (üye hesapları, Cloudflare D1): ${WEBSITE_ACCOUNTS}. Web sitesi olmadan çalışmak için bu bilgisayardaki yedek: ${LOCAL_ACCOUNTS}. Asistanın ACCOUNTS_URL ayarı aynı olmalı. Değiştirmek buradaki oturumu kapatır.`)),
    h('div', { class: 'btn-row' }, save, pick(WEBSITE_ACCOUNTS, 'Evra web sitesi'), pick(LOCAL_ACCOUNTS, 'Bu bilgisayar')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!/^https?:\/\/[^\s]+$/.test(url)) { toast('http:// ya da https:// ile başlayan bir adres girin', 'error'); return; }
    if (url.replace(/\/+$/, '') === accountsUrl()) { toast('Bu adres zaten kullanılıyor'); return; }
    useAccountsServer(url);
    toast('Evra hesapları adresi kaydedildi. Yeniden giriş yapın.');
  });
  return form;
}

// ---- notifications on this device (js/push.js) ---------------------------------------

function settingRow(title, hint, control) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('strong', null, title), hint ? h('small', null, hint) : null),
    control);
}

// ---- look and layout ----------------------------------------------------------------

// Themes to tap straight from Settings, and the ways into the Customize panel.
function lookCard() {
  const c = getCustom();
  const dark = effectiveTheme() === 'dark';
  const open = (tab) => window.dispatchEvent(new CustomEvent('evra-customize', { detail: { tab } }));
  const themes = h('div', { class: 'look-themes', role: 'radiogroup', 'aria-label': 'Tema' }, PALETTES.map((p) => {
    const m = dark ? p.dark : p.light;
    const active = c.palette === p.id;
    return h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(active), class: `cz-palette${active ? ' active' : ''}`,
      onclick: () => setCustom({ palette: p.id, background: 'auto', effects: [] }), // a theme always brings its own effects
    },
    h('span', { class: `cz-preview${p.motion ? ' moving' : ''}`, style: p.motion ? { background: m.bg, '--m1': p.m[0], '--m2': p.m[1], '--m3': p.m[2] } : { background: m.bg } },
      p.motion ? h('i', { class: 'cz-preview-glow' }) : null,
      h('span', { class: 'cz-preview-card', style: { background: m.card } }, [p.p.sky, p.p.splash, p.p.seawash].map((col) => h('i', { style: { background: col } })))),
    h('span', { class: 'cz-palette-name' }, active ? icon('check', 14) : null, p.name));
  }));
  return card({ title: 'Görünüm ve yerleşim', iconName: 'palette' },
    h('p', { class: 'muted small' }, 'Kullanmak için bir temaya dokunun. Hareketli temaların arkasında Evra web sitesindeki gibi efektler var. Sağ üstteki palet düğmesi bunların hepsini her ekrandan açar.'),
    themes,
    h('div', { class: 'look-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => { location.hash = '#/home'; setTimeout(() => window.dispatchEvent(new CustomEvent('evra-move')), 50); } }, icon('move', 16), 'Ana sayfada yer değiştir'),
      h('button', { class: 'btn', type: 'button', onclick: () => open('theme') }, icon('sparkle', 16), 'Temalar ve efektler'),
      h('button', { class: 'btn', type: 'button', onclick: () => open('buttons') }, icon('toggle', 16), 'Düğmeler'),
      h('button', { class: 'btn', type: 'button', onclick: () => open('layout') }, icon('devices', 16), 'Yerleşim ve gizlenenler')));
}
