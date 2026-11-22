"""Local development server for the Evra app.

Serves the SMART folder (so the app can read ../ha-snapshot for demo mode) and
tells the browser to re-check every file, so edits show up on a normal reload.
"Start Evra.bat" in the app folder runs this and opens the app for you.

    python appEVRA/tools/dev_server.py              then open http://localhost:8010/appEVRA/
    python appEVRA/tools/dev_server.py 8020         to use another port
    python appEVRA/tools/dev_server.py --lan        phone mode: phones on the same Wi-Fi can open it too
    python appEVRA/tools/dev_server.py --show-address   prints the address for a phone, then stops

Phone mode ("Start Evra on phone.bat") listens on the home network as well. Other
devices only get the app and the demo data (/appEVRA/ without tools/, and
/ha-snapshot/). Everything else in SMART stays private: the assistant's .env with the
Gemini key, the accounts and test hub data, .git folders, folder listings.
This computer itself still gets everything, as in normal mode.
"""
import argparse
import functools
import http.server
import ipaddress
import socket
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = Path(__file__).resolve().parents[1].name  # the app's folder, e.g. "appEVRA"

# What other devices may open in phone mode.
PHONE_ALLOWED = (f"/{APP}/", "/ha-snapshot/")
PHONE_BLOCKED = (f"/{APP}/tools/",)


def phone_may_open(raw_path: str) -> bool:
    """Whether a device other than this computer may open this path (phone mode)."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(raw_path).path)
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if any(p.startswith(".") for p in parts):  # .env, .git, .venv, "..", ...
        return False
    path = "/" + "/".join(parts) + ("/" if path.endswith("/") and parts else "")
    if path == f"/{APP}":
        return True  # redirected to /APP/ by the normal handler
    return path.startswith(PHONE_ALLOWED) and not path.startswith(PHONE_BLOCKED)


def lan_addresses() -> list[str]:
    """This computer's home-network IPv4 addresses, the likeliest (Wi-Fi/home router) first."""
    found = set()
    try:  # the address of the interface with the default route; UDP connect sends nothing
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 80))
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    home = [ip for ip in found if ipaddress.ip_address(ip).is_private and not ip.startswith(("127.", "169.254."))]
    return sorted(home, key=lambda ip: (not ip.startswith("192.168."), not ip.startswith("10."), ip))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    lan = False  # phone mode

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        if self.lan:
            self.send_header("X-Evra-Lan", "1")  # lets "Start Evra on phone.bat" see the mode
        super().end_headers()

    def _from_other_device(self) -> bool:
        try:
            return self.lan and not ipaddress.ip_address(self.client_address[0]).is_loopback
        except ValueError:
            return self.lan

    def _phone_gate(self) -> bool:
        """True when the request may go on; otherwise it has been answered."""
        if not self._from_other_device():
            return True
        if urllib.parse.urlsplit(self.path).path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", f"/{APP}/")
            self.end_headers()
            return False
        if not phone_may_open(self.path):
            self.send_error(404)
            return False
        return True

    def do_GET(self):
        if self._phone_gate():
            super().do_GET()

    def do_HEAD(self):
        if self._phone_gate():
            super().do_HEAD()

    def list_directory(self, path):
        if self._from_other_device():
            self.send_error(404)
            return None
        return super().list_directory(path)


def main() -> None:
    ap = argparse.ArgumentParser(description="Evra development server")
    ap.add_argument("port", nargs="?", type=int, default=8010)
    ap.add_argument("--lan", action="store_true", help="phone mode: also answer phones on the home network (app and demo data only)")
    ap.add_argument("--show-address", action="store_true", help="print the address to open on a phone, then stop")
    args = ap.parse_args()
    phone_urls = [f"http://{ip}:{args.port}/{APP}/" for ip in lan_addresses()]
    if args.show_address:
        print("\n".join(phone_urls) if phone_urls else "No home-network address found. Is this computer on Wi-Fi?")
        return
    NoCacheHandler.lan = args.lan
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("0.0.0.0" if args.lan else "127.0.0.1", args.port), handler)
    print(f"Serving {ROOT}")
    print(f"Evra is at http://localhost:{args.port}/{APP}/  (close this window to stop the server)")
    if args.lan:
        print("Phone mode: phones on the same Wi-Fi can open")
        for url in phone_urls or ["(no home-network address found)"]:
            print(f"    {url}")
        print("They only get the app and the demo data.")
    server.serve_forever()


if __name__ == "__main__":
    main()
