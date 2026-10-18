"""Build the course and serve platform/ on http://localhost:8765/.

    .venv/bin/python platform/serve.py [--port 8765] [--host 127.0.0.1]

Before serving dist/course.json the server checks content/ for changes and
rebuilds, so editing a lesson only needs a page reload. A failed rebuild is
returned as HTTP 500 with the error text, and the page shows it.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

PLATFORM = Path(__file__).resolve().parent
sys.path.insert(0, str(PLATFORM))

import build

_lock = threading.Lock()
_built_mtime = 0.0


def rebuild_if_needed() -> str | None:
    """Return None on success or the build error text."""
    global _built_mtime
    with _lock:
        mtime = build.content_mtime()
        if mtime <= _built_mtime and build.OUT.exists():
            return None
        try:
            course = build.build()
        except build.BuildError as e:
            return f"build.py: збірка не вдалася:\n{e}"
        build.DIST.mkdir(parents=True, exist_ok=True)
        tmp = build.OUT.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(course, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        tmp.replace(build.OUT)
        if _built_mtime:
            print("serve.py: content/ змінився, курс перезібрано", flush=True)
        _built_mtime = mtime
        return None


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {  # noqa: RUF012 (overrides the stdlib class attribute)
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".zip": "application/zip",
        ".whl": "application/zip",
    }

    def do_GET(self) -> None:
        if self.path.split("?")[0] == "/dist/course.json":
            err = rebuild_if_needed()
            if err:
                body = err.encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                print(err, file=sys.stderr, flush=True)
                return
        super().do_GET()

    def end_headers(self) -> None:
        path = self.path.split("?")[0]
        if not path.startswith("/vendor/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build and serve the course platform")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    err = rebuild_if_needed()
    if err:
        print(err, file=sys.stderr)
        return 1
    print(f"serve.py: {build.rel(build.OUT)} зібрано", flush=True)
    if not (PLATFORM / "vendor" / "pyodide" / "pyodide.js").exists():
        print(
            "serve.py: увага, немає platform/vendor/: запустіть .venv/bin/python platform/fetch_vendor.py",
            file=sys.stderr,
        )

    handler = functools.partial(Handler, directory=str(PLATFORM))
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer((args.host, args.port), handler) as httpd:
        print(
            f"serve.py: http://localhost:{args.port}/  (Ctrl+C, щоб зупинити)",
            flush=True,
        )
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
