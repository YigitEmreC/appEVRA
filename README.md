# Evra app

The Evra app, built on Home Assistant's API. Its colours come from the schemecolor.com palettes "Blue Silence" and "Pale Blue and Green" (listed at the top of `css/app.css`). Home Assistant keeps running the devices, Zigbee, the Pico and the automations; this app is what you look at and tap. It knows the whole Evra product range: the 39 products of the newest product catalogue (`Evra_Urun_Katalogu Son.pdf`), including the home appliances (robot vacuum, air purifier, pet feeder, self-cleaning litter box, smart kettle, standing fan) and the AC and TV remote (IR + RF433). Each product page shows the catalogue's introduction, features, how it works, Evra's tip, questions to ask Evra, the installation steps, and its problems and solutions.

**The whole app is in Turkish**: screens, messages, scenes, automation ideas and the assistant.

It's plain HTML, CSS and JavaScript with no build step, so there's nothing to install except Python for the local server.

## Run it on this PC

Double-click **`Start Evra.bat`**. It starts the local server in a small minimised window (close that window to stop it) and opens Evra in its own Edge or Chrome app window. If the server is already running it just opens the app. `"Start Evra.bat" 8020` uses another port. It also starts, each in its own minimised window and only if it isn't running yet: the accounts stand-in, the **test hub** (a pretend Home Assistant on http://localhost:8123, for live mode without the Pi) and the assistant. To skip the test hub, run `set EVRA_NO_HUB=1` first.

By hand, from the `SMART` folder:

```bash
python appEVRA/tools/dev_server.py
```

Then open http://localhost:8010/appEVRA/. Port 8000 is left alone because your website project uses it. The server serves the whole `SMART` folder because demo mode reads `../ha-snapshot`, so a copy of this repository on its own has no demo data.

### On your phone

1. Close the Evra windows if it's already running, then double-click **`Start Evra on phone.bat`**.
2. Its window shows the address to open on your phone, for example `http://192.168.88.122:8010/appEVRA/`.
3. Your phone must be on the same Wi-Fi as this computer.

**The first time:** Windows asks whether Python may use the network. Tick **Private networks** and press **Allow**, or the phone can't connect.

**What works:**
- The app on the phone works like on this computer: demo mode, the Assistant tab, and signing in with your evrasmarthome.com account.
- The phone gets only the app and the demo data. Everything else in `SMART` stays on this computer: the assistant's `.env` with the Gemini key, account and test hub data, and `.git`.
- Read aloud uses the phone's own voices.

**Limits:**
- The phone opens the app over plain `http`, so it can't be installed as an app from there.
- Live mode on the phone needs Home Assistant to allow the phone's address.

For the phone view without a phone, open the app in Edge or Brave, press **F12** and then **Ctrl+Shift+M**, and pick a phone.

The app starts in **demo mode**: a pretend Home Assistant built from the snapshot in `../ha-snapshot`, taken on 13 November 2026. Everything works in demo mode: adding and removing any catalogue product, rooms, and automations, which actually run. Changes are kept in the browser; **Settings → Reset demo** goes back to the snapshot (Reset demo is under Demo controls, which only show in developer mode).

**Developer mode** (Settings → Preferences, off by default) shows the technical details: the Entities list on device pages, maker, model and firmware numbers, the JSON automation editor, the demo controls and the "pretend it fired" buttons on sensor tiles. Anything marked with the `dev-only` class is hidden while it's off. Automations the simple editor can't show (all five original ones) can only be edited in developer mode.

The sun/moon button in the header switches between light and dark; Settings → Appearance also has **Auto**, which follows the device.

## Customize

The colourful **palette button** at the top right opens **Customize**. So does Settings → **Look and layout**, which also has a theme picker you can swipe through and shortcuts to each part. Every change shows straight away.

At the top of Customize is **Move things on the screen**. Tap it and the panel closes so you can rearrange Home (and the tabs, top bar and Scenes). While moving, the top right shows **Customize** (back to the panel) and **Done**; Escape also goes back to the panel. Everything that can move gets a dashed outline:

- **Drag it** to a new place. Small things (buttons, chips, readings, tabs, top-bar items) are dragged by themselves. Big things (Home's sections, device tiles, scenes) can be dragged anywhere on them with a mouse, or by press-and-hold with a finger, so a normal swipe still scrolls the page. They also have a handle.
- **Tap its eye** to hide it. Hidden things stay on screen, faded, until you tap **Done**, so you can bring them back.
- **Home's sections** also have a **↔** button for half width: two half-width sections sit side by side on big screens. Room climate and Quick actions start that way.
- **Tiles** can also be made wide or small.
- **With a keyboard or touchpad:** Tab to a movable thing, then use the arrow keys to move it and **H** to hide or show it. On touch screens and small screens, the handles and eyes are bigger.

What can be moved and hidden: Home's sections, the quick action buttons, the climate card's readings and chips (including the optional *power in use* and *lights on*), the room chips (hiding a room takes its tiles off Home), the device tiles, the scenes, the navigation tabs (Home and Settings can't be hidden) and the top bar's greeting, date, light/dark button and connection status. Safety alerts can't be moved or hidden.

The panel's tabs:

- **Theme:** light, dark or auto.
  - Fifteen *moving themes*: **Night sky** (the Evra website's night background: northern lights, stars and lines of light), **Northern lights** (with mountains), **Gold lines** (the website's showcase lines), **Connected**, **Ember glow** (with rising embers), **Deep sea** (waves and stars), **Winter** (snow over mountains), **Fireflies**, **Colour flow**, **Cosmos**, **Fireplace** (flickering flames, logs and embers), **Galaxy** (a slowly turning spiral), **Retro** (a striped sun over a rolling neon grid), **Bosphorus** (Istanbul at night: the shore with its mosques, the bridge lights, the moon and Kız Kulesi on the water) and **Kız Kulesi** (the Maiden's Tower at sunset, with seagulls). On a phone, the Istanbul themes show Kız Kulesi.
  - Seven still themes: Evra, Ocean, Forest, Sunset, Lavender, Graphite and High contrast.
  - **Background effects** can be mixed freely behind any theme: top glow, northern lights, mountains, stars, lines of light, gold lines, connections, glowing lights, embers, waves, snow, fireflies, colour flow, fireplace, galaxy, retro sun, Istanbul, moon, seagulls and sunset glow. Each has a strength and a movement setting (still, calm, lively).
  - Also an accent colour, corners, spacing, text size, and whether tiles that are on fill with their colour.
  - Alarms stay red and heating stays amber in every theme. A device set to reduce motion gets a still background.
- **Buttons:**
  - **All buttons:** shape (pill, rounded, square), main button style (filled, soft, outline), size, depth (flat, soft, raised, glow) and the press effect (still, subtle, bouncy).
  - **Quick action buttons:** look (card, tinted, outline, solid), icon style, and with or without the description.
  - **Each quick action** can have its own name, colour and icon.
- **Layout:** a list of everything hidden (tap one to show it again), group tiles by room or one list, full or compact tiles, tiles per row (1–4 on tablets and computers), names under tab icons, Energy and Remotes in the phone's tab bar, section headings, and centred or full-width pages.

Customization is kept in this browser (`localStorage` key `evra.custom`), so the phone and the wall panel can look different. **Copy setup** and **Paste a setup** move a look from one screen to another; **Reset everything** goes back to the original.

## Screens

| Screen | What's on it |
|---|---|
| Home | Alerts for smoke, gas or water; the room's climate; quick actions; room chips; every device as a tile with its own controls |
| Devices | All devices by room, the Rooms tab (create, rename, delete), device details (rename, move, remove) and **Add device** |
| Scenes | Sabah, Öğleden sonra, Akşam, Uyku, Eko, Parti, Film, Eğlence, Müzik, Akşam yemeği, Dışarıda (leaving home: everything off, door locked, the robot vacuum starts) and Temizlik (vacuum, blinds open, purifier at full speed). Scenes also work the home appliances: the purifier goes to sleep mode at night, the vacuum goes back to its base for a film or dinner, the kettle starts in the morning. Each has room chips (All rooms or any mix) and a "What it does" list of the exact changes; only devices in the chosen rooms change. Plugs are never touched |
| Automations | **My automations**: every automation with on/off, Run now, Edit and Delete, plus **New automation**. **Ideas**: about 55 automations the Evra range can do, including the home appliances (vacuum when everyone has left, feeding at set times, purifier when the air gets dirty, fan when the room is warm, kettle in the morning, litter box full); ones your devices can already do open the editor filled in, the rest are faded with dashed chips for the missing products (tap one to see the product) |
| Assistant | Chat with Evra, the assistant (Gemini), in Turkish first: answers about any device or room, Evra's products and plans, step-by-step help pairing new devices, and changes it prepares for you to approve (see "The assistant" below). Works in demo and live mode, for signed-in members with the assistant switched on. Needs the assistant server from `../EvrAI/gemini_home_starter`, which `Start Evra.bat` starts |
| Settings | Evra account (who's signed in, change password, sign out), connection (demo or live), **location and weather** (search for your city or use this device's location; Home's outside reading then shows that place's real weather from Open-Meteo, the demo home's weather and sunrise/sunset follow it, and in live mode a button moves the hub's own home location there), Look and layout (opens Customize), developer mode, electricity price, batteries, demo controls and the accounts address (developer mode), shortcuts to Energy, Remotes and Rooms |
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
| IR remote | Your Pico (TV and heater), or the AC and TV remote's learned buttons |
| Home appliances | Robot vacuum, air purifier, standing fan, pet feeder, litter box, smart kettle |
| Information only | Hub, wall panel, underfloor actuator, mesh Wi-Fi |

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

**Scenes** (`js/scenes.js`) list what lights, the TV and heater (through the IR remote's power trackers), radiator valves, blinds, the lock and the home appliances should do. Room choices are kept on each device (in the browser), not in Home Assistant.

## Where things live

| File | Purpose |
|---|---|
| `js/catalog.js` | The Evra range: products, categories, pairing methods |
| `js/catalog-details.js` | The product catalogue's text for each product (made by `tools/import_catalogue.py` from the PDF; don't edit by hand) |
| `js/config.js` | This home's specifics: the heater/TV IR codes and trackers, colour presets, quick actions |
| `js/store.js` | States, devices, rooms and entities; helpers used by every screen |
| `js/ideas.js` | Automation ideas, what each needs, and how each is built from the home's devices |
| `js/assistant-actions.js` | Carries out changes the assistant prepared, once approved, and checks they worked |
| `js/speech.js` | Reads the assistant's replies aloud with the browser's own voices |
| `js/weather.js`, `views/location-ui.js` | The weather for the chosen place (Open-Meteo, no key) and the Settings card to choose it |
| `js/account.js`, `views/auth-gate.js`, `views/account-ui.js` | Evra accounts: the sign-in screen the app opens with, and the account panel |
| `tools/accounts/` | A stand-in for the website's accounts, for working without the website (members, roles, assistant access) |
| `js/scenes.js` | The twelve scenes and how they're applied to the chosen rooms |
| `js/custom.js` | Each person's theme and layout: saving it, applying it, and putting things in their chosen order |
| `js/themes.js` | The colour themes (still and moving), moving backgrounds and accent colours |
| `js/sky.js` | The moving background layer |
| `js/sky-scenes.js` | The illustrated backgrounds: Istanbul (Bosphorus, the bridge, Kız Kulesi), the fireplace, the mountains, the retro horizon |
| `js/edit.js` | Editing the layout on the screen: dragging and hiding |
| `js/views/customize.js` | The Customize panel |
| `Start Evra.bat` | Starts the local server, the accounts stand-in, the test hub and the assistant, and opens the app |
| `Start test hub.bat`, `tools/test_hub/` | The Home Assistant stand-in for testing live mode (hub.py: API and control panel, world.py: the home, engine.py: automations) |
| `js/devices/cards.js` | The device tiles, one builder per kind |
| `js/backends/demo.js` | The demo Home Assistant, including a small automation engine |
| `js/backends/live.js` | The real connection: WebSocket API, login, pairing, rooms, automations |
| `js/views/*.js` | One file per screen; `automation-editor.js` is the editor |
| `css/app.css` | All styling, light and dark themes |

## Evra accounts (membership)

**Signing in comes first:** the app opens on a sign-in screen and shows nothing else until someone signs in with their **evrasmarthome.com account** (the same e-mail address and password as on the website). **Create account** explains the sign-up on the website. Signing out (Settings → Evra account) goes back to that screen. A kept sign-in still opens the app without internet.

**The assistant:**
- It comes with the **Premium** plan.
- Admins, and who gets it regardless of their plan, are set in the website's database (`evra_app_access`, see the webEVRA README, step 7). The app has no screen for that.
- Members without it see the Assistant tab with a lock. Tapping it opens the plans on the website (`abonelik.html`). The app sends nothing to the assistant for them, and the assistant refuses them too.
- Premium members have a monthly question limit (300 by default, the website's `ASSISTANT_MONTHLY_LIMIT`); the chat header shows how many are used.

**Where it runs:** the website does this in `lib/accounts.js` (webEVRA repository), on its own D1 member tables. Its README, step 7, has the one-time setup, including how to make the first admin.

**Working without the website:** `tools/accounts/` is a stand-in with its own members and usernames, on port 8770. `Start Evra.bat` starts it. To use it:
1. Turn developer mode on.
2. Under **Settings → Evra account**, press **This computer**.
3. The assistant on the website doesn't know the stand-in's members, so the Assistant tab only works with website accounts.

`tools/accounts/README.md` lists the differences.

In the app, `js/account.js` handles accounts, with `views/auth-gate.js` (the first screen) and `views/account-ui.js`.

## The assistant

The assistant is called **Evra** and speaks Turkish first (it answers in English when written to in English). Besides the home, it knows Evra's whole range: products, prices, packages and plans (from the website's `lib/assistant/products.js`), and it walks people through pairing a new device step by step. It also knows each product's problems and solutions from the catalogue. The questions on a product page ("Evra'ya sorun") open the Assistant tab with that question in the box.

The assistant answers questions and prepares changes. You approve every change before it happens, and the app carries it out itself. It can prepare:
- Device control: lights, plugs, TV and heater power, blinds, thermostats and valves.
- Remote buttons and scenes.
- Automations: create, edit, delete, switch on or off, or run now.
- Rooms, and devices: rename, move, remove, or open the setup page for a new one.
- Updates and the app's theme.

**Read aloud:** each reply has a **Listen** button. **Read aloud** at the top of the Assistant tab reads every new reply as it arrives, and the choice is kept on this device.
- It uses the browser's own text to speech, so nothing extra is sent anywhere.
- Turkish replies get a Turkish voice when the device has one. Edge has natural-sounding online voices, including Turkish. On Windows, more voices can be added under Settings → Time & language → Speech.

**Your own instructions** for the assistant go in the website Worker's variable `ASSISTANT_INSTRUCTIONS` (Cloudflare → Workers → evra → Settings → Variables and Secrets), as plain sentences, one per line.

**How it works:** each change arrives as a card that says exactly what will happen (written from the action itself, not by the AI), with **Approve** and **Cancel**. Automations also get **Review in editor**. On Approve, `js/assistant-actions.js` runs the change through the same backend the screens use (demo or live). It checks the result, for example by reading the light or the saved automation back, shows it on the card, and reports it to the assistant. Risky changes (removing, deleting, updates) are in red. Locks, cameras and alarms are never available to it.

`js/views/chat.js` is the Assistant tab. It doesn't talk to Gemini itself: the Gemini key must never be in the browser. Instead it calls the assistant on the Evra website (`https://evrasmarthome.com/api/assistant`, in the webEVRA repository; change it with the `assistantUrl` setting or `evra-config.json`). The website checks the Premium membership and the monthly limit, and keeps the Gemini key as a Cloudflare Secret.

With each question it sends only a filtered list of the home: devices, rooms, states and automations, the same in live and demo mode. Locks, cameras, alarms, people and phone locations stay in the app, the Home Assistant sign-in is never sent, and neither are the member's name, e-mail, address or phone. The assistant never connects to the home.

It also sends notes from `js/config.js`, so the assistant knows the TV and heater states are tracked and can be wrong.

The chat works with a screen reader:

- The conversation is a live region, so new answers are read out.
- The message box has a label and is linked to the privacy note.
- Enter sends, Shift+Enter starts a new line, and focus stays in the box.
- A "thinking" message is announced while waiting, and errors come with a "Try again" button.

The conversation is kept while the tab is open (sessionStorage), and **New chat** starts over.

## Try live mode without the Pi: the test hub

`tools/test_hub/` is a stand-in for Home Assistant. It speaks the same API the app uses in live mode (the login page and tokens, the WebSocket API, and the REST endpoints for automations and device setup), so live mode runs its real code against it. It starts with the home in `../ha-snapshot`, and runs automations itself, including your five.

1. Double-click **`Start Evra.bat`** (it starts the hub minimised) or **`Start test hub.bat`** (the hub's window stays visible, and it also opens the hub's control panel at http://localhost:8123).
2. In Evra: **Settings → Connection → Live**, address `http://localhost:8123` (already filled in), **Connect**.
3. You land on the hub's login page. The test username and password are on the control panel; they're made for this PC and kept in `tools/test_hub/data/` (not in git).

The control panel is the "real world":

- Open and close the window, trigger the motion sensor, nudge the temperature, raise smoke/gas/leak alarms, and press the emergency button.
- **Pairing:**
  - Zigbee: start pairing in the app, then press **Join** on the panel.
  - Wi-Fi: the panel lists the IP address to type in the app.
  - Matter: the panel shows the code to enter.
  - Tuya/Smart Life, Xiaomi and Petkit: pretend account pages (the robot vacuum, purifier, fan, pet feeder and litter box come from the Xiaomi and Petkit ones).
  - The IR remote receiver and the kettle wait on the network like the other Wi-Fi devices. A test home saved before 22 November doesn't have them yet: use the panel's reset.
- See notifications automations send. Tick "a phone with the Home Assistant app" to make phone notifications exist.
- Flip helpers (TV/heater trackers, day/night), read the activity log, and **Reset the test home**.

It behaves like Home Assistant where the app depends on it:

- Unknown actions fail as "not found", and notify.notify doesn't exist without the phone app.
- TP-Link, ESPHome and Tuya devices can't be removed on their own, while Zigbee and Matter devices can.
- A wrong IP address gives "cannot connect".
- Access tokens last 30 minutes and are refreshed; only http://localhost:8010 may call the API (`--origin` to allow another address).

It's still a test double: templates in automations aren't evaluated, there's no real Zigbee radio, and Home Assistant's own pages aren't there. Closing its window stops it; its home is saved in `tools/test_hub/data/world.json` between runs.

Testing against it found and fixed four things that would also have happened on the real Pi:

- Removing one cloud device would have removed every device on the same account.
- The curtain and tubular blind motors weren't recognised.
- The shutter module was taken for an energy meter.
- Without the phone app, the "send to phones" step stopped safety automations before they turned lights and sirens on.

## Install on Home Assistant (add-on)

Evra runs on the Pi as a Home Assistant add-on, so phones, computers and wall panels open it from the home network, even with no computer on. Needs Home Assistant OS (Settings › About › Installation type).

1. In Home Assistant: **Settings › Add-ons › Add-on store › ⋮ › Repositories**, add `https://github.com/YigitEmreC/appEVRA`.
2. Install **Evra** and start it.
3. Follow the add-on's **Documentation** tab: reserve the Pi's address in your router and add the `cors_allowed_origins` line for `http://<Pi's address>:8099`.
4. Open `http://<Pi's address>:8099` on any device. On phones, **Add to Home Screen**.

**Releasing a new version (for developers):** raise `version` in `evra/config.yaml`, add a line to `evra/CHANGELOG.md`, push, then tag the commit (`git tag v0.1.1 && git push --tags`). GitHub checks it, builds the images and publishes them; Home Assistant then offers the update. To try a version on the Pi before releasing it, run `python tools/build_addon.py` and copy `dist/addon/evra` to the Pi's `addons` share (it then appears under Local add-ons).

## The shared app (app.evrasmarthome.com)

Every client uses the same app address. After they sign in with their evrasmarthome.com account, Evra connects to **their own home**: the website keeps which home each account belongs to, with that home's Home Assistant address (`https://h-xxxxxx.evrasmarthome.com`, through the house's own Cloudflare tunnel). Wall panels keep using the add-on on the Pi, so they work without internet.

**Which Home Assistant Evra connects to**, in order: a choice made in Settings > Connection; the Evra add-on's settings file (on the Pi and panels); the home in the Evra account; the old defaults.

**Hosting (once), as a Cloudflare Worker** (`wrangler.jsonc` says what to publish):
1. Cloudflare > **Workers & Pages > Create > Import a repository** > choose `YigitEmreC/appEVRA`. The Worker's name must match `name` in `wrangler.jsonc` (`appevra`).
2. **Settings > Build:** build command `python3 tools/build_site.py`, deploy command `npx wrangler deploy`, **root directory empty** (the repository's top level; `dist/site` doesn't exist until the build makes it).
3. **Domains:** add the custom domain `app.evrasmarthome.com`.
4. Website (Workers > evra > Settings > Variables): add `https://app.evrasmarthome.com` to `ACCOUNTS_ORIGINS`.

Every merge into `main` then publishes a new version; open apps reload by themselves when nobody is using them. `tools/build_site.py` copies only the app files, adds the add-on's security headers (`_headers`) and stamps the version. There's no `evra-config.json` there, so the account's home is used. If the site serves files like `README.md` or `tools/`, it was deployed without `wrangler.jsonc` and the build command: it is then publishing the repository as-is, without the security headers.

**Homes** are created on the website (`evrasmarthome.com/evra-evler.html`, admins only; setup in the webEVRA repository's UYELIK.md, "Evra evleri"). Each home gets its own tunnel and address automatically; the page shows the token for the house's Cloudflared add-on, and any number of accounts (partners, family) can be linked to one home by e-mail. The accounts stand-in on this PC (`tools/accounts/server.py`) has homes too, with typed-in addresses, for testing.

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

## Licence

Copyright (c) 2026 Evra. All rights reserved. The code is public to read; you may install and use the Evra app and add-on on your own devices. Copying, changing, sharing or selling it needs written permission. See [LICENSE](LICENSE).
