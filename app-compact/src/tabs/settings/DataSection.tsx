import { AlertTriangle, Cloud, Copy, Download, KeyRound, RotateCcw, Server, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { migrateAppState, scopedReceiptsForTrip } from '../../domain/trip/normalize';
import {
  redactedError,
} from '../../lib/credentialBroker';
import { downloadJson, exportCsv } from '../../lib/domain';
import {
  pushBackupSnapshot,
} from '../../lib/notion';
import { notionMirrorGuardMessage } from '../../lib/notionAccess';
import type { AppState, SyncEngineState } from '../../lib/types';
import { clearCredentialSession, stripPortableBackupState } from '../../lib/storage';
import { clearDeviceTrust } from '../../security/deviceTrust';
import { clearTrustedDevice } from '../../security/trustedDevice';
import { type SettingsContext } from './shared';
import { validateBackupSchema, buildBackupImportPreview, type BackupImportPreview } from './backup';
import { buildTripSharePreview, buildDiagnosticsPreview, formatMoney, type TripSharePreview, type DiagnosticsPreview } from './reports';

export function DataSection({ ctx, syncState, storageScope, brokerReady, notionMirrorReady, onReset }: { ctx: SettingsContext; syncState?: SyncEngineState; storageScope: string; brokerReady: boolean; notionMirrorReady: boolean; onReset: () => void }) {
  const { state, setState, updateState, busy, setBusy, setStatus, copyText, persons, currentTrip, cloudSyncAvailable, userEmail, showStressPanel } = ctx;
  const [showClearLocalPreview, setShowClearLocalPreview] = useState(false);
  const [backupPreview, setBackupPreview] = useState<BackupImportPreview | null>(null);
  const [tripSharePreview, setTripSharePreview] = useState<TripSharePreview | null>(null);
  const [diagnosticsPreview, setDiagnosticsPreview] = useState<DiagnosticsPreview | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);

  const handleClearLocalData = async () => {
    setBusy('清除資料');
    setStatus('');
    try {
      await onReset();
      setShowClearLocalPreview(false);
      setStatus('已清除 React 本地紀錄、broker session、裝置信任同快取。');
    } catch (error) {
      setStatus(`清除失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  };

  function safeBackupState() {
    return stripPortableBackupState({
      ...state,
      activeTripId: currentTrip.id,
      trips: [currentTrip],
      receipts: scopedReceiptsForTrip(state, currentTrip),
    });
  }

  async function backupToNotion() {
    const guard = notionMirrorGuardMessage(state, cloudSyncAvailable, userEmail);
    if (guard) {
      setStatus(`備份到 Notion 失敗：${guard}`);
      return;
    }
    setBusy('備份到 Notion');
    setStatus('');
    try {
      const result = await pushBackupSnapshot(state, safeBackupState());
      const omitted = result.photosOmitted
        ? `，略過 ${result.photosOmitted} 張相片縮圖（相片行自己嘅 mirror）`
        : '';
      setStatus(`已備份到 Notion：${result.receipts} 筆記錄${omitted}。想要完整檔案請用「匯出 Backup」。`);
    } catch (error) {
      setStatus(`備份到 Notion 失敗：${redactedError(error)}`);
    } finally {
      setBusy('');
    }
  }

  function previewTripShareExport() {
    const preview = buildTripSharePreview(state, currentTrip, persons);
    setTripSharePreview(preview);
    setStatus(`Trip-share preview ready：${preview.payload.summary.receipts} receipts，安全預覽後可 copy/download`);
  }

  function previewDiagnosticsExport() {
    const preview = buildDiagnosticsPreview(state, currentTrip, persons, syncState, cloudSyncAvailable, notionMirrorReady, brokerReady, storageScope);
    setDiagnosticsPreview(preview);
    setStatus(`Diagnostics preview ready：${preview.payload.receipts.currentTrip} current-trip receipts，public-safe copy/download only`);
  }

  async function copyTripSharePreview() {
    if (!tripSharePreview) return;
    await copyText(tripSharePreview.copiedText, '已複製 private trip-share summary');
  }

  function downloadTripSharePreview() {
    if (!tripSharePreview) return;
    downloadJson(tripSharePreview.filename, tripSharePreview.payload);
    setStatus('已下載 private trip-share JSON');
  }

  async function copyDiagnosticsPreview() {
    if (!diagnosticsPreview) return;
    await copyText(diagnosticsPreview.copiedText, '已複製 public-safe diagnostics summary');
  }

  function downloadDiagnosticsPreview() {
    if (!diagnosticsPreview) return;
    downloadJson(diagnosticsPreview.filename, diagnosticsPreview.payload);
    setStatus('已下載 public-safe diagnostics JSON');
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Partial<AppState>;
      if (!validateBackupSchema(payload)) throw new Error('Backup JSON 格式無效或結構損壞');
      const preview = buildBackupImportPreview(file.name, payload, state, currentTrip);
      setBackupPreview(preview);
      setStatus(`Backup preview ready：${preview.receiptCount} 筆，確認後先匯入`);
    } catch (error) {
      setBackupPreview(null);
      setStatus(`Backup 匯入失敗：${redactedError(error)}`);
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  }

  function applyBackupPreview() {
    if (!backupPreview) return;
    const preview = backupPreview;
    setState((prev) => migrateAppState({
      ...prev,
      ...preview.safePayload,
      trips: preview.importedTrips || prev.trips,
      // An explicitly empty receipts array in the backup must win — keeping prev.receipts
      // would silently re-attach other-trip rows to the restored trips (partial restore).
      // Only when the file has no receipts key at all do we leave local receipts alone.
      receipts: preview.receiptsProvided || preview.receipts.length ? preview.receipts : prev.receipts,
      // Restore contract: activeTripId must reference an imported/existing trip — never an
      // unknown foreign id from the backup file.
      activeTripId: preview.nextActiveTripId || prev.activeTripId,
    }));
    setBackupPreview(null);
    setStatus(`已匯入 backup：${preview.receiptCount} 筆`);
  }

  function cancelBackupPreview() {
    setBackupPreview(null);
    if (backupInput.current) backupInput.current.value = '';
    setStatus('已取消 backup 匯入，未有改動本地資料');
  }

  return (
    <>
    <AccordionCard id="settings-data" title="資料管理" icon={<ShieldCheck />} defaultOpen={false}>
      <input ref={backupInput} hidden type="file" accept="application/json,.json" onChange={(e) => importBackup(e.target.files?.[0])} />
      <div className="action-row wrap">
        <button className="secondary" type="button" onClick={() => exportCsv(state)}><Download size={18} /> 匯出 CSV</button>
        <button className="secondary" type="button" onClick={() => downloadJson(`${currentTrip.name || 'travel-expense'}-backup.json`, safeBackupState())}><Download size={18} /> 匯出 Backup</button>
        <button className="secondary" type="button" disabled={!!busy} onClick={backupToNotion}><Upload size={18} /> 備份到 Notion</button>
        <button className="secondary" type="button" onClick={() => backupInput.current?.click()}><Upload size={18} /> 匯入 Backup</button>
      </div>
      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(0,0,0,.12)' }}>
        <p className="muted" style={{ margin: '0 0 0.4rem' }}>不可逆操作</p>
        <div className="action-row wrap">
          <button className="danger" type="button" disabled={!!busy} onClick={() => setShowClearLocalPreview(true)}><RotateCcw size={18} /> 清除本地資料</button>
        </div>
      </div>
      {showStressPanel && (<div className="action-row wrap" style={{ marginTop: '0.5rem' }}>
        <button className="secondary" type="button" onClick={previewTripShareExport}><Copy size={18} /> Preview trip share</button>
        <button className="secondary" type="button" onClick={previewDiagnosticsExport}><ShieldCheck size={18} /> Preview diagnostics</button>
        <button className="danger" type="button" onClick={() => { clearCredentialSession(); updateState({ credentialSession: '', credentialSessionExpiresAt: 0 }); }}><KeyRound size={18} /> 清除 broker session</button>
        <button className="danger" type="button" onClick={() => { clearDeviceTrust(); void clearTrustedDevice(); clearCredentialSession(); updateState({ credentialSession: '', credentialSessionExpiresAt: 0 }); setStatus('已清除此裝置信任，下次開 app 會重新鎖定。'); }}><ShieldCheck size={18} /> 清除裝置信任</button>
      </div>)}
      {showStressPanel && tripSharePreview && (
        <div className="settings-trip-share-preview" role="region" aria-label="Private trip-share preview">
          <div className="settings-restore-preview-head">
            <span><ShieldCheck size={15} /> Private trip-share preview</span>
            <strong>{tripSharePreview.payload.summary.receipts} receipt{tripSharePreview.payload.summary.receipts === 1 ? '' : 's'}</strong>
          </div>
          <div className="settings-restore-preview-grid">
            <span>
              <small>Trip</small>
              <strong>{tripSharePreview.payload.trip.name}</strong>
            </span>
            <span>
              <small>Spend</small>
              <strong>{formatMoney(tripSharePreview.payload.summary.spentHkd)}</strong>
            </span>
            <span>
              <small>Days</small>
              <strong>{tripSharePreview.payload.trip.days}</strong>
            </span>
          </div>
          <pre className="settings-trip-share-copy">{tripSharePreview.copiedText}</pre>
          <div className="settings-restore-preview-warnings">
            {tripSharePreview.payload.safety.stripped.map((warning) => (
              <span key={warning}><ShieldCheck size={13} /> {warning}</span>
            ))}
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" onClick={() => void copyTripSharePreview()}><Copy size={16} /> Copy summary</button>
            <button className="secondary" type="button" onClick={downloadTripSharePreview}><Download size={16} /> Download safe JSON</button>
            <button className="secondary" type="button" onClick={() => { setTripSharePreview(null); setStatus('已關閉 trip-share preview'); }}>Close preview</button>
          </div>
        </div>
      )}
      {showStressPanel && diagnosticsPreview && (
        <div className="settings-trip-share-preview" role="region" aria-label="Public diagnostics preview">
          <div className="settings-restore-preview-head">
            <span><ShieldCheck size={15} /> Public diagnostics preview</span>
            <strong>{diagnosticsPreview.payload.receipts.currentTrip} receipt{diagnosticsPreview.payload.receipts.currentTrip === 1 ? '' : 's'}</strong>
          </div>
          <div className="settings-restore-preview-grid">
            <span>
              <small>Surface</small>
              <strong>{diagnosticsPreview.payload.app.surface}</strong>
            </span>
            <span>
              <small>Sync</small>
              <strong>{diagnosticsPreview.payload.sync.queuePending} pending</strong>
            </span>
            <span>
              <small>Quality</small>
              <strong>{diagnosticsPreview.payload.receipts.pendingOcr + diagnosticsPreview.payload.receipts.missingPayer + diagnosticsPreview.payload.receipts.syncErrors} checks</strong>
            </span>
          </div>
          <pre className="settings-trip-share-copy">{diagnosticsPreview.copiedText}</pre>
          <div className="settings-restore-preview-warnings">
            {diagnosticsPreview.payload.safety.stripped.map((warning) => (
              <span key={warning}><ShieldCheck size={13} /> {warning}</span>
            ))}
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" onClick={() => void copyDiagnosticsPreview()}><Copy size={16} /> Copy diagnostics</button>
            <button className="secondary" type="button" onClick={downloadDiagnosticsPreview}><Download size={16} /> Download diagnostics JSON</button>
            <button className="secondary" type="button" onClick={() => { setDiagnosticsPreview(null); setStatus('已關閉 diagnostics preview'); }}>Close preview</button>
          </div>
        </div>
      )}
      {backupPreview && (
        <div className="settings-restore-preview" role="region" aria-label="Backup restore preview">
          <div className="settings-restore-preview-head">
            <span><Upload size={15} /> Restore preview</span>
            <strong>{backupPreview.receiptCount} receipt{backupPreview.receiptCount === 1 ? '' : 's'}</strong>
          </div>
          <div className="settings-restore-preview-grid">
            <span>
              <small>File</small>
              <strong>{backupPreview.fileName}</strong>
            </span>
            <span>
              <small>Trips</small>
              <strong>{backupPreview.tripCount || 'Current trip'}</strong>
            </span>
            <span>
              <small>Target</small>
              <strong>{backupPreview.targetTripName}</strong>
            </span>
          </div>
          <div className="settings-restore-preview-warnings">
            {backupPreview.warnings.map((warning) => (
              <span key={warning}><ShieldCheck size={13} /> {warning}</span>
            ))}
          </div>
          <div className="action-row wrap">
            <button className="primary" type="button" onClick={applyBackupPreview}><Upload size={16} /> Apply backup</button>
            <button className="secondary" type="button" onClick={cancelBackupPreview}>Cancel import</button>
          </div>
        </div>
      )}
      {showStressPanel && (<details className="settings-maintainer-release-note" aria-label="Maintainer deploy recovery note">
        <summary>
          <span><Server size={15} /> Maintainer deploy recovery</span>
          <strong>Quota-safe</strong>
        </summary>
        <div className="settings-maintainer-release-grid">
          <span>
            <small>Source of truth</small>
            <strong>Compact production</strong>
          </span>
          <span>
            <small>Live proof</small>
            <strong>smoke:deploy-live</strong>
          </span>
          <span>
            <small>Deploy path</small>
            <strong>Vercel + Netlify</strong>
          </span>
        </div>
        <p>For maintainers only: Compact production is deployed to both Vercel and Netlify from GitHub `main`. Treat local release gates as latest code, but do not call it live until both Compact production URLs pass live proof.</p>
        <div className="settings-restore-preview-warnings">
          <span><Cloud size={13} /> Retry Netlify: gh workflow run "Deploy Compact to Netlify" --ref main</span>
          <span><Cloud size={13} /> Vercel: GitHub-connected project travel-expense-compact auto-deploys main</span>
          <span><ShieldCheck size={13} /> Verify: npm run smoke:deploy-live</span>
          <span><AlertTriangle size={13} /> Never paste API keys, tokens, sessions, or account secrets into deploy notes.</span>
        </div>
      </details>)}
      <div className="settings-backup-safety" aria-label="Backup safety scope">
        <span><ShieldCheck size={15} /> CSV / Backup JSON 只包含目前旅程，不會匯出其他旅程紀錄。</span>
        <span><KeyRound size={15} /> Backup 不包含 API key、Notion token、broker session 或解鎖 secret。</span>
        <span><AlertTriangle size={15} /> 匯入 Backup 時會丟棄外部 cloud IDs、sync queue、舊 Trip links 同 credential 欄位。</span>
      </div>
    </AccordionCard>

    {showClearLocalPreview && (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Clear local data preview"
        onClick={() => setShowClearLocalPreview(false)}
        style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
      >
        <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
          <div className="settings-warning-icon">
            <AlertTriangle size={30} />
          </div>
          <h2>清除本地資料前預覽</h2>
          <p>
            將會清除此裝置嘅 React 本地紀錄、broker session、裝置信任同快取。
          </p>
          <div className="settings-restore-preview-grid">
            <span>
              <small>Current trip</small>
              <strong>{currentTrip.name || state.tripName || 'Current trip'}</strong>
            </span>
            <span>
              <small>Local receipts</small>
              <strong>{scopedReceiptsForTrip(state, currentTrip).length}</strong>
            </span>
            <span>
              <small>Cloud data</small>
              <strong>Not deleted</strong>
            </span>
          </div>
          <p className="muted">
            Supabase / Notion 雲端資料不會刪除；重新登入或 pull cloud 後可以再同步。建議先匯出 Backup JSON 或 private trip-share。
          </p>
          <div className="modal-actions">
            <button className="secondary" type="button" disabled={!!busy} onClick={() => setShowClearLocalPreview(false)}>
              Cancel clear
            </button>
            <button className="danger" type="button" disabled={!!busy} onClick={() => void handleClearLocalData()}>
              <Trash2 size={18} /> Confirm local clear
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
