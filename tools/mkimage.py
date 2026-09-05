#!/usr/bin/env python3
"""Host image converter for Waveshare Pico e-Paper 2.9 (B).

Converts input images (PNG, JPEG, BMP) into binary PBM (P4) layer pairs:
- <name>_black.pbm
- <name>_red.pbm (if saturated reds detected)

Usage:
    python tools/mkimage.py logo.png --out img/ --threshold 128
"""
import argparse
import os
import sys

MAX_WIDTH = 296
MAX_HEIGHT = 128


def pack_pbm_p4(width, height, binary_pixels):
    """Pack 2D 0/1 array (1 = ink, 0 = white) into PBM P4 bytes."""
    row_bytes = (width + 7) // 8
    payload = bytearray(row_bytes * height)

    for y in range(height):
        row_offset = y * row_bytes
        for x in range(width):
            if binary_pixels[y][x]:
                byte_idx = row_offset + (x >> 3)
                bit_shift = 7 - (x & 7)
                payload[byte_idx] |= (1 << bit_shift)

    header = f"P4\n{width} {height}\n".encode("ascii")
    return header + bytes(payload)


def convert_image(input_path, output_dir, threshold=128, resize_oversized=False):
    try:
        from PIL import Image
    except ImportError:
        print("Error: Pillow is required for host conversion. Install via: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' not found.", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(input_path))[0]

    img = Image.open(input_path).convert("RGBA")
    width, height = img.size

    if width > MAX_WIDTH or height > MAX_HEIGHT:
        if resize_oversized:
            img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
            width, height = img.size
            print(f"Resized image to {width}x{height} to fit panel.")
        else:
            print(
                f"Error: Image {width}x{height} exceeds maximum panel dimensions ({MAX_WIDTH}x{MAX_HEIGHT}). "
                f"Use --resize to scale down automatically.",
                file=sys.stderr,
            )
            sys.exit(1)

    pixels = img.load()

    black_layer = [[0 for _ in range(width)] for _ in range(height)]
    red_layer = [[0 for _ in range(width)] for _ in range(height)]
    has_red = False

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 64:
                # Transparent pixel
                continue

            # Red detection heuristic: prominent red with low green/blue
            if r > 160 and g < 100 and b < 100 and (r - max(g, b)) > 60:
                red_layer[y][x] = 1
                has_red = True
            else:
                # Grayscale luminance
                lum = int(0.299 * r + 0.587 * g + 0.114 * b)
                if lum < threshold:
                    black_layer[y][x] = 1

    # Emit black layer
    black_pbm = pack_pbm_p4(width, height, black_layer)
    black_path = os.path.join(output_dir, f"{base_name}_black.pbm")
    with open(black_path, "wb") as f:
        f.write(black_pbm)

    black_kb = len(black_pbm) / 1024.0
    print(f"Generated: {black_path} ({len(black_pbm)} bytes / {black_kb:.2f} KB)")

    red_path = None
    if has_red:
        red_pbm = pack_pbm_p4(width, height, red_layer)
        red_path = os.path.join(output_dir, f"{base_name}_red.pbm")
        with open(red_path, "wb") as f:
            f.write(red_pbm)
        red_kb = len(red_pbm) / 1024.0
        print(f"Generated: {red_path} ({len(red_pbm)} bytes / {red_kb:.2f} KB)")

    print("\n--- MicroPython Code Snippet ---")
    print(f'd.image("{black_path}", x=0, y=0, color=BLACK)')
    if red_path:
        print(f'd.image("{red_path}", x=0, y=0, color=RED, transparent=True)')


def main():
    parser = argparse.ArgumentParser(description="Convert images to 1-bit PBM layers for e-Paper 2.9 (B)")
    parser.add_argument("input", help="Path to input image file")
    parser.add_argument("--out", default="img", help="Output directory for generated PBM files (default: img)")
    parser.add_argument("--threshold", type=int, default=128, help="Luminance threshold for black ink (0-255, default: 128)")
    parser.add_argument("--resize", action="store_true", help="Resize image if it exceeds 296x128")

    args = parser.parse_args()
    convert_image(args.input, args.out, threshold=args.threshold, resize_oversized=args.resize)


if __name__ == "__main__":
    main()
