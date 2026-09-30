"""Unit tests for epd.py."""
import unittest

from machine import Pin

import tests.fakes.machine as machine_fake
from epdws.display import PanelTimeout
from epdws.epd import Epd


class TestEpd(unittest.TestCase):
    def setUp(self):
        # Reset pin tracking and state
        Pin.pins_by_id.clear()
        machine_fake.construction_order.clear()

    def test_no_spi_traffic_during_init(self):
        epd = Epd()
        self.assertEqual(len(epd._spi.writes), 0)

    def test_dc_pin_constructed_after_spi(self):
        # LOAD-BEARING ORDER. On a freshly-reset RP2040, SPI(1) claims its
        # default pin set - SCK=10, MOSI=11, MISO=8 - and GPIO8 is the DC
        # pin. If DC is constructed before the SPI peripheral, it ends up in
        # SPI function on boot: the DC line floats, the panel cannot tell
        # commands from data, and every refresh renders noise. Constructing
        # DC after SPI reclaims GPIO8. See docs/debugging-log-epd-noise.md,
        # "TRUE Resolution".
        Epd()
        order = machine_fake.construction_order
        spi_idx = max(i for i, entry in enumerate(order) if entry[0] == "SPI")
        dc_idx = next(i for i, entry in enumerate(order)
                      if entry == ("Pin", 8))
        self.assertGreater(dc_idx, spi_idx)

    def test_rst_starts_deasserted(self):
        # RST must start LOW: at hard reset every GPIO floats Hi-Z until
        # constructed, and starting RST high wakes the panel while
        # CS/SCK/MOSI are undriven. Vendor constructs RST low as well.
        Epd()
        self.assertEqual(Pin.pins_by_id[12]._value, 0)
        self.assertEqual(Pin.pins_by_id[9]._value, 1)  # CS idle high

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

    def test_config_params_use_one_cs_pulse_per_byte(self):
        # The GDEW029Z10 latches multi-byte config parameters per CS edge.
        # Batching them into one pulse leaves the registers unset and the
        # panel refreshes to a uniform colour regardless of image data.
        epd = Epd()
        epd._cs.history.clear()

        epd._command(0x61, bytes([0x80, 0x01, 0x28]))

        # 1 pulse for the command byte + 3 pulses for the data bytes.
        self.assertEqual(epd._cs.history, [0, 1, 0, 1, 0, 1, 0, 1])

    def test_command_without_data_uses_single_cs_pulse(self):
        epd = Epd()
        epd._cs.history.clear()

        epd._command(0x12)

        self.assertEqual(epd._cs.history, [0, 1])

    def test_plane_upload_stays_in_one_cs_pulse(self):
        # Plane buffers are large and must NOT be split per byte, or the
        # 4736-byte upload would take thousands of CS edges.
        epd = Epd()
        epd._cs.history.clear()

        epd._data(bytearray(4736))

        self.assertEqual(epd._cs.history, [0, 1])

    def test_upload_and_refresh_sequence(self):
        epd = Epd()
        # Keep busy pin idle (1) during sequence
        epd._busy.value = lambda val=None: 1 if val is None else val

        black_plane = bytearray(4736)
        red_plane = bytearray(4736)

        epd.upload_and_refresh(black_plane, red_plane)

        # The clear pass plus the real image = 4 plane uploads: two all-white
        # (the mandatory post-wake clear) then the two real planes.
        large_writes = [w for w in epd._spi.writes if len(w) == 4736]
        self.assertEqual(len(large_writes), 4, "Expected four 4736-byte plane uploads")
        self.assertEqual(large_writes[0], b"\xff" * 4736, "First pair must be the white clear")
        self.assertEqual(large_writes[1], b"\xff" * 4736)
        self.assertEqual(large_writes[2], black_plane, "Then the real black plane")
        self.assertEqual(large_writes[3], red_plane)

        # The panel is re-initialised after the clear pass, so POWER_ON (0x04)
        # and the panel-setting command must each appear twice.
        single_byte_writes = [w[0] for w in epd._spi.writes if len(w) == 1]
        for expected_cmd in (0x04, 0x00, 0x61, 0x50, 0x10, 0x13, 0x12, 0x02, 0x07):
            self.assertIn(expected_cmd, single_byte_writes, f"Missing command 0x{expected_cmd:02X}")
        self.assertEqual(single_byte_writes.count(0x04), 2, "Expected two POWER_ON (re-init after clear)")
        self.assertEqual(single_byte_writes.count(0x12), 2, "Expected two refreshes (clear + real)")

        # The clear and the real image must be two separate power cycles: the
        # controller only produces a clean first refresh after a deep-sleep wake.
        self.assertEqual(single_byte_writes.count(0x02), 2, "Expected POWER_OFF after each pass")
        self.assertEqual(single_byte_writes.count(0x07), 2, "Expected DEEP_SLEEP after each pass")

        # Deep sleep should end with RST=0
        self.assertEqual(epd._rst.value(), 0)


if __name__ == "__main__":
    unittest.main()
