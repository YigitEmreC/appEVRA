# Tunnel test: Evra over https:// on a real phone, without the Pi

This rehearses the internet setup on this PC: Cloudflare Tunnel gives two
`https://` addresses to the **test hub** (a stand-in for Home Assistant) and the
**built Evra app**. A phone on mobile data then opens Evra like it will from the
Pi: it installs as a full app and receives real notifications.

```
phone (mobile data) ──https──▶ Cloudflare ──tunnel──▶ this PC
   https://evra-test.evrasmarthome.com  ─▶ localhost:8090  serve_app.py (built app only)
   https://ha-test.evrasmarthome.com    ─▶ localhost:8123  test hub
```

**Safety:** `serve_app.py` serves only the built app (`dist/addon/evra/app`),
never the folders around it, with the add-on's security headers. Never point a
tunnel at `tools/dev_server.py`: it serves the whole parent folder (the
assistant's key, account data) and treats tunnel traffic as local. Through the
tunnel the test hub refuses its control panel (it shows the test password); it
only opens on this PC.

## One-time setup

1. **Python packages:** `python -m pip install aiohttp pywebpush`
   (pywebpush lets the test hub send real notifications).
2. **cloudflared:** in a terminal, `winget install --id Cloudflare.cloudflared`,
   then close the terminal (so the new program is found).
3. **The test tunnel** (dash.cloudflare.com → Zero Trust → Networks → Tunnels):
   1. **Create a tunnel** → **Cloudflared** → name it `evra-test` → Save.
   2. On the install screen, copy the token: the long text after `--token`
      in any of the commands. Don't run the installer.
   3. Save it, on one line, in `tools\tunnel_test\token.txt` (git ignores it).
   4. **Public hostnames** → add two:
      - Subdomain `evra-test`, domain `evrasmarthome.com`, type **HTTP**, URL `localhost:8090`
      - Subdomain `ha-test`, domain `evrasmarthome.com`, type **HTTP**, URL `localhost:8123`
4. **Let the test address sign in to Evra accounts:** Cloudflare → Workers &
   Pages → **evra** (the website) → Settings → Variables and Secrets →
   `ACCOUNTS_ORIGINS`:
   `http://localhost:8010,http://127.0.0.1:8010,https://evra-test.evrasmarthome.com,https://home.evrasmarthome.com`
   (the second https address is for the Pi later). Save and deploy.

Other test addresses? Change `EVRA_HOST` and `HA_HOST` at the top of
`Start tunnel test.bat`, the public hostnames, and `ACCOUNTS_ORIGINS` together.

## Each test

1. Close `Start Evra.bat` / `Start test hub.bat` windows (the test starts its own hub).
2. Double-click **`Start tunnel test.bat`**. It builds the app and opens three
   windows. The Cloudflare one should say "Registered tunnel connection"; the
   tunnel shows **Healthy** in Cloudflare. The test hub's panel opens: it shows
   the test login.
3. **On the PC:** `http://localhost:8090` → sign in with your Evra account →
   Home Assistant's login (the test hub's) → username and password from the panel.
4. **On the phone, Wi-Fi off:** `https://evra-test.evrasmarthome.com` → the same two sign-ins.
5. **Install it:**
   - Android, Chrome: ⋮ → **Install app** (or Add to Home screen).
   - iPhone, Safari: Share → **Add to Home Screen**, then open Evra from the
     icon and sign in again (the home-screen app keeps its own sign-in).
6. **Notifications**, in the installed app: Settings → Notifications → **On
   this device** → allow → **Send a test**. Then lock the phone and press
   **Send a test to Evra** on the hub's panel on the PC: it should arrive on the
   lock screen. Tapping it opens Evra.
7. Look around: tabs, Customize, adding a device from the hub's panel (Zigbee
   pairing, Wi-Fi devices), an automation with "send to phones".

To stop: close the three windows. The test addresses go offline with them.

## If something goes wrong

| What you see | Likely cause |
|---|---|
| Cloudflare error page (1033, 502) on the phone | A window isn't running, or a public hostname points to the wrong `localhost:` port |
| Evra's sign-in says it can't reach the server | `ACCOUNTS_ORIGINS` doesn't include `https://evra-test.evrasmarthome.com` yet |
| "Blocked a request from …" in the test hub window | The phone's address isn't the `EVRA_HOST` in the .bat |
| The notifications switch is greyed out | Its text says why: not https, iPhone not opened from the home screen, or blocked in settings |
| "Send a test" fails, or the hub says pywebpush is missing | `python -m pip install pywebpush`, then start the test again |
