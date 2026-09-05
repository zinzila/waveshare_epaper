# MicroPython Graphics Library for Waveshare Pico e-Paper 2.9 (B)

A minimal, robust, and pure graphics library for the Waveshare Pico-ePaper-2.9-B (GDEW029Z10) 296x128 tri-color (Black / White / Red) display on the Raspberry Pi Pico / Pico W.

## Highlights
- **Single Import & Simple Object Model**: Think in pixels, colors, and shapes. No SPI registers, no bit twiddling, no polarity traps.
- **Two-Layer Complementary Writes**: Clean overdrawing (`RED` over `BLACK` yields red, `WHITE` is an eraser) with zero color ambiguity.
- **Orientation Control**: Default `LANDSCAPE` (296x128) with transparent 90° rotation at upload, or panel-native `PORTRAIT` (128x296).
- **Safety by Construction**: Panel is only energized inside `show()` and powered down to deep sleep on normal return or exception (`__exit__`). Refresh interval throttle (180s) protects pigment from over-refresh.
- **PBM P4 Image Blitting**: Fast 1-bit streaming image support with optional inversion and alpha compositing.
- **100% Host Testable**: Comprehensive unit tests runnable on CPython with `framebuf` and `machine` fakes.

---

## Quick Start

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

## Directory Structure

```
src/
├── main.py            # Device demo script
└── app/
    ├── __init__.py    # Exports Display, constants, exceptions
    ├── display.py     # High-level Display class & lifecycle
    ├── canvas.py      # Dual-plane framebuf drawing & orientation transform
    ├── epd.py         # Hardware SPI / GPIO driver for GDEW029Z10
    ├── image.py       # PBM P4 parser & raw 1-bit image blitter
    └── led.py         # Onboard activity LED helper

tools/
└── mkimage.py         # Host tool to convert PNG/JPEG to PBM P4 layers

tests/
├── conftest.py        # MicroPython fakes setup for CPython
├── fakes/
│   ├── framebuf.py    # Emulates MicroPython framebuf module
│   └── machine.py     # Emulates Pin and SPI with trace logs
├── test_canvas.py     # Drawing primitives & geometry transform tests
├── test_image.py      # Image parser, stride, polarity, & blit tests
├── test_epd.py        # Hardware command sequence & BUSY polling tests
└── test_display.py    # Throttle, context manager, and lifecycle tests
```

---

## Hardware Pinout (Pico Header Default)

| Signal | GPIO Pin | Function |
|---|---|---|
| SCK | GP10 | SPI1 Clock |
| MOSI | GP11 | SPI1 MOSI |
| CS | GP9 | Chip Select (Active-Low) |
| DC | GP8 | Data / Command (0=cmd, 1=data) |
| RST | GP12 | Hardware Reset |
| BUSY | GP13 | Status Pin (Active-Low, Pull-Up) |

---

## Running Unit Tests on Host

Run the 30 unit test cases using Python 3:

```bash
python3 -m unittest discover -s tests -p "test_*.py"
```

---

## Image Conversion Tool

Use `tools/mkimage.py` to prepare artwork:

```bash
python3 tools/mkimage.py my_logo.png --out img/ --threshold 128
```

This generates:
- `img/my_logo_black.pbm`
- `img/my_logo_red.pbm` (if saturated reds are found)
- Copy-paste MicroPython code snippet.
