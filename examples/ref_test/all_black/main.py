"""Reference test: flood the panel solid black.

Baseline check that isolates the display transport from the drawing code.
If this does not come out uniformly black, the fault is in the SPI/BUSY/init
path (see `epdws/epd.py`), not in anything you drew.

Both planes are verified over serial before upload: black all-ink, red
all-white. Judge only the SETTLED panel state - e-paper transits through
garbage while sweeping.

Deploy with::

    uv run deploy --tool all_black
"""
from epdws.display import BLACK, Display


def main():
    print("[all_black] flooding panel solid black...")

    with Display() as d:
        print(f"[all_black] canvas {d.width}x{d.height}, orientation={d.orientation}")
        d.clear(BLACK)

        black_plane, red_plane = d._canvas.get_panel_buffers()
        ink = sum(bin(255 - b).count("1") for b in black_plane)
        print(f"[all_black] black plane: {ink}/37888 px inked (expect 37888)")
        red_ink = sum(bin(255 - b).count("1") for b in red_plane)
        print(f"[all_black] red plane ink: {red_ink}/37888 px (expect 0 - all white)")

        def hex16(buf):
            # bytes.hex(sep) is unreliable on MicroPython; format by hand
            return " ".join(f"{b:02x}" for b in buf[:16])

        print(f"[all_black] black first 16: {hex16(black_plane)}")
        print(f"[all_black] red   first 16: {hex16(red_plane)} (expect ff x16)")

        print("[all_black] refreshing (~15-18s)...")
        d.show()

    print("[all_black] done, panel in deep sleep.")


if __name__ == "__main__":
    main()
