# Web API

No authentication. All routes answer CORS preflight.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | The web app (`data/index.html`) |
| GET | `/status` | `{"ok":true,"version":"..."}` |
| GET | `/capture` | Wait up to 8 s for an IR signal. `200 {code, protocol, bits}` or `408 {error}` |
| GET | `/send?code=0x20DF10EF&protocol=NEC&bits=32` | Send a code. `protocol` defaults to `NEC`, `bits` to `32` |
| GET | `/remotes` | JSON array of all remotes |
| POST | `/remotes` | Create or replace a remote (JSON body with an `id`) |
| DELETE | `/remotes?id=<id>` | Delete a remote |

```bash
curl http://192.168.1.50/capture
curl "http://192.168.1.50/send?code=0x20DF10EF&protocol=NEC&bits=32"
```
