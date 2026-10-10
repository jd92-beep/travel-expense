import type { Session } from '@supabase/supabase-js';
import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../../lib/domain';
import { loadReceiptExportPhoto } from '../../lib/receiptExportPhotos';
import { buildTripArchive } from '../../lib/tripExport';
import type { SettingsContext } from './shared';

export function ExportDownloads({ ctx, session }: { ctx: SettingsContext; session: Session | null }) {
  const { state, currentTrip, busy, setBusy, setStatus } = ctx;
  const [includeImages, setIncludeImages] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    setResultMessage('');
    return () => { active.current?.abort(); };
  }, [currentTrip.id, session?.user.id]);

  async function exportTrip() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy('匯出旅程');
    setResultMessage('');
    setProgress('正在整理資料…');
    try {
      const result = await buildTripArchive(state, {
        includeImages,
        signal: controller.signal,
        loadPhoto: (receipt, signal) => loadReceiptExportPhoto(session, receipt, signal),
        onProgress: (done, total) => setProgress(includeImages ? `正在整理收據圖片 ${done} / ${total}` : '正在整理資料…'),
      });
      controller.signal.throwIfAborted();
      downloadBlob(result.filename, result.blob);
      const images = result.photos.filter((photo) => !!photo.file).length;
      const missing = result.photos.filter((photo) => photo.status === 'missing').length;
      const thumbs = result.photos.filter((photo) => photo.status === 'thumbnail').length;
      const message = `已準備 ZIP 下載：${result.receiptCount} 筆紀錄${includeImages ? `、${images} 張圖片${thumbs ? `（${thumbs} 張只有縮圖）` : ''}${missing ? `；${missing} 張未能下載，詳見圖片清單` : ''}` : '，不含收據圖片'}。請在裝置下載項目查看。`;
      setResultMessage(message);
      setStatus(message);
    } catch {
      const message = controller.signal.aborted ? '已取消匯出，未產生下載檔案。' : '匯出失敗；請重試或先下載 CSV / Backup JSON。';
      setResultMessage(message);
      setStatus(message);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy('');
        setProgress('');
      }
    }
  }

  return <div className="settings-export-downloads" role="region" aria-label="下載旅程資料">
    <strong>下載旅程資料</strong>
    <p className="muted">目前旅程：{currentTrip.name}。ZIP 內含旅程報告、開支／品項／分帳／行程 CSV，以及可匯入的 JSON 備份。</p>
    <label className="settings-export-photo-choice">
      <input type="checkbox" checked={includeImages} disabled={!!busy} onChange={(event) => setIncludeImages(event.target.checked)} />
      <span>連同收據圖片下載<small>不勾選就只下載資料；圖片會放在獨立資料夾，並附對照清單。</small></span>
    </label>
    <p className="muted">解壓 ZIP 後開啟 summary.html 閱讀報告，或用 Excel／Numbers 開啟 CSV。只有縮圖或圖片未能下載時會列明；還原 JSON 只還原文字資料。</p>
    <div className="action-row wrap">
      <button className="primary" type="button" disabled={!!busy} onClick={() => void exportTrip()}><Download size={18} />{includeImages ? '下載資料及收據圖片 ZIP' : '下載資料 ZIP'}</button>
      {active.current && <button className="secondary" type="button" onClick={() => active.current?.abort()}><X size={16} />取消匯出</button>}
    </div>
    <p className="settings-export-status" role="status" aria-live="polite">{progress || resultMessage}</p>
  </div>;
}
