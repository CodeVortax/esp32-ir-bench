import { ButtonShape, IRMacro, RemoteButton, RemotePreset } from '../types/telemetry';

export const PROTOCOL_IDS: Record<string, number> = {
  NEC: 1,
  SONY_SIRC: 2,
  SAMSUNG32: 3,
  RC5: 4,
  DAIKIN_HVAC: 5,
  RAW: 6,
};

export const QUICK_EMOJI = ['📺', '❄️', '🔊', '💡', '🌀', '📽️', '🎮', '📻', '🔌', '🛰️'];

export const SHAPE_DEFAULTS: Record<ButtonShape, { w: number; h: number }> = {
  circle: { w: 64, h: 64 },
  square: { w: 64, h: 64 },
  pill: { w: 104, h: 46 },
  bar: { w: 92, h: 40 },
};

export function shapeRadius(shape: ButtonShape | undefined, w = 64, h = 64): string {
  if (shape === 'circle') return '50%';
  if (shape === 'pill') return '999px';
  if (shape === 'bar') return '9px';
  return `${Math.max(10, Math.min(w, h) * 0.18)}px`;
}

export const BUILDER_TEMPLATES: Record<'tv' | 'ac' | 'audio', RemoteButton[]> = {
  tv: [
    { id: 't-pwr', label: 'Power', emoji: '⏻', codeHex: '0x20DF10EF', commandHash: 0x10ef, category: 'power', shape: 'circle', w: 60, h: 60, row: 0, col: 0, captured: false },
    { id: 't-src', label: 'Input', codeHex: '0x20DFD02F', commandHash: 0xd02f, category: 'mode', shape: 'pill', w: 92, h: 44, row: 0, col: 1, captured: false },
    { id: 't-mute', label: 'Mute', codeHex: '0x20DF906F', commandHash: 0x906f, category: 'volume', shape: 'circle', w: 60, h: 60, row: 0, col: 2, captured: false },
    { id: 't-volp', label: 'Vol +', codeHex: '0x20DF40BF', commandHash: 0x40bf, category: 'volume', shape: 'bar', w: 96, h: 42, row: 1, col: 0, captured: false },
    { id: 't-chp', label: 'Ch +', codeHex: '0x20DF00FF', commandHash: 0x00ff, category: 'channel', shape: 'bar', w: 96, h: 42, row: 1, col: 1, captured: false },
    { id: 't-volm', label: 'Vol -', codeHex: '0x20DFC03F', commandHash: 0xc03f, category: 'volume', shape: 'bar', w: 96, h: 42, row: 2, col: 0, captured: false },
    { id: 't-chm', label: 'Ch -', codeHex: '0x20DF807F', commandHash: 0x807f, category: 'channel', shape: 'bar', w: 96, h: 42, row: 2, col: 1, captured: false },
    { id: 't-up', label: 'Up', codeHex: '0x20DF02FD', commandHash: 0x02fd, category: 'nav', shape: 'square', w: 58, h: 52, row: 3, col: 1, captured: false },
    { id: 't-left', label: 'Left', codeHex: '0x20DFE01F', commandHash: 0xe01f, category: 'nav', shape: 'square', w: 58, h: 58, row: 4, col: 0, captured: false },
    { id: 't-ok', label: 'OK', codeHex: '0x20DF22DD', commandHash: 0x22dd, category: 'nav', shape: 'circle', w: 64, h: 64, row: 4, col: 1, captured: false },
    { id: 't-right', label: 'Right', codeHex: '0x20DF609F', commandHash: 0x609f, category: 'nav', shape: 'square', w: 58, h: 58, row: 4, col: 2, captured: false },
    { id: 't-down', label: 'Down', codeHex: '0x20DF827D', commandHash: 0x827d, category: 'nav', shape: 'square', w: 58, h: 52, row: 5, col: 1, captured: false },
  ],
  ac: [
    { id: 'a-pwr', label: 'Power', emoji: '⏻', codeHex: '0x11DA2700', commandHash: 0x2700, category: 'power', shape: 'circle', w: 64, h: 64, row: 0, col: 0, captured: false },
    { id: 'a-eco', label: 'Eco', codeHex: '0x11DA2704', commandHash: 0x2704, category: 'mode', shape: 'pill', w: 92, h: 44, row: 0, col: 1, captured: false },
    { id: 'a-tp', label: 'Temp +', codeHex: '0x11DA272C', commandHash: 0x272c, category: 'volume', shape: 'bar', w: 96, h: 44, row: 1, col: 0, captured: false },
    { id: 'a-tm', label: 'Temp -', codeHex: '0x11DA2728', commandHash: 0x2728, category: 'volume', shape: 'bar', w: 96, h: 44, row: 1, col: 1, captured: false },
    { id: 'a-cool', label: 'Cool', codeHex: '0x11DA2731', commandHash: 0x2731, category: 'mode', shape: 'square', w: 66, h: 58, row: 2, col: 0, captured: false },
    { id: 'a-heat', label: 'Heat', codeHex: '0x11DA2741', commandHash: 0x2741, category: 'mode', shape: 'square', w: 66, h: 58, row: 2, col: 1, captured: false },
    { id: 'a-fan', label: 'Fan', codeHex: '0x11DA27A0', commandHash: 0x27a0, category: 'channel', shape: 'square', w: 66, h: 58, row: 2, col: 2, captured: false },
  ],
  audio: [
    { id: 's-pwr', label: 'Power', emoji: '⏻', codeHex: '0xE0E040BF', commandHash: 0x40bf, category: 'power', shape: 'circle', w: 60, h: 60, row: 0, col: 0, captured: false },
    { id: 's-src', label: 'Source', codeHex: '0xE0E0807F', commandHash: 0x807f, category: 'mode', shape: 'pill', w: 94, h: 44, row: 0, col: 1, captured: false },
    { id: 's-mute', label: 'Mute', codeHex: '0xE0E0F00F', commandHash: 0xf00f, category: 'volume', shape: 'circle', w: 60, h: 60, row: 0, col: 2, captured: false },
    { id: 's-vp', label: 'Vol +', codeHex: '0xE0E0E01F', commandHash: 0xe01f, category: 'volume', shape: 'bar', w: 108, h: 44, row: 1, col: 0, captured: false },
    { id: 's-vm', label: 'Vol -', codeHex: '0xE0E0D02F', commandHash: 0xd02f, category: 'volume', shape: 'bar', w: 108, h: 44, row: 1, col: 1, captured: false },
    { id: 's-eq', label: 'Sound', codeHex: '0xE0E01AE5', commandHash: 0x1ae5, category: 'mode', shape: 'pill', w: 108, h: 44, row: 2, col: 0, captured: false },
    { id: 's-bt', label: 'BT Pair', codeHex: '0xE0E0C43B', commandHash: 0xc43b, category: 'mode', shape: 'pill', w: 108, h: 44, row: 2, col: 1, captured: false },
  ],
};

export const REMOTE_PRESETS: RemotePreset[] = [
  {
    id: 'lg-oled-c3',
    name: 'LG OLED C3',
    emoji: '📺',
    mode: 'shapes',
    manufacturer: 'LG Electronics',
    deviceType: 'Display',
    protocol: 'NEC',
    protocolId: 1,
    carrierKhz: 38,
    bitLength: 32,
    frameDurationMs: 67.5,
    agcMarkUs: 9000,
    agcSpaceUs: 4500,
    bitOneMarkUs: 560,
    bitOneSpaceUs: 1690,
    bitZeroMarkUs: 560,
    bitZeroSpaceUs: 560,
    buttons: [
      { id: 'power', label: 'Power', emoji: '⏻', codeHex: '0x20DF10EF', commandHash: 0x10ef, category: 'power', shape: 'circle', w: 60, h: 60, row: 0, col: 0, captured: true },
      { id: 'input', label: 'HDMI', codeHex: '0x20DFD02F', commandHash: 0xd02f, category: 'mode', shape: 'pill', w: 96, h: 44, row: 0, col: 1, captured: true },
      { id: 'mute', label: 'Mute', codeHex: '0x20DF906F', commandHash: 0x906f, category: 'volume', shape: 'circle', w: 60, h: 60, row: 0, col: 2, captured: true },

      { id: 'vol-up', label: 'Vol +', codeHex: '0x20DF40BF', commandHash: 0x40bf, category: 'volume', shape: 'bar', w: 102, h: 42, row: 1, col: 0, captured: true },
      { id: 'ch-up', label: 'Ch +', codeHex: '0x20DF00FF', commandHash: 0x00ff, category: 'channel', shape: 'bar', w: 102, h: 42, row: 1, col: 1, captured: true },

      { id: 'vol-dn', label: 'Vol -', codeHex: '0x20DFC03F', commandHash: 0xc03f, category: 'volume', shape: 'bar', w: 102, h: 42, row: 2, col: 0, captured: true },
      { id: 'ch-dn', label: 'Ch -', codeHex: '0x20DF807F', commandHash: 0x807f, category: 'channel', shape: 'bar', w: 102, h: 42, row: 2, col: 1, captured: true },

      { id: 'up', label: 'Up', codeHex: '0x20DF02FD', commandHash: 0x02fd, category: 'nav', shape: 'square', w: 60, h: 52, row: 3, col: 1, captured: true },

      { id: 'left', label: 'Left', codeHex: '0x20DFE01F', commandHash: 0xe01f, category: 'nav', shape: 'square', w: 60, h: 60, row: 4, col: 0, captured: true },
      { id: 'ok', label: 'OK', codeHex: '0x20DF22DD', commandHash: 0x22dd, category: 'nav', shape: 'circle', w: 64, h: 64, row: 4, col: 1, captured: true },
      { id: 'right', label: 'Right', codeHex: '0x20DF609F', commandHash: 0x609f, category: 'nav', shape: 'square', w: 60, h: 60, row: 4, col: 2, captured: true },

      { id: 'down', label: 'Down', codeHex: '0x20DF827D', commandHash: 0x827d, category: 'nav', shape: 'square', w: 60, h: 52, row: 5, col: 1, captured: true },

      { id: 'home', label: 'Home', codeHex: '0x20DF3EC1', commandHash: 0x3ec1, category: 'mode', shape: 'pill', w: 102, h: 44, row: 6, col: 0, captured: true },
      { id: 'back', label: 'Back', codeHex: '0x20DF14EB', commandHash: 0x14eb, category: 'nav', shape: 'pill', w: 102, h: 44, row: 6, col: 1, captured: true },
    ],
  },
  {
    id: 'sony-bravia-xr',
    name: 'Sony Bravia',
    emoji: '📽️',
    mode: 'shapes',
    manufacturer: 'Sony',
    deviceType: 'Display',
    protocol: 'SONY_SIRC',
    protocolId: 2,
    carrierKhz: 40,
    bitLength: 15,
    frameDurationMs: 24.8,
    agcMarkUs: 2400,
    agcSpaceUs: 600,
    bitOneMarkUs: 1200,
    bitOneSpaceUs: 600,
    bitZeroMarkUs: 600,
    bitZeroSpaceUs: 600,
    buttons: [
      { id: 'power', label: 'Power', emoji: '⏻', codeHex: '0x00000A90', commandHash: 0x0a90, category: 'power', shape: 'circle', w: 60, h: 60, row: 0, col: 0, captured: true },
      { id: 'input', label: 'Source', codeHex: '0x00000A50', commandHash: 0x0a50, category: 'mode', shape: 'pill', w: 96, h: 44, row: 0, col: 1, captured: true },
      { id: 'mute', label: 'Mute', codeHex: '0x00000290', commandHash: 0x0290, category: 'volume', shape: 'circle', w: 60, h: 60, row: 0, col: 2, captured: true },

      { id: 'vol-up', label: 'Vol +', codeHex: '0x00000490', commandHash: 0x0490, category: 'volume', shape: 'bar', w: 102, h: 42, row: 1, col: 0, captured: true },
      { id: 'vol-dn', label: 'Vol -', codeHex: '0x00000C90', commandHash: 0x0c90, category: 'volume', shape: 'bar', w: 102, h: 42, row: 1, col: 1, captured: true },

      { id: 'home', label: 'Home', codeHex: '0x00000070', commandHash: 0x0070, category: 'mode', shape: 'pill', w: 96, h: 44, row: 2, col: 0, captured: true },
      { id: 'ok', label: 'Select', codeHex: '0x00000A70', commandHash: 0x0a70, category: 'nav', shape: 'circle', w: 64, h: 64, row: 2, col: 1, captured: true },
      { id: 'play', label: 'Play', codeHex: '0x00002CE9', commandHash: 0x2ce9, category: 'media', shape: 'pill', w: 96, h: 44, row: 2, col: 2, captured: true },
    ],
  },
  {
    id: 'samsung-q990c',
    name: 'Samsung Q990C',
    emoji: '🔊',
    mode: 'shapes',
    manufacturer: 'Samsung',
    deviceType: 'Audio',
    protocol: 'SAMSUNG32',
    protocolId: 3,
    carrierKhz: 38,
    bitLength: 32,
    frameDurationMs: 60.2,
    agcMarkUs: 4500,
    agcSpaceUs: 4500,
    bitOneMarkUs: 560,
    bitOneSpaceUs: 1690,
    bitZeroMarkUs: 560,
    bitZeroSpaceUs: 560,
    buttons: [
      { id: 'power', label: 'Power', emoji: '⏻', codeHex: '0xE0E040BF', commandHash: 0x40bf, category: 'power', shape: 'circle', w: 60, h: 60, row: 0, col: 0, captured: true },
      { id: 'source', label: 'eARC', codeHex: '0xE0E0807F', commandHash: 0x807f, category: 'mode', shape: 'pill', w: 96, h: 44, row: 0, col: 1, captured: true },
      { id: 'mute', label: 'Mute', codeHex: '0xE0E0F00F', commandHash: 0xf00f, category: 'volume', shape: 'circle', w: 60, h: 60, row: 0, col: 2, captured: true },

      { id: 'vol-up', label: 'Vol +', codeHex: '0xE0E0E01F', commandHash: 0xe01f, category: 'volume', shape: 'bar', w: 106, h: 44, row: 1, col: 0, captured: true },
      { id: 'vol-dn', label: 'Vol -', codeHex: '0xE0E0D02F', commandHash: 0xd02f, category: 'volume', shape: 'bar', w: 106, h: 44, row: 1, col: 1, captured: true },

      { id: 'sound-mode', label: 'Adaptive', codeHex: '0xE0E01AE5', commandHash: 0x1ae5, category: 'mode', shape: 'pill', w: 106, h: 44, row: 2, col: 0, captured: true },
      { id: 'bt-pair', label: 'BT Pair', codeHex: '0xE0E0C43B', commandHash: 0xc43b, category: 'mode', shape: 'pill', w: 106, h: 44, row: 2, col: 1, captured: true },
    ],
  },
  {
    id: 'daikin-arc480',
    name: 'Daikin HVAC',
    emoji: '❄️',
    mode: 'shapes',
    manufacturer: 'Daikin',
    deviceType: 'Climate',
    protocol: 'DAIKIN_HVAC',
    protocolId: 5,
    carrierKhz: 38,
    bitLength: 128,
    frameDurationMs: 142.4,
    agcMarkUs: 3400,
    agcSpaceUs: 1750,
    bitOneMarkUs: 420,
    bitOneSpaceUs: 1300,
    bitZeroMarkUs: 420,
    bitZeroSpaceUs: 430,
    buttons: [
      { id: 'power', label: 'Power', emoji: '⏻', codeHex: '0x11DA2700', commandHash: 0x2700, category: 'power', shape: 'circle', w: 64, h: 64, row: 0, col: 0, captured: true },
      { id: 'eco', label: 'Eco', codeHex: '0x11DA2704', commandHash: 0x2704, category: 'mode', shape: 'pill', w: 96, h: 44, row: 0, col: 1, captured: true },

      { id: 'temp-up', label: 'Temp +', codeHex: '0x11DA272C', commandHash: 0x272c, category: 'volume', shape: 'bar', w: 106, h: 44, row: 1, col: 0, captured: true },
      { id: 'temp-dn', label: 'Temp -', codeHex: '0x11DA2728', commandHash: 0x2728, category: 'volume', shape: 'bar', w: 106, h: 44, row: 1, col: 1, captured: true },

      { id: 'cool', label: 'Cool', codeHex: '0x11DA2731', commandHash: 0x2731, category: 'mode', shape: 'square', w: 68, h: 58, row: 2, col: 0, captured: true },
      { id: 'heat', label: 'Heat', codeHex: '0x11DA2741', commandHash: 0x2741, category: 'mode', shape: 'square', w: 68, h: 58, row: 2, col: 1, captured: true },
      { id: 'fan', label: 'Fan', codeHex: '0x11DA27A0', commandHash: 0x27a0, category: 'channel', shape: 'square', w: 68, h: 58, row: 2, col: 2, captured: true },
    ],
  },
  {
    id: 'apple-tv-4k',
    name: 'Apple TV 4K',
    emoji: '🎮',
    mode: 'shapes',
    manufacturer: 'Apple',
    deviceType: 'Streamer',
    protocol: 'NEC',
    protocolId: 1,
    carrierKhz: 38,
    bitLength: 32,
    frameDurationMs: 67.5,
    agcMarkUs: 9000,
    agcSpaceUs: 4500,
    bitOneMarkUs: 560,
    bitOneSpaceUs: 1690,
    bitZeroMarkUs: 560,
    bitZeroSpaceUs: 560,
    buttons: [
      { id: 'menu', label: 'Menu', codeHex: '0x77E1C060', commandHash: 0xc060, category: 'nav', shape: 'pill', w: 96, h: 44, row: 0, col: 0, captured: true },
      { id: 'home', label: 'TV', codeHex: '0x77E14060', commandHash: 0x4060, category: 'mode', shape: 'circle', w: 60, h: 60, row: 0, col: 1, captured: true },
      { id: 'play', label: 'Play', codeHex: '0x77E1FA60', commandHash: 0xfa60, category: 'media', shape: 'pill', w: 96, h: 44, row: 0, col: 2, captured: true },

      { id: 'up', label: 'Up', codeHex: '0x77E15060', commandHash: 0x5060, category: 'nav', shape: 'square', w: 60, h: 52, row: 1, col: 1, captured: true },
      { id: 'ok', label: 'Select', codeHex: '0x77E13A60', commandHash: 0x3a60, category: 'nav', shape: 'circle', w: 66, h: 66, row: 2, col: 1, captured: true },
      { id: 'down', label: 'Down', codeHex: '0x77E13060', commandHash: 0x3060, category: 'nav', shape: 'square', w: 60, h: 52, row: 3, col: 1, captured: true },
    ],
  },
  {
    id: 'lab-calibration',
    name: 'IR Lab Probe',
    emoji: '📡',
    mode: 'shapes',
    manufacturer: 'Bench Suite',
    deviceType: 'Diagnostics',
    protocol: 'RC5',
    protocolId: 4,
    carrierKhz: 56,
    bitLength: 14,
    frameDurationMs: 24.9,
    agcMarkUs: 889,
    agcSpaceUs: 889,
    bitOneMarkUs: 889,
    bitOneSpaceUs: 889,
    bitZeroMarkUs: 889,
    bitZeroSpaceUs: 889,
    buttons: [
      { id: 'cal-36', label: '36kHz Ping', codeHex: '0x0000180C', commandHash: 0x180c, category: 'lab', shape: 'pill', w: 106, h: 46, row: 0, col: 0, captured: true },
      { id: 'cal-56', label: '56kHz Burst', codeHex: '0x0000183F', commandHash: 0x183f, category: 'lab', shape: 'pill', w: 106, h: 46, row: 0, col: 1, captured: true },
      { id: 'cal-aa', label: '0xAAAA', codeHex: '0xAAAAAAAA', commandHash: 0xaaaa, category: 'lab', shape: 'square', w: 66, h: 60, row: 1, col: 0, captured: true },
      { id: 'cal-sync', label: 'RTT Echo', codeHex: '0x00000001', commandHash: 0x0001, category: 'lab', shape: 'circle', w: 66, h: 66, row: 1, col: 1, captured: true },
      { id: 'cal-ff', label: '0xFFFF', codeHex: '0xFFFFFFFF', commandHash: 0xffff, category: 'lab', shape: 'square', w: 66, h: 60, row: 1, col: 2, captured: true },
    ],
  },
];

export const SAMPLE_IR_FILE = `Filetype: IR signals file
Version: 1
# Sample Bench TV Capture
name: Power
type: parsed
protocol: NEC
address: 04 00 00 00
command: 08 00 00 00
#
name: Vol_Up
type: parsed
protocol: NEC
address: 04 00 00 00
command: 02 00 00 00
#
name: Custom_Raw_Burst
type: raw
frequency: 38000
duty_cycle: 0.330000
data: 9024 4512 564 564 564 1692 564 564 564 1692 564 564 564 564 564 1692 564 564 564
`;

export const IR_MACROS: IRMacro[] = [
  {
    id: 'cinema-boot',
    name: 'Cinema Night Boot',
    summary: 'Powers OLED display, switches eARC soundbar, and selects HDMI input.',
    steps: [
      { presetId: 'lg-oled-c3', buttonId: 'power', delayAfterMs: 140 },
      { presetId: 'samsung-q990c', buttonId: 'power', delayAfterMs: 110 },
      { presetId: 'lg-oled-c3', buttonId: 'input', delayAfterMs: 90 },
      { presetId: 'samsung-q990c', buttonId: 'sound-mode', delayAfterMs: 0 },
    ],
  },
];
