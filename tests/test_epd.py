"""Unit tests for epd.py."""
import unittest
import time
import tests.conftest

from app.epd import Epd
from app.display import PanelTimeout
from machine import Pin, SPI


class TestEpd(unittest.TestCase):
    def setUp(self):
        # Reset pin tracking and state
        Pin.pins_by_id.clear()

    def test_no_spi_traffic_during_init(self):
        epd = Epd()
        self.assertEqual(len(epd._spi.writes), 0)

    def test_busy_active_low_and_releases(self):
        epd = Epd()
        # Simulate active-low BUSY pin: 0 = busy, 1 = idle
        # Sequence: returns 0, 0, then 1
        readings = [0, 0, 1]
        def fake_busy_value(val=None):
            if val is not None:
                return val
            if readings:
                return readings.pop(0)
            return 1

        epd._busy.value = fake_busy_value
        # Should complete without error
        epd.wait_busy(timeout_ms=5000)

    def test_busy_timeout_raises_panel_timeout(self):
        epd = Epd()
        # Pin is stuck at 0 (busy forever)
        epd._busy.value = lambda val=None: 0 if val is None else val

        with self.assertRaises(PanelTimeout):
            epd.wait_busy(timeout_ms=100)

    def test_upload_and_refresh_sequence(self):
        epd = Epd()
        # Keep busy pin idle (1) during sequence
        epd._busy.value = lambda val=None: 1 if val is None else val

        black_plane = bytearray(4736)
        red_plane = bytearray(4736)

        epd.upload_and_refresh(black_plane, red_plane)

        # Verify SPI writes
        # Check that single write of 4736 bytes happened for each layer
        large_writes = [w for w in epd._spi.writes if len(w) == 4736]
        self.assertEqual(len(large_writes), 2, "Expected exactly two 4736-byte plane uploads")

        # Check for presence of critical command bytes in SPI traffic
        # 0x04 (POWER_ON), 0x00 (PANEL_SETTING), 0x61 (RESOLUTION), 0x50 (VCOM),
        # 0x10 (DATA1), 0x13 (DATA2), 0x12 (REFRESH), 0x02 (POWER_OFF), 0x07 (DEEP_SLEEP)
        single_byte_writes = [w[0] for w in epd._spi.writes if len(w) == 1]
        for expected_cmd in (0x04, 0x00, 0x61, 0x50, 0x10, 0x13, 0x12, 0x02, 0x07):
            self.assertIn(expected_cmd, single_byte_writes, f"Missing command 0x{expected_cmd:02X}")

        # Deep sleep should end with RST=0
        self.assertEqual(epd._rst.value(), 0)


if __name__ == "__main__":
    unittest.main()
