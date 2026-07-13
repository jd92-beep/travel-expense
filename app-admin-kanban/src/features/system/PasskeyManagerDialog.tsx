import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, ShieldCheck, TriangleAlert, X } from "lucide-react";

import {
  addBossPasskey,
  AdminApiError,
  listAdminPasskeys,
  previewBossPasskeyRemoval,
  removeBossPasskey,
  type AdminPasskey,
  type AdminPasskeyRemovalPreview,
} from "../../lib/adminApi";
import { formatDateTime, StatusBadge } from "../../components/primitives/ConsolePrimitives";
import { supportsR2Passkey } from "../../lib/interaction";
import { useAdminSession } from "../../app/session";

export function PasskeyManagerDialog({
  open,
  onClose,
  restoreFocus,
}: {
  open: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [label, setLabel] = useState("Boss backup device");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [removalPreview, setRemovalPreview] = useState<AdminPasskeyRemovalPreview | null>(null);
  const [passkeyAction, setPasskeyAction] = useState<"add" | "remove">("add");
  const { setSession } = useAdminSession();
  const query = useQuery({
    queryKey: ["admin", "passkeys"],
    queryFn: listAdminPasskeys,
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!open) {
      setPassphrase("");
      setError(null);
      setSuccess("");
      setRemovalPreview(null);
      setPasskeyAction("add");
    }
  }, [open]);

  const state = query.data;
  const supportsPasskey = supportsR2Passkey();
  const atLimit = Boolean(state && state.count >= state.max);
  const submit = async () => {
    if (!supportsPasskey || !passphrase || !label.trim() || atLimit) return;
    setBusy(true);
    setError(null);
    setSuccess("");
    setPasskeyAction("add");
    try {
      const credential = await addBossPasskey(passphrase, label.trim());
      setPassphrase("");
      setSuccess(`${credential.label} 已安全加入。`);
      await query.refetch();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const previewRemoval = async (credential: AdminPasskey) => {
    if (!supportsPasskey || !credential.removal) return;
    setBusy(true);
    setError(null);
    setSuccess("");
    setPasskeyAction("remove");
    try {
      setRemovalPreview(await previewBossPasskeyRemoval(credential.removal));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const submitRemoval = async () => {
    if (!removalPreview || !passphrase || !supportsPasskey) return;
    setBusy(true);
    setError(null);
    setPasskeyAction("remove");
    try {
      await removeBossPasskey(passphrase, removalPreview);
      setSession(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const cancelRemoval = () => {
    if (busy) return;
    setRemovalPreview(null);
    setPassphrase("");
    setError(null);
    setPasskeyAction("add");
  };

  return (
    <dialog
      ref={dialogRef}
      className="passkey-dialog"
      aria-labelledby="passkey-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        onClose();
        restoreFocus();
      }}
    >
      <header>
        <div>
          <KeyRound size={20} />
          <div>
            <h2 id="passkey-dialog-title">Boss passkeys</h2>
            <small>最多三把；最後一把只可經 break-glass runbook 重設。</small>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          title="關閉"
          aria-label="關閉 passkey 管理"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="passkey-dialog-body">
        {query.isLoading
          ? (
            <div className="operation-progress" role="status">
              <LoaderCircle className="spin" size={20} />載入 passkeys
            </div>
          )
          : query.isError || !state
          ? (
            <div className="operation-error" role="alert">
              <TriangleAlert size={20} />
              <div><strong>未能載入 passkeys</strong><p>請重新整理後再試。</p></div>
            </div>
          )
          : (
            <>
              <div className="passkey-capacity">
                <StatusBadge value={atLimit ? "warning" : "active"} label={`${state.count} / ${state.max}`} />
                <span>{atLimit ? "已達安全上限" : "可加入備用 Boss device passkey"}</span>
              </div>
              <ul className="passkey-list" aria-label="已登記 passkeys">
                {state.credentials.map((credential) => (
                  <li key={credential.id}>
                    <div>
                      <strong>{credential.label}</strong>
                      <small>{credential.deviceType} · {credential.id}</small>
                    </div>
                    <div>
                      <StatusBadge
                        value={credential.backedUp ? "active" : "reported"}
                        label={credential.backedUp ? "Backed up" : "Single device"}
                      />
                      <small>Last used {formatDateTime(credential.lastUsedAt)}</small>
                    </div>
                    {supportsPasskey && state.count > 1 && !removalPreview && (
                      <button
                        className="button secondary danger-action"
                        type="button"
                        disabled={busy}
                        onClick={() => void previewRemoval(credential)}
                      >
                        移除 {credential.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!supportsPasskey
                ? (
                  <div className="operation-error" role="status">
                    <TriangleAlert size={20} />
                    <div><strong>請使用桌面版完成</strong><p>Passkey enrollment 屬於 R2 security operation。</p></div>
                  </div>
                )
                : removalPreview
                ? (
                  <div className="passkey-removal-form" role="alert">
                    <TriangleAlert size={20} />
                    <div>
                      <strong>移除 {removalPreview.target.label}</strong>
                      <p>Server 已確認此操作會保留 {removalPreview.remainingCount} 把 passkey；完成後全部 admin session 會登出。</p>
                      <label>
                        <span>Current passphrase</span>
                        <input className="passkey-removal-input" type="password" autoComplete="current-password" value={passphrase} disabled={busy} onChange={(event) => setPassphrase(event.target.value)} />
                      </label>
                    </div>
                  </div>
                )
                : !atLimit && (
                  <div className="passkey-enrollment-form">
                    <label>
                      <span>Device label</span>
                      <input value={label} maxLength={128} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
                    </label>
                    <label>
                      <span>Current passphrase</span>
                      <input type="password" autoComplete="current-password" value={passphrase} disabled={busy} onChange={(event) => setPassphrase(event.target.value)} />
                    </label>
                    <small><ShieldCheck size={14} />提交時必須再驗證現有 Boss passkey。</small>
                  </div>
                )}
              {success && <div className="integrity-ok" role="status"><ShieldCheck size={18} />{success}</div>}
              {error && (
                <div className="operation-error" role="alert">
                  <TriangleAlert size={20} />
                  <div>
                    <strong>{passkeyAction === "remove" ? "未能移除 passkey" : "未能加入 passkey"}</strong>
                    <p>{error instanceof AdminApiError ? error.message : passkeyAction === "remove" ? "Passkey removal 暫時不可用。" : "Passkey enrollment 暫時不可用。"}</p>
                    {error instanceof AdminApiError && <code>{error.code} · {error.requestId || "no-request-id"}</code>}
                  </div>
                </div>
              )}
            </>
          )}
      </div>
      <footer>
        {!removalPreview && <button className="button secondary" type="button" disabled={busy} onClick={onClose}>關閉</button>}
        {supportsPasskey && removalPreview && (
          <button className="button secondary" type="button" disabled={busy} onClick={cancelRemoval}>取消移除</button>
        )}
        {supportsPasskey && removalPreview && (
          <button className="button secondary danger-action" type="button" disabled={busy || !passphrase} onClick={() => void submitRemoval()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
            驗證並移除
          </button>
        )}
        {supportsPasskey && state && !atLimit && !removalPreview && (
          <button className="button primary" type="button" disabled={busy || !passphrase || !label.trim()} onClick={() => void submit()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            新增備用 passkey
          </button>
        )}
      </footer>
    </dialog>
  );
}
