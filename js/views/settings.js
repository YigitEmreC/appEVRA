import { HOME } from '../config.js';
import { store } from '../store.js';
import { h, num, numVal, isAvailable, loadSettings, saveSettings, setPrefs, toast } from '../util.js';
import { icon } from '../icons.js';
import { card, toggle } from '../components.js';
import { signOut } from '../backends/live.js';

export function renderSettings(root, cleanup, { reconnect }) {
  const settings = loadSettings();

  // ---- connection -------------------------------------------------------
  const statusLine = h('p', { class: 'status-line' });
  cleanup.push(store.onStatus((s) => {
    const label = { connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', error: 'Problem', idle: 'Not connected' }[s.state] || s.state;
    statusLine.replaceChildren(h('span', { class: `status-dot ${s.state}` }), `${s.mode === 'demo' ? 'Demo' : 'Live'} · ${label}`, s.message ? h('span', { class: 'muted' }, ` — ${s.message}`) : null);
  }));

  let mode = settings.mode;
  const modeTabs = h('div', { class: 'segmented', role: 'tablist' });
  const urlInput = h('input', { class: 'input', type: 'url', value: settings.hassUrl, 'aria-label': 'Home Assistant address', placeholder: 'http://homeassistant.local' });
  const urlField = h('label', { class: 'field' }, h('span', null, 'Home Assistant address'), urlInput);
  const liveHelp = h('p', { class: 'muted small' }, 'Connecting opens Home Assistant\'s own login page. Your password goes only to Home Assistant; the app keeps a sign-in token on this device.');
  const drawMode = () => {
    modeTabs.replaceChildren(...[['demo', 'Demo'], ['live', 'Live']].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(mode === id), class: mode === id ? 'active' : '',
      onclick: () => { mode = id; drawMode(); },
    }, label)));
    urlField.hidden = mode !== 'live';
    liveHelp.hidden = mode !== 'live';
  };
  drawMode();

  const connectBtn = h('button', { class: 'btn primary', type: 'button' }, 'Connect');
  connectBtn.addEventListener('click', () => {
    let url = urlInput.value.trim().replace(/\/+$/, '');
    if (mode === 'live' && !/^https?:\/\//.test(url)) { toast('The address must start with http:// or https://', 'error'); return; }
    saveSettings({ mode, hassUrl: url || settings.hassUrl });
    reconnect();
  });
  const signOutBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Sign out');
  signOutBtn.addEventListener('click', () => { signOut(); toast('Signed out of Home Assistant'); if (loadSettings().mode === 'live') reconnect(); });

  // ---- demo controls ----------------------------------------------------
  const demoCard = card({ title: 'Demo controls', iconName: 'sparkle', className: 'dev-only' },
    h('p', { class: 'muted small' }, 'Pretend things happen in the room, to test the app and the imitated automations.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.toggleWindow() }, icon('window', 16), 'Open / close window'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.walkIn() }, icon('person', 16), 'Someone walks in'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.nudgeTemperature(-0.5) }, icon('minus', 16), '0.5°'),
      h('button', { class: 'btn', type: 'button', onclick: () => store.backend?.simulate?.nudgeTemperature(0.5) }, icon('plus', 16), '0.5°')),
    h('p', { class: 'muted small' }, 'Devices, rooms and automations you change in the demo are kept on this device.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn danger', type: 'button', onclick: () => {
        if (!confirm('Reset the demo? Devices, rooms and automations go back to the snapshot.')) return;
        store.backend?.resetDemo?.();
        reconnect();
        toast('Demo reset to the snapshot');
      } }, icon('refresh', 16), 'Reset demo')));
  cleanup.push(store.onStatus((s) => { demoCard.hidden = s.mode !== 'demo'; }));

  // ---- preferences -------------------------------------------------------
  const themeTabs = h('div', { class: 'segmented theme-tabs', role: 'radiogroup', 'aria-label': 'Appearance' });
  const devSwitch = toggle('Developer mode', (on) => { setPrefs({ devMode: on }); toast(on ? 'Developer mode on' : 'Developer mode off'); });
  const drawPrefs = () => {
    const { theme, devMode } = loadSettings();
    themeTabs.replaceChildren(...[['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['auto', 'Auto', 'auto']].map(([id, label, ic]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(theme === id), class: theme === id ? 'active' : '',
      title: id === 'auto' ? 'Follow this device\'s light or dark setting' : `Always ${label.toLowerCase()}`,
      onclick: () => setPrefs({ theme: id }),
    }, icon(ic, 16), label)));
    devSwitch.set(devMode);
  };
  drawPrefs();
  window.addEventListener('evra-prefs', drawPrefs);
  cleanup.push(() => window.removeEventListener('evra-prefs', drawPrefs));
  const price = h('input', { class: 'input', type: 'number', min: 0, step: 0.01, value: settings.pricePerKwh, 'aria-label': 'Electricity price per kWh' });
  price.addEventListener('change', () => {
    const v = parseFloat(price.value);
    if (Number.isFinite(v) && v >= 0) { saveSettings({ pricePerKwh: v }); toast('Price saved'); } else toast('Enter a price like 0.30', 'error');
  });

  // ---- batteries -----------------------------------------------------------
  const batteryList = h('ul', { class: 'battery-list' });
  cleanup.push(store.watch(HOME.batteries.map((b) => b.entity), (...states) => {
    batteryList.replaceChildren(...HOME.batteries.map((b, i) => {
      const s = states[i];
      const v = numVal(s);
      return h('li', null, icon('battery', 18), h('span', null, b.name),
        h('strong', { class: v != null && v < 20 ? 'low' : '' }, isAvailable(s) ? `${num(s, 0)}%` : 'offline'));
    }));
  }));

  root.append(
    h('div', { class: 'shortcut-row' },
      h('a', { class: 'shortcut', href: '#/energy' }, icon('chart', 20), h('span', null, 'Energy & climate'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/remotes' }, icon('remote', 20), h('span', null, 'Remotes'), icon('right', 16)),
      h('a', { class: 'shortcut', href: '#/devices?tab=rooms' }, icon('rooms', 20), h('span', null, 'Rooms'), icon('right', 16))),
    card({ title: 'Connection', iconName: 'home' }, statusLine, modeTabs, urlField, liveHelp, h('div', { class: 'btn-row' }, connectBtn, signOutBtn)),
    card({ title: 'Preferences', iconName: 'gear' },
      settingRow('Appearance', 'Auto follows this device\'s light or dark setting.', themeTabs),
      settingRow('Developer mode', 'Shows technical details: entity lists, model and firmware numbers, JSON editing and demo tools.', devSwitch),
      h('label', { class: 'field' }, h('span', null, 'Electricity price (€ per kWh)'), price)),
    demoCard,
    card({ title: 'Sensor batteries', iconName: 'battery' }, batteryList),
    h('p', { class: 'muted small about' }, 'Evra · runs on Home Assistant', h('span', { class: 'dev-only' }, ' · the product range is in js/catalog.js')),
  );
}

function settingRow(title, hint, control) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('strong', null, title), hint ? h('small', null, hint) : null),
    control);
}
