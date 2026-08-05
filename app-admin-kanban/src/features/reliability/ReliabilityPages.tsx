import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCw, ScanSearch, Search, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { adminGet, queryFromSearchParams } from "../../lib/api/adminClient";
import type {
  IncidentRow,
  IntegrityData,
  PagedData,
  SyncJobRow,
} from "../../lib/contracts/admin";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  FreshnessBanner,
  adminMetaAllowsMutation,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  useCursorPagination,
  useOnline,
  WorkspaceNav,
} from "../../components/primitives/ConsolePrimitives";
import {
  OperationDialog,
  useOperationFlow,
} from "../operations/OperationFlow";

const RELIABILITY_NAV = [
  { to: "/reliability/incidents", label: "Incidents" },
  { to: "/reliability/sync", label: "同步工作" },
  { to: "/reliability/integrity", label: "資料完整性" },
  { to: "/reliability/reconciliation", label: "Notion 對數" },
];

function ReliabilityFrame(
  { title, description, children }: {
    title: string;
    description: string;
    children: React.ReactNode;
  },
) {
  return (
    <div className="workspace-stack">
      <WorkspaceNav items={RELIABILITY_NAV} />
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}

export function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const values = queryFromSearchParams(searchParams, [
    "severity",
    "status",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "incidents", values],
    queryFn: ({ signal }) =>
      adminGet<PagedData<IncidentRow>>("/incidents", values, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  };
  return (
    <ReliabilityFrame
      title="Incidents"
      description="P0 至 P3 security、data-loss 與 dependency incidents"
    >
      <div className="filter-bar">
        <select
          aria-label="Severity"
          value={searchParams.get("severity") || ""}
          onChange={(event) => setFilter("severity", event.target.value)}
        >
          <option value="">全部 severity</option>
          {["P0", "P1", "P2", "P3"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="狀態"
          value={searchParams.get("status") || ""}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">全部狀態</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          className="button secondary"
          type="button"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "spin" : ""} size={16} />更新
        </button>
      </div>
      {query.isLoading
        ? <LoadingState />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
              placeholder={query.isPlaceholderData}
            />
            <section className="data-section">
              <header>
                <div>
                  <h2>Incident queue</h2>
                  <p>{query.data.meta.total ?? 0} 個結果</p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Incidents 資料表"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Severity</th>
                          <th scope="col">Incident</th>
                          <th scope="col">Kind</th>
                          <th scope="col">狀態</th>
                          <th scope="col">建立</th>
                          <th scope="col">Resolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Severity">
                              <StatusBadge value={item.severity} />
                            </td>
                            <td data-label="Incident">
                              <strong>{item.title}</strong>
                              <small>
                                <code>{item.id.slice(0, 8)}</code>
                              </small>
                            </td>
                            <td data-label="Kind">{item.kind}</td>
                            <td data-label="狀態">
                              <StatusBadge value={item.status} />
                            </td>
                            <td data-label="建立">
                              {formatDateTime(item.created_at)}
                            </td>
                            <td data-label="Resolved">
                              {formatDateTime(item.resolved_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
                : (
                  <EmptyState
                    title="目前沒有 incidents"
                    detail={`最後檢查 ${
                      formatDateTime(query.data.meta.generatedAt)
                    }`}
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
    </ReliabilityFrame>
  );
}

export function SyncJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const online = useOnline();
  const values = queryFromSearchParams(searchParams, [
    "status",
    "provider",
    "userId",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "sync-jobs", values],
    queryFn: ({ signal }) =>
      adminGet<PagedData<SyncJobRow>>("/sync-jobs", values, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (data) =>
      data.state.data?.data.items.some((job) =>
          ["pending", "processing"].includes(job.status)
        )
        ? 10_000
        : 60_000,
    staleTime: 30_000,
  });
  const operationFlow = useOperationFlow(async () => {
    await query.refetch();
  });
  const canMutate = Boolean(query.data && adminMetaAllowsMutation(
    query.data.meta,
    query.isFetching || query.isPlaceholderData,
    online,
  ));
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  };
  return (
    <ReliabilityFrame
      title="同步工作"
      description="Supabase canonical writes、Personal Notion 及 Shared Mirror job 狀態"
    >
      <div className="filter-bar">
        <select
          aria-label="Job 狀態"
          value={searchParams.get("status") || ""}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">全部狀態</option>
          {["pending", "processing", "succeeded", "failed", "cancelled"].map(
            (item) => <option key={item}>{item}</option>,
          )}
        </select>
        <select
          aria-label="Provider"
          value={searchParams.get("provider") || ""}
          onChange={(event) => setFilter("provider", event.target.value)}
        >
          <option value="">全部 provider</option>
          <option value="notion">Notion</option>
        </select>
        <button
          className="button secondary"
          type="button"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "spin" : ""} size={16} />更新
        </button>
      </div>
      {query.isLoading
        ? <LoadingState />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
              placeholder={query.isPlaceholderData}
            />
            <section className="data-section">
              <header>
                <div>
                  <h2>Job queue</h2>
                  <p>
                    {query.data.meta.total ?? 0}{" "}
                    個結果；payload 不會傳送到 browser
                  </p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="同步工作資料表"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">狀態</th>
                          <th scope="col">Provider</th>
                          <th scope="col">操作</th>
                          <th scope="col">Owner</th>
                          <th scope="col">Receipt</th>
                          <th scope="col">Attempts</th>
                          <th scope="col">Next attempt</th>
                          <th scope="col">錯誤</th>
                          <th scope="col">更新</th>
                          <th scope="col"><span className="sr-only">操作</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((job) => (
                          <tr key={job.id}>
                            <td data-label="狀態">
                              <StatusBadge value={job.status} />
                            </td>
                            <td data-label="Provider">{job.provider}</td>
                            <td data-label="操作">{job.operation}</td>
                            <td data-label="Owner">{job.owner_masked_email}</td>
                            <td data-label="Receipt">
                              <Link
                                className="text-link"
                                to={`/data/receipts/${job.receipt_id}`}
                              >
                                <code>{job.receipt_id.slice(0, 8)}</code>
                              </Link>
                            </td>
                            <td data-label="Attempts">{job.attempts}</td>
                            <td data-label="Next attempt">
                              {formatDateTime(job.next_attempt_at)}
                            </td>
                            <td data-label="錯誤" className="wrap-cell">
                              {job.last_error || "—"}
                            </td>
                            <td data-label="更新">
                              {formatDateTime(job.updated_at)}
                            </td>
                            <td data-label="操作" className="row-actions">
                              {(["failed", "cancelled"].includes(job.status)) && (
                                <button
                                  className="icon-button"
                                  type="button"
                                  title="重試同步工作"
                                  aria-label={`重試同步工作 ${job.id.slice(0, 8)}`}
                                  disabled={!canMutate}
                                  onClick={() =>
                                    operationFlow.begin({
                                      action: "retry_sync_job",
                                      targetId: job.id,
                                    })}
                                >
                                  <RefreshCw size={17} />
                                </button>
                              )}
                              {job.status === "pending" && (
                                <button
                                  className="icon-button danger-action"
                                  type="button"
                                  title="取消同步工作"
                                  aria-label={`取消同步工作 ${job.id.slice(0, 8)}`}
                                  disabled={!canMutate}
                                  onClick={() =>
                                    operationFlow.begin({
                                      action: "cancel_sync_job",
                                      targetId: job.id,
                                    })}
                                >
                                  <XCircle size={17} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
                : (
                  <EmptyState
                    title="目前沒有同步工作"
                    detail={`最後檢查 ${
                      formatDateTime(query.data.meta.generatedAt)
                    }`}
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
      <OperationDialog flow={operationFlow} />
    </ReliabilityFrame>
  );
}

export function IntegrityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const values = queryFromSearchParams(searchParams, [
    "severity",
    "findingType",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "integrity", values],
    queryFn: ({ signal }) =>
      adminGet<IntegrityData>("/integrity", values, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (current) =>
      current.state.data?.data.state === "running" ? 10_000 : false,
    staleTime: 30_000,
  });
  const operationFlow = useOperationFlow(async () => {
    await query.refetch();
  });
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  };
  return (
    <ReliabilityFrame
      title="資料完整性"
      description="行程日期、收據、membership、tombstone、split 及 backend binding 檢查"
    >
      <div className="filter-bar">
        <select
          aria-label="Severity"
          value={searchParams.get("severity") || ""}
          onChange={(event) => setFilter("severity", event.target.value)}
        >
          <option value="">全部 severity</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          className="button secondary"
          type="button"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "spin" : ""} size={16} />更新
        </button>
        <button
          className="button primary"
          type="button"
          disabled={
            query.isFetching || query.isPlaceholderData ||
            query.data?.data.state === "running"
          }
          onClick={() =>
            operationFlow.begin({
              action: "run_integrity_scan",
              targetId: "system",
            })}
        >
          <ScanSearch size={16} />執行掃描
        </button>
      </div>
      {query.isLoading
        ? <LoadingState />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
              placeholder={query.isPlaceholderData}
            />
            {query.data.data.state === "partial" && (
              <section className="integrity-warning" role="alert">
                <strong>完整性掃描只有部分結果</strong>
                <span>
                  已完成嘅 findings 仍可檢視，但未覆蓋所有 records；修正前請重新掃描。
                </span>
              </section>
            )}
            {query.data.data.run && (
              <section className="metric-strip" aria-label="完整性掃描摘要">
                <div className="metric-block">
                  <span>State</span>
                  <strong><StatusBadge value={query.data.data.state} /></strong>
                </div>
                <div className="metric-block">
                  <span>Records checked</span>
                  <strong>{query.data.data.run.summary.recordsChecked ?? "—"}</strong>
                </div>
                <div className="metric-block">
                  <span>Findings</span>
                  <strong>{query.data.data.run.summary.findings ?? query.data.meta.total ?? 0}</strong>
                </div>
                <div className="metric-block metric-identity">
                  <span>Check version</span>
                  <strong>{query.data.data.run.summary.checkVersion || query.data.data.run.source}</strong>
                </div>
                <div className="metric-block">
                  <span>Completed</span>
                  <strong className="metric-date">
                    {formatDateTime(
                      query.data.data.run.completedAt ||
                        query.data.data.run.completed_at,
                    )}
                  </strong>
                </div>
              </section>
            )}
            {query.data.data.state === "never_run"
              ? (
                <EmptyState
                  title="完整性檢查從未執行"
                  detail="使用「執行掃描」建立第一個有審計記錄的檢查 run。"
                />
              )
              : query.data.data.state === "running"
              ? <LoadingState label="完整性掃描正在執行" />
              : query.data.data.state === "failed"
              ? (
                <section className="integrity-warning" role="alert">
                  <strong>上一次完整性掃描失敗</strong>
                  <span>
                    Error {query.data.data.run?.summary.errorCode || "INTEGRITY_SCAN_FAILED"} · 可重新執行掃描
                  </span>
                </section>
              )
              : query.data.data.state === "no_issues"
              ? (
                <EmptyState
                  title="沒有發現完整性問題"
                  detail={`${query.data.data.run?.summary.recordsChecked ?? 0} records checked · ${query.data.data.run?.summary.checkVersion || "unknown check version"}`}
                />
              )
              : (
                <section className="data-section">
                  <header>
                    <div>
                      <h2>Findings</h2>
                      <p>
                        {query.data.meta.total ?? 0} 個結果 · State{" "}
                        {query.data.data.state || "unknown"}
                      </p>
                    </div>
                  </header>
                  {query.data.data.items.length
                    ? (
                      <div
                        className="table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label="完整性 findings 資料表"
                      >
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Severity</th>
                              <th scope="col">Finding</th>
                              <th scope="col">Entity</th>
                              <th scope="col">ID</th>
                              <th scope="col">建立</th>
                            </tr>
                          </thead>
                          <tbody>
                            {query.data.data.items.map((item) => (
                              <tr key={item.id}>
                                <td data-label="Severity">
                                  <StatusBadge value={item.severity} />
                                </td>
                                <td data-label="Finding">
                                  {item.finding_type}
                                  <details className="finding-detail">
                                    <summary>查看詳細資料</summary>
                                    <pre>{JSON.stringify(item.detail, null, 2)}</pre>
                                  </details>
                                </td>
                                <td data-label="Entity">{item.entity_type}</td>
                                <td data-label="ID">
                                  <code>{item.entity_id || "—"}</code>
                                </td>
                                <td data-label="建立">
                                  {formatDateTime(item.created_at)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                    : <EmptyState title="篩選條件下沒有 findings" />}
                </section>
              )}
            <Pagination
              hasCursor={Boolean(searchParams.get("cursor"))}
              nextCursor={query.data.meta.nextCursor}
              disabled={query.isFetching || query.isPlaceholderData}
              onPrevious={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("cursor");
                setSearchParams(next);
              }}
              onNext={(cursor) => {
                const next = new URLSearchParams(searchParams);
                next.set("cursor", cursor);
                setSearchParams(next);
              }}
            />
          </>
        )}
      <OperationDialog flow={operationFlow} />
    </ReliabilityFrame>
  );
}

type ReconciliationData = {
  binding: "configured" | "invalid" | "none";
  bindingStatus: string;
  blockedNotionRows: number;
  blockedSupabaseRows: number;
  checkVersion: string;
  databaseScope: "personal" | "shared_mirror" | "none";
  duplicateNotion: number;
  duplicateSupabase: number;
  items: Array<{
    linked: boolean;
    notionCopies: number;
    sourceId: string;
    status: string;
    supabaseReceiptId: string | null;
  }>;
  lastError: string | null;
  lastHealthAt: string | null;
  linkedReceipts: number;
  matchingReceipts: number;
  missingInNotion: number;
  mode: "dry_run";
  notionOnly: number;
  notionRowsScanned: number;
  notionSource: "live" | "partial" | "unavailable";
  notionTripReceipts: number;
  privateReceiptsExcluded: number;
  resultRows: number;
  syncMode: string | null;
  tripId: string;
  tripName: string;
  tripReceipts: number;
  truncated: boolean;
};

const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  blocked: "缺少識別資料",
  duplicate_in_notion: "Notion 重複",
  duplicate_in_supabase: "Supabase 重複",
  matched: "一致",
  missing_in_notion: "Notion 缺少",
  notion_only: "只在 Notion",
};

const DATABASE_SCOPE_LABELS: Record<ReconciliationData["databaseScope"], string> = {
  none: "未設定",
  personal: "Personal Notion",
  shared_mirror: "Shared Mirror",
};

export function ReconciliationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tripId, setTripId] = useState(searchParams.get("tripId") || "");
  const selected = searchParams.get("tripId") || "";
  useEffect(() => setTripId(selected), [selected]);
  const query = useQuery({
    queryKey: ["admin", "reconciliation", selected],
    queryFn: ({ signal }) =>
      adminGet<ReconciliationData>(
        "/reconciliation",
        { tripId: selected },
        signal,
      ),
    enabled: Boolean(selected),
    staleTime: 30_000,
  });
  const reconciliation = query.data?.data;
  const reconciliationIncomplete = Boolean(reconciliation) && (
    reconciliation!.notionSource !== "live" || reconciliation!.truncated ||
    query.data!.meta.warnings.length > 0 ||
    query.data!.meta.sources?.notion !== "live"
  );
  return (
    <ReliabilityFrame
      title="Notion 對數"
      description="只按單一 trip 進行 read-only reconciliation；private receipts 永遠排除"
    >
      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams();
          if (tripId.trim()) next.set("tripId", tripId.trim());
          setSearchParams(next);
        }}
      >
        <label className="filter-search">
          <Search size={16} />
          <span className="sr-only">Trip UUID</span>
          <input
            value={tripId}
            onChange={(event) => setTripId(event.target.value)}
            placeholder="輸入完整 Trip UUID"
          />
        </label>
        <button className="button primary" type="submit">
          <Search size={16} />對數
        </button>
      </form>
      {!selected
        ? (
          <EmptyState
            title="選擇一個行程"
            detail="輸入完整 Trip UUID；console 不接受 browser 提交 Notion database ID。"
          />
        )
        : query.isLoading
        ? <LoadingState label="載入 reconciliation" />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
            />
            {reconciliationIncomplete && query.data.data.notionSource !== "unavailable" && (
              <section className="integrity-warning" role="alert">
                <strong>對數覆蓋未完成</strong>
                <span>
                  已掃描 Notion {query.data.data.notionRowsScanned} rows；
                  server 回報 {query.data.data.resultRows} 個結果
                  {query.data.data.truncated ? "，目前只顯示首批結果" : ""}。
                  未取得完整 live data 前不會宣告一致。
                </span>
              </section>
            )}
            <section className="metric-strip">
              <div className="metric-block">
                <span>Supabase receipts</span>
                <strong>{query.data.data.tripReceipts}</strong>
              </div>
              <div className="metric-block metric-success">
                <span>一致</span>
                <strong>{query.data.data.matchingReceipts}</strong>
              </div>
              <div className="metric-block metric-danger">
                <span>Notion 缺少</span>
                <strong>{query.data.data.missingInNotion}</strong>
              </div>
              <div className="metric-block metric-warning">
                <span>只在 Notion</span>
                <strong>{query.data.data.notionOnly}</strong>
              </div>
              <div className="metric-block">
                <span>Private excluded</span>
                <strong>{query.data.data.privateReceiptsExcluded}</strong>
              </div>
            </section>
            <section className="data-section">
              <header>
                <div>
                  <h2>{query.data.data.tripName}</h2>
                  <p>
                    <code>{query.data.data.tripId}</code>
                  </p>
                </div>
                <StatusBadge
                  value={query.data.data.notionSource}
                  label={query.data.data.notionSource === "live"
                    ? "Notion live"
                    : query.data.data.notionSource === "partial"
                    ? "Notion partial"
                    : "Notion unavailable"}
                />
              </header>
              <dl className="detail-list">
                <div>
                  <dt>Database scope</dt>
                  <dd>{DATABASE_SCOPE_LABELS[query.data.data.databaseScope]}</dd>
                </div>
                <div>
                  <dt>Binding</dt>
                  <dd><StatusBadge value={query.data.data.bindingStatus} /></dd>
                </div>
                <div>
                  <dt>Sync mode</dt>
                  <dd>{query.data.data.syncMode || "未設定"}</dd>
                </div>
                <div>
                  <dt>Last health</dt>
                  <dd>{formatDateTime(query.data.data.lastHealthAt)}</dd>
                </div>
                <div>
                  <dt>Rows checked</dt>
                  <dd>
                    Supabase {query.data.data.tripReceipts} · Notion {query.data.data.notionRowsScanned}
                  </dd>
                </div>
                <div>
                  <dt>Duplicate / blocked</dt>
                  <dd>
                    Notion {query.data.data.duplicateNotion} · Supabase {query.data.data.duplicateSupabase} · Blocked {query.data.data.blockedNotionRows + query.data.data.blockedSupabaseRows}
                  </dd>
                </div>
                <div>
                  <dt>Last error</dt>
                  <dd>{query.data.data.lastError || "—"}</dd>
                </div>
              </dl>
            </section>
            <section className="data-section">
              <header>
                <div>
                  <h2>Dry-run result</h2>
                  <p>
                    {query.data.data.resultRows} 個結果 · {query.data.data.checkVersion}
                  </p>
                </div>
                <StatusBadge value={query.data.data.mode} label="Read only" />
              </header>
              {query.data.data.notionSource === "unavailable"
                ? (
                  <EmptyState
                    title={query.data.data.binding === "none"
                      ? "此行程未設定 Notion"
                      : "Notion 暫時不可用"}
                    detail="Supabase 資料仍然可見；未取得 Notion 資料前不會產生錯誤差異。"
                  />
                )
                : query.data.data.items.length === 0 && !reconciliationIncomplete
                ? (
                  <EmptyState
                    title="Supabase 與 Notion 一致"
                    detail={`已檢查 ${query.data.data.tripReceipts} 張 trip receipts；private receipts 已排除。`}
                  />
                )
                : query.data.data.items.length === 0
                ? (
                  <EmptyState
                    title="對數結果未完整"
                    detail="保留目前 Supabase 資料；請等 Notion source 回復 live 後再重新對數。"
                  />
                )
                : (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Notion 對數結果"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">SourceID</th>
                          <th scope="col">結果</th>
                          <th scope="col">Supabase receipt</th>
                          <th scope="col">Notion copies</th>
                          <th scope="col">Linked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((item, index) => (
                          <tr key={`${item.sourceId}:${item.supabaseReceiptId || "notion"}:${index}`}>
                            <td data-label="SourceID"><code>{item.sourceId}</code></td>
                            <td data-label="結果">
                              <StatusBadge
                                value={item.status}
                                label={RECONCILIATION_STATUS_LABELS[item.status] || item.status}
                              />
                            </td>
                            <td data-label="Supabase receipt">
                              {item.supabaseReceiptId
                                ? <code>{item.supabaseReceiptId.slice(0, 8)}</code>
                                : "—"}
                            </td>
                            <td data-label="Notion copies">{item.notionCopies}</td>
                            <td data-label="Linked">{item.linked ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </section>
          </>
        )}
    </ReliabilityFrame>
  );
}
