// The first screen: sign in (or create an account) before the app opens.
// main.js shows this whenever nobody is signed in, and the app itself once someone is.
// Accounts are the Evra website's (js/account.js); creating one happens on the website,
// where it has e-mail confirmation and spam protection.

import { h } from '../util.js';
import { icon } from '../icons.js';
import { accountPanel } from './account-ui.js';
import { openLegal } from '../legal.js';
import { accountStatus, accountsUrl, useAccountsServer, WEBSITE_ACCOUNTS, websiteOrigin } from '../account.js';

export function renderAuthGate(cleanup) {
  let mode = 'signin'; // or 'signup'
  const body = h('div', { class: 'gate-body' });
  const tabs = h('div', { class: 'segmented gate-tabs', role: 'tablist', 'aria-label': 'Giriş yapın ya da hesap oluşturun' });

  function draw() {
    tabs.replaceChildren(...[['signin', 'Giriş yap'], ['signup', 'Hesap oluştur']].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(mode === id), class: mode === id ? 'active' : '',
      onclick: () => { if (mode !== id) { mode = id; draw(); } },
    }, label)));
    body.classList.remove('gate-swap');
    void body.offsetWidth; // restart the little slide-in
    body.classList.add('gate-swap');
    if (mode === 'signin') {
      body.replaceChildren(accountPanel(cleanup));
      return;
    }
    const signupUrl = `${websiteOrigin()}/kayit.html`;
    body.replaceChildren(
      h('ol', { class: 'gate-steps' },
        h('li', null, h('strong', null, 'Evra web sitesinde hesabınızı oluşturun'), h('span', null, 'E-posta adresiniz ve bir şifre yeterli. Bir dakika sürer.')),
        h('li', null, h('strong', null, 'E-postanızı doğrulayın'), h('span', null, 'Hoş geldiniz e-postasındaki bağlantıya tıklayın.')),
        h('li', null, h('strong', null, 'Geri dönüp giriş yapın'), h('span', null, 'Aynı hesap web sitesinde ve uygulamada geçerli.'))),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn primary', href: signupUrl, target: '_blank', rel: 'noopener' }, icon('external', 16), 'evrasmarthome.com\'da hesap oluştur'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { mode = 'signin'; draw(); } }, 'Hesabım var')));
  }

  // Using the stand-in on this computer instead of the website: say so, with a way back.
  const elsewhere = accountsUrl() !== WEBSITE_ACCOUNTS
    ? h('p', { class: 'gate-note muted small' }, `Hesaplar: ${accountsUrl()}. `,
      h('button', { class: 'link-btn', type: 'button', onclick: () => { useAccountsServer(''); location.reload(); } }, 'Evra web sitesini kullan'))
    : null;

  // The stand-in signs up through its own first-run form, so it needs no Create account tab.
  accountStatus().then((s) => { if (s.kind !== 'website') tabs.hidden = true; }).catch(() => { /* the panel shows the problem */ });

  // The legal texts (Turkish), readable before signing in.
  const legalLink = (id, label) => h('button', { class: 'link-btn', type: 'button', onclick: () => openLegal(id) }, label);
  const legal = h('p', { class: 'gate-legal muted small' },
    'Evra\'yı kullanarak ', legalLink('kosullar', 'Kullanım Koşulları'), '\'nı kabul etmiş olursunuz. Kişisel verileriniz ',
    legalLink('gizlilik', 'Gizlilik Politikası ve KVKK Aydınlatma Metni'), '\'ne göre işlenir.');

  draw();
  return h('div', { class: 'gate' },
    h('div', { class: 'gate-card' },
      h('div', { class: 'gate-brand' },
        h('span', { class: 'gate-logo', 'aria-hidden': 'true' }, icon('evra', 34)),
        h('h1', null, 'Evra\'ya hoş geldiniz'),
        h('p', { class: 'muted' }, 'Evinizi görmek ve yönetmek için giriş yapın.')),
      tabs, body, elsewhere, legal));
}
