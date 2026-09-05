import { PythonFile } from './types';

export const PYTHON_FILES: PythonFile[] = [
  {
    path: 'src/epdws/display.py',
    name: 'display.py',
    category: 'core',
    description: 'Public Display class, refresh throttle (180s), and exception hierarchy.',
    content: `"""Public Display class, color constants, and exception hierarchy."""
try:
    from micropython import const
except ImportError:
    def const(x):
        return x

import time

# Re-export constants from canvas
from epdws.canvas import Canvas, WHITE, BLACK, RED, LANDSCAPE, PORTRAIT
from epdws.epd import Epd


class DisplayError(Exception):
    """Base exception for all display errors."""
    pass


class RefreshTooSoon(DisplayError):
    """Raised when refresh interval throttle has not elapsed."""

    def __init__(self, remaining_s=0, message=None):
        self.remaining_s = remaining_s
        msg = message or f"Refresh requested too soon; {remaining_s:.1f}s remaining in throttle window"
        super().__init__(msg)


class PanelTimeout(DisplayError):
    """Raised when BUSY pin fails to release within the timeout period."""
    pass


class ImageError(DisplayError):
    """Raised when an image cannot be parsed or is invalid."""
    pass


class Display:
    """High-level graphics controller for Waveshare Pico e-Paper 2.9 (B)."""

    def __init__(self, orientation=LANDSCAPE, *, baudrate=4_000_000, min_interval_s=180, pins=None):
        self._canvas = Canvas(orientation=orientation)
        self._epd = Epd(pins=pins, baudrate=baudrate)
        self._min_interval_s = min_interval_s
        self._last_refresh_ticks = None

    @property
    def width(self):
        return self._canvas.width

    @property
    def height(self):
        return self._canvas.height

    @property
    def orientation(self):
        return self._canvas.orientation

    # Drawing API delegates directly to Canvas
    def clear(self, color=WHITE):
        self._canvas.clear(color)

    def pixel(self, x, y, color):
        self._canvas.pixel(x, y, color)

    def hline(self, x, y, w, color):
        self._canvas.hline(x, y, w, color)

    def vline(self, x, y, h, color):
        self._canvas.vline(x, y, h, color)

    def line(self, x0, y0, x1, y1, color):
        self._canvas.line(x0, y0, x1, y1, color)

    def rect(self, x, y, w, h, color, fill=False):
        self._canvas.rect(x, y, w, h, color, fill=fill)

    def circle(self, x, y, r, color, fill=False):
        self._canvas.circle(x, y, r, color, fill=fill)

    def ellipse(self, x, y, rx, ry, color, fill=False):
        self._canvas.ellipse(x, y, rx, ry, color, fill=fill)

    def text(self, s, x, y, color, scale=1):
        self._canvas.text(s, x, y, color, scale=scale)

    def image(self, src, x, y, color, invert=False, transparent=False, width=None, height=None):
        self._canvas.image(src, x, y, color, invert=invert, transparent=transparent, width=width, height=height)

    def show(self, wait=True):
        """Commit the canvas to the panel: power on, init, upload, refresh, deep sleep.

        Blocks ~15-18 s.
        """
        # Enforce refresh throttle
        if self._min_interval_s > 0 and self._last_refresh_ticks is not None:
            elapsed_ms = time.ticks_diff(time.ticks_ms(), self._last_refresh_ticks)
            required_ms = self._min_interval_s * 1000
            remaining_ms = required_ms - elapsed_ms
            if remaining_ms > 0:
                remaining_s = remaining_ms / 1000.0
                if not wait:
                    raise RefreshTooSoon(remaining_s=remaining_s)
                time.sleep_ms(int(remaining_ms))

        black_plane, red_plane = self._canvas.get_panel_buffers()
        self._epd.upload_and_refresh(black_plane, red_plane)
        self._last_refresh_ticks = time.ticks_ms()

    def sleep(self):
        """Force the panel into deep sleep. Idempotent."""
        self._epd.sleep()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.sleep()
        return False
`
  },
  {
    path: 'src/epdws/canvas.py',
    name: 'canvas.py',
    category: 'core',
    description: 'Pure two-layer framebuf drawing, complementary rule, and landscape transpose.',
    content: `"""Two-layer framebuf drawing and orientation transform.

Pure graphics logic: no machine or SPI imports.
"""
try:
    from micropython import const
except ImportError:
    def const(x):
        return x

import framebuf

# Logical color constants
WHITE = const(0)
BLACK = const(1)
RED = const(2)

# Orientation constants
LANDSCAPE = const(0)  # 296 x 128
PORTRAIT = const(1)   # 128 x 296

# Physical panel dimensions (GDEW029Z10)
PANEL_WIDTH = const(128)
PANEL_HEIGHT = const(296)
PANEL_BUFFER_SIZE = const((PANEL_WIDTH * PANEL_HEIGHT) // 8)  # 4736 bytes

# Complementary bit table:
# Panel bit polarity: 1 = white/no-ink, 0 = ink
_BLACK_BIT = {BLACK: 0, RED: 1, WHITE: 1}
_RED_BIT = {BLACK: 1, RED: 0, WHITE: 1}


def transpose_landscape_to_panel(logical_buf, panel_buf, width=296, height=128):
    """Transpose logical landscape buffer (296x128) to panel native buffer (128x296).

    Formula (90-degree rotation):
        panel_x = logical_y
        panel_y = (width - 1) - logical_x
    """
    for i in range(len(panel_buf)):
        panel_buf[i] = 0xFF

    logical_stride = (width + 7) // 8  # 37 bytes
    panel_stride = (PANEL_WIDTH + 7) // 8  # 16 bytes

    for ly in range(height):
        px = ly
        p_byte_offset = px >> 3
        p_bit_shift = 7 - (px & 7)
        p_mask = 1 << p_bit_shift
        p_inv_mask = (~p_mask) & 0xFF

        l_row_offset = ly * logical_stride
        for lx in range(width):
            l_byte = logical_buf[l_row_offset + (lx >> 3)]
            l_bit = (l_byte >> (7 - (lx & 7))) & 1

            py = (width - 1) - lx
            p_idx = py * panel_stride + p_byte_offset

            if l_bit:
                panel_buf[p_idx] |= p_mask
            else:
                panel_buf[p_idx] &= p_inv_mask


class Canvas:
    """Two-layer canvas managing black and red planes."""

    def __init__(self, orientation=LANDSCAPE):
        self._orientation = orientation

        if orientation == LANDSCAPE:
            self._width = 296
            self._height = 128
            self._buf_black = bytearray(PANEL_BUFFER_SIZE)
            self._buf_red = bytearray(PANEL_BUFFER_SIZE)
            self._panel_buf_black = bytearray(PANEL_BUFFER_SIZE)
            self._panel_buf_red = bytearray(PANEL_BUFFER_SIZE)
            self._fb_black = framebuf.FrameBuffer(
                self._buf_black, self._width, self._height, framebuf.MONO_HLSB
            )
            self._fb_red = framebuf.FrameBuffer(
                self._buf_red, self._width, self._height, framebuf.MONO_HLSB
            )
        else:
            self._width = 128
            self._height = 296
            self._buf_black = bytearray(PANEL_BUFFER_SIZE)
            self._buf_red = bytearray(PANEL_BUFFER_SIZE)
            self._panel_buf_black = self._buf_black
            self._panel_buf_red = self._buf_red
            self._fb_black = framebuf.FrameBuffer(
                self._buf_black, self._width, self._height, framebuf.MONO_HLSB
            )
            self._fb_red = framebuf.FrameBuffer(
                self._buf_red, self._width, self._height, framebuf.MONO_HLSB
            )

        self.clear(WHITE)

    @property
    def width(self):
        return self._width

    @property
    def height(self):
        return self._height

    @property
    def orientation(self):
        return self._orientation

    def _both(self, method_name, args, color):
        """Invoke the framebuf method on both planes with complementary bits."""
        getattr(self._fb_black, method_name)(*args, _BLACK_BIT[color])
        getattr(self._fb_red, method_name)(*args, _RED_BIT[color])

    def clear(self, color=WHITE):
        """Fill the entire canvas with the given color."""
        self._fb_black.fill(_BLACK_BIT[color])
        self._fb_red.fill(_RED_BIT[color])

    def pixel(self, x, y, color):
        """Set a single pixel."""
        if 0 <= x < self._width and 0 <= y < self._height:
            self._fb_black.pixel(x, y, _BLACK_BIT[color])
            self._fb_red.pixel(x, y, _RED_BIT[color])

    def hline(self, x, y, w, color):
        self._both("hline", (x, y, w), color)

    def vline(self, x, y, h, color):
        self._both("vline", (x, y, h), color)

    def line(self, x0, y0, x1, y1, color):
        self._both("line", (x0, y0, x1, y1), color)

    def rect(self, x, y, w, h, color, fill=False):
        method = "fill_rect" if fill else "rect"
        self._both(method, (x, y, w, h), color)

    def circle(self, x, y, r, color, fill=False):
        self.ellipse(x, y, r, r, color, fill=fill)

    def ellipse(self, x, y, rx, ry, color, fill=False):
        self._fb_black.ellipse(x, y, rx, ry, _BLACK_BIT[color], fill)
        self._fb_red.ellipse(x, y, rx, ry, _RED_BIT[color], fill)

    def text(self, s, x, y, color, scale=1):
        if not s:
            return
        if scale <= 1:
            self._both("text", (s, x, y), color)
            return

        glyph_width = len(s) * 8
        glyph_height = 8
        stride = (glyph_width + 7) // 8
        scratch = bytearray(stride * glyph_height)
        s_fb = framebuf.FrameBuffer(scratch, glyph_width, glyph_height, framebuf.MONO_HLSB)
        s_fb.text(s, 0, 0, 1)

        b_bit = _BLACK_BIT[color]
        r_bit = _RED_BIT[color]

        for gy in range(glyph_height):
            for gx in range(glyph_width):
                if s_fb.pixel(gx, gy):
                    px = x + gx * scale
                    py = y + gy * scale
                    self._fb_black.fill_rect(px, py, scale, scale, b_bit)
                    self._fb_red.fill_rect(px, py, scale, scale, r_bit)

    def image(self, src, x, y, color, invert=False, transparent=False, width=None, height=None):
        from epdws.image import draw_image
        draw_image(self, src, x, y, color, invert=invert, transparent=transparent, width=width, height=height)

    def get_panel_buffers(self):
        if self._orientation == PORTRAIT:
            return self._buf_black, self._buf_red

        transpose_landscape_to_panel(self._buf_black, self._panel_buf_black, self._width, self._height)
        transpose_landscape_to_panel(self._buf_red, self._panel_buf_red, self._width, self._height)
        return self._panel_buf_black, self._panel_buf_red
`
  },
  {
    path: 'src/epdws/epd.py',
    name: 'epd.py',
    category: 'core',
    description: 'Hardware driver for GDEW029Z10: SPI transactions, active-low BUSY, power sequence.',
    content: `"""Hardware driver for GDEW029Z10 2.9-inch tri-color e-Paper display."""
from machine import Pin, SPI
import time

DEFAULT_PINS = {
    "sck": 10,
    "mosi": 11,
    "cs": 9,
    "dc": 8,
    "rst": 12,
    "busy": 13,
}


class Epd:
    """Controls physical GDEW029Z10 panel."""

    def __init__(self, pins=None, baudrate=4_000_000):
        p = dict(DEFAULT_PINS)
        if pins:
            p.update(pins)

        self._rst = Pin(p["rst"], Pin.OUT, value=1)
        self._dc = Pin(p["dc"], Pin.OUT, value=0)
        self._cs = Pin(p["cs"], Pin.OUT, value=1)
        # BUSY pin is active-low, configured with pull-up
        self._busy = Pin(p["busy"], Pin.IN, Pin.PULL_UP)

        self._spi = SPI(
            1,
            baudrate=baudrate,
            polarity=0,
            phase=0,
            sck=Pin(p["sck"]),
            mosi=Pin(p["mosi"]),
        )

        self._cmd_buf = bytearray(1)
        self._is_sleeping = True

    def _command(self, cmd, data=None):
        self._dc.value(0)
        self._cs.value(0)
        self._cmd_buf[0] = cmd
        self._spi.write(self._cmd_buf)
        self._cs.value(1)

        if data is not None:
            self._data(data)

    def _data(self, data):
        self._dc.value(1)
        self._cs.value(0)
        self._spi.write(data)
        self._cs.value(1)

    def reset(self):
        self._rst.value(1)
        time.sleep_ms(250)
        self._rst.value(0)
        time.sleep_ms(10)
        self._rst.value(1)
        time.sleep_ms(150)

    def wait_busy(self, timeout_ms=30_000):
        from epdws.display import PanelTimeout

        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        self._command(0x71)  # GET_STATUS
        while self._busy.value() == 0:
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                raise PanelTimeout("BUSY never released; check wiring, power, SPI mode/baudrate")
            self._command(0x71)
            time.sleep_ms(20)

    def _init_panel(self):
        self.reset()
        self._command(0x04)  # POWER_ON
        self.wait_busy()

        # Panel setting
        self._command(0x00, bytes([0x0F, 0x89]))
        # Resolution: 128 x 296
        self._command(0x61, bytes([0x80, 0x01, 0x28]))
        # VCOM and data interval
        self._command(0x50, bytes([0x77]))
        self._is_sleeping = False

    def sleep(self):
        if self._is_sleeping:
            return

        try:
            self._command(0x02)  # POWER_OFF
            self.wait_busy()
            self._command(0x07, bytes([0xA5]))  # DEEP_SLEEP
            time.sleep_ms(2000)
            self._rst.value(0)
        finally:
            self._is_sleeping = True

    def upload_and_refresh(self, black_buf, red_buf):
        try:
            self._init_panel()
            self._command(0x10, black_buf)
            self._command(0x13, red_buf)
            self._command(0x12)  # DISPLAY_REFRESH
            self.wait_busy()
        finally:
            self.sleep()
`
  },
  {
    path: 'src/epdws/image.py',
    name: 'image.py',
    category: 'core',
    description: 'PBM P4 binary image parser, non-multiple-of-8 stride handling, and transparent blitting.',
    content: `"""1-bit image decoding (PBM P4 and raw buffers) and canvas drawing."""
import framebuf
from epdws.canvas import BLACK, RED, WHITE, _BLACK_BIT, _RED_BIT


def _read_pbm_header(stream):
    from epdws.display import ImageError

    tokens = []
    current = bytearray()

    while len(tokens) < 3:
        b = stream.read(1)
        if not b:
            break

        if b == b'#':
            while True:
                c = stream.read(1)
                if not c or c in (b'\\n', b'\\r'):
                    break
            continue

        if b in (b' ', b'\\t', b'\\r', b'\\n'):
            if current:
                tokens.append(bytes(current))
                current = bytearray()
        else:
            current.extend(b)

    if current and len(tokens) < 3:
        tokens.append(bytes(current))

    if len(tokens) < 3:
        raise ImageError("Incomplete PBM header")

    magic = tokens[0].decode('ascii', 'ignore')
    if magic == "P1":
        raise ImageError("Unsupported PBM format: P1. Only binary P4 is supported")
    if magic != "P4":
        raise ImageError(f"Unsupported image format: {magic}")

    try:
        w = int(tokens[1])
        h = int(tokens[2])
    except ValueError as e:
        raise ImageError(f"Invalid PBM dimensions: {e}")

    return w, h


def draw_image(canvas, src, x, y, color, invert=False, transparent=False, width=None, height=None):
    from epdws.display import ImageError

    close_stream = False
    if isinstance(src, str):
        try:
            stream = open(src, "rb")
            close_stream = True
        except OSError as e:
            raise ImageError(f"Cannot open image file '{src}': {e}")
    elif hasattr(src, "read"):
        stream = src
    elif isinstance(src, (bytes, bytearray, memoryview)):
        stream = None
    else:
        raise ImageError(f"Unsupported image source type: {type(src)}")

    try:
        if stream is not None:
            w, h = _read_pbm_header(stream)
            row_bytes = (w + 7) // 8
            expected_bytes = row_bytes * h
            payload = bytearray(expected_bytes)
            read_bytes = stream.readinto(payload)
            if read_bytes is None or read_bytes < expected_bytes:
                raise ImageError(f"Truncated PBM payload: expected {expected_bytes} bytes, got {read_bytes or 0}")
        else:
            if width is None or height is None:
                raise ImageError("Explicit width and height required for raw buffer")
            w = width
            h = height
            row_bytes = (w + 7) // 8
            expected_bytes = row_bytes * h
            if len(src) < expected_bytes:
                raise ImageError(f"Raw buffer truncated: expected {expected_bytes} bytes, got {len(src)}")
            payload = bytearray(src[:expected_bytes])

        if invert:
            for i in range(len(payload)):
                payload[i] ^= 0xFF

        stride = row_bytes * 8
        src_fb = framebuf.FrameBuffer(payload, w, h, framebuf.MONO_HLSB, stride)

        b_bit = _BLACK_BIT[color]
        r_bit = _RED_BIT[color]

        for row in range(h):
            cy = y + row
            if cy < 0 or cy >= canvas.height:
                continue
            for col in range(w):
                cx = x + col
                if cx < 0 or cx >= canvas.width:
                    continue

                is_ink = src_fb.pixel(col, row) == 1
                if is_ink:
                    canvas._fb_black.pixel(cx, cy, b_bit)
                    canvas._fb_red.pixel(cx, cy, r_bit)
                elif not transparent:
                    canvas._fb_black.pixel(cx, cy, 1)
                    canvas._fb_red.pixel(cx, cy, 1)

    finally:
        if close_stream:
            stream.close()
`
  },
  {
    path: 'src/epdws/led.py',
    name: 'led.py',
    category: 'core',
    description: 'Activity LED indicator for Raspberry Pi Pico and Pico W.',
    content: `"""LED helper for Raspberry Pi Pico W."""
import time

try:
    from machine import Pin
except ImportError:
    Pin = None


def blink(times=1, duration_ms=100):
    """Blink the onboard LED (Pin "LED" on Pico W, or Pin 25 on standard Pico)."""
    if Pin is None:
        return

    led = None
    for pin_name in ("LED", 25):
        try:
            led = Pin(pin_name, Pin.OUT)
            break
        except Exception:
            continue

    if led is None:
        return

    for _ in range(times):
        led.value(1)
        time.sleep_ms(duration_ms)
        led.value(0)
        time.sleep_ms(duration_ms)
`
  },
  {
    path: 'examples/main.py',
    name: 'main.py',
    category: 'examples',
    description: 'Main demonstration script exercising all primitives with safe try/finally and LED blink.',
    content: `"""Demo and entry point for Waveshare Pico e-Paper 2.9 (B).

Safely draws shapes, text, and colors, then puts the panel into deep sleep.
"""
from epdws.display import Display, BLACK, RED, WHITE
from epdws.led import blink


def main():
    print("Starting e-Paper demo...")
    blink(times=2, duration_ms=100)

    try:
        with Display() as d:
            print(f"Canvas initialized ({d.width}x{d.height})")
            d.clear()

            # Headers
            d.text("Pico e-Paper", 4, 4, BLACK)
            d.text("2.9 inch B", 4, 20, RED, scale=2)

            # Divider line
            d.line(0, 40, d.width - 1, 40, BLACK)

            # Shapes
            d.rect(4, 48, 60, 30, BLACK)
            d.rect(70, 48, 60, 30, RED, fill=True)
            d.circle(160, 63, 15, BLACK)
            d.circle(200, 63, 15, RED, fill=True)

            print("Uploading and refreshing display (~18s blocking call)...")
            d.show()
            print("Display refresh complete. Panel is in deep sleep.")

    except Exception as e:
        print(f"Error during display refresh: {e}")
        raise


if __name__ == "__main__":
    main()
`
  },
  {
    path: 'tools/mkimage.py',
    name: 'mkimage.py',
    category: 'tools',
    description: 'Host tool to convert PNG/JPEG/BMP images into PBM P4 layer pairs with red detection.',
    content: `#!/usr/bin/env python3
"""Host image converter for Waveshare Pico e-Paper 2.9 (B).

Converts input images into binary PBM (P4) layer pairs:
- <name>_black.pbm
- <name>_red.pbm (if saturated reds detected)
"""
import argparse
import os
import sys

MAX_WIDTH = 296
MAX_HEIGHT = 128


def pack_pbm_p4(width, height, binary_pixels):
    row_bytes = (width + 7) // 8
    payload = bytearray(row_bytes * height)

    for y in range(height):
        row_offset = y * row_bytes
        for x in range(width):
            if binary_pixels[y][x]:
                byte_idx = row_offset + (x >> 3)
                bit_shift = 7 - (x & 7)
                payload[byte_idx] |= (1 << bit_shift)

    header = f"P4\\n{width} {height}\\n".encode("ascii")
    return header + bytes(payload)


def convert_image(input_path, output_dir, threshold=128, resize_oversized=False):
    from PIL import Image

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(input_path))[0]

    img = Image.open(input_path).convert("RGBA")
    width, height = img.size

    if width > MAX_WIDTH or height > MAX_HEIGHT:
        if resize_oversized:
            img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
            width, height = img.size
        else:
            raise ValueError(f"Image {width}x{height} exceeds max panel dimensions ({MAX_WIDTH}x{MAX_HEIGHT})")

    pixels = img.load()
    black_layer = [[0 for _ in range(width)] for _ in range(height)]
    red_layer = [[0 for _ in range(width)] for _ in range(height)]
    has_red = False

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 64:
                continue

            if r > 160 and g < 100 and b < 100 and (r - max(g, b)) > 60:
                red_layer[y][x] = 1
                has_red = True
            else:
                lum = int(0.299 * r + 0.587 * g + 0.114 * b)
                if lum < threshold:
                    black_layer[y][x] = 1

    black_pbm = pack_pbm_p4(width, height, black_layer)
    with open(os.path.join(output_dir, f"{base_name}_black.pbm"), "wb") as f:
        f.write(black_pbm)

    if has_red:
        red_pbm = pack_pbm_p4(width, height, red_layer)
        with open(os.path.join(output_dir, f"{base_name}_red.pbm"), "wb") as f:
            f.write(red_pbm)
`
  },
  {
    path: 'tools/deploy.py',
    name: 'deploy.py',
    category: 'tools',
    description: 'Host deployment tool: uploads src/ and lib/ to Raspberry Pi Pico using mpremote, then resets.',
    content: `"""Deploy the project to a connected Raspberry Pi Pico.

Install host deps with uv::

    uv sync --extra dev

Usage (from the project root)::

    uv run deploy                # copy src/ (recursively) + lib/, then reset
    uv run deploy -- --no-reset  # copy without resetting

The on-device layout mirrors the \`\`src/\`\` directory, so
\`\`src/epdws/display.py\`\` is deployed as \`\`/epdws/display.py\`\`, and
\`\`examples/main.py\`\` is deployed as \`\`/main.py\`\`.
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
    """Translate a path under \`\`src/\`\` into the device path."""
    rel = local.relative_to(SRC)
    if rel == Path("."):
        # local is SRC itself; no valid device path.
        msg = f"refusing to deploy {local}: it is the src/ root, not a file"
        raise ValueError(msg)
    return "/" + rel.as_posix()


def host_dir_to_device(host_dir: Path) -> str | None:
    """Return the device-side directory for \`\`host_dir\`\` (None if it's SRC)."""
    rel = host_dir.relative_to(SRC)
    if rel == Path("."):
        return None
    return "/" + rel.as_posix()


def safe_mkdir(device_dir: str) -> None:
    """Create \`\`device_dir\`\` on the device; ignore 'already exists' errors."""
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

    dirs: set[str] = set()
    for path in sorted(SRC.rglob("*.py")):
        d = host_dir_to_device(path.parent)
        if d is not None:
            dirs.add(d)

    for d in sorted(dirs, key=len):
        safe_mkdir(d)

    for path in sorted(SRC.rglob("*.py")):
        run(["mpremote", "fs", "cp", str(path), f":{device_path(path)}"])


def deploy(reset: bool) -> None:
    if shutil.which("mpremote") is None:
        sys.exit(
            "mpremote not found on PATH. Run \`uv sync\` to install it, or \`pip install mpremote\`."
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
`
  },
  {
    path: 'tools/sim.py',
    name: 'sim.py',
    category: 'tools',
    description: 'Host tool: local preview HTTP server for the web-based panel simulator.',
    content: `"""Local preview server for the e-Paper panel simulator.

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
                f"Error building simulator: {e}\\n"
                "Please ensure Node.js is installed, then run 'npm install && npm run build'."
            )

    class SimulatorHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(DIST), **kwargs)

        def log_message(self, format: str, *args) -> None:
            sys.stderr.write(f"[simulator] {format % args}\\n")

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
            print("\\nShutting down simulator.")


if __name__ == "__main__":
    main()
`
  },
  {
    path: 'pyproject.toml',
    name: 'pyproject.toml',
    category: 'docs',
    description: 'Host tooling configuration for uv, ruff, mypy, pytest, and deploy script.',
    content: `[project]
name = "pico-epaper-2in9b"
version = "0.1.0"
description = "Minimal graphics library for Waveshare Pico e-Paper 2.9 (B) on Raspberry Pi Pico W"
readme = "README.md"
requires-python = ">=3.10"
dependencies = []

[project.optional-dependencies]
dev = [
    "mpremote>=0.5.0",
    "ruff>=0.4.0",
    "mypy>=1.10.0",
    "pytest>=8.0.0",
    "micropython-rp2-stubs",
    "pillow>=10.0.0",
]

[project.scripts]
deploy = "tools.deploy:main"
sim = "tools.sim:main"

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "UP", "B", "SIM"]
ignore = []

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = false
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
`
  },
  {
    path: 'README.md',
    name: 'README.md',
    category: 'docs',
    description: 'Documentation: installation, uv workflow, mpremote deployment, wiring, and tests.',
    content: `# MicroPython Graphics Library for Waveshare Pico e-Paper 2.9 (B)

A minimal, robust, and pure graphics library for the Waveshare Pico-ePaper-2.9-B (GDEW029Z10) 296x128 tri-color (Black / White / Red) display on the Raspberry Pi Pico / Pico W / Pico 2.

## Layout

\`\`\`
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
├── tools/
│   ├── deploy.py       # \`uv run deploy\` -> \`mpremote fs cp\` ...
│   └── mkimage.py      # image converter (PNG/JPEG -> 1-bit PBM P4 layers)
├── pyproject.toml
├── .python-version
└── README.md
\`\`\`

## Host-side Tooling (\`uv\`)

\`\`\`bash
uv sync --extra dev          # one-time: creates .venv with mpremote, ruff, mypy, pytest
uv run deploy                # deploy src/ (recursively), examples/main.py, and lib/ to Pico
uv run deploy -- --no-reset  # deploy without resetting board
uv run ruff check src tools tests examples
uv run ruff format src tools tests examples
uv run mypy src tools
uv run pytest
\`\`\`
`
  }
];

