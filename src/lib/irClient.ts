import { PROTOCOL_IDS } from '../data/presets';
import type {
  CapturedSignal,
  CodecMode,
  IRProtocol,
  RemotePreset,
  TelemetryRecord,
  TelemetryStats,
} from '../types/telemetry';

export function buildBinaryIRFrame(
  protocol: IRProtocol,
  carrierKhz: number,
  commandHash: number,
  codeHex: string
): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const protoId = PROTOCOL_IDS[protocol] ?? 1;
  const numericCode = Number.parseInt(codeHex.replace(/^0x/i, ''), 16) >>> 0;

  view.setUint8(0, protoId & 0xff);
  view.setUint8(1, Math.max(30, Math.min(60, carrierKhz)) & 0xff);
  view.setUint16(2, commandHash & 0xffff, false);
  view.setUint32(4, numericCode, false);
  return buf;
}

export async function transmitIRCommand(params: {
  codec: CodecMode;
  presetId: string;
  presetName: string;
  buttonId: string;
  commandLabel: string;
  protocol: IRProtocol;
  carrierKhz: number;
  commandHash: number;
  codeHex: string;
  rawTimingsUs?: number[];
}): Promise<{ record: TelemetryRecord; stats: TelemetryStats }> {
  // Raw microsecond arrays are sent as JSON frames; parsed frames use 8-byte binary when selected
  if (params.codec === 'binary' && (!params.rawTimingsUs || params.rawTimingsUs.length === 0)) {
    const frame = buildBinaryIRFrame(
      params.protocol,
      params.carrierKhz,
      params.commandHash,
      params.codeHex
    );
    const res = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: frame,
    });
    if (!res.ok) throw new Error(`Binary TX failed (${res.status})`);
    return res.json();
  }

  const res = await fetch('/api/tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presetId: params.presetId,
      presetName: params.presetName,
      buttonId: params.buttonId,
      commandLabel: params.commandLabel,
      protocol: params.protocol,
      carrierKhz: params.carrierKhz,
      codeHex: params.codeHex,
      rawTimingsUs: params.rawTimingsUs,
    }),
  });
  if (!res.ok) throw new Error(`JSON TX failed (${res.status})`);
  return res.json();
}

export async function triggerIRCapture(params?: {
  protocol?: IRProtocol;
  codeHex?: string;
  suggestedName?: string;
  carrierKhz?: number;
}): Promise<CapturedSignal | null> {
  const res = await fetch('/api/capture/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Capture failed (${res.status})`);
  const data = await res.json();
  return data.signal ?? null;
}

export async function saveCustomRemote(remote: RemotePreset): Promise<RemotePreset[]> {
  const res = await fetch('/api/remotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(remote),
  });
  if (!res.ok) throw new Error('Failed to save remote');
  const data = await res.json();
  return data.remotes ?? [];
}

export async function deleteCustomRemote(id: string): Promise<RemotePreset[]> {
  const res = await fetch(`/api/remotes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete remote');
  const data = await res.json();
  return data.remotes ?? [];
}

export function downloadRecordsAsCSV(records: TelemetryRecord[]) {
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

  const rows = records.map((r) =>
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

  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `irbench-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadRecordsAsJSON(records: TelemetryRecord[], stats: TelemetryStats) {
  const payload = {
    exportedAt: new Date().toISOString(),
    sampleCount: records.length,
    summaryStats: stats,
    samples: records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `irbench-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
