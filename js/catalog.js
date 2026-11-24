// The Evra product range (the 39 products of the "Evra Ürün Kataloğu", November 2026),
// so the app knows how to show, control and pair every product.
//
// The catalogue's own texts (Turkish name, category, introduction, features, installation
// steps, how it works, examples, problems and solutions, Evra's sample message) are in
// js/catalog-details.js, made by tools/import_catalogue.py from the PDF, and merged in at
// the end of this file. What's here is what the app needs on top: kind, pairing, model
// names, and the pairing hint and notes.
//
// kind     decides which controls a device card gets (see js/devices/cards.js)
// pairing  decides how "Add device" connects it:
//            zigbee   pair through the Zigbee dongle on the hub
//            flow     a Home Assistant setup form (integration = handler name)
//            matter   enter the Matter pairing code
//            cloud    added through the maker's cloud integration in Home Assistant
//            none     nothing to pair (works on its own, or is part of the hub)
// match    model names used to recognise devices already in Home Assistant

import { DETAILS } from './catalog-details.js';

export const CATEGORIES = [
  { id: 'hub', name: 'Merkez ve ekran' },
  { id: 'sensors', name: 'Sensörler' },
  { id: 'security', name: 'Güvenlik' },
  { id: 'heating', name: 'Isıtma' },
  { id: 'climate', name: 'İklim' },
  { id: 'energy', name: 'Enerji ve aydınlatma' },
  { id: 'covers', name: 'Perde ve panjur' },
  { id: 'appliances', name: 'Ev aletleri' },
  { id: 'pets', name: 'Evcil hayvan' },
  { id: 'garden', name: 'Bahçe ve balkon' },
  { id: 'network', name: 'Ağ' },
];

export const PRODUCTS = [
  // ---- hub and display -----------------------------------------------------
  {
    id: 'hub', category: 'hub', kind: 'hub', icon: 'cpu',
    name: 'Evra Merkez Ünitesi', nameEn: 'Evra Hub',
    model: 'Raspberry Pi 4 (4 GB) · Sonoff Zigbee 3.0 USB · 240 GB SSD · pasif soğutmalı kasa', protocol: 'Ethernet',
    pairing: 'none', match: ['Raspberry Pi'],
    note: 'Uygulamanın konuştuğu merkez budur; eklenmesi gerekmez.',
  },
  {
    id: 'panel', category: 'hub', kind: 'info', icon: 'tablet',
    name: 'Duvar Kontrol Ekranı', nameEn: 'Wall control panel',
    model: 'Sonoff NSPanel Pro (120)', protocol: 'Wi-Fi',
    pairing: 'none', match: ['NSPanel'],
    note: 'Panelin tarayıcısında bu uygulamanın adresini açın; eşleştirilecek bir şey yok.',
  },

  // ---- sensors ---------------------------------------------------------------
  {
    id: 'motion', category: 'sensors', kind: 'motion', icon: 'person',
    name: 'Hareket Sensörü', nameEn: 'Motion sensor',
    model: 'Sonoff SNZB-03P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-03P', 'SNZB-03'],
    pairHint: 'Sensörün düğmesine ışığı yanıp sönene kadar 5 saniye basılı tutun.',
  },
  {
    id: 'climate-sensor', category: 'sensors', kind: 'climate-sensor', icon: 'thermometer',
    name: 'Sıcaklık ve Nem Sensörü', nameEn: 'Temperature and humidity sensor',
    model: 'Sonoff SNZB-02D (ekranlı)', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-02D', 'SNZB-02'],
    pairHint: 'Arkadaki düğmeye sinyal simgesi yanıp sönene kadar 5–7 saniye basılı tutun.',
  },
  {
    id: 'contact', category: 'sensors', kind: 'contact', icon: 'door',
    name: 'Kapı ve Pencere Sensörü', nameEn: 'Door and window sensor',
    model: 'Sonoff SNZB-04P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-04P', 'SNZB-04'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar 5 saniye basılı tutun; gömme düğme için kutudaki iğne gerekebilir.',
  },
  {
    id: 'presence', category: 'sensors', kind: 'presence', icon: 'radar',
    name: 'Varlık Sensörü (Radar)', nameEn: 'Presence sensor (radar)',
    model: 'Sonoff SNZB-06P (mmWave)', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-06P'],
    pairHint: 'Elektriğe bağlayın, sonra düğmesine ışığı yanıp sönene kadar 5 saniye basılı tutun.',
  },

  // ---- safety and security -----------------------------------------------------
  {
    id: 'smoke', category: 'security', kind: 'smoke', icon: 'smoke',
    name: 'Akıllı Duman Dedektörü', nameEn: 'Smart smoke detector',
    model: 'Aqara SD-S01D', protocol: 'Zigbee', pairing: 'zigbee', match: ['SD-S01D', 'JY-GZ-01AQ'],
    pairHint: 'Düğmeye ışığı mavi yanıp sönene kadar basılı tutun.',
    emergency: 'Yalnızca uyarır; itfaiyeyi aramaz. Acil durumda 112\'yi arayın.',
  },
  {
    id: 'leak', category: 'security', kind: 'leak', icon: 'droplet',
    name: 'Su Basma Sensörü', nameEn: 'Water leak sensor',
    model: 'Shelly Flood Gen4', protocol: 'Wi-Fi / Zigbee', pairing: 'flow', integration: 'shelly', match: ['Flood', 'S4SN-0071A'],
    pairHint: 'Modemden sensörün IP adresini girin. İsterseniz Zigbee ile de eşleşebilir.',
  },
  {
    id: 'sos', category: 'security', kind: 'button', icon: 'sos',
    name: 'Acil Yardım Butonu', nameEn: 'Emergency button',
    model: 'Sonoff SNZB-01P', protocol: 'Zigbee', pairing: 'zigbee', match: ['SNZB-01P', 'SNZB-01'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar 5 saniye basılı tutun.',
    emergency: 'Yalnızca aileyi uyarır; acil durumda 112\'yi arayın.',
  },
  {
    id: 'camera-indoor', category: 'security', kind: 'camera', icon: 'camera',
    name: 'İç Mekan Kamerası', nameEn: 'Indoor camera',
    model: 'TP-Link Tapo C210 (2K, 360°)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'onvif', match: ['C210', 'Tapo C'],
    pairHint: 'Kameranın IP adresini ve Tapo uygulamasında oluşturulan kamera hesabını girin.',
  },
  {
    id: 'gas', category: 'security', kind: 'gas', icon: 'alert',
    name: 'Doğalgaz Kaçak Dedektörü', nameEn: 'Natural gas leak detector',
    model: 'Nous E9', protocol: 'Zigbee', pairing: 'zigbee', match: ['Nous E9', 'gas detector'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar basılı tutun.',
    emergency: 'Gaz kaçağında: ateş yakmayın, elektrik düğmelerine dokunmayın, pencereleri açın ve 187\'yi arayın.',
  },
  {
    id: 'water-valve', category: 'security', kind: 'valve', icon: 'valve',
    name: 'Akıllı Ana Su Vanası Kolu', nameEn: 'Main water valve controller',
    model: 'Zigbee vana motoru (ana vanaya takılır)', protocol: 'Zigbee', pairing: 'zigbee', match: ['valve controller', 'water valve', 'valve actuator'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar basılı tutun.',
  },
  {
    id: 'siren', category: 'security', kind: 'siren', icon: 'siren',
    name: 'İç Ortam Sireni', nameEn: 'Indoor siren',
    model: 'Fonri Wi-Fi siren', protocol: 'Wi-Fi (bulut)', pairing: 'cloud', integration: 'tuya', match: ['siren'],
    note: 'Üreticinin bulutu üzerinden bağlanır; internet kesintisinde gecikebilir.',
  },
  {
    id: 'camera-outdoor', category: 'security', kind: 'camera', icon: 'camera',
    name: 'Dış Mekan Kamerası', nameEn: 'Outdoor camera',
    model: 'Sonoff CAM-B1P', protocol: 'Wi-Fi', pairing: 'flow', integration: 'onvif', match: ['CAM-B1P', 'CAM-B1'],
    pairHint: 'Kameranın IP adresini, ONVIF kullanıcı adını ve şifresini girin.',
  },
  {
    id: 'lock', category: 'security', kind: 'lock', icon: 'lock',
    name: 'Akıllı Kapı Kilidi', nameEn: 'Smart door lock',
    model: 'Aqara U200 Lite', protocol: 'Thread / Matter', pairing: 'matter', match: ['U200'],
    pairHint: 'Kilidin üstündeki ya da kılavuzundaki 11 haneli Matter kodunu girin.',
  },

  // ---- heating -----------------------------------------------------------------
  {
    id: 'trv', category: 'heating', kind: 'climate', icon: 'heater',
    name: 'Akıllı Radyatör Vanası', nameEn: 'Smart radiator valve',
    model: 'Sonoff TRVZB', protocol: 'Zigbee', pairing: 'zigbee', match: ['TRVZB'],
    pairHint: 'Önce manuel moda alın (orta düğmeye kısa basın), sonra eşleşene kadar düğmeye basılı tutun.',
  },
  {
    id: 'boiler-relay', category: 'heating', kind: 'relay', icon: 'toggle',
    name: 'Kombi ve Yerden Isıtma Rölesi', nameEn: 'Boiler and underfloor heating relay',
    model: 'Shelly 1 Gen4', protocol: 'Wi-Fi / Zigbee', pairing: 'flow', integration: 'shelly', match: ['Shelly 1', 'S4SW-001'],
    pairHint: 'Modemden rölenin IP adresini girin. İsterseniz Zigbee ile de eşleşebilir.',
  },
  {
    id: 'floor-actuator', category: 'heating', kind: 'info', icon: 'heater',
    name: 'Yerden Isıtma Aktüatörü', nameEn: 'Underfloor heating actuator',
    model: 'Rcon 230 V NC thermal actuator', protocol: 'Kablolu (röle üzerinden)', pairing: 'none', match: [],
    note: 'Evra\'ya doğrudan bağlanmaz; kombi/yerden ısıtma rölesi üzerinden kontrol edilir. Onun yerine röleyi ekleyin.',
  },
  {
    id: 'thermostat', category: 'heating', kind: 'climate', icon: 'thermostat',
    name: 'Akıllı Duvar Termostatı', nameEn: 'Smart wall thermostat',
    model: 'Sonoff Thermostat Core TP-WGZBA', protocol: 'Zigbee', pairing: 'zigbee', match: ['TP-WGZBA', 'Thermostat Core'],
    pairHint: 'Ayarlar menüsünden eşleştirme moduna alın.',
  },

  // ---- climate -------------------------------------------------------------------
  {
    id: 'co2', category: 'climate', kind: 'co2', icon: 'air',
    name: 'Hava Kalitesi (CO₂) Sensörü', nameEn: 'Air quality (CO₂) sensor',
    model: 'Sonoff SAWF-08P', protocol: 'Wi-Fi (Matter)', pairing: 'matter', match: ['SAWF-08P'],
    pairHint: 'Sensörün üstünde yazan Matter kodunu girin.',
  },

  // ---- energy and lighting -------------------------------------------------------------
  {
    id: 'plug', category: 'energy', kind: 'plug', icon: 'plug',
    name: 'Akıllı Priz (Enerji Ölçümlü)', nameEn: 'Smart plug with energy meter',
    model: 'TP-Link Tapo P110M', protocol: 'Wi-Fi (Matter)', pairing: 'flow', integration: 'tplink', match: ['P110', 'P115'],
    pairHint: 'Önce Tapo uygulamasında Üçüncü Taraf Uyumluluğu\'nu açın, sonra prizin IP adresini ve TP-Link girişinizi girin.',
  },
  {
    id: 'bulb', category: 'energy', kind: 'light', icon: 'bulb',
    name: 'Akıllı Renkli Ampul', nameEn: 'Smart colour bulb',
    model: 'TP-Link Tapo L530E (E27)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'tplink', match: ['L530', 'L535', 'L510'],
    pairHint: 'Önce Tapo uygulamasında Üçüncü Taraf Uyumluluğu\'nu açın, sonra ampulün IP adresini ve TP-Link girişinizi girin.',
  },
  {
    id: 'led-strip', category: 'energy', kind: 'light', icon: 'bulb',
    name: 'Akıllı LED Şerit', nameEn: 'Smart LED strip',
    model: 'TP-Link Tapo L900-5 (5 m)', protocol: 'Wi-Fi', pairing: 'flow', integration: 'tplink', match: ['L900', 'L920', 'L930'],
    pairHint: 'Önce Tapo uygulamasında Üçüncü Taraf Uyumluluğu\'nu açın, sonra şeridin IP adresini ve TP-Link girişinizi girin.',
  },
  {
    id: 'wall-switch', category: 'energy', kind: 'light', icon: 'wallswitch',
    name: 'Akıllı Duvar Anahtarı Modülü', nameEn: 'Smart wall switch module',
    model: 'Sonoff ZBMINIL2 (nötr hat gerekmez)', protocol: 'Zigbee', pairing: 'zigbee', match: ['ZBMINIL2', 'ZBMINI'],
    pairHint: 'Modülün düğmesine hızlıca 5 kez basın ya da 5 saniye basılı tutun.',
  },
  {
    id: 'zigbee-plug', category: 'energy', kind: 'plug', icon: 'plug',
    name: 'Zigbee Akıllı Priz (Ağ Güçlendirici)', nameEn: 'Zigbee smart plug (range booster)',
    model: 'Sonoff S60ZB', protocol: 'Zigbee', pairing: 'zigbee', match: ['S60ZB', 'S60ZBTPF'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar 5 saniye basılı tutun.',
  },
  {
    id: 'energy-meter', category: 'energy', kind: 'plug', icon: 'bolt',
    name: 'Enerji Ölçer Modülü', nameEn: 'Energy meter module',
    // Not "MINI-ZB" on its own: that would also match the MINI-ZBRBS shutter module.
    model: 'Sonoff MINI-ZB1GP', protocol: 'Zigbee', pairing: 'zigbee', match: ['MINI-ZB1GP', 'ZB1GP'],
    pairHint: 'Modülün düğmesine ışığı yanıp sönene kadar 5 saniye basılı tutun.',
  },

  // ---- curtains and shutters ------------------------------------------------------------
  {
    id: 'blind-chain', category: 'covers', kind: 'cover', icon: 'blind', coverClass: 'blind',
    name: 'Akıllı Stor Perde Motoru (Zincirli)', nameEn: 'Roller blind motor (chain)',
    model: 'Zigbee zincirli motor (Zemismart / Tuya)', protocol: 'Zigbee', pairing: 'zigbee', match: ['Zemismart'],
    pairHint: 'Motorun düğmesine bip sesi gelene ya da ışığı yanıp sönene kadar basılı tutun.',
  },
  {
    id: 'blind-tube', category: 'covers', kind: 'cover', icon: 'blind', coverClass: 'shade',
    name: 'Akıllı Boru Motor (Stor/Zebra)', nameEn: 'Tubular blind motor',
    model: 'Zigbee boru motor (Zemismart / Tuya)', protocol: 'Zigbee', pairing: 'zigbee', match: ['tubular'],
    pairHint: 'Motorun programlama düğmesine motor kısaca hareket edene kadar basılı tutun.',
  },
  {
    id: 'curtain', category: 'covers', kind: 'cover', icon: 'curtain', coverClass: 'curtain',
    name: 'Akıllı Klasik Perde Motoru (Kornişli)', nameEn: 'Curtain track motor',
    model: 'Şımart akıllı perde motoru (Wi-Fi)', protocol: 'Wi-Fi (bulut)', pairing: 'cloud', integration: 'tuya', match: ['curtain motor', 'curtain robot'],
    note: 'Üreticinin bulutu üzerinden bağlanır; internet olmadan uzaktan kontrol çalışmaz.',
  },
  {
    id: 'shutter', category: 'covers', kind: 'cover', icon: 'shutter', coverClass: 'shutter',
    name: 'Elektrikli Panjur Modülü', nameEn: 'Electric shutter module',
    model: 'Sonoff MINI-ZBRBS', protocol: 'Zigbee', pairing: 'zigbee', match: ['ZBRBS'],
    pairHint: 'Modülün düğmesine ışığı yanıp sönene kadar 5 saniye basılı tutun.',
  },

  // ---- garden ----------------------------------------------------------------------
  {
    id: 'irrigation', category: 'garden', kind: 'valve', icon: 'sprout',
    name: 'Akıllı Sulama Vanası', nameEn: 'Smart irrigation valve',
    model: 'Sonoff Hydro ONE Lite', protocol: 'Zigbee', pairing: 'zigbee', match: ['SWV', 'Hydro'],
    pairHint: 'Düğmeye ışığı yanıp sönene kadar basılı tutun.',
  },

  // ---- network -----------------------------------------------------------------------
  {
    id: 'mesh', category: 'network', kind: 'info', icon: 'wifi',
    name: 'Mesh Wi-Fi Sistemi', nameEn: 'Mesh Wi-Fi system',
    model: 'TP-Link Deco E4 (3-pack)', protocol: 'Ağ', pairing: 'none', match: ['Deco'],
    note: 'Ağın bir parçasıdır, akıllı cihaz değildir; burada eklenecek bir şey yok.',
  },
  // ---- home appliances (on the website since 22 Nov 2026) ----------------------------
  {
    id: 'ir-remote', category: 'climate', kind: 'ir', icon: 'remote',
    name: 'Kızılötesi Kumanda Alıcısı (TV ve Klima)', nameEn: 'IR remote receiver (TV and AC)',
    model: 'Athom RF433 IR Remote (ESPHome) · alternatif: Broadlink RM4 mini, ESP32 / Pico W IR kiti', protocol: 'Wi-Fi (ESPHome)', pairing: 'flow', integration: 'esphome', match: ['Athom', 'RF433', 'rpipicow', 'esp32', 'RM4'],
    pairHint: 'ESPHome cihazları genellikle kendiliğinden görünür; görünmezse cihazın IP adresini girin.',
  },
  {
    id: 'robot-vacuum', category: 'appliances', kind: 'vacuum', icon: 'vacuum',
    name: 'Robot Süpürge (Paspaslı)', nameEn: 'Robot vacuum (with mop)',
    model: 'Dreame L10s Pro Gen 2', protocol: 'Wi-Fi (bulut)', pairing: 'cloud', integration: 'xiaomi_miio', match: ['L10s', 'Dreame'],
    pairHint: 'Kurulum formunda Xiaomi ya da Dreame hesabınızı bağlayın; süpürge oradan görünür.',
    note: 'Üreticinin bulutu üzerinden bağlanır; internet kesintisinde gecikebilir.',
  },
  {
    id: 'air-purifier', category: 'appliances', kind: 'fan', icon: 'air',
    name: 'Akıllı Hava Temizleyici', nameEn: 'Smart air purifier',
    model: 'Xiaomi Smart Air Purifier 4 Compact', protocol: 'Wi-Fi', pairing: 'cloud', integration: 'xiaomi_miio', match: ['Air Purifier 4', 'zhimi.airp'],
    pairHint: 'Kurulum formunda Xiaomi hesabınızı bağlayın; hava temizleyici oradan görünür.',
    note: 'Filtre yılda bir kez değişir; kartında ne kadar ömrü kaldığı görünür.',
  },
  {
    id: 'pet-feeder', category: 'appliances', kind: 'feeder', icon: 'paw',
    name: 'Otomatik Mama Makinesi', nameEn: 'Automatic pet feeder',
    model: 'Xiaomi Smart Pet Food Feeder 2', protocol: 'Wi-Fi', pairing: 'cloud', integration: 'xiaomi_miio', match: ['Pet Food Feeder'],
    pairHint: 'Kurulum formunda Xiaomi hesabınızı bağlayın; mama makinesi oradan görünür.',
  },
  {
    id: 'cat-litter', category: 'appliances', kind: 'litter', icon: 'litter',
    name: 'Otomatik Kedi Tuvaleti', nameEn: 'Self-cleaning litter box',
    model: 'Petkit Pura Max 2', protocol: 'Wi-Fi (bulut)', pairing: 'cloud', integration: 'petkit', match: ['Pura Max', 'Petkit'],
    pairHint: 'Home Assistant\'ta Petkit entegrasyonu gerekir; ardından kurulum formunda Petkit hesabınızı bağlayın.',
    note: 'Petkit\'in bulutu üzerinden bağlanır.',
  },
  {
    id: 'smart-kettle', category: 'appliances', kind: 'kettle', icon: 'kettle',
    name: 'Akıllı Su Isıtıcı', nameEn: 'Smart kettle',
    model: 'Xiaomi Smart Kettle 2 Pro', protocol: 'Bluetooth (Bluetooth köprüsü üzerinden)', pairing: 'flow', integration: 'xiaomi_ble', match: ['Kettle 2 Pro', 'Smart Kettle'],
    pairHint: 'Yakında bir Bluetooth köprüsü gerekir (Klima ve TV Kumandası köprü olarak çalışır). Kettle tabanındayken kendiliğinden görünür.',
  },
  {
    id: 'smart-fan', category: 'appliances', kind: 'fan', icon: 'fan',
    name: 'Akıllı Ayaklı Vantilatör', nameEn: 'Smart standing fan',
    model: 'Xiaomi Smart Standing Fan 2', protocol: 'Wi-Fi', pairing: 'cloud', integration: 'xiaomi_miio', match: ['Standing Fan 2', 'Smart Standing Fan'],
    pairHint: 'Kurulum formunda Xiaomi hesabınızı bağlayın; vantilatör oradan görünür.',
  },
];

// The catalogue's texts, merged into each product (see js/catalog-details.js).
for (const p of PRODUCTS) {
  const d = DETAILS[p.id];
  if (!d) continue;
  Object.assign(p, {
    name: d.name, category: d.category || p.category, catalogueModel: d.catalogueModel,
    summary: d.summary, features: d.features, setup: d.setup, howItWorks: d.howItWorks,
    examples: d.examples, troubleshooting: d.troubleshooting, evraSays: d.evraSays,
  });
}

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
  zigbee: 'Zigbee eşleştirme',
  flow: 'Wi-Fi kurulumu',
  matter: 'Matter kodu',
  cloud: 'Bulut hesabı',
  none: 'Eşleştirme gerekmez',
};
