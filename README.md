# Evra app

The Evra app, built on Home Assistant's API. Its colours come from the schemecolor.com palettes "Blue Silence" and "Pale Blue and Green" (listed at the top of `css/app.css`). Home Assistant keeps running the devices, Zigbee, the Pico and the automations; this app is what you look at and tap. It knows the whole Evra product range (34 products, from the November 2026 catalogue).

It's plain HTML, CSS and JavaScript with no build step, so there's nothing to install except Python for the local server.

## Run it on this PC

Double-click **`Start Evra.bat`**. It starts the local server in a small minimised window (close that window to stop it) and opens Evra in its own Edge or Chrome app window. If the server is already running it just opens the app. `"Start Evra.bat" 8020` uses another port.

By hand, from the `SMART` folder:

```bash
python appEVRA/tools/dev_server.py
```

Then open http://localhost:8010/appEVRA/. Port 8000 is left alone because your website project uses it. The server serves the whole `SMART` folder because demo mode reads `../ha-snapshot`, so a copy of this repository on its own has no demo data.

The app starts in **demo mode**: a pretend Home Assistant built from the snapshot in `../ha-snapshot`, taken on 13 November 2026. Everything works in demo mode: adding and removing any catalogue product, rooms, and automations, which actually run. Changes are kept in the browser; **Settings → Reset demo** goes back to the snapshot (Reset demo is under Demo controls, which only show in developer mode).

**Developer mode** (Settings → Preferences, off by default) shows the technical details: the Entities list on device pages, maker, model and firmware numbers, the JSON automation editor, the demo controls and the "pretend it fired" buttons on sensor tiles. Anything marked with the `dev-only` class is hidden while it's off. Automations the simple editor can't show (all five original ones) can only be edited in developer mode.

The sun/moon button in the header switches between light and dark; Settings → Appearance also has **Auto**, which follows the device.

## Screens

| Screen | What's on it |
|---|---|
| Home | Alerts for smoke, gas or water; the room's climate; quick actions; room chips; every device as a tile with its own controls |
| Devices | All devices by room, the Rooms tab (create, rename, delete), device details (rename, move, remove) and **Add device** |
| Scenes | Morning, Afternoon, Night, Sleep, Eco, Party, Movie, Entertainment, Music and Dinner. Each has room chips (All rooms or any mix) and a "What it does" list of the exact changes; only devices in the chosen rooms change. Plugs are never touched |
| Automations | **My automations**: every automation with on/off, Run now, Edit and Delete, plus **New automation**. **Ideas**: about 40 automations the Evra range can do; ones your devices can already do open the editor filled in, the rest are faded with dashed chips for the missing products (tap one to see the product) |
| Assistant | Empty placeholder for the Evra assistant chat |
| Settings | Connection (demo or live), appearance (light, dark, auto), developer mode, electricity price, batteries, demo controls (developer mode), shortcuts to Energy, Remotes and Rooms |
| Energy, Remotes | Power, temperature and activity charts; the full TV and heater remotes, one at a time: swipe sideways or use the tabs and arrows. In the side bar on wide screens, and linked from Settings on phones |

## The Evra range

`js/catalog.js` lists every product: what it is, its model, how it pairs, its installation steps, and which kind of tile it gets. Devices already in Home Assistant are recognised by their model name.

| Tile kind | Products |
|---|---|
| Light (brightness, colours, effects) | Colour bulb, LED strip, wall switch module |
| Plug (switch, live watts, energy, 3-hour graph) | Smart plug, Zigbee plug, energy meter |
| Cover (open, stop, close, position) | Chain blind, tubular blind, curtain track, shutter module |
| Climate (room temperature, target, on/off) | Radiator valve, wall thermostat |
| Lock, valve, siren, relay | Door lock, main water valve, irrigation valve, siren, boiler relay |
| Camera (picture, motion, privacy) | Indoor and outdoor camera |
| Alarm (turns red, safety advice) | Smoke, gas and water leak detectors |
| Sensors | Motion, presence, door/window, temperature, CO₂, emergency button |
| IR kit | Your Pico (TV and heater), or any other kit's learned buttons |
| Information only | Hub, wall panel, underfloor actuator, night light, mesh Wi-Fi |

## Adding a device

Devices → **Add device** → pick the product. Its page shows the installation steps and the right way to connect it:

| Pairing | What happens |
|---|---|
| Zigbee | Opens the hub's Zigbee network for about 4 minutes and waits for the new device |
| Wi-Fi setup | Runs Home Assistant's own setup form for that brand (Tapo, Shelly, ESPHome, ONVIF cameras) |
| Matter | Asks for the 11-digit Matter code |
| Cloud | Explains linking the maker's account (Tuya / Smart Life) in Home Assistant |
| None | Explains why (for example, the night light works on its own) |

When it connects, you name it and choose its room.

## Automations

**New automation** opens a simple editor:

- **When:** a device changes, a value goes above or below a number (both optionally "for at least N minutes"), a time of day, or sunrise/sunset.
- **Only if** (optional): a time window and days, a device being in a state, whether it's dark (the sun), or the weather.
- **Then:** control a device (lights with brightness and colour, blinds with position, thermostat with temperature), press a remote button, wait, or send a notification.

**Edit as JSON** shows the full Home Assistant configuration for anything more advanced. Automations the simple editor can't show, like your presence automation with its choices and scenes, open as JSON automatically.

**Ideas** (`js/ideas.js`) are written once and filled in with whatever devices the home has. Each idea lists the kinds of device it needs, such as a motion sensor and a light; `CAPS` says which catalogue products count for each kind. When the needs are met, "Set it up" opens the simple editor with the home's own devices, preferring ones in the same room. Notifications go to Home Assistant's notification list; safety alerts (smoke, gas, leak, emergency button) also go to phones with the Home Assistant app.

**Scenes** (`js/scenes.js`) list what lights, the TV and heater (through the IR kit's power trackers), radiator valves, blinds and the lock should do. Room choices are kept on each device (in the browser), not in Home Assistant.

## Where things live

| File | Purpose |
|---|---|
| `js/catalog.js` | The Evra range: products, categories, pairing methods, installation steps |
| `js/config.js` | This home's specifics: the heater/TV IR codes and trackers, colour presets, quick actions |
| `js/store.js` | States, devices, rooms and entities; helpers used by every screen |
| `js/ideas.js` | Automation ideas, what each needs, and how each is built from the home's devices |
| `js/scenes.js` | The ten scenes and how they're applied to the chosen rooms |
| `Start Evra.bat` | Starts the local server and opens the app |
| `js/devices/cards.js` | The device tiles, one builder per kind |
| `js/backends/demo.js` | The demo Home Assistant, including a small automation engine |
| `js/backends/live.js` | The real connection: WebSocket API, login, pairing, rooms, automations |
| `js/views/*.js` | One file per screen; `automation-editor.js` is the editor |
| `css/app.css` | All styling, light and dark themes |

## Live mode (when the Pi is back)

None of live mode has been tested against the real Home Assistant yet, because the Pi has been offline since everything was built. That includes connecting, pairing, room changes, removing devices and saving automations. The demo mode follows the same calls, but expect to fix small things on first contact.

**Easiest: run the app from the Pi itself.** Copy the contents of the `app` folder into `/config/www/smart-home/` on the Pi (with the Samba share or File editor app), then open `http://homeassistant.local/local/smart-home/`. Served from there, the app starts in live mode and uses Home Assistant's own login page. Files in `/config/www` can be opened by anyone on your network without logging in; the app's files contain no passwords or keys, and all data still needs your login.

**From this PC while developing:** choose Live in Settings. Home Assistant blocks sign-in from other addresses by default, so first add this to Home Assistant's `configuration.yaml` and restart it:

```yaml
http:
  cors_allowed_origins:
    - http://localhost:8010
```

Notes for live mode:

- **Door lock:** the Aqara lock uses Thread and needs a second, Thread dongle on the hub.
- **Siren and curtain motor:** the Fonri siren and Şımart curtain motor are cloud devices; link their maker's account in Home Assistant first.
- **Removing devices:** Zigbee devices are removed from the Zigbee network. Wi-Fi devices are removed from their integration.

## Put it on your phone

Open the app's address in the phone's browser and use **Add to Home Screen**. It then opens full screen with its own icon. Offline caching and a full app install need a secure `https://` address, for example through Tailscale; on plain `http://` it still works as a home-screen shortcut.

The wall panel can open the same address; the layout has a compact mode for its 480×480 screen.

## Icons

`icons/icon.svg` is the master. To redraw the PNG versions after changing the design:

```bash
python app/tools/make_icons.py
```
