"""Two-layer framebuf drawing and orientation transform.

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
    # Fill panel buffer with white (0xFF) before mapping
    for i in range(len(panel_buf)):
        panel_buf[i] = 0xFF

    logical_stride = (width + 7) // 8  # 37 bytes
    panel_stride = (PANEL_WIDTH + 7) // 8  # 16 bytes

    # Fast block / scanline transposition
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

        # Initialize to white
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
        """Draw a horizontal line of width w."""
        self._both("hline", (x, y, w), color)

    def vline(self, x, y, h, color):
        """Draw a vertical line of height h."""
        self._both("vline", (x, y, h), color)

    def line(self, x0, y0, x1, y1, color):
        """Draw an arbitrary line between (x0, y0) and (x1, y1)."""
        self._both("line", (x0, y0, x1, y1), color)

    def rect(self, x, y, w, h, color, fill=False):
        """Draw a rectangle (outline or filled)."""
        method = "fill_rect" if fill else "rect"
        self._both(method, (x, y, w, h), color)

    def circle(self, x, y, r, color, fill=False):
        """Draw a circle centered at (x, y) with radius r."""
        self.ellipse(x, y, r, r, color, fill=fill)

    def ellipse(self, x, y, rx, ry, color, fill=False):
        """Draw an ellipse centered at (x, y) with radii rx, ry."""
        self._fb_black.ellipse(x, y, rx, ry, _BLACK_BIT[color], fill)
        self._fb_red.ellipse(x, y, rx, ry, _RED_BIT[color], fill)

    def text(self, s, x, y, color, scale=1):
        """Render text string s at (x, y) with integer scale."""
        if not s:
            return
        if scale <= 1:
            self._both("text", (s, x, y), color)
            return

        # Scale > 1: render string to scratch buffer then scale pixels
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
        """Blit a 1-bit image onto the canvas."""
        from app.image import draw_image
        draw_image(self, src, x, y, color, invert=invert, transparent=transparent, width=width, height=height)

    def get_panel_buffers(self):
        """Return (black_plane, red_plane) formatted for the physical panel."""
        if self._orientation == PORTRAIT:
            return self._buf_black, self._buf_red

        # Landscape: transpose logical -> panel
        transpose_landscape_to_panel(self._buf_black, self._panel_buf_black, self._width, self._height)
        transpose_landscape_to_panel(self._buf_red, self._panel_buf_red, self._width, self._height)
        return self._panel_buf_black, self._panel_buf_red
