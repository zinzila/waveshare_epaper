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

    if not (DIST / "index.html").is_file():
        print("dist/ not found, building simulator with npm...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=str(ROOT), check=True)
        except Exception as e:
            sys.exit(
                f"Error building simulator: {e}\n"
                "Please ensure Node.js is installed, then run 'npm install && npm run build'."
            )

    class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(DIST), **kwargs)

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
