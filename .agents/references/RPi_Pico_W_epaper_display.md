# Reference Notes: Raspberry Pi Pico W with Waveshare Pico-ePaper-2.9-B

## Hardware Specification
- **Panel**: Waveshare Pico-ePaper-2.9-B (Controller: GDEW029Z10)
- **Resolution**: 296 x 128 (native panel scan 128 x 296)
- **Colors**: Black, White, Red (Tri-color E-Ink)
- **Interface**: 3-line or 4-line SPI (Write-only, no MISO wired — but see the SPI construction errata: MicroPython's `SPI(1)` still claims GP8 as its default MISO)
- **Refresh Time**: ~15-18 seconds full refresh
- **Minimum Refresh Interval**: 180 seconds (to protect pigment and prevent burn-in)

## Pinout Mapping (Pico Header)
| Signal | Default GPIO | Function | Direction |
|---|---|---|---|
| SCK | GP10 | SPI1 Clock | Output |
| MOSI | GP11 | SPI1 Master Out Slave In | Output |
| CS | GP9 | Chip Select (Active-Low) | Output |
| DC | GP8 | Data / Command Selection (0=cmd, 1=data) | Output |
| RST | GP12 | External Reset (Active-Low) | Output |
| BUSY | GP13 | Panel Busy State | Input (Pull-Up) |

## Critical Errata: BUSY Pin Polarity
> **IMPORTANT NOTE**: Early vendor reference documents mistakenly state `while busy.value() == 1` (active-high).
> On actual GDEW029Z10 panels, **BUSY is ACTIVE-LOW**:
> - `0` = Panel is busy performing refresh / internal command execution.
> - `1` = Panel is idle and ready for SPI traffic.
> The pin MUST be configured with an internal pull-up (`Pin.IN, Pin.PULL_UP`).
> Polling loop must re-send `0x71` (GET_STATUS) on each check with ~20ms sleep:
> ```python
> while busy.value() == 0:
>     command(0x71)
>     sleep_ms(20)
> ```

## Register Sequence Summary
1. **Reset**: RST=1 (250ms) -> RST=0 (10ms) -> RST=1 (150ms)
2. **Power On**: `0x04` -> wait busy
3. **Panel Setting**: `0x00` -> `[0x0F, 0x89]`
4. **Resolution**: `0x61` -> `[0x80, 0x01, 0x28]` (128 x 296)
5. **VCOM Setting**: `0x50` -> `[0x77]`
6. **Data Upload**:
   - Black/White Layer: `0x10` -> 4736 bytes (1 = white, 0 = black ink)
   - Red/White Layer: `0x13` -> 4736 bytes (1 = white, 0 = red ink)
7. **Refresh**: `0x12` -> wait busy (~15s)
8. **Power Off**: `0x02` -> wait busy
9. **Deep Sleep**: `0x07` -> `[0xA5]` -> sleep 2000ms -> RST=0

## Critical Errata: SPI Construction And The GPIO8/DC Pin Claim
> **IMPORTANT NOTE (supersedes the earlier "externally-created Pin objects"
> explanation, which was wrong)**: on a **freshly-reset RP2040**, constructing
> and initialising the SPI peripheral (`SPI(1)` + `.init()` — the claim was
> observed after both, not isolated to one) sets up its **default pin set —
> SCK=GP10, MOSI=GP11, MISO=GP8** — and **GP8 is the panel's DC pin**.
>
> The interface really is write-only (no MISO line is wired), but MicroPython
> still routes GP8 to the SPI peripheral's MISO function at construction. The
> DC pin then dies: the DC line floats, the panel can no longer distinguish
> commands from data, and the 4736-byte plane uploads are consumed as command
> bytes. The controller still powers on, accepts `0x12`, and completes a full
> ~13.7 s refresh with well-behaved BUSY — the conversation looks perfect —
> but the planes never arrive and the refresh renders **red/black noise**.
>
> **The claiming only happens when the SPI peripheral is fresh** (i.e. on
> boot / after a hard reset). After a soft reset (`mpremote run`, REPL work),
> the peripheral is already initialised, `SPI(1)` claims nothing, GP8 stays a
> GPIO, and everything works. This is why the bug hid: every PoC, every vendor
> comparison, and every REPL-driven test passed, while every boot run failed.
>
> **Fix — construct the DC pin AFTER the SPI peripheral** (the vendor driver's
> ordering), so it reclaims GP8 no matter what `SPI(1)` claimed:
> ```python
> self._rst = Pin(12, Pin.OUT, value=0)   # RST de-asserted (see next errata)
> self._cs = Pin(9, Pin.OUT, value=1)
> self._busy = Pin(13, Pin.IN, Pin.PULL_UP)
> self._spi = SPI(1)
> self._spi.init(baudrate=4_000_000)
> self._dc = Pin(8, Pin.OUT, value=0)     # AFTER SPI — reclaims GP8
> ```
> Verified by reading the IO_BANK0 `GPIO_CTRL` registers on device: pre-fix,
> `g8 funcsel=1` (SPI) after construction on boot; post-fix, `g8 funcsel=5`
> (SIO) for the whole run. The earlier theory — that passing explicit
> `sck=Pin(10), mosi=Pin(11)` objects was itself the fault — was wrong in
> mechanism (those runs failed for the same MISO-claim reason, since no
> `miso=` was given) and wrong in evidence (the "fix" was only ever validated
> in a soft-reset context).

## Critical Errata: RST Must Start De-Asserted (LOW)
> **IMPORTANT NOTE**: construct the RST pin with `value=0`, not `value=1`.
> At hard reset / power-on every Pico GPIO floats Hi-Z until the script
> constructs its Pin. Starting RST high raises the panel's reset line while
> CS/SCK/MOSI are still undriven, waking the controller into a state where it
> can latch garbage from floating inputs. The vendor driver constructs RST
> low and only raises it inside its reset pulse, with every control line
> already driven.
>
> ```python
> rst = Pin(12, Pin.OUT, value=0)   # NOT value=1
> ```
> The full reset pulse (`1 -> 0 -> 1`) then happens in `reset()` after all
> pins and the SPI peripheral are configured.

## Debugging Lesson: Boot Runs vs Soft-Reset Runs Are Different Worlds
> Any hardware test launched as `/main.py` on boot (deploy + reset) executes
> with a freshly-reset SPI peripheral and Hi-Z GPIOs; any test launched via
> `mpremote run` (soft reset) inherits the previous script's peripheral and
> pin state. A driver bug that only manifests on fresh peripherals will pass
> every REPL-driven test and fail every boot run — and the two populations
> can look like flakiness unless launch method is treated as an explicit
> variable. The red-noise bug above was "fixed" and "unfixed" several times
> purely because of which launch method each test used.
>
> When a display fault does not reproduce: record **how the failing and
> passing runs were launched**, not just what code they ran. Register-level
> evidence (IO_BANK0 `GPIO_CTRL` funcsel at `0x40014000 + 0x04 + 8*gpio`,
> funcsel in bits [4:0]; 1 = SPI, 5 = SIO) settles it definitively and costs
> no panel refresh cycles.

## Critical Errata: Multi-Byte Config Parameters Are Latched Per CS Edge
> **IMPORTANT NOTE**: The GDEW029Z10 latches multi-byte config parameters
> (`0x00` panel setting, `0x61` resolution, `0x50` VCOM) **per CS-low pulse**.
> Batching them into a single pulse leaves those registers unset, and the panel
> refreshes to a uniform colour regardless of the image data.
>
> Send one byte per CS pulse for config parameters:
> ```python
> command(0x00)                 # DC=0, CS low, send, CS high
> data(0x0F); data(0x89)        # DC=1, one CS pulse EACH
> ```
> But plane uploads (`0x10` / `0x13`, 4736 bytes) must stay in a **single** CS
> pulse. Routing them through a per-byte helper fragments one upload into 4736
> CS edges and it will not render.

## Critical Errata: First Refresh After Deep-Sleep Wake Is Unclean
> **IMPORTANT NOTE**: The panel must be cleared before real content, and the clear
> and the real content must be **two separate power cycles**:
> ```python
> init(); Clear(0xFF, 0xFF); refresh(); sleep()   # clear pass
> sleep_ms(2000)
> init(); display(real_content); sleep()          # real content, cold wake
> ```
> Re-initialising while the panel is still awake does NOT work: the real-content
> refresh then becomes the unclean first refresh, its data is discarded, and the
> panel is left showing the stale clear frame. Cost: ~2x refresh time
> (~28-35s per update, two ~13.7s refreshes plus the sleep).
>
> The same reason BUSY polling needs a **settle delay** (e.g. `sleep_ms(100)`)
> before sampling. Without it the controller may not have asserted BUSY low yet,
> so the poll reads stale idle and the caller powers off mid-refresh.

## Observing Panel State: Only the Settled Frame Counts
> E-paper is bistable. During a refresh the controller sweeps and settles, so
> the panel transiently shows garbage while both planes reload. A correctly
> working driver can pass through a noisy intermediate stage before arriving at
> the right image. Judge success **only** by the settled state, after the
> refresh's BUSY has released.
>
> Corollary for debugging: a blank panel is **not** evidence of success. A
> clear-to-white pass and a totally failed driver are indistinguishable on the
> glass, and leftover content from a previous run can be mistaken for "it
> worked". Reference tests must draw content that could not be present by
> accident.

## Tri-Colour Bit Semantics (verified on hardware)
Both planes use `1 = white / no ink`, `0 = ink`:
- Black plane: `0` = black ink
- Red plane: `0` = red ink

Consequence: an **all-`0x00` red plane renders as solid red**, not black. An
all-black image therefore needs black plane `0x00` and red plane `0xFF` - the two
are complements. Verified via a vendor-driver control: all-`0x00` on both planes
produces clean solid red, confirming the red plane latches data correctly.
