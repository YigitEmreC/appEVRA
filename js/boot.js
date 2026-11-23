// Starts Evra. A plain (old-style) script on purpose: it has to run on old web
// engines too, to tell them they're too old. It lives in its own file because the
// add-on's Content Security Policy allows no scripts written inside the page.
//
// Some wall panels have an old built-in web engine that would show Evra broken.
// Evra needs about Chrome 111 / Safari 16.2 / Firefox 113 (it uses colour mixing
// in CSS and modern JavaScript). On an older engine, say so and name it, so the
// panel's engine can be updated or a newer browser installed.
(function () {
  function start() {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'js/main.js';
    document.body.appendChild(s);
  }
  var ok = 'noModule' in HTMLScriptElement.prototype && !!window.CSS && !!CSS.supports &&
    CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  if (ok) { start(); return; }
  var ua = navigator.userAgent;
  var engine = (/Chrome\/(\d+)/.exec(ua) || /Version\/(\d+[.\d]*) .*Safari/.exec(ua) || /Firefox\/(\d+)/.exec(ua) || [])[0] || 'unknown';
  var box = document.getElementById('app');
  var title = document.createElement('h1');
  title.textContent = 'This screen’s web engine is too old for Evra';
  var p = document.createElement('p');
  p.textContent = 'Evra needs Chrome 111 or newer (or Safari 16.2, Firefox 113). This one is: ' + engine + '. ' +
    'On an Android panel, update "Android System WebView" or open Evra in a newer browser.';
  var small = document.createElement('p');
  small.style.cssText = 'font-size:12px;opacity:.7;word-break:break-all';
  small.textContent = ua;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Try anyway';
  btn.onclick = function () { box.textContent = ''; box.style.cssText = ''; start(); };
  box.style.cssText = 'padding:24px;font-family:system-ui,sans-serif;color:#E8ECF6;background:#0E1322;min-height:100vh';
  box.textContent = '';
  box.appendChild(title); box.appendChild(p); box.appendChild(btn); box.appendChild(small);
})();
