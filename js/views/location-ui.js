// Settings → Konum ve hava durumu: pick the home's place (search by name, or this
// device's location), see its weather, and in live mode move the hub's home location too.

import { store } from '../store.js';
import { h, toast, dec } from '../util.js';
import { icon } from '../icons.js';
import { card } from '../components.js';
import {
  searchPlaces, placeLabel, weatherLocation, setWeatherLocation, currentWeather, weatherError,
  refreshWeather, onWeather,
} from '../weather.js';

const dayName = (iso, i) => (i === 0 ? 'Bugün' : i === 1 ? 'Yarın'
  : new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'long' }));
// Sunrise and sunset in the place's own time, whatever this device's time zone.
function timeText(iso, timeZone) {
  if (!iso) return '–';
  const opts = { hour: '2-digit', minute: '2-digit' };
  try { return new Date(iso).toLocaleTimeString('tr-TR', timeZone ? { ...opts, timeZone } : opts); } catch { return new Date(iso).toLocaleTimeString('tr-TR', opts); }
}
const deg = (v) => (v == null ? '–' : `${Math.round(v)}°`);

export function locationCard(cleanup) {
  const placeLine = h('p', { class: 'place-line' });
  const now = h('div', { class: 'weather-now', 'aria-live': 'polite' });
  const results = h('div', { class: 'place-results', role: 'list' });

  // ---- searching for a place ----
  const input = h('input', { class: 'input', id: 'place-search', type: 'search', placeholder: 'Şehir, ilçe ya da köy ara', autocomplete: 'off', enterkeyhint: 'search' });
  const searchBtn = h('button', { class: 'btn small', type: 'submit' }, icon('search', 14), 'Ara');
  const form = h('form', { class: 'place-search' },
    h('label', { for: 'place-search', class: 'sr-only' }, 'Konum ara'), input, searchBtn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) { toast('En az iki harf yazın', 'error'); return; }
    searchBtn.disabled = true;
    results.replaceChildren(h('p', { class: 'muted small' }, 'Aranıyor…'));
    try {
      const found = await searchPlaces(q);
      results.replaceChildren(...(found.length
        ? found.map((p) => h('button', { class: 'place-result', type: 'button', role: 'listitem', onclick: () => choose(p) },
          icon('pin', 16), h('span', null, h('strong', null, p.name), h('small', { class: 'muted' }, [...new Set([p.admin2, p.admin1].filter((x) => x && x !== p.name)), p.country].filter(Boolean).join(', ')))))
        : [h('p', { class: 'muted small' }, `"${q}" için bir yer bulunamadı. Başka bir yazım deneyin.`)]));
    } catch (err) {
      results.replaceChildren(h('p', { class: 'error-line' }, `Arama yapılamadı: ${err.message}. İnternet bağlantınızı kontrol edin.`));
    } finally {
      searchBtn.disabled = false;
    }
  });

  async function choose(p) {
    results.replaceChildren();
    input.value = '';
    now.replaceChildren(h('p', { class: 'muted small' }, 'Hava durumu alınıyor…'));
    await setWeatherLocation(p);
    draw();
    if (currentWeather()) toast(`Konum: ${placeLabel(p)}`);
  }

  // ---- this device's location (needs a secure page: localhost or https) ----
  const canLocate = !!navigator.geolocation && window.isSecureContext;
  const hereBtn = h('button', { class: 'btn small ghost', type: 'button', disabled: !canLocate,
    title: canLocate ? 'Bu cihazın konumunu kullan' : 'Bu bağlantıda tarayıcı konum vermiyor; şehri arayın.' }, icon('pin', 14), 'Bulunduğum yeri kullan');
  hereBtn.addEventListener('click', () => {
    hereBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hereBtn.disabled = false;
        choose({ name: 'Bulunduğum konum', latitude: Math.round(pos.coords.latitude * 1000) / 1000, longitude: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      (err) => {
        hereBtn.disabled = false;
        toast(err.code === 1 ? 'Konum izni verilmedi; şehri arayarak seçebilirsiniz.' : 'Konum bulunamadı; şehri arayarak seçin.', 'error');
      },
      { timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  });
  const refreshBtn = h('button', { class: 'btn small ghost', type: 'button' }, icon('refresh', 14), 'Yenile');
  refreshBtn.addEventListener('click', async () => { refreshBtn.disabled = true; await refreshWeather(); refreshBtn.disabled = false; draw(); });
  const clearBtn = h('button', { class: 'btn small ghost', type: 'button' }, 'Konumu kaldır');
  clearBtn.addEventListener('click', async () => { await setWeatherLocation(null); draw(); toast('Konum kaldırıldı'); });

  // ---- live mode: the hub's own home location ----
  const hubBtn = h('button', { class: 'btn small', type: 'button' }, icon('home', 14), 'Merkezin konumunu da güncelle');
  const hubRow = h('div', { class: 'stack hub-location' },
    h('p', { class: 'muted small' }, 'Merkez (Home Assistant) kendi hava durumunu ve gün doğumu/batımı zamanlarını kendi konumuna göre hesaplar. Otomasyonların da aynı yere göre çalışması için merkezin konumunu buraya taşıyın.'),
    h('div', { class: 'btn-row' }, hubBtn));
  hubBtn.addEventListener('click', async () => {
    const loc = weatherLocation();
    if (!loc) return;
    if (!confirm(`Merkezin konumu "${placeLabel(loc)}" olarak değiştirilsin mi? Merkezin hava durumu ve gün doğumu/batımı otomasyonları bu konuma göre çalışır.`)) return;
    hubBtn.disabled = true;
    try {
      await store.backend.setHomeLocation(loc.latitude, loc.longitude);
      toast('Merkezin konumu güncellendi');
    } catch (err) {
      toast(`Merkezin konumu değiştirilemedi: ${err.message}. Bunun için yönetici girişi gerekir.`, 'error');
    } finally {
      hubBtn.disabled = false;
    }
  });

  function draw() {
    const loc = weatherLocation();
    const r = currentWeather();
    const live = store.backend?.mode === 'live';
    placeLine.replaceChildren(icon('pin', 16), loc
      ? h('span', null, h('strong', null, placeLabel(loc)), h('small', { class: 'muted dev-only' }, ` · ${dec(loc.latitude, 3)}; ${dec(loc.longitude, 3)}`))
      : h('span', { class: 'muted' }, live ? 'Konum seçilmedi. Ana sayfadaki hava durumu merkezin kendi ayarından gelir.' : 'Konum seçilmedi. Hava durumunun doğru olması için evinizin bulunduğu yeri seçin.'));
    refreshBtn.hidden = !loc;
    clearBtn.hidden = !loc;
    hubRow.hidden = !(loc && live);
    if (!loc) { now.replaceChildren(); return; }
    if (!r) {
      const err = weatherError();
      now.replaceChildren(err ? h('p', { class: 'error-line' }, `Hava durumu alınamadı: ${err}.`) : h('p', { class: 'muted small' }, 'Hava durumu alınıyor…'));
      return;
    }
    now.replaceChildren(
      h('div', { class: 'weather-main' },
        h('span', { class: 'weather-icon' }, icon(r.icon, 34)),
        h('div', null,
          h('div', { class: 'weather-temp' }, deg(r.temperature), h('span', { class: 'weather-text' }, r.text)),
          h('p', { class: 'muted small' }, `Hissedilen ${deg(r.apparent)} · nem %${Math.round(r.humidity ?? 0)} · rüzgâr ${Math.round(r.wind ?? 0)} km/sa`))),
      h('div', { class: 'weather-days' }, r.days.map((d, i) => h('div', { class: 'weather-day' },
        h('span', { class: 'weather-day-name' }, dayName(d.date, i)),
        icon(d.icon, 20),
        h('span', null, h('strong', null, deg(d.max)), h('span', { class: 'muted' }, ` / ${deg(d.min)}`)),
        d.rain != null ? h('small', { class: 'muted' }, `yağış %${d.rain}`) : null))),
      r.days[0] ? h('p', { class: 'muted small' }, `Gün doğumu ${timeText(r.days[0].sunrise, loc.timezone)} · gün batımı ${timeText(r.days[0].sunset, loc.timezone)} · ${new Date(r.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla`) : null,
    );
  }

  cleanup.push(onWeather(draw));
  cleanup.push(store.onStatus(draw));
  draw();
  if (weatherLocation() && !currentWeather()) refreshWeather();

  return card({ title: 'Konum ve hava durumu', iconName: 'pin', className: 'location-card' },
    placeLine, now, form, results,
    h('div', { class: 'btn-row' }, hereBtn, refreshBtn, clearBtn),
    hubRow,
    h('p', { class: 'muted small' }, store.backend?.mode === 'live'
      ? 'Hava durumu Open-Meteo\'dan (open-meteo.com) alınır; yalnızca aradığınız yer adı ve seçtiğiniz yerin koordinatları gönderilir. Konum bu cihazda saklanır.'
      : 'Hava durumu Open-Meteo\'dan (open-meteo.com) alınır; yalnızca aradığınız yer adı ve seçtiğiniz yerin koordinatları gönderilir. Örnek evde hava durumu ile gün doğumu/batımı da bu yere göre değişir, otomasyonlar buna göre çalışır.'));
}
