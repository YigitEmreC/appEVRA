// The home's remotes, kept with js/appdata.js (key "remotes": { v: 1, list }).
//
// Two kinds:
//   builtin: the TV and heater remotes made for this home (js/config.js HOME.tv / HOME.heater),
//            whose buttons are entities on the IR module that learned them;
//   codes:   a remote added from the IR code database, sent through the chosen IR module
//            ({ id, kind: 'codes', name, type, brand, set, module: <device id>, buttons }).
// Until the person changes something, the list is the built-in remotes.

import { HOME } from './config.js';
import { store } from './store.js';
import { cachedData, loadData, saveData, onData } from './appdata.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BUILTINS = [
  { id: 'tv', kind: 'builtin', builtin: 'tv', type: 'tv' },
  { id: 'heater', kind: 'builtin', builtin: 'heater', type: 'other' },
];

export const builtinAvailable = (r) => r.kind !== 'builtin' || !!store.get(HOME[r.builtin]?.buttons?.power);
// The IR module a built-in remote's buttons live on: the device of its power button.
export const builtinModule = (r) => store.entities.get(HOME[r.builtin]?.buttons?.power || '')?.device_id || null;
export const remoteName = (r) => r.name || (r.kind === 'builtin' ? HOME[r.builtin]?.name : '') || 'Kumanda';

export function remotes() {
  const v = cachedData('remotes');
  return Array.isArray(v?.list) ? v.list : BUILTINS.map(clone);
}
export const remotesCustomised = () => Array.isArray(cachedData('remotes')?.list);
export async function loadRemotes() { await loadData('remotes'); return remotes(); }
export const onRemotes = (fn) => onData('remotes', () => fn(remotes()));

async function put(list) { await saveData('remotes', { v: 1, list: list.map(clone) }); }
export async function saveRemote(remote) {
  const list = remotes().map(clone);
  const i = list.findIndex((r) => r.id === remote.id);
  if (i >= 0) list[i] = clone(remote); else list.push(clone(remote));
  await put(list);
}
export async function deleteRemote(id) { await put(remotes().filter((r) => r.id !== id)); }
/** Puts the built-in TV and heater remotes back (the person's own remotes stay). */
export async function restoreBuiltins() {
  const list = remotes().filter((r) => r.kind !== 'builtin');
  await put([...BUILTINS.map(clone), ...list]);
}
export const missingBuiltins = () => BUILTINS.filter((b) => builtinAvailable(b) && !remotes().some((r) => r.id === b.id));
