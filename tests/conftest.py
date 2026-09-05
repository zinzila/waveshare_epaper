"""Test setup for host CPython execution.

Installs fakes for microPython-specific builtins (framebuf, machine, time helpers)
and ensures src/ is on sys.path.
"""
import sys
import os
import time

# Add src to sys.path
SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

# Mock micropython module
class FakeMicroPython:
    @staticmethod
    def const(x):
        return x

sys.modules["micropython"] = FakeMicroPython()

# Mock framebuf
from tests.fakes import framebuf as fake_framebuf
sys.modules["framebuf"] = fake_framebuf

# Mock machine
from tests.fakes import machine as fake_machine
sys.modules["machine"] = fake_machine

# Mock time helpers if missing
TICKS_PERIOD = 1 << 30
TICKS_HALF = TICKS_PERIOD // 2

_simulated_time_ms = 1000

def _ticks_ms():
    global _simulated_time_ms
    return _simulated_time_ms % TICKS_PERIOD

def _sleep_ms(ms):
    global _simulated_time_ms
    _simulated_time_ms += ms

def _ticks_add(ticks, delta):
    return (ticks + delta) % TICKS_PERIOD

def _ticks_diff(t1, t2):
    diff = (t1 - t2) & (TICKS_PERIOD - 1)
    if diff >= TICKS_HALF:
        diff -= TICKS_PERIOD
    return diff

# Attach to time module
if not hasattr(time, "sleep_ms"):
    time.sleep_ms = _sleep_ms
if not hasattr(time, "ticks_ms"):
    time.ticks_ms = _ticks_ms
if not hasattr(time, "ticks_add"):
    time.ticks_add = _ticks_add
if not hasattr(time, "ticks_diff"):
    time.ticks_diff = _ticks_diff
