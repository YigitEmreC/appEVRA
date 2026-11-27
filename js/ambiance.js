// Ortam modu: every light in a room goes to the same colour at the same moment.
//
// One light.turn_on call carries all the room's lights, so Home Assistant changes them
// together. Lights without colour follow along as well as they can: white-tunable ones take
// a warm or cool white that fits the colour, plain on/off ones just turn on.
// "Renk döngüsü" slowly walks the colour wheel on all of them, in step. It runs on the Pi as a
// small automation (evra_ambiance_<room>), so it keeps going with the app closed; turning the
// lights off or choosing a fixed colour stops it.

import { HOME } from './config.js';
import { store } from './store.js';
import { h, toast, hexToHs } from './util.js';
import { icon } from './icons.js';
import { card } from './components.js';
import { roomEntities } from './rooms.js';

const COLOUR = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'];
const modes = (s) => s.attributes?.supported_color_modes || [];
const hasColour = (s) => modes(s).some((m) => COLOUR.includes(m));
const hasWhite = (s) => modes(s).includes('color_temp');
const loopId = (areaId) => `evra_ambiance_${String(areaId).replace(/[^a-z0-9_]/gi, '_')}`;

/** The room's lights that answer, sorted into colour, tunable white and plain. */
export function roomLights(areaId) {
  const lights = roomEntities(areaId).filter((s) => s.entity_id.startsWith('light.') && s.state !== 'unavailable');
  return {
    all: lights.map((s) => s.entity_id),
    colour: lights.filter(hasColour).map((s) => s.entity_id),
    white: lights.filter((s) => !hasColour(s) && hasWhite(s)).map((s) => s.entity_id),
    plain: lights.filter((s) => !hasColour(s) && !hasWhite(s)).map((s) => s.entity_id),
  };
}

// The white that fits a colour: reds, oranges and yellows warm, blues and greens cool.
const whiteFor = (hue) => (hue <= 70 || hue >= 300 ? 2700 : hue >= 150 && hue <= 260 ? 5000 : 4000);

/** Sets the whole room at once: { hs: [h, s] } or { kelvin }, at pct brightness. */
export async function setAmbiance(areaId, { hs = null, kelvin = null, pct = 70 }) {
  const L = roomLights(areaId);
  if (!L.all.length) throw new Error('Bu odada ulaşılabilen ışık yok');
  await stopLoop(areaId);
  const b = store.backend;
  const calls = [];
  if (hs) {
    if (L.colour.length) calls.push(b.callService('light', 'turn_on', { hs_color: hs, brightness_pct: pct }, { entity_id: L.colour }));
    if (L.white.length) calls.push(b.callService('light', 'turn_on', { color_temp_kelvin: whiteFor(hs[0]), brightness_pct: pct }, { entity_id: L.white }));
  } else {
    const tunable = [...L.colour, ...L.white];
    if (tunable.length) calls.push(b.callService('light', 'turn_on', { color_temp_kelvin: kelvin || 2700, brightness_pct: pct }, { entity_id: tunable }));
  }
  if (L.plain.length) calls.push(b.callService('light', 'turn_on', {}, { entity_id: L.plain }));
  // All at once: the lights change together, not one after another.
  await Promise.all(calls);
}

export async function lightsOff(areaId) {
  await stopLoop(areaId);
  const L = roomLights(areaId);
  if (L.all.length) await store.backend.callService('light', 'turn_off', {}, { entity_id: L.all });
}

// ---- the slow colour cycle, on the Pi ----

export function loopRunning(areaId) {
  const id = loopId(areaId);
  return [...store.states.values()].some((s) => s.entity_id.startsWith('automation.') && s.attributes?.id === id && s.state === 'on');
}

export async function startLoop(areaId, roomName, pct = 70) {
  const L = roomLights(areaId);
  if (!L.colour.length) throw new Error('Bu odada renkli ışık yok');
  // Every 15 seconds the hue moves 8° (a full turn in about 11 minutes); the 14 second
  // transition makes it one smooth, continuous change on every light together.
  await store.backend.saveAutomation(loopId(areaId), {
    alias: `Evra: ${roomName} renk döngüsü`,
    description: 'Evra uygulaması kurdu (oda sayfası → Ortam modu). Kapatınca silinir.',
    mode: 'single',
    triggers: [{ trigger: 'time_pattern', seconds: '/15' }],
    actions: [{
      action: 'light.turn_on',
      target: { entity_id: L.colour },
      data: { hs_color: ['{{ ((now().timestamp() | int) // 15 * 8) % 360 }}', 90], brightness_pct: pct, transition: 14 },
      continue_on_error: true,
    }],
  });
}

export async function stopLoop(areaId) {
  const b = store.backend;
  if (!b) return;
  try {
    // Also when it's there but switched off (not listed as running).
    if (loopRunning(areaId) || await b.fetchAutomationConfig(loopId(areaId))) await b.deleteAutomation(loopId(areaId));
  } catch { /* nothing there */ }
}

// ---- the card on the room page ----

export function ambianceCard(area, cleanup) {
  const L = roomLights(area.area_id);
  if (!L.all.length) return null;
  let pct = 70;
  let picked = null;
  const status = h('p', { class: 'muted small amb-status' });
  const swatches = h('div', { class: 'amb-swatches', role: 'group', 'aria-label': 'Renk' });

  const mark = (btn) => {
    for (const b of swatches.querySelectorAll('.amb-swatch')) b.classList.toggle('on', b === btn);
  };
  const apply = async (choice, btn) => {
    picked = choice;
    mark(btn);
    loopSwitch.checked = false;
    try {
      await setAmbiance(area.area_id, { ...choice, pct });
      status.textContent = `${L.all.length} ışık aynı renkte.`;
    } catch (e) { toast(`Olmadı: ${e.message}`, 'error'); }
  };

  for (const p of HOME.colorPresets) {
    const b = h('button', { class: 'amb-swatch', type: 'button', title: p.name, 'aria-label': p.name, style: `--sw:${p.css}` });
    const choice = p.data.hs_color ? { hs: p.data.hs_color } : { kelvin: p.data.color_temp_kelvin };
    b.addEventListener('click', () => apply(choice, b));
    swatches.append(b);
  }
  // Any colour, from the system colour picker.
  const custom = h('input', { type: 'color', class: 'amb-custom', value: '#7a5cff', 'aria-label': 'Başka bir renk', title: 'Başka bir renk' });
  custom.addEventListener('change', () => apply({ hs: hexToHs(custom.value) }, null));
  swatches.append(h('label', { class: 'amb-swatch amb-custom-wrap', title: 'Başka bir renk' }, icon('palette', 16), custom));

  const slider = h('input', { type: 'range', min: 5, max: 100, step: 5, value: pct, class: 'amb-range', 'aria-label': 'Parlaklık' });
  const pctLabel = h('span', { class: 'amb-pct' }, `%${pct}`);
  slider.addEventListener('input', () => { pctLabel.textContent = `%${slider.value}`; });
  slider.addEventListener('change', () => {
    pct = Number(slider.value);
    if (loopSwitch.checked) startLoop(area.area_id, area.name, pct).catch(() => {});
    else if (picked) setAmbiance(area.area_id, { ...picked, pct }).catch((e) => toast(`Olmadı: ${e.message}`, 'error'));
  });

  const loopSwitch = h('input', { type: 'checkbox', checked: loopRunning(area.area_id), disabled: !L.colour.length });
  loopSwitch.addEventListener('change', async () => {
    try {
      if (loopSwitch.checked) {
        mark(null);
        await startLoop(area.area_id, area.name, pct);
        status.textContent = 'Renk döngüsü açık: ışıklar birlikte, yavaşça renk değiştirir. Uygulama kapalıyken de sürer.';
      } else {
        await stopLoop(area.area_id);
        status.textContent = 'Renk döngüsü kapandı.';
      }
    } catch (e) {
      loopSwitch.checked = !loopSwitch.checked;
      toast(`Renk döngüsü: ${e.message}`, 'error');
    }
  });

  const off = h('button', { class: 'btn small ghost', type: 'button' }, icon('power', 14), 'Işıkları kapat');
  off.addEventListener('click', async () => {
    loopSwitch.checked = false;
    mark(null);
    try { await lightsOff(area.area_id); status.textContent = 'Odadaki ışıklar kapandı.'; } catch (e) { toast(`Olmadı: ${e.message}`, 'error'); }
  });

  const notes = [];
  if (L.white.length || L.plain.length) notes.push(`${L.white.length + L.plain.length} ışık renk desteklemiyor; renge en yakın beyazla ya da yalnızca açılarak eşlik eder.`);
  if (L.colour.length) status.textContent = loopRunning(area.area_id) ? 'Renk döngüsü açık.' : `${L.all.length} ışık birlikte değişir.`;

  return card({ title: 'Ortam modu', iconName: 'bulb', className: 'ambiance-card' },
    h('p', { class: 'muted small' }, 'Bir renge dokunun: odadaki bütün ışıklar aynı anda o renge geçer.'),
    swatches,
    h('label', { class: 'amb-row' }, h('span', null, 'Parlaklık'), slider, pctLabel),
    h('label', { class: 'amb-row check-field' }, loopSwitch, h('span', null, 'Renk döngüsü: renkler birlikte, yavaşça değişsin')),
    notes.length ? h('p', { class: 'muted small' }, notes.join(' ')) : null,
    h('div', { class: 'btn-row' }, off),
    status);
}
