"""Deploy the project to a connected Raspberry Pi Pico.

Install host deps with uv::

    uv sync --extra dev

Usage (from the project root)::

    uv run deploy                     # copy src/ (recursively) + lib/, then reset
    uv run deploy --no-reset          # copy without resetting
    uv run deploy --tool all_red      # deploy examples/ref_test/all_red/main.py as /main.py

The on-device layout mirrors the ``src/`` directory, so
``src/epdws/display.py`` is deployed as ``/epdws/display.py``, and
``examples/main.py`` is deployed as ``/main.py``.

Device reference tests live in ``examples/ref_test/<name>/main.py``. Passing
``--tool <name>`` deploys that test as ``/main.py`` instead of the default
demo, so a single test can be pushed to the board on demand.
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
EXAMPLES = ROOT / "examples"
REF_TEST = EXAMPLES / "ref_test"


def available_tools() -> list[str]:
    """Names of deployable reference tests, i.e. examples/ref_test/*/main.py."""
    if not REF_TEST.is_dir():
        return []
    return sorted(p.parent.name for p in REF_TEST.glob("*/main.py"))


def entrypoint(tool: str | None) -> Path:
    """Resolve the local main.py to deploy as /main.py."""
    if tool is None:
        return EXAMPLES / "main.py"

    entry = REF_TEST / tool / "main.py"
    if not entry.is_file():
        known = ", ".join(available_tools()) or "none"
        msg = f"unknown tool {tool!r}; available: {known}"
        raise ValueError(msg)
    return entry


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


def deploy(reset: bool, tool: str | None = None) -> None:
    if shutil.which("mpremote") is None:
        sys.exit(
            "mpremote not found on PATH. Run `uv sync` to install it, or `pip install mpremote`."
        )

    # Resolve before touching the device, so a bad --tool fails fast.
    entry = entrypoint(tool)

    safe_mkdir("/lib")
    deploy_source_tree()

    print(f"Deploying {entry.relative_to(ROOT)} as /main.py")
    run(["mpremote", "fs", "cp", str(entry), ":/main.py"])

    if LIB.is_dir():
        run(["mpremote", "fs", "cp", "-r", str(LIB), ":/lib/"])

    if reset:
        run(["mpremote", "reset"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-reset", action="store_true", help="skip reset after deploy")
    parser.add_argument(
        "--tool",
        metavar="NAME",
        help=(
            "deploy examples/ref_test/NAME/main.py as /main.py "
            f"(available: {', '.join(available_tools()) or 'none'})"
        ),
    )
    parser.add_argument(
        "--list-tools",
        action="store_true",
        help="print the available reference tests and exit",
    )
    args = parser.parse_args()

    if args.list_tools:
        for name in available_tools():
            print(name)
        return

    try:
        deploy(reset=not args.no_reset, tool=args.tool)
    except ValueError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
