"""Builds the shared Evra app for Cloudflare (https://app.evrasmarthome.com).

    python tools/build_site.py               -> dist/site/
    python tools/build_site.py --out PATH

Cloudflare runs this on every push to main (the "appevra" Worker: build command
"python3 tools/build_site.py", then "npx wrangler deploy", which publishes dist/site
as wrangler.jsonc says); see README.md, "The shared app".

What it does:
  - copies the app files (index.html, manifest, sw.js, css/, js/, icons/) and
    nothing else, like the add-on (tools/build_addon.py);
  - writes the _headers file (Cloudflare serves it as headers) with the add-on's security headers, read from
    evra/rootfs/etc/nginx/, so both places send the same Content Security Policy;
  - stamps sw.js's CACHE name with the commit (or the time), so every deployment
    is a new version for the service worker and for open screens (js/updates.js);
  - no evra-config.json: here Evra connects to the home in the signed-in member's
    Evra account (js/util.js placeDefaults).
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_addon import APP, APP_DIRS, APP_FILES, copy_text_lf, copy_tree  # noqa: E402

NGINX = APP / "evra" / "rootfs" / "etc" / "nginx"


def version_stamp():
    sha = os.environ.get("CF_PAGES_COMMIT_SHA") or os.environ.get("GITHUB_SHA")
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=APP, capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            sha = ""
    return sha[:8] if sha else time.strftime("%Y%m%d%H%M%S")


def headers_file():
    lines = ["# Made by tools/build_site.py from the add-on's nginx settings. Don't edit here.", "/*"]
    for line in (NGINX / "includes" / "headers.conf").read_text(encoding="utf-8").splitlines():
        m = re.match(r'\s*add_header\s+(\S+)\s+"([^"]*)"', line)
        if m:
            lines.append(f"  {m.group(1)}: {m.group(2)}")
    csp = re.search(r'add_header Content-Security-Policy "([^"]+)"', (NGINX / "nginx.conf").read_text(encoding="utf-8")).group(1)
    lines.append(f"  Content-Security-Policy: {csp.replace('$evra_frames', chr(39) + 'none' + chr(39))}")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Build the shared Evra app for Cloudflare Pages")
    ap.add_argument("--out", default=str(APP / "dist" / "site"))
    args = ap.parse_args()
    out = Path(args.out).resolve()
    if out == APP or (APP in out.parents and out.parts[len(APP.parts)] not in ("dist", "build")):
        sys.exit("Put the build in dist/, build/ or outside the app folder, so it can't overwrite the app.")
    if out.exists():
        shutil.rmtree(out)
    for name in APP_FILES:
        copy_text_lf(APP / name, out / name)
    for name in APP_DIRS:
        copy_tree(APP / name, out / name)

    stamp = version_stamp()
    sw = out / "sw.js"
    text, n = re.subn(r"const CACHE = '([^']+)';", lambda m: f"const CACHE = '{m.group(1)}-site-{stamp}';", sw.read_text(encoding="utf-8"), count=1)
    if n != 1:
        sys.exit("Couldn't find the CACHE line in sw.js")
    sw.write_text(text, encoding="utf-8", newline="\n")
    (out / "_headers").write_text(headers_file(), encoding="utf-8", newline="\n")

    files = sum(1 for f in out.rglob("*") if f.is_file())
    print(f"Shared Evra app built in {out} ({files} files, version {stamp})")


if __name__ == "__main__":
    main()
