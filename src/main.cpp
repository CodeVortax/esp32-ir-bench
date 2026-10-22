// IR Bench: build virtual remotes, capture IR codes from a real remote,
// and fire them back out through an IR LED. UI lives in data/index.html
// (LittleFS); remotes persist in /remotes.json on the same filesystem.
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

#include "config.h"

IRrecv irrecv(IR_RECV_PIN, 1024, 15, true);
IRsend irsend(IR_SEND_PIN);
decode_results results;
WebServer server(WEB_SERVER_PORT);
Preferences prefs;
bool apMode = false;

// ---------------- WiFi credentials (saved in NVS, not in the code) ----------------
static void loadCreds(String& ssid, String& pass) {
  prefs.begin("wifi", true);
  ssid = prefs.getString("ssid", WIFI_SSID);
  pass = prefs.getString("pass", WIFI_PASSWORD);
  prefs.end();
}
static void saveCreds(const String& ssid, const String& pass) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
}
static void clearCreds() {
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
}

const char SETUP_HTML[] PROGMEM = R"IRSETUP(<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>IR Bench WiFi</title>
<style>
body{margin:0;background:#0a0f0c;color:#e9f1ec;font-family:system-ui,sans-serif;padding:22px;max-width:480px;margin:auto}
h1{font-size:22px;margin:8px 0 4px}p{color:#7c9086;font-size:14px;line-height:1.5}
label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7c9086;margin:18px 0 8px}
input,select{width:100%;box-sizing:border-box;background:#121a16;border:1px solid #22302a;border-radius:12px;padding:13px;color:#e9f1ec;font-size:15px}
button{width:100%;margin-top:14px;padding:14px;border-radius:12px;border:0;background:#ff8a3d;color:#1a1006;font-weight:700;font-size:15px}
button.g{background:transparent;border:1px solid #22302a;color:#7c9086;font-weight:400}
button.d{background:transparent;border:1px solid rgba(255,93,108,.4);color:#ff5d6c;font-weight:400}
#msg{margin-top:16px;font-size:14px;color:#57e39a;min-height:20px}#st{font-size:13px;color:#7c9086}
a{color:#ff8a3d}
</style></head><body>
<h1>WiFi setup</h1><p id="st">Checking…</p>
<label>Network</label><select id="nets"><option value="">Tap Scan to list networks</option></select>
<button class="g" onclick="scan()">Scan</button>
<label>Or type the name</label><input id="ssid" placeholder="WiFi name" autocomplete="off">
<label>Password</label><input id="pass" type="password" placeholder="WiFi password" autocomplete="off">
<button onclick="save()">Save and restart</button>
<button class="d" onclick="forget()">Forget saved WiFi</button>
<div id="msg"></div><p><a href="/">Back to the remotes</a></p>
<script>
const $=id=>document.getElementById(id);
fetch('/wifi/status').then(r=>r.json()).then(s=>{
 $('st').textContent=s.mode==='ap'?'Not on WiFi. You are on the IR Bench hotspot.':'Connected to '+s.ssid+' ('+s.ip+')';
}).catch(()=>{$('st').textContent='';});
$('nets').onchange=e=>{if(e.target.value)$('ssid').value=e.target.value;};
function scan(){
 $('msg').style.color='#7c9086';$('msg').textContent='Scanning…';
 fetch('/wifi/scan').then(r=>r.json()).then(list=>{
  const n=$('nets');n.innerHTML='<option value="">'+(list.length?'Pick a network':'None found')+'</option>';
  list.forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=x;n.appendChild(o);});
  $('msg').textContent='';
 }).catch(()=>{$('msg').style.color='#ff5d6c';$('msg').textContent='Scan failed';});
}
function post(url,body,ok){
 fetch(url,{method:'POST',body:body}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(x=>{
  if(!x.ok){$('msg').style.color='#ff5d6c';$('msg').textContent=x.j.error||'Failed';return;}
  $('msg').style.color='#57e39a';$('msg').textContent=ok;
 }).catch(()=>{$('msg').style.color='#57e39a';$('msg').textContent=ok;});
}
function save(){
 const b=new URLSearchParams();b.set('ssid',$('ssid').value.trim());b.set('pass',$('pass').value);
 post('/wifi/save',b,'Saved. The board is restarting. Join your normal WiFi, then open the IP it prints on the serial monitor or in your router list.');
}
function forget(){post('/wifi/forget',new URLSearchParams(),'Forgotten. The board is restarting into hotspot mode.');}
</script></body></html>)IRSETUP";

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

// ---------------- WiFi setup routes ----------------
static void handleSetupPage() {
  server.send_P(200, "text/html; charset=utf-8", SETUP_HTML);
}

static void handleWifiStatus() {
  addCors();
  JsonDocument doc;
  doc["mode"] = apMode ? "ap" : "sta";
  doc["ssid"] = apMode ? String(AP_SSID) : WiFi.SSID();
  doc["ip"] = apMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["version"] = FW_VERSION;
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void handleWifiScan() {
  addCors();
  int n = WiFi.scanNetworks();
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < n; i++) {
    String name = WiFi.SSID(i);
    if (name.length() == 0) continue;
    bool dup = false;
    for (JsonVariant v : arr) {
      if (name == v.as<const char*>()) { dup = true; break; }
    }
    if (!dup) arr.add(name);
  }
  WiFi.scanDelete();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void handleWifiSave() {
  addCors();
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  ssid.trim();
  if (ssid.length() < 1 || ssid.length() > 32) {
    server.send(400, "application/json", "{\"error\":\"WiFi name must be 1 to 32 characters\"}");
    return;
  }
  if (pass.length() != 0 && (pass.length() < 8 || pass.length() > 63)) {
    server.send(400, "application/json", "{\"error\":\"Password must be 8 to 63 characters\"}");
    return;
  }
  saveCreds(ssid, pass);
  server.send(200, "application/json", "{\"saved\":true}");
  delay(400);
  ESP.restart();
}

static void handleWifiForget() {
  addCors();
  clearCreds();
  server.send(200, "application/json", "{\"forgotten\":true}");
  delay(400);
  ESP.restart();
}

// ---------------- setup / loop ----------------
static bool connectStation(const String& ssid, const String& pass) {
  if (ssid.length() == 0) return false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.print("Connecting to WiFi \"" + ssid + "\"");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nIR Bench " FW_VERSION);
  pinMode(0, INPUT_PULLUP);
  irsend.begin();

  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");

  String ssid, pass;
  loadCreds(ssid, pass);
  if (connectStation(ssid, pass)) {
    Serial.print("Connected! Open this on your phone: http://");
    Serial.println(WiFi.localIP());
  } else {
    apMode = true;
    WiFi.disconnect(true);
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.println("No WiFi. Hotspot \"" AP_SSID "\" (password " AP_PASSWORD ") is on.");
    Serial.print("Join it, then open http://");
    Serial.println(WiFi.softAPIP());
  }

  server.on("/", HTTP_GET, handleRoot);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/send", HTTP_GET, handleSend);
  server.on("/setup", HTTP_GET, handleSetupPage);
  server.on("/wifi/status", HTTP_GET, handleWifiStatus);
  server.on("/wifi/scan", HTTP_GET, handleWifiScan);
  server.on("/wifi/save", HTTP_POST, handleWifiSave);
  server.on("/wifi/forget", HTTP_POST, handleWifiForget);
  server.on("/remotes", HTTP_GET, handleGetRemotes);
  server.on("/remotes", HTTP_POST, handleSaveRemote);
  server.on("/remotes", HTTP_DELETE, handleDeleteRemote);
  for (const char* p : {"/status", "/capture", "/send", "/remotes"}) server.on(p, HTTP_OPTIONS, handleOptions);

  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();

  // Recovery: hold BOOT to forget the saved WiFi.
  static unsigned long pressedAt = 0;
  if (digitalRead(0) == LOW) {
    if (!pressedAt) pressedAt = millis();
    else if (millis() - pressedAt > RESET_HOLD_MS) {
      clearCreds();
      Serial.println("WiFi forgotten (BOOT held). Restarting.");
      delay(200);
      ESP.restart();
    }
  } else {
    pressedAt = 0;
  }
}
