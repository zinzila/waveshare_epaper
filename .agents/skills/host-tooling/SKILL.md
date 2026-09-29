---
name: host-tooling
description: Host-side lint, typecheck, and test workflow for the MicroPython e-Paper project. Use when validating code changes without hardware — covers uv sync, ruff, mypy with micropython-rp2-stubs, and pytest with machine/framebuf fakes.
---

# Host-Side Tooling

The device code is MicroPython, but validation happens on the host under CPython via `uv`. This is the primary verification loop — use it to fail fast before ever deploying to the board.

## One-time setup

```bash
uv sync --extra dev          # creates .venv with mpremote, ruff, mypy, pytest
```

## Validate changes

Run these after every code change, in this order:

```bash
uv run ruff check src tools tests examples   # lint
uv run ruff format src tools tests examples  # formatting (only when formatting is in scope)
uv run mypy src tools                        # typecheck
uv run pytest                                # host-side tests; no hardware required
```

## Why this works without a device

- **Typechecking**: `micropython-rp2-stubs` (pinned to the firmware version) provides types for `machine.Pin`, `time.sleep_ms`, etc., so `src/epdws/` typechecks on the host.
- **Tests**: `tests/conftest.py` puts `src/` on `sys.path` and fakes `framebuf` and `machine` at the import boundary (`tests/fakes/`), so rendering and display logic run under CPython instantly.
- **Ruff** lints `src/`, `tools/`, `examples/`, and `tests/` with rule sets `E`, `W`, `F`, `I`, `UP`, `B`, `SIM`.

`uv` only manages the **host** environment. MicroPython itself runs on the device and is flashed separately as a `.uf2` file — see the `deploy-to-pico` skill for deployment.
