"""Evra accounts: members, roles, and what each member may use (for now: the assistant).

A local stand-in for the accounts API the Evra website will have on Cloudflare,
with the same endpoints, so the app and the assistant only need a new address
when it moves. Accounts are kept in data/accounts.json (git-ignored) because
there is no database yet.

    python appEVRA/tools/accounts/server.py            (from the SMART folder; port 8770)
    python appEVRA/tools/accounts/server.py --data DIR --port 8771

Endpoints (JSON; "token" means the header  Authorization: Bearer <token>):
    GET    /api/status                  is anyone set up yet? which features exist
    POST   /api/setup                   first account only: becomes the admin
    POST   /api/login                   {username, password} -> {token, user}
    POST   /api/logout                  token
    GET    /api/me                      token -> the signed-in member
    POST   /api/me/password             token, {current, new}
    GET    /api/members                 admin token
    POST   /api/members                 admin token, {name, username, password, role, features}
    PATCH  /api/members/{id}            admin token, any of {name, role, features, disabled, password, home_id}
    DELETE /api/members/{id}            admin token
    GET    /api/homes                   admin token -> {homes: [{id, name, url, members}]}
    POST   /api/homes                   admin token, {name, url} -> {home}
    PATCH  /api/homes/{id}              admin token, any of {name, url}
    DELETE /api/homes/{id}              admin token (its members are unlinked)

Homes: each client's house, with its Home Assistant's internet address. A member
linked to a home gets it in /me as "home": {id, name, url}, and the shared Evra app
(app.evrasmarthome.com) connects there by itself. The website creates the house's
Cloudflare tunnel and address when a home is made; this stand-in can't, so the
address is typed in.

Passwords are hashed with PBKDF2-SHA256 at 100,000 iterations: the highest that
Cloudflare Workers' Web Crypto allows, so existing hashes can move there unchanged.
Sessions are random tokens stored only as SHA-256 hashes, so a copy of the file
can't be used to sign in.
"""
import argparse
import base64
import hashlib
import hmac
import json
import re
import secrets
import sys
import time
from pathlib import Path

from aiohttp import web

HERE = Path(__file__).resolve().parent
PBKDF2_ITERATIONS = 100_000
SESSION_DAYS = 30
MIN_PASSWORD = 8
FEATURES = {"ai": "Use the Evra assistant"}
ROLES = ("admin", "member")
USERNAME = re.compile(r"^[a-z0-9][a-z0-9._@+-]{2,63}$")
LOGIN_TRIES = 5          # failed logins allowed per 5 minutes, per username and per address


# ---- passwords and tokens -------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def check_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(test, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


def token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---- the store (a JSON file until there's a database) ------------------------------------

class Store:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
        self.users: dict[str, dict] = data.get("users", {})
        self.homes: dict[str, dict] = data.get("homes", {})          # id -> {id, name, url, created}
        self.sessions: dict[str, dict] = data.get("sessions", {})   # sha256(token) -> {user, expires, created}
        self.prune()

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"v": 1, "users": self.users, "sessions": self.sessions, "homes": self.homes}, indent=1), encoding="utf-8")
        tmp.replace(self.path)

    def prune(self):
        now = time.time()
        self.sessions = {k: s for k, s in self.sessions.items() if s["expires"] > now and s["user"] in self.users}

    def public(self, u: dict) -> dict:
        out = {k: u[k] for k in ("id", "username", "name", "role", "features", "disabled", "created", "last_login")}
        h = self.homes.get(u.get("home_id") or "")
        out["home"] = {"id": h["id"], "name": h["name"], "url": h["url"]} if h else None
        return out

    def home_public(self, h: dict) -> dict:
        members = [{"id": u["id"], "name": u["name"], "username": u["username"]} for u in self.users.values() if u.get("home_id") == h["id"]]
        return {"id": h["id"], "name": h["name"], "url": h["url"], "created": h["created"], "members": members}

    def by_username(self, username: str):
        return next((u for u in self.users.values() if u["username"] == username), None)

    def active_admins(self):
        return [u for u in self.users.values() if u["role"] == "admin" and not u["disabled"]]

    def new_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        now = time.time()
        self.sessions[token_key(token)] = {"user": user_id, "created": now, "expires": now + SESSION_DAYS * 86400}
        self.users[user_id]["last_login"] = now
        self.save()
        return token

    def end_sessions(self, user_id: str, keep: str | None = None):
        self.sessions = {k: s for k, s in self.sessions.items() if s["user"] != user_id or k == keep}

    def user_for(self, token: str):
        s = self.sessions.get(token_key(token or ""))
        if not s or s["expires"] < time.time():
            return None
        u = self.users.get(s["user"])
        return u if u and not u["disabled"] else None


def clean_features(features) -> dict:
    features = features if isinstance(features, dict) else {}
    return {k: bool(features.get(k, False)) for k in FEATURES}


def check_new_user(body, store: Store) -> str | None:
    username = str(body.get("username", "")).strip().lower()
    if not USERNAME.fullmatch(username):
        return "Usernames are 3 to 64 characters: letters, numbers and . _ @ + -"
    if store.by_username(username):
        return "That username is already taken."
    if not str(body.get("name", "")).strip():
        return "Give the member a name."
    if len(str(body.get("password", ""))) < MIN_PASSWORD:
        return f"Passwords need at least {MIN_PASSWORD} characters."
    return None


# ---- the API ---------------------------------------------------------------------------

def error(message, status=400):
    return web.json_response({"error": message}, status=status)


class Accounts:
    def __init__(self, store: Store, origins):
        self.store = store
        self.origins = set(origins)
        self.failures: dict[str, list[float]] = {}

    @web.middleware
    async def cors(self, request, handler):
        origin = request.headers.get("Origin")
        allowed = origin in self.origins
        if request.method == "OPTIONS":
            resp = web.Response(status=204 if allowed else 403)
        elif origin and not allowed:
            resp = error("This address isn't allowed to use Evra accounts.", 403)
        else:
            try:
                resp = await handler(request)
            except web.HTTPException as e:
                resp = error(e.reason, e.status)
        if allowed:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
            resp.headers["Vary"] = "Origin"
        return resp

    def member(self, request):
        header = request.headers.get("Authorization", "")
        u = self.store.user_for(header[7:]) if header.startswith("Bearer ") else None
        if not u:
            raise web.HTTPUnauthorized(reason="Sign in again.")
        return u

    def admin(self, request):
        u = self.member(request)
        if u["role"] != "admin":
            raise web.HTTPForbidden(reason="Only admins can manage members.")
        return u

    async def body(self, request):
        try:
            b = await request.json()
            return b if isinstance(b, dict) else {}
        except ValueError:
            raise web.HTTPBadRequest(reason="Send JSON.")

    def throttled(self, *keys) -> bool:
        now = time.time()
        for k in keys:
            self.failures[k] = [t for t in self.failures.get(k, []) if now - t < 300]
        return any(len(self.failures[k]) >= LOGIN_TRIES for k in keys)

    # ---- endpoints ----

    async def status(self, request):
        # Local setup needs no key (only this computer can reach it); the website's does.
        return web.json_response({"ready": bool(self.store.users), "features": FEATURES, "roles": list(ROLES)})

    async def setup(self, request):
        if self.store.users:
            return error("Evra accounts are already set up. Sign in instead.", 409)
        b = await self.body(request)
        problem = check_new_user(b, self.store)
        if problem:
            return error(problem)
        uid = secrets.token_hex(8)
        now = time.time()
        self.store.users[uid] = {"id": uid, "username": b["username"].strip().lower(), "name": b["name"].strip()[:80], "role": "admin",
                                 "features": {k: True for k in FEATURES}, "disabled": False, "password": hash_password(b["password"]),
                                 "created": now, "updated": now, "last_login": None}
        token = self.store.new_session(uid)
        print(f"Set up: first admin '{self.store.users[uid]['username']}'", flush=True)
        return web.json_response({"token": token, "user": self.store.public(self.store.users[uid])})

    async def login(self, request):
        b = await self.body(request)
        username = str(b.get("username", "")).strip().lower()
        keys = (f"u:{username}", f"ip:{request.remote}")
        if self.throttled(*keys):
            return error("Too many tries. Wait a few minutes and try again.", 429)
        u = self.store.by_username(username)
        if not u or not check_password(str(b.get("password", "")), u["password"]):
            for k in keys:
                self.failures.setdefault(k, []).append(time.time())
            return error("Wrong username or password.", 401)
        if u["disabled"]:
            return error("This account is switched off. Ask an admin.", 403)
        return web.json_response({"token": self.store.new_session(u["id"]), "user": self.store.public(u)})

    async def logout(self, request):
        header = request.headers.get("Authorization", "")
        self.store.sessions.pop(token_key(header[7:]), None)
        self.store.save()
        return web.json_response({"ok": True})

    async def me(self, request):
        return web.json_response(self.store.public(self.member(request)))

    async def change_password(self, request):
        u = self.member(request)
        b = await self.body(request)
        if not check_password(str(b.get("current", "")), u["password"]):
            return error("Your current password isn't right.", 401)
        if len(str(b.get("new", ""))) < MIN_PASSWORD:
            return error(f"Passwords need at least {MIN_PASSWORD} characters.")
        u["password"], u["updated"] = hash_password(b["new"]), time.time()
        self.store.end_sessions(u["id"], keep=token_key(request.headers["Authorization"][7:]))  # signed out elsewhere
        self.store.save()
        return web.json_response({"ok": True})

    async def list_members(self, request):
        self.admin(request)
        return web.json_response({"members": [self.store.public(u) for u in sorted(self.store.users.values(), key=lambda u: u["name"].lower())],
                                  "features": FEATURES})

    async def add_member(self, request):
        self.admin(request)
        b = await self.body(request)
        problem = check_new_user(b, self.store)
        if problem:
            return error(problem)
        role = b.get("role", "member")
        if role not in ROLES:
            return error("Role must be admin or member.")
        uid = secrets.token_hex(8)
        now = time.time()
        self.store.users[uid] = {"id": uid, "username": b["username"].strip().lower(), "name": b["name"].strip()[:80], "role": role,
                                 "features": clean_features(b.get("features")), "disabled": False, "password": hash_password(b["password"]),
                                 "created": now, "updated": now, "last_login": None}
        self.store.save()
        print(f"Member added: '{self.store.users[uid]['username']}' ({role}, assistant {'on' if self.store.users[uid]['features']['ai'] else 'off'})", flush=True)
        return web.json_response(self.store.public(self.store.users[uid]), status=201)

    async def update_member(self, request):
        me = self.admin(request)
        u = self.store.users.get(request.match_info["id"])
        if not u:
            return error("No such member.", 404)
        b = await self.body(request)
        last_admin = u["role"] == "admin" and not u["disabled"] and len(self.store.active_admins()) == 1
        if last_admin and (b.get("role") == "member" or b.get("disabled") is True):
            return error("This is the only admin. Make someone else an admin first.", 409)
        if "name" in b:
            if not str(b["name"]).strip():
                return error("The name can't be empty.")
            u["name"] = str(b["name"]).strip()[:80]
        if "role" in b:
            if b["role"] not in ROLES:
                return error("Role must be admin or member.")
            u["role"] = b["role"]
        if "features" in b:
            u["features"] = clean_features({**u["features"], **(b["features"] if isinstance(b["features"], dict) else {})})
        if "disabled" in b:
            u["disabled"] = bool(b["disabled"])
            if u["disabled"]:
                self.store.end_sessions(u["id"])
        if "password" in b:
            if len(str(b["password"])) < MIN_PASSWORD:
                return error(f"Passwords need at least {MIN_PASSWORD} characters.")
            u["password"] = hash_password(b["password"])
            if u["id"] != me["id"]:
                self.store.end_sessions(u["id"])  # a reset signs the member out everywhere
        if "home_id" in b:
            if b["home_id"] is not None and b["home_id"] not in self.store.homes:
                return error("No such home.", 404)
            u["home_id"] = b["home_id"]
        u["updated"] = time.time()
        self.store.save()
        print(f"Member updated: '{u['username']}' ({', '.join(k for k in b if k != 'password') or 'password'}{', password' if 'password' in b and len(b) > 1 else ''})", flush=True)
        return web.json_response(self.store.public(u))

    async def delete_member(self, request):
        self.admin(request)
        u = self.store.users.get(request.match_info["id"])
        if not u:
            return error("No such member.", 404)
        if u["role"] == "admin" and not u["disabled"] and len(self.store.active_admins()) == 1:
            return error("This is the only admin, so it can't be deleted.", 409)
        del self.store.users[u["id"]]
        self.store.end_sessions(u["id"])
        self.store.save()
        print(f"Member deleted: '{u['username']}'", flush=True)
        return web.json_response({"ok": True})

    # ---- homes ------------------------------------------------------------------------

    @staticmethod
    def clean_url(value):
        url = str(value or "").strip().rstrip("/")
        return url if re.match(r"^https?://[^\s/]+(:\d+)?$", url) else None

    async def list_homes(self, request):
        self.admin(request)
        homes = sorted(self.store.homes.values(), key=lambda h: h["name"].lower())
        return web.json_response({"homes": [self.store.home_public(h) for h in homes], "tunnels": False})

    async def add_home(self, request):
        self.admin(request)
        b = await self.body(request)
        name = str(b.get("name", "")).strip()[:80]
        if not name:
            return error("Give the home a name.")
        url = self.clean_url(b.get("url"))
        if not url:
            return error("Type the home's Home Assistant address, like https://h-1042.example.com (this stand-in can't make tunnels).")
        hid = secrets.token_hex(6)
        self.store.homes[hid] = {"id": hid, "name": name, "url": url, "created": time.time()}
        self.store.save()
        print(f"Home added: '{name}' -> {url}", flush=True)
        return web.json_response({"home": self.store.home_public(self.store.homes[hid])}, status=201)

    async def update_home(self, request):
        self.admin(request)
        h = self.store.homes.get(request.match_info["id"])
        if not h:
            return error("No such home.", 404)
        b = await self.body(request)
        if "name" in b:
            if not str(b["name"]).strip():
                return error("The name can't be empty.")
            h["name"] = str(b["name"]).strip()[:80]
        if "url" in b:
            url = self.clean_url(b["url"])
            if not url:
                return error("That isn't an address like https://h-1042.example.com.")
            h["url"] = url
        self.store.save()
        return web.json_response({"home": self.store.home_public(h)})

    async def delete_home(self, request):
        self.admin(request)
        h = self.store.homes.pop(request.match_info["id"], None)
        if not h:
            return error("No such home.", 404)
        for u in self.store.users.values():
            if u.get("home_id") == h["id"]:
                u["home_id"] = None
        self.store.save()
        print(f"Home deleted: '{h['name']}'", flush=True)
        return web.json_response({"ok": True})

    def app(self):
        app = web.Application(middlewares=[self.cors], client_max_size=64 * 1024)
        r = app.router
        r.add_get("/api/status", self.status)
        r.add_post("/api/setup", self.setup)
        r.add_post("/api/login", self.login)
        r.add_post("/api/logout", self.logout)
        r.add_get("/api/me", self.me)
        r.add_post("/api/me/password", self.change_password)
        r.add_get("/api/members", self.list_members)
        r.add_post("/api/members", self.add_member)
        r.add_patch("/api/members/{id}", self.update_member)
        r.add_delete("/api/members/{id}", self.delete_member)
        r.add_get("/api/homes", self.list_homes)
        r.add_post("/api/homes", self.add_home)
        r.add_patch("/api/homes/{id}", self.update_home)
        r.add_delete("/api/homes/{id}", self.delete_home)
        return app


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Evra accounts (local)")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--data", help="folder for accounts.json (default: tools/accounts/data)")
    ap.add_argument("--origin", action="append", help="app address allowed to call it (default: http://localhost:8010 and http://127.0.0.1:8010)")
    args = ap.parse_args()
    store = Store((Path(args.data) if args.data else HERE / "data") / "accounts.json")
    origins = args.origin or ["http://localhost:8010", "http://127.0.0.1:8010"]
    print(f"Evra accounts on http://127.0.0.1:{args.port} ({len(store.users)} member{'s' if len(store.users) != 1 else ''})")
    if not store.users:
        print("  No accounts yet: open Evra > Settings > Evra account to create the first (admin) account.")
    print("  Close this window or press Ctrl+C to stop.\n", flush=True)
    web.run_app(Accounts(store, origins).app(), host="127.0.0.1", port=args.port, print=None, access_log=None)


if __name__ == "__main__":
    main()
