"""Unit tests for display.py."""
import unittest
import time
import tests.conftest

from app.display import Display, RefreshTooSoon, BLACK, RED, WHITE
from machine import Pin


class TestDisplay(unittest.TestCase):
    def setUp(self):
        Pin.pins_by_id.clear()

    def test_no_spi_traffic_during_display_init(self):
        d = Display()
        self.assertEqual(len(d._epd._spi.writes), 0)

    def test_throttle_wait_false_raises(self):
        d = Display(min_interval_s=180)
        # Mock epd busy to return idle
        d._epd._busy.value = lambda val=None: 1 if val is None else val

        # First refresh succeeds
        d.show(wait=False)

        # Immediate second refresh with wait=False must raise RefreshTooSoon
        with self.assertRaises(RefreshTooSoon) as ctx:
            d.show(wait=False)
        self.assertGreater(ctx.exception.remaining_s, 0)
        self.assertLessEqual(ctx.exception.remaining_s, 180)

    def test_throttle_wait_true_sleeps_remainder(self):
        d = Display(min_interval_s=180)
        d._epd._busy.value = lambda val=None: 1 if val is None else val

        start_time = time.ticks_ms()
        d.show(wait=True)
        # Now call with wait=True. It should advance fake clock by 180s
        d.show(wait=True)
        elapsed_s = (time.ticks_ms() - start_time) / 1000.0
        self.assertGreaterEqual(elapsed_s, 180.0)

    def test_throttle_disabled_when_interval_zero(self):
        d = Display(min_interval_s=0)
        d._epd._busy.value = lambda val=None: 1 if val is None else val

        # Should be able to call repeatedly without raising
        d.show(wait=False)
        d.show(wait=False)

    def test_ticks_wraparound_handles_throttle(self):
        d = Display(min_interval_s=180)
        d._epd._busy.value = lambda val=None: 1 if val is None else val

        # Position clock right before 2**30 wraparound
        tests.conftest._simulated_time_ms = (1 << 30) - 5000
        d.show(wait=False)

        # Advance past wraparound by 10 seconds (total 15s elapsed, still in 180s window)
        tests.conftest._simulated_time_ms = 10000

        with self.assertRaises(RefreshTooSoon) as ctx:
            d.show(wait=False)
        self.assertGreater(ctx.exception.remaining_s, 0)

    def test_context_manager_calls_sleep_on_normal_exit(self):
        sleep_called = False
        with Display() as d:
            def fake_sleep():
                nonlocal sleep_called
                sleep_called = True
            d.sleep = fake_sleep

        self.assertTrue(sleep_called)

    def test_context_manager_calls_sleep_on_exception(self):
        sleep_called = False
        try:
            with Display() as d:
                def fake_sleep():
                    nonlocal sleep_called
                    sleep_called = True
                d.sleep = fake_sleep
                raise ValueError("Simulated crash")
        except ValueError:
            pass

        self.assertTrue(sleep_called)


if __name__ == "__main__":
    unittest.main()
