"""Evra test hub: a stand-in for Home Assistant, to try the app's live mode
without the Raspberry Pi.

It speaks Home Assistant's own API (login page and tokens, the WebSocket API,
the REST endpoints the app uses) and starts with the home in ../ha-snapshot.
Open http://localhost:8123 for its control panel: make sensors fire, pair
devices, see notifications.

    python appEVRA/tools/test_hub/hub.py                 (from the SMART folder)
    python appEVRA/tools/test_hub/hub.py --port 8124 --origin http://localhost:8010

It is a test double, not Home Assistant: it covers what the Evra app uses.
"""
import argparse
import asyncio
import hashlib
import json
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import urlencode, urlparse

from aiohttp import web, WSMsgType

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from engine import Engine  # noqa: E402
from push import AVAILABLE as PUSH_AVAILABLE, Push  # noqa: E402
from products import BY_ID, PRODUCTS  # noqa: E402
from world import HA_VERSION, HassError, ServiceNotFound, World, iso, new_id  # noqa: E402

ACCESS_TTL = 1800  # seconds, same as Home Assistant


# ---- sign-in -----------------------------------------------------------------------

class Auth:
    """One test user, Home Assistant-style codes, access tokens and refresh tokens."""

    def __init__(self, data_dir: Path):
        self.file = data_dir / "auth.json"
        self.codes = {}
        data = {}
        if self.file.exists():
            try:
                data = json.loads(self.file.read_text(encoding="utf-8"))
            except ValueError:
                data = {}
        if "user" not in data:
            # A test login made for this PC; the control panel shows it.
            data["user"] = {"username": "tester", "password": secrets.token_urlsafe(9)}
        self.user = data["user"]
        self.refresh = data.get("refresh", {})   # token -> {client_id, created}
        self.access = data.get("access", {})     # token -> {refresh, expires}
        self.save()

    def save(self):
        now = time.time()
        self.access = {k: v for k, v in self.access.items() if v["expires"] > now}
        self.file.write_text(json.dumps({"user": self.user, "refresh": self.refresh, "access": self.access}, indent=1), encoding="utf-8")

    def check_password(self, username, password):
        return username == self.user["username"] and secrets.compare_digest(password.encode(), self.user["password"].encode())

    def new_code(self, client_id, redirect_uri):
        code = secrets.token_hex(16)
        self.codes[code] = {"client_id": client_id, "redirect_uri": redirect_uri, "expires": time.time() + 600}
        return code

    def _access_for(self, refresh):
        token = secrets.token_urlsafe(32)
        self.access[token] = {"refresh": refresh, "expires": time.time() + ACCESS_TTL}
        self.save()
        return token

    def exchange_code(self, code, client_id):
        c = self.codes.pop(code, None)
        if not c or c["expires"] < time.time() or c["client_id"] != client_id:
            return None
        refresh = secrets.token_urlsafe(48)
        self.refresh[refresh] = {"client_id": client_id, "created": time.time()}
        return {"access_token": self._access_for(refresh), "token_type": "Bearer", "refresh_token": refresh,
                "expires_in": ACCESS_TTL, "ha_auth_provider": "homeassistant"}

    def refresh_access(self, refresh, client_id):
        r = self.refresh.get(refresh)
        if not r or r["client_id"] != client_id:
            return None
        return {"access_token": self._access_for(refresh), "token_type": "Bearer", "expires_in": ACCESS_TTL}

    def revoke(self, refresh):
        self.refresh.pop(refresh, None)
        self.access = {k: v for k, v in self.access.items() if v["refresh"] != refresh}
        self.save()

    def valid(self, token):
        a = self.access.get(token or "")
        return bool(a) and a["expires"] > time.time() and a["refresh"] in self.refresh


def page(title, body):
    return web.Response(content_type="text/html", text=f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>
<style>
:root{{color-scheme:dark;--bg:#0E1322;--card:#151B2E;--line:rgb(205 215 240/.12);--text:#EDEEFB;--muted:#9AA5C6;--accent:#9AAFDD;--bad:#F27D89}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:16px}}
.card{{width:min(100%,400px);background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}}
h1{{font-size:20px;margin:0 0 4px}}p{{color:var(--muted);margin:0 0 18px}}label{{display:block;font-size:13px;color:var(--muted);margin:12px 0 6px}}
input{{width:100%;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:#1C2440;color:var(--text);font:inherit}}
button{{margin-top:20px;width:100%;padding:12px;border:0;border-radius:12px;background:var(--accent);color:#10162A;font-weight:700;font:inherit;font-weight:700;cursor:pointer}}
.err{{color:var(--bad);font-weight:600}}.tag{{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:#283153;color:var(--muted);margin-bottom:12px}}
a{{color:var(--accent)}}
</style></head><body>{body}</body></html>""")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ---- the server ----------------------------------------------------------------------

class Client:
    """One connected app: its event subscriptions and outgoing messages."""

    def __init__(self):
        self.subs = {}            # subscription id -> event type (None = all)
        self.queue = asyncio.Queue()
        self.authed = False


class Hub:
    def __init__(self, world: World, auth: Auth, origins):
        self.world = world
        self.auth = auth
        self.origins = set(origins)
        self.clients = set()
        self.flows = {}
        # Evra's own data per user (frontend/get_user_data, set_user_data): scenes, remotes.
        self.user_data_file = world.data_dir / "user_data.json"
        try:
            self.user_data = json.loads(self.user_data_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.user_data = {}
        # The home location and time zone (get_config; Evra can move it with config/core/update).
        self.core = {"latitude": 51.44, "longitude": 5.47, "location_name": "Home", "time_zone": "Europe/Amsterdam"}
        world.listeners.append(self.broadcast)

    # ---- CORS: only the app's address may call the API from a browser ----

    @web.middleware
    async def cors(self, request, handler):
        # Reached through the internet (Cloudflare Tunnel, tools/tunnel_test): the
        # control panel shows the test login and changes the home, so it stays on this PC.
        through_tunnel = request.headers.get("Cf-Ray") or request.headers.get("Cf-Connecting-Ip")
        if through_tunnel and (request.path == "/" or request.path.startswith("/panel")):
            return web.Response(status=403, text="The test hub's control panel only opens on the computer running it.")
        origin = request.headers.get("Origin")
        allowed = origin in self.origins
        cors_path = request.path.startswith("/api/") or request.path == "/auth/token"
        if request.method == "OPTIONS" and cors_path:
            resp = web.Response(status=200 if allowed else 403)
        else:
            if origin and cors_path and not allowed and origin != f"http://{request.host}":
                self.world.note(f"Blocked a request from {origin}: not an allowed origin (start the hub with --origin {origin})")
            resp = await handler(request)
        if allowed and cors_path:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, PUT, PATCH, OPTIONS"
            resp.headers["Vary"] = "Origin"
        return resp

    def authorized(self, request):
        header = request.headers.get("Authorization", "")
        return header.startswith("Bearer ") and self.auth.valid(header[7:])

    def need_auth(self, request):
        if not self.authorized(request):
            raise web.HTTPUnauthorized(text="401: Unauthorized")

    # ---- /auth ----

    async def authorize_page(self, request):
        q = request.query if request.method == "GET" else await request.post()
        client_id, redirect_uri, state = q.get("client_id", ""), q.get("redirect_uri", ""), q.get("state", "")
        c, r = urlparse(client_id), urlparse(redirect_uri)
        if not client_id or not redirect_uri or (c.scheme, c.netloc) != (r.scheme, r.netloc):
            return page("Invalid request", '<div class="card"><h1>Invalid redirect</h1><p>The redirect address must be on the same site as the client ID, '
                                           'like Home Assistant requires.</p></div>')
        error = ""
        if request.method == "POST":
            if self.auth.check_password(q.get("username", ""), q.get("password", "")):
                code = self.auth.new_code(client_id, redirect_uri)
                sep = "&" if "?" in redirect_uri else "?"
                self.world.note(f"Signed in for {client_id}")
                raise web.HTTPFound(f"{redirect_uri}{sep}{urlencode({'code': code, 'state': state})}")
            error = '<p class="err">Invalid username or password.</p>'
        hidden = "".join(f'<input type="hidden" name="{k}" value="{esc(v)}">' for k, v in (("client_id", client_id), ("redirect_uri", redirect_uri), ("state", state)))
        return page("Log in · Evra test hub", f"""<form class="card" method="post" action="/auth/authorize">
<span class="tag">Evra test hub · stands in for Home Assistant</span>
<h1>Welcome home!</h1><p>Log in to give <b>{esc(c.netloc)}</b> access to the test hub.</p>{error}{hidden}
<label for="u">Username</label><input id="u" name="username" autocomplete="username" value="{esc(self.auth.user['username'])}">
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" autofocus>
<button type="submit">Log in</button>
<p style="margin:16px 0 0;font-size:13px">The test password is on the hub's control panel at <a href="/" target="_blank">{esc(request.host)}</a>.</p></form>""")

    async def token(self, request):
        f = await request.post()
        grant = f.get("grant_type")
        if f.get("action") == "revoke":
            self.auth.revoke(f.get("token", ""))
            return web.Response(status=200)
        if grant == "authorization_code":
            t = self.auth.exchange_code(f.get("code", ""), f.get("client_id", ""))
            if not t:
                return web.json_response({"error": "invalid_request", "error_description": "Invalid code"}, status=400)
            return web.json_response(t)
        if grant == "refresh_token":
            t = self.auth.refresh_access(f.get("refresh_token", ""), f.get("client_id", ""))
            if not t:
                return web.json_response({"error": "invalid_grant"}, status=400)
            return web.json_response(t)
        return web.json_response({"error": "unsupported_grant_type"}, status=400)

    # ---- WebSocket API ----

    def broadcast(self, event_type, data, context):
        msg_event = {"event_type": event_type, "data": data, "origin": "LOCAL", "time_fired": iso(), "context": context}
        for client in list(self.clients):
            for sub_id, wanted in list(client.subs.items()):
                if wanted is None or wanted == event_type:
                    client.queue.put_nowait({"id": sub_id, "type": "event", "event": msg_event})

    async def websocket(self, request):
        ws = web.WebSocketResponse(max_msg_size=16 * 1024 * 1024)
        await ws.prepare(request)
        client = Client()

        async def writer():
            while True:
                msg = await client.queue.get()
                if ws.closed:
                    return
                await ws.send_str(json.dumps(msg, ensure_ascii=False))

        send = client.queue.put_nowait
        writer_task = asyncio.create_task(writer())
        send({"type": "auth_required", "ha_version": HA_VERSION})
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    m = json.loads(msg.data)
                except ValueError:
                    continue
                if not client.authed:
                    if m.get("type") == "auth" and self.auth.valid(m.get("access_token")):
                        client.authed = True
                        self.clients.add(client)
                        send({"type": "auth_ok", "ha_version": HA_VERSION})
                        self.world.note(f"App connected ({len(self.clients)} connected)")
                    else:
                        send({"type": "auth_invalid", "message": "Invalid access token or password"})
                        await asyncio.sleep(0.1)
                        await ws.close()
                    continue
                for one in (m if isinstance(m, list) else [m]):
                    asyncio.create_task(self.command(client, one, send))
        finally:
            self.clients.discard(client)
            writer_task.cancel()
            if client.authed:
                self.world.note(f"App disconnected ({len(self.clients)} connected)")
        return ws

    async def command(self, client, m, send):
        mid, kind = m.get("id"), m.get("type")
        ok = lambda result=None: send({"id": mid, "type": "result", "success": True, "result": result})
        fail = lambda code, message: send({"id": mid, "type": "result", "success": False, "error": {"code": code, "message": message}})
        w = self.world
        try:
            if kind == "ping":
                send({"id": mid, "type": "pong"})
            elif kind == "supported_features":
                ok()
            elif kind == "get_states":
                ok(list(w.states.values()))
            elif kind == "frontend/get_user_data":
                ok({"value": self.user_data.get(m.get("key"))} if m.get("key") else {"value": self.user_data})
            elif kind == "frontend/set_user_data":
                self.user_data[m["key"]] = m.get("value")
                self.user_data_file.write_text(json.dumps(self.user_data, ensure_ascii=False, indent=1), encoding="utf-8")
                ok()
            elif kind == "config/core/update":
                # The home location (Evra's Settings > Konum ve hava durumu); kept while the hub runs.
                for key in ("latitude", "longitude", "elevation", "time_zone", "location_name"):
                    if key in m:
                        self.core[key] = m[key]
                w.note(f"Home location set to {self.core['latitude']}, {self.core['longitude']}")
                ok()
            elif kind == "get_config":
                ok({**self.core, "elevation": 17, "unit_system": {"length": "km", "mass": "g", "temperature": "°C", "volume": "L",
                    "pressure": "Pa", "wind_speed": "m/s", "accumulated_precipitation": "mm"},
                    "components": sorted({e["platform"] for e in w.entities.values()} | {"automation", "zha", "history"}), "version": HA_VERSION,
                    "state": "RUNNING", "currency": "EUR", "country": "NL", "language": "en", "safe_mode": False, "recovery_mode": False,
                    "external_url": None, "internal_url": None, "config_dir": "/config", "allowlist_external_dirs": [], "allowlist_external_urls": [], "radius": 100})
            elif kind == "get_services":
                ok({d: {s: {"name": s, "description": "", "fields": {}} for s in svcs} for d, svcs in w.services().items()})
            elif kind == "subscribe_events":
                client.subs[mid] = m.get("event_type")
                ok()
            elif kind == "unsubscribe_events":
                if client.subs.pop(m.get("subscription"), "missing") == "missing":
                    fail("not_found", "Subscription not found.")
                else:
                    ok()
            elif kind == "call_service":
                ctx = {"id": new_id(), "parent_id": None, "user_id": "tester"}
                await w.call_service(m["domain"], m["service"], m.get("service_data"), m.get("target"), ctx)
                ok({"context": ctx, "response": None})
            elif kind == "config/device_registry/list":
                ok(list(w.devices.values()))
            elif kind == "config/area_registry/list":
                ok(list(w.areas.values()))
            elif kind == "config/entity_registry/list":
                ok(list(w.entities.values()))
            elif kind == "config/area_registry/create":
                ok(w.create_area(m["name"]))
            elif kind == "config/area_registry/update":
                ok(w.update_area(m["area_id"], **{k: v for k, v in m.items() if k not in ("id", "type", "area_id")}))
            elif kind == "config/area_registry/delete":
                w.delete_area(m["area_id"])
                ok("success")
            elif kind == "config/device_registry/update":
                ok(w.update_device(m["device_id"], **{k: v for k, v in m.items() if k not in ("id", "type", "device_id")}))
            elif kind == "config/device_registry/remove_config_entry":
                dev = w.devices.get(m["device_id"])
                entry = w.config_entries.get(m["config_entry_id"])
                if not dev or not entry:
                    return fail("not_found", "Unknown device or config entry")
                if entry["domain"] not in ("matter", "zha"):
                    # Like tplink, esphome, shelly, onvif and tuya in Home Assistant.
                    return fail("home_assistant_error", "Config entry does not support device removal")
                w.remove_device(dev["id"])
                ok(None)
            elif kind == "history/history_during_period":
                start = _ts(m["start_time"])
                end = _ts(m["end_time"]) if m.get("end_time") else time.time()
                ok(w.history_during(m.get("entity_ids") or [], start, end))
            elif kind == "matter/commission":
                code = str(m.get("code", ""))
                found = next((x for x in w.matter if x["code"].replace("-", "") == code.replace("-", "").replace(" ", "")), None)
                await asyncio.sleep(3)
                if not found:
                    return fail("unknown_error", "Commission failed: no Matter device answered to that code")
                w.matter.remove(found)
                w.create_device(found["product"], "matter")
                ok(None)
            elif kind == "notify/html5/appkey":
                key = w.push.public_key()
                if not key:
                    w.note("The app asked for the push key, but sending needs pywebpush: python -m pip install pywebpush, then restart the hub")
                    return fail("unknown_command", "Unknown command.")
                ok(key)
            elif kind == "frontend/get_translations":
                wanted = m.get("integration") or []
                wanted = [wanted] if isinstance(wanted, str) else wanted
                ok({"resources": self.flow_texts(wanted) if m.get("category") == "config" else {}})
            elif kind == "config_entries/flow/progress":
                ok(self.discovered_flows())
            elif kind == "repairs/list_issues":
                ok({"issues": []})
            elif kind == "config_entries/get":
                ok([{"entry_id": e["entry_id"], "domain": e["domain"], "title": e["title"], "source": "user", "state": "loaded",
                     "supports_options": False, "supports_remove_device": e["domain"] in ("zha", "matter"), "supports_unload": True,
                     "pref_disable_new_entities": False, "pref_disable_polling": False, "disabled_by": None, "reason": None}
                    for e in w.config_entries.values()])
            elif kind in ("auth/current_user",):
                ok({"id": "tester", "name": "Tester", "is_owner": True, "is_admin": True, "credentials": [], "mfa_modules": []})
            else:
                fail("unknown_command", f"Unknown command: {kind}")
        except ServiceNotFound as e:
            fail("not_found", str(e))
        except (HassError, ValueError) as e:
            fail("home_assistant_error", str(e))
        except KeyError as e:
            fail("not_found", f"Not found: {e}")
        except Exception as e:  # keep the hub running, report like Home Assistant would
            fail("unknown_error", f"{type(e).__name__}: {e}")
            raise

    # ---- REST API ----

    async def push_registration(self, request):
        """POST adds a device for Evra notifications, DELETE removes it (like /api/notify.html5)."""
        self.need_auth(request)
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"message": "Invalid JSON."}, status=400)
        sub = body.get("subscription") if isinstance(body, dict) else None
        keys = (sub or {}).get("keys") or {}
        if not isinstance(sub, dict) or not str(sub.get("endpoint", "")).startswith("http") or not keys.get("auth") or not keys.get("p256dh"):
            return web.json_response({"message": "Invalid subscription."}, status=400)
        if request.method == "DELETE":
            done = self.world.unregister_push(sub)
            return web.json_response({"message": "Push notification subscriber unregistered." if done else "Registration not found."})
        if body.get("browser") not in ("chrome", "firefox"):
            return web.json_response({"message": "value must be one of ['chrome', 'firefox'] for dictionary value @ data['browser']"}, status=400)
        self.world.register_push(sub, body["browser"], body.get("name"))
        return web.json_response({"message": "Push notification subscriber registered."})

    async def api_root(self, request):
        self.need_auth(request)
        return web.json_response({"message": "API running."})

    async def automation_config(self, request):
        self.need_auth(request)
        cid = request.match_info["cid"]
        w = self.world
        if request.method == "GET":
            cfg = w.automations.get(cid)
            if not cfg:
                return web.json_response({"message": "Resource not found"}, status=404)
            return web.json_response(cfg)
        if request.method == "DELETE":
            if cid not in w.automations:
                return web.json_response({"message": "Resource not found"}, status=404)
            del w.automations[cid]
            ent = w.engine.entity_for(cid)
            if ent:
                w.entities.pop(ent, None)
                w.remove_state(ent)
                w.fire("entity_registry_updated", {"action": "remove", "entity_id": ent})
            w.note(f"Automation {cid} deleted")
            w.save_soon()
            return web.json_response({"result": "ok"})
        # POST: create or update, then "reload"
        try:
            cfg = await request.json()
        except ValueError:
            return web.json_response({"message": "Invalid JSON specified."}, status=400)
        problem = validate_automation(cfg)
        if problem:
            return web.json_response({"message": f"Message malformed: {problem}"}, status=400)
        cfg = {"id": cid, **{k: v for k, v in cfg.items() if k != "id"}}
        w.automations[cid] = cfg
        ent = w.engine.entity_for(cid)
        if ent:
            w.set_state(ent, attrs={"friendly_name": cfg.get("alias") or ent, "mode": cfg.get("mode", "single")})
        else:
            from world import slug
            base = "automation." + slug(cfg.get("alias") or "automation")
            eid, n = base, 2
            while eid in w.states:
                eid, n = f"{base}_{n}", n + 1
            w.entities[eid] = w._entity(eid, None, None, "automation", cfg.get("alias"), False)
            w.entities[eid]["unique_id"] = cid
            w.add_state(eid, "on", {"id": cid, "last_triggered": None, "mode": cfg.get("mode", "single"), "current": 0, "friendly_name": cfg.get("alias") or "Automation"})
            w.fire("entity_registry_updated", {"action": "create", "entity_id": eid})
        w.note(f"Automation '{cfg.get('alias')}' saved")
        w.save_soon()
        return web.json_response({"result": "ok"})

    # ---- integrations: setup flows (Wi-Fi devices by IP) ----
    # Shaped like Home Assistant's config flows over REST, with the parts the app
    # must cope with: devices Home Assistant discovered by itself (a waiting flow
    # at "discovery_confirm"; starting another for the same device aborts with
    # already_in_progress), a second step (TP-Link account), a folded section
    # (ONVIF's advanced options) and a progress step (ESPHome waiting for the device).
    # The steps are simplified; they exercise the app, they don't copy each integration.

    PASSWORD = {"name": "password", "required": True, "type": "string", "selector": {"text": {"type": "password"}}}
    FLOW_STEPS = {
        "tplink": [{"name": "host", "required": True, "type": "string"}],
        "shelly": [{"name": "host", "required": True, "type": "string"}, {"name": "port", "optional": True, "type": "integer", "default": 80}],
        "esphome": [{"name": "host", "required": True, "type": "string"}, {"name": "port", "optional": True, "type": "integer", "default": 6053}],
        # In Home Assistant a Bluetooth kettle is discovered by itself; here it's found by its bridge's address.
        "xiaomi_ble": [{"name": "host", "required": True, "type": "string"}],
        "onvif": [{"name": "name", "required": True, "type": "string", "default": "Camera"}, {"name": "host", "required": True, "type": "string"},
                  {"name": "username", "required": True, "type": "string"}, PASSWORD,
                  {"name": "advanced", "type": "expandable", "required": True, "expanded": False,
                   "schema": [{"name": "port", "required": True, "type": "integer", "default": 2020}]}],
    }
    AUTH_STEP = [{"name": "username", "required": True, "type": "string"}, PASSWORD]
    DISCOVERABLE = ("tplink", "shelly", "esphome")  # found by zeroconf / DHCP in Home Assistant

    # Texts like frontend/get_translations returns them (category "config"), before flattening.
    FLOW_TEXT = {
        "tplink": {
            "step": {
                "user": {"title": "Set up a TP-Link device",
                         "description": "Enter the address of your Tapo or Kasa device. Set it up in the Tapo app first, so it is on your Wi-Fi.",
                         "data": {"host": "Host"}, "data_description": {"host": "The device's IP address, for example 192.168.1.40."}},
                "user_auth_confirm": {"title": "TP-Link account", "description": "Tapo devices need the email and password of your TP-Link account.",
                                      "data": {"username": "Email", "password": "Password"}},
                "discovery_confirm": {"description": "Do you want to set up {name} ({host})?"},
            },
            "error": {"cannot_connect": "Failed to connect", "invalid_auth": "Invalid authentication"},
            "abort": {"already_configured": "Device is already configured", "already_in_progress": "Configuration flow is already in progress"},
        },
        "shelly": {
            "step": {
                "user": {"title": "Set up a Shelly device", "description": "Battery-powered devices must be woken up first, by pressing their button.",
                         "data": {"host": "Host", "port": "Port"}, "data_description": {"host": "The Shelly's IP address."}},
                "discovery_confirm": {"description": "Do you want to set up the {name} at {host}?"},
            },
            "error": {"cannot_connect": "Failed to connect"},
            "abort": {"already_in_progress": "Configuration flow is already in progress"},
        },
        "esphome": {
            "step": {
                "user": {"title": "Set up an ESPHome device", "description": "Please enter connection settings of your [ESPHome](https://esphome.io/) node.",
                         "data": {"host": "Host", "port": "Port"}},
                "discovery_confirm": {"title": "Discovered ESPHome node", "description": "Do you want to add the ESPHome node `{name}` to Home Assistant?"},
            },
            "progress": {"wait_for_device": "Waiting for the device to answer..."},
            "error": {"cannot_connect": "Can't connect to the ESP. Make sure its YAML file contains an api: line."},
            "abort": {"already_in_progress": "Configuration flow is already in progress"},
        },
        "onvif": {
            "step": {
                "user": {"title": "Configure ONVIF device", "description": "Tapo cameras need a camera account, made in the Tapo app under Advanced settings.",
                         "data": {"name": "Name", "host": "Host", "username": "Username", "password": "Password"},
                         "sections": {"advanced": {"name": "Advanced options", "data": {"port": "Port"},
                                                   "data_description": {"port": "2020 for Tapo cameras; often 80 or 8000 for others."}}}},
            },
            "error": {"cannot_connect": "Failed to connect", "invalid_auth": "Invalid authentication"},
        },
    }

    @classmethod
    def flow_texts(cls, domains):
        out = {}

        def walk(prefix, node):
            for k, v in node.items():
                if isinstance(v, dict):
                    walk(f"{prefix}.{k}", v)
                else:
                    out[f"{prefix}.{k}"] = v
        for d in domains:
            walk(f"component.{d}.config", cls.FLOW_TEXT.get(d, {}))
        return out

    def form(self, flow_id, handler, step_id, schema, errors=None, placeholders=None):
        return {"type": "form", "flow_id": flow_id, "handler": handler, "step_id": step_id, "data_schema": schema, "errors": errors or {},
                "description_placeholders": placeholders, "last_step": None, "preview": None}

    def discovered_flows(self):
        """Waiting Wi-Fi devices Home Assistant would find by itself get a discovery flow."""
        w = self.world
        have = {id(f.get("device")) for f in self.flows.values() if f.get("source") != "user"}
        for dev in w.network:
            handler = _handler_for(dev["product"])
            if handler in self.DISCOVERABLE and id(dev) not in have:
                self.flows[new_id()] = {"handler": handler, "step": "discovery_confirm", "source": "zeroconf", "device": dev}
        # Forget flows for devices that are gone.
        for fid in [fid for fid, f in self.flows.items() if f.get("source") != "user" and f.get("device") not in w.network]:
            self.flows.pop(fid)
        return [{"flow_id": fid, "handler": f["handler"], "step_id": f["step"],
                 "context": {"source": f["source"], "unique_id": f["device"]["host"],
                             "title_placeholders": {"name": BY_ID[f["device"]["product"]][1]}}}
                for fid, f in self.flows.items() if f.get("source") != "user"]

    def current_step(self, flow_id):
        """What Home Assistant answers for a flow right now (GET, or a POST with nothing new)."""
        f = self.flows[flow_id]
        handler, step = f["handler"], f["step"]
        if step == "discovery_confirm":
            dev = f["device"]
            return self.form(flow_id, handler, step, [], placeholders={"name": BY_ID[dev["product"]][1], "host": dev["host"]})
        if step == "user_auth_confirm":
            return self.form(flow_id, handler, step, self.AUTH_STEP)
        if step == "progress":
            if time.time() < f["until"]:
                return {"type": "progress", "flow_id": flow_id, "handler": handler, "step_id": "wait", "progress_action": "wait_for_device",
                        "description_placeholders": None}
            f["step"] = "finish"
            return {"type": "progress_done", "flow_id": flow_id, "handler": handler, "step_id": "finish"}
        if step == "finish":
            return self.finish_flow(flow_id)
        return self.form(flow_id, handler, "user", self.FLOW_STEPS[handler])

    def finish_flow(self, flow_id):
        f = self.flows.pop(flow_id)
        handler, device, w = f["handler"], f["device"], self.world
        if device in w.network:
            w.network.remove(device)
        name = BY_ID[device["product"]][1]
        asyncio.get_running_loop().call_later(1.0, lambda: w.create_device(device["product"], handler, device["host"]))
        entry = {"entry_id": new_id(), "domain": handler, "title": name, "source": f.get("source", "user"), "state": "loaded"}
        return {"type": "create_entry", "flow_id": flow_id, "handler": handler, "title": name, "description": None,
                "description_placeholders": None, "context": {"source": f.get("source", "user")}, "version": 1, "minor_version": 1,
                "options": {}, "result": entry}

    def after_device_found(self, flow_id):
        """The device answered: TP-Link asks for the account, ESPHome waits a moment, others are done."""
        f = self.flows[flow_id]
        if f["handler"] == "tplink":
            f["step"] = "user_auth_confirm"
            return self.form(flow_id, "tplink", "user_auth_confirm", self.AUTH_STEP)
        if f["handler"] == "esphome":
            f["step"], f["until"] = "progress", time.time() + 3
            return self.current_step(flow_id)
        return self.finish_flow(flow_id)

    async def flow_start(self, request):
        self.need_auth(request)
        body = await request.json()
        handler = body.get("handler")
        if handler not in self.FLOW_STEPS:
            return web.json_response({"message": "Invalid handler specified"}, status=404)
        flow_id = new_id()
        self.flows[flow_id] = {"handler": handler, "step": "user", "source": "user"}
        self.world.note(f"Setup started for {handler}")
        return web.json_response(self.form(flow_id, handler, "user", self.FLOW_STEPS[handler]))

    async def flow_step(self, request):
        self.need_auth(request)
        flow_id = request.match_info["flow_id"]
        f = self.flows.get(flow_id)
        if request.method == "DELETE":
            self.flows.pop(flow_id, None)
            return web.json_response({"message": "Flow aborted"})
        if not f:
            return web.json_response({"message": "Invalid flow specified"}, status=404)
        if request.method == "GET":
            return web.json_response(self.current_step(flow_id))
        data = (await request.json() if request.can_read_body else None) or {}
        handler, w, step = f["handler"], self.world, f["step"]
        if step == "user":
            host = str(data.get("host", "")).strip()
            waiting = next((x for x in w.network if x["host"] == host and _handler_for(x["product"]) == handler), None)
            if not waiting:
                return web.json_response(self.form(flow_id, handler, "user", self.FLOW_STEPS[handler], {"base": "cannot_connect"}))
            # Home Assistant found this one already and is waiting for a yes: like the real one, stop here.
            if any(o is not f and o.get("source") != "user" and o.get("device") is waiting for o in self.flows.values()):
                self.flows.pop(flow_id, None)
                return web.json_response({"type": "abort", "flow_id": flow_id, "handler": handler, "reason": "already_in_progress",
                                          "description_placeholders": None})
            if handler == "onvif" and not isinstance(data.get("advanced"), dict):
                return web.json_response(self.form(flow_id, handler, "user", self.FLOW_STEPS[handler], {"base": "unknown"}))
            f["device"] = waiting
            await asyncio.sleep(0.8)
            return web.json_response(self.after_device_found(flow_id))
        if step == "discovery_confirm":
            await asyncio.sleep(0.5)
            return web.json_response(self.after_device_found(flow_id))
        if step == "user_auth_confirm":
            if not data.get("username") or not data.get("password"):
                return web.json_response(self.form(flow_id, handler, "user_auth_confirm", self.AUTH_STEP, {"base": "invalid_auth"}))
            await asyncio.sleep(1.0)
            return web.json_response(self.finish_flow(flow_id))
        return web.json_response(self.current_step(flow_id))

    async def delete_entry(self, request):
        self.need_auth(request)
        try:
            self.world.remove_entry(request.match_info["entry_id"])
        except KeyError:
            return web.json_response({"message": "Invalid entry specified"}, status=404)
        return web.json_response({"require_restart": False})

    # ---- pages the app links to ----

    async def add_integration_page(self, request):
        domain = request.query.get("domain", "")
        accounts = {"tuya": "Smart Life", "xiaomi_miio": "Xiaomi", "petkit": "Petkit"}  # pretend cloud accounts
        if domain not in accounts:
            return page("Add integration", f'<div class="card"><span class="tag">Evra test hub</span><h1>Add {esc(domain)}</h1>'
                                           f'<p>Only the {", ".join(accounts.values())} accounts are pretend-linked here. Wi-Fi devices are added from the app with their IP address.</p></div>')
        rows = "".join(f'<form method="post" action="/panel/cloud-add"><input type="hidden" name="product" value="{x["product"]}"><button>Add {esc(BY_ID[x["product"]][1])}</button></form>'
                       for x in self.world.cloud if _handler_for(x["product"]) == domain) or "<p>Every device in the account has been added.</p>"
        return page(f"{accounts[domain]} · Evra test hub", f'<div class="card"><span class="tag">Evra test hub · {esc(accounts[domain])} account</span><h1>Devices in the account</h1>'
                                           f'<p>In Home Assistant, linking the account adds these by themselves. Add one to see it appear in the app.</p>{rows}</div>')

    async def automation_edit_page(self, request):
        return page("Automation", '<div class="card"><span class="tag">Evra test hub</span><h1>Edit in Evra</h1><p>The test hub has no automation editor of its own; '
                                  'edit automations in the app.</p></div>')

    # ---- control panel ----

    async def panel(self, request):
        return web.FileResponse(HERE / "panel.html")

    async def panel_state(self, request):
        w = self.world
        devices = []
        for d in sorted(w.devices.values(), key=lambda d: (d["name_by_user"] or d["name"] or "").lower()):
            if d["entry_type"] == "service":
                continue
            ents = [{"entity_id": e["entity_id"], "name": w.states[e["entity_id"]]["attributes"].get("friendly_name", e["entity_id"]),
                     "state": w.states[e["entity_id"]]["state"], "unit": w.states[e["entity_id"]]["attributes"].get("unit_of_measurement"),
                     "device_class": w.states[e["entity_id"]]["attributes"].get("device_class")}
                    for e in w.entities.values() if e["device_id"] == d["id"] and e["entity_id"] in w.states and not e["entity_category"]]
            devices.append({"id": d["id"], "name": d["name_by_user"] or d["name"], "model": d["model"], "area": (w.areas.get(d["area_id"]) or {}).get("name"),
                            "integration": w.config_entries.get(d["primary_config_entry"], {}).get("domain"), "entities": ents})
        helpers = [{"entity_id": s["entity_id"], "name": s["attributes"].get("friendly_name"), "state": s["state"]}
                   for s in w.states.values() if s["entity_id"].split(".")[0] in ("input_boolean", "sun", "automation")]
        return web.json_response({
            "version": HA_VERSION, "clients": len(self.clients), "login": self.auth.user, "origins": sorted(self.origins),
            "permit_left": max(0, round(w.permit_until - time.time())), "phone_app": w.phone_app,
            "push": {"ready": PUSH_AVAILABLE, "devices": sorted(w.push_regs)},
            "zigbee_products": [{"id": p[0], "name": p[1], "model": p[3]} for p in PRODUCTS if p[5] == "zigbee"],
            "wifi_products": [{"id": p[0], "name": p[1], "model": p[3]} for p in PRODUCTS if p[5] == "wifi"],
            "network": [{**x, "name": BY_ID[x["product"]][1], "model": BY_ID[x["product"]][3], "handler": _handler_for(x["product"])} for x in w.network],
            "matter": [{**x, "name": BY_ID[x["product"]][1]} for x in w.matter],
            "cloud": [{**x, "name": BY_ID[x["product"]][1]} for x in w.cloud],
            "devices": devices, "helpers": helpers, "notifications": w.notifications[:20], "activity": w.activity[-60:][::-1],
        })

    async def panel_action(self, request):
        a = await request.json()
        w = self.world
        kind = a.get("kind")
        try:
            if kind == "set":
                w.set_state(a["entity_id"], str(a["state"]))
                w.note(f"Panel: {a['entity_id']} → {a['state']}")
            elif kind == "trigger":
                eid = a["entity_id"]
                s = w.states[eid]
                if eid.startswith("event."):
                    w.set_state(eid, iso(), {"event_type": a.get("event_type", "single")})
                elif s["attributes"].get("device_class") in ("occupancy", "motion", "presence"):
                    w.set_state(eid, "on")
                    timeout = 15
                    asyncio.get_running_loop().call_later(timeout, lambda: w.set_state(eid, "off"))
                else:
                    w.set_state(eid, "off" if s["state"] == "on" else "on")
                w.note(f"Panel: {eid} fired")
            elif kind == "nudge":
                eid = a["entity_id"]
                v = float(w.state_of(eid)) + float(a["delta"])
                w.set_state(eid, f"{v:.1f}" if "." in str(a["delta"]) else str(round(v)))
            elif kind == "join":
                w.join_zigbee(a["product"])
            elif kind == "network-add":
                used = {x["host"] for x in w.network}
                n = 101
                while f"192.168.88.{n}" in used:
                    n += 1
                w.network.append({"product": a["product"], "host": f"192.168.88.{n}"})
                w.save_soon()
            elif kind == "phone":
                w.phone_app = bool(a.get("on"))
                w.note(f"Panel: phone with the Home Assistant app {'connected' if w.phone_app else 'removed'} (notify.notify {'available' if w.phone_app else 'gone'})")
                w.save_soon()
            elif kind == "push-test":
                if not w.push_regs:
                    raise HassError("No device has switched on Evra notifications yet")
                await w.call_service("notify", "send_message", {"title": "Test hub", "message": "A test from the control panel."},
                                     {"entity_id": [w._push_entity_id(n) for n in w.push_regs]}, source="panel")
            elif kind == "update-available":
                w.make_update_available()
            elif kind == "clear-notifications":
                w.notifications.clear()
            elif kind == "reset":
                w.engine.cancel_all()
                w.reset()
                for ev in ("device_registry_updated", "area_registry_updated", "entity_registry_updated"):
                    w.fire(ev, {"action": "update"})
                for s in w.states.values():
                    w.fire("state_changed", {"entity_id": s["entity_id"], "old_state": None, "new_state": s})
                w.note("Panel: test home reset to the snapshot (reload the app to see everything fresh)")
            else:
                return web.json_response({"error": f"unknown action {kind}"}, status=400)
        except (KeyError, ValueError, HassError) as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response({"ok": True})

    async def cloud_add(self, request):
        f = await request.post()
        item = next((x for x in self.world.cloud if x["product"] == f.get("product")), None)
        handler = _handler_for(item["product"]) if item else "tuya"
        if item:
            self.world.cloud.remove(item)
            self.world.create_device(item["product"], handler)
        raise web.HTTPFound(f"/config/integrations/dashboard/add?domain={handler}")

    def app(self):
        app = web.Application(middlewares=[self.cors])
        app.router.add_get("/", self.panel)
        app.router.add_get("/panel/api/state", self.panel_state)
        app.router.add_post("/panel/api/action", self.panel_action)
        app.router.add_post("/panel/cloud-add", self.cloud_add)
        app.router.add_route("*", "/auth/authorize", self.authorize_page)
        app.router.add_post("/auth/token", self.token)
        app.router.add_get("/api/websocket", self.websocket)
        app.router.add_get("/api/", self.api_root)
        app.router.add_route("POST", "/api/notify.html5", self.push_registration)
        app.router.add_route("DELETE", "/api/notify.html5", self.push_registration)
        app.router.add_route("*", "/api/config/automation/config/{cid}", self.automation_config)
        app.router.add_post("/api/config/config_entries/flow", self.flow_start)
        app.router.add_route("*", "/api/config/config_entries/flow/{flow_id}", self.flow_step)
        app.router.add_delete("/api/config/config_entries/entry/{entry_id}", self.delete_entry)
        app.router.add_get("/config/integrations/dashboard/add", self.add_integration_page)
        app.router.add_get("/config/automation/edit/{cid}", self.automation_edit_page)
        return app


def _handler_for(product_id):
    return BY_ID[product_id][6]


def _ts(value):
    from datetime import datetime
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()


def validate_automation(cfg):
    if not isinstance(cfg, dict):
        return "expected a dictionary"
    if not (cfg.get("triggers") or cfg.get("trigger")):
        return "required key not provided @ data['triggers']"
    if not (cfg.get("actions") or cfg.get("action")):
        return "required key not provided @ data['actions']"
    for t in (cfg.get("triggers") or cfg.get("trigger")):
        if not isinstance(t, dict) or not (t.get("trigger") or t.get("platform")):
            return "required key not provided @ data['triggers'][0]['trigger']"
    return None


async def main():
    # Windows consoles default to an old code page; names like "CO₂" or "°C" must not crash the hub.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Evra test hub (stands in for Home Assistant)")
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--origin", action="append", help="app address allowed to use the API (default: http://localhost:8010 and http://127.0.0.1:8010)")
    ap.add_argument("--data", help="folder for the saved home and test login (default: tools/test_hub/data); lets a second hub run separately")
    args = ap.parse_args()
    origins = args.origin or ["http://localhost:8010", "http://127.0.0.1:8010"]

    snapshot = HERE.parents[2] / "ha-snapshot"
    if not (snapshot / "home.json").exists():
        print(f"No snapshot at {snapshot}; starting with an empty home. "
              "Add devices from the control panel or the app's pairing screens.", flush=True)
    world = World(snapshot, Path(args.data) if args.data else HERE / "data")
    world.loop = asyncio.get_running_loop()
    world.push = Push(world.data_dir)
    world.load()
    world.engine = Engine(world)
    auth = Auth(world.data_dir)
    hub = Hub(world, auth, origins)

    runner = web.AppRunner(hub.app(), access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", args.port).start()
    print(f"Evra test hub (Home Assistant {HA_VERSION} stand-in) on http://localhost:{args.port}")
    print(f"  Control panel:  http://localhost:{args.port}   (the test login is shown there)")
    print(f"  In Evra: Settings > Connection > Live, address http://localhost:{args.port}")
    print(f"  Allowed app addresses: {', '.join(origins)}")
    if not PUSH_AVAILABLE:
        print("  Evra notifications can't be sent: python -m pip install pywebpush, then restart the hub.")
    print("  Close this window or press Ctrl+C to stop.\n", flush=True)
    tasks = [asyncio.create_task(world.tick()), asyncio.create_task(world.engine.clock())]
    try:
        await asyncio.Event().wait()
    finally:
        for t in tasks:
            t.cancel()
        world.save()
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
