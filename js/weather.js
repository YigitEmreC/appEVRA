// Weather for the place chosen in Settings → Konum ve hava durumu, from Open-Meteo
// (open-meteo.com: free, no key; only the searched name and the place's
// coordinates are sent). Home's outside reading uses it in both modes. In demo
// mode it also drives the pretend home's weather.home and sun.sun, so automations
// that check the weather or the dark behave as they would at that place.
// In live mode Home Assistant keeps its own weather; Settings can move the hub's
// home location to the same place (setHomeLocation on the live backend).

import { HOME } from './config.js';
import { store } from './store.js';
import { loadSettings, saveSettings } from './util.js';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'evra.weather';
const FRESH_FOR = 15 * 60 * 1000; // fetch again after a quarter of an hour

// WMO weather codes → [Home Assistant condition, Turkish name, icon].
const CODES = {
  0: ['sunny', 'Açık', 'sun'], 1: ['sunny', 'Çoğunlukla açık', 'sun'], 2: ['partlycloudy', 'Parçalı bulutlu', 'partly'], 3: ['cloudy', 'Kapalı', 'cloud'],
  45: ['fog', 'Sisli', 'fog'], 48: ['fog', 'Kırağılı sis', 'fog'],
  51: ['rainy', 'Hafif çisenti', 'rain'], 53: ['rainy', 'Çisenti', 'rain'], 55: ['rainy', 'Yoğun çisenti', 'rain'],
  56: ['snowy-rainy', 'Donan çisenti', 'rain'], 57: ['snowy-rainy', 'Donan çisenti', 'rain'],
  61: ['rainy', 'Hafif yağmur', 'rain'], 63: ['rainy', 'Yağmurlu', 'rain'], 65: ['pouring', 'Şiddetli yağmur', 'rain'],
  66: ['snowy-rainy', 'Donan yağmur', 'rain'], 67: ['snowy-rainy', 'Donan yağmur', 'rain'],
  71: ['snowy', 'Hafif kar', 'snow'], 73: ['snowy', 'Karlı', 'snow'], 75: ['snowy', 'Yoğun kar', 'snow'], 77: ['snowy', 'Kar taneleri', 'snow'],
  80: ['rainy', 'Hafif sağanak', 'rain'], 81: ['rainy', 'Sağanak', 'rain'], 82: ['pouring', 'Şiddetli sağanak', 'rain'],
  85: ['snowy', 'Kar sağanağı', 'snow'], 86: ['snowy', 'Yoğun kar sağanağı', 'snow'],
  95: ['lightning-rainy', 'Gök gürültülü sağanak', 'storm'], 96: ['lightning-rainy', 'Dolulu fırtına', 'storm'], 99: ['hail', 'Şiddetli dolulu fırtına', 'storm'],
};

// Home Assistant's own weather conditions (live mode without a chosen place).
export const CONDITION = {
  sunny: ['Güneşli', 'sun'], 'clear-night': ['Açık', 'moon'], partlycloudy: ['Parçalı bulutlu', 'partly'], cloudy: ['Bulutlu', 'cloud'],
  fog: ['Sisli', 'fog'], rainy: ['Yağmurlu', 'rain'], pouring: ['Sağanak', 'rain'], snowy: ['Karlı', 'snow'], 'snowy-rainy': ['Karla karışık yağmur', 'snow'],
  lightning: ['Şimşekli', 'storm'], 'lightning-rainy': ['Gök gürültülü sağanak', 'storm'], hail: ['Dolu', 'storm'],
  windy: ['Rüzgârlı', 'fog'], 'windy-variant': ['Rüzgârlı ve bulutlu', 'cloud'], exceptional: ['Olağanüstü hava', 'storm'],
};

const locKey = (loc) => (loc ? `${Number(loc.latitude).toFixed(3)},${Number(loc.longitude).toFixed(3)}` : '');

/** "Kadıköy, Silivri, İstanbul, Türkiye": the place, its district and province, and country. */
export function placeLabel(p) {
  if (!p) return '';
  return [...new Set([p.name, p.admin2, p.admin1].filter(Boolean)), p.country].filter(Boolean).join(', ');
}

/** Places matching a name, for the Settings search; bigger places first (many villages share a name). */
export async function searchPlaces(query) {
  const url = new URL(GEO);
  url.search = new URLSearchParams({ name: query, count: '8', language: 'tr', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`arama yapılamadı (${res.status})`);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    name: r.name, admin2: r.admin2 || '', admin1: r.admin1 || '', country: r.country || '',
    latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || '', population: r.population || 0,
  })).sort((a, b) => b.population - a.population);
}

async function fetchWeather(loc) {
  const url = new URL(FORECAST);
  url.search = new URLSearchParams({
    latitude: String(loc.latitude), longitude: String(loc.longitude), timezone: 'auto', forecast_days: '3', wind_speed_unit: 'kmh',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`hava durumu alınamadı (${res.status})`);
  const j = await res.json();
  // Times come in the place's own time without an offset; turn them into real moments.
  const offset = (j.utc_offset_seconds || 0) * 1000;
  const moment = (s) => (s ? new Date(Date.parse(`${s}Z`) - offset).toISOString() : null);
  const c = j.current || {};
  const [cond, text, ic] = CODES[c.weather_code] || ['exceptional', 'Bilinmiyor', 'cloud'];
  const night = c.is_day === 0;
  const d = j.daily || {};
  return {
    at: Date.now(), key: locKey(loc), place: placeLabel(loc),
    condition: night && cond === 'sunny' ? 'clear-night' : cond,
    text, icon: night && ic === 'sun' ? 'moon' : ic,
    temperature: c.temperature_2m, apparent: c.apparent_temperature, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m,
    days: (d.time || []).map((date, i) => {
      const [, dayText, dayIcon] = CODES[d.weather_code?.[i]] || [null, 'Bilinmiyor', 'cloud'];
      return {
        date, text: dayText, icon: dayIcon, max: d.temperature_2m_max?.[i], min: d.temperature_2m_min?.[i],
        rain: d.precipitation_probability_max?.[i], sunrise: moment(d.sunrise?.[i]), sunset: moment(d.sunset?.[i]),
      };
    }),
  };
}

// ---- the current reading ------------------------------------------------------------

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
let reading = readCache();
let lastError = null;
let inflight = null;
const subs = new Set();

export const weatherLocation = () => loadSettings().weatherLocation || null;
/** The latest weather for the chosen place, or null (no place chosen, or not fetched yet). */
export function currentWeather() {
  const loc = weatherLocation();
  return loc && reading && reading.key === locKey(loc) ? reading : null;
}
export const weatherError = () => lastError;
export function onWeather(fn) { subs.add(fn); return () => subs.delete(fn); }
function publish() { for (const fn of subs) { try { fn(currentWeather()); } catch { /* a closed screen */ } } }

export function refreshWeather() {
  const loc = weatherLocation();
  if (!loc) { publish(); return Promise.resolve(null); }
  if (inflight) return inflight;
  inflight = fetchWeather(loc)
    .then((r) => {
      reading = r;
      lastError = null;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(r)); } catch { /* not kept */ }
    })
    .catch((e) => { lastError = e.name === 'TimeoutError' ? 'hava durumu servisi yanıt vermedi' : e.message; })
    .then(() => { inflight = null; publish(); applyToDemo(); return currentWeather(); });
  return inflight;
}

export function setWeatherLocation(loc) {
  saveSettings({ weatherLocation: loc ? {
    name: loc.name, admin2: loc.admin2 || '', admin1: loc.admin1 || '', country: loc.country || '',
    latitude: Number(loc.latitude), longitude: Number(loc.longitude), timezone: loc.timezone || '',
  } : null });
  if (!loc) { try { localStorage.removeItem(CACHE_KEY); } catch { /* nothing kept */ } reading = null; lastError = null; }
  return refreshWeather();
}

// The demo home follows the chosen place: weather.home and the sun.
function applyToDemo() {
  const r = currentWeather();
  if (r && store.backend?.mode === 'demo') store.backend.applyWeather?.(r);
}

let started = false;
/** Keeps the reading fresh while the app is open. Safe to call more than once. */
export function startWeather() {
  if (started) return;
  started = true;
  const tick = () => {
    if (!weatherLocation()) return;
    const r = currentWeather();
    if (!r || Date.now() - r.at > FRESH_FOR) refreshWeather();
    else applyToDemo(); // the sun may have risen or set since the last minute
  };
  tick();
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  store.onStatus((s) => { if (s.state === 'connected') applyToDemo(); });
}

/** What Home shows outside: the chosen place's reading, else Home Assistant's weather entity. */
export function outsideNow() {
  const r = currentWeather();
  if (r) return { temperature: r.temperature, text: r.text, icon: r.icon, apparent: r.apparent, place: r.place };
  const w = store.get(HOME.weather);
  if (!w || w.attributes?.temperature == null) return null;
  const [text, ic] = CONDITION[w.state] || ['', 'cloud'];
  return { temperature: w.attributes.temperature, text, icon: ic, apparent: w.attributes.apparent_temperature, place: '' };
}
