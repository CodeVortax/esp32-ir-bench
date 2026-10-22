<div align="center">

# ESP32 IR Bench

**Build virtual remotes. Capture codes from your old clicker. Fire them back from your phone.**

An ESP32 that learns infrared codes from a real remote and replays them through an IR LED, with a phone-friendly web app served by the chip itself.

[![Build](https://github.com/CodeVortax/esp32-ir-bench/actions/workflows/build-firmware.yml/badge.svg)](https://github.com/CodeVortax/esp32-ir-bench/actions/workflows/build-firmware.yml)
[![Version](https://img.shields.io/badge/version-0.4.0--beta-4285F4?style=flat-square)](CHANGELOG.md)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-34A853?style=flat-square)](LICENSE)
[![Chip](https://img.shields.io/badge/chip-ESP32-E7352C?style=flat-square&logo=espressif&logoColor=white)](#install)
[![PlatformIO](https://img.shields.io/badge/PlatformIO-Arduino-F5822A?style=flat-square&logo=platformio&logoColor=white)](#tech-stack)

[Features](#features) · [Wiring](#wiring) · [Install](#install) · [Documentation](#documentation) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## Features

- **Two ways to make a remote:** add circle / square / pill / bar buttons one by one, or photograph your real remote and tap where each button is.
- **Learn mode:** hold a button, press the same key on the old remote, and the ESP32 decodes it (protocol, bits, code).
- **Run mode:** tap a button to send the code out of the IR LED. Photo remotes show invisible hotspots over the real picture.
- **Remotes survive reboots:** names, layouts and codes are stored in flash (LittleFS). Photos stay in the phone's browser because they are too big for flash.
- **No cloud, no app:** open `http://<esp32-ip>` on any phone on your WiFi.
- **WiFi from your phone:** no password in the code; the board opens its own hotspot when it has no network.

## Wiring

| Part | Wire it to | Label on the board |
|---|---|---|
| IR receiver VCC | 3.3 V | `3V3` |
| IR receiver GND (middle leg) | Ground | `GND` |
| IR receiver OUT (signal) | GPIO 4 | `D4` |
| IR LED long leg (+) | GPIO 14 | `D14` |
| IR LED short leg (−) | Ground | `GND` |

- Power the receiver from `3V3`, never `VIN`: `VIN` is 5 V and would put 5 V on the signal pin.
- Receiver pinouts differ. With the dark window facing you and the legs down, most read VCC, GND, OUT or OUT, GND, VCC from left to right. If capture never works, check the datasheet or swap the two outer legs.
- Change the pins in [`include/config.h`](include/config.h). A bare LED works for bench testing because bursts are milliseconds long; add a 100 to 150 ohm resistor as soon as you have one.

## Install

1. Build the single flashable file:

   ```bash
   pip install -U platformio
   ./build.sh merge          # -> dist/esp32dev-merged.bin
   ```

   Can't build on your phone? Push to GitHub and download the `firmware` artifact from Actions.
2. Flash it at offset `0x0`. See [Flashing](docs/guides/flashing.md).
3. Set the WiFi from your phone (no password in the code):
   - The board can't connect yet, so it opens a hotspot named **IR-Bench** (password `irbench123`).
   - Join it, open **http://192.168.4.1/setup**, pick your network, enter the password, tap **Save and restart**.
   - After the restart it joins your router. Find its IP on the serial monitor (115200) or in your router's device list.
4. To change networks later, open `/setup` again, or hold **BOOT** for 5 seconds to forget the saved WiFi.

The remote app also works over the hotspot at `http://192.168.4.1`, with no router needed.

## Tech stack

PlatformIO · Arduino-ESP32 3.3.11 (pioarduino, pinned) · IRremoteESP8266 · ArduinoJson 7 · LittleFS · plain HTML/CSS/JS, no framework.

## Project layout

```
src/main.cpp          HTTP routes, IR capture/send, remote storage
include/config.h      WiFi, pins, timeouts, version
data/index.html       the web app (flashed to LittleFS)
scripts/merge_bins.py `pio run -t webflash`: one merged image
min_spiffs.csv        partition table
build.sh              build / flash helper
docs/                 guides and API
```

## Documentation

See [docs/README.md](docs/README.md).

## Good to know

- Flashing the merged image rewrites the filesystem, so **saved remotes are erased**. To update only the firmware or UI, use `./build.sh upload` / `./build.sh uploadfs`.
- Capture waits 8 seconds for a signal and blocks the server while waiting.
- Unknown protocols can't be captured yet; the code is decoded, not recorded raw.
- There is no login, and anyone on the network can open `/setup`. Run it on a network you trust.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0-only](LICENSE).
