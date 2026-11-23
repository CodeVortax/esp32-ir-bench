export type IRProtocol = 'NEC' | 'SONY_SIRC' | 'SAMSUNG32' | 'RC5' | 'DAIKIN_HVAC' | 'RAW';

export type ButtonShape = 'circle' | 'square' | 'pill' | 'bar';

export type CodecMode = 'binary' | 'json';

export type ConnectionTarget = 'simulator' | 'esp32-lan';

export type PowerSaveMode = 'WIFI_PS_NONE' | 'WIFI_PS_MIN_MODEM';

export interface RemoteButton {
  id: string;
  label: string;
  emoji?: string;
  shortLabel?: string;
  codeHex: string;
  commandHash: number;
  category: 'power' | 'volume' | 'channel' | 'nav' | 'media' | 'mode' | 'lab';
  description?: string;
  shape?: ButtonShape;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  row?: number;
  col?: number;
  captured?: boolean;
  irType?: 'parsed' | 'raw';
  addressBytes?: string;
  commandBytes?: string;
  frequencyHz?: number;
  dutyCycle?: number;
  rawTimingsUs?: number[];
}

export interface RemotePreset {
  id: string;
  name: string;
  emoji?: string;
  mode?: 'shapes' | 'photo';
  photo?: string | null;
  manufacturer: string;
  deviceType: string;
  protocol: IRProtocol;
  protocolId: number;
  carrierKhz: number;
  bitLength: number;
  frameDurationMs: number;
  agcMarkUs: number;
  agcSpaceUs: number;
  bitOneMarkUs: number;
  bitOneSpaceUs: number;
  bitZeroMarkUs: number;
  bitZeroSpaceUs: number;
  isCustom?: boolean;
  buttons: RemoteButton[];
}

export interface CapturedSignal {
  id: string;
  capturedAt: string;
  protocol: IRProtocol;
  irType: 'parsed' | 'raw';
  carrierKhz: number;
  dutyCycle: number;
  codeHex: string;
  addressBytes: string;
  commandBytes: string;
  rawTimingsUs: number[];
  pulseCount: number;
  frameDurationMs: number;
  jitterUs: number;
  snrDb: number;
  suggestedName: string;
}

export interface MacroStep {
  presetId: string;
  buttonId: string;
  delayAfterMs: number;
}

export interface IRMacro {
  id: string;
  name: string;
  summary: string;
  steps: MacroStep[];
}

export interface TelemetryRecord {
  id: string;
  seq: number;
  timestamp: string;
  epochMs: number;
  presetId: string;
  presetName: string;
  buttonId: string;
  commandLabel: string;
  protocol: IRProtocol;
  carrierKhz: number;
  codeHex: string;
  codec: CodecMode;
  payloadBytes: number;
  backendOverheadUs: number;
  wifiRttMs: number;
  rmtTxUs: number;
  totalLatencyMs: number;
  jitterDeltaMs: number;
  rssiDbm: number;
  status: 'ACK' | 'WARN' | 'DROP';
  target: ConnectionTarget;
}

export interface TelemetryStats {
  count: number;
  ackCount: number;
  warnCount: number;
  dropCount: number;
  packetLossPct: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  avgBackendUs: number;
  binaryAvgUs: number;
  jsonAvgUs: number;
}

export interface DeviceConfig {
  target: ConnectionTarget;
  esp32Host: string;
  wifiPowerSave: PowerSaveMode;
  codec: CodecMode;
  rssiDbm: number;
  wifiChannel: number;
  firmwareVersion: string;
  connected: boolean;
}
