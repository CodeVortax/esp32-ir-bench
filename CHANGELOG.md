# Changelog

Versions follow `FW_VERSION` in `include/config.h`. All releases are betas.

## 0.4.0-beta

### Added
- WiFi setup from the phone. The credentials are saved in flash, so no password lives in the code or in a public build.
- Hotspot fallback: when the board can't join a network in 15 seconds it opens `IR-Bench` at `192.168.4.1`, and the whole app works there.
- `/setup` page with network scan, and a WiFi card on the home screen.
- Hold BOOT for 5 seconds to forget the saved WiFi.

### Changed
- `WIFI_SSID` and `WIFI_PASSWORD` in `config.h` are now optional first-boot defaults and ship empty.

## 0.3.0-beta

### Changed
- Moved from a single Arduino `.ino` to a PlatformIO project with the web app in `data/index.html` (LittleFS).
- Ported JSON handling to ArduinoJson 7 (`JsonDocument`).
- One merged image (`./build.sh merge`) and GitHub Actions build, same as the repeater project.

### Added
- `/status` now reports the firmware version.
- Saving a remote returns an error if the flash write fails.
