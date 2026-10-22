# Contributing

Small, focused changes keep this easy to maintain.

## Ground rules

- **Capture blocks for up to `CAPTURE_TIMEOUT_MS`.** Keep other handlers fast.
- **Everything the browser shows is text.** Use `escapeHtml` or `textContent` for remote and button names.
- **Validate before saving.** A bad request must never corrupt `/remotes.json`.
- **Licence.** Code is `AGPL-3.0-only`. If you add code from another project, keep its notice and say so in the pull request.

## Getting started

```bash
git clone https://github.com/CodeVortax/esp32-ir-bench && cd esp32-ir-bench
pip install -U platformio
./build.sh
```

## Bug reports

Include the version (`FW_VERSION`), your board, what you did, what you expected, and the serial log from boot. For capture problems, say which remote and protocol.

## Pull requests

- One topic per pull request.
- `./build.sh merge` must pass (CI runs it).
- Update `CHANGELOG.md` and the docs if behaviour changes.
