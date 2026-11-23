import { PROTOCOL_IDS } from '../data/presets';
import type { ButtonShape, IRProtocol, RemoteButton, RemotePreset } from '../types/telemetry';

export interface IrxDocument {
  filetype: 'IRX remote layout';
  version: 1;
  remote: {
    id: string;
    name: string;
    emoji: string;
    mode: 'shapes' | 'photo';
    manufacturer: string;
    deviceType: string;
    protocol: IRProtocol;
    carrierKhz: number;
    photo?: string | null;
  };
  buttons: Array<{
    id: string;
    label: string;
    emoji?: string;
    category: RemoteButton['category'];
    layout: {
      shape: ButtonShape;
      w: number;
      h: number;
      row?: number;
      col?: number;
      x?: number;
      y?: number;
      order: number;
    };
    signal: {
      captured: boolean;
      irType: 'parsed' | 'raw';
      codeHex: string;
      addressBytes?: string;
      commandBytes?: string;
      frequencyHz?: number;
      dutyCycle?: number;
      rawTimingsUs?: number[];
    };
  }>;
}

function normalizeProtocol(rawProto: string): IRProtocol {
  const upper = rawProto.trim().toUpperCase();
  if (upper.startsWith('NEC')) return 'NEC';
  if (upper.includes('SIRC') || upper.includes('SONY')) return 'SONY_SIRC';
  if (upper.includes('SAMSUNG')) return 'SAMSUNG32';
  if (upper.includes('RC5')) return 'RC5';
  if (upper.includes('DAIKIN')) return 'DAIKIN_HVAC';
  return 'RAW';
}

function toFlipperProtocolName(proto: IRProtocol): string {
  switch (proto) {
    case 'NEC':
      return 'NEC';
    case 'SONY_SIRC':
      return 'SIRC';
    case 'SAMSUNG32':
      return 'Samsung32';
    case 'RC5':
      return 'RC5';
    case 'DAIKIN_HVAC':
      return 'Daikin';
    default:
      return 'RAW';
  }
}

export function hexToFlipperBytes(codeHex: string): { addressBytes: string; commandBytes: string } {
  const clean = codeHex.replace(/^0x/i, '').padStart(8, '0').slice(-8).toUpperCase();
  const b0 = clean.slice(0, 2);
  const b1 = clean.slice(2, 4);
  const b2 = clean.slice(4, 6);
  const b3 = clean.slice(6, 8);
  return {
    addressBytes: `${b0} ${b1} 00 00`,
    commandBytes: `${b2} ${b3} 00 00`,
  };
}

function flipperBytesToHex(addressStr: string, commandStr: string): string {
  const addrParts = addressStr.trim().split(/\s+/).slice(0, 2);
  const cmdParts = commandStr.trim().split(/\s+/).slice(0, 2);
  const a0 = (addrParts[0] ?? '00').padStart(2, '0');
  const a1 = (addrParts[1] ?? '00').padStart(2, '0');
  const c0 = (cmdParts[0] ?? '00').padStart(2, '0');
  const c1 = (cmdParts[1] ?? '00').padStart(2, '0');
  return `0x${(a0 + a1 + c0 + c1).toUpperCase()}`;
}

export function hashString16(input: string): number {
  let hash = 0x811c;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x0101) & 0xffff;
  }
  return hash || 0x1001;
}

/**
 * Serializes a RemotePreset into an `.irx` document preserving full button structure, shapes, sizes, rows, and x/y coordinates.
 */
export function serializeToIrxFile(preset: RemotePreset): string {
  const doc: IrxDocument = {
    filetype: 'IRX remote layout',
    version: 1,
    remote: {
      id: preset.id,
      name: preset.name,
      emoji: preset.emoji || '📡',
      mode: preset.mode || 'shapes',
      manufacturer: preset.manufacturer,
      deviceType: preset.deviceType,
      protocol: preset.protocol,
      carrierKhz: preset.carrierKhz,
      ...(preset.photo ? { photo: preset.photo } : {}),
    },
    buttons: preset.buttons.map((b, idx) => {
      const { addressBytes, commandBytes } =
        b.addressBytes && b.commandBytes
          ? { addressBytes: b.addressBytes, commandBytes: b.commandBytes }
          : hexToFlipperBytes(b.codeHex);

      return {
        id: b.id,
        label: b.label,
        ...(b.emoji ? { emoji: b.emoji } : {}),
        category: b.category,
        layout: {
          shape: b.shape ?? 'pill',
          w: b.w ?? 64,
          h: b.h ?? 64,
          ...(b.row !== undefined ? { row: b.row } : {}),
          ...(b.col !== undefined ? { col: b.col } : {}),
          ...(b.x !== undefined ? { x: b.x } : {}),
          ...(b.y !== undefined ? { y: b.y } : {}),
          order: idx,
        },
        signal: {
          captured: b.captured !== false,
          irType: b.irType ?? 'parsed',
          codeHex: b.codeHex,
          addressBytes,
          commandBytes,
          ...(b.frequencyHz ? { frequencyHz: b.frequencyHz } : {}),
          ...(b.dutyCycle ? { dutyCycle: b.dutyCycle } : {}),
          ...(b.rawTimingsUs ? { rawTimingsUs: b.rawTimingsUs } : {}),
        },
      };
    }),
  };
  return JSON.stringify(doc, null, 2);
}

export function parseIrxFile(content: string): RemotePreset {
  const parsed = JSON.parse(content) as IrxDocument;
  if (!parsed || parsed.filetype !== 'IRX remote layout' || !Array.isArray(parsed.buttons)) {
    throw new Error('Invalid .irx structure');
  }

  const proto = parsed.remote.protocol || 'NEC';
  const buttons: RemoteButton[] = [...parsed.buttons]
    .sort((a, b) => (a.layout?.order ?? 0) - (b.layout?.order ?? 0))
    .map((entry, idx) => ({
      id: entry.id || `irx-${idx}`,
      label: entry.label || `Key ${idx + 1}`,
      emoji: entry.emoji,
      category: entry.category || 'mode',
      shape: entry.layout?.shape ?? 'pill',
      w: entry.layout?.w ?? 64,
      h: entry.layout?.h ?? 64,
      row: entry.layout?.row,
      col: entry.layout?.col,
      x: entry.layout?.x,
      y: entry.layout?.y,
      captured: entry.signal?.captured !== false,
      irType: entry.signal?.irType ?? 'parsed',
      codeHex: entry.signal?.codeHex || '0x20DF10EF',
      commandHash: hashString16(`${entry.label}-${entry.signal?.codeHex || idx}`),
      addressBytes: entry.signal?.addressBytes,
      commandBytes: entry.signal?.commandBytes,
      frequencyHz: entry.signal?.frequencyHz,
      dutyCycle: entry.signal?.dutyCycle,
      rawTimingsUs: entry.signal?.rawTimingsUs,
    }));

  return {
    id: `irx-${Date.now().toString(36)}`,
    name: parsed.remote.name || 'Imported .irx',
    emoji: parsed.remote.emoji || '📡',
    mode: parsed.remote.mode || 'shapes',
    photo: parsed.remote.photo ?? null,
    manufacturer: parsed.remote.manufacturer || '.irx Layout',
    deviceType: parsed.remote.deviceType || 'IR Remote',
    protocol: proto,
    protocolId: PROTOCOL_IDS[proto] ?? 1,
    carrierKhz: parsed.remote.carrierKhz || 38,
    bitLength: proto === 'SONY_SIRC' ? 15 : 32,
    frameDurationMs: proto === 'SONY_SIRC' ? 24.8 : 67.5,
    agcMarkUs: proto === 'SONY_SIRC' ? 2400 : 9000,
    agcSpaceUs: proto === 'SONY_SIRC' ? 600 : 4500,
    bitOneMarkUs: proto === 'SONY_SIRC' ? 1200 : 560,
    bitOneSpaceUs: proto === 'SONY_SIRC' ? 600 : 1690,
    bitZeroMarkUs: 560,
    bitZeroSpaceUs: proto === 'SONY_SIRC' ? 600 : 560,
    isCustom: true,
    buttons,
  };
}

export function parseIrFile(content: string, filename = 'Imported_Remote.ir'): RemotePreset {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return parseIrxFile(trimmed);
  }

  const lines = content.split(/\r?\n/);
  const blocks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      if (Object.keys(current).length > 0 && current.name) {
        blocks.push(current);
        current = {};
      }
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (key === 'filetype' || key === 'version') continue;
    current[key] = val;
  }
  if (Object.keys(current).length > 0 && current.name) {
    blocks.push(current);
  }

  const buttons: RemoteButton[] = blocks.map((blk, idx) => {
    const label = (blk.name || `Key_${idx + 1}`).replace(/_/g, ' ');
    const irType = blk.type === 'raw' ? 'raw' : 'parsed';
    const row = Math.floor(idx / 3);
    const col = idx % 3;

    if (irType === 'raw') {
      const rawTimingsUs = (blk.data || '')
        .split(/\s+/)
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const freqHz = Number.parseInt(blk.frequency || '38000', 10) || 38000;
      const dutyCycle = Number.parseFloat(blk.duty_cycle || '0.33') || 0.33;
      const hash = hashString16(`${label}-${rawTimingsUs.slice(0, 6).join(',')}`);
      const codeHex = `0x${((hash << 16) | (rawTimingsUs.length & 0xffff)).toString(16).toUpperCase().padStart(8, '0')}`;

      return {
        id: `ir-${idx}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label,
        codeHex,
        commandHash: hash,
        category: 'lab',
        shape: 'pill',
        w: 96,
        h: 46,
        row,
        col,
        captured: true,
        irType: 'raw',
        frequencyHz: freqHz,
        dutyCycle,
        rawTimingsUs,
        description: `Raw ${rawTimingsUs.length} pulses @ ${Math.round(freqHz / 1000)} kHz`,
      };
    }

    const addressBytes = blk.address || '00 00 00 00';
    const commandBytes = blk.command || '00 00 00 00';
    const codeHex = flipperBytesToHex(addressBytes, commandBytes);
    const hash = Number.parseInt(codeHex.slice(-4), 16) || hashString16(label);

    return {
      id: `ir-${idx}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      codeHex,
      commandHash: hash,
      category: label.toLowerCase().includes('power')
        ? 'power'
        : label.toLowerCase().includes('vol') || label.toLowerCase().includes('mute')
        ? 'volume'
        : 'mode',
      shape: label.toLowerCase().includes('power') ? 'circle' : 'pill',
      w: label.toLowerCase().includes('power') ? 64 : 96,
      h: label.toLowerCase().includes('power') ? 64 : 46,
      row,
      col,
      captured: true,
      irType: 'parsed',
      addressBytes,
      commandBytes,
      description: `${blk.protocol || 'NEC'} parsed`,
    };
  });

  const firstParsed = blocks.find((b) => b.type !== 'raw' && b.protocol);
  const detectedProtocol: IRProtocol = firstParsed ? normalizeProtocol(firstParsed.protocol) : 'RAW';
  const rawFreq = blocks.find((b) => b.frequency)?.frequency;
  const carrierKhz = rawFreq ? Math.round(Number(rawFreq) / 1000) : detectedProtocol === 'SONY_SIRC' ? 40 : 38;
  const cleanName = filename.replace(/\.(irx|ir)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported Remote';

  return {
    id: `custom-ir-${Date.now().toString(36)}`,
    name: cleanName,
    emoji: '📡',
    mode: 'shapes',
    manufacturer: '.ir File Import',
    deviceType: buttons.some((b) => b.irType === 'raw') ? 'Mixed / Raw .ir' : 'Parsed .ir',
    protocol: detectedProtocol,
    protocolId: PROTOCOL_IDS[detectedProtocol] ?? 6,
    carrierKhz,
    bitLength: detectedProtocol === 'SONY_SIRC' ? 15 : 32,
    frameDurationMs: detectedProtocol === 'SONY_SIRC' ? 24.8 : 67.5,
    agcMarkUs: detectedProtocol === 'SONY_SIRC' ? 2400 : 9000,
    agcSpaceUs: detectedProtocol === 'SONY_SIRC' ? 600 : 4500,
    bitOneMarkUs: detectedProtocol === 'SONY_SIRC' ? 1200 : 560,
    bitOneSpaceUs: detectedProtocol === 'SONY_SIRC' ? 600 : 1690,
    bitZeroMarkUs: 560,
    bitZeroSpaceUs: detectedProtocol === 'SONY_SIRC' ? 600 : 560,
    isCustom: true,
    buttons:
      buttons.length > 0
        ? buttons
        : [
            {
              id: 'default-ping',
              label: 'Power',
              codeHex: '0x20DF10EF',
              commandHash: 0x10ef,
              category: 'power',
              shape: 'circle',
              w: 64,
              h: 64,
              row: 0,
              col: 0,
              captured: true,
              irType: 'parsed',
              addressBytes: '20 DF 00 00',
              commandBytes: '10 EF 00 00',
            },
          ],
  };
}

export function serializeToIrFile(preset: RemotePreset): string {
  const lines: string[] = [
    'Filetype: IR signals file',
    'Version: 1',
    `# Exported from IR Bench — ${preset.name} (${preset.manufacturer})`,
  ];

  for (const btn of preset.buttons) {
    lines.push('#');
    lines.push(`name: ${btn.label.replace(/\s+/g, '_')}`);

    if (btn.irType === 'raw' && btn.rawTimingsUs && btn.rawTimingsUs.length > 0) {
      lines.push('type: raw');
      lines.push(`frequency: ${btn.frequencyHz ?? preset.carrierKhz * 1000}`);
      lines.push(`duty_cycle: ${(btn.dutyCycle ?? 0.33).toFixed(6)}`);
      lines.push(`data: ${btn.rawTimingsUs.join(' ')}`);
    } else {
      const { addressBytes, commandBytes } =
        btn.addressBytes && btn.commandBytes
          ? { addressBytes: btn.addressBytes, commandBytes: btn.commandBytes }
          : hexToFlipperBytes(btn.codeHex);
      lines.push('type: parsed');
      lines.push(`protocol: ${toFlipperProtocolName(preset.protocol)}`);
      lines.push(`address: ${addressBytes}`);
      lines.push(`command: ${commandBytes}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function downloadPresetAsIrxFile(preset: RemotePreset) {
  const irxContent = serializeToIrxFile(preset);
  const safeName = preset.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const blob = new Blob([irxContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName || 'remote'}.irx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadPresetAsIrFile(preset: RemotePreset) {
  const irContent = serializeToIrFile(preset);
  const safeName = preset.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const blob = new Blob([irContent], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName || 'remote'}.ir`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
