// Infrared: IR modules, the open IR code database (IRDB) and sending codes.
//
// Every remote belongs to one IR module (a device of the catalogue's "ir" kind), so its
// codes leave from the module in the right room. A module can send any code when its
// firmware has Evra's action `send_raw` (Home Assistant shows it as
// esphome.<module>_send_raw, taking `code`: a list of pulse lengths in µs, marks
// positive and spaces negative, sent at 38 kHz). The codes come from IRDB
// (github.com/probonopd/irdb): a CSV per remote with functionname, protocol, device,
// subdevice, function; encode() turns those into pulses.

import { store, userDevices, deviceName, areaName } from './store.js';
import { productForDevice } from './catalog.js';

// ---- encoding codes into pulses -----------------------------------------------------

const bitsLsb = (value, n) => Array.from({ length: n }, (_, i) => (value >> i) & 1);
const bitsMsb = (value, n) => Array.from({ length: n }, (_, i) => (value >> (n - 1 - i)) & 1);

// Levels (1 = carrier on) in units → pulse list without leading or trailing silence.
function fromLevels(levels, unit) {
  const out = [];
  let i = levels.indexOf(1);
  while (i >= 0 && i < levels.length) {
    const level = levels[i];
    let n = 0;
    while (i < levels.length && levels[i] === level) { n++; i++; }
    out.push(level ? n * unit : -n * unit);
  }
  if (out.length && out[out.length - 1] < 0) out.pop();
  return out;
}

function pulseDistance(header, bits, one, zero, stop) {
  const out = [...header];
  for (const b of bits) out.push(...(b ? one : zero));
  if (stop) out.push(stop);
  return out;
}

const PROTOCOLS = {
  // NEC: 9 ms leader; NECx (Samsung and others): 4.5 ms. Subdevice -1 means "the complement" (NEC) or "the same" (NECx).
  NEC: (c) => nec(c, [9000, -4500], 255 - c.device),
  NEC1: (c) => nec(c, [9000, -4500], 255 - c.device),
  NEC2: (c) => nec(c, [9000, -4500], 255 - c.device),
  NECX1: (c) => nec(c, [4500, -4500], c.device),
  NECX2: (c) => nec(c, [4500, -4500], c.device),
  SONY12: (c) => sony(c, 12),
  SONY15: (c) => sony(c, 15),
  SONY20: (c) => sony(c, 20),
  RC5: (c) => rc5(c),
  RC6: (c) => rc6(c),
  JVC: (c) => pulseDistance([8400, -4200], [...bitsLsb(c.device, 8), ...bitsLsb(c.function, 8)], [526, -1574], [526, -524], 526),
  PANASONIC: (c) => {
    const sub = c.subdevice < 0 ? 0 : c.subdevice;
    const bytes = [0x02, 0x20, c.device & 0xff, sub & 0xff, c.function & 0xff, (c.device ^ sub ^ c.function) & 0xff];
    return pulseDistance([3456, -1728], bytes.flatMap((b) => bitsLsb(b, 8)), [432, -1296], [432, -432], 432);
  },
};

function nec(c, leader, defaultSub) {
  const sub = c.subdevice < 0 ? defaultSub : c.subdevice;
  const bits = [...bitsLsb(c.device, 8), ...bitsLsb(sub & 0xff, 8), ...bitsLsb(c.function, 8), ...bitsLsb(~c.function & 0xff, 8)];
  return pulseDistance(leader, bits, [560, -1690], [560, -560], 560);
}

// Sony sends each frame three times, 45 ms apart.
function sony(c, n) {
  const bits = [...bitsLsb(c.function, 7), ...bitsLsb(c.device, n === 15 ? 8 : 5), ...(n === 20 ? bitsLsb(Math.max(0, c.subdevice), 8) : [])];
  const frame = pulseDistance([2400, -600], bits, [1200, -600], [600, -600]);
  const length = frame.reduce((a, x) => a + Math.abs(x), 0);
  const gap = [...frame.slice(0, -1), -(600 + Math.max(0, 45000 - length))];
  return [...gap, ...gap, ...frame.slice(0, -1)];
}

// Philips RC5: Manchester code, 889 µs halves; a 1 is space-then-mark.
function rc5(c) {
  const bits = [1, c.function < 64 ? 1 : 0, 0, ...bitsMsb(c.device, 5), ...bitsMsb(c.function & 63, 6)];
  return fromLevels(bits.flatMap((b) => (b ? [0, 1] : [1, 0])), 889);
}

// Philips RC6 mode 0: leader, start bit, mode 000, a double-width toggle bit, 8 + 8 bits; a 1 is mark-then-space.
function rc6(c) {
  const levels = [1, 1, 1, 1, 1, 1, 0, 0];
  const bit = (b, w = 1) => levels.push(...Array(w).fill(b ? 1 : 0), ...Array(w).fill(b ? 0 : 1));
  [1, 0, 0, 0].forEach((b) => bit(b));
  bit(0, 2);
  [...bitsMsb(c.device, 8), ...bitsMsb(c.function, 8)].forEach((b) => bit(b));
  return fromLevels(levels, 444);
}

const protoKey = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const canEncode = (protocol) => !!PROTOCOLS[protoKey(protocol)];

/** A code { protocol, device, subdevice, function } as pulses for the IR module. */
export function encode(code) {
  const f = PROTOCOLS[protoKey(code.protocol)];
  if (!f) throw new Error(`${code.protocol} biçimi desteklenmiyor`);
  return f({ device: Number(code.device), subdevice: Number(code.subdevice), function: Number(code.function) });
}

// ---- IR modules ------------------------------------------------------------------------

// Like Home Assistant's slugify (ESPHome action names come from the device's node name).
const slugify = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

let services = null;
let servicesAt = 0;
async function sendActions() {
  if (!services || Date.now() - servicesAt > 60000) {
    try { services = (await store.backend?.listServices?.()) || {}; servicesAt = Date.now(); } catch { services ||= {}; }
  }
  return Object.keys(services.esphome || {}).filter((s) => s.endsWith('_send_raw'));
}
export function forgetServices() { services = null; }

/** The home's IR modules: [{ id, name, room, service }] (service null: its firmware can't send any code yet). */
export async function irModules() {
  const actions = await sendActions();
  const devs = userDevices().filter((d) => productForDevice(d)?.kind === 'ir');
  return devs.map((d) => {
    const names = [d.name, d.name_by_user].filter(Boolean).map(slugify);
    let service = actions.find((a) => names.some((n) => a === `${n}_send_raw`)) || null;
    if (!service && devs.length === 1 && actions.length === 1) service = actions[0];
    return { id: d.id, name: deviceName(d), room: areaName(d.area_id), service };
  });
}

/** Sends one code through a module (throws, with a toast already shown, when it fails). */
export async function sendCode(module, code) {
  if (!module?.service) throw new Error('Bu IR modülü her kodu gönderemiyor; yazılımı güncellenmeli');
  return store.call('esphome', module.service, null, { code: encode(code) });
}

// ---- the IR code database (IRDB) ------------------------------------------------------

const IRDB = 'https://raw.githubusercontent.com/probonopd/irdb/master/codes/';

// Kinds of remote, with IRDB's folder names for each.
export const REMOTE_TYPES = [
  { id: 'tv', name: 'TV', icon: 'tv', folders: /^(tv|tvs|unknown_tv|lcd|lcd tv|led tv|plasma|plasma displays|hdtv all|monitor|rear projection dlp tv)$/i },
  { id: 'ac', name: 'Klima', icon: 'air', folders: /air ?condition|airconditioner/i },
  { id: 'fan', name: 'Vantilatör', icon: 'fan', folders: /^fan$/i },
  { id: 'audio', name: 'Ses sistemi', icon: 'music', folders: /receiver|sound ?bar|amplifier|speaker|surround|theater|mini system|digital audio/i },
  { id: 'projector', name: 'Projektör', icon: 'film', folders: /projector/i },
  { id: 'media', name: 'Medya kutusu', icon: 'play', folders: /dvd|cable box|satellite|apple tv|dvr|media|blu-?ray|tv ?box/i },
  { id: 'light', name: 'Işık', icon: 'bulb', folders: /light/i },
  { id: 'other', name: 'Diğer', icon: 'remote', folders: /./ },
];
export const remoteType = (id) => REMOTE_TYPES.find((t) => t.id === id) || REMOTE_TYPES[REMOTE_TYPES.length - 1];

let indexPromise = null;
/** Every remote in IRDB: [{ brand, folder, file, path }]. */
export function irdbIndex() {
  indexPromise ||= fetch(IRDB + 'index').then((r) => {
    if (!r.ok) throw new Error(`kod veritabanına ulaşılamadı (${r.status})`);
    return r.text();
  }).then((text) => text.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.csv')).map((path) => {
    const [brand, folder, file] = path.split('/');
    return { brand, folder, file, path };
  })).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

function csvRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const fileCache = new Map();
/** One remote's codes: [{ name, protocol, device, subdevice, function }]. */
export async function irdbCodes(path) {
  if (!fileCache.has(path)) {
    fileCache.set(path, fetch(IRDB + path.split('/').map(encodeURIComponent).join('/')).then((r) => {
      if (!r.ok) throw new Error(`kodlar alınamadı (${r.status})`);
      return r.text();
    }).then((text) => csvRows(text).slice(1).filter((c) => c.length >= 5).map(([name, protocol, device, subdevice, fn]) => ({
      name: name.trim(), protocol: protocol.trim(), device: Number(device), subdevice: Number(subdevice), function: Number(fn),
    })).filter((c) => c.name && Number.isFinite(c.device) && Number.isFinite(c.function))).catch((e) => { fileCache.delete(path); throw e; }));
  }
  return fileCache.get(path);
}

// ---- from IRDB's names to buttons ----------------------------------------------------------

// [key, Turkish label, icon or null, [[pattern on the upper-case name, confidence]]]
const D = (n) => [`d${n}`, String(n), null, [[new RegExp(`^(DIGIT\\s*|NUM(BER)?\\s*)?${n}$`), 3]]];
export const KEYS = [
  ['power', 'Güç', 'power', [[/^(POWER|POWER TOGGLE|PWR|ON\/OFF|POWER ON\/OFF|POWER ON-OFF|STANDBY)$/, 3], [/^POWER\b(?!.*\b(ON|OFF)$)/, 1]]],
  ['power_on', 'Aç', null, [[/^(POWER ON|ON|DISCRETE ON|PWR ON)$/, 3]]],
  ['power_off', 'Kapat', null, [[/^(POWER OFF|OFF|DISCRETE OFF|PWR OFF)$/, 3]]],
  ['input', 'Kaynak', 'input', [[/^(INPUT|SOURCE|INPUT SOURCE|INPUT SELECT|TV\s*\/\s*(AV|VIDEO)|AV|TV\/AV INPUT|INPUT SOURCE)$/, 3], [/\b(INPUT|SOURCE)\b/, 1]]],
  ['mute', 'Sessiz', 'mute', [[/^(MUTE|VOLUME MUTE|MUTING|AUDIO MUTE)$/, 3]]],
  ['vol_up', 'Sesi aç', 'plus', [[/^(VOL(UME)?\s*(\+|UP)|VOL\+|VOLUME UP)$/, 3], [/VOL(UME)?.*(\+|\bUP\b)/, 1]]],
  ['vol_down', 'Sesi kıs', 'minus', [[/^(VOL(UME)?\s*(-|DOWN|DN)|VOL-|VOLUME DOWN)$/, 3], [/VOL(UME)?.*(-|\bDOWN\b|\bDN\b)/, 1]]],
  ['ch_up', 'Sonraki kanal', 'up', [[/^(CH(ANNEL)?\s*(\+|UP)|CH\+|PROG(RAM)?\s*(\+|UP)|P\s*\+|PR\s*(\+|UP)|CHANNEL UP)$/, 3], [/\b(CH|CHANNEL|PROG|PR)\b.*(\+|\bUP\b)/, 1]]],
  ['ch_down', 'Önceki kanal', 'down', [[/^(CH(ANNEL)?\s*(-|DOWN|DN)|CH-|PROG(RAM)?\s*(-|DOWN)|P\s*-|PR\s*(-|DN|DOWN)|CHANNEL DOWN)$/, 3], [/\b(CH|CHANNEL|PROG|PR)\b.*(-|\bDOWN\b|\bDN\b)/, 1]]],
  ['up', 'Yukarı', 'up', [[/^(CURSOR|ARROW|NAV|MENU|C-|D-PAD)\s*-?\s*UP$/, 3], [/^UP$/, 2]]],
  ['down', 'Aşağı', 'down', [[/^(CURSOR|ARROW|NAV|MENU|C-|D-PAD)\s*-?\s*(DOWN|DN)$/, 3], [/^(DOWN|DN)$/, 2]]],
  ['left', 'Sol', 'left', [[/^(CURSOR|ARROW|NAV|MENU|C-|D-PAD)\s*-?\s*(LEFT|LT|LF)$/, 3], [/^LEFT$/, 2]]],
  ['right', 'Sağ', 'right', [[/^(CURSOR|ARROW|NAV|MENU|C-|D-PAD)\s*-?\s*(RIGHT|RT)$/, 3], [/^RIGHT$/, 2]]],
  ['ok', 'OK', null, [[/^(OK|ENTER|SELECT|CURSOR (OK|ENTER)|CONFIRM|CENTER)$/, 3]]],
  ['back', 'Geri', 'back', [[/^(BACK|RETURN|GO BACK)$/, 3]]],
  ['exit', 'Çıkış', 'close', [[/^EXIT$/, 3], [/\bEXIT\b/, 1]]],
  ['home', 'Ana menü', 'home', [[/^(HOME|SMART HUB|SMART|HOME MENU|MY APPS)$/, 3]]],
  ['menu', 'Menü', 'menu', [[/^(MENU|SETUP|SETTINGS|MAIN MENU)$/, 3]]],
  ['info', 'Bilgi', null, [[/^(INFO|INFORMATION|DISPLAY)$/, 3]]],
  ['guide', 'Rehber', null, [[/^(GUIDE|EPG|TV GUIDE)$/, 3]]],
  D(1), D(2), D(3), D(4), D(5), D(6), D(7), D(8), D(9), D(0),
  ['play', 'Oynat', 'play', [[/^PLAY$/, 3], [/^PLAY\b/, 1]]],
  ['pause', 'Duraklat', 'pause', [[/^PAUSE$/, 3], [/\bPAUSE\b/, 1]]],
  ['stop', 'Durdur', 'stop', [[/^STOP$/, 3]]],
  ['rewind', 'Geri sar', 'rewind', [[/^(REW|REWIND|<<|SCAN <<|FAST REVERSE)$/, 3]]],
  ['forward', 'İleri sar', 'forward', [[/^(FF|FAST FORWARD|FWD|>>|SCAN >>)$/, 3]]],
  ['record', 'Kayıt', null, [[/^(REC|RECORD)$/, 3]]],
  ['prev', 'Önceki', null, [[/^(PREV|PREVIOUS|SKIP -|SKIP PREV|\|<<)$/, 3]]],
  ['next', 'Sonraki', null, [[/^(NEXT|SKIP \+|SKIP NEXT|>>\|)$/, 3]]],
  ['red', 'Kırmızı', null, [[/^(RED|KEY RED)$/, 3], [/\bRED\b/, 1]]],
  ['green', 'Yeşil', null, [[/^(GREEN|KEY GREEN)$/, 3], [/\bGREEN\b/, 1]]],
  ['yellow', 'Sarı', null, [[/^(YELLOW|KEY YELLOW)$/, 3], [/\bYELLOW\b/, 1]]],
  ['blue', 'Mavi', null, [[/^(BLUE|KEY BLUE)$/, 3], [/\bBLUE\b/, 1]]],
  ['netflix', 'Netflix', 'netflix', [[/NETFLIX/, 3]]],
  ['youtube', 'YouTube', null, [[/YOUTUBE/, 3]]],
  ['temp_up', 'Sıcaklığı artır', 'plus', [[/^(TEMP(ERATURE)?\s*(\+|UP)|WARMER)$/, 3]]],
  ['temp_down', 'Sıcaklığı düşür', 'minus', [[/^(TEMP(ERATURE)?\s*(-|DOWN|DN)|COOLER)$/, 3]]],
  ['mode', 'Mod', null, [[/^(MODE|AC MODE)$/, 3]]],
  ['fan_speed', 'Fan hızı', 'fan', [[/^(FAN|FAN SPEED|SPEED)$/, 3], [/\b(FAN|SPEED)\b/, 1]]],
  ['swing', 'Salınım', null, [[/SWING|OSC(ILLAT(E|ION))?/, 3]]],
  ['timer', 'Zamanlayıcı', 'clock', [[/^(TIMER|SLEEP TIMER)$/, 3]]],
  ['sleep', 'Uyku', 'moon', [[/^SLEEP$/, 3]]],
];
const KEY_INFO = Object.fromEntries(KEYS.map(([k, label, ic]) => [k, { label, icon: ic }]));
export const keyInfo = (k) => KEY_INFO[k] || null;

// Common extra buttons in Turkish; others keep their database name.
const EXTRA_TR = [
  [/^(FAV|FAVORITE|FAVOURITE)S?$/, 'Favori'], [/^(TEXT|TELETEXT|TTX)$/, 'Teletext'], [/^LIST$/, 'Liste'],
  [/^(ASPECT|ASPECT RATIO|RATIO|ARC|WIDE)$/, 'Ekran oranı'], [/^ZOOM$/, 'Yakınlaştır'], [/^(FREEZE|HOLD|STILL)$/, 'Dondur'],
  [/^(SUBTITLE|SUBTITLES|CC|CAPTION|CLOSED CAPTIONS)$/, 'Altyazı'], [/^(AUDIO|SOUND|SOUND MODE)$/, 'Ses modu'],
  [/^(PICTURE|PICTURE MODE|PIC MODE|P\.MODE)$/, 'Görüntü modu'], [/^PIP$/, 'Resim içinde resim'], [/^(Q\.MENU|QUICK MENU|TOOLS)$/, 'Hızlı menü'],
  [/^(LAST|PRE-CH|PREV CH|FLASHBACK|Q\.VIEW|RECALL)$/, 'Son kanal'], [/^(TV|TV INPUT|INPUT TV)$/, 'TV'], [/^(HDMI ?1)$/, 'HDMI 1'],
  [/^(HDMI ?2)$/, 'HDMI 2'], [/^(HDMI ?3)$/, 'HDMI 3'], [/^(HDMI ?4)$/, 'HDMI 4'], [/^(EJECT|OPEN\/CLOSE)$/, 'Çıkar'], [/^(TITLE|TOP MENU)$/, 'Başlık menüsü'],
];
function extraLabel(names) {
  const plain = names.filter((n) => /[A-Z0-9]/i.test(n)).sort((a, b) => a.length - b.length);
  const best = plain[0] || names[0] || '?';
  const up = best.toUpperCase();
  const tr = EXTRA_TR.find(([re]) => re.test(up));
  if (tr) return tr[1];
  const lower = best.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * IRDB rows → { buttons: [{ k, l, p, d, s, f }], skipped } where k is a standard key (or 'x'
 * for an extra button), l its label, and p/d/s/f the code. Each code becomes the one key its
 * names point to most strongly; codes left over become extra buttons.
 */
export function buildButtons(rows) {
  const codes = new Map();
  let skipped = 0;
  for (const r of rows) {
    if (!canEncode(r.protocol)) { skipped++; continue; }
    const id = `${protoKey(r.protocol)}|${r.device}|${r.subdevice}|${r.function}`;
    if (!codes.has(id)) codes.set(id, { code: r, names: [] });
    codes.get(id).names.push(r.name);
  }
  const scored = [];
  for (const [id, { names }] of codes) {
    const score = {};
    for (const name of names) {
      const up = name.toUpperCase().trim();
      for (const [key, , , rules] of KEYS) {
        const hit = rules.find(([re]) => re.test(up));
        if (hit) score[key] = (score[key] || 0) + hit[1];
      }
    }
    for (const [key, s] of Object.entries(score)) scored.push({ id, key, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const usedCodes = new Map();
  const usedKeys = new Set();
  for (const { id, key } of scored) {
    if (usedCodes.has(id) || usedKeys.has(key)) continue;
    usedCodes.set(id, key);
    usedKeys.add(key);
  }
  const order = KEYS.map(([k]) => k);
  const buttons = [];
  for (const [id, { code, names }] of codes) {
    const key = usedCodes.get(id);
    const c = { p: code.protocol, d: code.device, s: code.subdevice, f: code.function };
    buttons.push(key ? { k: key, l: KEY_INFO[key].label, ...c } : { k: 'x', l: extraLabel(names), ...c });
  }
  buttons.sort((a, b) => (a.k === 'x') - (b.k === 'x') || order.indexOf(a.k) - order.indexOf(b.k) || a.l.localeCompare(b.l, 'tr'));
  // Extras with the same label: keep the first.
  const seen = new Set();
  return { buttons: buttons.filter((b) => b.k !== 'x' || (!seen.has(b.l) && seen.add(b.l))), skipped };
}

export const buttonCode = (b) => ({ protocol: b.p, device: b.d, subdevice: b.s, function: b.f });
