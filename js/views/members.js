// Members (admins only): decide who can use the assistant, make admins, switch
// app access off.
//   On the Evra website: everyone with a website account is listed with their plan
//   (Premium includes the assistant). They sign up, rename themselves, reset passwords
//   and delete their accounts on the website, so those buttons aren't here.
//   On this computer's stand-in: admins also add members, reset passwords and delete.

import { h, toast, relTime } from '../util.js';
import { icon } from '../icons.js';
import { card, toggle } from '../components.js';
import { member, isAdmin, onAccount, listMembers, addMember, updateMember, deleteMember, refreshMember } from '../account.js';
import { accountPanel } from './account-ui.js';

export function renderMembers(root, cleanup) {
  const back = h('a', { class: 'back-link', href: '#/settings' }, icon('left', 16), 'Settings');
  const listBox = h('div', { class: 'member-list', 'aria-live': 'polite' });
  const intro = h('p', { class: 'muted intro' });
  const top = h('div');
  let site = false; // the Evra website's members, not this computer's
  let alive = true;
  cleanup.push(() => { alive = false; });

  function draw() {
    if (!isAdmin()) {
      root.replaceChildren(back, card({ title: 'Members', iconName: 'person' },
        h('p', null, member() ? 'Only admins can manage members.' : 'Sign in with an admin account to manage members.'),
        member() ? null : accountPanel(cleanup)));
      return;
    }
    root.replaceChildren(back, intro, top, listBox);
    load();
  }

  async function load() {
    try {
      const res = await listMembers();
      if (!alive) return;
      const wasSite = site;
      site = res.kind === 'website';
      intro.textContent = site
        ? `Everyone with an Evra website account. The assistant comes with the ${(res.aiPlans || ['Premium']).join(' or ')} plan; switch it on or off for anyone here. Admins can always use it.`
        : 'Members sign in under Settings → Evra account. Switch the assistant on or off for each member; admins can always use it.';
      if (!top.firstChild || wasSite !== site) top.replaceChildren(site ? signupCard(res.signupUrl) : addForm());
      listBox.replaceChildren(...res.members.map(row));
    } catch (e) {
      if (alive) listBox.replaceChildren(h('p', { class: 'error-line' }, e.message));
    }
  }

  async function change(fn, okText) {
    try {
      await fn();
      if (okText) toast(okText);
      await refreshMember(); // in case admins changed their own account
    } catch (e) {
      toast(e.message, 'error');
      throw e; // a switch flips back
    } finally {
      if (alive && isAdmin()) load();
    }
  }

  function signupCard(url) {
    return card({ title: 'New members', iconName: 'plus' },
      h('p', null, 'Members create their own account on the Evra website with their e-mail address. They appear here once they have.'),
      url ? h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, icon('plus', 16), 'Website sign-up page')) : null);
  }

  function addForm() {
    let n = 0;
    const field = (label, attrs, hint) => {
      const id = `mem-${++n}`;
      const input = h('input', { class: 'input', id, ...attrs });
      return { input, el: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'muted' }, hint) : null) };
    };
    const name = field('Name', { autocomplete: 'off' });
    const user = field('Username', { autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const pass = field('Temporary password', { type: 'password', autocomplete: 'new-password' }, 'At least 8 characters. Give it to the member; they can change it under Settings.');
    const ai = h('input', { type: 'checkbox', id: 'mem-ai' });
    const admin = h('input', { type: 'checkbox', id: 'mem-admin' });
    const err = h('p', { class: 'error-line', role: 'alert' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, icon('plus', 16), 'Add member');
    const form = h('form', { class: 'stack member-add', novalidate: true },
      h('div', { class: 'member-add-grid' }, name.el, user.el, pass.el),
      h('label', { class: 'check-field', for: 'mem-ai' }, ai, h('span', null, 'Can use the assistant')),
      h('label', { class: 'check-field', for: 'mem-admin' }, admin, h('span', null, 'Admin (can manage members)')),
      err, h('div', { class: 'btn-row' }, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      submit.disabled = true;
      try {
        await addMember({ name: name.input.value, username: user.input.value, password: pass.input.value, role: admin.checked ? 'admin' : 'member', features: { ai: ai.checked } });
        toast(`${name.input.value.trim()} added`);
        form.reset();
        load();
      } catch (ex) { err.textContent = ex.message; } finally { submit.disabled = false; }
    });
    return card({ title: 'Add a member', iconName: 'plus' }, form);
  }

  function row(m) {
    const me = member();
    const self = me && me.id === m.id;
    const aiSwitch = toggle(`Assistant for ${m.name}`, (on) => change(() => updateMember(m.id, { features: { ai: on } }), on ? `${m.name} can use the assistant` : `${m.name} can no longer use the assistant`));
    aiSwitch.set(m.role === 'admin' || !!m.features?.ai, m.role === 'admin' || m.disabled);
    const accessName = site ? 'App access' : 'Account active';
    const activeSwitch = toggle(`${accessName} for ${m.name}`, (on) => change(() => updateMember(m.id, { disabled: !on }),
      on ? `${m.name} can use the app again` : site ? `${m.name} can no longer use the app` : `${m.name}'s account is off and signed out`));
    activeSwitch.set(!m.disabled, false);
    const role = h('select', { class: 'select', 'aria-label': `Role for ${m.name}` },
      h('option', { value: 'member', selected: m.role === 'member' }, 'Member'),
      h('option', { value: 'admin', selected: m.role === 'admin' }, 'Admin'));
    role.addEventListener('change', () => change(() => updateMember(m.id, { role: role.value }), `${m.name} is now ${role.value === 'admin' ? 'an admin' : 'a member'}`).catch(() => {}));

    // On the website: the assistant follows the plan unless an admin chose; this undoes the choice.
    const aiLabel = m.role === 'admin' ? 'Assistant (always, as admin)'
      : !site ? 'Can use the assistant'
        : m.aiFrom === 'plan' ? (m.planHasAi ? `Can use the assistant (in ${m.planName})` : 'Can use the assistant')
          : 'Can use the assistant (set by an admin)';
    const followPlan = site && m.role !== 'admin' && m.aiOverride !== null && m.aiOverride !== undefined
      ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => change(() => updateMember(m.id, { features: { ai: null } }), `${m.name} follows their plan again`).catch(() => {}) },
        icon('refresh', 14), `Follow the ${m.planName} plan`)
      : null;

    const resetBox = h('div', { class: 'member-reset', hidden: true });
    const resetBtn = h('button', { class: 'btn small ghost', type: 'button', 'aria-expanded': 'false' }, icon('lock', 14), 'Reset password');
    resetBtn.addEventListener('click', () => {
      resetBox.hidden = !resetBox.hidden;
      resetBtn.setAttribute('aria-expanded', String(!resetBox.hidden));
      if (!resetBox.hidden) {
        const id = `reset-${m.id}`;
        const input = h('input', { class: 'input', id, type: 'password', autocomplete: 'new-password' });
        const go = h('button', { class: 'btn small primary', type: 'submit' }, 'Set password');
        const f = h('form', { class: 'inline-form' }, h('label', { for: id, class: 'sr-only' }, `New password for ${m.name}`), input, go);
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          change(() => updateMember(m.id, { password: input.value }), self ? 'Password changed' : `New password set; ${m.name} is signed out everywhere`).catch(() => {});
        });
        resetBox.replaceChildren(h('p', { class: 'muted small' }, 'At least 8 characters. Tell the member their new password.'), f);
        input.focus();
      }
    });
    const del = h('button', { class: 'btn small ghost danger-text', type: 'button' }, icon('trash', 14), 'Delete');
    del.addEventListener('click', () => {
      if (!confirm(`Delete ${m.name}'s account (${m.username})? This can't be undone.`)) return;
      change(() => deleteMember(m.id), `${m.name}'s account deleted`).catch(() => {});
    });

    return h('article', { class: `member${m.disabled ? ' off' : ''}` },
      h('div', { class: 'member-top' },
        h('span', { class: 'account-avatar', 'aria-hidden': 'true' }, (m.name || '?').trim().charAt(0).toUpperCase()),
        h('div', { class: 'member-text' },
          h('strong', null, m.name, self ? h('span', { class: 'pill' }, 'You') : null),
          h('small', { class: 'muted' }, [m.username, site ? `${m.planName} plan` : null,
            m.last_login ? `last signed in ${relTime(new Date(m.last_login * 1000).toISOString())}` : site ? 'not signed in to the app yet' : 'never signed in',
            m.disabled ? (site ? 'no app access' : 'switched off') : null].filter(Boolean).join(' · '))),
        role),
      h('div', { class: 'member-switches' },
        h('label', { class: 'member-switch' }, aiSwitch, h('span', null, aiLabel)),
        h('label', { class: 'member-switch' }, activeSwitch, h('span', null, accessName))),
      site ? (followPlan ? h('div', { class: 'btn-row' }, followPlan) : null) : h('div', { class: 'btn-row' }, resetBtn, del),
      site ? null : resetBox);
  }

  cleanup.push(onAccount(() => draw()));
  draw();
}
