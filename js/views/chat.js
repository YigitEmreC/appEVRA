// The Evra assistant: a chat that answers questions about the home.
//
// The app never holds the Gemini key. It talks to the assistant on the Evra website
// (https://evrasmarthome.com/api/assistant, webEVRA functions/api/assistant.js), which
// checks the Evra membership (Premium) and the monthly question limit itself.
// With each question the app sends only what's needed: a filtered list of the home's
// devices, rooms, states and automations (no locks, cameras, alarms or people, and
// never the Home Assistant sign-in). The member's name, e-mail, address and phone are
// never sent. The assistant never connects to the home and never changes anything: it
// sends back prepared changes, shown here as cards, and the app carries out the ones
// the person approves (assistant-actions.js), then tells the assistant the result.
// Members without the assistant get the locked screen and nothing is sent anywhere.

import { HOME } from '../config.js';
import { store } from '../store.js';
import { h, loadSettings, saveSettings, toast } from '../util.js';
import { icon } from '../icons.js';
import { PRODUCTS, PAIRING_LABEL } from '../catalog.js';
import { SCENES } from '../scenes.js';
import { runProposal, openInEditor } from '../assistant-actions.js';
import { canSpeak, speak, stopSpeaking, speakingId, guessLang, canListen, listen } from '../speech.js';
import { member, accountToken, canUseAssistant, onAccount, refreshMember, plansUrl } from '../account.js';
import { accountPanel } from './account-ui.js';
import { openLegal, AI_CONSENT_VERSION } from '../legal.js';
import { mascot } from '../mascot.js';
import { pauseWake, resumeWake } from '../wake.js';
import { createMascot } from '../mascot-puppet.js';

const CHAT_KEY = 'evra.chat';
const MAX_KEPT = 60; // messages kept for this browser tab
// Evra speaks Turkish first (it answers in English when written to in English).
const SUGGESTIONS = [
  'Evde şu an neler oluyor?',
  'Açık pencere var mı?',
  'LED\'i %40 sıcak beyaz yap',
  'Her gece yarısı ışıkları kapat',
  'Yeni bir cihaz eklemek istiyorum',
  'Bebek odası için ne önerirsin?',
];

const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// The conversation kept in this tab belongs to the member who had it.
function loadChat() {
  const owner = member()?.id || null;
  try {
    const c = JSON.parse(sessionStorage.getItem(CHAT_KEY) || 'null');
    if (c && c.session && Array.isArray(c.messages) && c.owner === owner) return c;
  } catch { /* nothing kept */ }
  return { session: newSession(), messages: [], owner };
}

// Requests to the assistant carry the Evra sign-in; the server checks it every time.
const authHeaders = () => ({ 'Content-Type': 'application/json', ...(accountToken() ? { Authorization: `Bearer ${accountToken()}` } : {}) });
function saveChat(c) {
  try { sessionStorage.setItem(CHAT_KEY, JSON.stringify({ ...c, messages: c.messages.slice(-MAX_KEPT) })); } catch { /* not kept */ }
}

// What the assistant should know about this home's own setup.
function hints() {
  const out = {};
  if (HOME.tv?.tracker) out[HOME.tv.tracker] = 'Whether the TV is on. The TV is worked by infrared and can\'t report back, so the app keeps track of it; this can be wrong after someone used the physical remote.';
  if (HOME.heater?.tracker) out[HOME.heater.tracker] = 'Whether the electric heater is on. Tracked by the app like the TV, so it can be wrong after using the heater\'s own remote.';
  return out;
}

// What the app knows about itself that the assistant needs to prepare changes.
function appInfo() {
  const power = {};
  if (HOME.tv?.tracker) power[HOME.tv.tracker] = 'tv';
  if (HOME.heater?.tracker) power[HOME.heater.tracker] = 'heater';
  return {
    hints: hints(),
    power,
    catalog: PRODUCTS.filter((p) => p.pairing !== 'none').map((p) => ({ id: p.id, name: p.name, model: p.model, pairing: p.pairing, how: PAIRING_LABEL[p.pairing] })),
    scenes: SCENES.map(({ id, name, text }) => ({ id, name, text })),
  };
}

async function automationConfigs() {
  const out = {};
  await Promise.all(store.all('automation').map(async (s) => {
    const id = s.attributes?.id;
    if (id) { try { const cfg = await store.backend.fetchAutomationConfig(id); if (cfg) out[id] = cfg; } catch { /* skip */ } }
  }));
  return out;
}

// What the assistant may see of the home. Locks, cameras, alarms, people and phone
// locations never leave the app; of each state only the details below are sent.
const SHARED_DOMAINS = new Set(['light', 'switch', 'sensor', 'binary_sensor', 'fan', 'climate', 'cover', 'valve', 'siren',
  'media_player', 'automation', 'update', 'input_boolean', 'weather', 'sun', 'button', 'event', 'vacuum']);
const SHARED_ATTRS = ['friendly_name', 'id', 'device_class', 'unit_of_measurement', 'battery_level', 'brightness', 'color_mode',
  'color_temp_kelvin', 'hs_color', 'effect', 'effect_list', 'temperature', 'current_temperature', 'hvac_action', 'humidity',
  'current_position', 'last_triggered', 'next_rising', 'next_setting', 'wind_speed', 'pressure', 'installed_version',
  'latest_version', 'release_summary', 'in_progress', 'title', 'supported_color_modes', 'min_temp', 'max_temp'];
const shared = (id) => SHARED_DOMAINS.has(String(id).split('.')[0]);
function sharedState(s) {
  const attributes = {};
  for (const k of SHARED_ATTRS) if (s.attributes?.[k] != null) attributes[k] = s.attributes[k];
  return { entity_id: s.entity_id, state: s.state, attributes, last_changed: s.last_changed };
}

// The home as the assistant sees it, the same for a real home and the demo home.
async function homeContext() {
  if (!store.backend) throw new Error('Ev henüz bağlanmadı. Biraz sonra tekrar deneyin.');
  return {
    mode: store.backend.mode === 'live' ? 'live' : 'demo',
    ...appInfo(),
    snapshot: {
      automations: await automationConfigs(),
      states: [...store.states.values()].filter((s) => shared(s.entity_id)).map(sharedState),
      areas: [...store.areas.values()].map(({ area_id, name }) => ({ area_id, name })),
      devices: [...store.devices.values()].map(({ id, name, name_by_user, area_id, model, manufacturer, entry_type }) => ({ id, name, name_by_user, area_id, model, manufacturer, entry_type })),
      entities: [...store.entities.values()].filter((e) => shared(e.entity_id))
        .map(({ entity_id, device_id, area_id, hidden_by, disabled_by, entity_category }) => ({ entity_id, device_id, area_id, hidden_by, disabled_by, entity_category })),
    },
  };
}

// ---- turning a reply into paragraphs and lists (no HTML from the model) ----

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => (part.startsWith('**') && part.endsWith('**') && part.length > 4
    ? h('strong', null, part.slice(2, -2))
    : document.createTextNode(part.replace(/(^|\s)\*(\S)/g, '$1$2').replace(/(\S)\*(\s|$)/g, '$1$2'))));
}

function richText(text) {
  const frag = document.createDocumentFragment();
  const item = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;
  let list = null;
  let para = null;
  for (const line of String(text).split('\n')) {
    const m = item.exec(line);
    if (!line.trim()) { list = null; para = null; continue; }
    if (m) {
      para = null;
      if (!list || (list.tagName === 'OL') !== Boolean(m[1])) { list = h(m[1] ? 'ol' : 'ul'); frag.append(list); }
      list.append(h('li', null, inline(m[2])));
    } else {
      list = null;
      if (para) para.append(h('br')); else { para = h('p'); frag.append(para); }
      para.append(...inline(line.trim()));
    }
  }
  return frag;
}

// ---- the screen ----

// Signed out, or a membership without the assistant: say why, and how to get it.
// Nothing is sent to the assistant from here.
function lockedView(root, cleanup) {
  const u = member();
  root.append(h('section', { class: 'chat chat-locked', 'aria-label': 'EvrAI' },
    h('header', { class: 'chat-head' },
      h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, mascot(46, { locked: Boolean(member()) })),
      h('div', { class: 'chat-titles' }, h('h2', null, 'EvrAI'),
        h('p', { class: 'chat-status' }, icon('lock', 14), u ? 'Premium planla gelir' : 'Evra üyeleri için'))),
    u
      ? h('div', { class: 'card chat-plans' },
        h('h3', null, 'EvrAI Premium planda'),
        h('p', null, 'Plan bütün ev için geçerlidir: evdeki bir kişinin Premium aboneliği, eve bağlı herkese asistanı açar. Evinizi sohbetle yönetin:'),
        h('ul', null,
          h('li', null, 'Evde neler olduğunu sorun: açık pencereler, sıcaklık, pil durumları'),
          h('li', null, '"Salonun ışığını %40 yap" deyin; değişiklik bir kart olarak hazırlanır, siz onaylarsınız'),
          h('li', null, 'Otomasyonları ve yeni cihaz eşleştirmeyi adım adım birlikte yapın')),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn primary', href: plansUrl(), target: '_blank', rel: 'noopener' }, icon('sparkle', 16), 'Planları gör'),
          h('a', { class: 'btn ghost', href: '#/settings' }, icon('person', 16), 'Hesabınız')),
        h('p', { class: 'muted small' }, 'Premium\'a geçtiyseniz uygulamayı yenileyin; asistan hemen açılır.'))
      : h('div', { class: 'card' },
        h('p', null, 'Evra\'yı kullanmak için Evra hesabınızla giriş yapın.'),
        accountPanel(cleanup))));
}

// #/chat?ask=… (from a product page's questions) puts that question in the box, ready to send.
export function renderChat(root, cleanup, ctx) {
  let ask = ctx?.query?.get('ask') || '';
  if (ask) history.replaceState(null, '', '#/chat');
  const local = [];
  cleanup.push(() => local.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } }));
  let shown = null;
  const consented = () => (loadSettings().aiConsent?.version || 0) >= AI_CONSENT_VERSION;
  const draw = () => {
    const key = `${member()?.id || ''}:${canUseAssistant()}:${consented()}`;
    if (key === shown) return;
    shown = key;
    local.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    root.replaceChildren();
    if (!canUseAssistant()) lockedView(root, local);
    else if (!consented()) consentView(root, draw);
    else { chatView(root, local, ask); ask = ''; }
  };
  cleanup.push(onAccount(draw));
  draw();
  refreshMember();
}

// Before the first question: the assistant sends questions and device states to
// Google (abroad), which needs the member's explicit consent (KVKK m.9). Nothing is
// sent until they accept; the rest of the app works either way. Taken back in Settings.
function consentView(root, redraw) {
  const accept = h('button', { class: 'btn primary', type: 'button' }, icon('check', 16), 'Okudum, onaylıyorum');
  accept.addEventListener('click', () => {
    saveSettings({ aiConsent: { version: AI_CONSENT_VERSION, at: new Date().toISOString() } });
    redraw();
  });
  root.append(h('section', { class: 'chat chat-locked chat-consent', 'aria-label': 'EvrAI onayı' },
    h('header', { class: 'chat-head' },
      h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, mascot(46)),
      h('div', { class: 'chat-titles' }, h('h2', null, 'EvrAI'),
        h('p', { class: 'chat-status' }, icon('lock', 14), 'Kullanmadan önce onayınız gerekiyor'))),
    h('div', { class: 'card' },
      h('h3', null, 'EvrAI\'ı kullanmadan önce'),
      h('p', null, 'Asistan, yanıtlarını Google\'ın Gemini yapay zekâsıyla hazırlar. Bunun için sorularınız ve cihazlarınızın adları, odaları ve durumları yurt dışındaki sunuculara aktarılır. Adınız, e-postanız, adresiniz, telefonunuz, kamera görüntüleri, kilitler, şifreler ve ödeme bilgileri gönderilmez; konuşmalar en fazla 30 dakika saklanır, sonra silinir.'),
      h('p', { class: 'muted small' }, 'Onay vermezseniz asistan kapalı kalır; uygulamanın diğer bütün özellikleri çalışır. Onayınızı Ayarlar → Gizlilik ve koşullar bölümünden geri alabilirsiniz.'),
      h('div', { class: 'btn-row' }, accept,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => openLegal('yapayzeka') }, 'Metnin tamamını oku')))));
}

function chatView(root, cleanup, prefill = '') {
  const base = loadSettings().assistantUrl.replace(/\/+$/, '');
  const chat = loadChat();
  let busy = false;
  let alive = true;
  cleanup.push(() => { alive = false; });
  // Evra's mascot hangs out by the message box: next to it on wide screens, peeking over it on phones.
  const puppet = createMascot();
  cleanup.push(() => puppet.destroy());
  let typingTimer = 0;
  cleanup.push(() => clearTimeout(typingTimer));

  const status = h('p', { class: 'chat-status', role: 'status' }, h('span', { class: 'status-dot connecting' }), 'EvrAI\'ya bağlanılıyor…');
  const newChat = h('button', { class: 'btn ghost small', type: 'button' }, icon('refresh', 14), 'Yeni sohbet');
  // Read aloud: new replies are spoken as they arrive (each reply also has its own Listen button).
  const voiceBtn = canSpeak() ? h('button', { class: 'btn ghost small voice-btn', type: 'button' }) : null;
  const paintVoice = () => {
    const on = loadSettings().speakReplies;
    voiceBtn.setAttribute('aria-pressed', String(on));
    voiceBtn.title = on ? 'Yeni yanıtlar sesli okunuyor' : 'Yeni yanıtları sesli oku';
    voiceBtn.replaceChildren(icon(on ? 'volume' : 'mute', 14), 'Sesli oku');
  };
  if (voiceBtn) {
    paintVoice();
    voiceBtn.addEventListener('click', () => {
      const on = !loadSettings().speakReplies;
      saveSettings({ speakReplies: on });
      if (!on) stopSpeaking();
      paintVoice();
    });
  }
  cleanup.push(stopSpeaking); // leaving the tab stops the voice
  const head = h('header', { class: 'chat-head' },
    h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, mascot(46)),
    h('div', { class: 'chat-titles' }, h('h2', null, 'EvrAI'), status),
    h('div', { class: 'chat-head-actions' }, ...[voiceBtn, newChat].filter(Boolean)));

  const intro = h('div', { class: 'msg assistant intro' },
    h('div', { class: 'msg-body' }, h('p', null, 'Merhaba, ben EvrAI! Eviniz hakkında her şeyi sorabilir ya da neyi değiştirmek istediğinizi söyleyebilirsiniz: cihazlar, sahneler, otomasyonlar, odalar, yeni cihaz eşleştirme, Evra ürünleri.'),
      h('p', { class: 'muted small' }, 'Her değişikliği bir kart olarak hazırlarım; siz Onayla\'ya basmadan hiçbir şey olmaz.')));
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'EvrAI ile sohbet', tabindex: '0' });
  const suggest = h('div', { class: 'chat-suggest', role: 'group', 'aria-label': 'Önerilen sorular' },
    SUGGESTIONS.map((q) => h('button', { type: 'button', class: 'room-chip small', onclick: () => ask(q) }, q)));

  const input = h('textarea', {
    id: 'chat-input', class: 'chat-input', rows: 1, maxlength: 1500, placeholder: 'EvrAI\'ya sorun…',
    'aria-describedby': 'chat-note', enterkeyhint: 'send', autocomplete: 'off',
  });
  const send = h('button', { class: 'btn primary chat-send', type: 'submit' }, icon('send', 18), h('span', { class: 'sr-only' }, 'Gönder'));
  // Ask by voice: tap, speak, and the question goes by itself; the reply is read aloud.
  const mic = canListen() ? h('button', { class: 'btn ghost chat-mic', type: 'button', 'aria-pressed': 'false', title: 'Sesle sorun' },
    icon('mic', 18), h('span', { class: 'sr-only' }, 'Sesle sorun')) : null;
  const form = h('form', { class: 'chat-form' },
    h('label', { for: 'chat-input', class: 'sr-only' }, 'EvrAI\'ya mesaj'), input, mic, send);
  const note = h('p', { id: 'chat-note', class: 'chat-note muted small' },
    'Yanıt için sorunuz ve cihazlarınızın adları, odaları ve durumları Google Gemini\'ye gönderilir.',
    mic ? ' Sesle sorduğunuzda sesiniz tarayıcınızın ses tanıma hizmetinde yazıya çevrilir; Evra ses kaydı almaz.' : '');

  // ---- changes the assistant prepared: nothing happens until Approve ----
  const KIND_ICON = { control: 'power', press: 'remote', scene: 'scenes', automation: 'robot', room: 'rooms', device: 'devices', update: 'refresh', setting: 'gear' };
  function proposalCard(p, m) {
    const result = h('p', { class: 'proposal-result', role: 'status', tabindex: '-1' });
    const buttons = h('div', { class: 'proposal-actions' });
    const card = h('div', { class: `proposal${p.danger ? ' danger' : ''}`, role: 'group', 'aria-label': `Hazırlanan değişiklik: ${p.title}` },
      h('div', { class: 'proposal-head' }, h('span', { class: 'proposal-icon', 'aria-hidden': 'true' }, icon(KIND_ICON[p.kind] || 'sparkle', 16)), h('strong', null, p.title)),
      p.details?.length ? h('ul', { class: 'proposal-details' }, p.details.map((d) => h('li', null, d))) : null,
      buttons, result);
    const report = (status, detail) => fetch(`${base}/outcome`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ session: chat.session, proposal: p.id, status, detail }),
    }).catch(() => {});
    const finish = (status, text) => {
      p.status = status;
      p.result = text;
      saveChat(chat);
      draw();
      result.focus();
    };
    function draw() {
      card.dataset.status = p.status || 'pending';
      if (!p.status || p.status === 'pending') {
        const approve = h('button', { class: `btn small ${p.danger ? 'danger' : 'primary'}`, type: 'button' }, icon('check', 14), 'Onayla', h('span', { class: 'sr-only' }, `: ${p.title}`));
        const cancel = h('button', { class: 'btn small ghost', type: 'button' }, 'İptal', h('span', { class: 'sr-only' }, `: ${p.title}`));
        const review = p.editable ? h('button', { class: 'btn small ghost', type: 'button' }, icon('edit', 14), 'Düzenleyicide incele') : null;
        approve.addEventListener('click', async () => {
          buttons.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          result.textContent = 'Yapılıyor…';
          puppet.set('thinking');
          const r = await runProposal(p);
          report(r.ok ? 'done' : 'failed', r.detail);
          finish(r.ok ? 'done' : 'failed', r.detail);
          puppet.set(r.ok ? 'happy' : 'sad', r.ok ? 1300 : 2400);
          puppet.say(r.ok ? 'Tamamdır!' : 'Olmadı, bir bakalım…', 2200);
        });
        cancel.addEventListener('click', () => { report('cancelled', ''); finish('cancelled', 'İptal edildi'); });
        review?.addEventListener('click', () => {
          report('done', 'Otomasyon düzenleyicide açıldı; kişi orada kontrol edip kaydedecek (henüz kaydedilmedi)');
          p.status = 'review'; p.result = 'Düzenleyicide açıldı'; saveChat(chat);
          openInEditor(p);
        });
        buttons.replaceChildren(...[approve, cancel, review].filter(Boolean));
        result.textContent = '';
      } else {
        buttons.replaceChildren();
        result.replaceChildren(icon(p.status === 'done' || p.status === 'review' ? 'check' : p.status === 'failed' ? 'alert' : 'close', 14),
          ` ${p.status === 'failed' ? 'Olmadı: ' : ''}${p.result || ''}`);
      }
    }
    draw();
    return card;
  }

  // ---- reading replies aloud ----
  const speakers = new WeakMap(); // message -> its Listen button's painter
  // The reply, then the prepared changes, in the reply's language.
  const spokenText = (m) => {
    const n = m.proposals?.length || 0;
    if (!n) return m.text;
    const titles = m.proposals.map((p) => p.title).join('; ');
    return guessLang(m.text || '') === 'tr-TR'
      ? `${m.text}\n${n === 1 ? 'Hazırlanan değişiklik' : 'Hazırlanan değişiklikler'}: ${titles}. Onaylamak için aşağıya bakın.`
      : `${m.text}\n${n === 1 ? 'Prepared change' : 'Prepared changes'}: ${titles}. Approve below to go ahead.`;
  };
  const speakMessage = (m) => speak(spokenText(m), {
    id: m,
    onstart: () => { speakers.get(m)?.(true); puppet.set('talking'); },
    onend: () => { speakers.get(m)?.(false); if (puppet.state === 'talking') puppet.set('idle'); },
  });
  function listenButton(m) {
    const btn = h('button', { class: 'btn small ghost msg-listen', type: 'button' });
    const paint = (on) => {
      btn.setAttribute('aria-pressed', String(on));
      btn.replaceChildren(icon(on ? 'stop' : 'volume', 14), on ? 'Durdur' : 'Dinle', h('span', { class: 'sr-only' }, on ? ' okumayı' : ' (bu yanıtı)'));
    };
    paint(speakingId() === m);
    speakers.set(m, paint);
    btn.addEventListener('click', () => { if (speakingId() === m) stopSpeaking(); else speakMessage(m); });
    return h('div', { class: 'msg-tools' }, btn);
  }

  function bubble(m) {
    const el = h('div', { class: `msg ${m.role}${m.error ? ' error' : ''}` },
      h('span', { class: 'sr-only' }, m.role === 'user' ? 'Siz: ' : 'EvrAI: '),
      h('div', { class: 'msg-body' }, m.role === 'assistant' && !m.error ? richText(m.text) : h('p', null, m.text)),
      m.proposals?.length ? h('div', { class: 'proposals' }, m.proposals.map((p) => proposalCard(p, m))) : null,
      m.role === 'assistant' && !m.error && canSpeak() ? listenButton(m) : null);
    if (m.error && m.retry) {
      el.append(h('button', {
        class: 'btn small', type: 'button',
        onclick: () => { chat.messages.splice(chat.messages.indexOf(m), 1); el.remove(); saveChat(chat); ask(m.retry, true); },
      }, icon('refresh', 14), 'Tekrar dene'));
    }
    return el;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal = (el) => requestAnimationFrame(() => el.scrollIntoView({ block: 'end', behavior: reduceMotion ? 'auto' : 'smooth' }));
  function add(m) {
    chat.messages.push(m);
    saveChat(chat);
    const el = bubble(m);
    log.append(el);
    suggest.hidden = true;
    reveal(el);
  }
  function drawAll() {
    log.replaceChildren(intro, ...chat.messages.map(bubble));
    suggest.hidden = chat.messages.length > 0;
  }

  async function ask(text, isRetry = false, byVoice = false) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!isRetry) add({ role: 'user', text });
    stopSpeaking();
    busy = true;
    send.disabled = true;
    log.setAttribute('aria-busy', 'true');
    const thinking = h('div', { class: 'msg assistant thinking' },
      h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'sr-only' }, 'EvrAI düşünüyor…'));
    log.append(thinking);
    reveal(thinking);
    puppet.set('thinking');
    puppet.say(byVoice ? 'Hmm, bir bakayım…' : 'Hmm, düşünüyorum…', 0);
    try {
      const home = await homeContext();
      const res = await fetch(`${base}/chat`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ session: chat.session, message: text, home }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Signed out or access switched off: refresh the account, which locks the tab if needed.
        if (j.code === 'signin' || j.code === 'no_access') refreshMember();
        throw new Error(j.error || `Evra bir hatayla yanıt verdi (${res.status}).`);
      }
      if (j.usage) showUsage(j.usage);
      if (alive) {
        const reply = { role: 'assistant', text: j.reply, proposals: (j.proposals || []).map((p) => ({ ...p, status: 'pending' })) };
        add(reply);
        puppet.say(reply.proposals.length ? 'Hazırladım; onayınızı bekliyorum.' : '', 3200);
        if (loadSettings().speakReplies || byVoice) speakMessage(reply); // asked by voice: answered by voice
        else puppet.set('talking', Math.min(4500, Math.max(1300, (reply.text || '').length * 28)));
      }
    } catch (e) {
      const message = e instanceof TypeError
        ? 'EvrAI\'ya ulaşılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyin.'
        : e.message;
      if (alive) {
        add({ role: 'assistant', text: message, error: true, retry: text });
        puppet.set('sad', 2600);
        puppet.say('Hay aksi, olmadı…', 2600);
      }
    } finally {
      thinking.remove();
      log.removeAttribute('aria-busy');
      busy = false;
      send.disabled = false;
    }
  }

  // ---- listening ----
  let hearing = null;
  const paintMic = (on) => {
    mic.setAttribute('aria-pressed', String(on));
    mic.classList.toggle('listening', on);
    mic.title = on ? 'Dinliyorum… bitirmek için dokunun' : 'Sesle sorun';
    input.placeholder = on ? 'Dinliyorum…' : 'EvrAI\'ya sorun…';
    if (on) { puppet.set('listening'); puppet.say('Dinliyorum…', 0); } else if (puppet.state === 'listening') { puppet.set('idle'); puppet.say(''); }
  };
  mic?.addEventListener('click', async () => {
    if (hearing) { hearing.stop(); return; }
    if (busy) return;
    const before = input.value;
    pauseWake(); // "Hey EvrAI" steps aside while this mic listens
    hearing = listen({ onText: (t) => { input.value = t; grow(); } });
    paintMic(true);
    try {
      const text = await hearing.done;
      if (text && alive) { input.value = ''; grow(); ask(text, false, true); } else if (alive) input.value = before;
    } catch (err) {
      if (alive) { input.value = before; toast(err.message, 'error'); }
    } finally {
      hearing = null;
      resumeWake();
      if (alive) paintMic(false);
    }
  });
  cleanup.push(() => hearing?.cancel());
  // "Hey EvrAI" heard elsewhere in the app (js/wake.js): listen for the question.
  const onWake = () => { if (mic && !hearing && !busy) mic.click(); };
  window.addEventListener('evrai-wake', onWake);
  cleanup.push(() => window.removeEventListener('evrai-wake', onWake));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim() || busy) return;
    input.value = '';
    grow();
    ask(text);
    input.focus();
  });
  // Enter sends, Shift+Enter starts a new line.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener('input', grow);
  // While the person types, the mascot watches the box.
  input.addEventListener('input', () => {
    if (busy) return;
    puppet.lookAt(...(section.classList.contains('has-peek') ? [-0.5, 1] : [-1, 0.55]));
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => puppet.lookAt(null), 1400);
  });

  newChat.addEventListener('click', () => {
    fetch(`${base}/reset`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ session: chat.session }) }).catch(() => {});
    stopSpeaking();
    chat.session = newSession();
    chat.messages = [];
    saveChat(chat);
    drawAll();
    input.focus();
    puppet.set('wave', 1600);
    puppet.say('Temiz bir sayfa açtık!', 2200);
  });

  // Connects only now, when the assistant's tab is open (and only for members with the assistant).
  const where = () => (store.backend?.mode === 'live' ? 'Evinizden yanıtlar' : 'Örnek evden yanıtlar');
  const ready = (usage) => [h('span', { class: 'status-dot connected' }), `Hazır · ${where()}`,
    usage && usage.limit ? h('span', { class: 'chat-usage muted' }, `· bu ay ${usage.used}/${usage.limit} soru`) : null].filter(Boolean);
  function showUsage(usage) { if (alive) status.replaceChildren(...ready(usage)); }
  async function checkHealth() {
    try {
      const res = await fetch(`${base}/health`, { headers: authHeaders(), signal: AbortSignal.timeout(6000) });
      const j = await res.json();
      if (!alive) return;
      if (j.access === false) { refreshMember(); return; } // the plan changed: the tab locks itself
      if (j.key) showUsage(j.access ? { used: j.used, limit: j.limit } : null);
      else status.replaceChildren(h('span', { class: 'status-dot error' }), 'Asistan henüz kurulmadı');
    } catch {
      if (!alive) return;
      status.replaceChildren(h('span', { class: 'status-dot error' }), 'Evra\'ya ulaşılamıyor. İnternet bağlantınızı kontrol edin.');
    }
  }

  const section = h('section', { class: 'chat', 'aria-label': 'EvrAI' }, head, log, suggest, h('div', { class: 'chat-dock' }, puppet.el, form, note));
  root.append(section);
  // Whole body when there's room beside the conversation, else peeking over the message box.
  const fit = () => {
    const peek = window.innerWidth - section.getBoundingClientRect().right < 236;
    puppet.mode(peek ? 'peek' : 'stand');
    section.classList.toggle('has-peek', peek);
  };
  window.addEventListener('resize', fit);
  cleanup.push(() => window.removeEventListener('resize', fit));
  fit();
  requestAnimationFrame(fit);
  setTimeout(() => {
    if (!alive || busy) return;
    puppet.set('wave', 2000);
    puppet.say(chat.messages.length ? 'Tekrar hoş geldiniz!' : 'Merhaba! Ben EvrAI. Ne yapalım?', 3200);
  }, 450);
  drawAll();
  checkHealth();
  if (chat.messages.length) reveal(log.lastElementChild);
  if (prefill) {
    input.value = prefill.slice(0, 1500);
    grow();
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  }
}
