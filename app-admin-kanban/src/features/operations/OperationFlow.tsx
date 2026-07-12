import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, LoaderCircle, Play, RefreshCw, TriangleAlert, X } from "lucide-react";

import { adminGet, adminPost } from "../../lib/api/adminClient";
import type {
  AdminOperation,
  OperationCommitData,
} from "../../lib/contracts/admin";
import { StatusBadge } from "../../components/primitives/ConsolePrimitives";
import { AdminApiError, reauthenticateAdmin } from "../../lib/adminApi";
import { supportsR2Passkey } from "../../lib/interaction";

export type OperationRequest = {
  action:
    | "provider_probe"
    | "support_bundle"
    | "retry_sync_job"
    | "cancel_sync_job"
    | "run_integrity_scan"
    | "receipt_amend"
    | "receipt_trash"
    | "receipt_restore"
    | "trip_amend"
    | "itinerary_amend"
    | "itinerary_restore"
    | "member_add"
    | "member_role"
    | "member_remove";
  targetId: string;
  payload?: Record<string, unknown>;
};

const TERMINAL_OPERATION_STATUSES = new Set([
  "completed",
  "partially_failed",
  "failed",
  "failed_manual",
  "cancelled",
  "expired",
]);

function isDefinitiveCommitRejection(error: unknown) {
  return error instanceof AdminApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status);
}

export function useOperationFlow(
  onCompleted?: (data: OperationCommitData) => void | Promise<void>,
) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<AdminOperation | null>(null);
  const [completed, setCompleted] = useState<OperationCommitData | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const commitRequestStarted = useRef(false);
  const completedOperationIds = useRef(new Set<string>());
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const applyOperationResult = useCallback(async (data: OperationCommitData) => {
    const status = data.operation.status;
    const terminal = TERMINAL_OPERATION_STATUSES.has(status);
    setOperation(data.operation);
    setCompleted(status === "completed" ? data : null);
    setOutcomeUnknown(status === "outcome_unknown");
    setTracking(!terminal);
    await queryClient.invalidateQueries({ queryKey: ["admin", "operations", "activity"] });
    if (terminal) {
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    }
    if (status === "completed" && !completedOperationIds.current.has(data.operation.id)) {
      completedOperationIds.current.add(data.operation.id);
      await onCompletedRef.current?.(data);
    }
  }, [queryClient]);

  const preview = useMutation({
    mutationFn: (request: OperationRequest) =>
      adminPost<AdminOperation>("/operations/preview", {
        action: request.action,
        idempotencyKey: crypto.randomUUID(),
        targetId: request.targetId,
        payload: request.payload ?? {},
      }),
    onSuccess: (response) => setOperation(response.data),
  });
  const commit = useMutation({
    mutationFn: async ({ operation, passphrase }: { operation: AdminOperation; passphrase: string }) => {
      let grantId: string | undefined;
      commitRequestStarted.current = false;
      if (operation.risk === "R2") {
        const grant = await reauthenticateAdmin(passphrase, {
          action: operation.action,
          previewHash: operation.previewHash,
          targetHash: operation.targetHash,
        });
        setPassphrase("");
        grantId = grant.grantId;
      }
      setSubmitted(true);
      commitRequestStarted.current = true;
      return adminPost<OperationCommitData>(`/operations/${operation.id}/commit`, {
        ...(grantId ? { grantId } : {}),
      });
    },
    onSuccess: async (response) => {
      setPassphrase("");
      await applyOperationResult(response.data);
    },
    onError: (error) => {
      if (!commitRequestStarted.current || isDefinitiveCommitRejection(error)) {
        setSubmitted(false);
        setTracking(false);
        setOutcomeUnknown(false);
        return;
      }
      setSubmitted(true);
      setTracking(true);
      setOutcomeUnknown(true);
      setOperation((current) => current
        ? {
          ...current,
          status: "outcome_unknown",
          error: {
            code: "OPERATION_UNKNOWN",
            message: "連線中斷，正在向 server 查證最終結果。",
          },
        }
        : current);
    },
  });

  const recovery = useQuery({
    queryKey: ["admin", "operation", operation?.id],
    queryFn: ({ signal }) =>
      adminGet<AdminOperation>(`/operations/${operation!.id}`, undefined, signal),
    enabled: submitted && tracking && Boolean(operation?.id),
    refetchInterval: tracking ? 10_000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!recovery.data?.data) return;
    void applyOperationResult({ operation: recovery.data.data, reused: true });
  }, [applyOperationResult, recovery.dataUpdatedAt]);

  const begin = (request: OperationRequest) => {
    preview.reset();
    commit.reset();
    setOperation(null);
    setCompleted(null);
    setPassphrase("");
    setSubmitted(false);
    setTracking(false);
    setOutcomeUnknown(false);
    commitRequestStarted.current = false;
    setOpen(true);
    preview.mutate(request);
  };
  const close = () => {
    if (preview.isPending || commit.isPending) return;
    setPassphrase("");
    setOpen(false);
  };

  return {
    begin,
    close,
    commit: () => operation && commit.mutate({ operation, passphrase }),
    commitError: outcomeUnknown ? null : commit.error,
    committing: commit.isPending,
    completed,
    outcomeUnknown,
    recovering: recovery.isFetching,
    recoveryError: recovery.error,
    refreshOperation: () => void recovery.refetch(),
    submitted,
    open,
    operation,
    passphrase,
    previewError: preview.error,
    previewing: preview.isPending,
    setPassphrase,
  };
}

export type OperationFlow = ReturnType<typeof useOperationFlow>;

function OperationError({ error }: { error: unknown }) {
  const known = error instanceof AdminApiError ? error : null;
  return (
    <div className="operation-error" role="alert">
      <TriangleAlert size={20} />
      <div>
        <strong>操作未能繼續</strong>
        <p>{known?.message || "管理員操作暫時不可用。"}</p>
        {known && <code>{known.code} · {known.requestId || "no-request-id"}</code>}
      </div>
    </div>
  );
}

export function OperationDialog({ flow }: { flow: OperationFlow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (flow.open && !dialog.open) dialog.showModal();
    if (!flow.open && dialog.open) dialog.close();
  }, [flow.open]);
  useEffect(() => setCopied(false), [flow.completed?.operation.id]);
  const requiresStepUp = flow.operation?.risk === "R2";
  const supportsPasskey = supportsR2Passkey();
  const resultUnknown = flow.outcomeUnknown || flow.operation?.status === "outcome_unknown";
  const activeAfterSubmit = flow.submitted && Boolean(flow.operation) &&
    ["previewed", "authorized", "queued", "executing", "compensating", "outcome_unknown"]
      .includes(flow.operation!.status);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog"
      aria-labelledby="operation-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        flow.close();
      }}
      onClose={flow.close}
    >
      <header>
        <div>
          <span className="risk-label">{flow.operation?.risk || "R1"}</span>
          <h2 id="operation-dialog-title">
            {flow.operation?.preview.title || "準備管理員操作"}
          </h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="關閉"
          aria-label="關閉操作"
          disabled={flow.previewing || flow.committing}
          onClick={flow.close}
        >
          <X size={18} />
        </button>
      </header>

      <div className="operation-dialog-body">
        {flow.previewing && (
          <div className="operation-progress" aria-live="polite">
            <LoaderCircle className="spin" size={22} />
            <strong>正在建立 server preview</strong>
          </div>
        )}
        {flow.previewError && <OperationError error={flow.previewError} />}
        {flow.commitError && <OperationError error={flow.commitError} />}
        {flow.operation && !flow.completed && !flow.submitted && (
          <>
            <div className="operation-summary">
              <StatusBadge value={flow.operation.status} />
              <span>{flow.operation.preview.consequence}</span>
            </div>
            {(flow.operation.preview.before !== undefined ||
              flow.operation.preview.proposed !== undefined) && (
              <div className="operation-diff" aria-label="操作前後差異">
                <section>
                  <h3>目前資料</h3>
                  <pre>{JSON.stringify(flow.operation.preview.before ?? {}, null, 2)}</pre>
                </section>
                <section>
                  <h3>提交後</h3>
                  <pre>{JSON.stringify(flow.operation.preview.proposed ?? {}, null, 2)}</pre>
                </section>
              </div>
            )}
            <dl className="operation-impact">
              <div>
                <dt>影響數量</dt>
                <dd>{flow.operation.preview.affectedCount ?? 1}</dd>
              </div>
              <div>
                <dt>目標</dt>
                <dd><code>{flow.operation.targetHash.slice(0, 12)}</code></dd>
              </div>
              <div>
                <dt>復原界線</dt>
                <dd>{flow.operation.preview.rollbackBoundary || "此操作不會改變 canonical data。"}</dd>
              </div>
              <div>
                <dt>Preview 到期</dt>
                <dd>{new Date(flow.operation.previewExpiresAt).toLocaleTimeString("zh-HK", { hour12: false })}</dd>
              </div>
            </dl>
            {requiresStepUp && (
              supportsPasskey
                ? (
                  <label className="operation-passphrase">
                    <span>Current passphrase</span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={flow.passphrase}
                      disabled={flow.committing}
                      onChange={(event) => flow.setPassphrase(event.target.value)}
                    />
                    <small>提交時會再要求 Boss device passkey。</small>
                  </label>
                )
                : (
                  <div className="operation-error" role="status">
                    <TriangleAlert size={20} />
                    <div>
                      <strong>請使用桌面版完成</strong>
                      <p>R2 canonical data 操作需要精細指標輸入嘅桌面環境。</p>
                    </div>
                  </div>
                )
            )}
          </>
        )}
        {flow.committing && (
          <div className="operation-progress" aria-live="polite">
            <LoaderCircle className="spin" size={22} />
            <strong>正在執行並驗證結果</strong>
          </div>
        )}
        {flow.completed && (
          <>
            <div className="operation-complete" role="status">
              <CheckCircle2 size={24} />
              <div>
                <strong>操作已由 server 驗證完成</strong>
                <p>Operation {flow.completed.operation.id.slice(0, 8)}</p>
              </div>
            </div>
            {flow.completed.invite && (
              <div className="invite-result">
                <label>
                  <span>一次性邀請連結</span>
                  <input readOnly value={flow.completed.invite.link} />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(flow.completed!.invite!.link)
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                >
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copied ? "已複製" : "複製連結"}
                </button>
                <small>
                  {flow.completed.invite.expiresAt
                    ? `到期：${new Date(flow.completed.invite.expiresAt).toLocaleString("zh-HK", { hour12: false })}`
                    : "連結有效期為 14 日"}
                </small>
              </div>
            )}
          </>
        )}
        {flow.submitted && !flow.committing && !flow.completed && flow.operation && (
          <div
            className={activeAfterSubmit ? "operation-progress" : "operation-error"}
            role="status"
          >
            {activeAfterSubmit
              ? <LoaderCircle className="spin" size={22} />
              : <TriangleAlert size={22} />}
            <div>
              <strong>
                {resultUnknown
                  ? "結果未確認，正在向 server 查證"
                  : activeAfterSubmit
                  ? "操作已提交，等待 server 最終狀態"
                  : "操作未完成"}
              </strong>
              <p>
                <StatusBadge value={flow.operation.status} />
                {flow.operation.error?.message
                  ? ` ${flow.operation.error.message}`
                  : " 請喺 Activity Center 追蹤或重新整理最新結果。"}
              </p>
              {flow.recoveryError && (
                <small>暫時未能讀取最新狀態；自動查詢會繼續，亦可立即重新檢查。</small>
              )}
            </div>
          </div>
        )}
      </div>

      <footer>
        {flow.completed
          ? (
            <button className="button primary" type="button" onClick={flow.close}>
              <CheckCircle2 size={16} />完成
            </button>
          )
          : flow.submitted
          ? (
            <>
              <button
                className="button secondary"
                type="button"
                disabled={flow.recovering}
                onClick={flow.refreshOperation}
              >
                <RefreshCw className={flow.recovering ? "spin" : undefined} size={16} />
                立即重新檢查
              </button>
              {resultUnknown && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    flow.close();
                    window.dispatchEvent(new Event("admin:activity-open"));
                  }}
                >
                  查看 Activity Center
                </button>
              )}
              <button className="button primary" type="button" onClick={flow.close}>
                {activeAfterSubmit ? <LoaderCircle size={16} /> : <TriangleAlert size={16} />}
                {activeAfterSubmit ? "關閉並追蹤" : "關閉"}
              </button>
            </>
          )
          : (
            <>
              <button
                className="button secondary"
                type="button"
                disabled={flow.previewing || flow.committing}
                onClick={flow.close}
              >
                取消
              </button>
              <button
                className="button primary"
                type="button"
                disabled={!flow.operation || flow.previewing || flow.committing || Boolean(flow.previewError) ||
                  (requiresStepUp && (!supportsPasskey || !flow.passphrase))}
                onClick={flow.commit}
              >
                <Play size={16} />{requiresStepUp ? "驗證並執行" : "確認執行"}
              </button>
            </>
          )}
      </footer>
    </dialog>
  );
}
