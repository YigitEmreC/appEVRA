// On-screen editing: while edit mode is on (isEditing in js/custom.js), the
// things on screen can be dragged into a new order and hidden with an eye.
// Hidden things stay visible, faded, until editing is done, so they can be
// shown again. Screens call arrangeable() on each group of movable things.

import { getCustom, setCustom, isEditing, withFlag, mergeOrder } from './custom.js';
import { sortable } from './components.js';
import { h } from './util.js';
import { icon } from './icons.js';

const TOOLS = 'edit-tools';

// Takes the edit handles off a container's children (after editing ends, or
// before they're added again).
export function clearArrange(container) {
  for (const el of container.children) {
    el.querySelector(`:scope > .${TOOLS}`)?.remove();
    el.classList.remove('edit-item', 'edit-whole', 'edit-big', 'edit-hidden');
    if (el.tagName === 'A') el.removeAttribute('draggable');
    if (el.dataset.editTab) { el.removeAttribute('tabindex'); delete el.dataset.editTab; }
  }
  container.classList.remove('edit-zone');
}

// Makes the children of `container` that have data-id movable and hideable.
//   key     the list in the customization ('sections', 'quick', 'nav', ...)
//   all     every id of that list in its current order, when the container
//           only holds some of them (the rest keep their places)
//   locked  ids that can be moved but never hidden
//   whole   small things (chips, tabs, buttons): dragged by themselves at once
//   big     big things (sections, scenes): dragged by the handle, or anywhere
//           on them (with a finger, after a short hold so the page scrolls)
//   flag    an extra on/off button: { field, cls, icon, label }, e.g. half width
//   names   id -> name, for the buttons' labels
export function arrangeable(container, key, { all, locked = [], whole = false, big = false, flag, names = {} } = {}) {
  clearArrange(container);
  if (!isEditing()) return;
  const cfg = getCustom()[key];
  container.classList.add('edit-zone');
  // Kept on the container: the listeners below are added once, but the list
  // they save into can change between draws.
  container.editAll = all;

  for (const el of container.children) {
    const id = el.dataset.id;
    if (!id) continue;
    const name = names[id] || el.dataset.name || id;
    const canHide = !locked.includes(id);
    el.classList.add('edit-item');
    if (whole) el.classList.add('edit-whole');
    if (big) el.classList.add('edit-big');
    if (el.tagName === 'A') el.setAttribute('draggable', 'false');
    // Reachable with Tab, so arrow keys can move it (see below).
    if (el.tabIndex < 0) { el.tabIndex = 0; el.dataset.editTab = '1'; }
    el.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight H');
    el.classList.toggle('edit-hidden', canHide && cfg.hidden.includes(id));
    if (flag) el.classList.toggle(flag.cls, (cfg[flag.field] || []).includes(id));
    el.append(h('span', { class: `${TOOLS}${whole ? ' mini' : ''}` },
      whole ? null : h('span', { class: 'edit-grip', title: `${name} taşımak için sürükleyin` }, icon('grip', 16), h('small', null, name)),
      flag ? flagButton(el, key, id, name, flag) : null,
      canHide ? eye(el, key, id, name) : null));
  }

  // Wired once per container: while editing, taps on the movable things
  // don't open or switch anything (their own tools still work); dragging reorders.
  if (container.dataset.editWired) return;
  container.dataset.editWired = '1';
  container.addEventListener('click', (e) => {
    if (!isEditing() || !container.classList.contains('edit-zone')) return;
    const own = e.target.closest('.edit-item');
    if (!own || !container.contains(own)) return;
    if (e.target.closest(`.${TOOLS}, .tile-tools`)) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // Keyboard (and touchpad users who prefer it): arrows move the focused thing,
  // H hides or shows it.
  container.addEventListener('keydown', (e) => {
    if (!isEditing()) return;
    const el = e.target;
    if (el.parentElement !== container || !el.classList.contains('edit-item')) return;
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (back || fwd) {
      e.preventDefault();
      let sib = back ? el.previousElementSibling : el.nextElementSibling;
      while (sib && !sib.classList.contains('edit-item')) sib = back ? sib.previousElementSibling : sib.nextElementSibling;
      if (!sib) return;
      container.insertBefore(el, back ? sib : sib.nextSibling);
      el.focus();
      save();
    } else if (e.key === 'h' || e.key === 'H') {
      el.querySelector(`:scope > .${TOOLS} .edit-eye:not(.edit-flag)`)?.click();
    }
  });
  const save = () => {
    const mine = [...container.children].filter((c) => c.dataset.id).map((c) => c.dataset.id);
    const current = getCustom()[key];
    setCustom({ [key]: { ...current, order: mergeOrder(container.editAll || mine, mine) } }, { rerender: false });
  };
  sortable(container, {
    item: '.edit-item',
    handle: whole ? '.edit-item' : '.edit-grip',
    ignore: `.${TOOLS} button`,
    anywhere: big,
    onEnd: save,
  });
}

function eye(el, key, id, name) {
  const btn = h('button', { type: 'button', class: 'edit-eye' });
  const paint = () => {
    const hidden = el.classList.contains('edit-hidden');
    btn.replaceChildren(icon(hidden ? 'eyeOff' : 'eye', 15));
    btn.setAttribute('aria-pressed', String(!hidden));
    btn.setAttribute('aria-label', `${name}: ${hidden ? 'göster' : 'gizle'}`);
    btn.title = hidden ? 'Gizli: göstermek için dokunun' : 'Gizlemek için dokunun';
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const hide = !el.classList.contains('edit-hidden');
    el.classList.toggle('edit-hidden', hide);
    paint();
    setCustom({ [key]: withFlag(getCustom()[key], 'hidden', id, hide) }, { rerender: false });
  });
  paint();
  return btn;
}

function flagButton(el, key, id, name, { field, cls, icon: ic, label }) {
  const btn = h('button', { type: 'button', class: 'edit-eye edit-flag', title: label, 'aria-label': `${label}: ${name}` }, icon(ic, 15));
  const paint = () => btn.setAttribute('aria-pressed', String(el.classList.contains(cls)));
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = !el.classList.contains(cls);
    el.classList.toggle(cls, on);
    paint();
    setCustom({ [key]: withFlag(getCustom()[key], field, id, on) }, { rerender: false });
  });
  paint();
  return btn;
}
