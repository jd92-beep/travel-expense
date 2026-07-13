import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { adminGet, queryFromSearchParams } from "../../../lib/api/adminClient";
import type {
  AdminMeta,
  AuditRow,
  ItineraryData,
  ItineraryDay,
  ItineraryVersionsData,
  PagedData,
  TripRow,
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
  WorkspaceNav,
} from "../../../components/primitives/ConsolePrimitives";

const DATA_NAV = [
  { to: "/data/accounts", label: "帳戶" },
  { to: "/data/trips", label: "行程" },
  { to: "/data/receipts", label: "收據" },
];

export function TripsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const queryText = searchParams.get("q") || "";
  const [draft, setDraft] = useState(queryText);
  useEffect(() => setDraft(queryText), [queryText]);
  const queryValues = queryFromSearchParams(searchParams, [
    "q",
    "status",
    "integrity",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "trips", queryValues],
    queryFn: ({ signal }) =>
      adminGet<PagedData<TripRow>>("/trips", queryValues, signal),
    placeholderData: keepPreviousData,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  }

  return (
    <div className="workspace-stack">
      <WorkspaceNav items={DATA_NAV} />
      <PageHeader
        title="行程"
        description="日期範圍、成員、行程覆蓋、Notion binding 及完整性"
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
          <span className="sr-only">搜尋行程</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜尋名稱、目的地或 UUID"
          />
        </label>
        <select
          aria-label="行程狀態"
          value={searchParams.get("status") || ""}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">全部狀態</option>
          <option value="open">Open</option>
          <option value="past">Past</option>
          <option value="archived">Archived</option>
        </select>
        <select
          aria-label="完整性"
          value={searchParams.get("integrity") || ""}
          onChange={(event) => setFilter("integrity", event.target.value)}
        >
          <option value="">全部完整性</option>
          <option value="healthy">Healthy</option>
          <option value="issue">Issue</option>
          <option value="invalid_dates">Invalid dates</option>
        </select>
        <button className="button primary" type="submit">
          <Search size={16} />搜尋
        </button>
      </form>
      {query.isLoading
        ? <LoadingState label="載入行程" />
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
                  <h2>行程清單</h2>
                  <p>
                    {query.data.meta.total ?? query.data.data.items.length}{" "}
                    個結果
                  </p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="行程資料表"
                  >
                    <table>
                      <caption className="sr-only">行程清單</caption>
                      <thead>
                        <tr>
                          <th scope="col">行程</th>
                          <th scope="col">日期</th>
                          <th scope="col">Owner</th>
                          <th scope="col">成員</th>
                          <th scope="col">收據</th>
                          <th scope="col">Itinerary</th>
                          <th scope="col">完整性</th>
                          <th scope="col">Notion</th>
                          <th scope="col">更新</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((trip) => (
                          <tr key={trip.id}>
                            <td data-label="行程">
                              <Link
                                className="entity-link"
                                to={`/data/trips/${trip.id}`}
                              >
                                {trip.name}
                              </Link>
                              <small>
                                {trip.destination_summary || "未有目的地"}
                                <br />
                                <code>{trip.id.slice(0, 8)}</code>
                              </small>
                            </td>
                            <td data-label="日期">
                              {trip.start_date || "未設定"}
                              <br />至 {trip.end_date || "未設定"}
                            </td>
                            <td data-label="Owner">
                              {trip.owner_masked_email}
                            </td>
                            <td data-label="成員">{trip.member_count}</td>
                            <td data-label="收據">{trip.receipt_count}</td>
                            <td data-label="Itinerary">
                              <Link
                                className="coverage-link"
                                to={`/data/trips/${trip.id}/itinerary`}
                              >
                                <span>{trip.itinerary_coverage}%</span>
                                <i
                                  style={{
                                    "--coverage": `${trip.itinerary_coverage}%`,
                                  } as React.CSSProperties}
                                />
                              </Link>
                              <small>
                                {trip.actual_days}/{trip.expected_days} 日
                              </small>
                            </td>
                            <td data-label="完整性">
                              <StatusBadge value={trip.integrity_status} />
                            </td>
                            <td data-label="Notion">
                              <StatusBadge value={trip.notion_binding_status} />
                            </td>
                            <td data-label="更新">
                              {formatDateTime(trip.updated_at)}
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
                      ? "沒有符合篩選條件的行程"
                      : "目前沒有行程"}
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

type TripMemberRow = {
  user_id: string;
  masked_email: string | null;
  role: string;
  status: string;
};

type TripInviteRow = {
  id: string;
  masked_email: string | null;
  role: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type TripReceiptRow = {
  id: string;
  store: string | null;
  record_date: string | null;
  amount: number | string | null;
  currency: string | null;
  record_kind: string;
  visibility: string;
  notion_sync_status: string | null;
  integrity_status: string;
  updated_at: string;
};

type TripAuditRow = {
  id: string;
  action: string;
  result: unknown;
  error_code?: string | null;
  request_id: string | null;
  created_at: string;
};

type TripIntegration = {
  status: string;
  syncMode: string | null;
  databaseConfigured: boolean;
  lastHealthAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

type TripDetail = {
  overview: TripRow;
  members: TripMemberRow[];
  invites: TripInviteRow[];
  receipts: TripReceiptRow[];
  integration: TripIntegration | null;
  audit: TripAuditRow[];
};

type TripAmendDraft = {
  archived: boolean;
  budgetAmount: string;
  budgetCurrency: string;
  destinationSummary: string;
  homeCurrency: string;
  name: string;
  tripCurrency: string;
};

function tripDraft(trip: TripRow): TripAmendDraft {
  return {
    archived: trip.archived,
    budgetAmount: trip.budget_amount === null ? "" : String(trip.budget_amount),
    budgetCurrency: trip.budget_currency,
    destinationSummary: trip.destination_summary || "",
    homeCurrency: trip.home_currency,
    name: trip.name,
    tripCurrency: trip.trip_currency,
  };
}

function tripAmendPatch(trip: TripRow, draft: TripAmendDraft) {
  const patch: Record<string, unknown> = {};
  const amount = draft.budgetAmount === "" ? null : Number(draft.budgetAmount);
  if (draft.name.trim() !== trip.name) patch.name = draft.name.trim();
  if (draft.destinationSummary.trim() !== (trip.destination_summary || "")) {
    patch.destinationSummary = draft.destinationSummary.trim();
  }
  if (draft.homeCurrency.toUpperCase() !== trip.home_currency) {
    patch.homeCurrency = draft.homeCurrency.toUpperCase();
  }
  if (draft.tripCurrency.toUpperCase() !== trip.trip_currency) {
    patch.tripCurrency = draft.tripCurrency.toUpperCase();
  }
  if (amount !== trip.budget_amount) patch.budgetAmount = amount;
  if (draft.budgetCurrency.toUpperCase() !== trip.budget_currency) {
    patch.budgetCurrency = draft.budgetCurrency.toUpperCase();
  }
  if (draft.archived !== trip.archived) patch.archived = draft.archived;
  return patch;
}

function auditResultLabel(result: unknown, errorCode?: string | null) {
  if (errorCode) return "failed";
  if (typeof result === "string" && result.trim()) return result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    for (const key of ["status", "outcome", "result"] as const) {
      if (typeof record[key] === "string" && record[key]) return record[key];
    }
    if (record.ok === false) return "failed";
  }
  return "recorded";
}

export function TripDetailPage() {
  const { tripId = "" } = useParams();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TripAmendDraft | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("editor");
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["admin", "trip", tripId],
    queryFn: ({ signal }) =>
      adminGet<TripDetail>(`/trips/${tripId}`, undefined, signal),
    enabled: Boolean(tripId),
  });
  const auditQuery = useQuery({
    queryKey: ["admin", "audit", "trip", tripId],
    queryFn: ({ signal }) =>
      adminGet<PagedData<AuditRow>>(
        "/audit",
        { direction: "desc", limit: "50", sort: "created_at", targetId: tripId },
        signal,
      ),
    enabled: Boolean(tripId),
  });
  const operationFlow = useOperationFlow(async () => {
    setEditing(false);
    setMemberEmail("");
    await Promise.all([query.refetch(), auditQuery.refetch()]);
  });
  const loadedTrip = query.data?.data;
  useEffect(() => {
    if (!loadedTrip) return;
    setDraft(tripDraft(loadedTrip.overview));
    setMemberRoles(Object.fromEntries(loadedTrip.members.map((member) => [member.user_id, member.role])));
  }, [loadedTrip?.overview.id, loadedTrip?.overview.version]);
  if (query.isLoading) return <LoadingState label="載入行程詳情" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  const trip = query.data.data;
  const auditEvents: Array<AuditRow | TripAuditRow> = auditQuery.data?.data.items || [];
  const canMutate = adminMetaAllowsMutation(query.data.meta, query.isFetching);
  const patch = draft ? tripAmendPatch(trip.overview, draft) : {};
  return (
    <div className="workspace-stack">
      <Link className="back-link" to="/data/trips">
        <ArrowLeft size={16} />返回行程
      </Link>
      <PageHeader
        title={trip.overview.name}
        description={`${trip.overview.destination_summary || "未有目的地"} · ${
          trip.overview.start_date || "?"
        } 至 ${trip.overview.end_date || "?"}`}
        actions={
          <>
            <button
              className="button secondary"
              type="button"
              disabled={!canMutate}
              onClick={() => {
                setDraft(tripDraft(trip.overview));
                setEditing((value) => !value);
              }}
            >
              <Pencil size={16} />修改
            </button>
            <Link
              className="button primary"
              to={`/data/trips/${tripId}/itinerary`}
            >
              <CalendarDays size={16} />行程表
            </Link>
          </>
        }
      />
      <FreshnessBanner meta={query.data.meta} fetching={query.isFetching} />
      {editing && draft && (
        <section className="data-section admin-editor" aria-labelledby="trip-editor-title">
          <header>
            <div>
              <h2 id="trip-editor-title">修改行程資料</h2>
              <p>日期與每日景點請於行程表修改</p>
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
                action: "trip_amend",
                targetId: trip.overview.id,
                payload: { expectedVersion: trip.overview.version, patch },
              });
            }}
          >
            <div className="admin-form-grid">
              <label className="field-wide">
                <span>行程名稱</span>
                <input
                  required
                  maxLength={160}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="field-wide">
                <span>目的地</span>
                <input
                  maxLength={240}
                  value={draft.destinationSummary}
                  onChange={(event) => setDraft({ ...draft, destinationSummary: event.target.value })}
                />
              </label>
              <label>
                <span>Home currency</span>
                <input
                  required
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  value={draft.homeCurrency}
                  onChange={(event) => setDraft({ ...draft, homeCurrency: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                <span>Trip currency</span>
                <input
                  required
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  value={draft.tripCurrency}
                  onChange={(event) => setDraft({ ...draft, tripCurrency: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                <span>Budget</span>
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={draft.budgetAmount}
                  onChange={(event) => setDraft({ ...draft, budgetAmount: event.target.value })}
                />
              </label>
              <label>
                <span>Budget currency</span>
                <input
                  required
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  value={draft.budgetCurrency}
                  onChange={(event) => setDraft({ ...draft, budgetCurrency: event.target.value.toUpperCase() })}
                />
              </label>
              <label className="checkbox-field field-wide">
                <input
                  type="checkbox"
                  checked={draft.archived}
                  onChange={(event) => setDraft({ ...draft, archived: event.target.checked })}
                />
                <span>封存此行程</span>
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
      <section className="metric-strip">
        <div className="metric-block metric-identity">
          <span>Owner</span>
          <strong>{trip.overview.owner_masked_email}</strong>
        </div>
        <div className="metric-block">
          <span>Members</span>
          <strong>{trip.overview.member_count}</strong>
        </div>
        <div className="metric-block">
          <span>Receipts</span>
          <strong>{trip.overview.receipt_count}</strong>
        </div>
        <div className="metric-block">
          <span>Itinerary</span>
          <strong>{trip.overview.itinerary_coverage}%</strong>
        </div>
        <div className="metric-block">
          <span>Version</span>
          <strong>{trip.overview.version}</strong>
        </div>
      </section>
      <section className="detail-grid trip-member-grid">
        <div className="data-section member-section">
          <header>
            <div>
              <h2>成員</h2>
              <p>Owner 不會重複計算</p>
            </div>
          </header>
          <form
            className="member-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canMutate || !memberEmail.trim()) return;
              operationFlow.begin({
                action: "member_add",
                targetId: trip.overview.id,
                payload: { email: memberEmail.trim(), role: memberRole },
              });
            }}
          >
            <label>
              <span>帳戶電郵</span>
              <input
                required
                type="email"
                maxLength={254}
                placeholder="name@example.com"
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
              />
            </label>
            <label>
              <span>角色</span>
              <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button className="button secondary" type="submit" disabled={!canMutate}>
              <UserPlus size={16} />加入
            </button>
          </form>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="行程成員資料表"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">身份</th>
                  <th scope="col">角色</th>
                  <th scope="col">狀態</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {trip.members.map((member) => {
                  const protectedOwner = member.role === "owner";
                  const selectedRole = memberRoles[member.user_id] || member.role;
                  return (
                  <tr key={member.user_id}>
                    <td data-label="身份">
                      {member.masked_email || member.user_id}
                    </td>
                    <td data-label="角色">
                      {protectedOwner
                        ? "owner"
                        : (
                          <select
                            aria-label={`${member.masked_email || member.user_id} 角色`}
                            value={selectedRole}
                            onChange={(event) =>
                              setMemberRoles({ ...memberRoles, [member.user_id]: event.target.value })}
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                    </td>
                    <td data-label="狀態">
                      <StatusBadge value={member.status} />
                    </td>
                    <td data-label="操作" className="row-actions">
                      {!protectedOwner && (
                        <>
                          <button
                            className="icon-button"
                            type="button"
                            title={member.status === "removed" ? "重新啟用成員" : "套用角色"}
                            aria-label={member.status === "removed" ? "重新啟用成員" : "套用角色"}
                            disabled={!canMutate || (member.status === "active" && selectedRole === member.role)}
                            onClick={() =>
                              operationFlow.begin({
                                action: "member_role",
                                targetId: trip.overview.id,
                                payload: { userId: member.user_id, role: selectedRole },
                              })}
                          >
                            {member.status === "removed" ? <RotateCcw size={16} /> : <Save size={16} />}
                          </button>
                          <button
                            className="icon-button danger-action"
                            type="button"
                            title="移除成員"
                            aria-label="移除成員"
                            disabled={!canMutate || member.status === "removed"}
                            onClick={() =>
                              operationFlow.begin({
                                action: "member_remove",
                                targetId: trip.overview.id,
                                payload: { userId: member.user_id },
                              })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="data-section">
          <header>
            <div>
              <h2>整合</h2>
              <p>Resolved trip-scoped backend binding</p>
            </div>
          </header>
          {trip.integration
            ? (
              <>
                <dl className="detail-list">
                  <div>
                    <dt>狀態</dt>
                    <dd><StatusBadge value={trip.integration.status} /></dd>
                  </div>
                  <div>
                    <dt>同步模式</dt>
                    <dd>{trip.integration.syncMode || "未設定"}</dd>
                  </div>
                  <div>
                    <dt>Database binding</dt>
                    <dd>
                      <StatusBadge
                        value={trip.integration.databaseConfigured
                          ? "connected"
                          : "unknown"}
                        label={trip.integration.databaseConfigured
                          ? "已設定"
                          : "未設定"}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>最後健康檢查</dt>
                    <dd>{formatDateTime(trip.integration.lastHealthAt)}</dd>
                  </div>
                  <div>
                    <dt>最後更新</dt>
                    <dd>{formatDateTime(trip.integration.updatedAt)}</dd>
                  </div>
                </dl>
                {trip.integration.lastError && (
                  <p className="error-line">{trip.integration.lastError}</p>
                )}
              </>
            )
            : <EmptyState title="未設定 Notion binding" />}
        </div>
      </section>

      <section className="data-section">
        <header>
          <div>
            <h2>最近收據</h2>
            <p>最多顯示最近 20 張；完整資料請前往收據工作區</p>
          </div>
          <Link className="text-link" to={`/data/receipts?tripId=${tripId}`}>
            查看全部
          </Link>
        </header>
        {trip.receipts.length
          ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="行程最近收據資料表"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">收據</th>
                    <th scope="col">日期</th>
                    <th scope="col">金額</th>
                    <th scope="col">種類</th>
                    <th scope="col">可見</th>
                    <th scope="col">Notion</th>
                    <th scope="col">完整性</th>
                  </tr>
                </thead>
                <tbody>
                  {trip.receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td data-label="收據">
                        <Link
                          className="entity-link"
                          to={`/data/receipts/${receipt.id}`}
                        >
                          {receipt.store || "未命名收據"}
                        </Link>
                      </td>
                      <td data-label="日期">{receipt.record_date || "未有日期"}</td>
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
                      <td data-label="完整性">
                        <StatusBadge value={receipt.integrity_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          : <EmptyState title="此行程未有收據" />}
      </section>

      <section className="detail-grid">
        <div className="data-section">
          <header>
            <div>
              <h2>待處理邀請</h2>
              <p>只顯示此行程最近 50 項邀請狀態</p>
            </div>
          </header>
          {trip.invites.length
            ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="行程邀請資料表"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">身份</th>
                      <th scope="col">角色</th>
                      <th scope="col">狀態</th>
                      <th scope="col">到期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trip.invites.map((invite) => (
                      <tr key={invite.id}>
                        <td data-label="身份">
                          {invite.masked_email || "未有電郵"}
                        </td>
                        <td data-label="角色">{invite.role}</td>
                        <td data-label="狀態">
                          <StatusBadge value={invite.status} />
                        </td>
                        <td data-label="到期">
                          {formatDateTime(invite.expires_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <EmptyState title="沒有待處理邀請" />}
        </div>

        <div className="data-section">
          <header>
            <div>
              <h2>最近審計</h2>
              <p>與此行程 target hash 對應的最近操作</p>
            </div>
            <Link className="text-link" to={`/audit?targetId=${tripId}`}>
              查看全部
            </Link>
          </header>
          {auditQuery.isLoading
            ? <LoadingState label="載入相關審計" />
            : auditQuery.isError
            ? <ErrorState error={auditQuery.error} retry={() => void auditQuery.refetch()} />
            : auditEvents.length
            ? (
              <ol className="operation-list">
                {auditEvents.map((event) => (
                  <li key={event.id}>
                    <span>
                      <strong>{event.action}</strong>
                      <small>
                        {event.request_id || "no request id"} · {auditResultLabel(
                          event.result,
                          event.error_code,
                        )}
                      </small>
                    </span>
                    <time>{formatDateTime(event.created_at)}</time>
                  </li>
                ))}
              </ol>
            )
            : <EmptyState title="未有相關審計事件" />}
        </div>
      </section>
      <OperationDialog flow={operationFlow} />
    </div>
  );
}

function inclusiveCalendarDates(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return [];
  }
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const dates: string[] = [];
  for (let value = start; value <= end && dates.length <= 366; value += 86_400_000) {
    dates.push(new Date(value).toISOString().slice(0, 10));
  }
  return dates.length <= 366 && dates[0] === startDate && dates.at(-1) === endDate ? dates : [];
}

function cloneItineraryDays(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({
    ...day,
    spots: day.spots.map((spot) => ({ ...spot })),
  }));
}

function daysForRange(startDate: string, endDate: string, days: ItineraryDay[]) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return inclusiveCalendarDates(startDate, endDate).map((date, index) => {
    const existing = byDate.get(date);
    return existing
      ? { ...existing, spots: existing.spots.map((spot) => ({ ...spot })) }
      : { date, title: `Day ${index + 1}`, spots: [] };
  });
}

function normalizeItineraryDays(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({
    date: day.date,
    title: day.title.trim(),
    ...(day.location?.trim() ? { location: day.location.trim() } : {}),
    ...(day.notes?.trim() ? { notes: day.notes.trim() } : {}),
    spots: day.spots.map((spot, index) => ({
      id: spot.id,
      name: spot.name.trim(),
      ...(spot.time?.trim() ? { time: spot.time.trim() } : {}),
      ...(spot.address?.trim() ? { address: spot.address.trim() } : {}),
      order: index,
    })),
  }));
}

export function ItineraryPage() {
  const { tripId = "" } = useParams();
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftDays, setDraftDays] = useState<ItineraryDay[]>([]);
  const [explicitlyRemovedDates, setExplicitlyRemovedDates] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["admin", "trip", tripId, "itinerary"],
    queryFn: ({ signal }) =>
      adminGet<ItineraryData>(`/trips/${tripId}/itinerary`, undefined, signal),
    enabled: Boolean(tripId),
  });
  const versionsQuery = useQuery({
    queryKey: ["admin", "trip", tripId, "itinerary", "versions"],
    queryFn: ({ signal }) =>
      adminGet<ItineraryVersionsData>(
        `/trips/${tripId}/itinerary/versions`,
        { limit: "50" },
        signal,
      ),
    enabled: Boolean(tripId),
  });
  const operationFlow = useOperationFlow(async () => {
    setEditing(false);
    await Promise.all([query.refetch(), versionsQuery.refetch()]);
  });
  const loadedItinerary = query.data?.data;
  useEffect(() => {
    if (!loadedItinerary) return;
    setDraftStart(loadedItinerary.startDate);
    setDraftEnd(loadedItinerary.endDate);
    setDraftDays(cloneItineraryDays(loadedItinerary.days));
    setExplicitlyRemovedDates([]);
  }, [loadedItinerary?.tripId, loadedItinerary?.version]);
  if (query.isLoading) return <LoadingState label="載入行程表" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  const itinerary = query.data.data;
  const canMutate = adminMetaAllowsMutation(query.data.meta, query.isFetching);
  const rangeDates = inclusiveCalendarDates(draftStart, draftEnd);
  const visibleDraftDays = daysForRange(draftStart, draftEnd, draftDays);
  const rangeDateSet = new Set(rangeDates);
  const blockedDays = draftDays.filter((day) => !rangeDateSet.has(day.date));
  const removedDates = explicitlyRemovedDates
    .filter((date) => !rangeDateSet.has(date))
    .sort();
  const normalizedDraft = normalizeItineraryDays(visibleDraftDays);
  const invalidSpot = normalizedDraft.some((day) => day.spots.some((spot) => !spot.name));
  const changed = draftStart !== itinerary.startDate || draftEnd !== itinerary.endDate ||
    JSON.stringify(normalizedDraft) !== JSON.stringify(normalizeItineraryDays(itinerary.days));
  const canRestore = canMutate && Boolean(versionsQuery.data) &&
    adminMetaAllowsMutation(versionsQuery.data?.meta || query.data.meta, versionsQuery.isFetching);

  function updateDraftDay(date: string, update: (day: ItineraryDay) => ItineraryDay) {
    setDraftDays((current) => {
      const existing = current.find((day) => day.date === date) ||
        visibleDraftDays.find((day) => day.date === date) || { date, title: "", spots: [] };
      const next = update({ ...existing, spots: existing.spots.map((spot) => ({ ...spot })) });
      const found = current.some((day) => day.date === date);
      return found
        ? current.map((day) => day.date === date ? next : day)
        : [...current, next];
    });
  }
  return (
    <div className="workspace-stack">
      <Link className="back-link" to={`/data/trips/${tripId}`}>
        <ArrowLeft size={16} />返回行程詳情
      </Link>
      <PageHeader
        title="行程表"
        description={`${itinerary.startDate} 至 ${itinerary.endDate} · ${itinerary.days.length} 日 · Version ${itinerary.version}`}
        actions={
          <button
            className="button secondary"
            type="button"
            disabled={!canMutate}
            onClick={() => {
              setDraftStart(itinerary.startDate);
              setDraftEnd(itinerary.endDate);
              setDraftDays(cloneItineraryDays(itinerary.days));
              setExplicitlyRemovedDates([]);
              setEditing((value) => !value);
            }}
          >
            <Pencil size={16} />{editing ? "關閉編輯" : "編輯行程"}
          </button>
        }
      />
      <FreshnessBanner meta={query.data.meta} fetching={query.isFetching} />
      {editing && (
        <section className="data-section admin-editor itinerary-editor" aria-labelledby="itinerary-editor-title">
          <header>
            <div>
              <h2 id="itinerary-editor-title">編輯 canonical itinerary</h2>
              <p>日期範圍內每日都會保留；未傳送的日子不會被當成刪除</p>
            </div>
            <button
              className="icon-button"
              type="button"
              title="關閉行程編輯器"
              aria-label="關閉行程編輯器"
              onClick={() => setEditing(false)}
            >
              <X size={17} />
            </button>
          </header>
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !canMutate || !changed || rangeDates.length === 0 ||
                blockedDays.length > 0 || invalidSpot
              ) return;
              operationFlow.begin({
                action: "itinerary_amend",
                targetId: itinerary.tripId,
                payload: {
                  endDate: draftEnd,
                  expectedVersion: itinerary.version,
                  itinerary: normalizedDraft,
                  removedDates,
                  startDate: draftStart,
                },
              });
            }}
          >
            <div className="itinerary-range-fields">
              <label>
                <span>開始日期</span>
                <input
                  required
                  type="date"
                  value={draftStart}
                  onChange={(event) => setDraftStart(event.target.value)}
                />
              </label>
              <label>
                <span>結束日期</span>
                <input
                  required
                  type="date"
                  value={draftEnd}
                  onChange={(event) => setDraftEnd(event.target.value)}
                />
              </label>
              <div className="range-summary" role="status">
                <span>Inclusive days</span>
                <strong>{rangeDates.length || "無效"}</strong>
              </div>
            </div>

            {blockedDays.length > 0 && (
              <div className="integrity-warning" role="alert">
                <strong>縮短日期前要處理範圍外內容</strong>
                <span>先將內容移到保留日，再逐項明確移除以下日期。</span>
                <ul className="blocked-day-list">
                  {blockedDays.map((day) => (
                    <li key={day.date}>
                      <span>{day.date} · {day.title || "未命名"} · {day.spots.length} spots</span>
                      <button
                        className="button secondary danger-action"
                        type="button"
                        onClick={() => {
                          setExplicitlyRemovedDates((current) =>
                            current.includes(day.date) ? current : [...current, day.date]
                          );
                          setDraftDays((current) =>
                            current.filter((item) => item.date !== day.date)
                          );
                        }}
                      >
                        <Trash2 size={15} />明確移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="itinerary-editor-days">
              {visibleDraftDays.map((day, dayIndex) => (
                <article className="itinerary-day-editor" key={day.date}>
                  <header>
                    <span>Day {dayIndex + 1}</span>
                    <strong>{day.date}</strong>
                    <StatusBadge
                      value={day.spots.length ? "active" : "warning"}
                      label={`${day.spots.length} spots`}
                    />
                  </header>
                  <div className="day-editor-fields">
                    <label>
                      <span>標題</span>
                      <input
                        maxLength={160}
                        value={day.title}
                        onChange={(event) =>
                          updateDraftDay(day.date, (current) => ({
                            ...current,
                            title: event.target.value,
                          }))}
                      />
                    </label>
                    <label>
                      <span>地點</span>
                      <input
                        maxLength={240}
                        value={day.location || ""}
                        onChange={(event) =>
                          updateDraftDay(day.date, (current) => ({
                            ...current,
                            location: event.target.value,
                          }))}
                      />
                    </label>
                    <label className="field-wide">
                      <span>備註</span>
                      <textarea
                        maxLength={1900}
                        rows={2}
                        value={day.notes || ""}
                        onChange={(event) =>
                          updateDraftDay(day.date, (current) => ({
                            ...current,
                            notes: event.target.value,
                          }))}
                      />
                    </label>
                  </div>
                  <div className="spot-editor-list">
                    {day.spots.map((spot, spotIndex) => (
                      <div className="spot-editor-row" key={spot.id}>
                        <label>
                          <span>時間</span>
                          <input
                            type="time"
                            lang="en-GB"
                            value={spot.time || ""}
                            onChange={(event) =>
                              updateDraftDay(day.date, (current) => ({
                                ...current,
                                spots: current.spots.map((item, index) =>
                                  index === spotIndex ? { ...item, time: event.target.value } : item
                                ),
                              }))}
                          />
                        </label>
                        <label>
                          <span>景點</span>
                          <input
                            required
                            maxLength={240}
                            value={spot.name}
                            onChange={(event) =>
                              updateDraftDay(day.date, (current) => ({
                                ...current,
                                spots: current.spots.map((item, index) =>
                                  index === spotIndex ? { ...item, name: event.target.value } : item
                                ),
                              }))}
                          />
                        </label>
                        <label>
                          <span>地址</span>
                          <input
                            maxLength={500}
                            value={spot.address || ""}
                            onChange={(event) =>
                              updateDraftDay(day.date, (current) => ({
                                ...current,
                                spots: current.spots.map((item, index) =>
                                  index === spotIndex ? { ...item, address: event.target.value } : item
                                ),
                              }))}
                          />
                        </label>
                        <button
                          className="icon-button danger-action"
                          type="button"
                          title={`移除 ${spot.name || "景點"}`}
                          aria-label={`移除 ${spot.name || "景點"}`}
                          onClick={() =>
                            updateDraftDay(day.date, (current) => ({
                              ...current,
                              spots: current.spots.filter((_, index) => index !== spotIndex),
                            }))}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="button secondary add-spot-button"
                      type="button"
                      onClick={() =>
                        updateDraftDay(day.date, (current) => ({
                          ...current,
                          spots: [
                            ...current.spots,
                            {
                              id: crypto.randomUUID(),
                              name: "",
                              order: current.spots.length,
                            },
                          ],
                        }))}
                    >
                      <Plus size={16} />加入景點
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <footer className="form-actions">
              <span>
                {rangeDates.length} 日 · {normalizedDraft.reduce((sum, day) => sum + day.spots.length, 0)} spots
              </span>
              <button className="button secondary" type="button" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={
                  !canMutate || !changed || rangeDates.length === 0 ||
                  blockedDays.length > 0 || invalidSpot
                }
              >
                <Save size={16} />預覽完整行程
              </button>
            </footer>
          </form>
        </section>
      )}
      {itinerary.integrityIssues.length > 0 && (
        <section className="integrity-warning" role="status">
          <strong>行程完整性警告</strong>
          <span>
            系統已補回所有日期空白列；range 外內容不會顯示成有效行程。
          </span>
          <ul>
            {itinerary.integrityIssues.map((issue, index) => (
              <li key={`${issue.code}-${issue.date}-${index}`}>
                <code>{issue.code}</code>
                {issue.date ? ` · ${issue.date}` : ""}
                {issue.spotCount ? ` · ${issue.spotCount} spots` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!editing && <ol className="itinerary-days">
        {itinerary.days.map((day, index) => (
          <li key={day.date} className="itinerary-day">
            <header>
              <span>Day {index + 1}</span>
              <div>
                <h2>{day.title}</h2>
                <p>
                  <CalendarDays size={14} />
                  {day.date}
                  {day.location && (
                    <>
                      <MapPin size={14} />
                      {day.location}
                    </>
                  )}
                </p>
              </div>
              <StatusBadge
                value={day.spots.length ? "active" : "warning"}
                label={day.spots.length
                  ? `${day.spots.length} spots`
                  : "空白日"}
              />
            </header>
            {day.notes && <p className="day-notes">{day.notes}</p>}
            {day.spots.length
              ? (
                <ol className="spot-list">
                  {day.spots.map((spot) => (
                    <li key={spot.id}>
                      <time>{spot.time || "--:--"}</time>
                      <span>
                        <strong>{spot.name}</strong>
                        {spot.address && <small>{spot.address}</small>}
                      </span>
                    </li>
                  ))}
                </ol>
              )
              : (
                <div className="missing-day-row">
                  此日未有儲存景點；日期仍保留，避免行程消失。
                </div>
              )}
          </li>
        ))}
      </ol>}
      <section className="data-section">
        <header>
          <div>
            <h2>Version history</h2>
            <p>每次完整 itinerary update 都保存獨立 snapshot</p>
          </div>
        </header>
        {versionsQuery.isLoading
          ? <LoadingState label="載入 itinerary versions" />
          : versionsQuery.isError || !versionsQuery.data
          ? (
            <ErrorState
              error={versionsQuery.error}
              retry={() => void versionsQuery.refetch()}
            />
          )
          : versionsQuery.data.data.items.length
          ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="行程版本資料表"
            >
              <table>
                <caption className="sr-only">行程版本紀錄</caption>
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">來源</th>
                    <th scope="col">日期範圍</th>
                    <th scope="col">Days</th>
                    <th scope="col">建立時間</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versionsQuery.data.data.items.map((version) => (
                    <tr key={version.version}>
                      <td data-label="Version">
                        <strong>v{version.version}</strong>{" "}
                        {version.version === itinerary.version && (
                          <StatusBadge value="active" label="Current" />
                        )}
                      </td>
                      <td data-label="來源">
                        <StatusBadge value={version.source} />
                      </td>
                      <td data-label="日期範圍">
                        {version.start_date} 至 {version.end_date}
                      </td>
                      <td data-label="Days">
                        {Array.isArray(version.itinerary)
                          ? version.itinerary.length
                          : 0}
                      </td>
                      <td data-label="建立時間">
                        {formatDateTime(version.created_at)}
                      </td>
                      <td data-label="操作" className="row-actions">
                        {version.version !== itinerary.version && (
                          <button
                            className="icon-button"
                            type="button"
                            title={`還原 v${version.version}`}
                            aria-label={`還原行程版本 ${version.version}`}
                            disabled={!canRestore}
                            onClick={() =>
                              operationFlow.begin({
                                action: "itinerary_restore",
                                targetId: itinerary.tripId,
                                payload: {
                                  expectedVersion: itinerary.version,
                                  restoreVersion: version.version,
                                },
                              })}
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          : <EmptyState title="未有 itinerary version snapshot" />}
      </section>
      <OperationDialog flow={operationFlow} />
    </div>
  );
}
