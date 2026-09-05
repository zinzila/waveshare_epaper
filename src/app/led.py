"""LED helper for Raspberry Pi Pico W."""
import time

try:
    from machine import Pin
except ImportError:
    Pin = None


def blink(times=1, duration_ms=100):
    """Blink the onboard LED (Pin "LED" on Pico W, or Pin 25 on standard Pico)."""
    if Pin is None:
        return

    led = None
    for pin_name in ("LED", 25):
        try:
            led = Pin(pin_name, Pin.OUT)
            break
        except Exception:
            continue

    if led is None:
        return

    for _ in range(times):
        led.value(1)
        time.sleep_ms(duration_ms)
        led.value(0)
        time.sleep_ms(duration_ms)
