"""Runs automations inside the test hub, like Home Assistant does.

Covers what the app's editor and the home's own automations use: state and
numeric triggers (with "for"), time and sun triggers; state, numeric, time,
sun, trigger, and/or/not conditions; actions, delays, repeat, if, choose and
stop. Templates can't be evaluated here, so template conditions pass.
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone

from world import ServiceNotFound, HassError, iso, new_id


def as_list(x):
    return [] if x is None else (x if isinstance(x, list) else [x])


def seconds(d):
    if isinstance(d, (int, float)):
        return float(d)
    if isinstance(d, str):
        parts = [float(p) for p in d.split(":")]
        while len(parts) < 3:
            parts.insert(0, 0.0)
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if isinstance(d, dict):
        return d.get("hours", 0) * 3600 + d.get("minutes", 0) * 60 + d.get("seconds", 0) + d.get("milliseconds", 0) / 1000
    return 0.0


class Engine:
    def __init__(self, world):
        self.world = world
        self.running = {}   # config id -> task
        self.pending = {}   # (config id, trigger index) -> handle for "for" triggers
        self.last_minute = None

    # ---- helpers -----------------------------------------------------------------

    def entity_for(self, config_id):
        for s in self.world.states.values():
            if s["entity_id"].startswith("automation.") and s["attributes"].get("id") == config_id:
                return s["entity_id"]
        return None

    def enabled(self, config_id):
        ent = self.entity_for(config_id)
        return ent and self.world.state_of(ent) == "on"

    @staticmethod
    def kind(t):
        return t.get("trigger") or t.get("platform")

    # ---- state triggers ------------------------------------------------------------

    @staticmethod
    def holds(t, state):
        if state is None:
            return False
        k = t.get("trigger") or t.get("platform")
        if k == "state":
            return t.get("to") is None or str(state["state"]) in [str(x) for x in as_list(t["to"])]
        if k == "numeric_state":
            try:
                v = float(state["state"])
            except (TypeError, ValueError):
                return False
            return (t.get("above") is None or v > float(t["above"])) and (t.get("below") is None or v < float(t["below"]))
        return False

    def matches(self, t, old, new):
        k = self.kind(t)
        if t.get("attribute"):
            return False
        if k == "state":
            if t.get("from") is not None and str(old["state"]) not in [str(x) for x in as_list(t["from"])]:
                return False
            return self.holds(t, new)
        if k == "numeric_state":
            return self.holds(t, new) and not self.holds(t, old)
        return False

    def state_changed(self, entity_id, old, new):
        for config_id, cfg in list(self.world.automations.items()):
            if not self.enabled(config_id):
                continue
            fired = False
            for i, t in enumerate(as_list(cfg.get("triggers") or cfg.get("trigger"))):
                if self.kind(t) not in ("state", "numeric_state") or entity_id not in as_list(t.get("entity_id")):
                    continue
                key = (config_id, i)
                if t.get("for") is not None:
                    if not self.holds(t, new):
                        handle = self.pending.pop(key, None)
                        if handle:
                            handle.cancel()
                        continue
                    if self.matches(t, old, new) and key not in self.pending:
                        def fire(cid=config_id, trig=t, eid=entity_id, k=key, o=old):
                            self.pending.pop(k, None)
                            if self.enabled(cid) and self.holds(trig, self.world.states.get(eid)):
                                self.start(cid, {"platform": self.kind(trig), "id": trig.get("id", str(k[1])), "entity_id": eid,
                                                 "from_state": o, "to_state": self.world.states.get(eid), "for": trig["for"]})
                        self.pending[key] = self.world.loop.call_later(seconds(t["for"]), fire)
                    continue
                if not fired and self.matches(t, old, new):
                    fired = True
                    self.start(config_id, {"platform": self.kind(t), "id": t.get("id", str(i)), "entity_id": entity_id, "from_state": old, "to_state": new})

    # ---- time and sun triggers -------------------------------------------------------

    def sun_times(self):
        """Today's sunrise and sunset (local), from sun.sun's next_rising / next_setting."""
        a = self.world.states.get("sun.sun", {}).get("attributes", {})
        out = {}
        for key, name in (("next_rising", "sunrise"), ("next_setting", "sunset")):
            try:
                t = datetime.fromisoformat(a[key]).astimezone()
                out[name] = t.hour * 60 + t.minute
            except (KeyError, ValueError):
                out[name] = 8 * 60 if name == "sunrise" else 16 * 60 + 45
        return out

    async def clock(self):
        while True:
            await asyncio.sleep(5)
            local = datetime.now().astimezone()
            minute = local.strftime("%H:%M")
            if minute == self.last_minute:
                continue
            self.last_minute = minute
            mins = local.hour * 60 + local.minute
            sun = self.sun_times()
            # Keep sun.sun in step with the clock.
            up = sun["sunrise"] <= mins < sun["sunset"]
            want = "above_horizon" if up else "below_horizon"
            if self.world.state_of("sun.sun") not in (None, want):
                self.world.set_state("sun.sun", want)
            for config_id, cfg in list(self.world.automations.items()):
                if not self.enabled(config_id):
                    continue
                for t in as_list(cfg.get("triggers") or cfg.get("trigger")):
                    k = self.kind(t)
                    if k == "time" and any(str(at)[:5] == minute for at in as_list(t.get("at"))):
                        self.start(config_id, {"platform": "time", "id": t.get("id"), "now": iso()})
                        break
                    if k == "sun":
                        offset = seconds(str(t.get("offset", "0")).lstrip("-")) / 60 * (-1 if str(t.get("offset", "")).startswith("-") else 1)
                        if mins == round(sun[t.get("event", "sunset")] + offset):
                            self.start(config_id, {"platform": "sun", "id": t.get("id"), "event": t.get("event")})
                            break

    # ---- conditions -------------------------------------------------------------------

    def condition(self, c, trigger):
        k = c.get("condition")
        if k == "state":
            want = [str(x) for x in as_list(c.get("state"))]
            return all(self.world.state_of(e) in want for e in as_list(c.get("entity_id")))
        if k == "numeric_state":
            for e in as_list(c.get("entity_id")):
                try:
                    v = float(self.world.state_of(e))
                except (TypeError, ValueError):
                    return False
                if (c.get("above") is not None and not v > float(c["above"])) or (c.get("below") is not None and not v < float(c["below"])):
                    return False
            return True
        if k == "time":
            local = datetime.now().astimezone()
            mins = local.hour * 60 + local.minute
            days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            if c.get("weekday") and days[local.weekday()] not in as_list(c["weekday"]):
                return False
            to_min = lambda s: int(str(s)[:2]) * 60 + int(str(s)[3:5])
            after = to_min(c["after"]) if c.get("after") else None
            before = to_min(c["before"]) if c.get("before") else None
            if after is not None and before is not None and after > before:
                return mins >= after or mins < before
            return (after is None or mins >= after) and (before is None or mins < before)
        if k == "sun":
            sun = self.sun_times()
            local = datetime.now().astimezone()
            mins = local.hour * 60 + local.minute
            ok = True
            if c.get("after"):
                ok &= mins >= sun[c["after"]]
            if c.get("before"):
                ok &= mins < sun[c["before"]]
            return ok
        if k == "trigger":
            return str(trigger.get("id")) in [str(x) for x in as_list(c.get("id"))]
        if k == "and":
            return all(self.condition(x, trigger) for x in as_list(c.get("conditions")))
        if k == "or":
            return any(self.condition(x, trigger) for x in as_list(c.get("conditions")))
        if k == "not":
            return not any(self.condition(x, trigger) for x in as_list(c.get("conditions")))
        return True  # templates and other kinds aren't evaluated by the test hub

    # ---- running -----------------------------------------------------------------------

    def start(self, config_id, trigger, skip_conditions=False):
        self.world.loop.create_task(self.run(config_id, trigger, skip_conditions))

    async def run(self, config_id, trigger, skip_conditions=False):
        cfg = self.world.automations.get(config_id)
        ent = self.entity_for(config_id)
        if not cfg or not ent:
            return
        mode = cfg.get("mode", "single")
        current = self.running.get(config_id)
        if current and not current.done():
            if mode == "single":
                self.world.note(f"Automation '{cfg.get('alias')}' is already running; new trigger ignored")
                return
            if mode == "restart":
                current.cancel()
            elif mode in ("queued", "parallel"):
                await asyncio.wait([current])
        if not skip_conditions and not all(self.condition(c, trigger) for c in as_list(cfg.get("conditions") or cfg.get("condition"))):
            return
        context = {"id": new_id(), "parent_id": None, "user_id": None}
        self.world.note(f"Automation '{cfg.get('alias')}' triggered by {trigger.get('platform') or 'hand'}{' (' + trigger['entity_id'] + ')' if trigger.get('entity_id') else ''}")

        async def body():
            self.world.set_state(ent, attrs={"last_triggered": iso(), "current": 1}, context=context)
            try:
                await self.sequence(as_list(cfg.get("actions") or cfg.get("action")), trigger, context, cfg.get("alias"))
            except asyncio.CancelledError:
                raise
            except _Stop:
                pass
            except Exception as e:  # an action failed: the run stops, like in Home Assistant
                self.world.note(f"Automation '{cfg.get('alias')}' stopped: {e}")
            finally:
                if self.running.get(config_id) is task:
                    self.running.pop(config_id, None)
                    self.world.set_state(ent, attrs={"current": 0})

        task = self.world.loop.create_task(body())
        self.running[config_id] = task

    async def sequence(self, actions, trigger, context, alias):
        for a in actions:
            if a.get("enabled") is False:
                continue
            svc = a.get("action") or a.get("service")
            if svc:
                domain, service = svc.split(".", 1)
                try:
                    await self.world.call_service(domain, service, a.get("data") or a.get("data_template") or {}, a.get("target"),
                                                  {"id": new_id(), "parent_id": context["id"], "user_id": None}, source="automation")
                except (ServiceNotFound, HassError, KeyError, ValueError) as e:
                    if a.get("continue_on_error"):
                        self.world.note(f"Automation '{alias}': {svc} failed ({e}), continuing")
                        continue
                    raise HassError(f"{svc} failed: {e}") from e
            elif "delay" in a:
                await asyncio.sleep(seconds(a["delay"]))
            elif "repeat" in a:
                r = a["repeat"]
                if "count" in r:
                    for _ in range(int(r["count"])):
                        await self.sequence(as_list(r.get("sequence")), trigger, context, alias)
                elif "while" in r:
                    n = 0
                    while n < 1000 and all(self.condition(c, trigger) for c in as_list(r["while"])):
                        await self.sequence(as_list(r.get("sequence")), trigger, context, alias)
                        n += 1
                elif "until" in r:
                    n = 0
                    while True:
                        await self.sequence(as_list(r.get("sequence")), trigger, context, alias)
                        n += 1
                        if n >= 1000 or all(self.condition(c, trigger) for c in as_list(r["until"])):
                            break
            elif "if" in a:
                branch = a.get("then") if all(self.condition(c, trigger) for c in as_list(a["if"])) else a.get("else")
                await self.sequence(as_list(branch), trigger, context, alias)
            elif "choose" in a:
                for opt in as_list(a["choose"]):
                    if all(self.condition(c, trigger) for c in as_list(opt.get("conditions"))):
                        await self.sequence(as_list(opt.get("sequence")), trigger, context, alias)
                        break
                else:
                    await self.sequence(as_list(a.get("default")), trigger, context, alias)
            elif "stop" in a:
                raise _Stop()
            elif "condition" in a:
                if not self.condition(a, trigger):
                    return
            else:
                self.world.note(f"Automation '{alias}': skipped a step the test hub doesn't run ({', '.join(a.keys())})")

    def cancel_all(self):
        for t in self.running.values():
            t.cancel()
        for h in self.pending.values():
            h.cancel()
        self.pending.clear()


class _Stop(Exception):
    pass
