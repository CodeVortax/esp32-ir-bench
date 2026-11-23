import React, { useRef, useState } from 'react';
import { REMOTE_PRESETS, SAMPLE_IR_FILE } from '../data/presets';
import {
  downloadPresetAsIrFile,
  downloadPresetAsIrxFile,
  parseIrFile,
  serializeToIrxFile,
} from '../lib/irFileFormat';
import type { RemotePreset } from '../types/telemetry';

interface IrStudioViewProps {
  allRemotes: RemotePreset[];
  onImportRemote: (remote: RemotePreset) => Promise<void>;
  onOpenRemote: (id: string) => void;
}

export const IrStudioView: React.FC<IrStudioViewProps> = ({
  allRemotes,
  onImportRemote,
  onOpenRemote,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [fileNameInput, setFileNameInput] = useState('Custom_TV');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const content = await file.text();
      const parsed = parseIrFile(content, file.name);
      await onImportRemote(parsed);
    } catch {
      setErrorMsg('Failed to parse .irx or .ir file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleParsePaste = async () => {
    setErrorMsg(null);
    if (!pasteText.trim()) {
      setErrorMsg('Paste .irx JSON or .ir text first.');
      return;
    }
    try {
      const isJson = pasteText.trim().startsWith('{');
      const parsed = parseIrFile(
        pasteText,
        `${fileNameInput.trim() || 'Imported'}.${isJson ? 'irx' : 'ir'}`
      );
      await onImportRemote(parsed);
      setPasteText('');
    } catch {
      setErrorMsg('Invalid .irx or .ir format.');
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".irx,.ir,.txt"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="bench-panel" style={{ marginTop: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Import .irx / .ir File</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>
          Load <code style={{ fontFamily: 'var(--mono)' }}>.irx</code> remote layouts (full button shapes, sizes, rows &amp; positions) or Flipper <code style={{ fontFamily: 'var(--mono)' }}>.ir</code> signal files.
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="primary-btn"
          >
            Choose .irx / .ir
          </button>
          <button
            type="button"
            onClick={() => setPasteText(serializeToIrxFile(REMOTE_PRESETS[0]))}
            className="ghost-btn"
            style={{ color: 'var(--text)' }}
          >
            Sample .irx
          </button>
          <button
            type="button"
            onClick={() => setPasteText(SAMPLE_IR_FILE)}
            className="ghost-btn"
            style={{ color: 'var(--text)' }}
          >
            Sample .ir
          </button>
        </div>

        {errorMsg && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--mono)' }}>
            {errorMsg}
          </div>
        )}

        <div className="field">
          <label>Remote Name (for .ir import)</label>
          <input
            type="text"
            value={fileNameInput}
            onChange={(e) => setFileNameInput(e.target.value)}
            placeholder="Living Room TV"
          />
        </div>

        <div className="field">
          <label>Or Paste .irx / .ir Contents</label>
          <textarea
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'{\n  "filetype": "IRX remote layout",\n  "version": 1,\n  "remote": { "name": "TV", ... },\n  "buttons": [ ... ]\n}'}
            style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}
          />
        </div>

        <div className="row">
          <button
            type="button"
            disabled={!pasteText.trim()}
            onClick={handleParsePaste}
            className="primary-btn"
          >
            Parse &amp; Add Remote
          </button>
        </div>
      </div>

      <div className="bench-panel">
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
          Export Remotes · .irx keeps button positions ({allRemotes.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allRemotes.map((rem) => (
            <div
              key={rem.id}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div
                onClick={() => onOpenRemote(rem.id)}
                style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {rem.emoji ? `${rem.emoji} ` : ''}{rem.name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                  {rem.protocol} · {rem.carrierKhz} kHz · {rem.buttons.length} keys
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => downloadPresetAsIrxFile(rem)}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 9,
                    padding: '8px 10px',
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#1a1006',
                    cursor: 'pointer',
                  }}
                >
                  .irx
                </button>
                <button
                  type="button"
                  onClick={() => downloadPresetAsIrFile(rem)}
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 9,
                    padding: '8px 10px',
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  .ir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
