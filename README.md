# MicroPython Graphics Library for Waveshare Pico e-Paper 2.9 (B)

A minimal, robust, and pure graphics library for the Waveshare Pico-ePaper-2.9-B (GDEW029Z10) 296x128 tri-color (Black / White / Red) display on the Raspberry Pi Pico / Pico W / Pico 2.

## Layout

```
.
├── src/
│   └── epdws/          # pure MicroPython graphics library
│       ├── __init__.py # package exports (Display, colors, errors)
│       ├── display.py  # high-level Display API, context manager & throttle
│       ├── canvas.py   # dual-plane framebuf drawing & orientation transform
│       ├── epd.py      # hardware SPI / GPIO driver for GDEW029Z10
│       ├── image.py    # PBM P4 parser & raw 1-bit image blitter
│       └── led.py      # onboard activity LED helper
├── examples/
│   └── main.py         # demo script (uploaded as /main.py on device)
├── web/                # interactive web page & panel simulator (React + Tailwind)
├── lib/                # third-party MicroPython modules (deployed to /lib/)
├── tests/              # host-side test suite for src/epdws/
│   ├── conftest.py     # MicroPython fakes setup for CPython
│   ├── fakes/          # emulated framebuf, machine.Pin, machine.SPI
│   ├── test_canvas.py
│   ├── test_image.py
│   ├── test_epd.py
│   ├── test_display.py
│   └── test_deploy.py
├── tools/
│   ├── deploy.py       # `uv run deploy` -> `mpremote fs cp` ...
│   ├── sim.py          # `uv run sim` -> local preview server for web simulator
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
uv run deploy                # deploy src/ (recursively), examples/main.py, and lib/ to Pico
uv run deploy -- --no-reset  # deploy without resetting board
uv run sim                   # launch local web panel simulator
uv run ruff check src tools tests examples
uv run ruff format src tools tests examples
uv run mypy src tools
uv run pytest
```

---

## Running the Web Panel Simulator Locally

The web simulator provides an interactive 296x128 tri-color canvas, PBM image converter, wiring inspector, and live code viewer.

### Option 1: Standalone Single-File HTML (Zero server, double-clickable)
Build a 100% self-contained single HTML file with all CSS, JS, and graphics inlined:
```bash
uv run build-page
# or with standard Python:
python3 tools/build_page.py
```
This generates `simulator.html` (~315 KB). You can **double-click it or open directly via `file://` in any browser**—no web server and no npm required!

### Option 2: Local HTTP Server via Python / `uv`
```bash
uv run sim
# or with standard Python:
python3 tools/sim.py
# or using Python's built-in HTTP server:
python3 -m http.server -d dist 8080
```
Then open `http://localhost:8080` in your browser.

### Option 3: Via Node.js / Vite (Development mode with live reload)
```bash
npm install
npm run dev
```
Then open `http://localhost:3000` in your browser.

> **Why opening `index.html` directly fails with an empty page:**  
> Root `index.html` is the Vite dev template pointing to `/web/main.tsx` (TypeScript + React). Modern web browsers cannot execute raw TypeScript/JSX files directly, and opening via `file:///` causes module import errors. Always run either `python3 tools/sim.py` (which serves the compiled `dist/`) or `npm run dev`.

### MicroPython-Aware Tooling

- `micropython-rp2-stubs` (pinned to firmware version) gives mypy / Pylance the type definitions for `machine.Pin`, `time.sleep_ms`, etc., so `src/epdws/` can be typechecked on the host.
- **Ruff** is configured to lint `src/`, `tools/`, `examples/`, and `tests/` with a sensible default rule set (`E`, `W`, `F`, `I`, `UP`, `B`, `SIM`).
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
2. Creates any needed directories on the device (e.g. `/epdws`, `/lib`).
3. Recursively uploads all files from `src/` to root (`/`) and `examples/main.py` to `/main.py`.
4. Uploads any third-party libraries from `lib/` to `/lib/`.
5. Issues a software reset (`mpremote reset`) so `main.py` runs immediately.

To deploy without resetting:
```bash
uv run deploy -- --no-reset
```

### Option 2: Using `mpremote` directly

```bash
pip install mpremote
mpremote connect /dev/ttyACM0 fs cp -r src/* :
mpremote connect /dev/ttyACM0 fs cp examples/main.py :main.py
mpremote connect /dev/ttyACM0 reset
```

*(On Windows replace `/dev/ttyACM0` with `COMx`, on macOS use `/dev/cu.usbmodem*`).*

### Option 3: USB Mass Storage Drag-and-Drop

1. Flash MicroPython firmware to the board (UF2 file from https://micropython.org/download/RPI_PICO/ or https://micropython.org/download/RPI_PICO_W/).
2. Mount the Pico as a USB mass-storage drive.
3. Copy `src/epdws` directory and `examples/main.py` (as `main.py`) to the root of that drive.
4. Safely eject and reset the board; MicroPython runs `boot.py` then `main.py`.

---

## Quick Start (MicroPython Code)

```python
from epdws.display import Display, BLACK, RED, WHITE

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

All 33 unit tests pass on host CPython without requiring connected hardware.

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
