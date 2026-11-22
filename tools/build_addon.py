"""Builds the Evra Home Assistant add-on folder, ready to copy to the Pi or publish.

    python tools/build_addon.py              -> dist/addon/   (to copy to the Pi)
    python tools/build_addon.py --out PATH   (the GitHub workflow uses --out build)

What it does:
  - copies the add-on (evra/) and repository.yaml with Unix line endings, which
    the start scripts need on the Pi;
  - leaves the "image:" line out of config.yaml, so a copy on the Pi is built
    there instead of downloaded (the published add-on downloads GitHub's images);
  - copies the Evra app (index.html, manifest, sw.js, css/, js/, icons/) into
    evra/app/, and nothing else (no tools/, data, .bat files or secrets);
  - stamps sw.js's CACHE name with the add-on version, so every add-on release
    is a new version for the service worker and for open screens (js/updates.js);
  - makes the add-on's icon.png and logo.png from icons/icon-512.png.

To try it on the Pi as a local add-on: copy dist/addon/evra to the Pi's
"addons" share (Samba add-on) as \\\\<pi>\\addons\\evra, then in Home Assistant:
Settings > Add-ons > Add-on store > ... > Check for updates > Local add-ons > Evra.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ADDON = APP / "evra"
APP_FILES = ["index.html", "manifest.webmanifest", "sw.js"]
APP_DIRS = ["css", "js", "icons"]
TEXT = {".yaml", ".yml", ".md", ".conf", ".json", "", ".sh", ".txt", ".js", ".css", ".html", ".webmanifest", ".svg"}


def copy_text_lf(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix.lower() in TEXT:
        dst.write_bytes(src.read_bytes().replace(b"\r\n", b"\n"))
    else:
        shutil.copy2(src, dst)


def copy_tree(src: Path, dst: Path):
    for f in sorted(src.rglob("*")):
        rel = f.relative_to(src)
        if any(part.startswith(".") or part == "__pycache__" for part in rel.parts):
            continue  # never ship hidden files
        if f.is_file():
            copy_text_lf(f, dst / rel)


def main():
    ap = argparse.ArgumentParser(description="Build the Evra add-on folder")
    ap.add_argument("--out", default=str(APP / "dist" / "addon"), help="where to put it (default: dist/addon)")
    args = ap.parse_args()
    out = Path(args.out).resolve()
    # Only into dist/ or build/ (the GitHub workflow), or outside the app folder,
    # so a typo can't overwrite the app itself.
    if out == APP or (APP in out.parents and out.parts[len(APP.parts)] not in ("dist", "build")):
        sys.exit("Put the build in dist/, build/ or outside the app folder, so it can't overwrite the app.")

    config = (ADDON / "config.yaml").read_text(encoding="utf-8")
    m = re.search(r'^version:\s*"([^"]+)"', config, re.M)
    if not m:
        sys.exit("evra/config.yaml has no version line like: version: \"0.1.0\"")
    version = m.group(1)

    if out.exists():
        shutil.rmtree(out)
    copy_tree(ADDON, out / "evra")
    copy_text_lf(APP / "repository.yaml", out / "repository.yaml")
    local = out / "evra" / "config.yaml"
    local.write_text(re.sub(r"(?m)^image:.*\n", "", local.read_text(encoding="utf-8")), encoding="utf-8", newline="\n")

    app_out = out / "evra" / "app"
    for name in APP_FILES:
        copy_text_lf(APP / name, app_out / name)
    for name in APP_DIRS:
        copy_tree(APP / name, app_out / name)

    sw = app_out / "sw.js"
    text = sw.read_text(encoding="utf-8")
    stamped, n = re.subn(r"const CACHE = '([^']+)';", lambda mm: f"const CACHE = '{mm.group(1)}-addon-{version}';", text, count=1)
    if n != 1:
        sys.exit("Couldn't find the CACHE line in sw.js")
    sw.write_text(stamped, encoding="utf-8", newline="\n")

    make_images(out / "evra")
    files = sum(1 for f in out.rglob("*") if f.is_file())
    print(f"Evra add-on {version} built in {out} ({files} files)")
    print(f"Local test: copy {out / 'evra'} to \\\\<pi>\\addons\\evra, then Add-on store > Check for updates > Local add-ons.")


def make_images(addon: Path):
    src = APP / "icons" / "icon-512.png"
    try:
        from PIL import Image
    except ImportError:
        shutil.copy2(APP / "icons" / "icon-192.png", addon / "icon.png")
        shutil.copy2(APP / "icons" / "icon-192.png", addon / "logo.png")
        print("(Pillow isn't installed, so icon.png and logo.png are plain copies of icon-192.png)")
        return
    img = Image.open(src).convert("RGBA")
    img.resize((128, 128), Image.LANCZOS).save(addon / "icon.png")
    logo = Image.new("RGBA", (250, 100), (0, 0, 0, 0))
    logo.paste(img.resize((100, 100), Image.LANCZOS), (75, 0))
    logo.save(addon / "logo.png")


if __name__ == "__main__":
    main()
