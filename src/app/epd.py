"""Hardware driver for GDEW029Z10 2.9-inch tri-color e-Paper display.

Handles SPI communication, GPIO pin management, power sequence, and register protocol.
Sole hardware boundary in the library.
"""
from machine import Pin, SPI
import time

DEFAULT_PINS = {
    "sck": 10,
    "mosi": 11,
    "cs": 9,
    "dc": 8,
    "rst": 12,
    "busy": 13,
}


class Epd:
    """Controls physical GDEW029Z10 panel."""

    def __init__(self, pins=None, baudrate=4_000_000):
        # Merge pins with defaults
        p = dict(DEFAULT_PINS)
        if pins:
            p.update(pins)

        self._rst = Pin(p["rst"], Pin.OUT, value=1)
        self._dc = Pin(p["dc"], Pin.OUT, value=0)
        self._cs = Pin(p["cs"], Pin.OUT, value=1)
        # BUSY pin is active-low, configured with pull-up
        self._busy = Pin(p["busy"], Pin.IN, Pin.PULL_UP)

        self._spi = SPI(
            1,
            baudrate=baudrate,
            polarity=0,
            phase=0,
            sck=Pin(p["sck"]),
            mosi=Pin(p["mosi"]),
        )

        # Preallocated 1-byte command buffer to avoid heap allocations
        self._cmd_buf = bytearray(1)
        self._is_sleeping = True

    def _command(self, cmd, data=None):
        """Send command byte with DC=0, CS=0, then optional data with DC=1."""
        self._dc.value(0)
        self._cs.value(0)
        self._cmd_buf[0] = cmd
        self._spi.write(self._cmd_buf)
        self._cs.value(1)

        if data is not None:
            self._data(data)

    def _data(self, data):
        """Send data bytes with DC=1, CS=0."""
        self._dc.value(1)
        self._cs.value(0)
        self._spi.write(data)
        self._cs.value(1)

    def reset(self):
        """Hardware reset sequence."""
        self._rst.value(1)
        time.sleep_ms(250)
        self._rst.value(0)
        time.sleep_ms(10)
        self._rst.value(1)
        time.sleep_ms(150)

    def wait_busy(self, timeout_ms=30_000):
        """Wait until BUSY pin releases (BUSY is active-low: 0 = busy, 1 = idle)."""
        from app.display import PanelTimeout

        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        self._command(0x71)  # GET_STATUS
        while self._busy.value() == 0:
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                raise PanelTimeout("BUSY never released; check wiring, power, SPI mode/baudrate")
            self._command(0x71)
            time.sleep_ms(20)

    def _init_panel(self):
        """Power on and configure display controller registers."""
        self.reset()
        self._command(0x04)  # POWER_ON
        self.wait_busy()

        # Panel setting: LUT from OTP, 128x296, temp sensor + boost timing
        self._command(0x00, bytes([0x0F, 0x89]))
        # Resolution: 128 x 296 (0x80 = 128, 0x0128 = 296)
        self._command(0x61, bytes([0x80, 0x01, 0x28]))
        # VCOM and data interval setting
        self._command(0x50, bytes([0x77]))
        self._is_sleeping = False

    def sleep(self):
        """Power down and enter deep sleep mode. Idempotent."""
        if self._is_sleeping:
            return

        try:
            self._command(0x02)  # POWER_OFF
            self.wait_busy()
            self._command(0x07, bytes([0xA5]))  # DEEP_SLEEP
            time.sleep_ms(2000)
            self._rst.value(0)
        finally:
            self._is_sleeping = True

    def upload_and_refresh(self, black_buf, red_buf):
        """Power on, init, write both planes, refresh panel, and return to deep sleep."""
        try:
            self._init_panel()

            # Upload black/white layer
            self._command(0x10, black_buf)
            # Upload red/white layer
            self._command(0x13, red_buf)

            # Trigger display refresh
            self._command(0x12)
            self.wait_busy()
        finally:
            self.sleep()
