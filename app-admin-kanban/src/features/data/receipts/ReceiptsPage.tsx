import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CircleX,
  Download,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { adminGet, queryFromSearchParams } from "../../../lib/api/adminClient";
import type {
  AdminMeta,
  PagedData,
  ReceiptRow,
} from "../../../lib/contracts/admin";
import {
  OperationDialog,
  useOperationFlow,
} from "../../operations/OperationFlow";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  formatMoney,
  FreshnessBanner,
  adminMetaAllowsMutation,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  useCursorPagination,
  useOnline,
  WorkspaceNav,
} from "../../../components/primitives/ConsolePrimitives";

const DATA_NAV = [
  { to: "/data/accounts", label: "帳戶" },
  { to: "/data/trips", label: "行程" },
  { to: "/data/receipts", label: "收據" },
];

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadReceiptCsv(receipts: ReceiptRow[]) {
  const columns: Array<[string, (receipt: ReceiptRow) => unknown]> = [
    ["id", (receipt) => receipt.id],
    ["date", (receipt) => receipt.record_date],
    ["time", (receipt) => receipt.record_time],
    ["store", (receipt) => receipt.store],
    ["trip", (receipt) => receipt.trip_name],
    ["owner", (receipt) => receipt.owner_masked_email],
    ["amount", (receipt) => receipt.amount],
    ["currency", (receipt) => receipt.currency],
    ["record_kind", (receipt) => receipt.record_kind],
    ["visibility", (receipt) => receipt.visibility],
    ["notion_status", (receipt) => receipt.notion_sync_status],
    ["updated_at", (receipt) => receipt.updated_at],
  ];
  const csv = [
    columns.map(([name]) => csvCell(name)).join(","),
    ...receipts.map((receipt) =>
      columns.map(([, value]) => csvCell(value(receipt))).join(",")
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `admin-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ReceiptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const queryText = searchParams.get("q") || "";
  const [draft, setDraft] = useState(queryText);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionNotice, setSelectionNotice] = useState("");
  useEffect(() => setDraft(queryText), [queryText]);
  const selectionScope = searchParams.toString();
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.length > 0) setSelectionNotice("篩選或頁面已變更，已清除選取");
      return [];
    });
  }, [selectionScope]);
  const queryValues = queryFromSearchParams(searchParams, [
    "q",
    "tripId",
    "ownerId",
    "visibility",
    "recordKind",
    "trash",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "receipts", queryValues],
    queryFn: ({ signal }) =>
      adminGet<PagedData<ReceiptRow>>("/receipts", queryValues, signal),
    placeholderData: keepPreviousData,
  });
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  }
  const pageReceipts = query.data?.data.items || [];
  const selectedSet = new Set(selectedIds);
  const selectedReceipts = pageReceipts.filter((receipt) => selectedSet.has(receipt.id));
  const allPageSelected = pageReceipts.length > 0 && pageReceipts.every((receipt) =>
    selectedSet.has(receipt.id)
  );
  return (
    <div className="workspace-stack">
      <WorkspaceNav items={DATA_NAV} />
      <PageHeader
        title="收據"
        description="收據完整性、同步、可見範圍、照片及 30 日 Trash"
        actions={
          <button
            className="button secondary"
            type="button"
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={query.isFetching ? "spin" : ""}
              size={16}
            />更新
          </button>
        }
      />
      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter("q", draft.trim());
        }}
      >
        <label className="filter-search">
          <Search size={16} />
          <span className="sr-only">搜尋收據</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜尋商戶、行程或 UUID"
          />
        </label>
        <select
          aria-label="可見範圍"
          value={searchParams.get("visibility") || ""}
          onChange={(event) => setFilter("visibility", event.target.value)}
        >
          <option value="">全部可見範圍</option>
          <option value="trip">Trip</option>
          <option value="private">Private</option>
        </select>
        <select
          aria-label="記錄種類"
          value={searchParams.get("recordKind") || ""}
          onChange={(event) => setFilter("recordKind", event.target.value)}
        >
          <option value="">全部種類</option>
          <option value="expense">Expense</option>
          <option value="settlement">Settlement</option>
        </select>
        <select
          aria-label="Trash"
          value={searchParams.get("trash") || "active"}
          onChange={(event) => setFilter("trash", event.target.value)}
        >
          <option value="active">Active</option>
          <option value="trash">Trash</option>
          <option value="all">全部</option>
        </select>
        <select
          aria-label="每頁筆數"
          value={searchParams.get("limit") || "50"}
          onChange={(event) => setFilter("limit", event.target.value)}
        >
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
          <option value="200">200 / page</option>
        </select>
        <button className="button primary" type="submit">
          <Search size={16} />搜尋
        </button>
      </form>
      {query.isLoading
        ? <LoadingState label="載入收據" />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
              placeholder={query.isPlaceholderData}
            />
            {selectedReceipts.length > 0 && (
              <div className="selection-bar" role="status" aria-label="選取狀態">
                <strong>已選 {selectedReceipts.length} 項</strong>
                <span>只包含目前已載入頁面，最多 200 項</span>
                <button
                  className="button secondary"
                  type="button"
                  aria-label="匯出已選 CSV"
                  disabled={query.isFetching || query.isPlaceholderData}
                  onClick={() => downloadReceiptCsv(selectedReceipts)}
                >
                  <Download size={16} />匯出 CSV
                </button>
              </div>
            )}
            {selectionNotice && selectedReceipts.length === 0 && (
              <div className="selection-notice" role="status" aria-label="選取狀態">
                {selectionNotice}
              </div>
            )}
            <section className="data-section">
              <header>
                <div>
                  <h2>收據清單</h2>
                  <p>
                    {query.data.meta.total ?? query.data.data.items.length}{" "}
                    個結果；清單不載入 notes、地址、items 或 storage path
                  </p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="收據資料表"
                  >
                    <table>
                      <caption className="sr-only">收據清單</caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            <input
                              type="checkbox"
                              aria-label="選取全部本頁收據"
                              checked={allPageSelected}
                              disabled={query.isFetching || query.isPlaceholderData}
                              onChange={(event) => {
                                setSelectionNotice("");
                                setSelectedIds(event.target.checked
                                  ? pageReceipts.slice(0, 200).map((receipt) => receipt.id)
                                  : []);
                              }}
                            />
                          </th>
                          <th scope="col">狀態</th>
                          <th scope="col">日期</th>
                          <th scope="col">商戶</th>
                          <th scope="col">行程</th>
                          <th scope="col">Owner</th>
                          <th scope="col">金額</th>
                          <th scope="col">種類</th>
                          <th scope="col">可見</th>
                          <th scope="col">Notion</th>
                          <th scope="col">照片</th>
                          <th scope="col">更新</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((receipt) => (
                          <tr key={receipt.id}>
                            <td data-label="選取">
                              <input
                                type="checkbox"
                                aria-label={`選取收據 ${receipt.store}`}
                                checked={selectedSet.has(receipt.id)}
                                disabled={query.isFetching || query.isPlaceholderData}
                                onChange={(event) => {
                                  setSelectionNotice("");
                                  setSelectedIds((current) => event.target.checked
                                    ? current.includes(receipt.id)
                                      ? current
                                      : [...current, receipt.id].slice(0, 200)
                                    : current.filter((id) => id !== receipt.id));
                                }}
                              />
                            </td>
                            <td data-label="狀態">
                              <StatusBadge value={receipt.integrity_status} />
                            </td>
                            <td data-label="日期">
                              {receipt.record_date}
                              <small>{receipt.record_time || ""}</small>
                            </td>
                            <td data-label="商戶">
                              <Link
                                className="entity-link"
                                to={`/data/receipts/${receipt.id}`}
                              >
                                {receipt.store}
                              </Link>
                              <small>
                                <code>{receipt.id.slice(0, 8)}</code>
                              </small>
                            </td>
                            <td data-label="行程">
                              <Link
                                className="text-link"
                                to={`/data/trips/${receipt.trip_id}`}
                              >
                                {receipt.trip_name ||
                                  receipt.trip_id.slice(0, 8)}
                              </Link>
                            </td>
                            <td data-label="Owner">
                              {receipt.owner_masked_email}
                            </td>
                            <td data-label="金額">
                              {formatMoney(receipt.amount, receipt.currency)}
                            </td>
                            <td data-label="種類">{receipt.record_kind}</td>
                            <td data-label="可見">
                              <StatusBadge value={receipt.visibility} />
                            </td>
                            <td data-label="Notion">
                              <StatusBadge value={receipt.notion_sync_status} />
                            </td>
                            <td data-label="照片">
                              {receipt.has_photo
                                ? <Camera size={17} aria-label="有照片" />
                                : "—"}
                            </td>
                            <td data-label="更新">
                              {formatDateTime(receipt.updated_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
                : (
                  <EmptyState
                    title={searchParams.toString()
                      ? "沒有符合篩選條件的收據"
                      : "目前沒有收據"}
                  />
                )}
            </section>
            <Pagination
              hasCursor={cursorPager.hasCursor}
              nextCursor={query.data.meta.nextCursor}
              disabled={query.isFetching || query.isPlaceholderData}
              onPrevious={cursorPager.previous}
              onNext={cursorPager.next}
            />
          </>
        )}
    </div>
  );
}

type ReceiptDetail = {
  receipt: ReceiptRow & Record<string, unknown>;
  photo: Record<string, unknown> | null;
  syncJobs: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
};

type ReceiptAmendDraft = {
  amount: string;
  category: string;
  currency: string;
  paymentMethod: string;
  recordDate: string;
  recordKind: string;
  recordTime: string;
  store: string;
  visibility: string;
};

function receiptDraft(receipt: ReceiptDetail["receipt"]): ReceiptAmendDraft {
  return {
    amount: String(receipt.amount),
    category: receipt.category || "",
    currency: receipt.currency,
    paymentMethod: receipt.payment_method || "",
    recordDate: receipt.record_date,
    recordKind: receipt.record_kind,
    recordTime: (receipt.record_time || "").slice(0, 5),
    store: receipt.store,
    visibility: receipt.visibility,
  };
}

function receiptAmendPatch(
  receipt: ReceiptDetail["receipt"],
  draft: ReceiptAmendDraft,
) {
  const patch: Record<string, unknown> = {};
  const originalTime = (receipt.record_time || "").slice(0, 5);
  const amount = Number(draft.amount);
  if (draft.store.trim() !== receipt.store) patch.store = draft.store.trim();
  if (draft.recordDate !== receipt.record_date) patch.recordDate = draft.recordDate;
  if (draft.recordTime !== originalTime) patch.recordTime = draft.recordTime;
  if (Number.isFinite(amount) && amount !== Number(receipt.amount)) patch.amount = amount;
  if (draft.currency.trim().toUpperCase() !== receipt.currency) {
    patch.currency = draft.currency.trim().toUpperCase();
  }
  if (draft.recordKind !== receipt.record_kind) patch.recordKind = draft.recordKind;
  if (draft.visibility !== receipt.visibility) patch.visibility = draft.visibility;
  if (draft.recordKind !== "settlement" && draft.category !== (receipt.category || "")) {
    patch.category = draft.category;
  }
  if (draft.paymentMethod !== (receipt.payment_method || "")) {
    patch.paymentMethod = draft.paymentMethod;
  }
  return patch;
}

export function ReceiptDetailPage() {
  const { receiptId = "" } = useParams();
  const online = useOnline();
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ReceiptAmendDraft | null>(null);
  const query = useQuery({
    queryKey: ["admin", "receipt", receiptId],
    queryFn: ({ signal }) =>
      adminGet<ReceiptDetail>(`/receipts/${receiptId}`, undefined, signal),
    enabled: Boolean(receiptId),
  });
  const operationFlow = useOperationFlow(async () => {
    setEditing(false);
    await query.refetch();
  });
  const loadedReceipt = query.data?.data.receipt;
  useEffect(() => {
    if (!loadedReceipt) return;
    setDraft(receiptDraft(loadedReceipt));
  }, [loadedReceipt?.id, loadedReceipt?.version]);
  if (query.isLoading) return <LoadingState label="載入收據詳情" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  const detail = query.data.data;
  const receipt = detail.receipt;
  const canMutate = adminMetaAllowsMutation(query.data.meta, query.isFetching, online);
  const patch = draft ? receiptAmendPatch(receipt, draft) : {};
  return (
    <div className="workspace-stack">
      <Link className="back-link" to="/data/receipts">
        <ArrowLeft size={16} />返回收據
      </Link>
      <PageHeader
        title={receipt.store}
        description={`${receipt.record_date} · ${
          formatMoney(receipt.amount, receipt.currency)
        }`}
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              disabled={!canMutate || Boolean(receipt.deleted_at)}
              onClick={() => {
                setDraft(receiptDraft(receipt));
                setEditing((value) => !value);
              }}
            >
              <Pencil size={16} />修改
            </button>
            <button
              className={`button secondary${receipt.deleted_at ? "" : " danger-action"}`}
              type="button"
              disabled={!canMutate}
              onClick={() =>
                operationFlow.begin({
                  action: receipt.deleted_at ? "receipt_restore" : "receipt_trash",
                  targetId: receipt.id,
                  payload: { expectedVersion: receipt.version },
                })}
            >
              {receipt.deleted_at ? <RotateCcw size={16} /> : <Trash2 size={16} />}
              {receipt.deleted_at ? "還原" : "移至 Trash"}
            </button>
          </>
        }
      />
      <FreshnessBanner meta={query.data.meta} fetching={query.isFetching} />
      {editing && draft && (
        <section className="data-section admin-editor" aria-labelledby="receipt-editor-title">
          <header>
            <div>
              <h2 id="receipt-editor-title">修改收據</h2>
              <p>提交前會先建立 version-checked server preview</p>
            </div>
            <button
              className="icon-button"
              type="button"
              title="關閉修改表格"
              aria-label="關閉修改表格"
              onClick={() => setEditing(false)}
            >
              <X size={17} />
            </button>
          </header>
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canMutate || Object.keys(patch).length === 0) return;
              operationFlow.begin({
                action: "receipt_amend",
                targetId: receipt.id,
                payload: { expectedVersion: receipt.version, patch },
              });
            }}
          >
            <div className="admin-form-grid">
              <label className="field-wide">
                <span>商戶</span>
                <input
                  required
                  maxLength={300}
                  value={draft.store}
                  onChange={(event) => setDraft({ ...draft, store: event.target.value })}
                />
              </label>
              <label>
                <span>日期</span>
                <input
                  required
                  type="date"
                  value={draft.recordDate}
                  onChange={(event) => setDraft({ ...draft, recordDate: event.target.value })}
                />
              </label>
              <label>
                <span>時間</span>
                <input
                  type="time"
                  lang="en-GB"
                  value={draft.recordTime}
                  onChange={(event) => setDraft({ ...draft, recordTime: event.target.value })}
                />
              </label>
              <label>
                <span>金額</span>
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={draft.amount}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                />
              </label>
              <label>
                <span>貨幣</span>
                <input
                  required
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  value={draft.currency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                <span>記錄種類</span>
                <select
                  value={draft.recordKind}
                  onChange={(event) => setDraft({ ...draft, recordKind: event.target.value })}
                >
                  <option value="expense">Expense</option>
                  <option value="settlement">Settlement</option>
                </select>
              </label>
              <label>
                <span>可見範圍</span>
                <select
                  value={draft.visibility}
                  onChange={(event) => setDraft({ ...draft, visibility: event.target.value })}
                >
                  <option value="trip">Trip</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label>
                <span>分類</span>
                <input
                  maxLength={80}
                  disabled={draft.recordKind === "settlement"}
                  value={draft.recordKind === "settlement" ? "" : draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </label>
              <label>
                <span>付款方式</span>
                <input
                  maxLength={80}
                  value={draft.paymentMethod}
                  onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}
                />
              </label>
            </div>
            <footer className="form-actions">
              <span>{Object.keys(patch).length} 個欄位有變更</span>
              <button className="button secondary" type="button" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={!canMutate || Object.keys(patch).length === 0}
              >
                <Save size={16} />預覽修改
              </button>
            </footer>
          </form>
        </section>
      )}
      <section className="detail-grid">
        <div className="data-section">
          <header>
            <div>
              <h2>收據資料</h2>
              <p>Version {receipt.version}</p>
            </div>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Receipt UUID</dt>
              <dd>
                <code>{receipt.id}</code>
              </dd>
            </div>
            <div>
              <dt>行程</dt>
              <dd>
                <Link
                  className="text-link"
                  to={`/data/trips/${receipt.trip_id}`}
                >
                  {receipt.trip_name || receipt.trip_id}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{receipt.owner_masked_email}</dd>
            </div>
            <div>
              <dt>種類</dt>
              <dd>{receipt.record_kind}</dd>
            </div>
            <div>
              <dt>可見</dt>
              <dd>
                <StatusBadge value={receipt.visibility} />
              </dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{String(receipt.payment_method || "未設定")}</dd>
            </div>
            <div>
              <dt>Notion</dt>
              <dd>
                <StatusBadge value={receipt.notion_sync_status} />
              </dd>
            </div>
            <div>
              <dt>Trash</dt>
              <dd>
                <StatusBadge
                  value={receipt.deleted_at ? "deleted" : "active"}
                  label={receipt.deleted_at ? `已刪除 · ${formatDateTime(receipt.deleted_at)}` : "Active"}
                />
              </dd>
            </div>
          </dl>
        </div>
        <div className="data-section">
          <header>
            <div>
              <h2>明細</h2>
              <p>只於收據詳情頁載入的詳細資料</p>
            </div>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Note</dt>
              <dd>{String(receipt.note || "未有")}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{String(receipt.itemsText || "未有")}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{String(receipt.address || "未有")}</dd>
            </div>
            <div>
              <dt>Booking ref</dt>
              <dd>{String(receipt.bookingRef || "未有")}</dd>
            </div>
            <div>
              <dt>Source ID</dt>
              <dd>
                <code>{String(receipt.sourceId || "未有")}</code>
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="data-section">
        <header>
          <div>
            <h2>照片與同步</h2>
            <p>Storage path 永不傳送到 browser</p>
          </div>
        </header>
        <div className="split-lists">
          <div>
            <h3>照片</h3>
            {detail.photo
              ? (
                <div className="receipt-photo-viewer">
                  {photoFailed
                    ? (
                      <div className="state-panel state-error" role="alert">
                        <Camera size={22} />
                        <strong>未能載入收據照片</strong>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => {
                            setPhotoFailed(false);
                            setPhotoAttempt((value) => value + 1);
                          }}
                        >
                          <RefreshCw size={15} />重試
                        </button>
                      </div>
                    )
                    : (
                      <img
                        key={photoAttempt}
                        src={`/api/admin/receipts/${receiptId}/photo`}
                        alt={`${receipt.store} 收據照片`}
                        onError={() => setPhotoFailed(true)}
                      />
                    )}
                  <dl className="photo-metadata">
                    <div>
                      <dt>格式</dt>
                      <dd>{String(detail.photo.mimeType || "未有資料")}</dd>
                    </div>
                    <div>
                      <dt>大小</dt>
                      <dd>{detail.photo.fileSize ? `${Math.ceil(Number(detail.photo.fileSize) / 1024)} KB` : "未有資料"}</dd>
                    </div>
                    <div>
                      <dt>尺寸</dt>
                      <dd>{detail.photo.width && detail.photo.height ? `${detail.photo.width} × ${detail.photo.height}` : "未有資料"}</dd>
                    </div>
                  </dl>
                </div>
              )
              : <EmptyState title="沒有照片" />}
          </div>
          <div>
            <h3>Sync jobs ({detail.syncJobs.length})</h3>
            {detail.syncJobs.map((job) => {
              const jobId = String(job.id || "");
              const status = String(job.status || "unknown");
              const retryable = status === "failed" || status === "cancelled";
              const cancellable = status === "pending";
              return (
                <div className="compact-row sync-job-row" key={jobId}>
                  <span>
                    <strong>{String(job.provider)} · {String(job.operation)}</strong>
                    <small>
                      <StatusBadge value={status} /> · attempts {String(job.attempts)}
                    </small>
                  </span>
                  {(retryable || cancellable) && (
                    <span className="row-actions">
                      {retryable && (
                        <button
                          className="icon-button"
                          type="button"
                          title="重試 sync job"
                          aria-label={`重試 sync job ${jobId}`}
                          disabled={!canMutate}
                          onClick={() => operationFlow.begin({
                            action: "retry_sync_job",
                            targetId: jobId,
                          })}
                        >
                          <RefreshCw size={16} />
                        </button>
                      )}
                      {cancellable && (
                        <button
                          className="icon-button danger-icon"
                          type="button"
                          title="取消 pending sync job"
                          aria-label={`取消 sync job ${jobId}`}
                          disabled={!canMutate}
                          onClick={() => operationFlow.begin({
                            action: "cancel_sync_job",
                            targetId: jobId,
                          })}
                        >
                          <CircleX size={16} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <OperationDialog flow={operationFlow} />
    </div>
  );
}
