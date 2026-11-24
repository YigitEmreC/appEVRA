// The TR/EN switch. Turkish is the default and needs nothing; in English, every Turkish
// interface text on the page is swapped for its English one as it appears.
//
// How: i18n-index.js (built by webEVRA tools/i18n_build.py) knows every interface text
// by id, plus patterns for texts with values in them ("{0} kaldırıldı"). The English
// comes from POST /api/i18n by id and is kept on this device. Only ids are sent, so
// names, chats and anything else people type never go anywhere for translation; text
// that isn't in the index (a device's name, a room) stays as it is.
// The same file is used by the website (webEVRA public/assets/js/i18n.js) and the app.

const KEY = 'evra.lang';
const CACHE = 'evra.i18n.en';
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]{2}/;
const SKIP = 'script,style,textarea,code,pre,[contenteditable],[data-no-i18n],.msg:not(.intro) .msg-body';

export function getLang() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'tr'; } catch { return 'tr'; }
}

/** Changes the language and reloads, so every screen starts in it. */
export function setLang(lang) {
  try { localStorage.setItem(KEY, lang === 'en' ? 'en' : 'tr'); } catch { /* only this visit */ }
  location.reload();
}

/** A small "TR · EN" switch; the active one is bold. */
export function langSwitch(make = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}) {
  const lang = getLang();
  const btn = make('button', { type: 'button', className: 'lang-switch', title: lang === 'en' ? 'Türkçe' : 'English' });
  btn.setAttribute('aria-label', lang === 'en' ? 'Türkçeye geç' : 'Switch to English');
  btn.setAttribute('data-no-i18n', '');
  const tr = document.createElement('b'); tr.textContent = 'TR';
  const en = document.createElement('b'); en.textContent = 'EN';
  (lang === 'en' ? tr : en).className = 'off';
  btn.append(tr, document.createTextNode(' · '), en);
  btn.addEventListener('click', () => setLang(lang === 'en' ? 'tr' : 'en'));
  return btn;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Starts translating the page if English is chosen. api: the /api/i18n address;
 * loadIndex: () => import('./i18n-index.js').
 */
export async function startI18n({ api, loadIndex }) {
  document.documentElement.lang = getLang();
  if (getLang() !== 'en') return;
  let index;
  try { index = (await loadIndex()).default; } catch { return; }
  const exact = new Map(Object.entries(index.exact || {}));
  const patterns = (index.patterns || []).map(([re, id]) => [new RegExp(re), id]);
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch { cache = {}; }

  const wanted = new Set();
  let fetchTimer = null;
  let saveTimer = null;

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
      const inner = lookup(v); // a Turkish word inside a pattern (a status) gets translated too
      return inner && cache[inner.id] != null && !inner.args ? cache[inner.id] : v;
    });
    return t;
  }
  const keep = (orig, t) => orig.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, a, b) => a + t + b);

  function doText(node) {
    const v = node.nodeValue;
    if (!v || !LETTERS.test(v)) return;
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const hit = lookup(v);
    if (!hit) return;
    const t = render(hit);
    if (t != null && norm(t) !== norm(v)) node.nodeValue = keep(v, t);
  }
  function doAttrs(el) {
    if (el.closest(SKIP)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !LETTERS.test(v)) continue;
      const hit = lookup(v);
      if (!hit) continue;
      const t = render(hit);
      if (t != null && t !== v) el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (!root) return;
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

  function scheduleFetch() {
    if (fetchTimer) return;
    fetchTimer = setTimeout(async () => {
      fetchTimer = null;
      const ids = [...wanted].filter((id) => cache[id] == null).slice(0, 300);
      wanted.clear();
      if (!ids.length) return;
      try {
        const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'en', ids }) });
        const j = await res.json();
        let got = 0;
        for (const [id, t] of Object.entries(j.texts || {})) { cache[id] = t; got++; }
        if (got) {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => { try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch { /* full: keep in memory */ } }, 500);
          walk(document.body);
          doTitle();
        }
      } catch { /* offline: Turkish until next time */ }
    }, 60);
  }

  function doTitle() {
    if (!document.title) return;
    const hit = lookup(document.title);
    const t = hit && render(hit);
    if (t && t !== document.title) document.title = t;
  }
  doTitle();
  walk(document.body);
  // Everything the page adds or changes later.
  const queue = new Set();
  let queued = false;
  const flush = () => { queued = false; for (const n of queue) walk(n); queue.clear(); };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') queue.add(m.target);
      else if (m.type === 'attributes') queue.add(m.target);
      else m.addedNodes.forEach((n) => queue.add(n));
    }
    if (!queued) { queued = true; queueMicrotask(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // The tab title changes with the screen.
  const titleEl = document.querySelector('title');
  if (titleEl) new MutationObserver(doTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
}
