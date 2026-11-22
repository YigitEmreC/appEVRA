// The Evra product range (catalogue of November 2026), so the app knows how to
// show, control and pair every product.
//
// kind     decides which controls a device card gets (see js/devices/cards.js)
// pairing  decides how "Add device" connects it:
//            zigbee   pair through the Zigbee dongle on the hub
//            flow     a Home Assistant setup form (integration = handler name)
//            matter   enter the Matter pairing code
//            cloud    added through the maker's cloud integration in Home Assistant
//            none     nothing to pair (works on its own, or is part of the hub)
// match    model names used to recognise devices already in Home Assistant

export const CATEGORIES = [
  { id: 'hub', name: 'Hub and display' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'security', name: 'Safety and security' },
  { id: 'heating', name: 'Heating' },
  { id: 'climate', name: 'Climate' },
  { id: 'energy', name: 'Energy and lighting' },
  { id: 'covers', name: 'Curtains and shutters' },
  { id: 'garden', name: 'Garden and balcony' },
  { id: 'network', name: 'Network' },
];

export const PRODUCTS = [
  // ---- hub and display -----------------------------------------------------
  {
    id: 'hub', category: 'hub', kind: 'hub', icon: 'cpu',
    name: 'Evra Hub', nameTr: 'Evra Merkez Ünitesi',
    model: 'Raspberry Pi 4 (4 GB) · Sonoff Zigbee 3.0 USB · 240 GB SSD · passive case', protocol: 'Ethernet',
    pairing: 'none', match: ['Raspberry Pi'],
    summary: 'The brain of the home. Every sensor, plug, light and valve connects to it, and the Evra assistant runs on it. Data stays in the home and basic automations keep working without internet.',
    setup: ['Placed next to the modem and connected with a network cable.', 'The Zigbee stick goes on a short USB extension, away from Wi-Fi and USB 3.0 interference.', 'Devices are paired one by one, assigned to rooms and named.', 'The Evra app is installed on the family\'s phones.'],
    note: 'This is the hub the app is talking to; it doesn\'t need adding.',
  },
  {
    id: 'panel', category: 'hub', kind: 'info', icon: 'tablet',
    name: 'Wall control panel', nameTr: 'Duvar Kontrol Ekranı',
    model: 'Sonoff NSPanel Pro (120)', protocol: 'Wi-Fi',
    pairing: 'none', match: ['NSPanel'],
    summary: 'Touch screen by the front door showing the home at a glance: temperature, open doors and windows, lights and camera. The easiest control point for family members without a phone.',
    setup: ['Mounted in the switch box or on the wall by the entrance and wired to mains.', 'Connected to Wi-Fi with the Evra app pinned full screen.', 'Favourite buttons (Leaving home, Night mode, All lights) go on the first page.'],
    note: 'Open this app\'s address in the panel\'s browser; there is nothing to pair.',
  },

  // ---- sensors ---------------------------------------------------------------
  {
    id: 'motion', category: 'sensors', kind: 'motion', icon: 'person',
    name: 'Motion sensor', nameTr: 'Hareket Sensörü',
    model: 'Sonoff SNZB-03P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-03P', 'SNZB-03'],
    summary: 'Small battery sensor that detects movement: switches lights on, lowers heating in empty rooms and warns when there is movement while nobody is home. 110° view, about 6 m range.',
    setup: ['Stick or screw it in a corner about 2 m up.', 'Aim it at the doorway and walkway, not at radiators, AC vents or windows.', 'Pair it with the hub and assign a room.'],
    pairHint: 'Hold the button on the sensor for 5 seconds until the light blinks.',
  },
  {
    id: 'climate-sensor', category: 'sensors', kind: 'climate-sensor', icon: 'thermometer',
    name: 'Temperature and humidity sensor', nameTr: 'Sıcaklık ve Nem Sensörü',
    model: 'Sonoff SNZB-02D (with display)', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-02D', 'SNZB-02'],
    summary: 'Measures room temperature and humidity and shows them on its display. Gives the boiler and radiator valves a proper reading, and tracks comfort in nurseries and elderly homes.',
    setup: ['Place it about 1.5 m up, away from sun, radiators and AC vents.', 'Pair it with the hub and assign a room.', 'Set the boiler or radiator valve to use it as the reference.'],
    pairHint: 'Hold the button on the back for 5 to 7 seconds until the signal icon flashes.',
  },
  {
    id: 'contact', category: 'sensors', kind: 'contact', icon: 'door',
    name: 'Door and window sensor', nameTr: 'Kapı ve Pencere Sensörü',
    model: 'Sonoff SNZB-04P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-04P', 'SNZB-04'],
    summary: 'Two-part sensor that knows the moment a door or window opens. Warns about open windows, switches heating off when a window opens, and alarms if removed.',
    setup: ['Stick the sensor on the frame and the magnet on the door or window, less than 12 mm apart when closed.', 'Align it so it reads "closed" only when fully shut.', 'Pair it and name which door or window it is.'],
    pairHint: 'Hold the button for 5 seconds until the light blinks; the recessed button may need the pin from the box.',
  },
  {
    id: 'presence', category: 'sensors', kind: 'presence', icon: 'radar',
    name: 'Presence sensor (radar)', nameTr: 'Varlık Sensörü (Radar)',
    model: 'Sonoff SNZB-06P (mmWave)', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-06P'],
    summary: 'Radar that sees people even when they sit or lie still, down to breathing. The key part of the elderly package: warns the family after long inactivity in the bathroom or bedroom.',
    setup: ['Mount it in a corner overlooking the room, about 2 m up, and connect power.', 'Don\'t aim it at mirrors, curtains, fans or AC louvres.', 'Set the detection distance (about 2.5, 3.5 or 4 m) to the room size and pair it.'],
    pairHint: 'Power it up, then hold its button for 5 seconds until the light blinks.',
  },

  // ---- safety and security -----------------------------------------------------
  {
    id: 'smoke', category: 'security', kind: 'smoke', icon: 'smoke',
    name: 'Smart smoke detector', nameTr: 'Akıllı Duman Dedektörü',
    model: 'Aqara SD-S01D', protocol: 'Zigbee', pairing: 'zigbee', match: ['SD-S01D', 'JY-GZ-01AQ'],
    summary: 'Ceiling smoke detector with a loud 94 dB alarm that also alerts the family\'s phones, even when nobody is home. Battery lasts up to 10 years.',
    setup: ['Screw it to the ceiling, a little away from the hob and the bathroom door.', 'Activate the battery and test the alarm with the test button.', 'Pair it and choose who gets alerted.'],
    pairHint: 'Hold the button until the light blinks blue.',
    emergency: 'Alerts only; it does not call the fire brigade. In an emergency call 112.',
  },
  {
    id: 'leak', category: 'security', kind: 'leak', icon: 'droplet',
    name: 'Water leak sensor', nameTr: 'Su Basma Sensörü',
    model: 'Shelly Flood Gen4', protocol: 'Wi-Fi / Zigbee', pairing: 'flow', integration: 'shelly', match: ['Flood', 'S4SN-0071A'],
    summary: 'Goes under the washing machine, dishwasher, water heater or sink. A 2 m sensing cable catches leaks along a pipe; it sounds an alarm and alerts your phone.',
    setup: ['Fix the unit to the wall and lay the sensing cable where water collects first.', 'Keep the cable off metal pipes and rails.', 'Connect it to Wi-Fi and add it to the hub; link it to the main water valve if there is one.'],
    pairHint: 'Enter the sensor\'s IP address from your router. It can also pair over Zigbee instead.',
  },
  {
    id: 'sos', category: 'security', kind: 'button', icon: 'sos',
    name: 'Emergency button', nameTr: 'Acil Yardım Butonu',
    model: 'Sonoff SNZB-01P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-01P', 'SNZB-01'],
    summary: 'Small wireless button for the bedside, bathroom or a lanyard. One press sends an emergency alert to the family; double and long presses can do other things.',
    setup: ['Stick it where it can be reached lying down, by the bed and in the bathroom.', 'Pair it; single press = emergency alert.', 'Decide who is alerted in which order, then test it.'],
    pairHint: 'Hold the button for 5 seconds until the light blinks.',
    emergency: 'Alerts the family only; call 112 in an emergency.',
  },
  {
    id: 'camera-indoor', category: 'security', kind: 'camera', icon: 'camera',
    name: 'Indoor camera', nameTr: 'İç Mekan Kamerası',
    model: 'TP-Link Tapo C210 (2K, 360°)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'onvif', match: ['C210', 'Tapo C'],
    summary: 'Pan-and-tilt camera that sees the whole room, with night vision, two-way talk and cry detection. Optional, and used only with the family\'s consent. Privacy mode closes the lens.',
    setup: ['Put it on a shelf or mount it, and plug in the original adapter.', 'Connect it to Wi-Fi; add a microSD card for recording if wanted.', 'Add it to the hub locally; the picture shows in the app and on the wall panel.'],
    pairHint: 'Enter the camera\'s IP address and the camera account set in the Tapo app.',
  },
  {
    id: 'gas', category: 'security', kind: 'gas', icon: 'alert',
    name: 'Natural gas leak detector', nameTr: 'Doğalgaz Kaçak Dedektörü',
    model: 'Nous E9', protocol: 'Zigbee', pairing: 'zigbee', match: ['Nous E9', 'gas detector'],
    summary: 'Detects natural gas (methane) near the boiler and hob, sounds a loud alarm and alerts your phone.',
    setup: ['Gas is lighter than air: mount it 30 cm below the ceiling, 1 to 4 m from the hob.', 'Plug it in; the sensor needs a few minutes to warm up.', 'Pair it and test it with the test button.'],
    pairHint: 'Hold the button until the light blinks.',
    emergency: 'In a gas leak: no flames, don\'t touch switches, open windows and call 187.',
  },
  {
    id: 'water-valve', category: 'security', kind: 'valve', icon: 'valve',
    name: 'Main water valve controller', nameTr: 'Akıllı Ana Su Vanası Kolu',
    model: 'Zigbee valve actuator (fits the main valve)', protocol: 'Zigbee', pairing: 'zigbee', match: ['valve controller', 'water valve', 'valve actuator'],
    summary: 'Motor that turns the main water valve handle. Shuts the water automatically when a leak is detected, or from your phone before a holiday.',
    setup: ['Check the valve type and handle size (a ball valve is needed).', 'Fix the motor to the valve handle.', 'Pair it and link it to the water leak sensor.'],
    pairHint: 'Hold the button until the light blinks.',
  },
  {
    id: 'siren', category: 'security', kind: 'siren', icon: 'siren',
    name: 'Indoor siren', nameTr: 'İç Ortam Sireni',
    model: 'Fonri Wi-Fi siren', protocol: 'Wi-Fi (cloud)', pairing: 'cloud', integration: 'tuya', match: ['siren'],
    summary: 'Loud siren with a light that makes sure everyone notices smoke, water or a break-in.',
    setup: ['Place it centrally, for example in the hallway, and plug it in.', 'Connect it to Wi-Fi and add it to the hub (cloud connection).', 'Choose which events make it sound.'],
    note: 'Connects through the maker\'s cloud, so it may lag during internet outages.',
  },
  {
    id: 'camera-outdoor', category: 'security', kind: 'camera', icon: 'camera',
    name: 'Outdoor camera', nameTr: 'Dış Mekan Kamerası',
    model: 'Sonoff CAM-B1P', protocol: 'Wi-Fi', pairing: 'flow', integration: 'onvif', match: ['CAM-B1P', 'CAM-B1'],
    summary: 'Weatherproof camera for a balcony, garden or front door with night vision and local recording. Sends an alert with a picture when it sees motion.',
    setup: ['Mount it on the wall and connect its adapter.', 'Connect it to Wi-Fi and add it to the hub locally.', 'Set the detection zone so it doesn\'t watch the neighbours.'],
    pairHint: 'Enter the camera\'s IP address and its ONVIF username and password.',
  },
  {
    id: 'lock', category: 'security', kind: 'lock', icon: 'lock',
    name: 'Smart door lock', nameTr: 'Akıllı Kapı Kilidi',
    model: 'Aqara U200 Lite', protocol: 'Thread / Matter', pairing: 'matter', match: ['U200'],
    summary: 'Fits the inside of the existing door; unlocks by phone, code or fingerprint and locks automatically. Shows who came in when, and gives guests temporary codes.',
    setup: ['Check the cylinder size and type (a European emergency-function cylinder is needed).', 'Fit the lock to the inside of the door and calibrate it.', 'Add it to the hub; this needs a second, Thread dongle on the hub.'],
    pairHint: 'Enter the 11-digit Matter code from the lock or its manual.',
  },

  // ---- heating -----------------------------------------------------------------
  {
    id: 'trv', category: 'heating', kind: 'climate', icon: 'heater',
    name: 'Smart radiator valve', nameTr: 'Akıllı Radyatör Vanası',
    model: 'Sonoff TRVZB', protocol: 'Zigbee', pairing: 'zigbee', match: ['TRVZB'],
    summary: 'Replaces the old thermostatic head on a radiator. Heats each room to its own temperature, skips empty rooms and closes when a window opens.',
    setup: ['Remove the old head; fit the matching adapter if needed.', 'Fit the head with batteries in; it calibrates by opening and closing once.', 'Pair it and set the room and schedule.'],
    pairHint: 'Switch it to manual mode first (short press of the middle button), then hold the button until it pairs.',
  },
  {
    id: 'boiler-relay', category: 'heating', kind: 'relay', icon: 'toggle',
    name: 'Boiler and underfloor heating relay', nameTr: 'Kombi ve Yerden Isıtma Rölesi',
    model: 'Shelly 1 Gen4', protocol: 'Wi-Fi / Zigbee', pairing: 'flow', integration: 'shelly', match: ['Shelly 1', 'S4SW-001'],
    summary: 'Small relay on the boiler\'s room-thermostat input (or the underfloor manifold) that switches heating by phone, schedule or Evra\'s decision. The boiler and gas line are not touched.',
    setup: ['Power off; a qualified technician does this.', 'Wire it to the boiler\'s room-thermostat input as a dry contact (or to the actuators\' supply for underfloor heating).', 'Connect to Wi-Fi, add it to the hub and pair it with the room sensor; set a maximum temperature and run-time limit.'],
    pairHint: 'Enter the relay\'s IP address from your router. It can also pair over Zigbee instead.',
  },
  {
    id: 'floor-actuator', category: 'heating', kind: 'info', icon: 'heater',
    name: 'Underfloor heating actuator', nameTr: 'Yerden Isıtma Aktüatörü',
    model: 'Rcon 230 V NC thermal actuator', protocol: 'Wired (via relay)', pairing: 'none', match: [],
    summary: 'Small head on each zone of the underfloor manifold that opens and closes that room\'s hot water. Normally closed: no power means closed.',
    setup: ['Remove the old cap on the manifold and fit the actuator.', 'Wire it to its smart relay.', 'Pair each zone with a room temperature sensor.'],
    note: 'It doesn\'t connect to Evra directly; it is controlled through the boiler/underfloor relay. Add the relay instead.',
  },
  {
    id: 'thermostat', category: 'heating', kind: 'climate', icon: 'thermostat',
    name: 'Smart wall thermostat', nameTr: 'Akıllı Duvar Termostatı',
    model: 'Sonoff Thermostat Core TP-WGZBA', protocol: 'Zigbee', pairing: 'zigbee', match: ['TP-WGZBA', 'Thermostat Core'],
    summary: 'Touch-screen wall thermostat for underfloor heating or a boiler, controllable from the wall and the phone, with weekly schedules and external sensor support.',
    setup: ['Power off; a qualified technician does this.', 'Mount it in place of the old thermostat or in a new box.', 'Pair it; connect an external sensor with Sonoff\'s Home Assistant blueprint.'],
    pairHint: 'Put it in pairing mode from its settings menu.',
  },

  // ---- climate -------------------------------------------------------------------
  {
    id: 'ir-kit', category: 'climate', kind: 'ir', icon: 'remote',
    name: 'AC and TV smart kit', nameTr: 'Klima ve TV Akıllandırma Kiti',
    model: 'IR transmitter (ESP32 / Pico W with ESPHome) · alt: Broadlink RM4 mini', protocol: 'Wi-Fi (ESPHome)', pairing: 'flow', integration: 'esphome', match: ['rpipicow', 'esp32', 'RM4'],
    summary: 'Small infrared transmitter that makes a remote-controlled AC and TV smart: switch on remotely, set the temperature, schedule them. Works with the existing devices.',
    setup: ['Place it where it can see the AC and TV, powered by USB.', 'Teach it the AC and TV remote codes.', 'Add it to the hub and pair it with the room temperature sensor.'],
    pairHint: 'ESPHome devices usually show up by themselves; otherwise enter the device\'s IP address.',
    note: 'The AC doesn\'t confirm commands; Evra follows it through the room temperature.',
  },
  {
    id: 'co2', category: 'climate', kind: 'co2', icon: 'air',
    name: 'Air quality (CO₂) sensor', nameTr: 'Hava Kalitesi (CO₂) Sensörü',
    model: 'Sonoff SAWF-08P', protocol: 'Wi-Fi (Matter)', pairing: 'matter', match: ['SAWF-08P'],
    summary: 'Measures carbon dioxide, temperature and humidity, and says when to air a room that has been closed for long. Improves sleep and work rooms.',
    setup: ['Put it on a shelf away from windows and doors, powered by USB.', 'Connect it to Wi-Fi and add it to the hub with Matter.', 'Set warning levels (for example 1,200 ppm).'],
    pairHint: 'Enter the Matter code printed on the sensor.',
  },

  // ---- energy and lighting -------------------------------------------------------------
  {
    id: 'plug', category: 'energy', kind: 'plug', icon: 'plug',
    name: 'Smart plug with energy meter', nameTr: 'Akıllı Priz (Enerji Ölçümlü)',
    model: 'TP-Link Tapo P110M', protocol: 'Wi-Fi (Matter)', pairing: 'flow', integration: 'tplink', match: ['P110', 'P115'],
    summary: 'Switches whatever is plugged into it on and off remotely and measures its power use. Ideal for a forgotten iron, heater or coffee machine.',
    setup: ['Plug it into a wall socket and the appliance into it.', 'Connect it to the home\'s 2.4 GHz Wi-Fi and add it to the hub.', 'Name it after what is plugged in (Iron, Heater, Coffee machine).'],
    pairHint: 'Turn on Third-Party Compatibility in the Tapo app first, then enter the plug\'s IP address and your TP-Link login.',
  },
  {
    id: 'bulb', category: 'energy', kind: 'light', icon: 'bulb',
    name: 'Smart colour bulb', nameTr: 'Akıllı Renkli Ampul',
    model: 'TP-Link Tapo L530E (E27)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'tplink', match: ['L530', 'L535', 'L510'],
    summary: 'Fits a normal E27 socket and gives 16 million colours and every shade of white: cool white in the morning, warm yellow in the evening, dimmable.',
    setup: ['Screw it into an existing E27 socket.', 'Connect it to Wi-Fi and add it to the hub.', 'The wall switch must stay on, or the bulb goes offline.'],
    pairHint: 'Turn on Third-Party Compatibility in the Tapo app first, then enter the bulb\'s IP address and your TP-Link login.',
  },
  {
    id: 'led-strip', category: 'energy', kind: 'light', icon: 'bulb',
    name: 'Smart LED strip', nameTr: 'Akıllı LED Şerit',
    model: 'TP-Link Tapo L900-5 (5 m)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'tplink', match: ['L900', 'L920', 'L930'],
    summary: 'Self-adhesive colour LED strip for behind the TV, under kitchen cabinets, the bedhead or ceiling edges. Changes the mood in one tap and gives a gentle night path light.',
    setup: ['Clean and dry the surface.', 'Stick the strip in place and plug in the adapter.', 'Connect it to Wi-Fi and add it to the hub.'],
    pairHint: 'Turn on Third-Party Compatibility in the Tapo app first, then enter the strip\'s IP address and your TP-Link login.',
  },
  {
    id: 'wall-switch', category: 'energy', kind: 'light', icon: 'wallswitch',
    name: 'Smart wall switch module', nameTr: 'Akıllı Duvar Anahtarı Modülü',
    model: 'Sonoff ZBMINIL2 (no neutral needed)', protocol: 'Zigbee', pairing: 'zigbee', match: ['ZBMINIL2', 'ZBMINI'],
    summary: 'Hides behind the existing wall switch. The switch stays the same, but the light now also works from the phone, by voice and automatically. Works in older buildings without neutral wires.',
    setup: ['Switch off the circuit breaker; a qualified technician does this.', 'Wire the module in the switch box, between the switch and the lamp.', 'Pair it and name which lamp it controls.'],
    pairHint: 'Press the module\'s button 5 times quickly, or hold it for 5 seconds.',
  },
  {
    id: 'zigbee-plug', category: 'energy', kind: 'plug', icon: 'plug',
    name: 'Zigbee smart plug (range booster)', nameTr: 'Zigbee Akıllı Priz (Ağ Güçlendirici)',
    model: 'Sonoff S60ZB', protocol: 'Zigbee', pairing: 'zigbee', match: ['S60ZB', 'S60ZBTPF'],
    summary: 'A normal smart plug with energy metering that also extends the Zigbee network, strengthening battery sensors in rooms far from the hub.',
    setup: ['Plug it in between the hub and the distant sensors.', 'Pair it with the hub.', 'Re-pair distant sensors if needed so they connect through it.'],
    pairHint: 'Hold the button for 5 seconds until the light blinks.',
  },
  {
    id: 'night-light', category: 'energy', kind: 'info', icon: 'moon',
    name: 'Motion night light', nameTr: 'Hareketli Gece Lambası',
    model: 'Xiaomi Mi Motion-Activated Night Light 2', protocol: 'Standalone', pairing: 'none', match: [],
    summary: 'Soft path light that switches on when someone gets up at night and off after 15 seconds, only in the dark. Reduces falls on the way to the bathroom.',
    setup: ['Fix it at knee height on the bed-to-bathroom path with the magnetic mount.', 'Insert the batteries.'],
    note: 'Works on its own with its own sensor; it doesn\'t connect to Evra.',
  },
  {
    id: 'energy-meter', category: 'energy', kind: 'plug', icon: 'bolt',
    name: 'Energy meter module', nameTr: 'Enerji Ölçer Modülü',
    // Not "MINI-ZB" on its own: that would also match the MINI-ZBRBS shutter module.
    model: 'Sonoff MINI-ZB1GP', protocol: 'Zigbee', pairing: 'zigbee', match: ['MINI-ZB1GP', 'ZB1GP'],
    summary: 'Measures and switches the power of a circuit or a hard-wired appliance such as a water heater or oven, showing how much it uses.',
    setup: ['Power off; a qualified technician does this.', 'Wire the module into the appliance\'s circuit.', 'Pair it with the hub.'],
    pairHint: 'Hold the module\'s button for 5 seconds until the light blinks.',
  },

  // ---- curtains and shutters ------------------------------------------------------------
  {
    id: 'blind-chain', category: 'covers', kind: 'cover', icon: 'blind', coverClass: 'blind',
    name: 'Roller blind motor (chain)', nameTr: 'Akıllı Stor Perde Motoru (Zincirli)',
    model: 'Zigbee chain motor (Zemismart / Tuya)', protocol: 'Zigbee', pairing: 'zigbee', match: ['Zemismart'],
    summary: 'Clips onto the chain of an existing roller blind and makes it smart without replacing it: opens slowly in the morning, closes at sunset.',
    setup: ['Fix the motor beside the window and thread the blind\'s chain over its gear.', 'Set the open and closed limits.', 'Pair it with the hub.'],
    pairHint: 'Hold the motor\'s button until it beeps or its light blinks.',
  },
  {
    id: 'blind-tube', category: 'covers', kind: 'cover', icon: 'blind', coverClass: 'shade',
    name: 'Tubular blind motor', nameTr: 'Akıllı Boru Motor (Stor/Zebra)',
    model: 'Zigbee tubular motor (Zemismart / Tuya)', protocol: 'Zigbee', pairing: 'zigbee', match: ['tubular'],
    summary: 'Quiet motor hidden inside the tube of a roller or zebra blind; the blind goes up and down by motor instead of by hand.',
    setup: ['Measure the blind\'s tube diameter and choose the matching motor.', 'Fit the motor inside the tube and wire it.', 'Set the limits and pair it with the hub.'],
    pairHint: 'Hold the motor\'s programming button until it jogs.',
  },
  {
    id: 'curtain', category: 'covers', kind: 'cover', icon: 'curtain', coverClass: 'curtain',
    name: 'Curtain track motor', nameTr: 'Akıllı Klasik Perde Motoru (Kornişli)',
    model: 'Şımart smart curtain motor (Wi-Fi)', protocol: 'Wi-Fi (cloud)', pairing: 'cloud', integration: 'tuya', match: ['curtain motor', 'curtain robot'],
    summary: 'Motorised track that opens and closes classic sheer and blackout curtains to both sides; also moves if pulled by hand.',
    setup: ['Measure the window and cut the track to length.', 'Mount the track, fit the motor and hang the curtains.', 'Connect it to Wi-Fi and add it to the hub.'],
    note: 'Connects through the maker\'s cloud; remote control doesn\'t work without internet.',
  },
  {
    id: 'shutter', category: 'covers', kind: 'cover', icon: 'shutter', coverClass: 'shutter',
    name: 'Electric shutter module', nameTr: 'Elektrikli Panjur Modülü',
    model: 'Sonoff MINI-ZBRBS', protocol: 'Zigbee', pairing: 'zigbee', match: ['ZBRBS'],
    summary: 'Fits behind an existing electric shutter\'s switch so shutters go up and down by phone, voice and automation, with position in percent. The wall switch keeps working.',
    setup: ['Switch off the circuit breaker; a qualified technician does this.', 'Wire it behind the shutter switch, between the motor and the switch.', 'Let the shutter run fully down and up once to calibrate, then pair it.'],
    pairHint: 'Hold the module\'s button for 5 seconds until the light blinks.',
  },

  // ---- garden ----------------------------------------------------------------------
  {
    id: 'irrigation', category: 'garden', kind: 'valve', icon: 'sprout',
    name: 'Smart irrigation valve', nameTr: 'Akıllı Sulama Vanası',
    model: 'Sonoff Hydro ONE Lite', protocol: 'Zigbee', pairing: 'zigbee', match: ['SWV', 'Hydro'],
    summary: 'Screws between the garden or balcony tap and the hose; waters on a schedule, skips rainy days and keeps going while you\'re on holiday.',
    setup: ['Screw the valve onto the tap and connect the hose.', 'Insert the batteries and pair it with the hub.', 'Enter watering times and durations.'],
    pairHint: 'Hold the button until the light blinks.',
  },

  // ---- network -----------------------------------------------------------------------
  {
    id: 'mesh', category: 'network', kind: 'info', icon: 'wifi',
    name: 'Mesh Wi-Fi system', nameTr: 'Mesh Wi-Fi Sistemi',
    model: 'TP-Link Deco E4 (3-pack)', protocol: 'Network', pairing: 'none', match: ['Deco'],
    summary: 'Three units that carry strong Wi-Fi to every corner with one network name, so smart plugs, bulbs and cameras don\'t drop out.',
    setup: ['Connect one unit to the modem with a cable.', 'Place the others in the middle and far parts of the home.', 'Smart devices keep connecting to the same network name.'],
    note: 'Part of the network, not a smart device; nothing to add here.',
  },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id) || null;

// Which catalogue product a Home Assistant device is, if any.
export function productForDevice(device) {
  if (!device) return null;
  if (device.product) return productById(device.product);
  const text = `${device.model || ''} ${device.manufacturer || ''} ${device.name || ''}`.toLowerCase();
  for (const p of PRODUCTS) {
    if (p.kind === 'hub' || p.kind === 'info') continue;
    if (p.match.some((m) => m && text.includes(m.toLowerCase()))) return p;
  }
  return null;
}

export const PAIRING_LABEL = {
  zigbee: 'Zigbee pairing',
  flow: 'Wi-Fi setup',
  matter: 'Matter code',
  cloud: 'Cloud account',
  none: 'No pairing needed',
};
