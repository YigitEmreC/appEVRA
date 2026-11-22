# CLAUDE.md

Guidance for Claude Code when working in this repository. The user-facing overview (screens, product range, live-mode setup) is in [README.md](README.md); this file covers what you need to change the code safely.

## What this is

Evra is a smart-home PWA front end for Home Assistant. It is plain HTML, CSS and ES modules: **no build step, no package.json, no bundler, no framework, no test suite, no linter.** Edit a file, reload the browser.

## Running it

- `Start Evra.bat [port]`: starts `tools/dev_server.py` (default port 8010) and opens the app in an Edge or Chrome app window.
- By hand, run `python appEVRA/tools/dev_server.py [port]` from the **parent** folder (`SMART`), then open `http://localhost:8010/appEVRA/`.
- The dev server serves the **parent directory**, not this folder, because demo mode fetches `../ha-snapshot/{home,automations,history}.json` (see `SNAPSHOT` in `js/backends/demo.js`). `ha-snapshot` is **not in this repo**. Without it, demo mode has no data.
- Port 8000 is reserved for another project of the user's. Don't use it.
- **Test hub** (`tools/test_hub/hub.py`, needs `aiohttp`): a Python stand-in for Home Assistant's auth, WebSocket and REST APIs, used to exercise **live mode** without the Raspberry Pi. It runs on :8123, has a control panel, also reads `../ha-snapshot`, and keeps state in `tools/test_hub/data/`. It is a test double that covers only what the app uses.
- `python tools/make_icons.py` regenerates the PNG icons from `icons/icon.svg`.
- `Start Evra.bat` also starts the **accounts stand-in** (`tools/accounts/server.py`, :8770, stdlib only, data in git-ignored `tools/accounts/data/`). It's only used when Settings points at it; by default the app signs in with the Evra website. `Start Evra.bat` also starts the **assistant server** (`../EvrAI/gemini_home_starter/server.py`, :8765) too, but only when that folder has a `.env` with the Gemini key. The assistant server is outside this repo.

Live mode has **never been tested against the real Home Assistant**, only against the demo backend and the test hub.

## Architecture

```
index.html → js/main.js (shell, hash router, theme, connect())
               ├─ js/store.js        single source of truth (states + registries), pub/sub
               ├─ js/backends/demo.js  fake HA: snapshot + localStorage + automation interpreter
               ├─ js/backends/live.js  real HA: WebSocket API + REST + OAuth-style login
               ├─ js/views/*.js        one render function per screen
               └─ js/devices/cards.js  device tiles, one builder per "kind"
```

- **Routing**: hash routes `#/<view>/<params...>?query`. `VIEWS` in `main.js` lists the screens. Each view is `render(root, cleanup, ctx)`. Push teardown functions (unsubscribers, timers) onto `cleanup`; they run on the next route change. `ctx` = `{ reconnect, applyTheme, params, query }`.
- **Store** (`js/store.js`): `store.states` / `devices` / `areas` / `entities` Maps. UI subscribes with `store.watch(ids, fn)` (fires immediately and on change), `store.onRegistry(fn)` and `store.onStatus(fn)`. All of these return an unsubscribe function, which goes into `cleanup`. Backends push messages `{type: 'all'|'update'|'registry'}` into `store.apply`. Service calls go through `store.call(domain, service, target, data)`.
- **Backends share one interface**: `connect(onMessage, onStatus)`, `disconnect`, `callService`, `fetchHistory`, automation CRUD (`fetchAutomationConfig`, `saveAutomation`, `deleteAutomation`), area and device registry updates, pairing (`permitJoin`/`stopJoin`, `flowStart`/`flowSubmit`/`flowAbort`, `matterCommission`). Any feature you add must be implemented in **both** `demo.js` and `live.js` (and in the test hub if live mode is to be testable). The demo mirrors HA message shapes (HA 2026.11) so views can't tell the backends apart.
- **Mode selection** (`loadSettings()` in `js/util.js`): live if served from `/local/` or `homeassistant.local`, otherwise demo. Settings are kept in localStorage key `smarthome.settings`. The demo world is persisted under `smarthome.demo.v2`.
- **DOM**: built with the hyperscript helper `h(tag, props, ...kids)` from `js/util.js`. There are no templates or innerHTML. Shared widgets (card, toggle, slider, charts, timeline) are in `js/components.js`. Icons are inline SVG via `icon(name, size)` in `js/icons.js`.

## Domain data files

- `js/catalog.js`: the 34-product Evra range. Each product has `kind`, which picks the tile builder in `cards.js`, `pairing` (`zigbee|flow|matter|cloud|none`), `match`, a list of model substrings used by `productForDevice()` to recognise existing HA devices, and setup steps. `tools/test_hub/products.py` model names must stay in sync with `match`.
- `js/themes.js`: the colour themes (`PALETTES`, each with pastels plus dark and light surfaces) and `ACCENTS`.
- `js/config.js` (`HOME`): this specific home's entity IDs, IR remote buttons, colour presets and quick actions. When HA entities are renamed, this file is the one to update.
- `js/ideas.js`: automation idea templates. `CAPS` maps capability → catalogue products, and `buildIdea()` produces an editor template from the home's devices.
- `js/scenes.js`: the 10 scenes. `planScene` computes the changes and `runScene` applies them. Per-scene room choices are kept in settings, not in HA. Plugs are never touched.
- `js/views/automation-editor.js`: `fromConfig(cfg)` / `toConfig(state)` convert between HA automation YAML/JSON and the simple editor. Configs it can't represent fall back to the JSON editor, which is dev-mode only.

## Assistant and accounts

- **Assistant** (`js/views/chat.js`, `js/assistant-actions.js`):
  - The app never talks to Gemini; the key lives only in the assistant server's `.env`.
  - `chat.js` posts the question plus the home (live: HA address and token; demo: the snapshot) to `assistantUrl` (default `http://localhost:8765`).
  - The server answers with text and **proposals**: exact actions built by its `propose_*` tools.
  - The app shows each proposal as a card. On Approve, `runProposal()` carries it out through the normal backend (`store.call`, `backend.saveAutomation`, registry updates and so on), reads the result back, and reports it to the server's `/outcome`.
  - **A new proposal kind needs both sides:** the tool in `EvrAI/.../proposals.py` and its handler in `assistant-actions.js`.
- **Accounts** (`js/account.js`, `views/account-ui.js`, `views/members.js`):
  - Members sign in under Settings → Evra account. The token goes in the `Authorization` header of every assistant request, and the assistant server checks it with the accounts service's `/me`.
  - **Assistant access** is `features.ai`; admins always have it. `main.js` hides the Assistant tab with `assistantBlocked()` when a signed-in member lacks it, but the real check is on the server.
  - **Base address:** `accountsUrl()`. It defaults to `WEBSITE_ACCOUNTS` (`https://evrasmarthome.com/api/accounts`), served by `lib/accounts.js` in the webEVRA repo.
    - **Website accounts:** members sign in with their website e-mail and password (the website's `users`/`sessions` tables in D1). `features.ai` comes from the Premium plan or an admin's choice. Members are added, renamed, reset and deleted only on the website.
    - **The stand-in** is `LOCAL_ACCOUNTS` (`tools/accounts/server.py`, usernames, admin-managed members). It's used only when the `accountsServer` setting points at it.
    - **Telling them apart:** `/status` and `/members` return `kind: "website"` on the website, and website members have an `email`. The UI uses that to switch labels and hide the add, reset and delete controls.
    - **Keep the two APIs in step** when either changes.
  - **The setting key is `accountsServer`**, stored only when someone chose an address. The old key `accountsUrl` was saved with every setting, so it's ignored.

## Conventions

- **Developer mode**: elements with class `dev-only` are hidden unless `<html>` has class `dev`. Technical details (entity lists, model and firmware numbers, the JSON editor, demo controls) belong behind this.
- **Theming**: light and dark through `data-theme` on `<html>` (absent means auto). All styling is in `css/app.css`, with the palette documented at its top (schemecolor "Blue Silence" / "Pale Blue and Green"). Heating is amber and alarms are red. **Use CSS tokens, never hex, for pastel colours in JS** (for example a tile `tone: 'var(--p-seawash)'`), so that colour themes recolour them.
- **Customization** (`js/custom.js`, the panel in `js/views/customize.js`, themes in `js/themes.js`): it is saved per browser in localStorage `evra.custom`.
  - **Applying the look:** `applyLook()` puts only non-default values as inline CSS variables on `<html>` (`--p-*`, surfaces, `--accent*`, `--radius*`, `--gap`, `--card-pad`, `zoom`, `--m1..3`, `--sky-op`). It also toggles layout and button classes (`ROOT_CLASSES`: for example `tiles-compact`, `btn-pill`, `qb-solid`, `depth-glow`, `press-bouncy`), which only appear when an option differs from its default, and the attributes `data-cols`, `data-sky`, `data-sky-motion` and `data-sky-tone`. `quickLook` maps a quick-action id to its own `{ tone, icon, name }` (validated in `cleanLook`).
  - **Arrangeable lists** are `{ order, hidden }`. Render them with `ordered(items, cfg)` and filter with `isHidden`, so new items appear at the end automatically. `setCustom(patch)` fires `evra-custom`, and `main.js` then re-applies the look, rebuilds the nav and header, and re-renders the current view, keeping the scroll position. Pass `{ rerender: false }` when the DOM is already updated (drags, eye toggles, CSS-only options).
- **On-screen editing** (`js/edit.js`): the palette button at the top right opens the Customize panel (Settings opens it with the `evra-customize` event and a `tab`). The panel's "Move things on the screen" fires `evra-move`, and `main.js` calls `setEditing(true)`, which adds the `editing` class and re-renders everything. While moving, the top right shows a back-to-Customize button and Done; Escape goes back to the panel. Focused items move with the arrow keys and hide with H (wired in `arrangeable`); the order list is kept on `container.editAll`, because the listeners are added once per container. While editing, renderers must also include hidden items (they show faded). Call `arrangeable(container, key, { all, locked, whole, big, flag })` on each group: its children need `data-id` (and `data-name`). `whole` means small things dragged by themselves; `big` means dragged anywhere (a finger needs press-and-hold); `flag` adds an on/off button such as the sections' `half`. It adds a grip and/or eye and saves the order with `mergeOrder`, so a container holding part of a list keeps the other items' places. Its tap-blocking only applies inside `.edit-item` elements, so buttons sharing a container (like the top-right Done) still work. `sortable()` marks the pointer event (`evraSorted`), so with nested containers the innermost one wins. Text that updates inside an arrangeable element must live in its own child node, because the handles are appended as children and `textContent =` would wipe them. To make something new movable, give it a list in `DEFAULTS` and render it through `ordered` and `arrangeable`. Tiles have their own toolbar in `home.js` (wide/small/hide). Drag-and-drop is `sortable()` in `components.js` (pointer events, mouse and touch).
- **Moving backgrounds** (`js/sky.js`, the "Moving backgrounds" part of `app.css`): there is one fixed layer behind the app, and `<html data-sky="aurora stars ...">` lists the effects to show (`EFFECTS` in `themes.js`, selected in CSS with `[data-sky~="x"]`). Themes name a mix in `PRESETS`. The `night` preset copies the Evra website's background (`webEVRA-main/public/assets/css/style.css`, `.night-sky`), and `draw` copies its showcase `.sx-lines`. Particles (snow, embers, fireflies) use a seeded scatter, so they don't jump between loads. The illustrated scenes (Istanbul, fireplace, mountains, retro horizon) are built in `js/sky-scenes.js` from shape helpers (`mosque`, `minaret`, `maidensTower`, `tongue`, `pine`, `caps`), with fills from CSS variables (`--i-*`, `--mt*`, `--f-*`) set per light/dark in the "Illustrated scenes" part of `app.css`. When appending children, spread arrays (`...lamps`), because `append()` turns an array into text. Istanbul is anchored bottom right (`xMaxYMax slice`) with a clamped height, so wide screens show the whole panorama and phones show Kız Kulesi. To add an effect: a layer in `ensureSky()`, an entry in `EFFECTS`, a line in the `data-sky~=` display list in `app.css`, and its styles. Animate only transforms and opacity, and use durations as `calc(Ns * var(--sky-slow, 1))`.
- **Service worker** (`sw.js`): network-first with a cache fallback. **When you add, rename or remove a JS/CSS file, update the `SHELL` list and bump `CACHE` (`evra-vN`).**
- Comments and UI text are plain, friendly English with no jargon. The catalogue also has Turkish names (`nameTr`).
- `.bat` files must keep CRLF line endings (enforced by `.gitattributes`).
- The README sometimes refers to the folder as `app/`; the actual folder name is `appEVRA` (`dev_server.py` derives it from its own location).

## Verifying changes

There are no automated tests. Run the dev server and click through the affected screens in demo mode; **Settings → Reset demo** (dev mode) restores the snapshot. For backend or live-mode changes, also run the test hub and switch Settings → Connection to Live (`http://localhost:8123`).
