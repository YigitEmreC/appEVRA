// Colour themes, moving background effects and button colours for the
// Customize panel. Each theme swaps the ten pastels (the --p-* tokens at the
// top of css/app.css) and the surfaces for dark and light. "Evra" is the
// stylesheet itself; its values here only draw the preview. Red (alarms) and
// amber (heating, warnings) stay the same in every theme.

const pastels = (sky, splash, denim, seawash, stlouis, mint, gentle, stlouis2, alpine, arctic) =>
  ({ sky, splash, denim, seawash, stlouis, mint, gentle, stlouis2, alpine, arctic });

// ---- background effects ------------------------------------------------------------

// The layers the background can show (js/sky.js draws them). They can be mixed.
export const EFFECTS = [
  { id: 'glow', name: 'Üst parıltı' },
  { id: 'aurora', name: 'Kuzey ışıkları' },
  { id: 'mountains', name: 'Dağlar' },
  { id: 'stars', name: 'Yıldızlar' },
  { id: 'lines', name: 'Işık çizgileri' },
  { id: 'draw', name: 'Altın çizgiler' },
  { id: 'beams', name: 'Bağlantılar' },
  { id: 'orbs', name: 'Parlayan ışıklar' },
  { id: 'embers', name: 'Közler' },
  { id: 'waves', name: 'Dalgalar' },
  { id: 'snow', name: 'Kar' },
  { id: 'fireflies', name: 'Ateş böcekleri' },
  { id: 'flow', name: 'Renk akışı' },
  { id: 'fire', name: 'Şömine' },
  { id: 'galaxy', name: 'Galaksi' },
  { id: 'retro', name: 'Retro güneş' },
  { id: 'istanbul', name: 'İstanbul' },
  { id: 'moon', name: 'Ay' },
  { id: 'gulls', name: 'Martılar' },
  { id: 'dusk', name: 'Gün batımı ışıltısı' },
];

// Ready-made mixes. "night" is the Evra website's night background.
export const PRESETS = {
  night: ['glow', 'aurora', 'lines', 'stars'],
  aurora: ['glow', 'aurora', 'stars', 'mountains'],
  orbs: ['glow', 'orbs', 'embers'],
  waves: ['glow', 'waves', 'stars'],
  stars: ['glow', 'stars', 'lines'],
  showcase: ['draw', 'orbs'],
  connected: ['glow', 'beams', 'stars'],
  winter: ['glow', 'snow', 'mountains'],
  fireflies: ['glow', 'fireflies'],
  flow: ['flow'],
  cosmos: ['flow', 'stars', 'lines'],
  fireplace: ['dusk', 'fire', 'embers'],
  galaxy: ['glow', 'galaxy', 'stars'],
  retro: ['retro', 'stars'],
  bosphorus: ['glow', 'stars', 'moon', 'istanbul'],
  kizkulesi: ['dusk', 'gulls', 'istanbul'],
};

// ---- themes ------------------------------------------------------------------------

// `motion` names the theme's background (a PRESETS key), `m` its three light colours,
// `btn` the button colour that suits that background (used while it shows; see
// applyLook in js/custom.js). A colour picked under Accent still wins.
export const PALETTES = [
  // Moving themes
  {
    id: 'night', name: 'Gece gökyüzü', motion: 'night', m: ['#2dffb0', '#7c5cff', '#22d3ee'], btn: '#FFC65C',
    p: pastels('#7AA2FF', '#6FD3FF', '#9BB8FF', '#5FE0B5', '#B9C8F5', '#BFF5DF', '#A9BDF0', '#C3D0F2', '#EEF2FF', '#E3EAFF'),
    dark: { bg: '#060c1f', card: '#0f1a3a', card2: '#16275a', card3: '#1f2d57', muted: '#a3b1d8', line: 'rgb(91 140 255 / 0.14)', lineStrong: 'rgb(91 140 255 / 0.26)' },
    light: { bg: '#EEF2FF', card: '#ffffff', card2: '#E3EAFF', card3: '#C9D6F7', accent: '#2D55C8', text: '#0E1838', muted: '#4F5E8A' },
  },
  {
    id: 'northern', name: 'Kuzey ışıkları', motion: 'aurora', m: ['#2dffb0', '#19c9d6', '#7c5cff'], btn: '#5FE3C0',
    p: pastels('#5FE3C0', '#6FD3FF', '#A79BFF', '#7BE495', '#BDEDE3', '#D4F7E8', '#A8E0D6', '#C6EAE4', '#ECFBF7', '#E0F6F1'),
    dark: { bg: '#04131A', card: '#0A2129', card2: '#103039', card3: '#17404B', muted: '#8FB8B4' },
    light: { bg: '#ECFBF7', card: '#ffffff', card2: '#DDF3EE', card3: '#BDEDE3', accent: '#14806A', text: '#0B2A27', muted: '#4D7772' },
  },
  {
    id: 'showcase', name: 'Altın çizgiler', motion: 'showcase', m: ['#2d4dff', '#f59e2b', '#5b8cff'], btn: '#FFC65C',
    p: pastels('#FFD27A', '#7AA2FF', '#9BB8FF', '#5FE0B5', '#F5DFB0', '#F7EBCB', '#E9C98F', '#EAD9B6', '#F2F4FF', '#EFE7D6'),
    dark: { bg: '#081028', card: '#0f1a3a', card2: '#16275a', card3: '#1f2d57', muted: '#a3b1d8', line: 'rgb(91 140 255 / 0.15)', lineStrong: 'rgb(245 181 68 / 0.3)' },
    light: { bg: '#FBF6EC', card: '#ffffff', card2: '#F4EAD6', card3: '#EBDDBE', accent: '#9A6A12', text: '#1A1A2E', muted: '#6F6750' },
  },
  {
    id: 'connected', name: 'Bağlantılı', motion: 'connected', m: ['#7aa2ff', '#2fe0c0', '#f5b544'], btn: '#7AA2FF',
    p: pastels('#7AA2FF', '#2FE0C0', '#A79BFF', '#5FE0B5', '#C2CEF5', '#C9F5EA', '#AFC0EE', '#C9D3F0', '#EEF2FF', '#E3F8F4'),
    dark: { bg: '#070B1A', card: '#0E1530', card2: '#152046', card3: '#1E2B58', muted: '#9AA8D6' },
    light: { bg: '#EEF2FF', card: '#ffffff', card2: '#E1E8FB', card3: '#C9D4F4', accent: '#2B4FC0', text: '#0E1838', muted: '#4F5E8A' },
  },
  {
    id: 'ember', name: 'Kor parıltısı', motion: 'orbs', m: ['#f59e2b', '#ff5f6d', '#ffd27a'], btn: '#FFA25C',
    p: pastels('#FFB27A', '#FFD08A', '#F59EB5', '#C8D98F', '#F6D2BE', '#F9E7CF', '#F0BFA8', '#F3D6C7', '#FFF3EA', '#FCEDE3'),
    dark: { bg: '#160B08', card: '#22120E', card2: '#311A14', card3: '#42241C', muted: '#C9A193' },
    light: { bg: '#FFF3EA', card: '#FFFCF9', card2: '#F8E3D6', card3: '#F6D2BE', accent: '#B4532A', text: '#3A1B10', muted: '#8A6455' },
  },
  {
    id: 'deepsea', name: 'Derin deniz', motion: 'waves', m: ['#2d6bff', '#22d3ee', '#2dffb0'], btn: '#4FD6F0',
    p: pastels('#6FB7FF', '#5EE1F0', '#8FA8FF', '#5FD6B2', '#BFD8F2', '#CDEFEA', '#A6C9EC', '#C3DAEE', '#EAF4FD', '#E0F0FA'),
    dark: { bg: '#03101F', card: '#081C33', card2: '#0D2744', card3: '#143457', muted: '#8EADCB' },
    light: { bg: '#EAF4FD', card: '#ffffff', card2: '#DCEBF9', card3: '#BFD8F2', accent: '#1F5FA8', text: '#0A2240', muted: '#4E6E8E' },
  },
  {
    id: 'winter', name: 'Kış', motion: 'winter', m: ['#bfe3ff', '#8fb8ff', '#e8f4ff'], btn: '#BFE3FF',
    p: pastels('#9CCBFF', '#BFE3FF', '#B4C3F0', '#A8D8D0', '#D6E4F2', '#E3F1F4', '#C5D7EA', '#D9E4EE', '#F3F8FD', '#EAF3FA'),
    dark: { bg: '#0B1422', card: '#122033', card2: '#1A2C44', card3: '#243A57', muted: '#A6B8CF' },
    light: { bg: '#F3F8FD', card: '#ffffff', card2: '#E6EFF8', card3: '#D0DEEC', accent: '#2F6CA8', text: '#10243A', muted: '#55697F' },
  },
  {
    id: 'fireflies', name: 'Ateş böcekleri', motion: 'fireflies', m: ['#ffd27a', '#c8ff7a', '#7affc1'], btn: '#D8F27A',
    p: pastels('#C8E27A', '#FFD27A', '#B9D49A', '#9CD49A', '#DCE8C6', '#E8F1D5', '#CADDB2', '#DDE7CC', '#F5F8EC', '#EEF4E3'),
    dark: { bg: '#0A110B', card: '#121C13', card2: '#1A281B', card3: '#243626', muted: '#A3B59E' },
    light: { bg: '#F5F8EC', card: '#ffffff', card2: '#EAF0DA', card3: '#DCE8C6', accent: '#5A7A1E', text: '#1E2A12', muted: '#66735A' },
  },
  {
    id: 'flow', name: 'Renk akışı', motion: 'flow', m: ['#ff5fa2', '#7c5cff', '#22d3ee'], btn: '#FF8FC8',
    p: pastels('#C49BFF', '#7FE0FF', '#FF9BD2', '#8FE3C0', '#E2D3F7', '#EEE3FA', '#D7C2F2', '#E5D9F3', '#F8F3FF', '#F2EBFC'),
    dark: { bg: '#120A1E', card: '#1C1230', card2: '#271A42', card3: '#342456', muted: '#B3A2CF' },
    light: { bg: '#F8F3FF', card: '#ffffff', card2: '#EFE5FC', card3: '#E2D3F7', accent: '#7A3FC8', text: '#24123D', muted: '#6E5E86' },
  },
  {
    id: 'cosmos', name: 'Kozmos', motion: 'cosmos', m: ['#7c5cff', '#ff5f6d', '#22d3ee'], btn: '#A99BFF',
    p: pastels('#A99BFF', '#7FD8FF', '#FF9BB8', '#7FE3C4', '#D5D0F5', '#E2F3EE', '#C4BEEB', '#D8D4EE', '#F2F0FF', '#ECEAFA'),
    dark: { bg: '#05030C', card: '#0F0B1C', card2: '#19132D', card3: '#241C3E', muted: '#A69CC4' },
    light: { bg: '#F2F0FF', card: '#ffffff', card2: '#E7E3FB', card3: '#D5D0F5', accent: '#4F3FC8', text: '#151033', muted: '#5F5A80' },
  },
  {
    id: 'fireplace', name: 'Şömine', motion: 'fireplace', m: ['#ff7a18', '#ff3d2e', '#ffd166'], btn: '#FF9A4D',
    p: pastels('#FFB070', '#FFD08A', '#F2A0A0', '#D6C68A', '#F5D3BD', '#F8E5CC', '#EDBFA5', '#F0D4C2', '#FFF1E6', '#FBEBDD'),
    dark: { bg: '#120806', card: '#1E0F0A', card2: '#2B160F', card3: '#3A1E14', muted: '#C7A08F' },
    light: { bg: '#FFF1E6', card: '#FFFBF7', card2: '#F7E1D2', card3: '#F2CDB6', accent: '#B0471E', text: '#3A1508', muted: '#87604F' },
  },
  {
    id: 'galaxy', name: 'Galaksi', motion: 'galaxy', m: ['#b06bff', '#ff5fb0', '#5fd0ff'], btn: '#D38BFF',
    p: pastels('#B49CFF', '#8FD3FF', '#FF9AD5', '#86E3CF', '#D7CFF7', '#E0F4F0', '#C6BCEE', '#D9D3F0', '#F3F0FF', '#ECE8FB'),
    dark: { bg: '#04020D', card: '#0E0A20', card2: '#181133', card3: '#231A47', muted: '#A9A0D0' },
    light: { bg: '#F3F0FF', card: '#ffffff', card2: '#E8E3FB', card3: '#D7CFF7', accent: '#5A3CC8', text: '#170F36', muted: '#625A85' },
  },
  {
    id: 'retro', name: 'Retro', motion: 'retro', m: ['#ff71ce', '#01cdfe', '#fffb96'], btn: '#FF71CE',
    p: pastels('#FF71CE', '#01CDFE', '#B967FF', '#05FFA1', '#F6C9EA', '#C9F7E6', '#E4B6F2', '#EBCDEF', '#FFF0FA', '#F7E6F5'),
    dark: { bg: '#12041F', card: '#1D0A30', card2: '#2A1045', card3: '#3A185C', muted: '#C3A2D8' },
    light: { bg: '#FFF0FA', card: '#ffffff', card2: '#FBE0F2', card3: '#F6C9EA', accent: '#B0127A', text: '#2B0A2A', muted: '#7A5577' },
  },
  {
    id: 'bosphorus', name: 'Boğaz', motion: 'bosphorus', m: ['#ffd27a', '#3a7bd5', '#7fdbff'], btn: '#FFD27A',
    p: pastels('#7FB2FF', '#7FDBFF', '#A9B8F5', '#6FD6B8', '#C7D5EE', '#D2EEE7', '#B2C6E6', '#CCD8EA', '#EFF4FC', '#E4EEF8'),
    dark: { bg: '#050D1C', card: '#0C1A30', card2: '#132541', card3: '#1C3253', muted: '#9DB0CC' },
    light: { bg: '#EEF3FA', card: '#ffffff', card2: '#E0E9F5', card3: '#C7D5EE', accent: '#1E4F96', text: '#0B1C36', muted: '#4E6383' },
  },
  {
    id: 'kizkulesi', name: 'Kız Kulesi', motion: 'kizkulesi', m: ['#ff8c42', '#ff4f7b', '#ffd166'], btn: '#FF8F70',
    p: pastels('#FF9E7A', '#FFC48A', '#D79BD8', '#9FD3C0', '#F4D0CC', '#F6E3D8', '#E9BCC3', '#EED5D4', '#FFF2EC', '#FBE9E6'),
    dark: { bg: '#1A0E1C', card: '#26152A', card2: '#331D38', card3: '#43284A', muted: '#C9A7C4' },
    light: { bg: '#FFF2EC', card: '#FFFBF9', card2: '#F8E2DC', card3: '#F2CBC4', accent: '#A8432F', text: '#36141A', muted: '#85605F' },
  },
  // Still themes
  {
    id: 'evra', name: 'Evra',
    p: pastels('#9AAFDD', '#9ED5FD', '#B3C6EA', '#B3C6B3', '#CDD7F0', '#DAE7D1', '#B8CBE4', '#CFDBE7', '#EDEEFB', '#E1EDF1'),
    dark: { bg: '#0E1322', card: '#151B2E', card2: '#1C2440', card3: '#283153', muted: '#9AA5C6' },
    light: { bg: '#EDEEFB', card: '#ffffff', card2: '#E6EBF8', card3: '#CDD7F0', accent: '#4A64AC', text: '#1A2240', muted: '#5C6787' },
  },
  {
    id: 'ocean', name: 'Okyanus',
    p: pastels('#7FCBD6', '#8FE0F0', '#A6C8D8', '#9FD3BE', '#C6E3EA', '#D2EFE6', '#B0D6DF', '#CBE2E8', '#E8F6F8', '#E0F2F4'),
    dark: { bg: '#0A1A1F', card: '#10252C', card2: '#16323B', card3: '#1F414C', muted: '#8FB0B8' },
    light: { bg: '#E8F6F8', card: '#ffffff', card2: '#DCEFF2', card3: '#C6E3EA', accent: '#1F7A8C', text: '#123038', muted: '#557A83' },
  },
  {
    id: 'forest', name: 'Orman',
    p: pastels('#9CCB9A', '#A8D8C8', '#C3D3A4', '#B5D69A', '#D3E3C8', '#E2EDD3', '#BFD8B8', '#D6E4CE', '#EEF5E9', '#E6F0E2'),
    dark: { bg: '#0E1710', card: '#152117', card2: '#1C2C1F', card3: '#27392A', muted: '#9AB09D' },
    light: { bg: '#EEF5E9', card: '#ffffff', card2: '#E1ECDA', card3: '#D3E3C8', accent: '#3E7A45', text: '#1B2E1E', muted: '#5F7563' },
  },
  {
    id: 'sunset', name: 'Gün batımı',
    p: pastels('#F2A48A', '#F7C59F', '#E8A5B8', '#C9D6A3', '#F3D5C8', '#F6E6D3', '#EBC3B5', '#F0D9CF', '#FCF1EB', '#FAEDE6'),
    dark: { bg: '#1A1110', card: '#251816', card2: '#33211E', card3: '#432C28', muted: '#C0A39C' },
    light: { bg: '#FCF1EB', card: '#FFFCFA', card2: '#F5E3DA', card3: '#F3D5C8', accent: '#B4533A', text: '#3A1F19', muted: '#86675F' },
  },
  {
    id: 'lavender', name: 'Lavanta',
    p: pastels('#B9A6E8', '#C7B8F5', '#E0A8D8', '#A8D0C0', '#DCD3F3', '#E9E1F7', '#CBBDE9', '#DED6F0', '#F4F0FC', '#EFEAF9'),
    dark: { bg: '#15111F', card: '#1E182C', card2: '#29213C', card3: '#362C4E', muted: '#A69BC0' },
    light: { bg: '#F4F0FC', card: '#ffffff', card2: '#E9E2F8', card3: '#DCD3F3', accent: '#6A4FB0', text: '#271F3D', muted: '#6E6487' },
  },
  {
    id: 'graphite', name: 'Grafit',
    p: pastels('#B8BEC9', '#A9C4D6', '#C2C2CC', '#B4C4B4', '#D4D7DD', '#DFE3DF', '#C6CBD3', '#D8DBE0', '#F1F2F4', '#ECEEF0'),
    dark: { bg: '#0F1012', card: '#18191C', card2: '#222327', card3: '#2E3035', muted: '#9A9DA5' },
    light: { bg: '#F1F2F4', card: '#ffffff', card2: '#E6E8EB', card3: '#D4D7DD', accent: '#4A5260', text: '#1C1E22', muted: '#646973' },
  },
  {
    id: 'contrast', name: 'Yüksek kontrast',
    p: pastels('#A9BDF0', '#9EDCFF', '#C3D2F5', '#A8DDA8', '#DCE4F7', '#E4F0DC', '#C6D6EE', '#DCE5EF', '#FFFFFF', '#F2F6F8'),
    dark: { bg: '#000000', card: '#0B0B10', card2: '#17171F', card3: '#262632', muted: '#BEC2D6', line: 'rgb(255 255 255 / 0.18)', lineStrong: 'rgb(255 255 255 / 0.32)' },
    light: { bg: '#FFFFFF', card: '#FFFFFF', card2: '#EEF0F6', card3: '#D9DEEC', accent: '#233C94', text: '#05091A', muted: '#3E4563', line: 'rgb(0 0 0 / 0.22)', lineStrong: 'rgb(0 0 0 / 0.38)' },
  },
];

// Accent colours offered on top of any theme ('' = the theme's own).
export const ACCENTS = ['#9AAFDD', '#7FCBD6', '#9CCB9A', '#E9BE7C', '#F2A48A', '#E8A5B8', '#B9A6E8', '#B8BEC9'];

// Colours a quick action button can take ('' = its own). Pastels follow the theme.
export const BUTTON_COLOURS = [
  ['var(--p-sky)', 'Blue'], ['var(--p-splash)', 'Sky'], ['var(--p-seawash)', 'Green'], ['var(--p-mint)', 'Mint'],
  ['var(--p-denim)', 'Lilac'], ['#E9BE7C', 'Amber'], ['#F2A48A', 'Coral'], ['#F27D89', 'Red'], ['#B9A6E8', 'Violet'],
];
// Icons a quick action button can show.
export const BUTTON_ICONS = ['tv', 'film', 'flame', 'heater', 'sun', 'moon', 'bulb', 'power', 'music', 'party', 'gamepad', 'dinner', 'bed', 'sunrise', 'leaf', 'lock', 'sparkle', 'home'];

export const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES.find((p) => p.id === 'evra');
