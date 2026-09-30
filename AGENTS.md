# AGENTS.md

## Project Overview

MicroPython graphics library and utilities for the **Waveshare Pico e-Paper 2.9 (B)** — a GDEW029Z10 296x128 tri-color (Black / White / Red) panel — targeting Raspberry Pi Pico / Pico W / Pico 2.

## Language & Runtime

- **MicroPython** on the device; avoid CPython-specific standard libraries or heavy dependencies.
- Host-side tooling (lint, typecheck, tests, deploy) runs under CPython via `uv`.

## Development Workflow & Tooling

Host-side lint, typecheck, and test commands are covered by the `host-tooling` skill (`.agents/skills/host-tooling/SKILL.md`) — use it to validate changes under CPython via `uv` (ruff, mypy, pytest) without hardware.

### Deployment

Deploying to the board is covered by the `deploy-to-pico` skill (`.agents/skills/deploy-to-pico/SKILL.md`) — use it for `uv run deploy`, manual `mpremote` commands, and serial-port troubleshooting.

To verify what happens on the device after deploying (files, boot output, runtime state), use the `inspect-device` skill (`.agents/skills/inspect-device/SKILL.md`).

### Device Reference Tests

`examples/ref_test/<name>/main.py` holds **device reference tests**: minimal, single-purpose
scripts that flash the panel with one known, simple pattern to verify the hardware end to end.
They exist to isolate *where* a display fault lives — is it the drawing code, the SPI/BUSY
transport, or the panel init sequence?

Deploy one on demand; it overwrites `/main.py` and runs on boot:

```bash
uv run deploy --list-tools          # show available tests
uv run deploy --tool all_black      # push examples/ref_test/all_black/main.py as /main.py
uv run deploy --tool all_black --no-reset
```

Each test prints its plane ink counts and leading buffer bytes over serial, so you can confirm
what *should* have been sent before judging what the panel actually shows.

| Test | Pattern | Isolates |
|---|---|---|
| `all_black` | full-panel black flood | shared transport + black plane (`0x10`) |
| `all_red` | full-panel red flood | red plane (`0x13`), uploaded on a separate SPI path |

Run these before debugging a real image: if `all_black` is not uniformly black, the fault is in
`epdws/epd.py` (SPI framing, BUSY polling, init sequence), not in `canvas.py`. Because black and
red travel on different commands, the pair discriminates a shared fault from a plane-specific one.

Keep these tests deliberately free of drawing features — no text, shapes, or images — so a failure
points unambiguously at the transport. Add a new one as `examples/ref_test/<name>/main.py`; it is
picked up by discovery automatically, with no registry to update.

## Hardware Protocol

Full hardware details — panel spec, pinout, BUSY polarity errata, and the register sequence — live in `.agents/references/RPi_Pico_W_epaper_display.md`; read it when working on the driver (`epdws/epd.py`) or anything SPI/GPIO-related.

One safety-critical invariant: **BUSY is active-low** (`0` = busy, `1` = idle) with internal pull-up — vendor docs claiming active-high are wrong. Poll with an explicit loop and a timeout guard (see `Epd.wait_busy()`, which raises `PanelTimeout`).

## Code & Architecture Guidelines

### Frame Buffering

- Render shapes, text, and bitmaps into `framebuf.FrameBuffer` memory before flushing to the display.
- This panel is tri-color: use **two separate 1-bit `MONO_HLSB` framebuffers** (black plane + red plane), uploaded via commands `0x10` and `0x13` respectively. Do not use grayscale formats (e.g., `GS2_HMSB`) — the driver does not support them.

### Power & Hardware Safety

- Always return the panel to deep sleep after updates (`Epd.sleep()`); the driver does this automatically in `upload_and_refresh()`'s `finally` block — keep it that way to prevent screen burn-in.
- A full refresh takes ~15 s. `Display` enforces a throttle (`min_interval_s=180` by default, raising `RefreshTooSoon`) to avoid excessive refreshes.
- Monitor the BUSY pin with explicit polling loops and sensible timeout guards.

### Memory Optimization

- Keep heap allocations minimal during render loops (the driver preallocates command buffers; follow that pattern).
- Invoke `gc.collect()` when swapping large framebuffers or loading external bitmap/font assets.

### Code Structure

- Keep hardware interface initialization (`epdws/epd.py`) separated from rendering (`epdws/canvas.py`) and application logic (`examples/main.py`).
- Provide standalone, low-overhead test/example scripts for rapid deployment verification.
