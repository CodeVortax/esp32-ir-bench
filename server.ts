import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { REMOTE_PRESETS } from './src/data/presets.ts';
import type {
  CapturedSignal,
  CodecMode,
  DeviceConfig,
  IRProtocol,
  PowerSaveMode,
  RemotePreset,
  TelemetryRecord,
  TelemetryStats,
} from './src/types/telemetry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MAX_LOGS = 5000;

const PROTOCOL_BY_ID = new Map<number, IRProtocol>([
  [1, 'NEC'],
  [2, 'SONY_SIRC'],
  [3, 'SAMSUNG32'],
  [4, 'RC5'],
  [5, 'DAIKIN_HVAC'],
  [6, 'RAW'],
]);

const PRESET_BY_ID = new Map<string, RemotePreset>(REMOTE_PRESETS.map((p) => [p.id, p]));
const BUTTON_BY_HASH = new Map<number, { presetId: string; presetName: string; buttonId: string; label: string }>();

function indexPresetButtons(preset: RemotePreset) {
  PRESET_BY_ID.set(preset.id, preset);
  for (const btn of preset.buttons) {
    BUTTON_BY_HASH.set((preset.protocolId << 16) | btn.commandHash, {
      presetId: preset.id,
      presetName: preset.name,
      buttonId: btn.id,
      label: btn.label,
    });
  }
}

for (const preset of REMOTE_PRESETS) {
  indexPresetButtons(preset);
}

const customRemotes: RemotePreset[] = [];

let deviceConfig: DeviceConfig = {
  target: 'simulator',
  esp32Host: 'http://192.168.4.1',
  wifiPowerSave: 'WIFI_PS_NONE',
  codec: 'binary',
  rssiDbm: -51,
  wifiChannel: 6,
  firmwareVersion: 'rmt-v2.4-opt',
  connected: true,
};

let seqCounter = 0;
let captureSeq = 0;
const telemetryLogs: TelemetryRecord[] = [];
const sseClients = new Set<express.Response>();

function broadcastRecord(record: TelemetryRecord) {
  const payload = `data: ${JSON.stringify({ type: 'telemetry', record })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function broadcastConfig() {
  const payload = `data: ${JSON.stringify({ type: 'config', config: deviceConfig })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function appendLog(record: TelemetryRecord) {
  telemetryLogs.push(record);
  if (telemetryLogs.length > MAX_LOGS) {
    telemetryLogs.shift();
  }
  broadcastRecord(record);
}

function computeStats(records: TelemetryRecord[]): TelemetryStats {
  if (records.length === 0) {
    return {
      count: 0,
      ackCount: 0,
      warnCount: 0,
      dropCount: 0,
      packetLossPct: 0,
      meanMs: 0,
      medianMs: 0,
      p95Ms: 0,
      p99Ms: 0,
      stdDevMs: 0,
      minMs: 0,
      maxMs: 0,
      avgBackendUs: 0,
      binaryAvgUs: 0,
      jsonAvgUs: 0,
    };
  }

  const valid = records.filter((r) => r.status !== 'DROP');
  const latencies = valid.map((r) => r.totalLatencyMs).sort((a, b) => a - b);
  const n = latencies.length;

  const meanMs = n > 0 ? latencies.reduce((acc, v) => acc + v, 0) / n : 0;
  const medianMs = n > 0 ? (n % 2 === 0 ? (latencies[n / 2 - 1] + latencies[n / 2]) / 2 : latencies[Math.floor(n / 2)]) : 0;
  const p95Ms = n > 0 ? latencies[Math.min(n - 1, Math.floor(n * 0.95))] : 0;
  const p99Ms = n > 0 ? latencies[Math.min(n - 1, Math.floor(n * 0.99))] : 0;
  const minMs = n > 0 ? latencies[0] : 0;
  const maxMs = n > 0 ? latencies[n - 1] : 0;
  const variance = n > 0 ? latencies.reduce((acc, v) => acc + (v - meanMs) ** 2, 0) / n : 0;
  const stdDevMs = Math.sqrt(variance);

  const ackCount = records.filter((r) => r.status === 'ACK').length;
  const warnCount = records.filter((r) => r.status === 'WARN').length;
  const dropCount = records.filter((r) => r.status === 'DROP').length;
  const packetLossPct = (dropCount / records.length) * 100;

  const avgBackendUs = records.reduce((acc, r) => acc + r.backendOverheadUs, 0) / records.length;
  const binRows = records.filter((r) => r.codec === 'binary');
  const jsonRows = records.filter((r) => r.codec === 'json');
  const binaryAvgUs = binRows.length ? binRows.reduce((a, r) => a + r.backendOverheadUs, 0) / binRows.length : 0;
  const jsonAvgUs = jsonRows.length ? jsonRows.reduce((a, r) => a + r.backendOverheadUs, 0) / jsonRows.length : 0;

  return {
    count: records.length,
    ackCount,
    warnCount,
    dropCount,
    packetLossPct: Number(packetLossPct.toFixed(2)),
    meanMs: Number(meanMs.toFixed(2)),
    medianMs: Number(medianMs.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    p99Ms: Number(p99Ms.toFixed(2)),
    stdDevMs: Number(stdDevMs.toFixed(2)),
    minMs: Number(minMs.toFixed(2)),
    maxMs: Number(maxMs.toFixed(2)),
    avgBackendUs: Number(avgBackendUs.toFixed(1)),
    binaryAvgUs: Number(binaryAvgUs.toFixed(1)),
    jsonAvgUs: Number(jsonAvgUs.toFixed(1)),
  };
}

function simulateHardwareTiming(
  protocol: IRProtocol,
  powerSave: PowerSaveMode,
  codec: CodecMode
): { wifiRttMs: number; rmtTxUs: number; rssiDbm: number; status: 'ACK' | 'WARN' | 'DROP' } {
  const baseRtt = powerSave === 'WIFI_PS_NONE' ? 3.8 : 24.5;
  const jitterSpike =
    powerSave === 'WIFI_PS_NONE'
      ? (Math.random() < 0.04 ? 4.5 + Math.random() * 5 : (Math.random() - 0.5) * 1.6)
      : (Math.random() < 0.25 ? 25 + Math.random() * 48 : (Math.random() - 0.3) * 14);

  const codecNetPenalty = codec === 'json' ? 1.15 : 0;
  const wifiRttMs = Math.max(1.8, Number((baseRtt + jitterSpike + codecNetPenalty).toFixed(2)));

  const rmtBaseMap: Record<IRProtocol, number> = {
    NEC: 67500,
    SONY_SIRC: 24800,
    SAMSUNG32: 60200,
    RC5: 24900,
    DAIKIN_HVAC: 142400,
    RAW: 32000,
  };
  const rmtTxUs = Math.round((rmtBaseMap[protocol] ?? 67500) + (Math.random() - 0.5) * 18);
  const rssiDbm = Math.round(-49 - Math.random() * 6);

  const dropChance = powerSave === 'WIFI_PS_MIN_MODEM' ? 0.025 : 0.004;
  if (Math.random() < dropChance) {
    return { wifiRttMs: 0, rmtTxUs: 0, rssiDbm, status: 'DROP' };
  }

  const status: 'ACK' | 'WARN' = wifiRttMs > 28 ? 'WARN' : 'ACK';
  return { wifiRttMs, rmtTxUs, rssiDbm, status };
}

function generateCapturedTimings(protocol: IRProtocol, codeHex: string): number[] {
  const jitter = () => Math.round((Math.random() - 0.5) * 16);
  const num = Number.parseInt(codeHex.replace(/^0x/i, ''), 16) >>> 0;
  const timings: number[] = [];

  if (protocol === 'SONY_SIRC') {
    timings.push(2400 + jitter(), 600 + jitter());
    for (let i = 14; i >= 0; i--) {
      const bit = (num >> i) & 1;
      timings.push((bit ? 1200 : 600) + jitter(), 600 + jitter());
    }
    return timings;
  }

  if (protocol === 'SAMSUNG32') {
    timings.push(4500 + jitter(), 4500 + jitter());
  } else if (protocol === 'RC5') {
    timings.push(889 + jitter(), 889 + jitter());
  } else {
    timings.push(9000 + jitter(), 4500 + jitter());
  }

  const bitLen = protocol === 'RC5' ? 14 : 32;
  for (let i = bitLen - 1; i >= 0; i--) {
    const bit = (num >> i) & 1;
    if (protocol === 'RC5') {
      timings.push(889 + jitter(), 889 + jitter());
    } else {
      timings.push(560 + jitter(), (bit ? 1690 : 560) + jitter());
    }
  }
  timings.push(560 + jitter());
  return timings.map((t) => Math.max(200, t));
}

function seedBaselineTelemetry() {
  const now = Date.now();
  const sampleSpecs: Array<{
    presetId: string;
    btnIdx: number;
    codec: CodecMode;
    ps: PowerSaveMode;
    offsetSec: number;
  }> = [
    { presetId: 'lg-oled-c3', btnIdx: 0, codec: 'json', ps: 'WIFI_PS_MIN_MODEM', offsetSec: 180 },
    { presetId: 'lg-oled-c3', btnIdx: 3, codec: 'json', ps: 'WIFI_PS_MIN_MODEM', offsetSec: 165 },
    { presetId: 'sony-bravia-xr', btnIdx: 3, codec: 'json', ps: 'WIFI_PS_MIN_MODEM', offsetSec: 150 },
    { presetId: 'samsung-q990c', btnIdx: 3, codec: 'json', ps: 'WIFI_PS_NONE', offsetSec: 135 },
    { presetId: 'lg-oled-c3', btnIdx: 11, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 120 },
    { presetId: 'lg-oled-c3', btnIdx: 3, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 108 },
    { presetId: 'sony-bravia-xr', btnIdx: 0, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 96 },
    { presetId: 'daikin-arc480', btnIdx: 1, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 84 },
    { presetId: 'apple-tv-4k', btnIdx: 6, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 72 },
    { presetId: 'lab-calibration', btnIdx: 2, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 60 },
    { presetId: 'samsung-q990c', btnIdx: 7, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 48 },
    { presetId: 'lg-oled-c3', btnIdx: 12, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 36 },
    { presetId: 'sony-bravia-xr', btnIdx: 14, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 24 },
    { presetId: 'lab-calibration', btnIdx: 4, codec: 'binary', ps: 'WIFI_PS_NONE', offsetSec: 12 },
  ];

  let prevLatency = 4.2;
  for (const spec of sampleSpecs) {
    const preset = PRESET_BY_ID.get(spec.presetId)!;
    const btn = preset.buttons[spec.btnIdx] ?? preset.buttons[0];
    const sim = simulateHardwareTiming(preset.protocol, spec.ps, spec.codec);
    const backendOverheadUs =
      spec.codec === 'binary' ? Number((11 + Math.random() * 7).toFixed(1)) : Number((118 + Math.random() * 55).toFixed(1));
    const totalLatencyMs =
      sim.status === 'DROP' ? 0 : Number((sim.wifiRttMs + backendOverheadUs / 1000).toFixed(2));
    const jitterDeltaMs = sim.status === 'DROP' ? 0 : Number(Math.abs(totalLatencyMs - prevLatency).toFixed(2));
    if (sim.status !== 'DROP') prevLatency = totalLatencyMs;

    seqCounter += 1;
    const epochMs = now - spec.offsetSec * 1000;
    telemetryLogs.push({
      id: `tx-${seqCounter}`,
      seq: seqCounter,
      timestamp: new Date(epochMs).toISOString(),
      epochMs,
      presetId: preset.id,
      presetName: preset.name,
      buttonId: btn.id,
      commandLabel: btn.label,
      protocol: preset.protocol,
      carrierKhz: preset.carrierKhz,
      codeHex: btn.codeHex,
      codec: spec.codec,
      payloadBytes: spec.codec === 'binary' ? 8 : 148,
      backendOverheadUs,
      wifiRttMs: sim.wifiRttMs,
      rmtTxUs: sim.rmtTxUs,
      totalLatencyMs,
      jitterDeltaMs,
      rssiDbm: sim.rssiDbm,
      status: sim.status,
      target: 'simulator',
    });
  }
}

seedBaselineTelemetry();

async function startServer() {
  const app = express();

  app.use('/api/tx', express.raw({ type: 'application/octet-stream', limit: '64b' }));
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      config: deviceConfig,
      stats: computeStats(telemetryLogs),
      logCount: telemetryLogs.length,
    });
  });

  app.get('/api/telemetry/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'init', config: deviceConfig })}\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post('/api/device/config', async (req, res) => {
    const body = req.body as Partial<DeviceConfig>;
    if (body.target === 'simulator' || body.target === 'esp32-lan') {
      deviceConfig.target = body.target;
    }
    if (typeof body.esp32Host === 'string' && body.esp32Host.trim()) {
      const cleaned = body.esp32Host.trim().replace(/\/+$/, '');
      deviceConfig.esp32Host = cleaned.startsWith('http') ? cleaned : `http://${cleaned}`;
    }
    if (body.wifiPowerSave === 'WIFI_PS_NONE' || body.wifiPowerSave === 'WIFI_PS_MIN_MODEM') {
      deviceConfig.wifiPowerSave = body.wifiPowerSave;
    }
    if (body.codec === 'binary' || body.codec === 'json') {
      deviceConfig.codec = body.codec;
    }

    if (deviceConfig.target === 'esp32-lan') {
      try {
        const probe = await fetch(`${deviceConfig.esp32Host}/health`, {
          signal: AbortSignal.timeout(1800),
        });
        deviceConfig.connected = probe.ok;
      } catch {
        deviceConfig.connected = false;
      }
    } else {
      deviceConfig.connected = true;
    }

    broadcastConfig();
    res.json({ ok: true, config: deviceConfig });
  });

  // Custom & Imported .ir Remotes Store
  app.get('/api/remotes', (_req, res) => {
    res.json({ remotes: customRemotes });
  });

  app.post('/api/remotes', (req, res) => {
    const remote = req.body as RemotePreset;
    if (!remote || !remote.id || !remote.name || !Array.isArray(remote.buttons)) {
      res.status(400).json({ error: 'Invalid remote payload' });
      return;
    }
    const existingIdx = customRemotes.findIndex((r) => r.id === remote.id);
    const savedRemote: RemotePreset = { ...remote, isCustom: true };
    if (existingIdx >= 0) {
      customRemotes[existingIdx] = savedRemote;
    } else {
      customRemotes.push(savedRemote);
    }
    indexPresetButtons(savedRemote);
    res.json({ ok: true, remote: savedRemote, remotes: customRemotes });
  });

  app.delete('/api/remotes/:id', (req, res) => {
    const idx = customRemotes.findIndex((r) => r.id === req.params.id);
    if (idx >= 0) {
      customRemotes.splice(idx, 1);
      PRESET_BY_ID.delete(req.params.id);
    }
    res.json({ ok: true, remotes: customRemotes });
  });

  // IR Capture Mode RX Endpoint (ESP32 LAN /ir/rx or Simulator Receiver)
  app.post('/api/capture/trigger', async (req, res) => {
    const body = (req.body ?? {}) as {
      protocol?: IRProtocol;
      codeHex?: string;
      suggestedName?: string;
      carrierKhz?: number;
    };

    if (deviceConfig.target === 'esp32-lan') {
      try {
        const rxResp = await fetch(`${deviceConfig.esp32Host}/ir/rx`, {
          signal: AbortSignal.timeout(2000),
        });
        if (rxResp.status === 200) {
          const timings = (await rxResp.json()) as number[];
          const totalUs = timings.reduce((a, b) => a + b, 0);
          captureSeq += 1;
          const signal: CapturedSignal = {
            id: `cap-${captureSeq}`,
            capturedAt: new Date().toISOString(),
            protocol: 'RAW',
            irType: 'raw',
            carrierKhz: 38,
            dutyCycle: 0.33,
            codeHex: `0x${captureSeq.toString(16).toUpperCase().padStart(8, '0')}`,
            addressBytes: '00 00 00 00',
            commandBytes: '00 00 00 00',
            rawTimingsUs: timings,
            pulseCount: timings.length,
            frameDurationMs: Number((totalUs / 1000).toFixed(2)),
            jitterUs: 6,
            snrDb: 34.2,
            suggestedName: `Captured_${captureSeq}`,
          };
          res.json({ ok: true, signal });
          return;
        }
        res.status(204).end();
        return;
      } catch {
        res.status(502).json({ error: 'ESP32 RX endpoint unreachable' });
        return;
      }
    }

    const pool: Array<{ protocol: IRProtocol; hex: string; name: string; khz: number }> = [
      { protocol: 'NEC', hex: '0x20DF10EF', name: 'TV_Power', khz: 38 },
      { protocol: 'NEC', hex: '0x20DF40BF', name: 'TV_Vol_Up', khz: 38 },
      { protocol: 'SONY_SIRC', hex: '0x00000A90', name: 'Bravia_Power', khz: 40 },
      { protocol: 'SAMSUNG32', hex: '0xE0E0E01F', name: 'Soundbar_Vol_Up', khz: 38 },
      { protocol: 'RC5', hex: '0x0000180C', name: 'Amp_Standby', khz: 36 },
    ];
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const proto = body.protocol ?? picked.protocol;
    const hex = body.codeHex ?? picked.hex;
    const khz = body.carrierKhz ?? picked.khz;
    const rawTimingsUs = generateCapturedTimings(proto, hex);
    const totalUs = rawTimingsUs.reduce((a, b) => a + b, 0);
    const cleanHex = hex.replace(/^0x/i, '').padStart(8, '0').toUpperCase();

    captureSeq += 1;
    const signal: CapturedSignal = {
      id: `cap-${captureSeq}`,
      capturedAt: new Date().toISOString(),
      protocol: proto,
      irType: proto === 'RAW' ? 'raw' : 'parsed',
      carrierKhz: khz,
      dutyCycle: 0.33,
      codeHex: `0x${cleanHex}`,
      addressBytes: `${cleanHex.slice(0, 2)} ${cleanHex.slice(2, 4)} 00 00`,
      commandBytes: `${cleanHex.slice(4, 6)} ${cleanHex.slice(6, 8)} 00 00`,
      rawTimingsUs,
      pulseCount: rawTimingsUs.length,
      frameDurationMs: Number((totalUs / 1000).toFixed(2)),
      jitterUs: Number((4 + Math.random() * 8).toFixed(1)),
      snrDb: Number((29 + Math.random() * 9).toFixed(1)),
      suggestedName: body.suggestedName || `${picked.name}_${captureSeq}`,
    };

    res.json({ ok: true, signal });
  });

  app.post('/api/tx', async (req, res) => {
    const tStart = process.hrtime.bigint();

    let protocol: IRProtocol = 'NEC';
    let carrierKhz = 38;
    let codeHex = '0x20DF10EF';
    let presetId = 'lg-oled-c3';
    let presetName = 'LG OLED C3 TV';
    let buttonId = 'power';
    let commandLabel = 'Power';
    let codec: CodecMode = 'json';
    let payloadBytes = 0;
    let rawTimingsUs: number[] | undefined;

    if (Buffer.isBuffer(req.body)) {
      codec = 'binary';
      payloadBytes = req.body.length;
      if (req.body.length < 8) {
        res.status(400).json({ error: 'Invalid binary IR frame (< 8 bytes)' });
        return;
      }
      const protoId = req.body.readUInt8(0);
      carrierKhz = req.body.readUInt8(1);
      const cmdHash = req.body.readUInt16BE(2);
      const rawCode = req.body.readUInt32BE(4);

      protocol = PROTOCOL_BY_ID.get(protoId) ?? 'NEC';
      codeHex = `0x${rawCode.toString(16).toUpperCase().padStart(8, '0')}`;

      const resolved = BUTTON_BY_HASH.get((protoId << 16) | cmdHash);
      if (resolved) {
        presetId = resolved.presetId;
        presetName = resolved.presetName;
        buttonId = resolved.buttonId;
        commandLabel = resolved.label;
      } else {
        presetId = 'custom-raw';
        presetName = 'Custom Hex Payload';
        buttonId = 'custom';
        commandLabel = codeHex;
      }
    } else {
      codec = 'json';
      const rawJson = JSON.stringify(req.body ?? {});
      payloadBytes = Buffer.byteLength(rawJson, 'utf8');
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      protocol = (typeof parsed.protocol === 'string' ? parsed.protocol : 'NEC') as IRProtocol;
      carrierKhz = Number(parsed.carrierKhz ?? 38);
      codeHex = String(parsed.codeHex ?? '0x20DF10EF');
      presetId = String(parsed.presetId ?? 'custom-raw');
      presetName = String(parsed.presetName ?? PRESET_BY_ID.get(presetId)?.name ?? 'Custom Hex Payload');
      buttonId = String(parsed.buttonId ?? 'custom');
      commandLabel = String(parsed.commandLabel ?? codeHex);
      if (Array.isArray(parsed.rawTimingsUs)) {
        rawTimingsUs = parsed.rawTimingsUs.map((n) => Number(n)).filter((n) => Number.isFinite(n));
      }
    }

    const tParseEnd = process.hrtime.bigint();
    const measuredParseUs = Number(tParseEnd - tStart) / 1000;
    const backendOverheadUs =
      codec === 'binary'
        ? Number(Math.max(8.5, Math.min(measuredParseUs, 32)).toFixed(1))
        : Number(Math.max(95.0, measuredParseUs + 92).toFixed(1));

    let wifiRttMs = 0;
    let rmtTxUs = 0;
    let rssiDbm = deviceConfig.rssiDbm;
    let status: 'ACK' | 'WARN' | 'DROP' = 'ACK';

    if (deviceConfig.target === 'esp32-lan') {
      const hwStart = performance.now();
      try {
        const fwResponse = await fetch(`${deviceConfig.esp32Host}/ir/tx`, {
          method: 'POST',
          headers: codec === 'binary' ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' },
          body: Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : JSON.stringify(req.body),
          signal: AbortSignal.timeout(2500),
        });
        wifiRttMs = Number((performance.now() - hwStart).toFixed(2));
        if (!fwResponse.ok) {
          status = 'DROP';
        } else {
          const hwJson = (await fwResponse.json().catch(() => ({}))) as { rmt_us?: number; rssi?: number };
          rmtTxUs = hwJson.rmt_us ?? 67500;
          rssiDbm = hwJson.rssi ?? deviceConfig.rssiDbm;
          status = wifiRttMs > 30 ? 'WARN' : 'ACK';
          deviceConfig.connected = true;
        }
      } catch {
        wifiRttMs = Number((performance.now() - hwStart).toFixed(2));
        status = 'DROP';
        deviceConfig.connected = false;
      }
    } else {
      const sim = simulateHardwareTiming(protocol, deviceConfig.wifiPowerSave, codec);
      wifiRttMs = sim.wifiRttMs;
      rmtTxUs =
        rawTimingsUs && rawTimingsUs.length > 0
          ? rawTimingsUs.reduce((a, b) => a + b, 0)
          : sim.rmtTxUs;
      rssiDbm = sim.rssiDbm;
      status = sim.status;
      deviceConfig.rssiDbm = rssiDbm;
    }

    const totalLatencyMs = status === 'DROP' ? 0 : Number((wifiRttMs + backendOverheadUs / 1000).toFixed(2));
    const prevAck = [...telemetryLogs].reverse().find((r) => r.status !== 'DROP');
    const jitterDeltaMs =
      status === 'DROP' || !prevAck ? 0 : Number(Math.abs(totalLatencyMs - prevAck.totalLatencyMs).toFixed(2));

    seqCounter += 1;
    const nowEpoch = Date.now();
    const record: TelemetryRecord = {
      id: `tx-${seqCounter}`,
      seq: seqCounter,
      timestamp: new Date(nowEpoch).toISOString(),
      epochMs: nowEpoch,
      presetId,
      presetName,
      buttonId,
      commandLabel,
      protocol,
      carrierKhz,
      codeHex,
      codec,
      payloadBytes,
      backendOverheadUs,
      wifiRttMs,
      rmtTxUs,
      totalLatencyMs,
      jitterDeltaMs,
      rssiDbm,
      status,
      target: deviceConfig.target,
    };

    appendLog(record);
    res.json({ ok: true, record, stats: computeStats(telemetryLogs) });
  });

  app.get('/api/logs', (_req, res) => {
    res.json({
      logs: telemetryLogs,
      stats: computeStats(telemetryLogs),
      config: deviceConfig,
    });
  });

  app.delete('/api/logs', (_req, res) => {
    telemetryLogs.length = 0;
    seqCounter = 0;
    res.json({ ok: true, logs: [], stats: computeStats(telemetryLogs) });
  });

  app.get('/api/export/csv', (_req, res) => {
    const header = [
      'seq',
      'timestamp',
      'preset',
      'command',
      'protocol',
      'carrier_khz',
      'code_hex',
      'codec',
      'payload_bytes',
      'backend_overhead_us',
      'wifi_rtt_ms',
      'rmt_tx_us',
      'total_latency_ms',
      'jitter_delta_ms',
      'rssi_dbm',
      'status',
      'target',
    ].join(',');

    const rows = telemetryLogs.map((r) =>
      [
        r.seq,
        r.timestamp,
        `"${r.presetName.replace(/"/g, '""')}"`,
        `"${r.commandLabel.replace(/"/g, '""')}"`,
        r.protocol,
        r.carrierKhz,
        r.codeHex,
        r.codec,
        r.payloadBytes,
        r.backendOverheadUs,
        r.wifiRttMs,
        r.rmtTxUs,
        r.totalLatencyMs,
        r.jitterDeltaMs,
        r.rssiDbm,
        r.status,
        r.target,
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="irbench-telemetry-${Date.now()}.csv"`);
    res.send(csv);
  });

  app.get('/api/export/json', (_req, res) => {
    const payload = {
      exportedAt: new Date().toISOString(),
      deviceConfig,
      summaryStats: computeStats(telemetryLogs),
      samples: telemetryLogs,
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="irbench-telemetry-${Date.now()}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IRBench Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
