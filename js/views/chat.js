// The Evra assistant: a chat that answers questions about the home.
//
// The app never holds the Gemini key. It talks to the assistant server on this
// computer (EvrAI/gemini_home_starter/server.py), sending the question plus how
// to see the home: in live mode the Home Assistant address and the app's own
// sign-in token (the server reads states with it, read-only); in demo mode the
// demo home itself. The assistant never changes anything itself: it sends back
// prepared changes, shown here as cards, and the app carries out the ones the
// person approves (assistant-actions.js), then tells the assistant the result.

import { HOME } from '../config.js';
import { store } from '../store.js';
import { h, loadSettings, saveSettings } from '../util.js';
import { icon } from '../icons.js';
import { getAccessToken } from '../backends/live.js';
import { PRODUCTS, PAIRING_LABEL } from '../catalog.js';
import { SCENES } from '../scenes.js';
import { runProposal, openInEditor } from '../assistant-actions.js';
import { canSpeak, speak, stopSpeaking, speakingId, guessLang } from '../speech.js';
import { member, accountToken, canUseAssistant, onAccount, refreshMember } from '../account.js';
import { accountPanel } from './account-ui.js';

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

async function demoAutomations() {
  const out = {};
  for (const s of store.all('automation')) {
    const id = s.attributes?.id;
    if (id) { try { out[id] = await store.backend.fetchAutomationConfig(id); } catch { /* skip */ } }
  }
  return out;
}

async function homeContext() {
  const b = store.backend;
  if (b?.mode === 'live') {
    let token;
    try { token = await getAccessToken(b.hassUrl, { interactive: false }); } catch { throw new Error('Sign in to Home Assistant first (Settings → Connect).'); }
    return { mode: 'live', hass_url: b.hassUrl, token, ...appInfo() };
  }
  return {
    mode: 'demo',
    ...appInfo(),
    snapshot: {
      automations: await demoAutomations(),
      states: [...store.states.values()],
      areas: [...store.areas.values()].map(({ area_id, name }) => ({ area_id, name })),
      devices: [...store.devices.values()].map(({ id, name, name_by_user, area_id, model, manufacturer, entry_type }) => ({ id, name, name_by_user, area_id, model, manufacturer, entry_type })),
      entities: [...store.entities.values()].map(({ entity_id, device_id, area_id, hidden_by, disabled_by, entity_category }) => ({ entity_id, device_id, area_id, hidden_by, disabled_by, entity_category })),
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

// Signed out, or a membership without the assistant: say why, and how to fix it.
function lockedView(root, cleanup) {
  const u = member();
  root.append(h('section', { class: 'chat chat-locked', 'aria-label': 'Evra' },
    h('header', { class: 'chat-head' },
      h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, icon('devil', 26)),
      h('div', { class: 'chat-titles' }, h('h2', null, 'Evra'),
        h('p', { class: 'chat-status' }, icon('lock', 14), u ? 'Üyeliğinizde yok' : 'Evra üyeleri için'))),
    u
      ? h('div', { class: 'card' },
        h('p', null, `Hesabınız (${u.username}) Evra asistanını içermiyor.`),
        h('p', { class: 'muted small' }, u.email
          ? 'Evra asistanı Premium planla gelir.'
          : 'Bir yöneticiden asistanı sizin için açmasını isteyin.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/settings' }, icon('person', 16), 'Hesabınız')))
      : h('div', { class: 'card' },
        h('p', null, 'Evra\'yı kullanmak için Evra hesabınızla giriş yapın.'),
        accountPanel(cleanup))));
}

export function renderChat(root, cleanup) {
  const local = [];
  cleanup.push(() => local.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } }));
  let shown = null;
  const draw = () => {
    const key = `${member()?.id || ''}:${canUseAssistant()}`;
    if (key === shown) return;
    shown = key;
    local.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    root.replaceChildren();
    if (canUseAssistant()) chatView(root, local); else lockedView(root, local);
  };
  cleanup.push(onAccount(draw));
  draw();
  refreshMember();
}

// Where to start the assistant: on this computer, or (opened on a phone) on the computer serving the app.
const onThisComputer = () => ['localhost', '127.0.0.1', ''].includes(location.hostname);
const startHint = () => (onThisComputer() ? '"Start Evra.bat" ile başlatın' : 'bilgisayarda Evra\'yı "Start Evra on phone.bat" ile başlatın');

function chatView(root, cleanup) {
  const base = loadSettings().assistantUrl.replace(/\/+$/, '');
  const chat = loadChat();
  let busy = false;
  let alive = true;
  cleanup.push(() => { alive = false; });

  const status = h('p', { class: 'chat-status', role: 'status' }, h('span', { class: 'status-dot connecting' }), 'Evra\'ya bağlanılıyor…');
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
    h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, icon('devil', 26)),
    h('div', { class: 'chat-titles' }, h('h2', null, 'Evra'), status),
    h('div', { class: 'chat-head-actions' }, ...[voiceBtn, newChat].filter(Boolean)));

  const intro = h('div', { class: 'msg assistant intro' },
    h('div', { class: 'msg-body' }, h('p', null, 'Merhaba, ben Evra! Eviniz hakkında her şeyi sorabilir ya da neyi değiştirmek istediğinizi söyleyebilirsiniz: cihazlar, sahneler, otomasyonlar, odalar, yeni cihaz eşleştirme, Evra ürünleri.'),
      h('p', { class: 'muted small' }, 'Her değişikliği bir kart olarak hazırlarım; siz Onayla\'ya basmadan hiçbir şey olmaz.')));
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': 'Evra ile sohbet', tabindex: '0' });
  const suggest = h('div', { class: 'chat-suggest', role: 'group', 'aria-label': 'Önerilen sorular' },
    SUGGESTIONS.map((q) => h('button', { type: 'button', class: 'room-chip small', onclick: () => ask(q) }, q)));

  const input = h('textarea', {
    id: 'chat-input', class: 'chat-input', rows: 1, maxlength: 1500, placeholder: 'Evra\'ya sorun…',
    'aria-describedby': 'chat-note', enterkeyhint: 'send', autocomplete: 'off',
  });
  const send = h('button', { class: 'btn primary chat-send', type: 'submit' }, icon('send', 18), h('span', { class: 'sr-only' }, 'Gönder'));
  const form = h('form', { class: 'chat-form' },
    h('label', { for: 'chat-input', class: 'sr-only' }, 'Evra\'ya mesaj'), input, send);
  const note = h('p', { id: 'chat-note', class: 'chat-note muted small' },
    'Yanıt için sorunuz ve cihazlarınızın adları, odaları ve durumları Google Gemini\'ye gönderilir.');

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
          const r = await runProposal(p);
          report(r.ok ? 'done' : 'failed', r.detail);
          finish(r.ok ? 'done' : 'failed', r.detail);
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
  const speakMessage = (m) => speak(spokenText(m), { id: m, onstart: () => speakers.get(m)?.(true), onend: () => speakers.get(m)?.(false) });
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
      h('span', { class: 'sr-only' }, m.role === 'user' ? 'Siz: ' : 'Evra: '),
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

  async function ask(text, isRetry = false) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!isRetry) add({ role: 'user', text });
    stopSpeaking();
    busy = true;
    send.disabled = true;
    log.setAttribute('aria-busy', 'true');
    const thinking = h('div', { class: 'msg assistant thinking' },
      h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      h('span', { class: 'sr-only' }, 'Evra düşünüyor…'));
    log.append(thinking);
    reveal(thinking);
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
      if (alive) {
        const reply = { role: 'assistant', text: j.reply, proposals: (j.proposals || []).map((p) => ({ ...p, status: 'pending' })) };
        add(reply);
        if (loadSettings().speakReplies) speakMessage(reply);
      }
    } catch (e) {
      const message = e instanceof TypeError
        ? `Evra'ya ulaşılamıyor. ${onThisComputer() ? 'Bu bilgisayarda' : 'Uygulamayı açan bilgisayarda'} çalışır: ${startHint()}.`
        : e.message;
      if (alive) add({ role: 'assistant', text: message, error: true, retry: text });
    } finally {
      thinking.remove();
      log.removeAttribute('aria-busy');
      busy = false;
      send.disabled = false;
    }
  }

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

  newChat.addEventListener('click', () => {
    fetch(`${base}/reset`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ session: chat.session }) }).catch(() => {});
    stopSpeaking();
    chat.session = newSession();
    chat.messages = [];
    saveChat(chat);
    drawAll();
    input.focus();
  });

  async function checkHealth() {
    const where = store.backend?.mode === 'live' ? 'Evinizden yanıtlar' : 'Örnek evden yanıtlar';
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      const j = await res.json();
      if (!alive) return;
      status.replaceChildren(h('span', { class: `status-dot ${j.key ? 'connected' : 'error'}` }), j.key ? `Hazır · ${where}` : 'Evra\'nın Gemini anahtarı yok');
    } catch {
      if (!alive) return;
      status.replaceChildren(h('span', { class: 'status-dot error' }), `Çalışmıyor. ${startHint()}.`);
    }
  }

  root.append(h('section', { class: 'chat', 'aria-label': 'Evra' }, head, log, suggest, h('div', { class: 'chat-dock' }, form, note)));
  drawAll();
  checkHealth();
  if (chat.messages.length) reveal(log.lastElementChild);
}
