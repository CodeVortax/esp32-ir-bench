import React, { useMemo, useState } from 'react';
import { downloadRecordsAsCSV, downloadRecordsAsJSON } from '../lib/irClient';
import type { RemotePreset, TelemetryRecord, TelemetryStats } from '../types/telemetry';

interface BenchLogsViewProps {
  logs: TelemetryRecord[];
  stats: TelemetryStats;
  selectedPreset: RemotePreset;
  allRemotes: RemotePreset[];
  onSelectPreset: (preset: RemotePreset) => void;
  soakRunning: boolean;
  soakCount: number;
  soakProgress: number;
  onSetSoakCount: (n: number) => void;
  onToggleSoak: () => void;
  onClearLogs: () => Promise<void>;
}

export const BenchLogsView: React.FC<BenchLogsViewProps> = ({
  logs,
  stats,
  selectedPreset,
  allRemotes,
  onSelectPreset,
  soakRunning,
  soakCount,
  soakProgress,
  onSetSoakCount,
  onToggleSoak,
  onClearLogs,
}) => {
  const [filterProto, setFilterProto] = useState('ALL');
  const recentLogs = useMemo(() => {
    return [...logs]
      .reverse()
      .filter((r) => (filterProto === 'ALL' ? true : r.protocol === filterProto));
  }, [logs, filterProto]);

  const chartLogs = useMemo(() => logs.slice(-36), [logs]);
  const maxY = useMemo(() => {
    const peak = chartLogs.reduce((m, r) => Math.max(m, r.totalLatencyMs), 10);
    return Math.max(15, Math.ceil(peak * 1.18));
  }, [chartLogs]);

  const polyPoints = useMemo(() => {
    if (chartLogs.length === 0) return '';
    const w = 440;
    const h = 110;
    return chartLogs
      .map((r, i) => {
        const x = chartLogs.length === 1 ? w / 2 : (i / (chartLogs.length - 1)) * w;
        const y = h - 10 - (Math.min(r.totalLatencyMs, maxY) / maxY) * (h - 20);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [chartLogs, maxY]);

  return (
    <div>
      {/* 4 Summary Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
        <div className="bench-panel" style={{ marginTop: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Mean RTT
          </div>
          <div className="tabular-nums" style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, marginTop: 4 }}>
            {stats.meanMs.toFixed(2)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>ms</span>
          </div>
        </div>
        <div className="bench-panel" style={{ marginTop: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
            p95 / Jitter σ
          </div>
          <div className="tabular-nums" style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>
            {stats.p95Ms.toFixed(1)} <span style={{ fontSize: 12, color: 'var(--muted)' }}>±{stats.stdDevMs.toFixed(1)}ms</span>
          </div>
        </div>
        <div className="bench-panel" style={{ marginTop: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
            8B Bin Parse
          </div>
          <div className="tabular-nums" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--ok)', marginTop: 4 }}>
            {stats.binaryAvgUs > 0 ? `${stats.binaryAvgUs.toFixed(1)} us` : '—'}
          </div>
        </div>
        <div className="bench-panel" style={{ marginTop: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
            JSON Parse
          </div>
          <div className="tabular-nums" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, color: 'var(--muted)', marginTop: 4 }}>
            {stats.jsonAvgUs > 0 ? `${stats.jsonAvgUs.toFixed(1)} us` : '—'}
          </div>
        </div>
      </div>

      {/* Soak Test Runner */}
      <div className="bench-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Soak Burst Test</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Stress consistency over extended transmissions
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleSoak}
            className="primary-btn"
            style={{
              flex: '0 0 auto',
              padding: '10px 14px',
              background: soakRunning ? 'var(--danger)' : 'var(--accent)',
              color: soakRunning ? '#fff' : '#1a1006',
            }}
          >
            {soakRunning ? `Stop (${soakProgress}/${soakCount})` : `Run ${soakCount} pkts`}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8, marginTop: 12 }}>
          <select
            aria-label="Soak target remote"
            value={selectedPreset.id}
            onChange={(e) => {
              const found = allRemotes.find((r) => r.id === e.target.value);
              if (found) onSelectPreset(found);
            }}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '9px 10px',
              color: 'var(--text)',
              fontSize: 13,
            }}
          >
            {allRemotes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.emoji ? `${r.emoji} ` : ''}{r.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Soak burst count"
            value={soakCount}
            onChange={(e) => onSetSoakCount(Number(e.target.value))}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '9px 10px',
              color: 'var(--text)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            <option value={15}>15 pkts</option>
            <option value={25}>25 pkts</option>
            <option value={50}>50 pkts</option>
            <option value={100}>100 pkts</option>
          </select>
        </div>
      </div>

      {/* Live Latency Sparkline */}
      <div className="bench-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Live RTT Stream ({chartLogs.length})
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ok)' }}>
            Loss {stats.packetLossPct.toFixed(1)}%
          </span>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <svg viewBox="0 0 440 110" style={{ width: '100%', height: 110, display: 'block' }}>
            <line x1="0" y1="55" x2="440" y2="55" stroke="var(--line)" strokeDasharray="3 3" />
            {polyPoints && (
              <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={polyPoints} />
            )}
            {chartLogs.map((r, i) => {
              const x = chartLogs.length === 1 ? 220 : (i / (chartLogs.length - 1)) * 440;
              const y = 110 - 10 - (Math.min(r.totalLatencyMs, maxY) / maxY) * 90;
              return (
                <circle
                  key={r.id}
                  cx={x}
                  cy={y}
                  r="2.4"
                  fill={r.status === 'DROP' ? 'var(--danger)' : r.codec === 'binary' ? 'var(--ok)' : 'var(--accent)'}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* Export & Filter Controls */}
      <div className="bench-panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={recentLogs.length === 0}
            onClick={() => downloadRecordsAsCSV(recentLogs)}
            className="primary-btn"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={recentLogs.length === 0}
            onClick={() => downloadRecordsAsJSON(recentLogs, stats)}
            className="ghost-btn"
            style={{ color: 'var(--text)' }}
          >
            Export JSON
          </button>
          <button
            type="button"
            disabled={logs.length === 0}
            onClick={onClearLogs}
            className="danger-btn"
            style={{ flex: '0 0 auto', padding: '11px 14px' }}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
            RECORDS ({recentLogs.length})
          </span>
          <select
            aria-label="Filter protocol"
            value={filterProto}
            onChange={(e) => setFilterProto(e.target.value)}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '6px 8px',
              color: 'var(--text)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
            }}
          >
            <option value="ALL">All Protocols</option>
            <option value="NEC">NEC</option>
            <option value="SONY_SIRC">Sony SIRC</option>
            <option value="SAMSUNG32">Samsung32</option>
            <option value="RC5">RC5</option>
            <option value="DAIKIN_HVAC">Daikin</option>
            <option value="RAW">Raw</option>
          </select>
        </div>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {recentLogs.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              No transmissions logged yet.
            </div>
          ) : (
            recentLogs.slice(0, 60).map((r) => (
              <div
                key={r.id}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    #{r.seq} {r.commandLabel}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                    {r.presetName} · {r.protocol} · {r.codec === 'binary' ? '8B' : 'JSON'} ({r.backendOverheadUs}us)
                  </div>
                </div>
                <div className="tabular-nums" style={{ textAlign: 'right', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.status === 'DROP' ? 'var(--danger)' : 'var(--text)' }}>
                    {r.status === 'DROP' ? 'DROP' : `${r.totalLatencyMs.toFixed(2)} ms`}
                  </div>
                  <div style={{ fontSize: 10, color: r.status === 'ACK' ? 'var(--ok)' : r.status === 'WARN' ? 'var(--accent)' : 'var(--danger)' }}>
                    {r.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
