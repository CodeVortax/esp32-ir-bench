// IR Bench: build virtual remotes, capture IR codes from a real remote,
// and fire them back out through an IR LED. UI lives in data/index.html
// (LittleFS); remotes persist in /remotes.json on the same filesystem.
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

#include "config.h"

IRrecv irrecv(IR_RECV_PIN, 1024, 15, true);
IRsend irsend(IR_SEND_PIN);
decode_results results;
WebServer server(WEB_SERVER_PORT);

// ---------------- helpers ----------------
static void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
}
static void handleOptions() { addCors(); server.send(204); }
static void handleStatus() {
  addCors();
  server.send(200, "application/json", "{\"ok\":true,\"version\":\"" FW_VERSION "\"}");
}

static void handleRoot() {
  File f = LittleFS.open("/index.html", "r");
  if (!f) {
    server.send(500, "text/plain",
                "Web UI missing. Flash the merged image or run: ./build.sh uploadfs");
    return;
  }
  server.streamFile(f, "text/html; charset=utf-8");
  f.close();
}

// ---------------- IR capture / send ----------------
static void handleCapture() {
  addCors();
  irrecv.enableIRIn();
  bool got = false;
  unsigned long startTime = millis();
  while (millis() - startTime < CAPTURE_TIMEOUT_MS) {
    if (irrecv.decode(&results)) { got = true; break; }
    delay(15);
  }
  irrecv.disableIRIn();

  if (!got || results.decode_type == decode_type_t::UNKNOWN) {
    server.send(408, "application/json", "{\"error\":\"timeout or unrecognized signal\"}");
    return;
  }
  String code = resultToHexidecimal(&results);
  String protocol = typeToString(results.decode_type);
  uint16_t bits = results.bits;
  server.send(200, "application/json",
              "{\"code\":\"" + code + "\",\"protocol\":\"" + protocol + "\",\"bits\":" + String(bits) + "}");
}

static void handleSend() {
  addCors();
  if (!server.hasArg("code")) {
    server.send(400, "application/json", "{\"error\":\"missing code\"}");
    return;
  }
  String codeStr = server.arg("code");
  String protoStr = server.hasArg("protocol") ? server.arg("protocol") : "NEC";
  uint16_t bits = server.hasArg("bits") ? server.arg("bits").toInt() : 32;

  uint64_t code = strtoull(codeStr.c_str(), NULL, 16);
  decode_type_t protocol = strToDecodeType(protoStr.c_str());

  if (protocol == decode_type_t::UNKNOWN) irsend.sendNEC(code, bits);
  else irsend.send(protocol, code, bits);

  server.send(200, "application/json", "{\"sent\":true}");
}

// ---------------- remotes persistence (one JSON array) ----------------
static String readRemotesFile() {
  if (!LittleFS.exists(REMOTES_FILE)) return "[]";
  File f = LittleFS.open(REMOTES_FILE, "r");
  String s = f.readString();
  f.close();
  return s.length() ? s : "[]";
}
static bool writeRemotesFile(const String& s) {
  File f = LittleFS.open(REMOTES_FILE, "w");
  if (!f) return false;
  f.print(s);
  f.close();
  return true;
}

static void handleGetRemotes() {
  addCors();
  server.send(200, "application/json", readRemotesFile());
}

static void handleSaveRemote() {
  addCors();
  JsonDocument incoming;
  if (deserializeJson(incoming, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }
  String incomingId = incoming["id"] | "";
  if (incomingId == "") {
    server.send(400, "application/json", "{\"error\":\"missing id\"}");
    return;
  }

  JsonDocument all;
  deserializeJson(all, readRemotesFile());
  JsonArray arr = all.as<JsonArray>();
  if (arr.isNull()) arr = all.to<JsonArray>();

  bool replaced = false;
  for (JsonVariant v : arr) {
    if (String((const char*)v["id"]) == incomingId) {
      v.set(incoming);
      replaced = true;
      break;
    }
  }
  if (!replaced) arr.add(incoming);

  String out;
  serializeJson(all, out);
  if (!writeRemotesFile(out)) {
    server.send(500, "application/json", "{\"error\":\"flash write failed\"}");
    return;
  }
  server.send(200, "application/json", "{\"saved\":true}");
}

static void handleDeleteRemote() {
  addCors();
  if (!server.hasArg("id")) {
    server.send(400, "application/json", "{\"error\":\"missing id\"}");
    return;
  }
  String id = server.arg("id");

  JsonDocument all;
  deserializeJson(all, readRemotesFile());
  JsonArray arr = all.as<JsonArray>();

  JsonDocument out;
  JsonArray outArr = out.to<JsonArray>();
  for (JsonVariant v : arr) {
    if (String((const char*)v["id"]) != id) outArr.add(v);
  }
  String s;
  serializeJson(out, s);
  if (!writeRemotesFile(s)) {
    server.send(500, "application/json", "{\"error\":\"flash write failed\"}");
    return;
  }
  server.send(200, "application/json", "{\"deleted\":true}");
}

// ---------------- setup / loop ----------------
void setup() {
  Serial.begin(115200);
  Serial.println("\nIR Bench " FW_VERSION);
  irsend.begin();

  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected! Open this on your phone: http://");
  Serial.println(WiFi.localIP());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/send", HTTP_GET, handleSend);
  server.on("/remotes", HTTP_GET, handleGetRemotes);
  server.on("/remotes", HTTP_POST, handleSaveRemote);
  server.on("/remotes", HTTP_DELETE, handleDeleteRemote);
  for (const char* p : {"/status", "/capture", "/send", "/remotes"}) server.on(p, HTTP_OPTIONS, handleOptions);

  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
}
