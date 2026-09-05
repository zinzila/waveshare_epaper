"""1-bit image decoding (PBM P4 and raw buffers) and canvas drawing.

Pure-ish graphics logic: no machine or SPI imports.
"""
try:
    from micropython import const
except ImportError:
    def const(x):
        return x

import framebuf
from app.canvas import BLACK, RED, WHITE, _BLACK_BIT, _RED_BIT


def _read_pbm_header(stream):
    """Parse binary PBM (P4) header from an open binary stream.

    Returns (width, height).
    Raises ImageError on invalid format or unexpected EOF.
    """
    from app.display import ImageError

    tokens = []
    current = bytearray()

    while len(tokens) < 3:
        b = stream.read(1)
        if not b:
            break

        # Handle comments
        if b == b'#':
            while True:
                c = stream.read(1)
                if not c or c in (b'\n', b'\r'):
                    break
            continue

        # Whitespace delimiter
        if b in (b' ', b'\t', b'\r', b'\n'):
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
    """Blit a 1-bit bitmap or PBM image onto the canvas."""
    from app.display import ImageError

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

        # PBM polarity: bit 1 = ink (black), bit 0 = white.
        # If invert is requested, flip bits.
        if invert:
            for i in range(len(payload)):
                payload[i] ^= 0xFF

        stride = row_bytes * 8
        src_fb = framebuf.FrameBuffer(payload, w, h, framebuf.MONO_HLSB, stride)

        # Blit to both planes
        b_bit = _BLACK_BIT[color]
        r_bit = _RED_BIT[color]

        # Scan and composite onto canvas
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
                    # Opaque: background becomes WHITE (1, 1)
                    canvas._fb_black.pixel(cx, cy, 1)
                    canvas._fb_red.pixel(cx, cy, 1)

    finally:
        if close_stream:
            stream.close()
