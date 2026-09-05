"""Deploy the project to a connected Raspberry Pi Pico.

Install host deps with uv::

    uv sync --extra dev

Usage (from the project root)::

    uv run deploy                # copy src/ (recursively) + lib/, then reset
    uv run deploy -- --no-reset  # copy without resetting

The on-device layout mirrors the ``src/`` directory exactly, so
``src/app/blink.py`` is deployed as ``/app/blink.py`` and
``src/main.py`` is deployed as ``/main.py``.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
LIB = ROOT / "lib"


def run(cmd: list[str]) -> None:
    """Run a command, fail loudly if it returns non-zero."""
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def device_path(local: Path) -> str:
    """Translate a path under ``src/`` into the device path."""
    rel = local.relative_to(SRC)
    if rel == Path("."):
        # local is SRC itself; no valid device path.
        msg = f"refusing to deploy {local}: it is the src/ root, not a file"
        raise ValueError(msg)
    return "/" + rel.as_posix()


def host_dir_to_device(host_dir: Path) -> str | None:
    """Return the device-side directory for ``host_dir`` (None if it's SRC)."""
    rel = host_dir.relative_to(SRC)
    if rel == Path("."):
        return None
    return "/" + rel.as_posix()


def safe_mkdir(device_dir: str) -> None:
    """Create ``device_dir`` on the device; ignore 'already exists' errors."""
    cmd = ["mpremote", "fs", "mkdir", f":{device_dir}"]
    print("$", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return
    if "File exists" in result.stderr:
        return
    if result.stderr:
        sys.stderr.write(result.stderr)
    raise subprocess.CalledProcessError(result.returncode, cmd)


def deploy_source_tree() -> None:
    if not SRC.is_dir():
        return

    # Collect directories we need to create on the device. Files at the
    # root of src/ (no subdir) don't need a mkdir.
    dirs: set[str] = set()
    for path in sorted(SRC.rglob("*.py")):
        d = host_dir_to_device(path.parent)
        if d is not None:
            dirs.add(d)

    # Parents must exist before children; shortest paths sort first.
    for d in sorted(dirs, key=len):
        safe_mkdir(d)

    for path in sorted(SRC.rglob("*.py")):
        run(["mpremote", "fs", "cp", str(path), f":{device_path(path)}"])


def deploy(reset: bool) -> None:
    if shutil.which("mpremote") is None:
        sys.exit(
            "mpremote not found on PATH. Run `uv sync` to install it, or `pip install mpremote`."
        )

    safe_mkdir("/lib")
    deploy_source_tree()

    if LIB.is_dir():
        run(["mpremote", "fs", "cp", "-r", str(LIB), ":/lib/"])

    if reset:
        run(["mpremote", "reset"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-reset", action="store_true", help="skip reset after deploy")
    args = parser.parse_args()
    deploy(reset=not args.no_reset)


if __name__ == "__main__":
    main()
