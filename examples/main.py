"""Demo and entry point for Waveshare Pico e-Paper 2.9 (B).

Safely draws shapes, text, and colors, then puts the panel into deep sleep.
"""
import sys
from pathlib import Path

# Allow running from examples/ directory or project root on host
SRC_PATH = str(Path(__file__).resolve().parent.parent / "src")
if SRC_PATH not in sys.path:
    sys.path.insert(0, SRC_PATH)

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
