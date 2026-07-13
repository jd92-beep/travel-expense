import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  MonitorSmartphone,
  RefreshCw,
  Search,
  Smartphone,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { adminGet, queryFromSearchParams } from "../../../lib/api/adminClient";
import type {
  AccountRow,
  AdminEnvelope,
  IncidentRow,
  PagedData,
  ReceiptRow,
  TripRow,
} from "../../../lib/contracts/admin";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  formatMoney,
  FreshnessBanner,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
  useCursorPagination,
  WorkspaceNav,
} from "../../../components/primitives/ConsolePrimitives";
import {
  OperationDialog,
  useOperationFlow,
} from "../../operations/OperationFlow";

const DATA_NAV = [
  { to: "/data/accounts", label: "帳戶" },
  { to: "/data/trips", label: "行程" },
  { to: "/data/receipts", label: "收據" },
];

export function AccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cursorPager = useCursorPagination(searchParams, setSearchParams);
  const queryText = searchParams.get("q") || "";
  const [draft, setDraft] = useState(queryText);
  useEffect(() => setDraft(queryText), [queryText]);
  const queryValues = queryFromSearchParams(searchParams, [
    "q",
    "status",
    "platform",
    "cursor",
    "limit",
    "sort",
    "direction",
  ]);
  const query = useQuery({
    queryKey: ["admin", "accounts", queryValues],
    queryFn: ({ signal }) =>
      adminGet<PagedData<AccountRow>>("/accounts", queryValues, signal),
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
        title="帳戶"
        description="Supabase identities、client installations 及每帳戶同步健康狀態"
        actions={
          <button
            className="button secondary"
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
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
          <span className="sr-only">搜尋帳戶</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="以 UUID、顯示名稱或 masked email prefix 搜尋"
          />
        </label>
        <select
          aria-label="帳戶狀態"
          value={searchParams.get("status") || ""}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="">全部狀態</option>
          <option value="active">Active</option>
          <option value="risk">Risk</option>
          <option value="banned">Banned</option>
          <option value="deleted">Deleted</option>
        </select>
        <select
          aria-label="Client 平台"
          value={searchParams.get("platform") || ""}
          onChange={(event) => setFilter("platform", event.target.value)}
        >
          <option value="">全部平台</option>
          <option value="compact">Compact Web</option>
          <option value="android">Android</option>
        </select>
        <button className="button primary" type="submit">
          <Search size={16} />搜尋
        </button>
      </form>

      {query.isLoading
        ? <LoadingState label="載入帳戶" />
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
                  <h2>帳戶清單</h2>
                  <p>
                    {query.data.meta.total ?? query.data.data.items.length}{" "}
                    個結果；email 預設遮罩
                  </p>
                </div>
              </header>
              {query.data.data.items.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="帳戶資料表"
                  >
                    <table>
                      <caption className="sr-only">帳戶清單</caption>
                      <thead>
                        <tr>
                          <th scope="col">身份</th>
                          <th scope="col">最後出現</th>
                          <th scope="col">Clients</th>
                          <th scope="col">行程</th>
                          <th scope="col">收據</th>
                          <th scope="col">Cloud sync</th>
                          <th scope="col">Personal Notion</th>
                          <th scope="col">Shared Mirror</th>
                          <th scope="col">Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.items.map((account) => (
                          <tr key={account.id}>
                            <td data-label="身份">
                              <Link
                                className="entity-link"
                                to={`/data/accounts/${account.id}`}
                              >
                                {account.display_name || account.masked_email}
                              </Link>
                              <small>
                                {account.masked_email}
                                <br />
                                <code>{account.id.slice(0, 8)}</code>
                              </small>
                            </td>
                            <td data-label="最後出現">
                              {formatDateTime(account.last_seen_at)}
                            </td>
                            <td data-label="Clients">
                              <span className="platform-icons">
                                {account.compact_last_seen_at && (
                                  <span
                                    title={`Compact ${
                                      account.compact_version || ""
                                    }`}
                                  >
                                    <MonitorSmartphone size={16} />Compact
                                  </span>
                                )}
                                {account.android_last_seen_at && (
                                  <span
                                    title={`Android ${
                                      account.android_version || ""
                                    }`}
                                  >
                                    <Smartphone size={16} />Android
                                  </span>
                                )}
                                {!account.compact_last_seen_at &&
                                  !account.android_last_seen_at && "未回報"}
                              </span>
                            </td>
                            <td data-label="行程">{account.trip_count}</td>
                            <td data-label="收據">{account.receipt_count}</td>
                            <td data-label="Cloud sync">
                              <StatusBadge
                                value={account.failed_sync_jobs
                                  ? "failed"
                                  : "healthy"}
                                label={account.failed_sync_jobs
                                  ? `${account.failed_sync_jobs} failed`
                                  : "Healthy"}
                              />
                            </td>
                            <td data-label="Personal Notion">
                              <StatusBadge value={account.notion_status} />
                            </td>
                            <td data-label="Shared Mirror">
                              <StatusBadge
                                value={account.shared_mirror_status}
                              />
                            </td>
                            <td data-label="Risk">
                              <StatusBadge
                                value={account.status}
                                label={account.open_risk
                                  ? `${account.open_risk} risks`
                                  : account.status}
                              />
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
                      ? "沒有符合篩選條件的帳戶"
                      : "目前沒有帳戶"}
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

type AccountIntegration = {
  provider: string;
  status: string;
  external_account_label: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type AccountAuditRow = {
  id: string;
  action: string;
  target_type: string;
  request_id: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
};

type AccountDetail = {
  identity: AccountRow & {
    email?: string;
    emailConfirmedAt?: string;
    bannedUntil?: string | null;
    deletedAt?: string | null;
    created_at?: string;
    isSsoUser?: boolean;
    isAnonymous?: boolean;
  };
  integrations: AccountIntegration[];
  trips: TripRow[];
  recentReceipts: ReceiptRow[];
  incidents: IncidentRow[];
  audit: AccountAuditRow[];
};

type Installation = {
  installation_id: string;
  app_surface: string;
  app_build: string | null;
  contract_version: number | null;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  client_summary: string | null;
};

function downloadSupportBundle(bundle: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `travel-expense-support-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AccountDetailPage() {
  const { accountId = "" } = useParams();
  const account = useQuery({
    queryKey: ["admin", "account", accountId],
    queryFn: ({ signal }) =>
      adminGet<AccountDetail>(`/accounts/${accountId}`, undefined, signal),
    enabled: Boolean(accountId),
  });
  const installations = useQuery({
    queryKey: ["admin", "account", accountId, "installations"],
    queryFn: ({ signal }) =>
      adminGet<Installation[]>(
        `/accounts/${accountId}/installations`,
        undefined,
        signal,
      ),
    enabled: Boolean(accountId),
  });
  const operationFlow = useOperationFlow((result) => {
    if (result.bundle) downloadSupportBundle(result.bundle);
  });
  if (account.isLoading) return <LoadingState label="載入帳戶詳情" />;
  if (account.isError || !account.data) {
    return (
      <ErrorState
        error={account.error}
        retry={() => void account.refetch()}
      />
    );
  }
  const detail = account.data.data;
  return (
    <div className="workspace-stack">
      <Link className="back-link" to="/data/accounts">
        <ArrowLeft size={16} />返回帳戶
      </Link>
      <PageHeader
        title={detail.identity.display_name || detail.identity.masked_email}
        description={detail.identity.email || detail.identity.masked_email}
        actions={
          <>
            <StatusBadge value={detail.identity.status} />
            <button
              className="button secondary"
              type="button"
              disabled={account.isFetching}
              onClick={() =>
                operationFlow.begin({
                  action: "support_bundle",
                  targetId: accountId,
                  payload: { includeJobs: true, userId: accountId },
                })}
            >
              <Download size={16} />Support bundle
            </button>
          </>
        }
      />
      <FreshnessBanner meta={account.data.meta} fetching={account.isFetching} />
      <section className="detail-grid">
        <div className="data-section">
          <header>
            <div>
              <h2>Identity</h2>
              <p>Supabase auth 及 profile 狀態</p>
            </div>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Account UUID</dt>
              <dd>
                <code>{detail.identity.id}</code>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.identity.email || detail.identity.masked_email}</dd>
            </div>
            <div>
              <dt>最後出現</dt>
              <dd>{formatDateTime(detail.identity.last_seen_at)}</dd>
            </div>
            <div>
              <dt>建立</dt>
              <dd>{formatDateTime(detail.identity.created_at)}</dd>
            </div>
            <div>
              <dt>Email confirmed</dt>
              <dd>{formatDateTime(detail.identity.emailConfirmedAt)}</dd>
            </div>
            <div>
              <dt>SSO / anonymous</dt>
              <dd>
                {detail.identity.isSsoUser ? "SSO" : "Passwordless"} ·{" "}
                {detail.identity.isAnonymous ? "anonymous" : "identified"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="data-section">
          <header>
            <div>
              <h2>Cloud sync</h2>
              <p>共用後端與 Notion 狀態</p>
            </div>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Failed jobs</dt>
              <dd>{detail.identity.failed_sync_jobs}</dd>
            </div>
            <div>
              <dt>Last sync</dt>
              <dd>{formatDateTime(detail.identity.last_sync_at)}</dd>
            </div>
            <div>
              <dt>Personal Notion</dt>
              <dd>
                <StatusBadge value={detail.identity.notion_status} />
              </dd>
            </div>
            <div>
              <dt>Shared Mirror</dt>
              <dd>
                <StatusBadge value={detail.identity.shared_mirror_status} />
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="data-section">
        <header>
          <div>
            <h2>Client installations</h2>
            <p>Client-reported pseudonymous installation identifiers</p>
          </div>
        </header>
        {installations.isLoading
          ? <LoadingState />
          : installations.isError || !installations.data
          ? (
            <ErrorState
              error={installations.error}
              retry={() => void installations.refetch()}
            />
          )
          : installations.data.data.length
          ? (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Client installations 資料表"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">平台</th>
                    <th scope="col">Installation</th>
                    <th scope="col">版本</th>
                    <th scope="col">Contract</th>
                    <th scope="col">首次</th>
                    <th scope="col">最後</th>
                    <th scope="col">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {installations.data.data.map((item) => (
                    <tr key={`${item.app_surface}-${item.installation_id}`}>
                      <td data-label="平台">{item.app_surface}</td>
                      <td data-label="Installation">
                        <code>{item.installation_id}</code>
                      </td>
                      <td data-label="版本">{item.app_build || "unknown"}</td>
                      <td data-label="Contract">
                        {item.contract_version
                          ? <code>v{item.contract_version}</code>
                          : "unknown"}
                      </td>
                      <td data-label="首次">
                        {formatDateTime(item.first_seen_at)}
                      </td>
                      <td data-label="最後">
                        {formatDateTime(item.last_seen_at)}
                      </td>
                      <td data-label="Events">{item.event_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          : <EmptyState title="未有 installation heartbeat" />}
      </section>
      <section className="data-section">
        <header>
          <div>
            <h2>行程與近期收據</h2>
            <p>按需要載入的帳戶關聯資料</p>
          </div>
        </header>
        <div className="split-lists">
          <div>
            <h3>行程 ({detail.trips.length})</h3>
            {detail.trips.map((item) => (
              <Link
                key={item.id}
                className="compact-row"
                to={`/data/trips/${item.id}`}
              >
                <strong>{item.name || item.id}</strong>
                <span>{item.destination_summary || "未有目的地"}</span>
              </Link>
            ))}
          </div>
          <div>
            <h3>近期收據 ({detail.recentReceipts.length})</h3>
            {detail.recentReceipts.map((item) => (
              <Link
                key={item.id}
                className="compact-row"
                to={`/data/receipts/${item.id}`}
              >
                <strong>{item.store || item.id}</strong>
                <span>{formatMoney(item.amount, item.currency)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="detail-grid">
        <div className="data-section">
          <header>
            <div>
              <h2>Integrations</h2>
              <p>只顯示 metadata；credential values 永遠不會返回 browser</p>
            </div>
          </header>
          {detail.integrations.length
            ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="帳戶 integrations 資料表"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Provider</th>
                      <th scope="col">狀態</th>
                      <th scope="col">Account</th>
                      <th scope="col">最後同步</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.integrations.map((integration) => (
                      <tr key={`${integration.provider}-${integration.created_at}`}>
                        <td data-label="Provider">{integration.provider}</td>
                        <td data-label="狀態">
                          <StatusBadge value={integration.status} />
                        </td>
                        <td data-label="Account">
                          {integration.external_account_label || "未有標籤"}
                        </td>
                        <td data-label="最後同步">
                          {formatDateTime(integration.last_synced_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <EmptyState title="此帳戶未設定 integration" />}
        </div>
        <div className="data-section">
          <header>
            <div>
              <h2>Incidents</h2>
              <p>與此帳戶明確關聯的最近事件</p>
            </div>
            <Link className="text-link" to="/reliability/incidents">
              查看全部
            </Link>
          </header>
          {detail.incidents.length
            ? (
              <ol className="operation-list">
                {detail.incidents.map((incident) => (
                  <li key={incident.id}>
                    <span>
                      <strong>{incident.title}</strong>
                      <small>{incident.kind} · {incident.status}</small>
                    </span>
                    <span className="operation-list-status">
                      <StatusBadge value={incident.severity} />
                      <time>{formatDateTime(incident.created_at)}</time>
                    </span>
                  </li>
                ))}
              </ol>
            )
            : <EmptyState title="沒有帳戶相關 incident" />}
        </div>
      </section>
      <section className="data-section">
        <header>
          <div>
            <h2>最近審計</h2>
            <p>與此帳戶 target hash 對應的最近 20 項操作</p>
          </div>
          <Link className="text-link" to={`/audit?targetId=${accountId}`}>
            查看全部
          </Link>
        </header>
        {detail.audit.length
          ? (
            <ol className="operation-list">
              {detail.audit.map((event) => (
                <li key={event.id}>
                  <span>
                    <strong>{event.action}</strong>
                    <small>
                      {event.target_type} · {event.request_id || "no request id"}
                    </small>
                  </span>
                  <time>{formatDateTime(event.created_at)}</time>
                </li>
              ))}
            </ol>
          )
          : <EmptyState title="未有相關審計事件" />}
      </section>
      <OperationDialog flow={operationFlow} />
    </div>
  );
}
