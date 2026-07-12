import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { adminGet, queryFromSearchParams } from "../../lib/api/adminClient";
import type { AuditRow, PagedData } from "../../lib/contracts/admin";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  FreshnessBanner,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  useCursorPagination,
} from "../../components/primitives/ConsolePrimitives";

function last24HoursStart() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function isoToLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function localInputToIso(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const [defaultStartAt] = useState(last24HoursStart);
  const allTime = searchParams.get("range") === "all";
  const values = queryFromSearchParams(searchParams, [
    "action",
    "targetId",
    "targetType",
    "requestId",
    "result",
    "risk",
    "startAt",
    "endAt",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  if (!values.startAt && !allTime) values.startAt = defaultStartAt;
  useEffect(() => {
    if (searchParams.has("startAt") || allTime) return;
    const next = new URLSearchParams(searchParams);
    next.set("startAt", defaultStartAt);
    next.delete("cursor");
    setSearchParams(next, { replace: true });
  }, [defaultStartAt, searchParams, setSearchParams]);
  const query = useQuery({
    queryKey: ["admin", "audit", values],
    queryFn: ({ signal }) =>
      adminGet<PagedData<AuditRow>>("/audit", values, signal),
    placeholderData: keepPreviousData,
  });
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    if (key === "startAt" || key === "endAt") next.delete("range");
    setSearchParams(next);
  };
  const setRange = (range: "24h" | "all") => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    next.delete("endAt");
    if (range === "all") {
      next.delete("startAt");
      next.set("range", "all");
    } else {
      next.set("startAt", last24HoursStart());
      next.delete("range");
    }
    setSearchParams(next);
  };
  return (
    <div className="workspace-stack">
      <PageHeader
        title="審計紀錄"
        description="Append-only、tamper-evident admin events；預設 newest first"
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
      <div className="filter-bar">
        <input
          aria-label="Action"
          placeholder="Action"
          value={searchParams.get("action") || ""}
          onChange={(event) => setFilter("action", event.target.value)}
        />
        <select
          aria-label="Result"
          value={searchParams.get("result") || ""}
          onChange={(event) => setFilter("result", event.target.value)}
        >
          <option value="">全部結果</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
        </select>
        <select
          aria-label="Risk"
          value={searchParams.get("risk") || ""}
          onChange={(event) => setFilter("risk", event.target.value)}
        >
          <option value="">全部風險</option>
          {(["R0", "R1", "R2", "R3"] as const).map((risk) => (
            <option key={risk} value={risk}>{risk}</option>
          ))}
        </select>
        <input
          aria-label="Target UUID"
          placeholder="Target UUID"
          value={searchParams.get("targetId") || ""}
          onChange={(event) => setFilter("targetId", event.target.value)}
        />
        <input
          aria-label="Target type"
          placeholder="Target type"
          value={searchParams.get("targetType") || ""}
          onChange={(event) => setFilter("targetType", event.target.value)}
        />
        <input
          aria-label="開始日期"
          type="datetime-local"
          value={allTime ? "" : isoToLocalInput(searchParams.get("startAt") || defaultStartAt)}
          onChange={(event) =>
            setFilter("startAt", localInputToIso(event.target.value))}
        />
        <input
          aria-label="結束日期"
          type="datetime-local"
          value={isoToLocalInput(searchParams.get("endAt") || "")}
          onChange={(event) =>
            setFilter("endAt", localInputToIso(event.target.value))}
        />
        <input
          aria-label="Request ID"
          placeholder="Request ID"
          value={searchParams.get("requestId") || ""}
          onChange={(event) => setFilter("requestId", event.target.value)}
        />
        <button className="button secondary" type="button" aria-pressed={!allTime} onClick={() => setRange("24h")}>24 小時</button>
        <button className="button secondary" type="button" aria-pressed={allTime} onClick={() => setRange("all")}>全部時間</button>
      </div>
      {query.isLoading
        ? <LoadingState label="載入審計紀錄" />
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
                  <h2>Events</h2>
                  <p>{query.data.meta.total ?? 0} 個結果</p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="審計資料表"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">時間</th>
                          <th scope="col">Action</th>
                          <th scope="col">Risk</th>
                          <th scope="col">Target</th>
                          <th scope="col">Result</th>
                          <th scope="col">Request ID</th>
                          <th scope="col">Actor hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((event) => (
                          <tr key={event.id}>
                            <td data-label="時間">
                              <Link
                                className="text-link"
                                to={`/audit/${event.id}`}
                              >
                                {formatDateTime(event.created_at)}
                              </Link>
                            </td>
                            <td data-label="Action">{event.action}</td>
                            <td data-label="Risk">
                              <StatusBadge value={event.risk || "R0"} />
                            </td>
                            <td data-label="Target">
                              {event.target_type}
                              <small>
                                <code>{event.target_id_hash || "—"}</code>
                              </small>
                            </td>
                            <td data-label="Result">
                              <StatusBadge
                                value={event.result && event.result.ok === false
                                  || Boolean(event.error_code)
                                  ? "failed"
                                  : "succeeded"}
                              />
                            </td>
                            <td data-label="Request ID">
                              <code>{event.request_id || "—"}</code>
                            </td>
                            <td data-label="Actor hash">
                              <code>
                                {event.admin_subject_hash.slice(0, 12)}
                              </code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
                : <EmptyState title="沒有符合條件的審計事件" />}
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

export function AuditDetailPage() {
  const { eventId = "" } = useParams();
  const query = useQuery({
    queryKey: ["admin", "audit", eventId],
    queryFn: ({ signal }) =>
      adminGet<AuditRow>(`/audit/${eventId}`, undefined, signal),
    enabled: Boolean(eventId),
  });
  if (query.isLoading) return <LoadingState label="載入審計詳情" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }
  const event = query.data.data;
  return (
    <div className="workspace-stack">
      <Link className="back-link" to="/audit">
        <ArrowLeft size={16} />返回審計紀錄
      </Link>
      <PageHeader
        title={event.action}
        description={formatDateTime(event.created_at)}
      />
      <FreshnessBanner meta={query.data.meta} />
      <section className="data-section">
        <dl className="detail-list">
          <div>
            <dt>Event ID</dt>
            <dd>
              <code>{event.id}</code>
            </dd>
          </div>
          <div>
            <dt>Actor hash</dt>
            <dd>
              <code>{event.admin_subject_hash}</code>
            </dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>
              {event.authentication_method || "未有資料"} · <StatusBadge value={event.risk || "R0"} />
            </dd>
          </div>
          <div>
            <dt>Session hash</dt>
            <dd><code>{event.session_hash || "—"}</code></dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>
              {event.target_type} · <code>{event.target_id_hash || "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Request ID</dt>
            <dd>
              <code>{event.request_id || "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Preview counts</dt>
            <dd>
              <pre>{JSON.stringify(event.preview_counts, null, 2)}</pre>
            </dd>
          </div>
          <div>
            <dt>Before</dt>
            <dd><pre>{JSON.stringify(event.before_state, null, 2)}</pre></dd>
          </div>
          <div>
            <dt>After</dt>
            <dd><pre>{JSON.stringify(event.after_state, null, 2)}</pre></dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>
              <pre>{JSON.stringify(event.result, null, 2)}</pre>
            </dd>
          </div>
          <div>
            <dt>Hash chain</dt>
            <dd>
              Sequence {event.sequence ?? "—"}<br />
              <code>{event.previous_event_hash || "—"}</code><br />
              <code>{event.event_hash || "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Operation / Incident</dt>
            <dd>
              <code>{event.operation_id || "—"}</code> / <code>{event.incident_id || "—"}</code>
            </dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>
              Frontend {event.frontend_version || "unknown"} · Edge {event.edge_version || "unknown"} · Schema {event.schema_version || "unknown"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
