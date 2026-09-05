"""Unit tests for image.py."""
import io
import unittest
import tests.conftest

from app.canvas import Canvas, WHITE, BLACK, RED
from app.display import ImageError


class TestImage(unittest.TestCase):
    def test_pbm_header_parsing_valid(self):
        c = Canvas()
        c.clear(WHITE)

        # Valid P4 stream with comments and extra spaces
        data = (
            b"P4\n"
            b"# This is a comment\n"
            b"8   4\n"
            b"\xAA\x55\xAA\x55"
        )
        stream = io.BytesIO(data)
        c.image(stream, 0, 0, BLACK)

        # Check pixels: 0xAA is 10101010 (1 = ink), 0x55 is 01010101
        self.assertEqual(c._fb_black.pixel(0, 0), 0)
        self.assertEqual(c._fb_black.pixel(1, 0), 1)
        self.assertEqual(c._fb_black.pixel(0, 1), 1)
        self.assertEqual(c._fb_black.pixel(1, 1), 0)

    def test_pbm_ascii_p1_rejected(self):
        c = Canvas()
        stream = io.BytesIO(b"P1\n2 2\n0 1\n1 0\n")
        with self.assertRaises(ImageError):
            c.image(stream, 0, 0, BLACK)

    def test_pbm_truncated_header_rejected(self):
        c = Canvas()
        stream = io.BytesIO(b"P4\n8\n")
        with self.assertRaises(ImageError):
            c.image(stream, 0, 0, BLACK)

    def test_pbm_truncated_payload_rejected(self):
        c = Canvas()
        # Header specifies 16x16 (requires 2 bytes/row * 16 rows = 32 bytes), but only 10 provided
        stream = io.BytesIO(b"P4\n16 16\n" + b"\x00" * 10)
        with self.assertRaises(ImageError):
            c.image(stream, 0, 0, BLACK)

    def test_non_multiple_of_8_width_no_shear(self):
        # 13 pixels wide x 2 rows
        # Each row needs (13 + 7) // 8 = 2 bytes per row. Total 4 bytes.
        # Row 0: 13 ones -> 11111111 11111000 = 0xFF 0xF8
        # Row 1: alternating 10101010 10101000 = 0xAA 0xA8
        c = Canvas()
        c.clear(WHITE)

        data = b"P4\n13 2\n\xFF\xF8\xAA\xA8"
        stream = io.BytesIO(data)
        c.image(stream, 0, 0, BLACK)

        # Row 0: all 13 pixels must be black (0 in black plane)
        for x in range(13):
            self.assertEqual(c._fb_black.pixel(x, 0), 0, f"Pixel ({x}, 0) sheared")

        # Row 1: alternating
        self.assertEqual(c._fb_black.pixel(0, 1), 0)
        self.assertEqual(c._fb_black.pixel(1, 1), 1)
        self.assertEqual(c._fb_black.pixel(2, 1), 0)

        # Column 13 should be untouched white
        self.assertEqual(c._fb_black.pixel(13, 0), 1)

    def test_invert(self):
        c = Canvas()
        c.clear(WHITE)

        # 8x1: 10000000 -> bit 0 is ink, remaining 7 are white
        stream = io.BytesIO(b"P4\n8 1\n\x80")
        c.image(stream, 0, 0, BLACK, invert=True)

        # Inverted: bit 0 becomes background (white), remaining 7 become ink (black)
        self.assertEqual(c._fb_black.pixel(0, 0), 1)
        for x in range(1, 8):
            self.assertEqual(c._fb_black.pixel(x, 0), 0)

    def test_transparency_compositing(self):
        c = Canvas()
        # Paint background area with RED
        c.rect(0, 0, 8, 8, RED, fill=True)

        # 8x1 image with 1 ink pixel at x=0: 10000000 (0x80)
        stream_trans = io.BytesIO(b"P4\n8 1\n\x80")
        c.image(stream_trans, 0, 0, BLACK, transparent=True)

        # Pixel 0 is now BLACK
        self.assertEqual(c._fb_black.pixel(0, 0), 0)
        self.assertEqual(c._fb_red.pixel(0, 0), 1)

        # Pixel 1 should still be RED because transparent=True leaves background untouched!
        self.assertEqual(c._fb_black.pixel(1, 0), 1)
        self.assertEqual(c._fb_red.pixel(1, 0), 0)

        # Now test opaque (transparent=False)
        c.rect(0, 0, 8, 8, RED, fill=True)
        stream_opaque = io.BytesIO(b"P4\n8 1\n\x80")
        c.image(stream_opaque, 0, 0, BLACK, transparent=False)

        # Pixel 0 is BLACK
        self.assertEqual(c._fb_black.pixel(0, 0), 0)
        self.assertEqual(c._fb_red.pixel(0, 0), 1)

        # Pixel 1 should be WHITENED (transparent=False overwrites background with white)
        self.assertEqual(c._fb_black.pixel(1, 0), 1)
        self.assertEqual(c._fb_red.pixel(1, 0), 1)

    def test_raw_buffer(self):
        c = Canvas()
        c.clear(WHITE)

        raw = b"\xFF"  # 8 pixels of ink
        c.image(raw, 4, 4, RED, width=8, height=1)

        for x in range(4, 12):
            self.assertEqual(c._fb_red.pixel(x, 4), 0)
            self.assertEqual(c._fb_black.pixel(x, 4), 1)

    def test_clipping_off_canvas(self):
        c = Canvas()
        raw = b"\xFF\xFF\xFF\xFF"
        # Negative and overflowing coords clip silently
        c.image(raw, -4, -2, BLACK, width=8, height=4)
        c.image(raw, 290, 126, RED, width=8, height=4)


if __name__ == "__main__":
    unittest.main()
