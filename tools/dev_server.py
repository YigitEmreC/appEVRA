"""Local development server for the Evra app.

Serves the SMART folder (so the app can read ../ha-snapshot for demo mode) and
tells the browser to re-check every file, so edits show up on a normal reload.
"Start Evra.bat" in the app folder runs this and opens the app for you.

    python appEVRA/tools/dev_server.py        then open http://localhost:8010/appEVRA/
    python appEVRA/tools/dev_server.py 8020   to use another port
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = Path(__file__).resolve().parents[1].name  # the app's folder, e.g. "appEVRA"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
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
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Serving {ROOT}")
    print(f"Evra is at http://localhost:{port}/{APP}/  (close this window to stop the server)")
    server.serve_forever()


if __name__ == "__main__":
    main()
