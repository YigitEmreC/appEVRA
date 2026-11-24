// Reading the assistant's replies aloud, with the browser's own text to speech
// (the Web Speech API). It needs no server or key, and the app sends nothing anywhere
// for it. The voices are the system's and the browser's: Edge has natural-sounding
// "Online (Natural)" voices, Turkish included; Chrome has Google voices; phones use
// their own. A browser without speech simply doesn't show the buttons (canSpeak).

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;
/** Turkish when the text has Turkish letters, otherwise English. */
export const guessLang = (text) => (TURKISH.test(text) ? 'tr-TR' : 'en-US');

/** The best voice for a language: natural/online voices first, then an exact match. */
function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const base = lang.slice(0, 2).toLowerCase();
  const score = (v) => (/natural|online|neural/i.test(v.name) ? 4 : 0) + (v.lang === lang ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
  return voices.filter((v) => (v.lang || '').toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a))[0] || null;
}

/** What to say: the reply without list marks, emphasis marks or web addresses. */
export function speakable(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'bir bağlantı')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*|__|[*#>]/g, '').trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;,]$/.test(line) ? line : `${line}.`)) // a pause after each list item
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Some browsers stop a long utterance after about 15 seconds, so it's read sentence by sentence.
function pieces(text, max = 220) {
  const out = [];
  let cur = '';
  for (const s of text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]) {
    if (cur && (cur + s).length > max) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

let current = null; // { id, token, onend }

/** Reads text aloud, stopping anything already being read. id says what's being read (see speakingId). */
export function speak(text, { id = null, onstart, onend } = {}) {
  stopSpeaking();
  const clean = speakable(text);
  if (!clean || !canSpeak()) return false;
  const lang = guessLang(clean);
  const voice = pickVoice(lang);
  const token = {};
  current = { id, token, onend };
  const parts = pieces(clean);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = voice?.lang || lang;
    if (voice) u.voice = voice;
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => {
        if (current?.token !== token) return; // stopped or replaced meanwhile
        current = null;
        onend?.();
      };
    }
    speechSynthesis.speak(u);
  });
  onstart?.();
  return true;
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  const was = current;
  current = null;
  speechSynthesis.cancel();
  was?.onend?.();
}

export const speakingId = () => current?.id ?? null;

// ---- listening: the browser's own speech to text, for asking Evra by voice ----
// Chrome, Edge and Safari (iPhone too) have it; it needs a secure page (https or
// localhost), so on a plain http:// home-network address the mic button isn't shown.
// The browser's speech service (Google or Apple) turns the voice into text; Evra gets
// only the text and never records or keeps audio.
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
export const canListen = () => Boolean(Recognition) && Boolean(window.isSecureContext);

const LISTEN_ERRORS = {
  'not-allowed': 'Mikrofon izni verilmedi. Tarayıcının adres çubuğundan mikrofona izin verin.',
  'service-not-allowed': 'Bu tarayıcıda sesli giriş kapalı.',
  'audio-capture': 'Mikrofon bulunamadı.',
  network: 'Ses tanıma için internet bağlantısı gerekiyor.',
  'language-not-supported': 'Bu tarayıcı Türkçe ses tanımayı desteklemiyor.',
};

/**
 * Listens for one question. onText(text) is called as the words come in. Returns
 * { done, stop, cancel }: done resolves with the final text ('' when nothing was
 * heard) or rejects with a Turkish message; stop ends and keeps the words, cancel drops them.
 */
export function listen({ lang = 'tr-TR', onText } = {}) {
  stopSpeaking(); // don't let Evra hear itself
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let text = '';
  let cancelled = false;
  const done = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      text = [...e.results].map((r) => r[0]?.transcript || '').join('');
      onText?.(text);
    };
    rec.onerror = (e) => {
      if (['no-speech', 'aborted'].includes(e.error)) return; // onend follows with whatever was heard
      reject(new Error(LISTEN_ERRORS[e.error] || `Ses tanıma çalışmadı (${e.error}).`));
    };
    rec.onend = () => resolve(cancelled ? '' : text.trim());
  });
  try { rec.start(); } catch (e) { return { done: Promise.reject(new Error('Ses tanıma başlatılamadı.')), stop() {}, cancel() {} }; }
  return { done, stop: () => rec.stop(), cancel: () => { cancelled = true; rec.abort(); } };
}

// Chrome and Edge load their voice list a moment after the page; asking early starts that.
if (canSpeak()) speechSynthesis.getVoices();
