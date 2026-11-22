import { store, sortedAreas, areaName } from '../store.js';
import { h, toast, relTime, loadSettings } from '../util.js';
import { icon } from '../icons.js';
import { SCENES, sceneRooms, setSceneRooms, planScene, runScene } from '../scenes.js';

export function renderScenes(root, cleanup) {
  const grid = h('div', { class: 'scene-grid' });
  const draw = () => grid.replaceChildren(...SCENES.map((s) => sceneCard(s)));

  // Re-draw when devices or rooms change, since that changes what each scene does.
  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.area_id}`).join('|') + '#' + [...store.areas.values()].map((a) => a.area_id + a.name).join('|');
    if (next !== sig) { sig = next; draw(); }
  }));
  const tick = setInterval(() => grid.querySelectorAll('.scene-last').forEach((el) => { el.textContent = lastText(el.dataset.at); }), 30000);
  cleanup.push(() => clearInterval(tick));

  root.append(
    h('p', { class: 'muted intro' }, 'One tap sets the mood. Choose which rooms each scene applies to; only the devices in those rooms change.'),
    grid);
  draw();
}

const lastText = (at) => `Last used ${relTime(new Date(Number(at)).toISOString())}`;

// The rooms a scene uses, ignoring rooms that have since been deleted.
function currentRooms(sceneId) {
  const rooms = sceneRooms(sceneId);
  if (rooms === 'all') return 'all';
  const kept = rooms.filter((id) => store.areas.has(id));
  return kept.length ? kept : 'all';
}

function sceneCard(scene) {
  const rooms = currentRooms(scene.id);
  const areas = sortedAreas();
  const redraw = () => el.replaceWith(sceneCard(scene));
  const choose = (next) => { setSceneRooms(scene.id, next); redraw(); };

  // "All rooms" (which also covers devices not in a room), or any mix of
  // rooms. Turning the last room off goes back to all.
  const chip = (label, on, onclick) => h('button', { class: `room-chip small${on ? ' active' : ''}`, type: 'button', 'aria-pressed': String(on), onclick }, label);
  const chips = h('div', { class: 'scene-rooms', role: 'group', 'aria-label': `Rooms for ${scene.name}` },
    chip('All rooms', rooms === 'all', () => choose('all')),
    areas.map((a) => {
      const on = rooms !== 'all' && rooms.includes(a.area_id);
      return chip(a.name, on, () => {
        let next = rooms === 'all' ? [a.area_id] : on ? rooms.filter((x) => x !== a.area_id) : [...rooms, a.area_id];
        if (!next.length) next = 'all';
        choose(next);
      });
    }));

  const steps = planScene(scene, rooms);
  const where = rooms === 'all' ? 'the home' : rooms.map(areaName).join(', ');
  const start = h('button', { class: 'btn primary scene-start', type: 'button', disabled: !steps.length }, icon('play', 14), 'Start');
  start.addEventListener('click', async () => {
    start.disabled = true;
    el.classList.add('busy');
    try {
      const r = await runScene(scene, rooms);
      toast(r.failed ? `${scene.name}: ${r.failed} of ${r.steps} changes didn't work` : `${scene.name} started${rooms === 'all' ? '' : ` in ${where}`}`, r.failed ? 'error' : 'info');
    } finally {
      el.classList.remove('busy');
      redraw();
    }
  });

  const last = loadSettings().lastScene;
  const el = h('article', { class: 'scene', style: { '--tone': scene.tone } },
    h('div', { class: 'scene-top' },
      h('span', { class: 'scene-icon' }, icon(scene.icon, 24)),
      h('div', { class: 'scene-titles' },
        h('h3', null, scene.name),
        last?.id === scene.id ? h('span', { class: 'scene-last', 'data-at': last.at }, lastText(last.at)) : null),
      start),
    h('p', { class: 'scene-text' }, scene.text),
    areas.length ? chips : null,
    steps.length
      ? h('details', { class: 'scene-steps' },
        h('summary', null, `What it does in ${where}`, h('span', { class: 'muted' }, ` · ${steps.length} change${steps.length === 1 ? '' : 's'}`)),
        h('ul', null, steps.map((s) => h('li', null, icon(s.icon, 16), h('span', null, s.device), h('strong', null, s.text)))))
      : h('p', { class: 'muted small scene-empty' }, `Nothing in ${where} for this scene to change.`));
  return el;
}
