import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  AlertTriangle,
  Database,
  RefreshCw,
  Smartphone,
  Workflow,
} from "lucide-react";
import { adminGet } from "../../lib/api/adminClient";
import type { OverviewData } from "../../lib/contracts/admin";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  FreshnessBanner,
  LoadingState,
  Metric,
  PageHeader,
  StatusBadge,
} from "../../components/primitives/ConsolePrimitives";
import { BlurFade } from "../../components/fx/BlurFade";

const STAGGER_STEP_S = 0.04;
const HEALTHY_STATUS = new Set(["healthy", "active", "connected", "live"]);

const SOURCE_LABELS: Record<string, string> = {
  "shared-cloud": "Shared Backend",
  "compact-web": "Compact Web",
  android: "Android",
  notion: "Notion",
  broker: "Credential Broker",
};

export function OverviewPage() {
  const query = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: ({ signal }) =>
      adminGet<OverviewData>("/overview", undefined, signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="總覽" />
        <LoadingState label="載入營運總覽" />
      </>
    );
  }
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader title="總覽" />
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </>
    );
  }
  const { data, meta } = query.data;

  return (
    <div className="workspace-stack overview-page">
      <PageHeader
        title="總覽"
        description="Compact Web、Android 與共用後端的即時營運狀態"
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
      <FreshnessBanner meta={meta} fetching={query.isFetching} />

      {data.incidents.length > 0
        ? (
          <section
            className="incident-banner"
            aria-labelledby="critical-incidents-title"
          >
            <AlertTriangle size={20} />
            <div>
              <h2 id="critical-incidents-title">需要立即處理</h2>
              {data.incidents.map((incident) => (
                <Link
                  key={incident.id}
                  to={`/reliability/incidents?severity=${incident.severity}`}
                >
                  <StatusBadge value={incident.severity} />
                  <span>{incident.title}</span>
                  <time>{formatDateTime(incident.created_at)}</time>
                </Link>
              ))}
            </div>
          </section>
        )
        : (
          <div className="overview-positive-empty">
            <EmptyState
              title="目前沒有 P0／P1 incidents"
              detail={`最後檢查 ${formatDateTime(meta.generatedAt)}`}
            />
          </div>
        )}

      <section className="status-strip" aria-label="系統狀態" tabIndex={0}>
        {data.statusStrip.map((source, index) => (
          <BlurFade
            key={source.id}
            delay={index * STAGGER_STEP_S}
            className={`status-unit ${HEALTHY_STATUS.has(source.status) ? "status-unit-healthy" : ""}`}
          >
            <span>
              {source.id === "android"
                ? <Smartphone size={17} />
                : source.id === "shared-cloud"
                ? <Database size={17} />
                : <Workflow size={17} />}
              {SOURCE_LABELS[source.id] || source.id}
            </span>
            <StatusBadge
              value={source.status}
              label={source.status === "awaiting_heartbeat" ? "待首次心跳" : undefined}
            />
            <small>
              {source.status === "awaiting_heartbeat"
                ? "尚未收到首次 client 心跳，暫無最後回報時間"
                : formatDateTime(source.lastSeenAt)}
            </small>
          </BlurFade>
        ))}
      </section>

      <section className="metric-strip" aria-label="核心指標">
        <Metric label="Active accounts" value={data.counts.activeAccounts} delay={0 * STAGGER_STEP_S} />
        <Metric label="Open trips" value={data.counts.openTrips} delay={1 * STAGGER_STEP_S} />
        <Metric label="Recent receipts" value={data.counts.recentReceipts} delay={2 * STAGGER_STEP_S} />
        <Metric
          label="Failed jobs"
          value={data.counts.failedJobs}
          tone={data.counts.failedJobs ? "danger" : "success"}
          delay={3 * STAGGER_STEP_S}
        />
        <Metric
          label="Integrity issues"
          value={data.counts.integrityIssues}
          tone={data.counts.integrityIssues ? "warning" : "success"}
          delay={4 * STAGGER_STEP_S}
        />
      </section>

      <div className="overview-columns">
        <section className="data-section">
          <header>
            <div>
              <h2>Client 版本採用</h2>
              <p>只計最近回報的 Compact 與 Android installations</p>
            </div>
          </header>
          {data.clientVersions.length
            ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Client 版本採用資料表"
              >
                <table>
                  <caption className="sr-only">Client 版本採用</caption>
                  <thead>
                    <tr>
                      <th scope="col">平台</th>
                      <th scope="col">版本</th>
                      <th scope="col">Contract</th>
                      <th scope="col">Installations</th>
                      <th scope="col">最後回報</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clientVersions.map((version) => (
                      <tr key={`${version.app_surface}-${version.app_build}-${version.contract_version}`}>
                        <td data-label="平台">{version.app_surface}</td>
                        <td data-label="版本">
                          <code>{version.app_build}</code>
                        </td>
                        <td data-label="Contract">
                          {version.contract_version
                            ? <code>v{version.contract_version}</code>
                            : "unknown"}
                        </td>
                        <td data-label="Installations">
                          {version.installations}
                        </td>
                        <td data-label="最後回報">
                          {formatDateTime(version.last_seen_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : (
              <EmptyState
                title="未收到 client heartbeat"
                detail="安裝版本會在下一次 client 回報後顯示。"
              />
            )}
        </section>

        <section className="data-section">
          <header>
            <div>
              <h2>最近管理操作</h2>
              <p>只顯示最近五項已記錄操作</p>
            </div>
            <Link className="text-link" to="/audit">查看全部</Link>
          </header>
          {data.recentOperations.length
            ? (
              <ol className="operation-list">
                {data.recentOperations.map((operation) => (
                  <li key={operation.id}>
                    <span>
                      <strong>{operation.action}</strong>
                      <small>
                        {operation.target_type} ·{" "}
                        {operation.target_id_hash || "no target"}
                      </small>
                    </span>
                    <time>{formatDateTime(operation.created_at)}</time>
                  </li>
                ))}
              </ol>
            )
            : <EmptyState title="未有管理操作" />}
        </section>
      </div>
    </div>
  );
}
