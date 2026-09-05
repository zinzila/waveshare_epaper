"""Local preview server for the e-Paper panel simulator.

Usage::

    python3 tools/sim.py
    # or with uv:
    uv run sim
"""

from __future__ import annotations

import http.server
import os
import socketserver
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def main() -> None:
    port = int(os.environ.get("PORT", 8080))

    serve_dir = DIST
    default_page = "index.html"

    if not (DIST / "index.html").is_file():
        if (ROOT / "simulator.html").is_file():
            print("Using existing standalone simulator.html...")
            serve_dir = ROOT
            default_page = "simulator.html"
        else:
            print("Simulator not yet built, building single-file simulator...")
            try:
                from tools.build_page import build_dist_if_needed, bundle_single_file
                build_dist_if_needed()
                bundle_single_file(ROOT / "simulator.html")
                serve_dir = ROOT
                default_page = "simulator.html"
            except Exception as e:
                sys.exit(
                    f"Error building simulator: {e}\n"
                    "Please ensure Node.js is installed once to build, or run 'uv run build-page'."
                )

    class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(serve_dir), **kwargs)

        def do_GET(self) -> None:
            if self.path in ("/", "/index.html") and default_page != "index.html":
                self.path = f"/{default_page}"
            return super().do_GET()

        def log_message(self, format: str, *args) -> None:
            sys.stderr.write(f"[simulator] {format % args}\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), SimulatorHandler) as httpd:
        url = f"http://localhost:{port}"
        print("=" * 60)
        print(f"  Waveshare Pico e-Paper 2.9 (B) Simulator")
        print(f"  Running locally at: {url}")
        print("  Press Ctrl+C to stop.")
        print("=" * 60)

        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down simulator.")


if __name__ == "__main__":
    main()
