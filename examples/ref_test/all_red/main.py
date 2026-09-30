"""Reference test: flood the panel solid red.

Companion to `all_black`. Because red is uploaded on a *separate* SPI plane
(command 0x13) from black (0x10), this discriminates between a shared
transport fault and a red-plane-specific one:

- black solid, red solid -> transport is healthy, go debug `canvas.py`
- black solid, red blank/wrong -> the 0x13 upload path is the problem

Deploy with::

    uv run deploy -- --tool all_red
"""
from epdws.display import RED, Display
from epdws.led import blink


def main():
    print("[all_red] flooding panel solid red...")

    blink(times=2, duration_ms=200)

    with Display() as d:
        print(f"[all_red] canvas {d.width}x{d.height}, orientation={d.orientation}")
        d.clear(RED)

        black_plane, red_plane = d._canvas.get_panel_buffers()
        ink_b = sum(bin(255 - b).count("1") for b in black_plane)
        ink_r = sum(bin(255 - b).count("1") for b in red_plane)
        print(f"[all_red] red plane: {ink_r}/37888 px inked (expect 37888)")
        print(f"[all_red] black plane: {ink_b}/37888 px inked (expect 0)")
        print(f"[all_red] first 16 red bytes: {bytes(red_plane[:16]).hex(' ')}")

        print("[all_red] refreshing (~15-18s)...")
        d.show()

    print("[all_red] done, panel in deep sleep.")


if __name__ == "__main__":
    main()
