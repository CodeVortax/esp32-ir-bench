#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

#ifndef IR_TX_PIN
#define IR_TX_PIN 4
#endif

#ifndef IR_RX_PIN
#define IR_RX_PIN 5
#endif

// Override these or configure via AP mode fallback ("IRBench-ESP32")
static const char* WIFI_SSID = "IRBench-AP";
static const char* WIFI_PASS = "irbench123";
static const char* AP_SSID   = "IRBench-ESP32";
static const char* AP_PASS   = "12345678";

struct __attribute__((packed)) IRCommandFrame {
  uint8_t  protocol_id;   // 1=NEC, 2=SIRC, 3=SAMSUNG32, 4=RC5, 5=DAIKIN, 6=RAW
  uint8_t  carrier_khz;   // 36..56 kHz
  uint16_t cmd_hash;      // 16-bit big-endian command LUT / tag
  uint32_t payload;       // 32-bit big-endian IR word
};

static IRsend irsend(IR_TX_PIN);
static IRrecv irrecv(IR_RX_PIN, 256, 15, true);
static decode_results rxResults;
static AsyncWebServer server(80);

static String powerSaveMode = "WIFI_PS_NONE";
static uint64_t totalTxCount = 0;

static uint32_t bswap32(uint32_t v) {
  return ((v & 0x000000FFu) << 24) |
         ((v & 0x0000FF00u) << 8)  |
         ((v & 0x00FF0000u) >> 8)  |
         ((v & 0xFF000000u) >> 24);
}

static uint16_t bswap16(uint16_t v) {
  return (uint16_t)((v << 8) | (v >> 8));
}

static void dispatchIRCommand(uint8_t protoId, uint8_t carrierKhz, uint32_t payload) {
  uint8_t khz = (carrierKhz >= 30 && carrierKhz <= 60) ? carrierKhz : 38;
  switch (protoId) {
    case 1:  // NEC
      irsend.sendNEC(payload, 32, 0);
      break;
    case 2:  // SONY_SIRC
      irsend.sendSony(payload, 15, 2);
      break;
    case 3:  // SAMSUNG32
      irsend.sendSAMSUNG(payload, 32, 0);
      break;
    case 4:  // RC5
      irsend.sendRC5(payload & 0x0FFFu, 12, 0);
      break;
    case 5: { // DAIKIN_HVAC compact trigger
      uint8_t state[35] = {0};
      state[0] = 0x11;
      state[1] = 0xDA;
      state[2] = 0x27;
      state[5] = (uint8_t)(payload & 0xFF);
      irsend.sendDaikin(state, 35, 0);
      break;
    }
    default: {
      // Fallback 32-bit NEC-framed pulse on requested carrier
      uint16_t rawBuf[67];
      rawBuf[0] = 9000;
      rawBuf[1] = 4500;
      for (int i = 0; i < 32; ++i) {
        bool bit = (payload >> (31 - i)) & 1;
        rawBuf[2 + i * 2] = 560;
        rawBuf[3 + i * 2] = bit ? 1690 : 560;
      }
      rawBuf[66] = 560;
      irsend.sendRaw(rawBuf, 67, khz);
      break;
    }
  }
  totalTxCount++;
}

static void setupCorsHeaders() {
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");
}

void setup() {
  Serial.begin(115200);
  irsend.begin();
  irrecv.enableIRIn();

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 4500) {
    delay(100);
  }

  esp_wifi_set_ps(WIFI_PS_NONE);
  setupCorsHeaders();

  server.on("/health", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["ok"] = true;
    doc["firmware"] = "irbench-rmt-v2.4";
    doc["ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : String(AP_SSID);
    doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -38;
    doc["channel"] = WiFi.channel();
    doc["powerSave"] = powerSaveMode;
    doc["txCount"] = totalTxCount;
    String out;
    serializeJson(doc, out);
    req->send(200, "application/json", out);
  });

  server.on("/config", HTTP_POST,
    [](AsyncWebServerRequest* req) {},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
      if (index + len < total) return;
      JsonDocument doc;
      if (deserializeJson(doc, data, len) == DeserializationError::Ok) {
        String ps = doc["wifiPowerSave"] | "WIFI_PS_NONE";
        if (ps == "WIFI_PS_MIN_MODEM") {
          esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
          powerSaveMode = "WIFI_PS_MIN_MODEM";
        } else {
          esp_wifi_set_ps(WIFI_PS_NONE);
          powerSaveMode = "WIFI_PS_NONE";
        }
      }
      req->send(200, "application/json", "{\"ok\":true,\"powerSave\":\"" + powerSaveMode + "\"}");
    }
  );

  // Supports BOTH 8-byte zero-allocation binary IRCommandFrame AND Legacy JSON
  server.on("/ir/tx", HTTP_POST,
    [](AsyncWebServerRequest* req) {},
    nullptr,
    [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
      if (index + len < total) return;
      int64_t t0 = esp_timer_get_time();

      if (len == sizeof(IRCommandFrame) && req->contentType().indexOf("octet-stream") >= 0) {
        const auto* frame = reinterpret_cast<const IRCommandFrame*>(data);
        uint32_t payload = bswap32(frame->payload);
        uint16_t cmdHash = bswap16(frame->cmd_hash);
        dispatchIRCommand(frame->protocol_id, frame->carrier_khz, payload);
        int64_t parseUs = esp_timer_get_time() - t0;
        char resp[96];
        snprintf(resp, sizeof(resp), "{\"ack\":1,\"codec\":\"binary\",\"hash\":%u,\"us\":%lld}", cmdHash, parseUs);
        req->send(200, "application/json", resp);
        return;
      }

      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, data, len);
      if (err) {
        req->send(400, "application/json", "{\"ack\":0,\"err\":\"BAD_PAYLOAD\"}");
        return;
      }
      uint8_t protoId = doc["protocolId"] | 1;
      uint8_t khz = doc["carrierKhz"] | 38;
      const char* codeHex = doc["codeHex"] | "0x20DF10EF";
      uint32_t payload = (uint32_t)strtoul(codeHex, nullptr, 16);
      dispatchIRCommand(protoId, khz, payload);

      int64_t parseUs = esp_timer_get_time() - t0;
      char resp[96];
      snprintf(resp, sizeof(resp), "{\"ack\":1,\"codec\":\"json\",\"us\":%lld}", parseUs);
      req->send(200, "application/json", resp);
    }
  );

  server.on("/ir/rx", HTTP_GET, [](AsyncWebServerRequest* req) {
    if (!irrecv.decode(&rxResults)) {
      req->send(204);
      return;
    }
    JsonDocument doc;
    doc["protocol"] = typeToString(rxResults.decode_type);
    doc["codeHex"] = "0x" + uint64ToString(rxResults.value, 16);
    doc["bits"] = rxResults.bits;
    doc["pulseCount"] = rxResults.rawlen > 0 ? rxResults.rawlen - 1 : 0;
    JsonArray raw = doc["rawTimingsUs"].to<JsonArray>();
    for (uint16_t i = 1; i < rxResults.rawlen; ++i) {
      raw.add((uint32_t)(rxResults.rawbuf[i] * kRawTick));
    }
    irrecv.resume();
    String out;
    serializeJson(doc, out);
    req->send(200, "application/json", out);
  });

  server.onNotFound([](AsyncWebServerRequest* req) {
    if (req->method() == HTTP_OPTIONS) {
      req->send(204);
    } else {
      req->send(404, "text/plain", "Not found");
    }
  });

  server.begin();
}

void loop() {
  delay(10);
}
