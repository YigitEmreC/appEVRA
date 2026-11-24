// The Evra account panel: first-time setup, sign-in, and the signed-in member,
// used on the welcome screen (views/auth-gate.js), in Settings and on the Assistant tab.
// Who is an admin, and who gets the assistant beyond their plan, is set in the
// website's database (evra_app_access), not in the app.

import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import {
  member, canUseAssistant, onAccount, accountStatus, signIn, setUp, signOutAccount, changePassword, refreshMember, websiteOrigin,
} from '../account.js';

let fieldCount = 0;
function field(label, attrs, hint) {
  const id = `acct-${++fieldCount}`;
  const input = h('input', { class: 'input', id, ...attrs });
  return { input, el: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'muted' }, hint) : null) };
}

function form(fields, submitLabel, onSubmit) {
  const err = h('p', { class: 'error-line', role: 'alert' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, submitLabel);
  const el = h('form', { class: 'stack account-form', novalidate: true }, fields.map((f) => f.el), err, h('div', { class: 'btn-row' }, submit));
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try { await onSubmit(); } catch (ex) { err.textContent = ex.message; } finally { submit.disabled = false; }
  });
  return el;
}

// On the Evra website you sign in with your e-mail address; on this computer's stand-in, a username.
function signInForm(status) {
  const site = status.kind === 'website';
  const user = site
    ? field('E-posta', { type: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', required: true })
    : field('Kullanıcı adı', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = field('Şifre', { type: 'password', autocomplete: 'current-password', required: true });
  const el = form([user, pass], 'Giriş yap', async () => {
    if (!user.input.value.trim() || !pass.input.value) throw new Error(site ? 'E-posta adresinizi ve şifrenizi girin.' : 'Kullanıcı adınızı ve şifrenizi girin.');
    const u = await signIn(user.input.value, pass.input.value);
    toast(`${u.name} olarak giriş yapıldı`);
  });
  if (!site) return el;
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  return h('div', { class: 'stack' }, el,
    h('p', { class: 'muted small account-links' },
      `${status.site || 'Evra web sitesi'} hesabınızla giriş yapın. `,
      status.signupUrl ? link(status.signupUrl, 'Hesap oluşturun') : null, status.signupUrl ? ' · ' : null,
      status.forgotUrl ? link(status.forgotUrl, 'Şifrenizi mi unuttunuz?') : null));
}

// First admin of this computer's stand-in (the website's is made in its D1 Console).
function setupForm() {
  const name = field('Adınız', { autocomplete: 'name', required: true });
  const user = field('Kullanıcı adı', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }, '3 ile 64 karakter: harf, rakam ve . _ @ + -');
  const pass = field('Şifre', { type: 'password', autocomplete: 'new-password', required: true }, 'En az 8 karakter.');
  const again = field('Şifre (tekrar)', { type: 'password', autocomplete: 'new-password', required: true });
  return form([name, user, pass, again], 'Yönetici hesabını oluştur', async () => {
    if (pass.input.value !== again.input.value) throw new Error('İki şifre birbirinden farklı.');
    const u = await setUp(name.input.value, user.input.value, pass.input.value);
    toast(`Hoş geldiniz ${u.name}. Yönetici sizsiniz.`);
  });
}

function passwordForm(done) {
  const cur = field('Şu anki şifre', { type: 'password', autocomplete: 'current-password' });
  const next = field('Yeni şifre', { type: 'password', autocomplete: 'new-password' }, 'En az 8 karakter. Burada oturumunuz açık kalır; diğer cihazlarda kapanır.');
  const again = field('Yeni şifre (tekrar)', { type: 'password', autocomplete: 'new-password' });
  return form([cur, next, again], 'Şifreyi değiştir', async () => {
    if (next.input.value !== again.input.value) throw new Error('İki yeni şifre birbirinden farklı.');
    await changePassword(cur.input.value, next.input.value);
    toast('Şifre değiştirildi');
    done();
  });
}

// The whole panel. It redraws itself when the account changes.
export function accountPanel(cleanup, { intro } = {}) {
  const box = h('div', { class: 'account-panel' });
  let showPassword = false;

  async function draw() {
    const u = member();
    if (u) {
      const access = canUseAssistant(u)
        ? h('span', { class: 'pill ok-pill' }, icon('check', 12), 'EvrAI\'ı kullanabilir')
        : h('span', { class: 'pill' }, icon('lock', 12), 'Asistan erişimi yok');
      const site = !!u.email; // a website account (the stand-in has usernames only)
      const plan = site ? h('span', { class: 'pill' }, `${u.planName || u.plan} planı`) : null;
      box.replaceChildren(...[
        h('div', { class: 'account-who' },
          h('span', { class: 'account-avatar', 'aria-hidden': 'true' }, (u.name || '?').trim().charAt(0).toUpperCase()),
          h('div', { class: 'account-text' }, h('strong', null, u.name), h('small', { class: 'muted' }, `${u.username} · ${u.role === 'admin' ? 'Yönetici' : 'Üye'}`))),
        h('div', { class: 'account-pills' }, ...[access, plan].filter(Boolean)),
        site && !canUseAssistant(u) ? h('p', { class: 'muted small' }, 'EvrAI Premium planla gelir; evdeki bir Premium abonelik bütün eve açılır.') : null,
        h('div', { class: 'btn-row' },
          site ? h('a', { class: 'btn ghost', href: `${websiteOrigin()}/hesabim.html`, target: '_blank', rel: 'noopener' }, icon('person', 16), 'Web sitesindeki hesabım') : null,
          h('button', { class: 'btn ghost', type: 'button', 'aria-expanded': String(showPassword), onclick: () => { showPassword = !showPassword; draw(); } }, icon('lock', 16), 'Şifreyi değiştir'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await signOutAccount(); toast('Evra oturumu kapatıldı'); } }, 'Çıkış yap')),
        showPassword ? passwordForm(() => { showPassword = false; draw(); }) : null,
      ].filter(Boolean)); // replaceChildren would write a null out as the text "null"
      return;
    }
    box.replaceChildren(h('p', { class: 'muted small' }, 'Evra hesapları kontrol ediliyor…'));
    try {
      const status = await accountStatus();
      if (member()) return; // signed in meanwhile
      box.replaceChildren(...(status.ready
        ? [intro ? h('p', { class: 'muted small' }, intro) : null, signInForm(status)]
        : [h('p', null, 'Bu bilgisayarda henüz Evra hesabı yok. İlkini oluşturun: yönetici o olur.'), setupForm()]).filter(Boolean));
    } catch (e) {
      box.replaceChildren(h('p', { class: 'error-line' }, e.message),
        h('button', { class: 'btn small', type: 'button', onclick: draw }, icon('refresh', 14), 'Tekrar dene'));
    }
  }

  cleanup.push(onAccount(() => { showPassword = false; draw(); }));
  draw();
  refreshMember();
  return box;
}
