"""Serves the built Evra app (dist/addon/evra/app) for the tunnel test, like the add-on does.

    python tools/tunnel_test/serve_app.py --ha https://ha-test.example.com [--port 8090]

It is safe to put behind Cloudflare Tunnel, unlike tools/dev_server.py:
  - it serves only the built app folder (python tools/build_addon.py makes it),
    never the folders around it (where the assistant's key and account data live);
  - no folder listings, no hidden files;
  - the same security headers as the add-on, read from evra/rootfs/etc/nginx/
    (Content Security Policy and the rest), so a policy problem shows up here too;
  - evra-config.json like the add-on writes it: on this PC Evra talks to the test
    hub on localhost:8123, over https:// (a phone through the tunnel) to --ha.
"""
import argparse
import http.server
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

APP_ROOT = Path(__file__).resolve().parents[2]
WWW = APP_ROOT / "dist" / "addon" / "evra" / "app"
NGINX = APP_ROOT / "evra" / "rootfs" / "etc" / "nginx"


def addon_headers():
    """The add-on's response headers: headers.conf plus the Content Security Policy."""
    headers = []
    for line in (NGINX / "includes" / "headers.conf").read_text(encoding="utf-8").splitlines():
        m = re.match(r'\s*add_header\s+(\S+)\s+"([^"]*)"', line)
        if m:
            headers.append((m.group(1), m.group(2)))
    csp = re.search(r'add_header Content-Security-Policy "([^"]+)"', (NGINX / "nginx.conf").read_text(encoding="utf-8"))
    headers.append(("Content-Security-Policy", csp.group(1).replace("$evra_frames", "'none'")))
    return headers


class Handler(http.server.SimpleHTTPRequestHandler):
    extra_headers = []

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(WWW), **k)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s  %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        for name, value in self.extra_headers:
            self.send_header(name, value)
        super().end_headers()

    def list_directory(self, path):  # never show folder contents
        self.send_error(404)
        return None

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if any(part.startswith(".") for part in path.split("/")):
            self.send_error(404)
            return None
        if path.endswith("/") and path != "/":
            self.send_error(404)
            return None
        return super().send_head()


def main():
    ap = argparse.ArgumentParser(description="Serve the built Evra app for the tunnel test")
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--ha", required=True, help="Home Assistant's (here: the test hub's) internet address, e.g. https://ha-test.example.com")
    args = ap.parse_args()
    if not (WWW / "index.html").exists():
        sys.exit(f"No built app in {WWW}. Run: python tools/build_addon.py")
    (WWW / "evra-config.json").write_text(json.dumps({"mode": "live", "hassUrl": "auto", "hassUrlHttps": args.ha.rstrip("/")}), encoding="utf-8")
    Handler.extra_headers = addon_headers()
    http.server.ThreadingHTTPServer.allow_reuse_address = False
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Evra (built app only) on http://localhost:{args.port}  ·  Home Assistant over https: {args.ha}", flush=True)
    print("Close this window to stop it.\n", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
