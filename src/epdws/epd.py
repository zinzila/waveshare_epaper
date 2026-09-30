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

# All-white plane buffer, used for the mandatory clear pass. 1 = white/no ink.
_WHITE_PLANE = b"\xff" * ((128 * 296) // 8)


class Epd:
    """Controls physical GDEW029Z10 panel."""

    def __init__(self, pins=None, baudrate=4_000_000):
        # Merge pins with defaults
        p = dict(DEFAULT_PINS)
        if pins:
            p.update(pins)

        # RST must start LOW (de-asserted): at hard reset every GPIO floats
        # Hi-Z until constructed, and raising RST before CS/SCK/MOSI are driven
        # lets the waking controller latch garbage.
        self._rst = Pin(p["rst"], Pin.OUT, value=0)
        self._cs = Pin(p["cs"], Pin.OUT, value=1)
        # BUSY pin is active-low, configured with pull-up
        self._busy = Pin(p["busy"], Pin.IN, Pin.PULL_UP)

        # Constructed exactly as the vendor driver does: SPI(1) then .init().
        self._spi = SPI(1)
        self._spi.init(baudrate=baudrate)

        # DC must be constructed AFTER the SPI peripheral. On a freshly reset
        # peripheral, SPI(1) claims its default pin set - SCK=10, MOSI=11 and
        # MISO=8 - and GPIO8 is our DC pin. DC left in SPI function floats the
        # line: the panel can no longer distinguish commands from data, plane
        # uploads are eaten as commands, and every refresh renders noise. This
        # is why the bug only appeared on boot (fresh peripheral) and never in
        # soft-reset runs (peripheral already up, nothing claimed). Constructing
        # DC last reclaims GPIO8, matching the vendor driver's ordering.
        self._dc = Pin(p["dc"], Pin.OUT, value=0)

        # Preallocated 1-byte command buffer to avoid heap allocations
        self._cmd_buf = bytearray(1)
        self._is_sleeping = True

    def _command(self, cmd, data=None):
        """Send command byte with DC=0, then optional data with DC=1.

        Each byte is sent in its own CS-low pulse, including the command byte
        itself. The GDEW029Z10 latches multi-byte config parameters (panel
        setting 0x00, resolution 0x61, VCOM 0x50) per CS edge, so batching
        them into one pulse leaves those registers unset and the panel
        refreshes to a uniform colour regardless of the image data.

        Plane uploads (0x10 / 0x13) are large buffers and must stay in a
        single pulse - use _data() for those.
        """
        self._dc.value(0)
        self._cs.value(0)
        self._cmd_buf[0] = cmd
        self._spi.write(self._cmd_buf)
        self._cs.value(1)
        if cmd in (0x04, 0x12, 0x02, 0x10, 0x13):
            print(f"    [epd] cmd 0x{cmd:02X}")

        if data is not None:
            for byte in data:
                self._data(bytes([byte]))

    def _data(self, data):
        """Send data bytes with DC=1, CS low for the duration of the write."""
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

    def wait_busy(self, timeout_ms=30_000, settle_ms=100):
        """Wait until BUSY pin releases (BUSY is active-low: 0 = busy, 1 = idle).

        The settle delay is essential. The controller needs a moment to assert
        BUSY low after a command; polling immediately can read stale idle,
        return straight away, and let the caller power off / deep-sleep the
        panel mid-refresh - which leaves a partial or reverted image.
        """
        from epdws.display import PanelTimeout

        time.sleep_ms(settle_ms)
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        self._command(0x71)  # GET_STATUS
        polls = 0
        while self._busy.value() == 0:
            polls += 1
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                raise PanelTimeout("BUSY never released; check wiring, power, SPI mode/baudrate")
            self._command(0x71)
            time.sleep_ms(20)
        print(f"    [epd] wait_busy: idle after {polls} polls ({polls * 20}ms)")

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
        """Clear the panel, deep-sleep it, then wake and show the real image.

        The clear and the real content are two *separate* power cycles, matching
        the vendor driver. Only the first refresh after a deep-sleep wake is
        clean, so the clear pass must end in a full power-off/deep-sleep - if we
        re-init while the panel is still awake, the real-content refresh becomes
        that unclean first refresh and its data is discarded, leaving the panel
        showing the stale clear frame.
        """
        # Pass 1: clear to white, then deep sleep.
        try:
            self._init_panel()
            self._upload_planes(_WHITE_PLANE, _WHITE_PLANE)
            self._command(0x12)
            self.wait_busy()
        finally:
            self.sleep()

        time.sleep_ms(2000)

        # Pass 2: cold wake, upload the real image.
        try:
            self._init_panel()
            self._upload_planes(black_buf, red_buf)
            self._command(0x12)
            self.wait_busy()
        finally:
            self.sleep()

    def _upload_planes(self, black_buf, red_buf):
        """Write both plane buffers.

        Plane buffers go through _data(), not _command(): they must stay in a
        single CS pulse, whereas _command() deliberately pulses once per byte
        for config parameters.
        """
        self._command(0x10)
        self._data(black_buf)
        self._command(0x13)
        self._data(red_buf)
