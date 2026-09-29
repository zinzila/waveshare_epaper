---
name: deploy-to-pico
description: Deploy the MicroPython e-Paper library to a Raspberry Pi Pico for the Waveshare Pico e-Paper 2.9 (B) project. Covers the uv run deploy workflow, manual mpremote commands, serial port selection per OS, and troubleshooting deployment issues.
---

# Deploy to Pico

Deploy this project's MicroPython code to a Raspberry Pi Pico / Pico W / Pico 2 connected over USB.

## What gets deployed

`tools/deploy.py` (invoked as `uv run deploy`) uploads:

1. `src/epdws/` → `/epdws` on the device (the graphics library package)
2. `examples/main.py` → `/main.py` (runs automatically on boot)
3. `lib/` → `/lib` (third-party MicroPython modules, if present)
4. Issues a software reset so `main.py` runs immediately

## Recommended: `uv run deploy`

```bash
uv sync --extra dev          # one-time: creates .venv with mpremote, ruff, mypy, pytest
uv run deploy                # deploy everything, then reset the board
uv run deploy -- --no-reset  # deploy without resetting the board
```

## Manual: `mpremote` directly

Use when `deploy.py` is unavailable or finer control is needed:

```bash
mpremote connect /dev/ttyACM0 fs cp -r src/epdws :epdws
mpremote connect /dev/ttyACM0 fs cp examples/main.py :main.py
mpremote connect /dev/ttyACM0 fs cp -r lib :lib   # only if lib/ has content
mpremote connect /dev/ttyACM0 reset
```

## Serial port by OS

| OS | Port |
|---|---|
| Linux | `/dev/ttyACM0` |
| Windows | `COMx` (check Device Manager) |
| macOS | `/dev/cu.usbmodem*` |

## Troubleshooting

- **No device found**: verify the cable is data-capable (not charge-only) and the board is in MicroPython firmware mode (not USB mass-storage / BOOTSEL mode).
- **Port busy**: close any other serial monitor (screen, minicom, Thonny) before deploying.
- **`mpremote` not installed**: run `uv sync --extra dev` or `pip install mpremote`.
- **Board doesn't run `main.py` after deploy**: reset manually with `mpremote connect <port> reset`, or press the board's RUN/RESET button.
