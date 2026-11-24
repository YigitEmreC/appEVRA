// "Hey EvrAI": hands-free asking, mainly for the wall panel. When it's on (Settings,
// per device), the app listens in the background with the browser's speech recognition;
// on "Hey EvrAI" (or "Hey Evra") it opens the EvrAI tab and starts listening for the
// question, which goes as if the mic button was pressed.
//
// Honest limits: browsers have no on-device wake word, so while this is on the speech
// service of the browser (Google in Chrome and Edge) hears the room continuously; it's
// off by default, explained where it's switched on, and stops while the app is hidden.
// Needs a secure page (https), a browser with speech recognition, the mic permission,
// and a home with EvrAI.

import { loadSettings } from './util.js';
import { canListen } from './speech.js';
import { canUseAssistant } from './account.js';

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
const WAKE = /\bhey\s*,?\s*(evr\s*a\s*i|evrai|evra|ev\s*ra|ebra|evre|evray|evrey|everay)\b/i;

let rec = null;
let paused = false;   // the chat's own mic is listening
let wanted = false;
let restartTimer = null;
let failures = 0;

const shouldRun = () => wanted && !paused && document.visibilityState === 'visible' && canListen() && canUseAssistant();

function stop() {
  clearTimeout(restartTimer);
  const r = rec;
  rec = null;
  if (r) { r.onend = null; try { r.abort(); } catch { /* already stopped */ } }
}

function start() {
  if (rec || !shouldRun()) return;
  const r = new Recognition();
  r.lang = 'tr-TR';
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (WAKE.test(e.results[i][0]?.transcript || '')) { heard(); return; }
    }
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; }
    failures++;
  };
  // Browsers end continuous recognition now and then: start again, slower after errors.
  r.onend = () => {
    rec = null;
    if (shouldRun()) restartTimer = setTimeout(start, Math.min(30000, 400 * 2 ** Math.min(failures, 6)));
  };
  try { r.start(); rec = r; failures = Math.max(0, failures - 1); } catch { restartTimer = setTimeout(start, 3000); }
}

function heard() {
  stop();
  if (location.hash !== '#/chat') location.hash = '#/chat';
  // The chat screen asks with its mic (views/chat.js listens for this).
  setTimeout(() => window.dispatchEvent(new CustomEvent('evrai-wake')), 450);
}

/** While the chat's own mic listens, the wake word steps aside (two can't listen at once). */
export function pauseWake() { paused = true; stop(); }
export function resumeWake() { paused = false; setTimeout(start, 600); }

/** Starts or stops by the setting; call on startup and when the setting or account changes. */
export function syncWake() {
  wanted = Boolean(Recognition) && loadSettings().wakeWord === true;
  if (shouldRun()) start(); else stop();
}

export const wakeAvailable = () => Boolean(Recognition) && canListen();

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', syncWake);
