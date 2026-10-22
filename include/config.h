#pragma once

#define FW_VERSION               "0.3.0-beta"

// ---------------- WiFi (your home router) ----------------
#define WIFI_SSID                "YOUR_WIFI_NAME"
#define WIFI_PASSWORD            "YOUR_WIFI_PASSWORD"

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
