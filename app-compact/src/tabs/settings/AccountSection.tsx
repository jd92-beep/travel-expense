import { AlertTriangle, KeyRound, LogOut, Trash2, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import {
  redactedError,
} from '../../lib/credentialBroker';
import {
  archiveReceipt,
  notionFetch,
} from '../../lib/notion';
import { GlassCard } from '../../components/ui';
import { type SettingsContext } from './shared';

export function AccountSection({ ctx, updatePassword, onSignOut, onSignOutClick, onClearDeviceData, onReset, deleteUserAccount }: { ctx: SettingsContext; updatePassword?: (password: string) => Promise<void>; onSignOut?: () => Promise<void> | void; onSignOutClick: () => Promise<void>; onClearDeviceData?: () => Promise<void> | void; onReset: () => void; deleteUserAccount: () => Promise<void> }) {
  const { state, busy, setBusy, setStatus, cloudSyncAvailable, userEmail } = ctx;
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showClearDeviceConfirm, setShowClearDeviceConfirm] = useState(false);
  const [deleteConfirmEmailInput, setDeleteConfirmEmailInput] = useState('');
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const handleUpdatePassword = async () => {
    if (!updatePassword || newPasswordInput.length < 6) return;
    setBusy('設定密碼');
    setStatus('');
    try {
      await updatePassword(newPasswordInput);
      setStatus('成功喺雲端為你嘅帳號設定密碼！以後喺新裝置可以直接用呢個密碼登入 🔑');
      setNewPasswordInput('');
    } catch (err) {
      setStatus(`設定密碼失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleClearDeviceAndSignOut = async () => {
    if (!onClearDeviceData || !onSignOut) return;
    setBusy('清除裝置資料');
    setStatus('');
    try {
      await onClearDeviceData();
      await onSignOut();
      setShowClearDeviceConfirm(false);
      // In-memory state still holds the wiped data and the persistence effect would write it
      // straight back — reload so the wipe actually sticks (same pattern as delete-account).
      setTimeout(() => { window.location.reload(); }, 300);
    } catch (err) {
      setStatus(`清除裝置資料失敗：${redactedError(err)}`);
    } finally {
      setBusy('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!onClearDeviceData || !onReset) {
      setDeleteAccountError('缺少必要參數，無法刪除帳戶。');
      return;
    }
    setBusy('永久刪除帳戶');
    setStatus('');
    setDeleteAccountError('');
    try {
      // 1. Notion best-effort 歸檔（只處理私有旅程）
      const privateTrips = (state.trips || []).filter(
        t => t.supabaseId && t.sharing?.role === 'owner' && !t.sharing?.isShared
      );
      for (const trip of privateTrips) {
        if (trip.notionPageId) {
          const notionState = { ...state, activeTripId: trip.id };
          await notionFetch(notionState, `/pages/${trip.notionPageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ archived: true })
          }).catch((e: any) => console.warn('[Notion] archive trip failed:', e));
          const receipts = state.receipts.filter(r => r.tripId === trip.id && r.notionPageId);
          for (const receipt of receipts) {
            await archiveReceipt(state, receipt).catch((e: any) => console.warn('[Notion] archive receipt failed:', e));
          }
        }
      }

      // 2. 呼叫 Supabase 註銷 RPC（會刪除 auth.users，共享旅程自動轉移擁有權）
      await deleteUserAccount();

      // 3. 清理本地所有資料 + 重設 app 狀態
      await onClearDeviceData();
      await onReset();

      // 4. 關閉 modal 並強制重新載入（確保 auth gate 重新評估）
      setShowDeleteAccountConfirm(false);
      setDeleteConfirmEmailInput('');
      setStatus('帳戶及私有資料已永久刪除 💨');

      // 強制重新載入確保 auth 狀態同步
      setTimeout(() => { window.location.reload(); }, 300);
    } catch (err) {
      console.error('[DeleteAccount]', err);
      const msg = err instanceof Error ? err.message : '刪除帳戶失敗，請重試';
      setDeleteAccountError(msg);
      setStatus(msg);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
    {cloudSyncAvailable && updatePassword && (
      <AccordionCard id="settings-supabase-account" eyebrow="帳號" title="雲端帳號與密碼設定" icon={<KeyRound />} defaultOpen={false}>
        <div className="settings-auth-layout">
          <GlassCard className="settings-account-card">
            <div className="settings-account-copy">
              <strong>{userEmail || 'Supabase 帳號'}</strong>
            </div>
            <div className="settings-account-actions">
              {onSignOut && (
                <button className="secondary" type="button" disabled={!!busy} onClick={() => {
                  if (window.confirm('確定要登出帳號？')) void onSignOutClick();
                }} aria-label="登出 Supabase">
                  <LogOut size={18} /> 登出
                </button>
              )}
            </div>
          </GlassCard>
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(0,0,0,.12)' }}>
            <p className="muted" style={{ margin: '0 0 0.4rem' }}>不可逆操作</p>
            <div className="settings-account-actions">
              {onClearDeviceData && onSignOut && (
                <button className="danger" type="button" disabled={!!busy} onClick={() => setShowClearDeviceConfirm(true)} aria-label="清除此裝置資料並登出 Supabase">
                  <Trash2 size={18} /> 清除此裝置資料
                </button>
              )}
              {onClearDeviceData && onSignOut && (
                <button className="danger settings-danger-solid" type="button" disabled={!!busy} onClick={() => setShowDeleteAccountConfirm(true)} aria-label="永久刪除帳戶">
                  <UserMinus size={18} /> 永久刪除帳戶
                </button>
              )}
            </div>
          </div>
          <div className="settings-password-panel">
            <label>
              <span>新密碼</span>
              <input
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="最少 6 位"
              />
            </label>
            <button
              className="primary"
              type="button"
              disabled={!!busy || newPasswordInput.length < 6}
              onClick={() => void handleUpdatePassword()}
            >
              儲存密碼
            </button>
          </div>
        </div>
      </AccordionCard>
    )}

    {showClearDeviceConfirm && (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="清除此裝置資料"
        onClick={() => setShowClearDeviceConfirm(false)}
        style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
      >
        <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
          <div className="settings-warning-icon">
            <AlertTriangle size={30} />
          </div>
          <h2>清除此裝置資料？</h2>
          <p>
            會清除此帳號喺本機嘅快取資料、裝置信任同 IndexedDB snapshot，然後登出 Supabase。
          </p>
          <p className="muted">
            雲端 Supabase / Notion 資料不會刪除；下次登入會重新由雲端同步。
          </p>
          <div className="modal-actions">
            <button className="secondary" type="button" disabled={!!busy} onClick={() => setShowClearDeviceConfirm(false)}>
              取消
            </button>
            <button className="danger" type="button" disabled={!!busy} onClick={() => void handleClearDeviceAndSignOut()}>
              <Trash2 size={18} /> 確認清除並登出
            </button>
          </div>
        </div>
      </div>
    )}

    {showDeleteAccountConfirm && (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="永久刪除帳戶"
        onClick={() => {
          setShowDeleteAccountConfirm(false);
          setDeleteConfirmEmailInput('');
        }}
        style={{ placeItems: 'center', zIndex: 9999, padding: '20px 20px max(110px, env(safe-area-inset-bottom))' }}
      >
        <div className="modal settings-clear-device-modal" onClick={(event) => event.stopPropagation()}>
          <div className="settings-warning-icon" style={{ color: '#dc2626' }}>
            <AlertTriangle size={30} />
          </div>
          <h2>⚠️ 永久刪除帳戶及資料？</h2>
          <p style={{ color: '#dc2626', fontWeight: 600 }}>
            呢個操作係絕對無得撤銷嘅！
          </p>
          <p>
            如果確認，你嘅 Supabase 帳號、所有個人設定、未共享嘅私有旅程以及相關消費紀錄都會被徹底刪除。
          </p>
          <p className="muted" style={{ fontSize: '12px' }}>
            💡 對於同其他人共享緊嘅旅程，相關嘅 Supabase 同 Notion 數據將會被保留，等其他成員仲可以繼續存取 shared trip 資訊。
          </p>
          {deleteAccountError && (
            <p style={{ color: '#dc2626', fontWeight: 600, fontSize: '13px', background: 'rgba(220,38,38,0.08)', padding: '8px 12px', borderRadius: '8px', marginTop: '8px' }}>
              ❌ {deleteAccountError}
            </p>
          )}
          <div style={{ marginTop: '12px', width: '100%' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 800, color: '#374151', textAlign: 'left' }}>
              請輸入你嘅 Email 帳號以確認刪除:
              <input
                type="text"
                value={deleteConfirmEmailInput}
                onChange={(e) => setDeleteConfirmEmailInput(e.target.value)}
                placeholder={userEmail || ''}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button className="secondary" type="button" disabled={!!busy} onClick={() => {
              setShowDeleteAccountConfirm(false);
              setDeleteConfirmEmailInput('');
            }}>
              取消
            </button>
            <button
              className="danger"
              type="button"
              disabled={!!busy || deleteConfirmEmailInput.trim().toLowerCase() !== (userEmail || '').trim().toLowerCase()}
              onClick={() => void handleDeleteAccount()}
            >
              <Trash2 size={18} /> 確認永久刪除帳戶
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
