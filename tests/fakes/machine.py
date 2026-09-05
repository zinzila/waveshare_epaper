"""MicroPython machine fake for host CPython testing."""


class Pin:
    IN = 0
    OUT = 1
    PULL_UP = 2
    PULL_DOWN = 3

    # Class-level pin state tracking
    pins_by_id = {}

    def __init__(self, pin_id, mode=OUT, pull=None, value=None):
        self.pin_id = pin_id
        self.mode = mode
        self.pull = pull
        self._value = 1 if pull == Pin.PULL_UP else 0
        if value is not None:
            self._value = value
        self.history = []
        Pin.pins_by_id[pin_id] = self

    def value(self, val=None):
        if val is None:
            return self._value
        self._value = 1 if val else 0
        self.history.append(self._value)
        return self._value

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)

    def low(self):
        self.value(0)

    def high(self):
        self.value(1)


class SPI:
    def __init__(self, spi_id, baudrate=4_000_000, polarity=0, phase=0, sck=None, mosi=None, miso=None):
        self.spi_id = spi_id
        self.baudrate = baudrate
        self.polarity = polarity
        self.phase = phase
        self.sck = sck
        self.mosi = mosi
        self.miso = miso
        self.writes = []  # records all byte writes

    def write(self, buf):
        # Store a copy of bytes written
        data = bytes(buf)
        self.writes.append(data)
        return len(data)

    def read(self, nbytes, write=0x00):
        return bytes([0x00] * nbytes)

    def write_readinto(self, write_buf, read_buf):
        self.write(write_buf)
