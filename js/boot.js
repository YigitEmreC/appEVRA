// Starts Evra. A plain (old-style) script on purpose: it has to run on old web
// engines too, to tell them they're too old. It lives in its own file because the
// add-on's Content Security Policy allows no scripts written inside the page.
//
// Some wall panels have an old built-in web engine that would show Evra broken.
// Evra needs about Chrome 111 / Safari 16.2 / Firefox 113 (it uses colour mixing
// in CSS and modern JavaScript). On an older engine, say so and name it, so the
// panel's engine can be updated or a newer browser installed.
(function () {
  // On a bad connection Evra could otherwise sit on "Loading Evra…" for good: if a
  // file fails, or it hasn't started after a while, say so and offer to try again.
  // If it starts after all, main.js replaces this message with the app.
  function stuck(why) {
    if (document.documentElement.dataset.evraStarted) return;
    var box = document.getElementById('app');
    var p = document.createElement('p');
    p.className = 'boot';
    p.textContent = why;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.textContent = 'Tekrar dene';
    btn.onclick = function () { location.reload(); };
    box.textContent = '';
    box.appendChild(p);
    box.appendChild(btn);
  }
  function start() {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'js/main.js';
    s.onerror = function () { stuck('Evra yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.'); };
    document.body.appendChild(s);
    setTimeout(function () { stuck('Evra\'nın yüklenmesi uzun sürüyor. Bağlantı yavaş olabilir.'); }, 15000);
  }
  var ok = 'noModule' in HTMLScriptElement.prototype && !!window.CSS && !!CSS.supports &&
    CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  if (ok) { start(); return; }
  var ua = navigator.userAgent;
  var engine = (/Chrome\/(\d+)/.exec(ua) || /Version\/(\d+[.\d]*) .*Safari/.exec(ua) || /Firefox\/(\d+)/.exec(ua) || [])[0] || 'bilinmiyor';
  var box = document.getElementById('app');
  var title = document.createElement('h1');
  title.textContent = 'Bu ekranın web motoru Evra için çok eski';
  var p = document.createElement('p');
  p.textContent = 'Evra için Chrome 111 ya da daha yenisi gerekir (veya Safari 16.2, Firefox 113). Bu ekrandaki: ' + engine + '. ' +
    'Android panelde "Android System WebView" uygulamasını güncelleyin ya da Evra\'yı daha yeni bir tarayıcıda açın.';
  var small = document.createElement('p');
  small.style.cssText = 'font-size:12px;opacity:.7;word-break:break-all';
  small.textContent = ua;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Yine de dene';
  btn.onclick = function () { box.textContent = ''; box.style.cssText = ''; start(); };
  box.style.cssText = 'padding:24px;font-family:system-ui,sans-serif;color:#E8ECF6;background:#0E1322;min-height:100vh';
  box.textContent = '';
  box.appendChild(title); box.appendChild(p); box.appendChild(btn); box.appendChild(small);
})();
