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
