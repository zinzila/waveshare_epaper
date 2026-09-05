# Reference Notes: Raspberry Pi Pico W with Waveshare Pico-ePaper-2.9-B

## Hardware Specification
- **Panel**: Waveshare Pico-ePaper-2.9-B (Controller: GDEW029Z10)
- **Resolution**: 296 x 128 (native panel scan 128 x 296)
- **Colors**: Black, White, Red (Tri-color E-Ink)
- **Interface**: 3-line or 4-line SPI (Write-only, no MISO)
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
