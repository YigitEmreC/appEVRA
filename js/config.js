// Everything the app knows about this particular home. When a device is added
// or renamed in Home Assistant, this is the one file to update.

const IR = 'button.bg_crib_ir_module_';

export const HOME = {
  room: 'BG Crib',

  climate: {
    temperature: 'sensor.bg_crib_thermostat_temperature',
    humidity: 'sensor.bg_crib_thermostat_humidity',
    battery: 'sensor.bg_crib_thermostat_battery',
    comfortTempMin: 'number.bg_crib_thermostat_comfort_temperature_min',
    comfortTempMax: 'number.bg_crib_thermostat_comfort_temperature_max',
    comfortHumMin: 'number.bg_crib_thermostat_comfort_humidity_min',
    comfortHumMax: 'number.bg_crib_thermostat_comfort_humidity_max',
  },
  weather: 'weather.home',

  window: { contact: 'binary_sensor.window', battery: 'sensor.window_battery' },

  presence: {
    occupancy: 'binary_sensor.kapkan_occupancy',
    battery: 'sensor.kapkan_battery',
    timeout: 'number.kapkan_presence_detection_timeout',
    sensitivity: 'select.kapkan_detection_sensitivity',
  },

  light: { entity: 'light.bg_crib_led', name: 'LED şerit' },

  plug: {
    name: 'Priz',
    switch: 'switch.bg_crib_plug',
    power: 'sensor.bg_crib_plug_current_consumption',
    today: 'sensor.bg_crib_plug_today_s_consumption',
    month: 'sensor.bg_crib_plug_this_month_s_consumption',
    voltage: 'sensor.bg_crib_plug_voltage',
    current: 'sensor.bg_crib_plug_current',
  },

  // The heater and TV are driven by infrared from the Pico. Their power codes
  // are toggles, so the "tracker" helpers record whether each one is on.
  heater: {
    name: 'Isıtıcı',
    tracker: 'input_boolean.heater_on',
    buttons: {
      power: IR + 'heater_power',
      toggle: IR + 'heater_toggle',
      tempUp: IR + 'heater_temp_up',
      tempDown: IR + 'heater_temp_down',
      eco: IR + 'heater_eco_mode',
      performance: IR + 'heater_performance_mode',
      sleep: IR + 'heater_sleep_mode',
      lock: IR + 'heater_lock',
    },
  },

  tv: {
    name: 'TV',
    tracker: 'input_boolean.tv_on',
    buttons: {
      power: IR + 'tv_power', mute: IR + 'tv_mute', input: IR + 'tv_input', netflix: IR + 'tv_netflix',
      volumeUp: IR + 'tv_volume_up', volumeDown: IR + 'tv_volume_down',
      channelUp: IR + 'tv_channel_up', channelDown: IR + 'tv_channel_down',
      hdmi1: IR + 'tv_hdmi_1', hdmi2: IR + 'tv_hdmi_2', hdmi3: IR + 'tv_hdmi_3',
      up: IR + 'tv_up', down: IR + 'tv_down', left: IR + 'tv_left', right: IR + 'tv_right', ok: IR + 'tv_ok',
      back: IR + 'tv_back', home: IR + 'tv_home', settings: IR + 'tv_settings', exit: IR + 'tv_exit',
      play: IR + 'tv_play', pause: IR + 'tv_pause', stop: IR + 'tv_stop', rewind: IR + 'tv_rewind', forward: IR + 'tv_fast_forward',
      digits: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => IR + 'tv_' + d),
    },
  },

  batteries: [
    { name: 'Sıcaklık sensörü', entity: 'sensor.bg_crib_thermostat_battery' },
    { name: 'Pencere sensörü', entity: 'sensor.window_battery' },
    { name: 'Hareket sensörü', entity: 'sensor.kapkan_battery' },
  ],

  colorPresets: [
    { name: 'Sıcak beyaz', data: { color_temp_kelvin: 2700 }, css: '#ffb36b' },
    { name: 'Soğuk beyaz', data: { color_temp_kelvin: 5500 }, css: '#e3ecff' },
    { name: 'Kırmızı', data: { hs_color: [0, 100] }, css: 'hsl(0 90% 55%)' },
    { name: 'Turuncu', data: { hs_color: [30, 100] }, css: 'hsl(30 95% 55%)' },
    { name: 'Sarı', data: { hs_color: [52, 100] }, css: 'hsl(52 95% 55%)' },
    { name: 'Yeşil', data: { hs_color: [120, 100] }, css: 'hsl(120 70% 45%)' },
    { name: 'Turkuaz', data: { hs_color: [185, 100] }, css: 'hsl(185 85% 50%)' },
    { name: 'Mavi', data: { hs_color: [235, 100] }, css: 'hsl(235 90% 62%)' },
    { name: 'Mor', data: { hs_color: [275, 90] }, css: 'hsl(275 80% 60%)' },
    { name: 'Pembe', data: { hs_color: [320, 85] }, css: 'hsl(320 85% 62%)' },
  ],

  // Quick actions run from the app itself: a list of steps done in order.
  //   { ensure: 'tv' | 'heater', on: true | false }  presses power only if needed
  //   { press: <button entity> }
  //   { call: 'domain.service', target: <entity>, data: {...} }
  //   { wait: <milliseconds> }
  // Colour each device card lights up with when it's on (Evra palette; heating
  // keeps a warm amber so "heating" still reads as warm).
  // The pastels are CSS tokens, so they follow the chosen colour theme.
  tones: { heater: '#E9BE7C', tv: 'var(--p-splash)', plug: 'var(--p-seawash)', light: 'var(--p-sky)' },

  quickActions: [
    {
      id: 'movie', name: 'Film', icon: 'tv', hint: 'TV açık, loş mor ışık', tone: 'var(--p-sky)',
      steps: [
        { ensure: 'tv', on: true },
        { call: 'light.turn_on', target: 'light.bg_crib_led', data: { hs_color: [265, 90], brightness_pct: 15 } },
      ],
    },
    {
      id: 'cosy', name: 'Sıcacık', icon: 'flame', hint: 'Isıtıcı ECO modunda, sıcak ışık', tone: 'var(--p-seawash)',
      steps: [
        { ensure: 'heater', on: true },
        { wait: 600 },
        { press: IR + 'heater_eco_mode' },
        { call: 'light.turn_on', target: 'light.bg_crib_led', data: { color_temp_kelvin: 2700, brightness_pct: 40 } },
      ],
    },
    {
      id: 'bright', name: 'Aydınlık', icon: 'sun', hint: 'Tam beyaz ışık', tone: 'var(--p-splash)',
      steps: [{ call: 'light.turn_on', target: 'light.bg_crib_led', data: { color_temp_kelvin: 5000, brightness_pct: 100 } }],
    },
    {
      id: 'off', name: 'Hepsini kapat', icon: 'power', hint: 'TV, ısıtıcı ve ışık', tone: 'var(--p-stlouis)',
      steps: [
        { ensure: 'tv', on: false },
        { wait: 600 },
        { ensure: 'heater', on: false },
        { call: 'light.turn_off', target: 'light.bg_crib_led' },
      ],
    },
  ],
};
