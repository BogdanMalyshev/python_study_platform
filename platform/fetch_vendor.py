"""Download third-party runtime files into platform/vendor/.

Run from the course root:  .venv/bin/python platform/fetch_vendor.py [--force]

Everything is pinned below. Files that already exist with the right size/hash are
skipped, so the script is cheap to re-run. After it finishes the platform works offline.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Pinned versions. To upgrade: change the number, re-run with --force, then open
# selftest.html to re-run every task solution against the new runtime.
# ---------------------------------------------------------------------------
PYODIDE_VERSION = "0.29.5"  # see README: Python 3.13 + pydantic 2.12 line
MARKED_VERSION = "18.0.14"
HLJS_VERSION = "11.12.0"
ACE_VERSION = "1.44.0"
FONTSOURCE_VERSION = "5.3.0"

# Pyodide packages to vendor (dependencies are resolved from pyodide-lock.json).
PYODIDE_PACKAGES = ["pydantic", "httpx", "sqlite3", "lzma", "pydecimal"]

PYODIDE_CORE_SKIP_SUFFIXES = (".d.ts", ".map", ".html", ".md")
PYODIDE_CORE_SKIP_NAMES = {"package.json"}

JSDELIVR = "https://cdn.jsdelivr.net"
JSDELIVR_API = "https://data.jsdelivr.com/v1/packages/npm"

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"


def log(msg: str) -> None:
    print(msg, flush=True)


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "pycourse-fetch-vendor"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def download(
    url: str,
    dest: Path,
    *,
    force: bool,
    sha256: str | None = None,
    size: int | None = None,
) -> int:
    if dest.exists() and not force:
        data = dest.read_bytes()
        if sha256 and hashlib.sha256(data).hexdigest() == sha256:
            return len(data)
        if not sha256 and (size is None or len(data) == size):
            return len(data)
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"  get {url}")
    data = fetch_bytes(url)
    if sha256 and hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f"sha256 mismatch for {url}")
    if size is not None and len(data) != size:
        raise SystemExit(f"size mismatch for {url}: {len(data)} != {size}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return len(data)


def npm_files(pkg: str, version: str) -> dict[str, int]:
    meta = json.loads(fetch_bytes(f"{JSDELIVR_API}/{pkg}@{version}?structure=flat"))
    return {f["name"].lstrip("/"): f["size"] for f in meta["files"]}


def fetch_pyodide(force: bool) -> None:
    v = PYODIDE_VERSION
    dest = VENDOR / "pyodide"
    log(f"Pyodide {v}")
    files = npm_files("pyodide", v)
    core_bytes = 0
    for name, size in sorted(files.items()):
        if (
            "/" in name
            or name in PYODIDE_CORE_SKIP_NAMES
            or name.endswith(PYODIDE_CORE_SKIP_SUFFIXES)
        ):
            continue
        core_bytes += download(
            f"{JSDELIVR}/pyodide/v{v}/full/{name}", dest / name, force=force, size=size
        )

    lock = json.loads((dest / "pyodide-lock.json").read_text())
    pkgs = lock["packages"]

    def norm(n: str) -> str:
        return n.lower().replace("_", "-")

    by_norm = {norm(k): k for k in pkgs}
    wanted: list[str] = []
    stack = list(PYODIDE_PACKAGES)
    while stack:
        name = by_norm[norm(stack.pop())]
        if name in wanted:
            continue
        wanted.append(name)
        stack.extend(pkgs[name].get("depends", []))

    pkg_bytes = 0
    imports: dict[str, str] = {}
    sizes: dict[str, int] = {}
    for name in sorted(wanted):
        info = pkgs[name]
        n = download(
            f"{JSDELIVR}/pyodide/v{v}/full/{info['file_name']}",
            dest / info["file_name"],
            force=force,
            sha256=info.get("sha256"),
        )
        sizes[name] = n
        pkg_bytes += n
        for imp in info.get("imports", []):
            imports[imp] = name

    manifest = {
        "version": v,
        "python": lock["info"]["python"],
        "core_bytes": core_bytes,
        "packages": sorted(wanted),
        "package_bytes": sizes,
        "imports": imports,
    }
    (dest / "vendored.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False)
    )
    log(
        f"  Python {manifest['python']}, core {core_bytes / 1e6:.1f} MB, packages {pkg_bytes / 1e6:.1f} MB: {', '.join(sorted(wanted))}"
    )


def fetch_js(force: bool) -> None:
    log(f"marked {MARKED_VERSION}")
    download(
        f"{JSDELIVR}/npm/marked@{MARKED_VERSION}/lib/marked.umd.js",
        VENDOR / "marked" / "marked.umd.js",
        force=force,
    )

    log(f"highlight.js {HLJS_VERSION}")
    base = f"{JSDELIVR}/npm/@highlightjs/cdn-assets@{HLJS_VERSION}"
    download(
        f"{base}/highlight.min.js", VENDOR / "hljs" / "highlight.min.js", force=force
    )
    for lang in (
        "typescript",
        "python",
        "bash",
        "json",
        "yaml",
        "ini",
        "dockerfile",
        "plaintext",
    ):
        download(
            f"{base}/languages/{lang}.min.js",
            VENDOR / "hljs" / "languages" / f"{lang}.min.js",
            force=force,
        )

    log(f"ace {ACE_VERSION}")
    base = f"{JSDELIVR}/npm/ace-builds@{ACE_VERSION}/src-min-noconflict"
    for name in ("ace.js", "mode-python.js", "mode-text.js", "theme-tomorrow_night.js"):
        download(f"{base}/{name}", VENDOR / "ace" / name, force=force)


FONTS = {
    "ibm-plex-sans": (400, 500, 600, 700),
    "ibm-plex-mono": (400, 500),
}
SUBSETS = ("latin", "latin-ext", "cyrillic", "cyrillic-ext")


def fetch_fonts(force: bool) -> None:
    log(f"IBM Plex (fontsource {FONTSOURCE_VERSION})")
    for family, weights in FONTS.items():
        base = f"{JSDELIVR}/npm/@fontsource/{family}@{FONTSOURCE_VERSION}/files"
        for subset in SUBSETS:
            for w in weights:
                name = f"{family}-{subset}-{w}-normal.woff2"
                download(f"{base}/{name}", VENDOR / "fonts" / name, force=force)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--force", action="store_true", help="re-download even if files exist"
    )
    ap.add_argument(
        "--skip-pyodide", action="store_true", help="only JS libraries and fonts"
    )
    args = ap.parse_args()
    VENDOR.mkdir(exist_ok=True)
    fetch_js(args.force)
    fetch_fonts(args.force)
    if not args.skip_pyodide:
        fetch_pyodide(args.force)
    versions = {
        "pyodide": PYODIDE_VERSION,
        "marked": MARKED_VERSION,
        "highlight.js": HLJS_VERSION,
        "ace-builds": ACE_VERSION,
        "fontsource": FONTSOURCE_VERSION,
    }
    (VENDOR / "versions.json").write_text(json.dumps(versions, indent=2))
    log(f"Done: {VENDOR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
