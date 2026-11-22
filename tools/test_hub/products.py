"""The Evra products the test hub can "pair", and the entities each one gets.

Model names match the `match` patterns in js/catalog.js, so the app recognises
them the same way it would recognise real devices in Home Assistant.
"""

# id, name, manufacturer, model, kind, how it joins, integration
PRODUCTS = [
    # Zigbee: join while pairing is open (zha.permit)
    ("motion", "Motion sensor", "SONOFF", "SNZB-03P", "motion", "zigbee", "zha"),
    ("climate-sensor", "Temperature and humidity sensor", "SONOFF", "SNZB-02D", "climate-sensor", "zigbee", "zha"),
    ("contact", "Door and window sensor", "SONOFF", "SNZB-04P", "contact", "zigbee", "zha"),
    ("presence", "Presence sensor", "SONOFF", "SNZB-06P", "presence", "zigbee", "zha"),
    ("smoke", "Smoke detector", "Aqara", "SD-S01D", "smoke", "zigbee", "zha"),
    ("sos", "Emergency button", "SONOFF", "SNZB-01P", "button", "zigbee", "zha"),
    ("gas", "Gas detector", "Nous", "Nous E9", "gas", "zigbee", "zha"),
    ("water-valve", "Main water valve", "Tuya", "Zigbee valve controller", "valve", "zigbee", "zha"),
    ("trv", "Radiator valve", "SONOFF", "TRVZB", "climate", "zigbee", "zha"),
    ("thermostat", "Wall thermostat", "SONOFF", "TP-WGZBA", "climate", "zigbee", "zha"),
    ("wall-switch", "Wall switch", "SONOFF", "ZBMINIL2", "light", "zigbee", "zha"),
    ("zigbee-plug", "Zigbee plug", "SONOFF", "S60ZBTPF", "plug", "zigbee", "zha"),
    ("energy-meter", "Energy meter", "SONOFF", "MINI-ZB1GP", "plug", "zigbee", "zha"),
    ("blind-chain", "Roller blind", "Zemismart", "Zemismart chain motor", "cover", "zigbee", "zha"),
    ("blind-tube", "Tubular blind", "Tuya", "TS0601 tubular motor", "cover", "zigbee", "zha"),
    ("shutter", "Shutter", "SONOFF", "MINI-ZBRBS", "cover", "zigbee", "zha"),
    ("irrigation", "Irrigation valve", "SONOFF", "SWV Hydro ONE", "valve", "zigbee", "zha"),
    # Wi-Fi: added with a setup form, by IP address
    ("plug", "Smart plug", "TP-Link", "P110M", "plug", "wifi", "tplink"),
    ("bulb", "Colour bulb", "TP-Link", "L530E", "light", "wifi", "tplink"),
    ("led-strip", "LED strip", "TP-Link", "L900-5", "light", "wifi", "tplink"),
    ("leak", "Water leak sensor", "Shelly", "Shelly Flood Gen4", "leak", "wifi", "shelly"),
    ("boiler-relay", "Boiler relay", "Shelly", "Shelly 1 Gen4", "relay", "wifi", "shelly"),
    ("ir-kit", "IR kit", "Espressif", "esp32 IR blaster", "ir", "wifi", "esphome"),
    ("camera-indoor", "Indoor camera", "TP-Link", "Tapo C210", "camera", "wifi", "onvif"),
    ("camera-outdoor", "Outdoor camera", "SONOFF", "CAM-B1P", "camera", "wifi", "onvif"),
    # Matter: added with the code printed on the device
    ("lock", "Door lock", "Aqara", "U200 Lite", "lock", "matter", "matter"),
    ("co2", "Air quality sensor", "SONOFF", "SAWF-08P", "co2", "matter", "matter"),
    # Cloud: added through the maker's account (Tuya)
    ("siren", "Indoor siren", "Fonri", "Wi-Fi siren", "siren", "cloud", "tuya"),
    ("curtain", "Curtain", "Tuya", "Wi-Fi curtain motor", "cover", "cloud", "tuya"),
]

BY_ID = {p[0]: p for p in PRODUCTS}

EFFECTS = ["Off", "Aurora", "Candy Cane", "Christmas", "Flicker", "Ocean", "Rainbow", "Raindrop", "Spring", "Sunrise", "Sunset", "Valentines"]


def _battery():
    return {"domain": "sensor", "suffix": "battery", "label": "Battery", "state": "100",
            "attrs": {"device_class": "battery", "unit_of_measurement": "%", "state_class": "measurement"}, "category": "diagnostic"}


def _temp(v):
    return {"domain": "sensor", "suffix": "temperature", "label": "Temperature", "state": v,
            "attrs": {"device_class": "temperature", "unit_of_measurement": "°C", "state_class": "measurement"}}


def _hum(v):
    return {"domain": "sensor", "suffix": "humidity", "label": "Humidity", "state": v,
            "attrs": {"device_class": "humidity", "unit_of_measurement": "%", "state_class": "measurement"}}


def templates(product_id):
    """The entities a newly paired product gets (same as the app's demo mode)."""
    kind = BY_ID[product_id][4]
    if kind == "motion":
        return [{"domain": "binary_sensor", "suffix": "occupancy", "label": "Occupancy", "state": "off", "attrs": {"device_class": "occupancy"}}, _battery()]
    if kind == "presence":
        return [{"domain": "binary_sensor", "suffix": "occupancy", "label": "Presence", "state": "off", "attrs": {"device_class": "occupancy"}}]
    if kind == "climate-sensor":
        return [_temp("21.4"), _hum("46"), _battery()]
    if kind == "contact":
        return [{"domain": "binary_sensor", "suffix": "opening", "label": "Opening", "state": "off", "attrs": {"device_class": "opening"}}, _battery()]
    if kind == "smoke":
        return [{"domain": "binary_sensor", "suffix": "smoke", "label": "Smoke", "state": "off", "attrs": {"device_class": "smoke"}}, _battery()]
    if kind == "gas":
        return [{"domain": "binary_sensor", "suffix": "gas", "label": "Gas", "state": "off", "attrs": {"device_class": "gas"}}]
    if kind == "leak":
        return [{"domain": "binary_sensor", "suffix": "water", "label": "Water leak", "state": "off", "attrs": {"device_class": "moisture"}}, _battery()]
    if kind == "button":
        return [{"domain": "event", "suffix": "press", "label": "Press", "state": "unknown",
                 "attrs": {"device_class": "button", "event_types": ["single", "double", "long"], "event_type": None}}, _battery()]
    if kind == "camera":
        out = [{"domain": "camera", "suffix": "", "label": "", "state": "idle", "attrs": {"motion_detection": True}},
               {"domain": "binary_sensor", "suffix": "motion", "label": "Motion", "state": "off", "attrs": {"device_class": "motion"}}]
        if product_id == "camera-indoor":
            out.append({"domain": "switch", "suffix": "privacy", "label": "Privacy mode", "state": "off", "attrs": {"icon": "mdi:eye-off"}})
        return out
    if kind == "valve":
        state = "closed" if product_id == "irrigation" else "open"
        return [{"domain": "valve", "suffix": "", "label": "", "state": state, "attrs": {"device_class": "water", "supported_features": 3}}]
    if kind == "siren":
        return [{"domain": "siren", "suffix": "", "label": "", "state": "off", "attrs": {}}]
    if kind == "lock":
        return [{"domain": "lock", "suffix": "", "label": "", "state": "locked", "attrs": {}}, _battery()]
    if kind == "climate":
        return [{"domain": "climate", "suffix": "", "label": "", "state": "heat",
                 "attrs": {"current_temperature": 20.5, "temperature": 21, "min_temp": 5, "max_temp": 30, "target_temp_step": 0.5,
                           "hvac_modes": ["off", "heat"], "hvac_action": "heating", "supported_features": 385}}]
    if kind == "relay":
        return [{"domain": "switch", "suffix": "", "label": "", "state": "off", "attrs": {}}]
    if kind == "ir":
        return [{"domain": "button", "suffix": s, "label": l, "state": "unknown", "attrs": {}}
                for s, l in [("ac_power", "AC power"), ("ac_temp_up", "AC temperature up"), ("ac_temp_down", "AC temperature down"),
                             ("tv_power", "TV power"), ("tv_volume_up", "TV volume up"), ("tv_volume_down", "TV volume down")]]
    if kind == "co2":
        return [{"domain": "sensor", "suffix": "co2", "label": "CO₂", "state": "640",
                 "attrs": {"device_class": "carbon_dioxide", "unit_of_measurement": "ppm", "state_class": "measurement"}}, _temp("22.1"), _hum("41")]
    if kind == "plug":
        return [{"domain": "switch", "suffix": "", "label": "", "state": "on", "attrs": {}},
                {"domain": "sensor", "suffix": "power", "label": "Power", "state": "12.0",
                 "attrs": {"device_class": "power", "unit_of_measurement": "W", "state_class": "measurement"}},
                {"domain": "sensor", "suffix": "energy_today", "label": "Energy today", "state": "0.050",
                 "attrs": {"device_class": "energy", "unit_of_measurement": "kWh", "state_class": "total_increasing"}}]
    if kind == "light":
        if product_id == "wall-switch":
            return [{"domain": "light", "suffix": "", "label": "", "state": "off", "attrs": {"supported_color_modes": ["onoff"], "color_mode": None}}]
        attrs = {"supported_color_modes": ["color_temp", "hs"], "color_mode": "color_temp", "brightness": 200, "color_temp_kelvin": 2700,
                 "hs_color": None, "min_color_temp_kelvin": 2500, "max_color_temp_kelvin": 6500, "supported_features": 4 if product_id == "led-strip" else 0}
        if product_id == "led-strip":
            attrs.update({"effect": "off", "effect_list": EFFECTS})
        return [{"domain": "light", "suffix": "", "label": "", "state": "on", "attrs": attrs}]
    if kind == "cover":
        cls = {"blind-chain": "blind", "blind-tube": "shade", "curtain": "curtain", "shutter": "shutter"}.get(product_id, "blind")
        return [{"domain": "cover", "suffix": "", "label": "", "state": "open", "attrs": {"current_position": 100, "device_class": cls, "supported_features": 15}}]
    return []
