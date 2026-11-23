import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BenchLogsView } from './components/BenchLogsView';
import { IrStudioView } from './components/IrStudioView';
import {
  BUILDER_TEMPLATES,
  PROTOCOL_IDS,
  QUICK_EMOJI,
  REMOTE_PRESETS,
  SHAPE_DEFAULTS,
  shapeRadius,
} from './data/presets';
import {
  deleteCustomRemote,
  saveCustomRemote,
  transmitIRCommand,
  triggerIRCapture,
} from './lib/irClient';
import { downloadPresetAsIrxFile, hashString16, parseIrFile } from './lib/irFileFormat';
import type {
  ButtonShape,
  CapturedSignal,
  ConnectionTarget,
  DeviceConfig,
  IRProtocol,
  RemoteButton,
  RemotePreset,
  TelemetryRecord,
  TelemetryStats,
} from './types/telemetry';

type Screen =
  | 'home'
  | 'remotes'
  | 'editList'
  | 'run'
  | 'build'
  | 'wifi'
  | 'logs'
  | 'irstudio';

const EMPTY_STATS: TelemetryStats = {
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

const CUSTOM_REMOTES_KEY = 'irbench-custom-remotes-v2';
const MIN_SIZE = 34;

function groupButtonsByRow(buttons: RemoteButton[]): RemoteButton[][] {
  if (buttons.length === 0) return [];
  const hasExplicitRows = buttons.some((b) => b.row !== undefined);
  if (!hasExplicitRows) {
    const rows: RemoteButton[][] = [];
    for (let i = 0; i < buttons.length; i += 3) {
      rows.push(buttons.slice(i, i + 3));
    }
    return rows;
  }
  const map = new Map<number, RemoteButton[]>();
  buttons.forEach((b, idx) => {
    const r = b.row ?? Math.floor(idx / 3);
    const list = map.get(r) ?? [];
    list.push(b);
    map.set(r, list);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => list.sort((a, b) => (a.col ?? 0) - (b.col ?? 0)));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const scrollPositionsRef = useRef<Partial<Record<Screen, number>>>({});
  const pendingScrollRef = useRef<number>(0);

  const navigateTo = useCallback(
    (next: Screen, direction: 'forward' | 'back' = 'forward') => {
      scrollPositionsRef.current[screen] = window.scrollY;
      pendingScrollRef.current =
        direction === 'back' ? (scrollPositionsRef.current[next] ?? 0) : 0;
      setScreen(next);
    },
    [screen]
  );

  useLayoutEffect(() => {
    const targetY = pendingScrollRef.current;
    window.scrollTo({ top: targetY, behavior: 'auto' });
    const raf = requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(raf);
  }, [screen]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('irbench-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [customRemotes, setCustomRemotes] = useState<RemotePreset[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_REMOTES_KEY);
      return raw ? (JSON.parse(raw) as RemotePreset[]) : [];
    } catch {
      return [];
    }
  });

  const [logs, setLogs] = useState<TelemetryRecord[]>([]);
  const [stats, setStats] = useState<TelemetryStats>(EMPTY_STATS);
  const [config, setConfig] = useState<DeviceConfig>({
    target: 'simulator',
    esp32Host: 'http://192.168.4.1',
    wifiPowerSave: 'WIFI_PS_NONE',
    codec: 'binary',
    rssiDbm: -51,
    wifiChannel: 6,
    firmwareVersion: 'rmt-v2.4-opt',
    connected: true,
  });
  const [espIpInput, setEspIpInput] = useState('http://192.168.4.1');

  // Run screen state
  const [activeRunId, setActiveRunId] = useState<string>(REMOTE_PRESETS[0].id);
  const [flashingBtnId, setFlashingBtnId] = useState<string | null>(null);
  const [lastTxInfo, setLastTxInfo] = useState<string | null>(null);

  // Builder state
  const [draft, setDraft] = useState<RemotePreset | null>(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [showAddBtnForm, setShowAddBtnForm] = useState(false);
  const [newBtnName, setNewBtnName] = useState('');
  const [newBtnRow, setNewBtnRow] = useState(0);
  const [pendingShape, setPendingShape] = useState<ButtonShape>('circle');
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [editingBtnId, setEditingBtnId] = useState<string | null>(null);
  const [editBtnName, setEditBtnName] = useState('');
  const [editBtnShape, setEditBtnShape] = useState<ButtonShape>('circle');
  const [editBtnRow, setEditBtnRow] = useState(0);

  // Mode chooser sheet & Photo / .ir inputs
  const [showModeSheet, setShowModeSheet] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const irFileInputRef = useRef<HTMLInputElement | null>(null);
  const frameGridRef = useRef<HTMLDivElement | null>(null);
  const photoWrapRef = useRef<HTMLDivElement | null>(null);

  // Capture popup overlay state
  const [captureTargetBtnId, setCaptureTargetBtnId] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<'listening' | 'got'>('listening');
  const [capturedSignal, setCapturedSignal] = useState<CapturedSignal | null>(null);

  // Hold-to-capture animation state
  const [holdingBtnId, setHoldingBtnId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<{ id: string; start: number; raf: number } | null>(null);

  // Soak burst state
  const [soakRunning, setSoakRunning] = useState(false);
  const [soakCount, setSoakCount] = useState(25);
  const [soakProgress, setSoakProgress] = useState(0);
  const soakAbortRef = useRef(false);

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((curr) => (curr === msg ? null : curr)), 2200);
  }, []);

  const allRemotes = [...REMOTE_PRESETS, ...customRemotes];
  const activeRunRemote = allRemotes.find((r) => r.id === activeRunId) ?? allRemotes[0];

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? EMPTY_STATS);
      if (data.config) {
        setConfig(data.config);
        setEspIpInput(data.config.esp32Host);
      }
    } catch {
      // ignore transient network error
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    for (const rem of customRemotes) {
      saveCustomRemote(rem).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLogs]);

  useEffect(() => {
    const es = new EventSource('/api/telemetry/stream');
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'config' && msg.config) {
          setConfig(msg.config);
        } else if (msg.type === 'telemetry' && msg.record) {
          setLogs((prev) => {
            if (prev.some((p) => p.id === msg.record.id)) return prev;
            const next = [...prev, msg.record];
            return next.length > 5000 ? next.slice(-5000) : next;
          });
        }
      } catch {
        // ignore keepalive
      }
    };
    return () => es.close();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    if (next === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    try {
      localStorage.setItem('irbench-theme', next);
    } catch {
      // ignore
    }
  };

  const persistCustomRemotes = async (nextList: RemotePreset[]) => {
    setCustomRemotes(nextList);
    try {
      localStorage.setItem(CUSTOM_REMOTES_KEY, JSON.stringify(nextList));
    } catch {
      // ignore quota
    }
  };

  const handleSaveCustomOrEditedRemote = async (rem: RemotePreset) => {
    const idx = customRemotes.findIndex((r) => r.id === rem.id);
    const saved: RemotePreset = { ...rem, isCustom: true };
    const next =
      idx >= 0
        ? customRemotes.map((r) => (r.id === rem.id ? saved : r))
        : [...customRemotes, saved];
    await persistCustomRemotes(next);
    await saveCustomRemote(saved).catch(() => {});
  };

  const updateDeviceConfig = async (patch: Partial<DeviceConfig>) => {
    const res = await fetch('/api/device/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
    }
  };

  const handleFireButton = async (remote: RemotePreset, btn: RemoteButton) => {
    setFlashingBtnId(btn.id);
    setTimeout(() => setFlashingBtnId((c) => (c === btn.id ? null : c)), 260);
    try {
      const res = await transmitIRCommand({
        codec: config.codec,
        presetId: remote.id,
        presetName: remote.name,
        buttonId: btn.id,
        commandLabel: btn.label,
        protocol: remote.protocol,
        carrierKhz: btn.frequencyHz ? Math.round(btn.frequencyHz / 1000) : remote.carrierKhz,
        commandHash: btn.commandHash,
        codeHex: btn.codeHex,
        rawTimingsUs: btn.rawTimingsUs,
      });
      setStats(res.stats);
      setLastTxInfo(
        `${btn.label} · ${res.record.totalLatencyMs.toFixed(2)} ms · ${res.record.backendOverheadUs.toFixed(1)} us (${config.codec === 'binary' ? '8B' : 'JSON'})`
      );
    } catch {
      showToast('TX failed');
    }
  };

  /* ---------------- Mode Chooser & New Remote Creation ---------------- */
  const chooseShapesMode = () => {
    setShowModeSheet(false);
    setDraft({
      id: `r_${Date.now()}`,
      name: '',
      emoji: '📺',
      mode: 'shapes',
      photo: null,
      manufacturer: 'Custom',
      deviceType: 'IR Remote',
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
      isCustom: true,
      buttons: [],
    });
    setIsEditingExisting(false);
    setEditingBtnId(null);
    setShowAddBtnForm(false);
    navigateTo('build', 'forward');
  };

  const choosePhotoMode = () => {
    setShowModeSheet(false);
    photoInputRef.current?.click();
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAXW = 520;
        const scale = Math.min(1, MAXW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setDraft({
          id: `r_${Date.now()}`,
          name: '',
          emoji: '📷',
          mode: 'photo',
          photo: dataUrl,
          manufacturer: 'Photo Remote',
          deviceType: 'Photo Map',
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
          isCustom: true,
          buttons: [],
        });
        setIsEditingExisting(false);
        setEditingBtnId(null);
        setShowAddBtnForm(false);
        navigateTo('build', 'forward');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleIrFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseIrFile(text, file.name);
      await handleSaveCustomOrEditedRemote(parsed);
      setShowModeSheet(false);
      setDraft(JSON.parse(JSON.stringify(parsed)) as RemotePreset);
      setIsEditingExisting(true);
      navigateTo('build', 'forward');
      showToast(`Imported ${parsed.buttons.length} keys (${file.name.endsWith('.irx') ? '.irx' : '.ir'})`);
    } catch {
      showToast('Invalid .irx / .ir file');
    } finally {
      e.target.value = '';
    }
  };

  const openEditRemote = (remoteId: string) => {
    const found = allRemotes.find((r) => r.id === remoteId);
    if (!found) return;
    const copy = JSON.parse(JSON.stringify(found)) as RemotePreset;
    // If editing a built-in preset, clone as editable custom or keep ID if custom
    if (!found.isCustom) {
      copy.id = `custom-${found.id}-${Date.now().toString(36).slice(-4)}`;
      copy.name = `${found.name} (Copy)`;
      copy.isCustom = true;
    }
    setDraft(copy);
    setIsEditingExisting(Boolean(found.isCustom));
    setEditingBtnId(null);
    setShowAddBtnForm(false);
    navigateTo('build', 'forward');
  };

  /* ---------------- Builder Button Actions ---------------- */
  const applyBuilderTemplate = (tpl: 'blank' | 'tv' | 'ac' | 'audio') => {
    if (!draft) return;
    setEditingBtnId(null);
    setShowAddBtnForm(false);
    if (tpl === 'blank') {
      setDraft({ ...draft, buttons: [] });
      return;
    }
    const base = BUILDER_TEMPLATES[tpl];
    const cloned = base.map((b, i) => ({
      ...b,
      id: `b_${Date.now()}_${i}`,
      captured: false,
    }));
    const emojiMap = { tv: '📺', ac: '❄️', audio: '🔊' };
    setDraft({
      ...draft,
      emoji: draft.emoji || emojiMap[tpl],
      buttons: cloned,
    });
    showToast(`Applied ${tpl.toUpperCase()} layout`);
  };

  const confirmAddButton = () => {
    if (!draft || !newBtnName.trim()) return;
    const def = SHAPE_DEFAULTS[pendingShape];
    const label = newBtnName.trim();
    const rowCols = draft.buttons.filter((b) => (b.row ?? 0) === newBtnRow).length;
    const btn: RemoteButton = {
      id: `b_${Date.now()}`,
      label,
      codeHex: '0x20DF10EF',
      commandHash: hashString16(label),
      category: 'mode',
      shape: pendingShape,
      w: def.w,
      h: def.h,
      row: draft.mode === 'photo' ? undefined : newBtnRow,
      col: draft.mode === 'photo' ? undefined : rowCols,
      captured: false,
      ...(pendingCoords ? { x: pendingCoords.x, y: pendingCoords.y } : {}),
    };
    setDraft({ ...draft, buttons: [...draft.buttons, btn] });
    setNewBtnName('');
    setPendingShape('circle');
    setPendingCoords(null);
    setShowAddBtnForm(false);
  };

  const openEditButtonPanel = (btn: RemoteButton) => {
    setEditingBtnId(btn.id);
    setEditBtnName(btn.label);
    setEditBtnShape(btn.shape ?? 'circle');
    setEditBtnRow(btn.row ?? 0);
    setShowAddBtnForm(false);
  };

  const saveEditButtonPanel = () => {
    if (!draft || !editingBtnId) return;
    const def = SHAPE_DEFAULTS[editBtnShape];
    setDraft({
      ...draft,
      buttons: draft.buttons.map((b) =>
        b.id === editingBtnId
          ? {
              ...b,
              label: editBtnName.trim() || b.label,
              shape: editBtnShape,
              row: draft.mode === 'photo' ? undefined : editBtnRow,
              w: b.shape !== editBtnShape ? def.w : b.w ?? def.w,
              h: b.shape !== editBtnShape ? def.h : b.h ?? def.h,
            }
          : b
      ),
    });
    setEditingBtnId(null);
  };

  const deleteEditingButton = () => {
    if (!draft || !editingBtnId) return;
    setDraft({
      ...draft,
      buttons: draft.buttons.filter((b) => b.id !== editingBtnId),
    });
    setEditingBtnId(null);
  };

  const saveCurrentRemote = async () => {
    if (!draft || !draft.name.trim() || draft.buttons.length === 0) return;
    await handleSaveCustomOrEditedRemote(draft);
    showToast('Remote saved');
    setDraft(null);
    navigateTo('remotes', 'back');
  };

  const deleteCurrentRemote = async () => {
    if (!draft) return;
    const next = customRemotes.filter((r) => r.id !== draft.id);
    await persistCustomRemotes(next);
    await deleteCustomRemote(draft.id).catch(() => {});
    setDraft(null);
    showToast('Remote deleted');
    navigateTo('editList', 'back');
  };

  /* ---------------- Capture Mode Popup Overlay ---------------- */
  const openCaptureModal = (btnId: string) => {
    setCaptureTargetBtnId(btnId);
    setCaptureState('listening');
    setCapturedSignal(null);
  };

  // Poll real ESP32 /ir/rx when modal is open in esp32-lan mode
  useEffect(() => {
    if (!captureTargetBtnId || captureState !== 'listening' || config.target !== 'esp32-lan') return;
    const timer = setInterval(async () => {
      try {
        const btn = draft?.buttons.find((b) => b.id === captureTargetBtnId);
        const sig = await triggerIRCapture({
          protocol: draft?.protocol,
          suggestedName: btn?.label,
        });
        if (sig) {
          setCapturedSignal(sig);
          setCaptureState('got');
        }
      } catch {
        // wait next poll
      }
    }, 800);
    return () => clearInterval(timer);
  }, [captureTargetBtnId, captureState, config.target, draft]);

  const simulatePhysicalIRBurst = async () => {
    const btn = draft?.buttons.find((b) => b.id === captureTargetBtnId);
    const sig = await triggerIRCapture({
      protocol: draft?.protocol ?? 'NEC',
      suggestedName: btn?.label || 'Captured',
      carrierKhz: draft?.carrierKhz ?? 38,
    });
    if (sig) {
      setCapturedSignal(sig);
      setCaptureState('got');
    }
  };

  const finishCaptureModal = () => {
    if (!draft || !captureTargetBtnId || !capturedSignal) {
      setCaptureTargetBtnId(null);
      return;
    }
    setDraft({
      ...draft,
      protocol: capturedSignal.protocol,
      protocolId: PROTOCOL_IDS[capturedSignal.protocol] ?? 1,
      carrierKhz: capturedSignal.carrierKhz,
      buttons: draft.buttons.map((b) =>
        b.id === captureTargetBtnId
          ? {
              ...b,
              captured: true,
              codeHex: capturedSignal.codeHex,
              commandHash: hashString16(`${b.label}-${capturedSignal.codeHex}`),
              irType: capturedSignal.irType,
              addressBytes: capturedSignal.addressBytes,
              commandBytes: capturedSignal.commandBytes,
              frequencyHz: capturedSignal.carrierKhz * 1000,
              dutyCycle: capturedSignal.dutyCycle,
              rawTimingsUs: capturedSignal.rawTimingsUs,
            }
          : b
      ),
    });
    setCaptureTargetBtnId(null);
    showToast(`Captured ${capturedSignal.codeHex}`);
  };

  /* ---------------- Hold-to-Capture & Tap-to-Select ---------------- */
  const startHoldGesture = (btn: RemoteButton) => {
    if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current.raf);
    const start = Date.now();
    const HOLD_MS = 650;
    setHoldingBtnId(btn.id);
    setHoldProgress(0);

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        holdTimerRef.current = null;
        setHoldingBtnId(null);
        setHoldProgress(0);
        openCaptureModal(btn.id);
        return;
      }
      const raf = requestAnimationFrame(tick);
      holdTimerRef.current = { id: btn.id, start, raf };
    };
    const raf = requestAnimationFrame(tick);
    holdTimerRef.current = { id: btn.id, start, raf };
  };

  const endHoldGesture = (btn: RemoteButton) => {
    const active = holdTimerRef.current;
    if (!active) return;
    cancelAnimationFrame(active.raf);
    const elapsed = Date.now() - active.start;
    holdTimerRef.current = null;
    setHoldingBtnId(null);
    setHoldProgress(0);
    if (elapsed < 400) {
      openEditButtonPanel(btn);
    }
  };

  /* ---------------- Resize Handle Drag ---------------- */
  const startResizeDrag = (e: React.PointerEvent, btn: RemoteButton) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = btn.w ?? 64;
    const origH = btn.h ?? 64;
    const frameW = frameGridRef.current?.clientWidth ?? 360;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const nextW = Math.max(MIN_SIZE, Math.min(frameW - 12, Math.round(origW + dx)));
      const nextH =
        btn.shape === 'circle' || btn.shape === 'square'
          ? nextW
          : Math.max(MIN_SIZE, Math.min(160, Math.round(origH + dy)));
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              buttons: prev.buttons.map((b) =>
                b.id === btn.id ? { ...b, w: nextW, h: nextH } : b
              ),
            }
          : prev
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ---------------- Photo Canvas Tap & Drag ---------------- */
  const handlePhotoCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.marker')) return;
    const rect = photoWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const y = Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));
    setPendingCoords({ x, y });
    setEditingBtnId(null);
    setShowAddBtnForm(true);
  };

  /* ---------------- Soak Burst Runner ---------------- */
  const handleToggleSoak = async () => {
    if (soakRunning) {
      soakAbortRef.current = true;
      setSoakRunning(false);
      return;
    }
    soakAbortRef.current = false;
    setSoakRunning(true);
    setSoakProgress(0);
    try {
      const buttons = activeRunRemote.buttons;
      for (let i = 0; i < soakCount; i++) {
        if (soakAbortRef.current) break;
        const btn = buttons[i % buttons.length];
        await handleFireButton(activeRunRemote, btn);
        setSoakProgress(i + 1);
        if (i < soakCount - 1 && !soakAbortRef.current) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    } finally {
      setSoakRunning(false);
    }
  };

  const handleClearLogs = async () => {
    const res = await fetch('/api/logs', { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? EMPTY_STATS);
    }
  };

  const captureTargetBtn = draft?.buttons.find((b) => b.id === captureTargetBtnId);

  return (
    <div id="app">
      {/* ==================== HOME ==================== */}
      {screen === 'home' && (
        <div className="screen">
          <header className="topbar">
            <div className="title-block">
              <p className="eyebrow">IR Bench · ESP32</p>
              <h1>Remote lab</h1>
            </div>
            <div
              className={`led ${config.connected ? '' : 'off'}`}
              title={config.connected ? 'ESP32 link connected' : 'Offline'}
            />
            <button
              type="button"
              onClick={toggleTheme}
              className="gear-btn"
              title="Toggle light/dark mode"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </header>

          <div className="home-hero">
            <p>
              Build virtual remotes, capture IR codes off your old TV clicker, then fire them back out through the ESP32 LED.
            </p>
          </div>

          <div className="menu-grid">
            <button type="button" className="menu-card" onClick={() => navigateTo('remotes', 'forward')}>
              <div className="menu-ico">▶</div>
              <div>
                <h3>Remotes</h3>
                <p>Run a saved remote and send signals</p>
              </div>
              <div className="menu-count">{allRemotes.length}</div>
            </button>

            <button type="button" className="menu-card" onClick={() => setShowModeSheet(true)}>
              <div className="menu-ico">＋</div>
              <div>
                <h3>New remote</h3>
                <p>From scratch, from a photo, or .irx / .ir file</p>
              </div>
            </button>

            <button type="button" className="menu-card" onClick={() => navigateTo('editList', 'forward')}>
              <div className="menu-ico">✎</div>
              <div>
                <h3>Edit</h3>
                <p>Rename, resize, re-capture, or delete</p>
              </div>
            </button>

            <button type="button" className="menu-card" onClick={() => navigateTo('wifi', 'forward')}>
              <div className="menu-ico">&#9737;</div>
              <div>
                <h3>WiFi</h3>
                <p>
                  {config.target === 'simulator' ? 'Simulator' : config.esp32Host} ·{' '}
                  {config.codec === 'binary' ? '8B Bin' : 'JSON'} · {config.rssiDbm} dBm
                </p>
              </div>
            </button>

            <button type="button" className="menu-card" onClick={() => navigateTo('logs', 'forward')}>
              <div className="menu-ico">⚡</div>
              <div>
                <h3>Timing &amp; Logs</h3>
                <p>Real-time RTT, soak tests &amp; CSV/JSON export</p>
              </div>
              <div className="menu-count">{stats.count}</div>
            </button>

            <button type="button" className="menu-card" onClick={() => navigateTo('irstudio', 'forward')}>
              <div className="menu-ico">⤓</div>
              <div>
                <h3>.irx Studio</h3>
                <p>Export &amp; import layouts with button positions</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ==================== REMOTES LIST (RUN) ==================== */}
      {screen === 'remotes' && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('home', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Run</p>
              <h1>Remotes</h1>
            </div>
          </header>

          <div className="remote-grid">
            {allRemotes.map((r) => {
              const capCount = r.buttons.filter((b) => b.captured !== false).length;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`remote-card ${r.mode === 'photo' && r.photo ? 'has-photo' : ''}`}
                  onClick={() => {
                    setActiveRunId(r.id);
                    setLastTxInfo(null);
                    navigateTo('run', 'forward');
                  }}
                >
                  {r.mode === 'photo' && r.photo ? (
                    <>
                      <img src={r.photo} alt={r.name} />
                      <div className="rname">
                        {r.emoji ? `${r.emoji} ` : ''}
                        {r.name}
                      </div>
                      <div className="rmeta">
                        {capCount}/{r.buttons.length}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="remote-dots">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="remote-card-icon">{r.emoji || '📡'}</div>
                      <div className="remote-card-name">{r.name}</div>
                      <div className="rmeta">
                        {capCount}/{r.buttons.length} captured
                      </div>
                    </>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              className="add-remote-card"
              onClick={() => setShowModeSheet(true)}
            >
              <div className="pen-circle">✎</div>
              <span>New remote</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== EDIT LIST ==================== */}
      {screen === 'editList' && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('home', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Edit</p>
              <h1>Pick a remote</h1>
            </div>
          </header>

          <div className="remote-grid">
            {allRemotes.map((r) => {
              const capCount = r.buttons.filter((b) => b.captured !== false).length;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`remote-card ${r.mode === 'photo' && r.photo ? 'has-photo' : ''}`}
                  onClick={() => openEditRemote(r.id)}
                >
                  {r.mode === 'photo' && r.photo ? (
                    <>
                      <img src={r.photo} alt={r.name} />
                      <div className="rname">
                        {r.emoji ? `${r.emoji} ` : ''}
                        {r.name}
                      </div>
                      <div className="rmeta">
                        {capCount}/{r.buttons.length}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="remote-dots">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="remote-card-icon">{r.emoji || '📡'}</div>
                      <div className="remote-card-name">{r.name}</div>
                      <div className="rmeta">
                        {capCount}/{r.buttons.length} captured
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== RUN REMOTE ==================== */}
      {screen === 'run' && activeRunRemote && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('remotes', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Sending · {activeRunRemote.protocol}</p>
              <h1>
                {activeRunRemote.emoji ? `${activeRunRemote.emoji} ` : ''}
                {activeRunRemote.name}
              </h1>
            </div>
            <button
              type="button"
              className="gear-btn"
              title="Export .irx layout file"
              onClick={() => {
                downloadPresetAsIrxFile(activeRunRemote);
                showToast('Exported .irx');
              }}
              style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}
            >
              .irx
            </button>
          </header>

          {lastTxInfo && (
            <div
              className="tabular-nums"
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '8px 12px',
                fontFamily: 'var(--mono)',
                fontSize: 11.5,
                color: 'var(--ok)',
              }}
            >
              ● TX {lastTxInfo}
            </div>
          )}

          {activeRunRemote.mode === 'photo' && activeRunRemote.photo ? (
            <div className="photo-wrap" style={{ borderStyle: 'solid' }}>
              <img src={activeRunRemote.photo} alt={activeRunRemote.name} />
              {activeRunRemote.buttons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  title={b.label}
                  onClick={() => handleFireButton(activeRunRemote, b)}
                  className={`hotspot ${flashingBtnId === b.id ? 'flash' : ''}`}
                  style={{
                    left: `${b.x ?? 50}%`,
                    top: `${b.y ?? 50}%`,
                    width: b.w ?? 48,
                    height: b.h ?? 48,
                    borderRadius: shapeRadius(b.shape, b.w, b.h),
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="run-shell">
              <div className="run-rows">
                {groupButtonsByRow(activeRunRemote.buttons).map((rowBtns, rIdx) => (
                  <div key={rIdx} className="run-row">
                    {rowBtns.map((b) => {
                      const isCaptured = b.captured !== false;
                      const isFlash = flashingBtnId === b.id;
                      const w = b.w ?? 72;
                      const h = b.h ?? 52;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleFireButton(activeRunRemote, b)}
                          className={`run-btn ${isCaptured ? '' : 'uncaptured'} ${isFlash ? 'flash' : ''}`}
                          style={{
                            width: w,
                            height: h,
                            borderRadius: shapeRadius(b.shape, w, h),
                          }}
                        >
                          {b.emoji && <span className="btn-emoji">{b.emoji}</span>}
                          <span>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== BUILDER (NEW / EDIT) ==================== */}
      {screen === 'build' && draft && (
        <div className="screen">
          <header className="topbar">
            <button
              type="button"
              className="back-btn"
              onClick={() => {
                setDraft(null);
                navigateTo(isEditingExisting ? 'editList' : 'home', 'back');
              }}
            >
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">
                {isEditingExisting
                  ? 'Edit remote'
                  : draft.mode === 'photo'
                  ? 'New remote · from photo'
                  : 'New remote'}
              </p>
              <h1>
                {draft.emoji ? `${draft.emoji} ` : ''}
                {draft.name || 'Untitled'}
              </h1>
            </div>
            <button
              type="button"
              className="gear-btn"
              title="Export .irx layout"
              onClick={() => {
                downloadPresetAsIrxFile(draft);
                showToast('Exported .irx');
              }}
              style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}
            >
              .irx
            </button>
          </header>

          <div className="name-emoji-row">
            <div className="field">
              <label>Remote name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Living room TV"
              />
            </div>
            <div className="field" style={{ flex: '0 0 68px' }}>
              <label>Icon</label>
              <input
                type="text"
                className="emoji-input"
                maxLength={4}
                value={draft.emoji || ''}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                placeholder="📺"
              />
            </div>
          </div>

          <div className="emoji-pick">
            {QUICK_EMOJI.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setDraft({ ...draft, emoji: em })}
              >
                {em}
              </button>
            ))}
          </div>

          {/* Shapes-mode builder */}
          {draft.mode !== 'photo' ? (
            <div className="field" style={{ marginTop: 22 }}>
              <label>Layout starter template</label>
              <div className="template-bar">
                <button type="button" className="template-chip" onClick={() => applyBuilderTemplate('tv')}>
                  📺 TV Layout
                </button>
                <button type="button" className="template-chip" onClick={() => applyBuilderTemplate('ac')}>
                  ❄️ AC Layout
                </button>
                <button type="button" className="template-chip" onClick={() => applyBuilderTemplate('audio')}>
                  🔊 Audio Bar
                </button>
                <button type="button" className="template-chip" onClick={() => applyBuilderTemplate('blank')}>
                  Clear
                </button>
              </div>

              <label>Buttons — tap to select &amp; resize, hold to capture</label>
              <div className="frame-wrap">
                <span className="frame-tag">frame</span>
                <div className="builder-rows" ref={frameGridRef}>
                  {groupButtonsByRow(draft.buttons).map((rowBtns, rIdx) => (
                    <div key={rIdx} className="builder-row">
                      {rowBtns.map((b) => {
                        const selected = editingBtnId === b.id;
                        const holding = holdingBtnId === b.id;
                        const w = b.w ?? 64;
                        const h = b.h ?? 64;
                        return (
                          <div
                            key={b.id}
                            className={`ir-btn ${b.captured ? 'captured' : 'pending'} ${
                              selected ? 'selected' : ''
                            } ${holding ? 'holding' : ''}`}
                            style={{
                              width: w,
                              height: h,
                              borderRadius: shapeRadius(b.shape, w, h),
                              ['--p' as string]: holding ? holdProgress : 0,
                            }}
                            onPointerDown={(e) => {
                              if ((e.target as HTMLElement).closest('.resize-handle')) return;
                              startHoldGesture(b);
                            }}
                            onPointerUp={() => endHoldGesture(b)}
                            onPointerLeave={() => endHoldGesture(b)}
                            onPointerCancel={() => endHoldGesture(b)}
                          >
                            <div className="holdring" />
                            {b.emoji && <div className="btn-emoji">{b.emoji}</div>}
                            <div className="btn-label">{b.label}</div>
                            <div className="btn-state">{b.captured ? 'captured' : 'hold'}</div>
                            {selected && (
                              <div
                                className="resize-handle"
                                onPointerDown={(e) => startResizeDrag(e, b)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="add-btn-tile"
                    onClick={() => {
                      const maxRow = draft.buttons.reduce((acc, b) => Math.max(acc, b.row ?? 0), -1);
                      setNewBtnRow(maxRow < 0 ? 0 : maxRow);
                      setPendingCoords(null);
                      setEditingBtnId(null);
                      setShowAddBtnForm(true);
                    }}
                  >
                    ＋
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="field" style={{ marginTop: 22 }}>
                <label>Tap the photo where a button is</label>
              </div>
              <div className="photo-wrap" ref={photoWrapRef} onClick={handlePhotoCanvasClick}>
                {draft.photo && <img src={draft.photo} alt="Remote reference" />}
                {draft.buttons.map((b) => {
                  const selected = editingBtnId === b.id;
                  const holding = holdingBtnId === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`marker ${b.captured ? 'captured' : ''} ${
                        selected ? 'selected' : ''
                      } ${holding ? 'holding' : ''}`}
                      style={{
                        left: `${b.x ?? 50}%`,
                        top: `${b.y ?? 50}%`,
                        width: b.w ?? 48,
                        height: b.h ?? 48,
                        borderRadius: shapeRadius(b.shape, b.w, b.h),
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={() => startHoldGesture(b)}
                      onPointerUp={() => endHoldGesture(b)}
                    >
                      <span className="m-label">{b.label}</span>
                    </div>
                  );
                })}
                <div className="photo-hint">tap = add · hold = capture · tap marker = edit</div>
              </div>
            </div>
          )}

          {/* Add Button Inline Form */}
          {showAddBtnForm && (
            <div className="inline-form">
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ marginTop: 0, flex: 1 }}>
                  <label>Button name</label>
                  <input
                    type="text"
                    value={newBtnName}
                    onChange={(e) => setNewBtnName(e.target.value)}
                    placeholder="e.g. Power, Vol+, Mute"
                    autoFocus
                  />
                </div>
                {draft.mode !== 'photo' && (
                  <div className="field" style={{ marginTop: 0, width: 76 }}>
                    <label>Row</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={newBtnRow}
                      onChange={(e) => setNewBtnRow(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                )}
              </div>
              <div className="shape-toggle">
                {(['circle', 'square', 'pill', 'bar'] as ButtonShape[]).map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    data-shape={sh}
                    onClick={() => setPendingShape(sh)}
                    className={`shape-opt ${pendingShape === sh ? 'selected' : ''}`}
                  >
                    <span className="swatch" />
                    {sh.charAt(0).toUpperCase() + sh.slice(1)}
                  </button>
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setShowAddBtnForm(false);
                    setNewBtnName('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={!newBtnName.trim()}
                  onClick={confirmAddButton}
                >
                  Add button
                </button>
              </div>
            </div>
          )}

          {/* Edit Existing Button Panel */}
          {editingBtnId && (
            <div className="edit-panel">
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ marginTop: 0, flex: 1 }}>
                  <label>Edit button</label>
                  <input
                    type="text"
                    value={editBtnName}
                    onChange={(e) => setEditBtnName(e.target.value)}
                  />
                </div>
                {draft.mode !== 'photo' && (
                  <div className="field" style={{ marginTop: 0, width: 76 }}>
                    <label>Row</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={editBtnRow}
                      onChange={(e) => setEditBtnRow(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                )}
              </div>

              <div className="shape-toggle">
                {(['circle', 'square', 'pill', 'bar'] as ButtonShape[]).map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    data-shape={sh}
                    onClick={() => setEditBtnShape(sh)}
                    className={`shape-opt ${editBtnShape === sh ? 'selected' : ''}`}
                  >
                    <span className="swatch" />
                    {sh.charAt(0).toUpperCase() + sh.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ width: '100%', color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}
                  onClick={() => openCaptureModal(editingBtnId)}
                >
                  ● Capture IR Code for this Button
                </button>
              </div>

              <div className="row">
                <button type="button" className="danger-btn" onClick={deleteEditingButton}>
                  Delete
                </button>
                <button type="button" className="ghost-btn" onClick={() => setEditingBtnId(null)}>
                  Cancel
                </button>
                <button type="button" className="primary-btn" onClick={saveEditButtonPanel}>
                  Done
                </button>
              </div>
            </div>
          )}

          {isEditingExisting && (
            <div style={{ marginTop: 22 }}>
              <button type="button" className="danger-link" onClick={deleteCurrentRemote}>
                Delete this remote
              </button>
            </div>
          )}

          <div className="save-bar">
            <div className="save-bar-inner">
              <button
                type="button"
                className="full-btn"
                disabled={!draft.name.trim() || draft.buttons.length === 0}
                onClick={saveCurrentRemote}
              >
                Save remote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== WIFI & BENCH CONFIG ==================== */}
      {screen === 'wifi' && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('home', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Setup</p>
              <h1>WiFi &amp; Device</h1>
            </div>
          </header>

          <div className="bench-panel" style={{ marginTop: 6 }}>
            <div className="field" style={{ marginTop: 0 }}>
              <label>Connection Target</label>
              <select
                value={config.target}
                onChange={(e) =>
                  updateDeviceConfig({ target: e.target.value as ConnectionTarget })
                }
              >
                <option value="simulator">Local ESP32 Hardware Simulator</option>
                <option value="esp32-lan">Real ESP32 on Local Wi-Fi</option>
              </select>
            </div>

            <div className="field">
              <label>ESP32 IP / Hostname</label>
              <input
                type="text"
                value={espIpInput}
                onChange={(e) => setEspIpInput(e.target.value)}
                placeholder="http://192.168.4.1"
                style={{ fontFamily: 'var(--mono)' }}
              />
            </div>

            <div className="row">
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  await updateDeviceConfig({ esp32Host: espIpInput });
                  showToast('WiFi target updated');
                }}
              >
                Apply &amp; Probe
              </button>
            </div>
          </div>

          <div className="bench-panel">
            <div className="field" style={{ marginTop: 0 }}>
              <label>Command Transport Codec</label>
              <div className="shape-toggle">
                <button
                  type="button"
                  onClick={() => updateDeviceConfig({ codec: 'binary' })}
                  className={`shape-opt ${config.codec === 'binary' ? 'selected' : ''}`}
                >
                  8B Binary (Low Overhead)
                </button>
                <button
                  type="button"
                  onClick={() => updateDeviceConfig({ codec: 'json' })}
                  className={`shape-opt ${config.codec === 'json' ? 'selected' : ''}`}
                >
                  Legacy JSON
                </button>
              </div>
            </div>

            <div className="field">
              <label>ESP32 Wi-Fi Power Save</label>
              <div className="shape-toggle">
                <button
                  type="button"
                  onClick={() => updateDeviceConfig({ wifiPowerSave: 'WIFI_PS_NONE' })}
                  className={`shape-opt ${config.wifiPowerSave === 'WIFI_PS_NONE' ? 'selected' : ''}`}
                >
                  WIFI_PS_NONE
                </button>
                <button
                  type="button"
                  onClick={() => updateDeviceConfig({ wifiPowerSave: 'WIFI_PS_MIN_MODEM' })}
                  className={`shape-opt ${config.wifiPowerSave === 'WIFI_PS_MIN_MODEM' ? 'selected' : ''}`}
                >
                  PS_MIN_MODEM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TIMING & LOGS ==================== */}
      {screen === 'logs' && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('home', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Telemetry</p>
              <h1>Timing &amp; Logs</h1>
            </div>
          </header>

          <BenchLogsView
            logs={logs}
            stats={stats}
            selectedPreset={activeRunRemote}
            allRemotes={allRemotes}
            onSelectPreset={(p) => setActiveRunId(p.id)}
            soakRunning={soakRunning}
            soakCount={soakCount}
            soakProgress={soakProgress}
            onSetSoakCount={setSoakCount}
            onToggleSoak={handleToggleSoak}
            onClearLogs={handleClearLogs}
          />
        </div>
      )}

      {/* ==================== .IRX STUDIO ==================== */}
      {screen === 'irstudio' && (
        <div className="screen">
          <header className="topbar">
            <button type="button" className="back-btn" onClick={() => navigateTo('home', 'back')}>
              ←
            </button>
            <div className="title-block">
              <p className="eyebrow">Layouts &amp; Signals</p>
              <h1>.irx Studio</h1>
            </div>
          </header>

          <IrStudioView
            allRemotes={allRemotes}
            onImportRemote={async (rem) => {
              await handleSaveCustomOrEditedRemote(rem);
              showToast(`Added ${rem.name}`);
            }}
            onOpenRemote={(id) => {
              setActiveRunId(id);
              navigateTo('run', 'forward');
            }}
          />
        </div>
      )}

      {/* Hidden inputs for Photo & .irx/.ir file selection */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoSelected}
        style={{ display: 'none' }}
      />
      <input
        ref={irFileInputRef}
        type="file"
        accept=".irx,.ir,.txt"
        onChange={handleIrFileChosen}
        style={{ display: 'none' }}
      />

      {/* ==================== MODE CHOOSER OVERLAY ==================== */}
      {showModeSheet && (
        <div className="overlay" onClick={() => setShowModeSheet(false)}>
          <div
            className="capture-card"
            style={{ textAlign: 'left' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ textAlign: 'center' }}>New remote</h3>
            <button type="button" className="mode-opt" onClick={chooseShapesMode}>
              <div className="m-ico">⬡</div>
              <div>
                <h4>Build with buttons</h4>
                <p>Add circles/squares/pills or pick a starter layout</p>
              </div>
            </button>

            <button type="button" className="mode-opt" onClick={choosePhotoMode}>
              <div className="m-ico">📷</div>
              <div>
                <h4>Use a photo</h4>
                <p>Photograph your old remote, then tap to place buttons on it</p>
              </div>
            </button>

            <button
              type="button"
              className="mode-opt"
              onClick={() => irFileInputRef.current?.click()}
            >
              <div className="m-ico">⤓</div>
              <div>
                <h4>Import .irx / .ir file</h4>
                <p>Load full .irx button layout or Flipper .ir signals</p>
              </div>
            </button>

            <div className="row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowModeSheet(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CAPTURE OVERLAY ==================== */}
      {captureTargetBtnId && (
        <div className="overlay">
          <div className="capture-card">
            <div className={`capture-ring ${captureState}`}>
              <div className="pulse" />
              <div className="capture-dot" />
            </div>
            <h3>{captureTargetBtn?.label || 'Capture IR'}</h3>
            <p>
              {captureState === 'listening'
                ? "Point the old remote at the ESP32's IR receiver and press the button now."
                : `${capturedSignal?.protocol} · ${capturedSignal?.codeHex} · ${capturedSignal?.pulseCount} pulses (${capturedSignal?.jitterUs} us jitter)`}
            </p>
            <div className="status-line">
              {captureState === 'listening' ? 'LISTENING…' : 'CAPTURED'}
            </div>

            {captureState === 'listening' && config.target === 'simulator' && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ width: '100%', color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}
                  onClick={simulatePhysicalIRBurst}
                >
                  Simulate Remote Press
                </button>
              </div>
            )}

            <div className="capture-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setCaptureTargetBtnId(null)}
              >
                Close
              </button>
              {captureState === 'got' && (
                <button type="button" className="primary-btn" onClick={finishCaptureModal}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
