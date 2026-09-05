# MicroPython Graphics Library for Waveshare Pico e-Paper 2.9 (B)

A minimal, robust, and pure graphics library for the Waveshare Pico-ePaper-2.9-B (GDEW029Z10) 296x128 tri-color (Black / White / Red) display on the Raspberry Pi Pico / Pico W / Pico 2.

## Layout

```
.
├── src/
│   ├── main.py         # device entry point (deployed as /main.py)
│   └── app/            # importable package with testable logic
│       ├── __init__.py # package exports
│       ├── display.py  # high-level Display API, context manager & throttle
│       ├── canvas.py   # dual-plane framebuf drawing & orientation transform
│       ├── epd.py      # hardware SPI / GPIO driver for GDEW029Z10
│       ├── image.py    # PBM P4 parser & raw 1-bit image blitter
│       └── led.py      # onboard activity LED helper
├── lib/                # third-party MicroPython modules (deployed to /lib/)
├── tests/              # host-side test suite for src/app/
│   ├── conftest.py     # MicroPython fakes setup for CPython
│   ├── fakes/          # emulated framebuf, machine.Pin, machine.SPI
│   ├── test_canvas.py
│   ├── test_image.py
│   ├── test_epd.py
│   └── test_display.py
├── tools/
│   ├── deploy.py       # `uv run deploy` -> `mpremote fs cp` ...
│   └── mkimage.py      # image converter (PNG/JPEG -> 1-bit PBM P4 layers)
├── pyproject.toml
├── .python-version
└── README.md
```

---

## Host-side Tooling (`uv`)

The project is configured for [uv](https://docs.astral.sh/uv/) so the host machine can lint, typecheck, run deploy scripts, and execute host-side tests reproducibly:

```bash
uv sync --extra dev          # one-time: creates .venv with mpremote, ruff, mypy, pytest
uv run deploy                # deploy src/ (recursively) + lib/ to the Pico, then reset
uv run deploy -- --no-reset  # deploy without resetting board
uv run ruff check src tools tests
uv run ruff format src tools tests
uv run mypy src tools
uv run pytest
```

### MicroPython-Aware Tooling

- `micropython-rp2-stubs` (pinned to firmware version) gives mypy / Pylance the type definitions for `machine.Pin`, `time.sleep_ms`, etc., so `src/app/` can be typechecked on the host.
- **Ruff** is configured to lint `src/`, `tools/`, and `tests/` with a sensible default rule set (`E`, `W`, `F`, `I`, `UP`, `B`, `SIM`).
- **pytest** imports `src/` on `sys.path` via `tests/conftest.py` and runs tests against the package's pure-Python logic. `machine.Pin` is faked at the import boundary and time helpers are mocked for instantaneous tests.

`uv` only manages the **host** Python environment. MicroPython itself runs on the device and is flashed separately as a `.uf2` file.

---

## Deploying to the Pico

### Option 1: Using `deploy.py` with `uv` (Recommended)

Connect your Pico to your computer via USB:

```bash
uv run deploy
```

What `deploy.py` does:
1. Verifies `mpremote` is installed.
2. Creates any needed directories on the device (e.g. `/app`, `/lib`).
3. Recursively uploads all files from `src/` to root (`/`) and `lib/` to `/lib/`.
4. Issues a software reset (`mpremote reset`) so `main.py` runs immediately.

To deploy without resetting:
```bash
uv run deploy -- --no-reset
```

### Option 2: Using `mpremote` directly

```bash
pip install mpremote
mpremote connect /dev/ttyACM0 fs cp -r src/* :
mpremote connect /dev/ttyACM0 reset
```

*(On Windows replace `/dev/ttyACM0` with `COMx`, on macOS use `/dev/cu.usbmodem*`).*

### Option 3: USB Mass Storage Drag-and-Drop

1. Flash MicroPython firmware to the board (UF2 file from https://micropython.org/download/RPI_PICO/ or https://micropython.org/download/RPI_PICO_W/).
2. Mount the Pico as a USB mass-storage drive.
3. Copy `src/*` to the root of that drive.
4. Safely eject and reset the board; MicroPython runs `boot.py` then `main.py`.

---

## Quick Start (MicroPython Code)

```python
from app.display import Display, BLACK, RED, WHITE

with Display() as d:
    d.clear()
    d.text("Hello", 4, 4, BLACK)
    d.text("Pico e-Paper", 4, 20, RED, scale=2)
    d.line(0, 40, d.width - 1, 40, BLACK)
    d.rect(4, 48, 60, 30, BLACK)
    d.rect(70, 48, 60, 30, RED, fill=True)
    d.circle(160, 63, 15, BLACK)
    d.circle(200, 63, 15, RED, fill=True)
    d.show()  # uploads, refreshes (~15s), and deep sleeps
```

---

## Hardware Pinout (Pico Header Default)

| Signal | GPIO Pin | Function | Direction / Logic |
|---|---|---|---|
| **SCK** | GP10 | SPI1 Clock | Output |
| **MOSI** | GP11 | SPI1 TX Data | Output |
| **CS** | GP9 | Chip Select | Active-Low |
| **DC** | GP8 | Data / Command | `0` = command, `1` = data |
| **RST** | GP12 | Hardware Reset | Active-Low |
| **BUSY** | GP13 | Panel Status | **Active-Low** (`0` = busy, `1` = idle, internal pull-up) |

---

## Running Unit Tests on Host

```bash
uv run pytest
# or using built-in unittest:
python3 -m unittest discover -s tests -p "test_*.py"
```

All 30 unit tests pass on host CPython without requiring connected hardware.

---

## Image Conversion Tool (`mkimage.py`)

Use `tools/mkimage.py` to convert graphics into 1-bit PBM P4 layer pairs:

```bash
python3 tools/mkimage.py my_logo.png --out img/ --threshold 128
```

Generates:
- `img/my_logo_black.pbm`
- `img/my_logo_red.pbm` (if saturated red is detected)
- Ready-to-use MicroPython blit code snippet.
