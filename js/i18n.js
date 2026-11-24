// The language switch: TR (default), EN and AR. Turkish needs nothing; in another
// language every Turkish interface text on the page is swapped for its translation as it
// appears. Switching happens in place, without reloading; going back to Turkish puts the
// original texts back. In Arabic the page layout stays as it is; only the Arabic texts
// themselves read right-to-left (style: html.i18n-rtl), so nothing jumps around.
//
// How: i18n-index.js (built by webEVRA tools/i18n_build.py) knows every interface text
// by id, plus patterns for texts with values in them ("{0} kaldırıldı"). The translations
// come first from a file shipped with the site / app (i18n/<lang>.json, written by webEVRA
// tools/i18n_fill.py: instant, no waiting for anyone), then from /api/i18n: all the server
// knows in one request (kept on this device), then any still missing ones by id. Only ids are sent, so names, chats and anything else people
// type never go anywhere for translation; text that isn't in the index (a device's name,
// a room) stays as it is.
// The same file is used by the website (webEVRA public/assets/js/i18n.js) and the app.

const KEY = 'evra.lang';
const LANGS = ['tr', 'en', 'ar'];
const NAMES = { tr: 'Türkçe', en: 'English', ar: 'العربية' };
const RTL = new Set(['ar']);
const REFRESH = 6 * 3600 * 1000; // ask for the full list again after this long
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/;
const SKIP = 'script,style,textarea,code,pre,[contenteditable],[data-no-i18n],.msg:not(.intro) .msg-body';

let config = null;   // { api, loadIndex }
let engine = null;   // the running engine (one language at a time)

export function getLang() {
  try { const l = localStorage.getItem(KEY); return LANGS.includes(l) ? l : 'tr'; } catch { return 'tr'; }
}

function applyDir(lang) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = 'ltr';
  root.classList.toggle('i18n-rtl', RTL.has(lang));
}

// While a page opens in another language it stays hidden until its texts are swapped,
// so Turkish doesn't flash first (the style shows it after 1.5 s whatever happens).
function reveal() { document.documentElement.classList.remove('i18n-wait'); }

/** Changes the language in place (no reload). */
export function setLang(lang) {
  const l = LANGS.includes(lang) ? lang : 'tr';
  try { localStorage.setItem(KEY, l); } catch { /* only this visit */ }
  applyDir(l);
  paintSwitches();
  window.dispatchEvent(new CustomEvent('evra-lang', { detail: l }));
  disable();
  if (l !== 'tr') enable(l);
}

function paintSwitches() {
  const cur = getLang();
  for (const box of document.querySelectorAll('.lang-switch')) {
    for (const b of box.querySelectorAll('[data-lang]')) {
      const on = b.dataset.lang === cur;
      b.className = on ? '' : 'off';
      b.setAttribute('aria-pressed', String(on));
    }
  }
}

/** A small "TR · EN · AR" switch; the active one is bold. */
export function langSwitch() {
  const box = document.createElement('span');
  box.className = 'lang-switch';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Dil / Language / اللغة');
  box.setAttribute('data-no-i18n', '');
  LANGS.forEach((l, i) => {
    if (i) box.append(document.createTextNode(' · '));
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.lang = l;
    b.textContent = l.toUpperCase();
    b.title = NAMES[l];
    b.setAttribute('lang', l);
    b.addEventListener('click', () => { if (getLang() !== l) setLang(l); });
    box.append(b);
  });
  queueMicrotask(paintSwitches);
  return box;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Remembers where /api/i18n is and how to load the index; starts at once if a translation is chosen. */
let clicksBound = false;

export function startI18n(cfg) {
  config = cfg;
  applyDir(getLang());
  paintSwitches();
  // Switches written into the page (website headers) as well as made by langSwitch().
  if (!clicksBound) {
    clicksBound = true;
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('.lang-switch [data-lang]');
      if (b && getLang() !== b.dataset.lang) setLang(b.dataset.lang);
    });
  }
  if (getLang() !== 'tr' && !engine) { document.documentElement.classList.add('i18n-wait'); enable(getLang()); }
}

function disable() {
  reveal();
  if (!engine) return;
  engine.stop();
  engine = null;
}

async function enable(lang) {
  if (engine || !config) return;
  const e = createEngine(lang);
  engine = e;
  await e.start();
}

function createEngine(lang) {
  const CACHE = `evra.i18n.${lang}`;
  const CACHE_AT = `evra.i18n.${lang}.at`;
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
  // The whole text, or else its parts between " · " ("Isıtılıyor · 21°", "07:00 · Uyanış").
  // null while any part is still being fetched, or when nothing is known.
  function translateText(v) {
    const hit = lookup(v);
    if (hit) return render(hit);
    if (!v.includes('·')) return null;
    let changed = false, pending = false;
    const out = v.split(/(\s*·\s*)/).map((part, i) => {
      if (i % 2 || !LETTERS.test(part)) return part;
      const h2 = lookup(part);
      if (!h2) return part;
      const t = render(h2);
      if (t == null) { pending = true; return part; }
      changed = true;
      return keep(part, t);
    });
    return changed && !pending ? out.join('') : null;
  }

  function doText(node) {
    if (stopped) return;
    const v = node.nodeValue;
    if (!v || !LETTERS.test(v)) return;
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    // Already ours: the English we put there.
    if (origText.has(node) && origText.get(node).en === v) return;
    const t = translateText(v);
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
    const res = await fetch(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, ids }) });
    return (await res.json()).texts || {};
  }
  // Missing texts are asked for in small pieces, six at a time, top of the page first, so
  // the first translations show up quickly. Ones that don't come back (the server was
  // still translating, a hiccup) are asked for again a little later, up to three times.
  const tries = new Map();
  let fetching = false;
  function scheduleFetch(delay = 50) {
    if (fetchTimer || stopped) return;
    fetchTimer = setTimeout(async () => {
      fetchTimer = null;
      if (fetching) { scheduleFetch(300); return; }
      const ids = [...wanted].filter((id) => cache[id] == null && (tries.get(id) || 0) < 3);
      wanted.clear();
      if (!ids.length) return;
      fetching = true;
      const parts = [];
      for (let i = 0; i < ids.length; i += 40) parts.push(ids.slice(i, i + 40));
      const again = [];
      for (let i = 0; i < parts.length && !stopped; i += 6) {
        await Promise.all(parts.slice(i, i + 6).map(async (part) => {
          let texts = {};
          try { texts = await post(part); } catch { /* offline or slow: try again below */ }
          let got = 0;
          for (const [id, t] of Object.entries(texts)) { cache[id] = t; got++; }
          for (const id of part) if (cache[id] == null) { tries.set(id, (tries.get(id) || 0) + 1); again.push(id); }
          if (got && !stopped) { persist(); walk(document.body); doTitle(); }
        }));
      }
      fetching = false;
      if (stopped) return;
      for (const id of again) wanted.add(id);
      if (wanted.size) scheduleFetch(again.length ? 4000 : 50);
    }, delay);
  }
  /** Every translation the server already has, in one request (then kept on this device). */
  // The file shipped with the site / app: everything translated so far, served like any
  // other file (cached by the browser), so it doesn't wait for the server or the AI.
  async function loadStatic() {
    if (!config.staticUrl) return false;
    try {
      const res = await fetch(config.staticUrl(lang));
      if (!res.ok) return false;
      const texts = await res.json();
      let added = 0;
      for (const [id, t] of Object.entries(texts || {})) if (cache[id] !== t) { cache[id] = t; added++; }
      if (added) persist();
      return added > 0;
    } catch { return false; }
  }

  async function loadAll() {
    let at = 0;
    try { at = Number(localStorage.getItem(CACHE_AT)) || 0; } catch { /* none */ }
    if (Object.keys(cache).length > 200 && Date.now() - at < REFRESH) return;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${config.api}?lang=${lang}`, { signal: ctrl.signal });
      clearTimeout(timer);
      const j = await res.json();
      Object.assign(cache, j.texts || {});
      persist();
      try { localStorage.setItem(CACHE_AT, String(Date.now())); } catch { /* fine */ }
    } catch { /* the per-id requests fill in */ }
  }

  return {
    async start() {
      try { index = (await config.loadIndex()).default; } catch { reveal(); return; }
      if (stopped) return;
      exact = new Map(Object.entries(index.exact || {}));
      patterns = (index.patterns || []).map(([re, id]) => [new RegExp(re), id]);
      // What's on this device shows at once; the full list comes next.
      doTitle();
      walk(document.body);
      if (Object.keys(cache).length) reveal();
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
      if (await loadStatic() && !stopped) { walk(document.body); doTitle(); reveal(); }
      await loadAll();
      if (!stopped) { walk(document.body); doTitle(); }
      reveal();
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
