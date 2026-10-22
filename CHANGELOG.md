# Changelog

Versions follow `FW_VERSION` in `include/config.h`. All releases are betas.

## 0.3.0-beta

### Changed
- Moved from a single Arduino `.ino` to a PlatformIO project with the web app in `data/index.html` (LittleFS).
- Ported JSON handling to ArduinoJson 7 (`JsonDocument`).
- One merged image (`./build.sh merge`) and GitHub Actions build, same as the repeater project.

### Added
- `/status` now reports the firmware version.
- Saving a remote returns an error if the flash write fails.
