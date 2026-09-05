"""Public Display class, color constants, and exception hierarchy."""
try:
    from micropython import const
except ImportError:
    def const(x):
        return x

import time

# Re-export constants from canvas
from app.canvas import Canvas, WHITE, BLACK, RED, LANDSCAPE, PORTRAIT
from app.epd import Epd


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
