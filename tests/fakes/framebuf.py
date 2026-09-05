"""MicroPython framebuf fake for host CPython testing."""

# Formats
MONO_VLSB = 0
MONO_HLSB = 1
MONO_HMSB = 2
RGB565 = 3
GS2_HMSB = 4
GS4_HMSB = 5
GS8 = 6


class FrameBuffer:
    """Fake FrameBuffer matching MicroPython MONO_HLSB implementation."""

    def __init__(self, buffer, width, height, format=MONO_HLSB, stride=None):
        self.buffer = buffer
        self.width = width
        self.height = height
        self.format = format
        self.stride = stride if stride is not None else width

    def fill(self, color):
        val = 0xFF if color else 0x00
        for i in range(len(self.buffer)):
            self.buffer[i] = val

    def pixel(self, x, y, color=None):
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return 0 if color is None else None
        byte_index = (x + y * self.stride) >> 3
        bit_index = 7 - (x & 7)
        if byte_index >= len(self.buffer):
            return 0 if color is None else None

        if color is None:
            return (self.buffer[byte_index] >> bit_index) & 1
        else:
            if color:
                self.buffer[byte_index] |= (1 << bit_index)
            else:
                self.buffer[byte_index] &= ~(1 << bit_index)

    def hline(self, x, y, w, color):
        for i in range(w):
            self.pixel(x + i, y, color)

    def vline(self, x, y, h, color):
        for i in range(h):
            self.pixel(x, y + i, color)

    def line(self, x0, y0, x1, y1, color):
        # Bresenham's line algorithm
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.pixel(x0, y0, color)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def rect(self, x, y, w, h, color):
        if w <= 0 or h <= 0:
            return
        self.hline(x, y, w, color)
        self.hline(x, y + h - 1, w, color)
        self.vline(x, y, h, color)
        self.vline(x + w - 1, y, h, color)

    def fill_rect(self, x, y, w, h, color):
        for j in range(h):
            self.hline(x, y + j, w, color)

    def ellipse(self, x, y, xr, yr, color, fill=False):
        # Midpoint ellipse algorithm or bounding box
        if xr < 0 or yr < 0:
            return
        if fill:
            for cy in range(-yr, yr + 1):
                # (cx / xr)^2 + (cy / yr)^2 <= 1
                if yr == 0:
                    span_x = xr
                else:
                    val = 1.0 - (cy * cy) / float(yr * yr if yr > 0 else 1)
                    if val < 0:
                        continue
                    span_x = int(xr * (val ** 0.5))
                self.hline(x - span_x, y + cy, 2 * span_x + 1, color)
        else:
            # Boundary drawing
            for angle_deg in range(360):
                import math
                rad = math.radians(angle_deg)
                px = int(round(x + xr * math.cos(rad)))
                py = int(round(y + yr * math.sin(rad)))
                self.pixel(px, py, color)

    def text(self, s, x, y, color=1):
        # Render a simple 8x8 block font for each char for test verification
        for char_idx, char in enumerate(s):
            cx = x + char_idx * 8
            # Simple recognizable pattern: border or basic hash based on ord(char)
            # Just fill top row and left col of 8x8 glyph so tests can verify placement
            code = ord(char)
            for gy in range(8):
                for gx in range(8):
                    # Mock font pattern: top-left corner + diagonal marker
                    if gy == 0 or gx == 0 or ((code >> (gx % 8)) & 1 and gy == 4):
                        self.pixel(cx + gx, y + gy, color)

    def blit(self, source, x, y, key=-1, palette=None):
        src_fb = source
        if not isinstance(source, FrameBuffer):
            # Tuple form: (buffer, width, height, format, stride)
            buf, w, h = source[0], source[1], source[2]
            fmt = source[3] if len(source) > 3 else MONO_HLSB
            st = source[4] if len(source) > 4 else w
            src_fb = FrameBuffer(buf, w, h, fmt, st)

        for sy in range(src_fb.height):
            dy = y + sy
            if dy < 0 or dy >= self.height:
                continue
            for sx in range(src_fb.width):
                dx = x + sx
                if dx < 0 or dx >= self.width:
                    continue
                pix = src_fb.pixel(sx, sy)
                if key != -1 and pix == key:
                    continue
                self.pixel(dx, dy, pix)
