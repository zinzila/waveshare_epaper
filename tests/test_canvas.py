"""Unit tests for canvas.py."""
import unittest
import tests.conftest  # install fakes

from app.canvas import (
    Canvas,
    WHITE,
    BLACK,
    RED,
    LANDSCAPE,
    PORTRAIT,
    PANEL_WIDTH,
    PANEL_HEIGHT,
    transpose_landscape_to_panel,
)


class TestCanvas(unittest.TestCase):
    def test_dimensions(self):
        c_land = Canvas(orientation=LANDSCAPE)
        self.assertEqual(c_land.width, 296)
        self.assertEqual(c_land.height, 128)
        self.assertEqual(c_land.orientation, LANDSCAPE)

        c_port = Canvas(orientation=PORTRAIT)
        self.assertEqual(c_port.width, 128)
        self.assertEqual(c_port.height, 296)
        self.assertEqual(c_port.orientation, PORTRAIT)

    def test_clear_white(self):
        c = Canvas()
        c.clear(WHITE)
        # All bytes in both planes should be 0xFF
        self.assertTrue(all(b == 0xFF for b in c._buf_black))
        self.assertTrue(all(b == 0xFF for b in c._buf_red))

    def test_complementary_rule_black(self):
        c = Canvas()
        c.clear(WHITE)
        c.pixel(10, 20, BLACK)

        # Black plane has ink (0), red plane has white (1)
        self.assertEqual(c._fb_black.pixel(10, 20), 0)
        self.assertEqual(c._fb_red.pixel(10, 20), 1)

    def test_complementary_rule_red(self):
        c = Canvas()
        c.clear(WHITE)
        c.pixel(10, 20, RED)

        # Black plane has white (1), red plane has ink (0)
        self.assertEqual(c._fb_black.pixel(10, 20), 1)
        self.assertEqual(c._fb_red.pixel(10, 20), 0)

    def test_complementary_rule_white_eraser(self):
        c = Canvas()
        c.clear(WHITE)
        c.pixel(10, 20, BLACK)
        c.pixel(10, 20, WHITE)

        # Both planes should be white (1)
        self.assertEqual(c._fb_black.pixel(10, 20), 1)
        self.assertEqual(c._fb_red.pixel(10, 20), 1)

    def test_overdraw_black_then_red(self):
        c = Canvas()
        c.clear(WHITE)
        c.pixel(15, 30, BLACK)
        c.pixel(15, 30, RED)

        # Result should be strictly RED
        self.assertEqual(c._fb_black.pixel(15, 30), 1)
        self.assertEqual(c._fb_red.pixel(15, 30), 0)

    def test_clipping_does_not_raise(self):
        c = Canvas()
        # Out of bounds coordinates must silently clip
        c.pixel(-10, -5, BLACK)
        c.pixel(500, 300, RED)
        c.hline(-20, 10, 100, BLACK)
        c.vline(10, -30, 50, RED)
        c.line(-50, -50, 400, 400, BLACK)
        c.rect(-10, -10, 400, 400, RED, fill=True)
        c.circle(-10, 200, 50, BLACK)
        c.ellipse(150, 60, 200, 200, RED, fill=False)
        c.text("OutOfBounds", 350, 200, BLACK)

    def test_primitives_render(self):
        c = Canvas()
        c.clear(WHITE)
        c.line(0, 0, 10, 0, BLACK)
        # Check that pixels on the line are set
        for x in range(11):
            self.assertEqual(c._fb_black.pixel(x, 0), 0)

        c.rect(20, 20, 5, 5, RED, fill=True)
        for y in range(20, 25):
            for x in range(20, 25):
                self.assertEqual(c._fb_red.pixel(x, y), 0)
                self.assertEqual(c._fb_black.pixel(x, y), 1)

    def test_text_scaling(self):
        c = Canvas()
        c.clear(WHITE)
        c.text("A", 10, 10, BLACK, scale=1)
        count_scale_1 = sum(
            1 for y in range(10, 18) for x in range(10, 18) if c._fb_black.pixel(x, y) == 0
        )

        c.clear(WHITE)
        c.text("A", 10, 10, BLACK, scale=2)
        count_scale_2 = sum(
            1 for y in range(10, 26) for x in range(10, 26) if c._fb_black.pixel(x, y) == 0
        )

        # Scale 2 covers 4x area of scale 1
        self.assertEqual(count_scale_2, count_scale_1 * 4)
        # Top-left pixel should match
        self.assertEqual(c._fb_black.pixel(10, 10), 0)

    def test_transpose_geometry_corners(self):
        # Test logical -> panel mapping formula
        # logical (0, 0) -> panel (0, 295)
        # logical (295, 0) -> panel (0, 0)
        # logical (0, 127) -> panel (127, 295)
        # logical (295, 127) -> panel (127, 0)
        c = Canvas(orientation=LANDSCAPE)
        c.clear(WHITE)

        corners = [(0, 0), (295, 0), (0, 127), (295, 127)]
        for lx, ly in corners:
            c.pixel(lx, ly, BLACK)

        p_black, _ = c.get_panel_buffers()

        panel_stride = PANEL_WIDTH // 8  # 16 bytes
        def get_panel_bit(px, py):
            byte_idx = py * panel_stride + (px >> 3)
            bit_shift = 7 - (px & 7)
            return (p_black[byte_idx] >> bit_shift) & 1

        # Check corner positions on physical panel:
        # (0, 0) -> (0, 295)
        self.assertEqual(get_panel_bit(0, 295), 0)
        # (295, 0) -> (0, 0)
        self.assertEqual(get_panel_bit(0, 0), 0)
        # (0, 127) -> (127, 295)
        self.assertEqual(get_panel_bit(127, 295), 0)
        # (295, 127) -> (127, 0)
        self.assertEqual(get_panel_bit(127, 0), 0)


if __name__ == "__main__":
    unittest.main()
