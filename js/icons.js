// A small line-icon set drawn on a 24-unit grid. icon('name') returns an <svg>.

const P = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5',
  remote: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM12 6.5h.01M10 11h4M12 9v4M10 17h.01M14 17h.01',
  chart: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
  robot: 'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM12 4v4M9 13h.01M15 13h.01M9.5 16.5h5',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  power: 'M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0',
  thermometer: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z',
  droplet: 'M12 3.5s6 6.6 6 10.5a6 6 0 0 1-12 0c0-3.9 6-10.5 6-10.5z',
  window: 'M5 3.5h14v17H5zM12 3.5v17M5 12h14',
  person: 'M12 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM9 21l1.5-6.5L8 12l4-3 3 3 2.5 1M10.5 14.5 13 16l1.5 5',
  plug: 'M9 2.5v5M15 2.5v5M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v5.5',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3V16h6v-.9c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3z',
  tv: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M12 17v4',
  heater: 'M6 5v12M10 5v12M14 5v12M18 5v12M4 17h16M6 20v-3M18 20v-3M4 5h16',
  lock: 'M6 11h12v9.5H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  leaf: 'M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15M5 19l7-7',
  flame: 'M12 21a6 6 0 0 0 6-6c0-4.5-4-6-4-10-3 1.5-5 4.5-5 7.5-1.2-.6-1.8-1.8-2-3-1.4 1.6-1 3.6-1 5.5a6 6 0 0 0 6 6z',
  moon: 'M20 14.2A8 8 0 1 1 9.8 4a6.5 6.5 0 0 0 10.2 10.2z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  stop: 'M6 6h12v12H6z',
  rewind: 'M11 7v10l-7-5zM20 7v10l-7-5z',
  forward: 'M4 7v10l7-5zM13 7v10l7-5z',
  volume: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  back: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  input: 'M3 12h11M10 8l4 4-4 4M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  bolt: 'M13 2.5 4.5 13.5H11L10 21.5l8.5-11H12z',
  sparkle: 'M12 3.5l1.9 5.4 5.6 1.6-5.6 1.6L12 17.5l-1.9-5.4L4.5 10.5l5.6-1.6zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  cloud: 'M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18.5z',
  battery: 'M3.5 8h15v8h-15zM18.5 10.5h2v3h-2M6 10.5v3',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  toggle: 'M7.5 7h9a5 5 0 0 1 0 10h-9a5 5 0 0 1 0-10zM16.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  netflix: 'M8 3.5v17M16 3.5v17M8 3.5l8 17',
  ok: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  wifiOff: 'M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M19 12.9a10 10 0 0 0-2.4-1.6M2 9.3a15 15 0 0 1 4.3-2.7M22 9.3A15 15 0 0 0 11 5.6M12 20h.01',
  wifi: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01',
  camera: 'M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  siren: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15zM10 21h4M12 2.5v1.5M4 5l1.2 1.2M20 5l-1.2 1.2',
  alert: 'M12 3.5 21.5 20h-19zM12 10v4.5M12 17.5h.01',
  smoke: 'M4 6.5h16v2a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 8.5zM8 14.5c-1 1.2 1 2.2 0 3.6M12 14.5c-1 1.2 1 2.2 0 3.6M16 14.5c-1 1.2 1 2.2 0 3.6',
  valve: 'M3 13h18M3 18h18M3 13v5M21 13v5M12 13V8.5M7.5 5.5h9M12 5.5v3',
  curtain: 'M3 3.5h18M5 3.5c0 7 2.5 11 5 17H5zM19 3.5c0 7-2.5 11-5 17h5z',
  blind: 'M4 3.5h16M5 3.5v11h14v-11M5 7h14M5 10.5h14M12 14.5v4M10.5 20h3',
  shutter: 'M4 4h16v16H4zM4 8h16M4 12h16M4 16h16',
  sprout: 'M12 21v-9M12 12c0-4-3-6.5-7.5-6.5 0 4 3 6.5 7.5 6.5zM12 14.5c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4',
  tablet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  radar: 'M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M12 12l5.5-5.5M19.5 12A7.5 7.5 0 1 1 12 4.5M16 12a4 4 0 1 1-4-4',
  door: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14.5 12h.01',
  sos: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.5h.01',
  air: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  wallswitch: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 7h4v10h-4zM10 12h4',
  devil: 'M5.8 8.6C4.4 7.1 4 5 4.6 3c1.4.9 2.7 2.2 3.5 3.8M18.2 8.6C19.6 7.1 20 5 19.4 3c-1.4.9-2.7 2.2-3.5 3.8M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM8.6 12l2.2 1.2M15.4 12l-2.2 1.2M8.8 16.2c1.9 1.6 4.5 1.6 6.4 0',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16',
  rooms: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  devices: 'M3 5h12v9H3zM7 18h4M9 14v4M16.5 8.5h4.5v11h-4.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15zM10 21h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  thermostat: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9M12 7.5V5',
  evra: 'M6.5 12.3h11a5.5 5.5 0 1 0-1.6 3.9',
  auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18M12 7.5h6M12 12h8M12 16.5h6',
};

const FILLED = new Set(['play', 'pause', 'stop', 'rewind', 'forward']);

export function icon(name, size = 22) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', P[name] || P.sparkle);
  if (FILLED.has(name)) {
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  }
  svg.append(path);
  return svg;
}
