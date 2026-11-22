import { HOME } from '../config.js';
import { store, ensurePower, setTracker } from '../store.js';
import { h, isOn, isAvailable, clamp, loadSettings, saveSettings } from '../util.js';
import { icon } from '../icons.js';
import { card, toggle, irButton } from '../components.js';

// One remote at a time: swipe sideways, or use the tabs and arrows above.
export function renderRemotes(root, cleanup) {
  const remotes = [
    { id: 'tv', name: 'TV', iconName: 'tv', el: tvRemote(cleanup) },
    { id: 'heater', name: 'Heater', iconName: 'heater', el: heaterRemote(cleanup) },
  ];
  const last = remotes.length - 1;
  let index = Math.max(0, remotes.findIndex((r) => r.id === loadSettings().remote));

  const slides = remotes.map((r) => h('div', { class: 'remote-slide', id: `remote-${r.id}`, role: 'tabpanel', 'aria-label': `${r.name} remote` }, r.el));
  const track = h('div', { class: 'remote-track' }, slides);
  const tabs = remotes.map((r, i) => h('button', {
    type: 'button', role: 'tab', 'aria-controls': `remote-${r.id}`, onclick: () => go(i),
  }, icon(r.iconName, 16), r.name));
  const tabBar = h('div', { class: 'segmented remote-tabs', role: 'tablist', 'aria-label': 'Remotes' }, tabs);
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous remote', title: 'Previous remote', onclick: () => go(index - 1) }, icon('left', 20));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next remote', title: 'Next remote', onclick: () => go(index + 1) }, icon('right', 20));
  tabBar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    go(index + (e.key === 'ArrowRight' ? 1 : -1));
    tabs[index].focus();
  });

  // The track takes the height of the remote on show, so the short heater
  // remote doesn't leave the TV remote's height of empty space below it.
  const fitHeight = () => { track.style.height = `${slides[index].offsetHeight}px`; };

  function mark(i) {
    index = i;
    tabs.forEach((t, k) => {
      t.classList.toggle('active', k === i);
      t.setAttribute('aria-selected', String(k === i));
      t.tabIndex = k === i ? 0 : -1;
    });
    // Keys on the remote that's off screen can't be reached with Tab.
    slides.forEach((s, k) => { s.inert = k !== i; });
    prev.disabled = i === 0;
    next.disabled = i === last;
    fitHeight();
    saveSettings({ remote: remotes[i].id });
  }

  function go(i, smooth = true) {
    i = clamp(i, 0, last);
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    mark(i);
  }

  // Swiping: when the scroll settles on another remote, select it.
  let settle;
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = clamp(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)), 0, last);
      if (i !== index) mark(i);
    }, 90);
  }, { passive: true });

  // Keep the shown remote lined up when the window changes width.
  let lastWidth = 0;
  const ro = new ResizeObserver(() => {
    fitHeight();
    if (track.clientWidth !== lastWidth) { lastWidth = track.clientWidth; track.scrollLeft = index * track.clientWidth; }
  });
  slides.forEach((s) => ro.observe(s));
  ro.observe(track);
  cleanup.push(() => { ro.disconnect(); clearTimeout(settle); });

  root.append(h('div', { class: 'remote-slider' },
    h('div', { class: 'remote-nav' }, prev, tabBar, next),
    track));
  mark(index);
  requestAnimationFrame(() => go(index, false));
}

function powerHeader(device, cleanup) {
  const cfg = HOME[device];
  const sw = toggle(`${cfg.name} on or off`, (on) => ensurePower(device, on));
  const label = h('span', { class: 'remote-state' }, '–');
  const fix = h('button', { class: 'link small', type: 'button' }, 'Correct');
  fix.addEventListener('click', () => setTracker(device, store.get(cfg.tracker)?.state !== 'on'));
  cleanup.push(store.watch(cfg.tracker, (t) => {
    sw.set(isOn(t), !isAvailable(t));
    label.textContent = !isAvailable(t) ? 'Unknown' : isOn(t) ? 'On' : 'Off';
    fix.title = isOn(t) ? 'Mark as off without sending anything' : 'Mark as on without sending anything';
  }));
  return h('div', { class: 'remote-head' }, label, fix, sw);
}

function tvRemote(cleanup) {
  const b = HOME.tv.buttons;
  const ir = (id, opts) => irButton(id, opts, cleanup);
  return card({ title: 'TV remote', iconName: 'tv', extra: powerHeader('tv', cleanup), className: 'remote tv-remote' },
    h('div', { class: 'remote-row three' },
      ir(b.power, { label: 'Power', iconName: 'power', className: 'key danger' }),
      ir(b.input, { label: 'Input', iconName: 'input', className: 'key' }),
      ir(b.netflix, { label: 'Netflix', iconName: 'netflix', className: 'key netflix' })),
    h('div', { class: 'remote-row three' },
      ir(b.hdmi1, { label: 'HDMI 1', text: 'HDMI 1', className: 'key small-text' }),
      ir(b.hdmi2, { label: 'HDMI 2', text: 'HDMI 2', className: 'key small-text' }),
      ir(b.hdmi3, { label: 'HDMI 3', text: 'HDMI 3', className: 'key small-text' })),
    h('div', { class: 'remote-row two' },
      ir(b.back, { label: 'Back', iconName: 'back', className: 'key' }),
      ir(b.home, { label: 'Home', iconName: 'home', className: 'key' })),
    h('div', { class: 'dpad' },
      ir(b.up, { label: 'Up', iconName: 'up', className: 'dp up', size: 28 }),
      ir(b.left, { label: 'Left', iconName: 'left', className: 'dp left', size: 28 }),
      ir(b.ok, { label: 'OK', text: 'OK', className: 'dp ok' }),
      ir(b.right, { label: 'Right', iconName: 'right', className: 'dp right', size: 28 }),
      ir(b.down, { label: 'Down', iconName: 'down', className: 'dp down', size: 28 })),
    h('div', { class: 'remote-row two' },
      ir(b.settings, { label: 'Settings', iconName: 'gear', className: 'key' }),
      ir(b.exit, { label: 'Exit', iconName: 'close', className: 'key' })),
    h('div', { class: 'rockers' },
      h('div', { class: 'rocker' },
        ir(b.volumeUp, { label: 'Volume up', iconName: 'plus', className: 'rk' }),
        h('span', { class: 'rocker-label' }, 'VOL'),
        ir(b.volumeDown, { label: 'Volume down', iconName: 'minus', className: 'rk' })),
      ir(b.mute, { label: 'Mute', iconName: 'mute', className: 'key mute' }),
      h('div', { class: 'rocker' },
        ir(b.channelUp, { label: 'Channel up', iconName: 'up', className: 'rk' }),
        h('span', { class: 'rocker-label' }, 'CH'),
        ir(b.channelDown, { label: 'Channel down', iconName: 'down', className: 'rk' }))),
    h('div', { class: 'remote-row five' },
      ir(b.rewind, { label: 'Rewind', iconName: 'rewind', className: 'key' }),
      ir(b.play, { label: 'Play', iconName: 'play', className: 'key' }),
      ir(b.pause, { label: 'Pause', iconName: 'pause', className: 'key' }),
      ir(b.stop, { label: 'Stop', iconName: 'stop', className: 'key' }),
      ir(b.forward, { label: 'Fast forward', iconName: 'forward', className: 'key' })),
    h('div', { class: 'numpad' },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ir(b.digits[n], { label: String(n), text: String(n), className: 'key digit' })),
      ir(b.digits[0], { label: '0', text: '0', className: 'key digit zero' })));
}

function heaterRemote(cleanup) {
  const b = HOME.heater.buttons;
  const ir = (id, opts) => irButton(id, opts, cleanup);
  return card({ title: 'Heater remote', iconName: 'heater', extra: powerHeader('heater', cleanup), className: 'remote heater-remote' },
    h('div', { class: 'remote-row three' },
      ir(b.power, { label: 'Power', iconName: 'power', className: 'key danger' }),
      ir(b.lock, { label: 'Lock', iconName: 'lock', className: 'key' }),
      ir(b.toggle, { label: 'Toggle', iconName: 'toggle', className: 'key' })),
    h('div', { class: 'temp-keys' },
      ir(b.tempDown, { label: 'Temperature down', iconName: 'minus', className: 'key big cool', size: 30 }),
      h('span', { class: 'temp-keys-label' }, 'Temperature'),
      ir(b.tempUp, { label: 'Temperature up', iconName: 'plus', className: 'key big warm', size: 30 })),
    h('div', { class: 'remote-row three' },
      ir(b.eco, { label: 'ECO mode', iconName: 'leaf', text: 'ECO', className: 'key labelled' }),
      ir(b.performance, { label: 'Performance mode', iconName: 'flame', text: 'Boost', className: 'key labelled' }),
      ir(b.sleep, { label: 'Sleep mode', iconName: 'moon', text: 'Sleep', className: 'key labelled' })),
    h('p', { class: 'card-foot muted dev-only' }, 'Power is sent only through the switch above when the tracker says the heater is in the other state. The red key always sends the code.'));
}
