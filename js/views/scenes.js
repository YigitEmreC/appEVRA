import { store, sortedAreas, areaName } from '../store.js';
import { h, toast, relTime, loadSettings } from '../util.js';
import { icon } from '../icons.js';
import { SCENES, sceneRooms, setSceneRooms, planScene, runScene, loadScenes, resetScenes, scenesCustomised } from '../scenes.js';
import { onData } from '../appdata.js';
import { renderSceneEditor } from './scene-editor.js';
import { getCustom, ordered, isHidden, isEditing } from '../custom.js';
import { arrangeable } from '../edit.js';

export function renderScenes(root, cleanup, ctx = {}) {
  const [first, second] = ctx.params || [];
  if (first === 'new') return renderSceneEditor(root, cleanup, null);
  if (first === 'edit' && second) return renderSceneEditor(root, cleanup, decodeURIComponent(second));
  const grid = h('div', { class: 'scene-grid' });
  const footer = h('div', { class: 'scene-footer' });
  // Scenes in the person's order; in edit mode they can be dragged and hidden.
  const draw = () => {
    const cfg = getCustom().scenes;
    const list = ordered(SCENES, cfg);
    grid.replaceChildren(...list.filter((s) => isEditing() || !isHidden(cfg, s.id)).map((s) => sceneCard(s)),
      isEditing() ? null : h('a', { class: 'scene scene-add', href: '#/scenes/new' }, icon('plus', 28), h('strong', null, 'Yeni sahne'), h('span', { class: 'muted small' }, 'Işıkları, perdeleri ve cihazları tek dokunuşla ayarlayın')));
    arrangeable(grid, 'scenes', { all: list.map((s) => s.id), big: true });
    // Back to the built-in scenes, once the person has changed any.
    footer.replaceChildren(...(scenesCustomised() ? [h('button', {
      class: 'btn small ghost', type: 'button',
      onclick: async () => {
        if (!confirm('Hazır sahnelere dönülsün mü? Kendi eklediğiniz sahneler ve hazır sahnelerde yaptığınız değişiklikler silinir.')) return;
        try { await resetScenes(); toast('Hazır sahnelere dönüldü'); } catch (e) { toast(`Olmadı: ${e.message}`, 'error'); }
      },
    }, icon('refresh', 14), 'Hazır sahnelere dön')] : []));
  };
  cleanup.push(onData('scenes', () => draw()));
  loadScenes().then(() => draw());

  // Re-draw when devices or rooms change, since that changes what each scene does.
  let sig = '';
  cleanup.push(store.onRegistry(() => {
    const next = [...store.devices.values()].map((d) => `${d.id}:${d.area_id}`).join('|') + '#' + [...store.areas.values()].map((a) => a.area_id + a.name).join('|');
    if (next !== sig) { sig = next; draw(); }
  }));
  const tick = setInterval(() => grid.querySelectorAll('.scene-last').forEach((el) => { el.textContent = lastText(el.dataset.at); }), 30000);
  cleanup.push(() => clearInterval(tick));

  root.append(
    h('div', { class: 'toolbar' },
      h('p', { class: 'muted intro' }, 'Tek dokunuşla ortamı ayarlayın. Her sahnenin hangi odalarda çalışacağını seçin; yalnızca o odalardaki cihazlar değişir.'),
      h('a', { class: 'btn primary', href: '#/scenes/new' }, icon('plus', 16), 'Yeni sahne')),
    grid, footer);
  draw();
}

const lastText = (at) => `Son kullanım ${relTime(new Date(Number(at)).toISOString())}`;

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
  const chips = h('div', { class: 'scene-rooms', role: 'group', 'aria-label': `${scene.name} için odalar` },
    chip('Tüm odalar', rooms === 'all', () => choose('all')),
    areas.map((a) => {
      const on = rooms !== 'all' && rooms.includes(a.area_id);
      return chip(a.name, on, () => {
        let next = rooms === 'all' ? [a.area_id] : on ? rooms.filter((x) => x !== a.area_id) : [...rooms, a.area_id];
        if (!next.length) next = 'all';
        choose(next);
      });
    }));

  const steps = planScene(scene, rooms);
  const where = rooms === 'all' ? 'bütün ev' : rooms.map(areaName).join(', ');
  const start = h('button', { class: 'btn primary scene-start', type: 'button', disabled: !steps.length }, icon('play', 14), 'Başlat');
  start.addEventListener('click', async () => {
    start.disabled = true;
    el.classList.add('busy');
    try {
      const r = await runScene(scene, rooms);
      toast(r.failed ? `${scene.name}: ${r.steps} değişiklikten ${r.failed} tanesi olmadı` : `${scene.name} başladı${rooms === 'all' ? '' : ` (${where})`}`, r.failed ? 'error' : 'info');
    } finally {
      el.classList.remove('busy');
      redraw();
    }
  });

  const last = loadSettings().lastScene;
  const el = h('article', { class: 'scene', style: { '--tone': scene.tone }, 'data-id': scene.id, 'data-name': scene.name },
    h('div', { class: 'scene-top' },
      h('span', { class: 'scene-icon' }, icon(scene.icon, 24)),
      h('div', { class: 'scene-titles' },
        h('h3', null, scene.name),
        last?.id === scene.id ? h('span', { class: 'scene-last', 'data-at': last.at }, lastText(last.at)) : null),
      h('a', { class: 'icon-btn scene-edit', href: `#/scenes/edit/${encodeURIComponent(scene.id)}`, 'aria-label': `${scene.name} sahnesini düzenle`, title: 'Düzenle' }, icon('edit', 16)),
      start),
    h('p', { class: 'scene-text' }, scene.text),
    areas.length ? chips : null,
    steps.length
      ? h('details', { class: 'scene-steps' },
        h('summary', null, `Ne yapar (${where})`, h('span', { class: 'muted' }, ` · ${steps.length} değişiklik`)),
        h('ul', null, steps.map((s) => h('li', null, icon(s.icon, 16), h('span', null, s.device), h('strong', null, s.text)))))
      : h('p', { class: 'muted small scene-empty' }, `Bu sahnenin ${where} içinde değiştireceği bir şey yok.`));
  return el;
}
