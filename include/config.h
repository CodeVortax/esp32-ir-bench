#pragma once

#define FW_VERSION               "0.4.0-beta"

// ---------------- WiFi ----------------
// Optional first-boot defaults. Leave them empty and set WiFi from your
// phone instead: when the board can't connect it opens its own hotspot.
#define WIFI_SSID                ""
#define WIFI_PASSWORD            ""
#define WIFI_CONNECT_TIMEOUT_MS  15000

// Hotspot the board opens when it has no WiFi (then open http://192.168.4.1)
#define AP_SSID                  "IR-Bench"
#define AP_PASSWORD              "irbench123"   // 8 characters or more

// Hold the BOOT button (GPIO0) this long to forget the saved WiFi.
#define RESET_HOLD_MS            5000

// ---------------- Pins ----------------
// Bare 3-leg receiver (VCC / GND / OUT): OUT -> IR_RECV_PIN.
// Bare 2-leg LED with no resistor: bursts are only milliseconds long, so
// direct drive is OK for bench testing. Add ~100-150 ohm in series as soon
// as you have one (your old remote's board usually has one already).
#define IR_RECV_PIN               4
#define IR_SEND_PIN               14

// ---------------- Web server / capture ----------------
#define WEB_SERVER_PORT          80
#define CAPTURE_TIMEOUT_MS       8000
#define REMOTES_FILE             "/remotes.json"
