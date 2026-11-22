// The Evra account panel: first-time setup, sign-in, and the signed-in member,
// used in Settings and on the Assistant tab.

import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import {
  member, isAdmin, canUseAssistant, onAccount, accountStatus, signIn, setUp, signOutAccount, changePassword, refreshMember, websiteOrigin,
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
    ? field('E-mail', { type: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', required: true })
    : field('Username', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = field('Password', { type: 'password', autocomplete: 'current-password', required: true });
  const el = form([user, pass], 'Sign in', async () => {
    if (!user.input.value.trim() || !pass.input.value) throw new Error(site ? 'Enter your e-mail address and password.' : 'Enter your username and password.');
    const u = await signIn(user.input.value, pass.input.value);
    toast(`Signed in as ${u.name}`);
  });
  if (!site) return el;
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  return h('div', { class: 'stack' }, el,
    h('p', { class: 'muted small account-links' },
      `It's your ${status.site || 'Evra website'} account. `,
      status.signupUrl ? link(status.signupUrl, 'Create one') : null, status.signupUrl ? ' · ' : null,
      status.forgotUrl ? link(status.forgotUrl, 'Forgot your password?') : null));
}

// First admin of this computer's stand-in (the website's is made in its D1 Console).
function setupForm() {
  const name = field('Your name', { autocomplete: 'name', required: true });
  const user = field('Username', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }, '3 to 64 characters: letters, numbers and . _ @ + -');
  const pass = field('Password', { type: 'password', autocomplete: 'new-password', required: true }, 'At least 8 characters.');
  const again = field('Password again', { type: 'password', autocomplete: 'new-password', required: true });
  return form([name, user, pass, again], 'Create the admin account', async () => {
    if (pass.input.value !== again.input.value) throw new Error('The two passwords are different.');
    const u = await setUp(name.input.value, user.input.value, pass.input.value);
    toast(`Welcome, ${u.name}. You're the admin.`);
  });
}

function passwordForm(done) {
  const cur = field('Current password', { type: 'password', autocomplete: 'current-password' });
  const next = field('New password', { type: 'password', autocomplete: 'new-password' }, 'At least 8 characters. You stay signed in here; other devices are signed out.');
  const again = field('New password again', { type: 'password', autocomplete: 'new-password' });
  return form([cur, next, again], 'Change password', async () => {
    if (next.input.value !== again.input.value) throw new Error('The two new passwords are different.');
    await changePassword(cur.input.value, next.input.value);
    toast('Password changed');
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
        ? h('span', { class: 'pill ok-pill' }, icon('check', 12), 'Can use the assistant')
        : h('span', { class: 'pill' }, icon('lock', 12), 'No assistant access');
      const site = !!u.email; // a website account (the stand-in has usernames only)
      const plan = site ? h('span', { class: 'pill' }, `${u.planName || u.plan} plan`) : null;
      box.replaceChildren(...[
        h('div', { class: 'account-who' },
          h('span', { class: 'account-avatar', 'aria-hidden': 'true' }, (u.name || '?').trim().charAt(0).toUpperCase()),
          h('div', { class: 'account-text' }, h('strong', null, u.name), h('small', { class: 'muted' }, `${u.username} · ${u.role === 'admin' ? 'Admin' : 'Member'}`))),
        h('div', { class: 'account-pills' }, ...[access, plan].filter(Boolean)),
        site && !canUseAssistant(u) ? h('p', { class: 'muted small' }, 'The assistant comes with the Premium plan, or an Evra admin can switch it on for you.') : null,
        h('div', { class: 'btn-row' },
          isAdmin(u) ? h('a', { class: 'btn', href: '#/members' }, icon('person', 16), 'Manage members') : null,
          site ? h('a', { class: 'btn ghost', href: `${websiteOrigin()}/hesabim.html`, target: '_blank', rel: 'noopener' }, icon('person', 16), 'Your account online') : null,
          h('button', { class: 'btn ghost', type: 'button', 'aria-expanded': String(showPassword), onclick: () => { showPassword = !showPassword; draw(); } }, icon('lock', 16), 'Change password'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await signOutAccount(); toast('Signed out of Evra'); } }, 'Sign out')),
        showPassword ? passwordForm(() => { showPassword = false; draw(); }) : null,
      ].filter(Boolean)); // replaceChildren would write a null out as the text "null"
      return;
    }
    box.replaceChildren(h('p', { class: 'muted small' }, 'Checking Evra accounts…'));
    try {
      const status = await accountStatus();
      if (member()) return; // signed in meanwhile
      box.replaceChildren(...(status.ready
        ? [intro ? h('p', { class: 'muted small' }, intro) : null, signInForm(status)]
        : [h('p', null, 'No Evra accounts on this computer yet. Create the first one: it becomes the admin, who adds the other members and decides who can use the assistant.'), setupForm()]).filter(Boolean));
    } catch (e) {
      box.replaceChildren(h('p', { class: 'error-line' }, e.message),
        h('button', { class: 'btn small', type: 'button', onclick: draw }, icon('refresh', 14), 'Try again'));
    }
  }

  cleanup.push(onAccount(() => { showPassword = false; draw(); }));
  draw();
  refreshMember();
  return box;
}
