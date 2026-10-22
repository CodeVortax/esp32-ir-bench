# Building

## Requirements

- Python 3 and PlatformIO: `pip install -U platformio`
- Internet on the first build (platform, toolchain and libraries are downloaded and cached)

## Commands

```bash
./build.sh            # compile only
./build.sh merge      # firmware + web UI -> dist/esp32dev-merged.bin
./build.sh bin        # merge, then copy to your phone's Downloads (Termux)
./build.sh upload     # flash the firmware over USB
./build.sh uploadfs   # upload the web UI (data/) over USB
./build.sh monitor    # serial monitor
./build.sh clean
```

`./build.sh merge` runs `pio run -t webflash`: it builds the firmware and the LittleFS image (`data/`), then merges bootloader, partition table, app and web UI into **one file** flashed at `0x0`. A `.sha256` is written next to it.

## Termux

```bash
pkg install python git
pip install -U platformio
termux-setup-storage          # once, to get ~/storage/downloads
./build.sh bin
```

The `.bin` lands in `~/storage/downloads/esp32-ir-bench.bin`. PlatformIO's toolchain targets desktop Linux, so on some phones the build only works in proot or CI. If Termux can't build it, let GitHub Actions do it and download the artifact.

## Continuous integration

`.github/workflows/build-firmware.yml` runs on pushes to `master`, pull requests, tags `v*` and manual dispatch. It runs `pio run -t webflash`, checks the image fits 4 MB, and uploads `esp32-ir-bench-<ref>.bin` + `.sha256` as the `firmware` artifact. A tag like `v0.3.0` also creates a GitHub Release.
