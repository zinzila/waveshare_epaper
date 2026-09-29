---
name: inspect-device
description: Check what happens on the Raspberry Pi Pico after deploying the e-Paper project — verify deployed files, run main.py and watch its output, inspect memory and filesystem, and debug boot errors via mpremote.
---

# Inspect Device After Deploy

Use after `uv run deploy` (see the `deploy-to-pico` skill) to verify the board actually works. All commands use `mpremote`; substitute the port per OS (`/dev/ttyACM0` on Linux, `COMx` on Windows, `/dev/cu.usbmodem*` on macOS). `mpremote` with no `connect` auto-connects to the first USB serial device.

## Verify the deployed files

```bash
mpremote fs ls :/                 # root: should show main.py, epdws/, lib/
mpremote fs tree :/               # full tree
mpremote fs cat :/main.py         # confirm main.py content matches examples/main.py
mpremote df                       # filesystem free/used space
```

## Run the program and watch its output

Run the deployed `main.py` and capture errors without re-deploying:

```bash
mpremote soft-reset repl          # soft-reset restarts main.py, then shows its output live
```

Exit the REPL with `Ctrl-]`. To watch output from a hard reset instead:

```bash
mpremote reset sleep 0.5 repl     # hard reset, wait for boot, then monitor output
```

To run a local script directly from RAM (no copy to device, device `main.py` untouched):

```bash
mpremote run examples/main.py
```

Note: `run` executes after a soft reset, so the device's own `main.py` is not run beforehand.

## Check runtime state

```bash
mpremote exec "import gc; print(gc.mem_free())"          # free heap in bytes
mpremote exec "import epdws; print(epdws.__file__)"      # confirm the library imports
mpremote eval "machine.freq()"                            # sanity-check the runtime
```

Action commands (`exec`, `eval`, `run`, `fs`) interrupt a running program but do not clear the heap; state persists across invocations. Prefix with `soft-reset` when a clean state is needed:

```bash
mpremote soft-reset exec "import gc; print(gc.mem_free())"
```

## Interpreting what you see

- **`ImportError: no module named 'epdws'`** — the deploy didn't upload `src/epdws/` to `/epdws`; re-run `uv run deploy`.
- **`RefreshTooSoon`** — expected if `main.py` refreshes within the 180 s throttle window (`min_interval_s`); wait or power-cycle.
- **`PanelTimeout: BUSY never released`** — wiring/power/SPI problem; check the BUSY pin (active-low, GP13) and that no other serial monitor holds the port.
- **Silent board, no output** — `main.py` may have crashed before any print; use `soft-reset repl` to see the traceback.
- A full refresh takes ~15 s; the panel enters deep sleep automatically after each refresh, so subsequent `exec` commands may need the board woken via soft reset.
