"""The test hub's pretend home: states, registries, services and device behaviour.

Shapes follow Home Assistant 2026.11 (state objects, device / area / entity
registry entries, events), so the app sees what the real hub would send.
"""
import asyncio
import hashlib
import json
import random
import re
import secrets
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

from products import BY_ID, templates

HA_VERSION = "2026.11.1"
HISTORY_KEEP = 3 * 86400  # seconds of history to keep


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def new_id():
    return secrets.token_hex(13)  # Home Assistant uses 26-character ULIDs


def slug(text):
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_") or "item"


class ServiceNotFound(Exception):
    pass


class HassError(Exception):
    """Like HomeAssistantError: the call reached Home Assistant but failed."""


# Services the hub knows. Anything else answers "Service not found" like the real one.
SERVICES = {
    "light": {"turn_on", "turn_off", "toggle"},
    "switch": {"turn_on", "turn_off", "toggle"},
    "siren": {"turn_on", "turn_off", "toggle"},
    "fan": {"turn_on", "turn_off", "toggle"},
    "input_boolean": {"turn_on", "turn_off", "toggle"},
    "button": {"press"},
    "cover": {"open_cover", "close_cover", "stop_cover", "set_cover_position", "toggle"},
    "lock": {"lock", "unlock", "open"},
    "valve": {"open_valve", "close_valve", "toggle", "set_valve_position"},
    "climate": {"set_temperature", "set_hvac_mode", "turn_on", "turn_off"},
    "select": {"select_option"},
    "number": {"set_value"},
    "automation": {"turn_on", "turn_off", "toggle", "trigger", "reload"},
    "scene": {"turn_on", "create", "apply"},
    "homeassistant": {"turn_on", "turn_off", "toggle", "update_entity"},
    "persistent_notification": {"create", "dismiss"},
    "zha": {"permit", "remove"},
}


class World:
    def __init__(self, snapshot_dir: Path, data_dir: Path):
        self.snapshot_dir = snapshot_dir
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.states = {}
        self.devices = {}
        self.areas = {}
        self.entities = {}
        self.automations = {}       # config id -> config
        self.config_entries = {}    # entry id -> {entry_id, domain, title}
        self.history = {}           # entity id -> [[unix time, state], ...]
        self.scenes = {}            # scene entity id -> [(entity id, state, attributes)]
        self.network = []           # Wi-Fi devices waiting to be added: {product, host}
        self.matter = []            # Matter devices waiting: {product, code}
        self.cloud = []             # devices in the maker's cloud account: {product}
        self.notifications = []     # [{title, message, at, phone}]
        self.activity = []          # recent lines for the control panel
        self.phone_app = False      # a phone with the Home Assistant app (notify.notify)
        self.permit_until = 0.0
        self.listeners = []         # callables(event_type, data, context)
        self.engine = None
        self._save_task = None
        self.loop = None

    # ---- events and logging ----------------------------------------------------

    def fire(self, event_type, data, context=None):
        ctx = context or {"id": new_id(), "parent_id": None, "user_id": None}
        for fn in list(self.listeners):
            fn(event_type, data, ctx)

    def note(self, text):
        self.activity.append({"at": iso(), "text": text})
        del self.activity[:-200]
        print(f"[{datetime.now():%H:%M:%S}] {text}", flush=True)

    # ---- persistence -------------------------------------------------------------

    @property
    def world_file(self):
        return self.data_dir / "world.json"

    def save_soon(self):
        if self.loop is None:
            return
        if self._save_task and not self._save_task.done():
            return

        async def later():
            await asyncio.sleep(1)
            self.save()

        self._save_task = self.loop.create_task(later())

    def save(self):
        cutoff = time.time() - HISTORY_KEEP
        data = {
            "v": 1,
            "states": self.states, "devices": self.devices, "areas": self.areas, "entities": self.entities,
            "automations": self.automations, "config_entries": self.config_entries,
            "history": {k: [r for r in v if r[0] >= cutoff] for k, v in self.history.items()},
            "network": self.network, "matter": self.matter, "cloud": self.cloud, "phone_app": self.phone_app,
        }
        tmp = self.world_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(self.world_file)

    def load(self):
        if self.world_file.exists():
            try:
                data = json.loads(self.world_file.read_text(encoding="utf-8"))
                if data.get("v") == 1:
                    for key in ("states", "devices", "areas", "entities", "automations", "config_entries", "history", "network", "matter", "cloud"):
                        setattr(self, key, data[key])
                    self.phone_app = data.get("phone_app", False)
                    self.note("Loaded the saved test home")
                    return
            except (OSError, ValueError, KeyError) as e:
                self.note(f"Saved test home unreadable ({e}); starting from the snapshot")
        self.build_from_snapshot()

    def reset(self):
        for key in ("states", "devices", "areas", "entities", "automations", "config_entries", "history", "scenes"):
            setattr(self, key, {})
        self.build_from_snapshot()
        self.save()

    # ---- building the home from the snapshot -----------------------------------------

    def build_from_snapshot(self):
        home = json.loads((self.snapshot_dir / "home.json").read_text(encoding="utf-8"))
        autos = json.loads((self.snapshot_dir / "automations.json").read_text(encoding="utf-8"))
        hist = json.loads((self.snapshot_dir / "history.json").read_text(encoding="utf-8"))
        shift = time.time() - datetime.fromisoformat(hist["to"].replace("Z", "+00:00")).timestamp()
        generated = datetime.fromisoformat(home["generated"].replace("Z", "+00:00")).timestamp() + shift
        t0 = iso(datetime.fromtimestamp(generated, timezone.utc))

        for a in home["areas"]:
            self.areas[a["id"]] = self._area(a["id"], a["name"])
        area_by_name = {a["name"]: a["area_id"] for a in self.areas.values()}

        for d in home["devices"]:
            integration, service = self._integration_for(d)
            entry_id = self._entry_for(integration, d)
            dev = self._device(d["id"], d["name"], d.get("manufacturer"), d.get("model"), d.get("firmware"),
                               area_by_name.get(d.get("area")), entry_id, integration, service)
            self.devices[dev["id"]] = dev
            for e in d["entities"]:
                self._add_snapshot_entity(e, dev, entry_id, integration, t0)
        for e in home["entitiesWithoutDevice"]:
            domain = e["id"].split(".")[0]
            self._add_snapshot_entity(e, None, None, domain, t0)

        for row in autos:
            cfg = row["config"]
            self.automations[cfg["id"]] = cfg
            if row["entity_id"] in self.states:
                st = self.states[row["entity_id"]]
                st["state"] = "on" if row.get("enabled", True) else "off"
                st["attributes"].setdefault("current", 0)
                self.entities[row["entity_id"]]["unique_id"] = cfg["id"]

        for eid, rows in hist["series"].items():
            self.history[eid] = [[datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() + shift, s] for t, s in rows]
            if rows and eid in self.states:
                self.states[eid]["last_changed"] = iso(datetime.fromtimestamp(self.history[eid][-1][0], timezone.utc))

        # Devices waiting to be added, so every pairing method can be tried.
        self.network = [{"product": p, "host": f"192.168.88.{101 + i}"} for i, p in
                        enumerate(["plug", "bulb", "led-strip", "leak", "boiler-relay", "ir-kit", "camera-indoor", "camera-outdoor"])]
        self.matter = [{"product": "lock", "code": "3497-011-2332"}, {"product": "co2", "code": "0251-520-0076"}]
        self.cloud = [{"product": "siren"}, {"product": "curtain"}]
        self.note("Built the test home from ha-snapshot")

    @staticmethod
    def _integration_for(d):
        maker = d.get("manufacturer") or ""
        model = d.get("model") or ""
        if maker in ("SONOFF", "eWeLink"):
            return "zha", False
        if maker == "TP-Link":
            return "tplink", False
        if model == "rpipicow":
            return "esphome", False
        if d["name"] == "Sun":
            return "sun", True
        if maker == "Met.no":
            return "met", True
        if maker == "Raspberry Pi":
            return "rpi_power", False
        if maker == "Home Assistant" and "Backup" in model:
            return "backup", True
        return "hassio", True

    def _entry_for(self, integration, d):
        # Zigbee shares one entry; Wi-Fi integrations get one entry per device.
        if integration in ("zha", "matter", "tuya", "sun", "met", "hassio", "backup", "rpi_power"):
            entry_id = f"entry_{integration}"
            title = {"zha": "Sonoff Zigbee 3.0 USB Dongle Lite MG21", "matter": "Matter", "tuya": "Smart Life account"}.get(integration, integration)
        else:
            entry_id = f"entry_{integration}_{d['id'][:8]}"
            title = d.get("name") or integration
        self.config_entries.setdefault(entry_id, {"entry_id": entry_id, "domain": integration, "title": title})
        return entry_id

    @staticmethod
    def _area(area_id, name):
        t = time.time()
        return {"aliases": [], "area_id": area_id, "floor_id": None, "humidity_entity_id": None, "icon": None, "labels": [],
                "name": name, "picture": None, "temperature_entity_id": None, "created_at": t, "modified_at": t}

    @staticmethod
    def _device(dev_id, name, maker, model, firmware, area_id, entry_id, integration, service=False):
        t = time.time()
        ieee = ":".join(hashlib.sha1(dev_id.encode()).hexdigest()[i:i + 2] for i in range(0, 16, 2))
        identifiers = [["zha", ieee]] if integration == "zha" else [[integration, dev_id]]
        return {
            "area_id": area_id, "config_entries": [entry_id], "config_entries_subentries": {entry_id: [None]},
            "configuration_url": None, "connections": [], "created_at": t, "disabled_by": None,
            "entry_type": "service" if service else None, "hw_version": None, "id": dev_id, "identifiers": identifiers,
            "labels": [], "manufacturer": maker, "model": model, "model_id": None, "modified_at": t,
            "name_by_user": None, "name": name, "primary_config_entry": entry_id, "serial_number": None,
            "sw_version": firmware, "via_device_id": None,
        }

    def _add_snapshot_entity(self, e, dev, entry_id, platform, t0):
        attrs = {**(e.get("attrs") or {})}
        if e.get("class"):
            attrs["device_class"] = e["class"]
        if e.get("unit"):
            attrs["unit_of_measurement"] = e["unit"]
        attrs["friendly_name"] = e["name"]
        prefix = (dev["name"] + " ") if dev else None
        has_name = bool(dev) and (e["name"] == dev["name"] or e["name"].startswith(prefix))
        original = (e["name"][len(prefix):] if e["name"].startswith(prefix or "\0") else None) if has_name else e["name"]
        self.states[e["id"]] = self._state(e["id"], str(e["state"]), attrs, t0)
        self.entities[e["id"]] = self._entity(e["id"], dev["id"] if dev else None, entry_id, platform, original, has_name,
                                              e.get("category"), "user" if e.get("hidden") else None)

    @staticmethod
    def _state(entity_id, state, attributes, when=None):
        t = when or iso()
        return {"entity_id": entity_id, "state": state, "attributes": attributes, "last_changed": t, "last_reported": t,
                "last_updated": t, "context": {"id": new_id(), "parent_id": None, "user_id": None}}

    @staticmethod
    def _entity(entity_id, device_id, entry_id, platform, original_name, has_entity_name, category=None, hidden_by=None):
        t = time.time()
        return {"area_id": None, "categories": {}, "config_entry_id": entry_id, "config_subentry_id": None, "created_at": t,
                "device_id": device_id, "disabled_by": None, "entity_category": category, "entity_id": entity_id,
                "has_entity_name": has_entity_name, "hidden_by": hidden_by, "icon": None, "id": new_id(), "labels": [],
                "modified_at": t, "name": None, "options": {}, "original_name": original_name, "platform": platform,
                "translation_key": None, "unique_id": f"{device_id or platform}-{entity_id}"}

    # ---- states ------------------------------------------------------------------

    def state_of(self, entity_id):
        s = self.states.get(entity_id)
        return s["state"] if s else None

    def set_state(self, entity_id, state=None, attrs=None, context=None, force=False):
        old = self.states.get(entity_id)
        if old is None:
            return
        new = {**old, "attributes": {**old["attributes"], **(attrs or {})}}
        if state is not None:
            new["state"] = str(state)
        t = iso()
        changed = new["state"] != old["state"]
        if not changed and new["attributes"] == old["attributes"] and not force:
            return
        new["last_updated"] = new["last_reported"] = t
        if changed:
            new["last_changed"] = t
            self.history.setdefault(entity_id, []).append([time.time(), new["state"]])
        new["context"] = context or {"id": new_id(), "parent_id": None, "user_id": None}
        self.states[entity_id] = new
        self.fire("state_changed", {"entity_id": entity_id, "old_state": old, "new_state": new}, new["context"])
        self.save_soon()
        self._device_behaviour(entity_id, old, new)
        if changed and self.engine:
            self.engine.state_changed(entity_id, old, new)

    def add_state(self, entity_id, state, attributes):
        self.states[entity_id] = self._state(entity_id, str(state), attributes)
        self.history.setdefault(entity_id, []).append([time.time(), str(state)])
        self.fire("state_changed", {"entity_id": entity_id, "old_state": None, "new_state": self.states[entity_id]})

    def remove_state(self, entity_id):
        old = self.states.pop(entity_id, None)
        if old:
            self.fire("state_changed", {"entity_id": entity_id, "old_state": old, "new_state": None})

    def siblings(self, entity_id):
        dev = self.entities.get(entity_id, {}).get("device_id")
        return [e["entity_id"] for e in self.entities.values() if dev and e["device_id"] == dev]

    def _device_behaviour(self, entity_id, old, new):
        # A plug's power and current follow its switch.
        if entity_id.startswith("switch.") and old["state"] != new["state"]:
            for sib in self.siblings(entity_id):
                dc = self.states.get(sib, {}).get("attributes", {}).get("device_class")
                if dc == "power":
                    self.set_state(sib, ("9.0" if new["state"] == "on" else "0.0"))
                elif dc == "current":
                    self.set_state(sib, ("0.07" if new["state"] == "on" else "0.00"))

    # ---- services ----------------------------------------------------------------

    def resolve_targets(self, data, target):
        ids = []

        def add(x):
            for v in ([x] if isinstance(x, str) else (x or [])):
                if v and v not in ids:
                    ids.append(v)

        target = target or {}
        add(target.get("entity_id"))
        add(data.get("entity_id"))
        for dev_id in ([target["device_id"]] if isinstance(target.get("device_id"), str) else target.get("device_id") or []):
            add([e["entity_id"] for e in self.entities.values() if e["device_id"] == dev_id])
        for area_id in ([target["area_id"]] if isinstance(target.get("area_id"), str) else target.get("area_id") or []):
            devs = {d["id"] for d in self.devices.values() if d["area_id"] == area_id}
            add([e["entity_id"] for e in self.entities.values() if e["area_id"] == area_id or (not e["area_id"] and e["device_id"] in devs)])
        return ids

    def services(self):
        out = {d: set(s) for d, s in SERVICES.items()}
        if self.phone_app:
            out["notify"] = {"notify", "mobile_app_phone"}
        return out

    async def call_service(self, domain, service, data=None, target=None, context=None, source="app"):
        data = dict(data or {})
        if service not in self.services().get(domain, set()):
            raise ServiceNotFound(f"Action {domain}.{service} not found")
        ids = self.resolve_targets(data, target)
        for key in ("entity_id", "device_id", "area_id"):
            data.pop(key, None)
        if source == "app":
            self.note(f"App called {domain}.{service} {', '.join(ids) if ids else ''} {json.dumps(data) if data else ''}".rstrip())

        if domain == "persistent_notification":
            if service == "create":
                self._notify(data.get("title"), data.get("message", ""), phone=False)
            return None
        if domain == "notify":
            self._notify(data.get("title"), data.get("message", ""), phone=True)
            return None
        if domain == "zha":
            if service == "permit":
                secs = int(data.get("duration", 60))
                self.permit_until = time.time() + secs if secs > 0 else 0
                self.note(f"Zigbee pairing {'open for ' + str(secs) + ' s' if secs else 'closed'}")
            elif service == "remove":
                ieee = data.get("ieee")
                dev = next((d for d in self.devices.values() if ["zha", ieee] in d["identifiers"]), None)
                if not dev:
                    raise HassError(f"No Zigbee device with IEEE {ieee}")
                await asyncio.sleep(1.0)
                self.remove_device(dev["id"])
            return None
        if domain == "scene" and service == "create":
            snaps = [(e, self.states[e]["state"], dict(self.states[e]["attributes"])) for e in self._as_list(data.get("snapshot_entities")) if e in self.states]
            scene_id = f"scene.{data['scene_id']}"
            self.scenes[scene_id] = snaps
            if scene_id not in self.states:
                self.add_state(scene_id, iso(), {"friendly_name": data["scene_id"], "entity_id": [s[0] for s in snaps]})
            return None
        if domain == "automation" and service == "reload":
            return None

        for eid in ids:
            if eid not in self.states:
                continue  # Home Assistant only logs missing entities
            if domain != "homeassistant" and eid.split(".")[0] != domain:
                continue
            await self._entity_service(eid.split(".")[0] if domain == "homeassistant" else domain, service, eid, data, context)
        return None

    @staticmethod
    def _as_list(x):
        return [x] if isinstance(x, str) else list(x or [])

    def _notify(self, title, message, phone):
        self.notifications.insert(0, {"title": title or "Home Assistant", "message": message, "at": iso(), "phone": phone})
        del self.notifications[50:]
        self.note(f"{'Phone notification' if phone else 'Notification'}: {title or ''} {message}".strip())

    async def _entity_service(self, domain, service, eid, data, context):
        cur = self.state_of(eid)
        attrs = self.states[eid]["attributes"]
        if domain == "light":
            if service == "turn_off" or (service == "toggle" and cur == "on"):
                self.set_state(eid, "off", context=context)
            else:
                self._light_on(eid, data, context)
        elif domain in ("switch", "input_boolean", "siren", "fan"):
            on = service == "turn_on" or (service == "toggle" and cur != "on")
            self.set_state(eid, "on" if on else "off", context=context)
        elif domain == "button":
            self.set_state(eid, iso(), context=context)
        elif domain == "automation":
            if service == "trigger":
                if self.engine:
                    self.loop.create_task(self.engine.run(attrs.get("id"), {"platform": None, "description": "manual trigger"}, skip_conditions=data.get("skip_condition", True)))
            else:
                on = service == "turn_on" or (service == "toggle" and cur != "on")
                self.set_state(eid, "on" if on else "off", context=context)
        elif domain == "scene":
            for e, s, a in self.scenes.get(eid, []):
                self.set_state(e, s, a, context=context)
        elif domain == "cover":
            pos = attrs.get("current_position", 100 if cur == "open" else 0)
            target = {"open_cover": 100, "close_cover": 0, "set_cover_position": data.get("position"), "toggle": 100 if cur == "closed" else 0}.get(service)
            if service == "stop_cover":
                self.set_state(eid, "open" if pos > 0 else "closed", context=context)
            elif target is not None and int(target) != pos:
                self.set_state(eid, "opening" if target > pos else "closing", context=context)
                await asyncio.sleep(1.6)
                self.set_state(eid, "closed" if int(target) == 0 else "open", {"current_position": int(target)})
        elif domain == "lock":
            self.set_state(eid, "unlocked" if service in ("unlock", "open") else "locked", context=context)
        elif domain == "valve":
            if service == "toggle":
                service = "close_valve" if cur == "open" else "open_valve"
            self.set_state(eid, "open" if service in ("open_valve", "set_valve_position") else "closed", context=context)
        elif domain == "climate":
            if service == "set_temperature":
                mode = data.get("hvac_mode") or cur
                self.set_state(eid, mode, {"temperature": float(data["temperature"])}, context=context)
            elif service == "set_hvac_mode":
                self.set_state(eid, data["hvac_mode"], {"hvac_action": "off" if data["hvac_mode"] == "off" else "heating"}, context=context)
            elif service == "turn_off":
                self.set_state(eid, "off", {"hvac_action": "off"}, context=context)
            else:
                self.set_state(eid, "heat", {"hvac_action": "heating"}, context=context)
        elif domain == "select":
            if data.get("option") not in (attrs.get("options") or [data.get("option")]):
                raise HassError(f"Invalid option: {data.get('option')}")
            self.set_state(eid, data["option"], context=context)
        elif domain == "number":
            self.set_state(eid, str(data["value"]), context=context)

    def _light_on(self, eid, data, context):
        a = dict(self.states[eid]["attributes"])
        modes = a.get("supported_color_modes") or []
        if modes == ["onoff"]:
            self.set_state(eid, "on", {"color_mode": "onoff"}, context=context)
            return
        if data.get("effect") and data["effect"] not in (a.get("effect_list") or []):
            raise HassError(f"Effect {data['effect']} is not supported by {eid}")
        if "brightness_pct" in data:
            a["brightness"] = round(float(data["brightness_pct"]) / 100 * 255)
        if "brightness" in data:
            a["brightness"] = int(data["brightness"])
        if not a.get("brightness"):
            a["brightness"] = 255
        if data.get("rgb_color"):
            r, g, b = [x / 255 for x in data["rgb_color"]]
            mx, mn = max(r, g, b), min(r, g, b)
            d = mx - mn
            h = 0 if d == 0 else (60 * (((g - b) / d) % 6) if mx == r else 60 * ((b - r) / d + 2) if mx == g else 60 * ((r - g) / d + 4))
            data = {**data, "hs_color": [round(h), round((d / mx * 100) if mx else 0)]}
        if data.get("hs_color"):
            a.update(hs_color=list(data["hs_color"]), color_mode="hs", color_temp_kelvin=None)
            if a.get("effect"):
                a["effect"] = "off"
        if data.get("color_temp_kelvin"):
            a.update(color_temp_kelvin=int(data["color_temp_kelvin"]), color_mode="color_temp", hs_color=None)
            if a.get("effect"):
                a["effect"] = "off"
        if data.get("effect"):
            a["effect"] = "off" if data["effect"] == "Off" else data["effect"]
        self.set_state(eid, "on", a, context=context)

    # ---- registries --------------------------------------------------------------

    def create_area(self, name):
        if any(a["name"].lower() == name.lower() for a in self.areas.values()):
            raise HassError(f"The name {name} ({slug(name)}) is already in use")
        area_id, i = slug(name), 2
        while area_id in self.areas:
            area_id, i = f"{slug(name)}_{i}", i + 1
        self.areas[area_id] = self._area(area_id, name)
        self.fire("area_registry_updated", {"action": "create", "area_id": area_id})
        self.save_soon()
        return self.areas[area_id]

    def update_area(self, area_id, **changes):
        a = self.areas.get(area_id)
        if not a:
            raise KeyError(area_id)
        a.update({k: v for k, v in changes.items() if k in ("name", "icon", "aliases", "floor_id", "labels", "picture")})
        a["modified_at"] = time.time()
        self.fire("area_registry_updated", {"action": "update", "area_id": area_id})
        self.save_soon()
        return a

    def delete_area(self, area_id):
        if area_id not in self.areas:
            raise KeyError(area_id)
        del self.areas[area_id]
        for d in self.devices.values():
            if d["area_id"] == area_id:
                d["area_id"] = None
                self.fire("device_registry_updated", {"action": "update", "device_id": d["id"], "changes": {"area_id": area_id}})
        for e in self.entities.values():
            if e["area_id"] == area_id:
                e["area_id"] = None
        self.fire("area_registry_updated", {"action": "remove", "area_id": area_id})
        self.save_soon()

    def update_device(self, device_id, **changes):
        d = self.devices.get(device_id)
        if not d:
            raise KeyError(device_id)
        if "area_id" in changes and changes["area_id"] and changes["area_id"] not in self.areas:
            raise HassError(f"Area {changes['area_id']} doesn't exist")
        old_name = d["name_by_user"] or d["name"]
        prev = {k: d.get(k) for k in changes}
        for k in ("area_id", "name_by_user", "disabled_by", "labels"):
            if k in changes:
                d[k] = changes[k]
        d["modified_at"] = time.time()
        self.fire("device_registry_updated", {"action": "update", "device_id": device_id, "changes": prev})
        # Entity names follow the device name ("<device> <entity>").
        new_name = d["name_by_user"] or d["name"]
        if new_name != old_name:
            for e in self.entities.values():
                if e["device_id"] == device_id and e["has_entity_name"] and not e["name"] and e["entity_id"] in self.states:
                    fn = f"{new_name} {e['original_name']}" if e["original_name"] else new_name
                    self.set_state(e["entity_id"], attrs={"friendly_name": fn})
        self.save_soon()
        return d

    def remove_device(self, device_id):
        d = self.devices.pop(device_id, None)
        if not d:
            return
        for e in [e for e in self.entities.values() if e["device_id"] == device_id]:
            del self.entities[e["entity_id"]]
            self.remove_state(e["entity_id"])
            self.fire("entity_registry_updated", {"action": "remove", "entity_id": e["entity_id"]})
        self.fire("device_registry_updated", {"action": "remove", "device_id": device_id, "device": d})
        self.note(f"Removed device {d['name_by_user'] or d['name']}")
        self.save_soon()

    def remove_entry(self, entry_id):
        entry = self.config_entries.pop(entry_id, None)
        if not entry:
            raise KeyError(entry_id)
        for d in [d for d in self.devices.values() if entry_id in d["config_entries"]]:
            self.remove_device(d["id"])
        self.note(f"Deleted integration entry {entry['title']} ({entry['domain']})")
        self.save_soon()

    def entry_devices(self, entry_id):
        return [d for d in self.devices.values() if entry_id in d["config_entries"]]

    # ---- pairing -----------------------------------------------------------------

    def create_device(self, product_id, integration, host=None):
        pid, name, maker, model, kind, _, _ = BY_ID[product_id]
        dev_id = secrets.token_hex(16)
        if integration in ("zha", "matter", "tuya"):
            entry_id = f"entry_{integration}"
            self.config_entries.setdefault(entry_id, {"entry_id": entry_id, "domain": integration,
                                                      "title": {"zha": "Sonoff Zigbee 3.0 USB Dongle Lite MG21", "matter": "Matter", "tuya": "Smart Life account"}[integration]})
        else:
            entry_id = f"entry_{integration}_{dev_id[:8]}"
            self.config_entries[entry_id] = {"entry_id": entry_id, "domain": integration, "title": name}
        # Entity IDs like "switch.smart_plug"; a second one becomes "smart_plug_2".
        base, n = slug(name), 2
        taken = {s.split(".", 1)[1] for s in self.states}
        while any(o == base or o.startswith(base + "_") for o in taken):
            base, n = f"{slug(name)}_{n}", n + 1
        dev = self._device(dev_id, name, maker, model, "1.0.0", None, entry_id, integration)
        if host:
            dev["configuration_url"] = f"http://{host}"
        self.devices[dev_id] = dev
        self.fire("device_registry_updated", {"action": "create", "device_id": dev_id})
        for t in templates(product_id):
            eid = f"{t['domain']}.{base}{'_' + t['suffix'] if t['suffix'] else ''}"
            label = t["label"] or None
            self.entities[eid] = self._entity(eid, dev_id, entry_id, integration, label, True, t.get("category"))
            self.add_state(eid, t["state"], {**t["attrs"], "friendly_name": f"{name} {label}" if label else name})
            self.fire("entity_registry_updated", {"action": "create", "entity_id": eid})
        self.note(f"New device joined: {name} ({model}) through {integration}")
        self.save_soon()
        return dev_id

    def join_zigbee(self, product_id):
        if time.time() > self.permit_until:
            raise HassError("Zigbee pairing isn't open. Start pairing in the app first.")
        if BY_ID[product_id][5] != "zigbee":
            raise HassError(f"{BY_ID[product_id][1]} isn't a Zigbee device")
        return self.create_device(product_id, "zha")

    # ---- slow changes over time ----------------------------------------------------

    async def tick(self):
        """Plugs wobble around their power, rooms drift, heated rooms warm up."""
        n = 0
        while True:
            await asyncio.sleep(5)
            n += 1
            for s in list(self.states.values()):
                if s["attributes"].get("device_class") != "power" or not s["entity_id"].startswith("sensor."):
                    continue
                sw = next((x for x in self.siblings(s["entity_id"]) if x.startswith("switch.") and not self.entities[x]["entity_category"]), None)
                if sw and self.state_of(sw) != "on":
                    continue
                w = 8.7 + random.random() * 0.5
                self.set_state(s["entity_id"], f"{w:.1f}")
            if n % 9 == 0:  # every 45 s
                heater_on = self.state_of("input_boolean.heater_on") == "on"
                for s in list(self.states.values()):
                    eid = s["entity_id"]
                    if eid.startswith("sensor.") and s["attributes"].get("device_class") == "temperature":
                        try:
                            t = float(s["state"])
                        except ValueError:
                            continue
                        step = 0.1 if heater_on and random.random() < 0.6 else (-0.1 if not heater_on and random.random() < 0.5 else 0)
                        if step:
                            self.set_state(eid, f"{t + step:.1f}")
                    elif eid.startswith("climate."):
                        cur, target = s["attributes"].get("current_temperature"), s["attributes"].get("temperature")
                        if cur is None or target is None:
                            continue
                        goal = 17 if s["state"] == "off" else target
                        if abs(goal - cur) >= 0.1:
                            nxt = round(cur + (0.1 if goal > cur else -0.1), 1)
                            self.set_state(eid, attrs={"current_temperature": nxt, "hvac_action": "off" if s["state"] == "off" else ("heating" if goal > nxt else "idle")})

    # ---- history -------------------------------------------------------------------

    def history_during(self, entity_ids, start, end):
        out = {}
        for eid in entity_ids:
            rows = sorted(self.history.get(eid, []))
            before = [r for r in rows if r[0] < start]
            inside = [r for r in rows if start <= r[0] <= end]
            result = []
            if before:
                result.append({"s": before[-1][1], "lu": start})
            elif not inside and eid in self.states:
                result.append({"s": self.states[eid]["state"], "lu": start})
            result += [{"s": s, "lu": t} for t, s in inside]
            if result:
                out[eid] = result
        return out
