"""Reference test: three frequency zones through the raw transport.

Every previously passing test pushed uniform planes (all-0x00 or all-0xFF):
zero bit transitions on the SPI wire. Real content is dense with transitions,
and a marginally-framed bus can pass floods while corrupting real data. This
test sends three zones of increasing switching density in one refresh:

    rows   0-97  : solid black          (no transitions - the known-good case)
    rows  98-195 : 0x55/0xAA per byte   (max transition density)
    rows 196-295: 0xF0/0x0F per byte    (4px vertical stripes)

Expected on a healthy bus, judged on the SETTLED panel (e-paper transits
through garbage while sweeping):

    top third    solid black
    middle third fine 1px checkerboard (reads as grey/dither from a distance)
    bottom third coarse 4px black/white vertical stripes

If the top zone is clean but the lower zones are smeared into horizontal
banding or noise, the fault is SPI signal integrity / framing, not the
drawing code and not the panel.

Bypasses Canvas and Display entirely - this is transport + panel only.

Deploy with::

    uv run deploy --tool stripes
"""
from epdws.epd import Epd

PANEL_W = 128
PANEL_H = 296
STRIDE = PANEL_W // 8  # 16 bytes per panel row
SIZE = STRIDE * PANEL_H  # 4736


def build_black_plane():
    black = bytearray(SIZE)

    # Zone A: rows 0-97, solid black (0 = ink)
    for i in range(98 * STRIDE):
        black[i] = 0x00

    # Zone B: rows 98-195, alternating 0x55/0xAA per byte
    for r in range(98, 196):
        for c in range(STRIDE):
            black[r * STRIDE + c] = 0x55 if (c & 1) == 0 else 0xAA

    # Zone C: rows 196-295, alternating 0xF0/0x0F per byte
    for r in range(196, PANEL_H):
        for c in range(STRIDE):
            black[r * STRIDE + c] = 0xF0 if (c & 1) == 0 else 0x0F

    return black


def main():
    def hex8(chunk):
        # bytes.hex(sep) is unreliable on MicroPython; format by hand
        return " ".join(f"{b:02x}" for b in chunk)

    print("[stripes] building three-zone pattern (solid / checker / stripes)...")

    black = build_black_plane()
    red = bytearray(b"\xff" * SIZE)  # red plane all white

    ink = sum(bin(255 - b).count("1") for b in black)
    # Zone A: 98 rows * 128 px = 12544 px
    # Zone B: 98 rows * 64 px = 6272 px (half of each byte inked)
    # Zone C: 100 rows * 64 px = 6400 px
    print(f"[stripes] black plane ink: {ink}/37888 px (expect 25216)")
    a_start = 98 * STRIDE
    c_start = 196 * STRIDE
    print(f"[stripes] zone A first 8:  {hex8(black[0:8])} (expect 00 x8)")
    print(f"[stripes] zone B first 8:  {hex8(black[a_start:a_start + 8])}")
    print("[stripes]            expect 55 aa 55 aa 55 aa 55 aa")
    print(f"[stripes] zone C first 8:  {hex8(black[c_start:c_start + 8])}")
    print("[stripes]            expect f0 0f f0 0f f0 0f f0 0f")

    print("[stripes] refreshing (~35s: clear pass + content pass)...")
    epd = Epd()
    epd.upload_and_refresh(bytes(black), bytes(red))
    print("[stripes] done, panel in deep sleep.")
    print("[stripes] judge the SETTLED panel:")
    print("[stripes]   top third    = solid black")
    print("[stripes]   middle third = fine 1px dither")
    print("[stripes]   bottom third = 4px vertical stripes")


if __name__ == "__main__":
    main()
