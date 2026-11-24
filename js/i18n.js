// The TR/EN switch. Turkish is the default and needs nothing; in English, every Turkish
// interface text on the page is swapped for its English one as it appears. Switching
// happens in place, without reloading; going back to Turkish puts the original texts back.
//
// How: i18n-index.js (built by webEVRA tools/i18n_build.py) knows every interface text
// by id, plus patterns for texts with values in them ("{0} kaldırıldı"). The English
// comes from /api/i18n: first all known translations in one request (kept on this
// device), then any missing ones by id. Only ids are sent, so names, chats and anything
// else people type never go anywhere for translation; text that isn't in the index (a
// device's name, a room) stays as it is.
// The same file is used by the website (webEVRA public/assets/js/i18n.js) and the app.

const KEY = 'evra.lang';
const CACHE = 'evra.i18n.en';
const CACHE_AT = 'evra.i18n.en.at';
const REFRESH = 6 * 3600 * 1000; // ask for the full list again after this long
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/;
const SKIP = 'script,style,textarea,code,pre,[contenteditable],[data-no-i18n],.msg:not(.intro) .msg-body';

let config = null;   // { api, loadIndex }
let engine = null;   // the running English engine

export function getLang() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'tr'; } catch { return 'tr'; }
}

/** Changes the language in place (no reload). */
export function setLang(lang) {
  const en = lang === 'en';
  try { localStorage.setItem(KEY, en ? 'en' : 'tr'); } catch { /* only this visit */ }
  document.documentElement.lang = en ? 'en' : 'tr';
  paintSwitches();
  window.dispatchEvent(new CustomEvent('evra-lang', { detail: en ? 'en' : 'tr' }));
  if (en) enable(); else disable();
}

function paintSwitches() {
  const en = getLang() === 'en';
  for (const btn of document.querySelectorAll('.lang-switch')) {
    const [tr, eng] = btn.querySelectorAll('b');
    if (tr) tr.className = en ? 'off' : '';
    if (eng) eng.className = en ? '' : 'off';
    btn.title = en ? 'Türkçe' : 'English';
    btn.setAttribute('aria-label', en ? 'Türkçeye geç' : 'Switch to English');
  }
}

/** A small "TR · EN" switch; the active one is bold. */
export function langSwitch() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lang-switch';
  btn.setAttribute('data-no-i18n', '');
  const tr = document.createElement('b'); tr.textContent = 'TR';
  const en = document.createElement('b'); en.textContent = 'EN';
  btn.append(tr, document.createTextNode(' · '), en);
  btn.addEventListener('click', () => setLang(getLang() === 'en' ? 'tr' : 'en'));
  queueMicrotask(paintSwitches);
  const en0 = getLang() === 'en';
  (en0 ? tr : en).className = 'off';
  return btn;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Remembers where /api/i18n is and how to load the index; starts at once if English is chosen. */
export function startI18n(cfg) {
  config = cfg;
  document.documentElement.lang = getLang();
  if (getLang() === 'en') enable();
}

function disable() {
  if (!engine) return;
  engine.stop();
  engine = null;
}

async function enable() {
  if (engine || !config) return;
  const e = createEngine();
  engine = e;
  await e.start();
}

function createEngine() {
  let index = null, exact = null, patterns = null;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch { cache = {}; }
  const wanted = new Set();
  const origText = new Map();    // text node -> its Turkish text
  const origAttr = new Map();    // element -> { attribute: Turkish value }
  let fetchTimer = null, saveTimer = null, observer = null, titleObserver = null;
  let origTitle = null;
  let stopped = false;

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch { /* full: memory only */ } }, 400);
  };

  function lookup(text) {
    const n = norm(text);
    if (!n || !LETTERS.test(n)) return null;
    const id = exact.get(n);
    if (id) return { id, args: null };
    if (n.length > 400) return null;
    for (const [re, pid] of patterns) {
      const m = re.exec(n);
      if (m) return { id: pid, args: m.slice(1) };
    }
    return null;
  }
  function render(hit) {
    let t = cache[hit.id];
    if (t == null) { wanted.add(hit.id); scheduleFetch(); return null; }
    if (hit.args) t = t.replace(/\{(\d+)\}/g, (_, k) => {
      const v = hit.args[Number(k)] ?? '';
      const inner = lookup(v);
      return inner && !inner.args && cache[inner.id] != null ? cache[inner.id] : v;
    });
    return t;
  }
  const keep = (orig, t) => orig.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, a, b) => a + t + b);

  function doText(node) {
    if (stopped) return;
    const v = node.nodeValue;
    if (!v || !LETTERS.test(v)) return;
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    // Already ours: the English we put there.
    if (origText.has(node) && origText.get(node).en === v) return;
    const hit = lookup(v);
    if (!hit) return;
    const t = render(hit);
    if (t == null || norm(t) === norm(v)) return;
    const next = keep(v, t);
    if (origText.size > 4000) for (const n of origText.keys()) if (!n.isConnected) origText.delete(n); // screens come and go
    origText.set(node, { tr: v, en: next });
    node.nodeValue = next;
  }
  function doAttrs(el) {
    if (stopped || el.closest(SKIP)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !LETTERS.test(v)) continue;
      const saved = origAttr.get(el)?.[a];
      if (saved && saved.en === v) continue;
      const hit = lookup(v);
      if (!hit) continue;
      const t = render(hit);
      if (t == null || t === v) continue;
      origAttr.set(el, { ...(origAttr.get(el) || {}), [a]: { tr: v, en: t } });
      el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (!root || stopped) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.matches(SKIP)) return;
      doAttrs(root);
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
    }
  }
  function doTitle() {
    if (stopped || !document.title) return;
    const hit = lookup(document.title);
    const t = hit && render(hit);
    if (t && t !== document.title) { if (origTitle == null) origTitle = document.title; document.title = t; }
  }

  async function post(ids) {
    const res = await fetch(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'en', ids }) });
    return (await res.json()).texts || {};
  }
  function scheduleFetch() {
    if (fetchTimer || stopped) return;
    fetchTimer = setTimeout(async () => {
      fetchTimer = null;
      const ids = [...wanted].filter((id) => cache[id] == null);
      wanted.clear();
      if (!ids.length) return;
      // Small pieces in parallel, so the first English shows up quickly.
      const parts = [];
      for (let i = 0; i < ids.length && i < 240; i += 40) parts.push(ids.slice(i, i + 40));
      await Promise.all(parts.map(async (part) => {
        try {
          const texts = await post(part);
          let got = 0;
          for (const [id, t] of Object.entries(texts)) { cache[id] = t; got++; }
          if (got && !stopped) { persist(); walk(document.body); doTitle(); }
        } catch { /* offline: Turkish until next time */ }
      }));
    }, 50);
  }
  /** Every translation the server already has, in one request (then kept on this device). */
  async function loadAll() {
    let at = 0;
    try { at = Number(localStorage.getItem(CACHE_AT)) || 0; } catch { /* none */ }
    if (Object.keys(cache).length > 200 && Date.now() - at < REFRESH) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${config.api}?lang=en`, { signal: ctrl.signal });
      clearTimeout(timer);
      const j = await res.json();
      Object.assign(cache, j.texts || {});
      persist();
      try { localStorage.setItem(CACHE_AT, String(Date.now())); } catch { /* fine */ }
    } catch { /* the per-id requests fill in */ }
  }

  return {
    async start() {
      try { index = (await config.loadIndex()).default; } catch { return; }
      if (stopped) return;
      exact = new Map(Object.entries(index.exact || {}));
      patterns = (index.patterns || []).map(([re, id]) => [new RegExp(re), id]);
      // What's on this device shows at once; the full list comes next.
      doTitle();
      walk(document.body);
      const queue = new Set();
      let queued = false;
      const flush = () => { queued = false; for (const n of queue) walk(n); queue.clear(); };
      observer = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'characterData' || m.type === 'attributes') queue.add(m.target);
          else m.addedNodes.forEach((n) => queue.add(n));
        }
        if (!queued) { queued = true; queueMicrotask(flush); }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      const titleEl = document.querySelector('title');
      if (titleEl) { titleObserver = new MutationObserver(doTitle); titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true }); }
      await loadAll();
      if (!stopped) { walk(document.body); doTitle(); }
    },
    stop() {
      stopped = true;
      clearTimeout(fetchTimer);
      observer?.disconnect();
      titleObserver?.disconnect();
      // Back to the Turkish texts, where they're still on the page and unchanged since.
      for (const [node, o] of origText) if (node.isConnected && node.nodeValue === o.en) node.nodeValue = o.tr;
      for (const [el, attrs] of origAttr) {
        if (!el.isConnected) continue;
        for (const [a, o] of Object.entries(attrs)) if (el.getAttribute(a) === o.en) el.setAttribute(a, o.tr);
      }
      if (origTitle != null) document.title = origTitle;
      origText.clear();
      origAttr.clear();
    },
  };
}
