import { HOME } from '../config.js';
import { store } from '../store.js';
import { h, num, numVal, isAvailable, loadSettings } from '../util.js';
import { icon } from '../icons.js';
import { card, lineChart, timeline } from '../components.js';

const RANGES = [
  { id: '6h', label: '6 h', hours: 6 },
  { id: '24h', label: '24 h', hours: 24 },
  { id: '7d', label: '7 days', hours: 168 },
];

export function renderEnergy(root, cleanup) {
  const p = HOME.plug;
  const tile = (label, iconName, tone) => {
    const value = h('div', { class: 'tile-value' }, '–');
    return { el: h('div', { class: 'tile', style: { '--tone': tone } }, h('div', { class: 'tile-label' }, h('span', { class: 'tile-icon' }, icon(iconName, 16)), label), value), value };
  };
  const now = tile('Using now', 'bolt', '#9ED5FD');
  const today = tile('Today', 'sun', '#9AAFDD');
  const month = tile('This month', 'chart', '#B3C6EA');
  const cost = tile('Month cost (est.)', 'plug', '#B3C6B3');
  cleanup.push(store.watch([p.power, p.today, p.month, p.voltage], (w, t, m) => {
    now.value.replaceChildren(isAvailable(w) ? num(w) : '–', h('small', null, ' W'));
    today.value.replaceChildren(num(t, 3), h('small', null, ' kWh'));
    month.value.replaceChildren(num(m, 3), h('small', null, ' kWh'));
    const mv = numVal(m);
    cost.value.textContent = mv != null ? `€${(mv * loadSettings().pricePerKwh).toFixed(2)}` : '–';
  }));

  let range = RANGES[1];
  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const body = h('div', { class: 'energy-charts' });
  const refresh = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reload history', title: 'Reload history' }, icon('refresh', 18));
  refresh.addEventListener('click', () => load());

  const drawTabs = () => tabs.replaceChildren(...RANGES.map((r) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(r === range), class: r === range ? 'active' : '',
    onclick: () => { range = r; drawTabs(); load(); },
  }, r.label)));
  drawTabs();

  let alive = true;
  cleanup.push(() => { alive = false; });

  async function load() {
    if (!store.backend || store.status.state !== 'connected') {
      body.replaceChildren(h('p', { class: 'muted pad' }, 'History appears once the app is connected.'));
      return;
    }
    body.replaceChildren(h('p', { class: 'muted pad' }, 'Loading history…'));
    const end = new Date().toISOString();
    const start = new Date(Date.now() - range.hours * 3600 * 1000).toISOString();
    const c = HOME.climate;
    const ids = [p.power, c.temperature, c.humidity, HOME.presence.occupancy, HOME.window.contact];
    let data;
    try {
      data = await store.backend.fetchHistory(ids, start, end);
    } catch (e) {
      if (alive) body.replaceChildren(h('p', { class: 'muted pad' }, `Couldn't load history: ${e.message}`));
      return;
    }
    if (!alive) return;
    const band = { min: numVal(store.get(c.comfortTempMin)) ?? 19, max: numVal(store.get(c.comfortTempMax)) ?? 27 };
    body.replaceChildren(
      card({ title: 'Plug power', iconName: 'bolt' },
        lineChart({ series: [{ rows: data[p.power], cls: 'c-power' }], start, end, unit: 'W' })),
      card({ title: 'Temperature', iconName: 'thermometer', extra: h('span', { class: 'legend' }, h('i', { class: 'band-swatch' }), 'comfort range') },
        lineChart({ series: [{ rows: data[c.temperature], cls: 'c-temp' }], start, end, unit: '°C', band })),
      card({ title: 'Humidity', iconName: 'droplet' },
        lineChart({ series: [{ rows: data[c.humidity], cls: 'c-hum' }], start, end, unit: '%', digits: 0, height: 130 })),
      card({ title: 'Activity', iconName: 'person' },
        timeline({ start, end, lanes: [
          { label: 'Presence', rows: data[HOME.presence.occupancy], cls: 'tl-presence' },
          { label: 'Window open', rows: data[HOME.window.contact], cls: 'tl-window' },
        ] })),
    );
  }

  let lastState = null;
  cleanup.push(store.onStatus((s) => {
    if (s.state === lastState) return;
    lastState = s.state;
    load();
  }));

  root.append(
    h('div', { class: 'tiles' }, now.el, today.el, month.el, cost.el),
    h('div', { class: 'toolbar' }, tabs, refresh),
    body,
  );
}
