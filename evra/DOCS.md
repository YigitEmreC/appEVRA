# Evra

Evra is a smart home app for your Home Assistant. This add-on serves it from the
Pi, so phones, computers and wall panels (like the SONOFF NS Panel Pro) open it
straight from your home network, even when no computer is on.

## Setup

1. **Give the Pi a fixed address.** In your router, reserve the Pi's IP address
   (often called "DHCP reservation" or "static lease"). Phones and panels save
   the address, so it must not change.

2. **Allow Evra to talk to Home Assistant.** Evra runs on its own port, so Home
   Assistant has to allow it. Add this to `configuration.yaml` (for example
   with the File editor add-on), using your Pi's address, then restart Home
   Assistant:

   ```yaml
   http:
     cors_allowed_origins:
       - http://192.168.1.50:8099
   ```

   If you open Evra through other addresses too (for example a secure
   `https://` one), add each of them.

3. **Start the add-on** and open `http://<your Pi's address>:8099` on a phone,
   computer or panel. Sign in with your Evra account, then with Home
   Assistant's own login page.

## On phones

Open the address in Chrome (Android) or Safari (iPhone) and choose
**Add to Home Screen**. Notifications on phones need a secure `https://`
address; see Settings > Notifications in Evra.

## On a wall panel

Point a kiosk browser (or the Evra panel app) at `http://<your Pi's address>:8099`.
The panel doesn't need `https://`. After an add-on update, an open screen
reloads by itself once nobody has touched it for two minutes.

If the panel shows "This screen's web engine is too old for Evra", its built-in
web engine needs an update (Android System WebView), or use a newer browser.

## Options

- **Home Assistant address**: leave empty to use this Pi (port 8123). Fill it in
  only if devices reach Home Assistant at another address.

## Outside the house: the Evra app on phones

Evra clients use one app for everyone, **https://app.evrasmarthome.com**. After
signing in with their Evra account, it connects to their own home by itself.
Evra sets this up when installing the house (evrasmarthome.com, "Evra homes"):
the house gets its own Cloudflare tunnel and address, and you get a token.

1. Install the **Cloudflared** add-on and paste the token Evra gave you into its
   configuration. Start it.
2. Add to `configuration.yaml`, then check the configuration and restart:

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
     ip_ban_enabled: true
     login_attempts_threshold: 5
     cors_allowed_origins:
       - http://192.168.1.50:8099
       - https://app.evrasmarthome.com
   ```

3. On each phone, open `https://app.evrasmarthome.com`, install it (Android:
   Install app; iPhone: Share > Add to Home Screen) and sign in.

The wall panel keeps using `http://<your Pi's address>:8099`: it talks to the Pi
directly and works without internet.

## Outside the house with your own addresses (https://)

Without an Evra home, you can give Evra and Home Assistant secure addresses
yourself. For example with the **Cloudflared** add-on and two addresses on your
own domain:

- `https://ha.example.com` → Home Assistant (`http://homeassistant:8123`)
- `https://home.example.com` → Evra (`http://<your Pi's address>:8099`)

Then:

1. Put Home Assistant's internet address in this add-on's
   **Home Assistant's internet address** option and restart the add-on. Evra
   uses it only when opened over `https://`; at home and on wall panels it keeps
   talking to the Pi directly, so it works without internet.
2. Add the Evra address to `cors_allowed_origins`, and tell Home Assistant to
   trust the tunnel:

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
     cors_allowed_origins:
       - http://192.168.1.50:8099
       - https://home.example.com
   ```

The assistant works from anywhere: it runs on the Evra website
(`https://evrasmarthome.com/api/assistant`) and comes with the Premium plan. It never
connects to this Home Assistant; the app sends it only the device list it needs.

## Keeping it safe

- **Before editing `configuration.yaml`**, make a backup (Settings > System > Backups).
  After editing, use Developer tools > YAML > **Check configuration** before
  restarting, so a typo can't stop Home Assistant from starting.
- **Before updating the add-on**, keep "Create backup" ticked in the update
  dialog, so you can go back if a version misbehaves.
- **Reaching Evra from outside the house** means putting Home Assistant on the
  internet (for example with Cloudflare Tunnel, Tailscale or Home Assistant
  Cloud). Use a strong password and turn on two-step login for every Home
  Assistant user (your profile > Security).
- Port 8099 only hands out Evra's app files. Your devices stay behind Home
  Assistant's login, and Evra only runs its own scripts.

## Home Assistant's sidebar

Evra also appears in Home Assistant's sidebar. There it uses Home Assistant's
own address, so step 2 isn't needed for the sidebar.
