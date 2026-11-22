import { h } from '../util.js';
import { icon } from '../icons.js';

// Placeholder for the Evra assistant chat, to be built later.
export function renderChat(root) {
  root.append(h('div', { class: 'chat-empty' },
    h('span', { class: 'chat-devil' }, icon('devil', 64)),
    h('h2', null, 'Evra assistant'),
    h('p', { class: 'muted' }, 'Coming soon.')));
}
