"""Host-side debug tool: render the example frame and dump the panel buffers.

Runs the real `epdws` rendering code under CPython (with the test fakes) and
writes the exact 4736-byte black/red planes that would be pushed to the panel
as PNGs, plus an ASCII preview. This isolates "is my image wrong?" from
"is my SPI/panel code wrong?".

Usage::

    uv run dump-frame                      # renders examples/main.py logic
    uv run dump-frame -- --png out/        # also write PNGs
    uv run dump-frame -- --as-panel        # show raw panel orientation
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# conftest installs the framebuf/machine fakes on sys.path; it must be imported
# before epdws, so these stay inside _load() rather than at module level.
def _load():
    # Importing conftest runs its side effects: it installs the framebuf/machine
    # fakes and puts src/ on sys.path. Must happen before epdws is imported.
    import tests.conftest  # noqa: F401
    from epdws.canvas import BLACK, RED, Canvas

    return Canvas, BLACK, RED


PANEL_W, PANEL_H = 128, 296


def demo(orientation, Canvas, BLACK, RED):
    """Same drawing sequence as examples/main.py."""
    c = Canvas(orientation=orientation)
    c.clear()
    c.text("Pico e-Paper", 4, 4, BLACK)
    c.text("2.9 inch B", 4, 20, RED, scale=2)
    c.line(0, 40, c.width - 1, 40, BLACK)
    c.rect(4, 48, 60, 30, BLACK)
    c.rect(70, 48, 60, 30, RED, fill=True)
    c.circle(160, 63, 15, BLACK)
    c.circle(200, 63, 15, RED, fill=True)
    return c


def render_panel(black, red, w=PANEL_W, h=PANEL_H, invert=False):
    """Turn two 1bpp panel planes into a list of ASCII rows."""
    stride = w // 8
    rows = []
    for py in range(h):
        row = []
        for px in range(w):
            idx = py * stride + (px >> 3)
            b_bit = (black[idx] >> (7 - (px & 7))) & 1
            r_bit = (red[idx] >> (7 - (px & 7))) & 1
            if invert:
                b_bit ^= 1
                r_bit ^= 1
            # 1 = white / no ink on both planes
            if b_bit and r_bit:
                row.append(".")
            elif not b_bit and not r_bit:
                row.append("?")  # impossible with the complementary tables
            elif not b_bit:
                row.append("#")  # black ink
            else:
                row.append("R")  # red ink
        rows.append("".join(row))
    return rows


def downsample(rows, factor=2):
    """Collapse `factor` x `factor` blocks, keeping any ink visible."""
    out = []
    for y in range(0, len(rows), factor):
        line = []
        for x in range(0, len(rows[0]), factor):
            block = {rows[yy][xx] for yy in range(y, min(y + factor, len(rows)))
                     for xx in range(x, min(x + factor, len(rows[0])))}
            for ch in ("#", "R", "?", "."):
                if ch in block:
                    line.append(ch)
                    break
        out.append("".join(line))
    return out


def write_png(path, black, red, w, h):
    rows = render_panel(black, red, w, h)
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        for ch in row:
            raw += {".": b"\xff\xff\xff", "#": b"\x00\x00\x00",
                    "R": b"\xff\x00\x00"}.get(ch, b"\xff\xff\x00")

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--png", metavar="DIR", help="write panel.png (raw 128x296) into DIR")
    ap.add_argument("--as-panel", action="store_true",
                    help="preview in raw panel orientation (128x296) instead of logical")
    ap.add_argument("--invert", action="store_true",
                    help="preview with bit polarity flipped (to test an inverted-panel theory)")
    ap.add_argument("--factor", type=int, default=2, help="ASCII downsample factor")
    args = ap.parse_args()

    Canvas, BLACK, RED = _load()

    for orientation, label in ((0, "LANDSCAPE 296x128"), (1, "PORTRAIT 128x296")):
        c = demo(orientation, Canvas, BLACK, RED)
        black, red = c.get_panel_buffers()
        ink_b = sum(bin(255 - b).count("1") for b in black)
        ink_r = sum(bin(255 - b).count("1") for b in red)
        print(f"\n=== {label} ===")
        print(f"plane sizes: black={len(black)} red={len(red)} (expect 4736)")
        print(f"ink pixels: black={ink_b} red={ink_r}")
        print(f"first 32 bytes black: {black[:32].hex(' ')}")

        rows = render_panel(black, red, invert=args.invert)
        if not args.as_panel:
            # Un-transpose back to logical orientation for readability
            logical = [["."] * 296 for _ in range(128)]
            for py, row in enumerate(rows):
                for px, ch in enumerate(row):
                    # inverse of panel_x = ly, panel_y = (width - 1) - lx
                    logical[px][295 - py] = ch
            rows = ["".join(r) for r in logical]

        for line in downsample(rows, args.factor):
            print(line)

        if args.png:
            d = ROOT / args.png
            d.mkdir(parents=True, exist_ok=True)
            ok = write_png(d / "panel.png", black, red, PANEL_W, PANEL_H)
            if not ok:
                print("PNG writing failed")
            else:
                print(f"wrote {d / 'panel.png'}")


if __name__ == "__main__":
    main()
