import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { adminGet } from "../../lib/api/adminClient";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  FreshnessBanner,
  LoadingState,
  PageHeader,
  StatusBadge,
  WorkspaceNav,
} from "../../components/primitives/ConsolePrimitives";
import {
  OperationDialog,
  useOperationFlow,
} from "../operations/OperationFlow";

const SYSTEM_NAV = [
  { to: "/system/providers", label: "Providers" },
  { to: "/system/releases", label: "Releases" },
  { to: "/system/infrastructure", label: "Infrastructure" },
];

type ProviderRow = {
  provider: string;
  label: string;
  configured: boolean | null;
  healthy: boolean | null;
  status: string;
  storedStatus: string;
  models: string[];
  requiredModel: string | null;
  actualModel: string | null;
  lastSuccessfulRequestAt: string | null;
  lastProbeAt: string | null;
  lastProbeMessage?: string | null;
  lastProbeStatus?: string | null;
  probeCooldownSeconds: number;
  probeAvailableAt: string | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  errors24h: number;
  rateLimited24h: number;
};

type RuntimeData = {
  adminFrontend: {
    version: string;
    gitSha: string;
    deploymentId: string;
    health: string;
  };
  edge: { deploymentId: string; sourceSha: string; routeVersion: string };
  broker: { version: string; health: string };
  database: {
    auditContractVersion: string;
    contractVersion: string;
    itineraryContractVersion: string;
    receiptContractVersion: string;
    schemaVersion: string;
  };
  clients: { compactVersion: string; androidVersion: string };
  runtimePolicy?: {
    status: "allowlisted" | "deny_all";
    version: "admin-write-mode-v1";
    source: string;
    expiresAt: null;
    writable: boolean;
  };
  drift: string[];
};

function providerProbeCoolingDown(provider: ProviderRow, now = Date.now()) {
  return Boolean(
    provider.probeAvailableAt &&
      Number.isFinite(Date.parse(provider.probeAvailableAt)) &&
      Date.parse(provider.probeAvailableAt) > now,
  );
}

export function ProvidersPage() {
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: ({ signal }) =>
      adminGet<ProviderRow[]>("/providers", undefined, signal),
    staleTime: 60_000,
  });
  const operationFlow = useOperationFlow(async () => {
    await query.refetch();
  });
  useEffect(() => {
    const availableAt = query.data?.data
      .map((provider) => Date.parse(provider.probeAvailableAt || ""))
      .filter((time) => Number.isFinite(time) && time > Date.now())
      .sort((left, right) => left - right)[0];
    if (!availableAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, availableAt - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [query.data?.data]);
  return (
    <div className="workspace-stack">
      <WorkspaceNav items={SYSTEM_NAV} />
      <PageHeader
        title="Providers"
        description="Configured、Healthy、實際 model、latency、errors 及 quota 分開顯示"
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
      {query.isLoading
        ? <LoadingState label="載入 provider 狀態" />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
            />
            <section className="data-section">
              <header>
                <div>
                  <h2>AI 與外部 providers</h2>
                  <p>
                    每個 provider 只顯示一次；Broker online 不等於 provider
                    healthy
                  </p>
                </div>
              </header>
              {query.data.data.length
                ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Provider 資料表"
                  >
                    <table className="provider-table">
                      <thead>
                        <tr>
                          <th scope="col">Provider</th>
                          <th scope="col">Configured</th>
                          <th scope="col">Health</th>
                          <th scope="col">App models</th>
                          <th scope="col">Required model</th>
                          <th scope="col">Actual model</th>
                          <th scope="col">Last success</th>
                          <th scope="col">Last probe</th>
                          <th scope="col">p50 / p95</th>
                          <th scope="col">Errors 24h</th>
                          <th scope="col">429 24h</th>
                          <th scope="col"><span className="sr-only">操作</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.data.map((provider) => {
                          const coolingDown = providerProbeCoolingDown(provider, now);
                          return (
                          <tr key={provider.provider}>
                            <td data-label="Provider">
                              <strong>{provider.label}</strong>
                              <small>{provider.provider}</small>
                            </td>
                            <td data-label="Configured">
                              <StatusBadge
                                value={provider.configured === true
                                  ? "active"
                                  : provider.configured === false
                                  ? "error"
                                  : "unknown"}
                                label={provider.configured === true
                                  ? "Configured"
                                  : provider.configured === false
                                  ? "Missing"
                                  : "Unknown"}
                              />
                            </td>
                            <td data-label="Health">
                              <StatusBadge
                                value={provider.status}
                                label={provider.healthy === true
                                  ? "Healthy"
                                  : provider.healthy === false
                                  ? "Failed"
                                  : "Unknown"}
                              />
                            </td>
                            <td data-label="App models">
                              {provider.models?.length
                                ? (
                                  <ul className="provider-model-list" aria-label={`${provider.label} app models`}>
                                    {provider.models.map((model) => <li key={model}><code>{model}</code></li>)}
                                  </ul>
                                )
                                : "—"}
                            </td>
                            <td data-label="Required model">
                              <code>{provider.requiredModel || "—"}</code>
                            </td>
                            <td data-label="Actual model">
                              <code>{provider.actualModel || "—"}</code>
                            </td>
                            <td data-label="Last success">
                              {formatDateTime(provider.lastSuccessfulRequestAt)}
                            </td>
                            <td data-label="Last probe">
                              {formatDateTime(provider.lastProbeAt)}
                              {provider.lastProbeStatus && (
                                <small>
                                  {provider.lastProbeStatus}
                                  {provider.lastProbeMessage ? ` · ${provider.lastProbeMessage}` : ""}
                                </small>
                              )}
                              {coolingDown && (
                                <small>
                                  Cooldown 至 {formatDateTime(provider.probeAvailableAt)}
                                </small>
                              )}
                            </td>
                            <td data-label="p50 / p95">
                              {provider.p50LatencyMs ?? "—"} /{" "}
                              {provider.p95LatencyMs ?? "—"} ms
                            </td>
                            <td data-label="Errors 24h">
                              {provider.errors24h}
                            </td>
                            <td data-label="429 24h">
                              {provider.rateLimited24h}
                            </td>
                            <td data-label="操作" className="row-actions">
                              <button
                                className="icon-button"
                                type="button"
                                title={coolingDown
                                  ? `Probe cooldown until ${formatDateTime(provider.probeAvailableAt)}`
                                  : `Probe ${provider.label}`}
                                aria-label={`Probe ${provider.label}`}
                                disabled={provider.configured === false || coolingDown || query.isFetching}
                                onClick={() =>
                                  operationFlow.begin({
                                    action: "provider_probe",
                                    targetId: provider.provider,
                                  })}
                              >
                                <Activity size={17} />
                              </button>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                )
                : <EmptyState title="沒有 provider 狀態" />}
            </section>
          </>
        )}
      <OperationDialog flow={operationFlow} />
    </div>
  );
}

function RuntimeView({ mode }: { mode: "releases" | "infrastructure" }) {
  const query = useQuery({
    queryKey: ["admin", "runtime"],
    queryFn: ({ signal }) =>
      adminGet<RuntimeData>("/runtime", undefined, signal),
    staleTime: 60_000,
  });
  const title = mode === "releases" ? "Releases" : "Infrastructure";
  const description = mode === "releases"
    ? "Frontend、Edge、Broker、database contract 與 client 版本 provenance"
    : "部署健康、source SHA、schema version 及 drift";
  return (
    <div className="workspace-stack">
      <WorkspaceNav items={SYSTEM_NAV} />
      <PageHeader
        title={title}
        description={description}
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
      {query.isLoading
        ? <LoadingState label="載入 runtime provenance" />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner
              meta={query.data.meta}
              fetching={query.isFetching}
            />
            {query.data.data.drift.length > 0
              ? (
                <section className="integrity-warning" role="alert">
                  <strong>偵測到 deployment drift</strong>
                  <ul>
                    {query.data.data.drift.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )
              : (
                <section className="integrity-ok" role="status">
                  <StatusBadge value="healthy" label="沒有偵測到 drift" />
                  <span>已核對目前回報的 deployment provenance。</span>
                </section>
              )}
            {mode === "releases"
              ? <ReleaseProvenance runtime={query.data.data} />
              : <InfrastructureHealth runtime={query.data.data} />}
          </>
        )}
    </div>
  );
}

function ReleaseProvenance({ runtime }: { runtime: RuntimeData }) {
  const rows = [
    {
      component: "Admin Console",
      version: runtime.adminFrontend.version,
      source: runtime.adminFrontend.gitSha,
      deployment: runtime.adminFrontend.deploymentId,
      status: runtime.adminFrontend.health,
    },
    {
      component: "Admin Edge",
      version: runtime.edge.routeVersion,
      source: runtime.edge.sourceSha,
      deployment: runtime.edge.deploymentId,
      status: "reported",
    },
    {
      component: "Credential Broker",
      version: runtime.broker.version,
      source: "runtime self-report",
      deployment: "external",
      status: runtime.broker.health,
    },
    {
      component: "Database contract",
      version: runtime.database.contractVersion,
      source: runtime.database.schemaVersion,
      deployment: "Supabase",
      status: "reported",
    },
    {
      component: "Compact Web",
      version: runtime.clients.compactVersion,
      source: "client heartbeat",
      deployment: "Compact",
      status: "reported",
    },
    {
      component: "Android",
      version: runtime.clients.androidVersion,
      source: "client heartbeat",
      deployment: "Android",
      status: "reported",
    },
  ];

  return (
    <section className="data-section">
      <header>
        <div>
          <h2>版本與部署 provenance</h2>
          <p>每一層獨立回報；Reported 不代表健康檢查已通過</p>
        </div>
      </header>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="版本與部署 provenance 資料表"
      >
        <table className="release-table">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Version / contract</th>
              <th scope="col">Source / schema</th>
              <th scope="col">Deployment</th>
              <th scope="col">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.component}>
                <td data-label="Component"><strong>{row.component}</strong></td>
                <td data-label="Version / contract"><code>{row.version || "unknown"}</code></td>
                <td data-label="Source / schema"><code>{row.source || "unknown"}</code></td>
                <td data-label="Deployment"><code>{row.deployment || "unknown"}</code></td>
                <td data-label="Signal">
                  <StatusBadge
                    value={row.status}
                    label={row.status === "reported" ? "Reported" : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InfrastructureHealth({ runtime }: { runtime: RuntimeData }) {
  const policy = runtime.runtimePolicy ?? {
    status: "deny_all" as const,
    version: "admin-write-mode-v1" as const,
    source: "default",
    expiresAt: null,
    writable: false,
  };
  return (
    <section className="runtime-grid" aria-label="基礎設施健康狀態">
      <div className="data-section">
        <header>
          <div><h2>Admin frontend</h2></div>
          <StatusBadge value={runtime.adminFrontend.health} />
        </header>
        <dl className="detail-list">
          <div><dt>Deployment ID</dt><dd><code>{runtime.adminFrontend.deploymentId || "unknown"}</code></dd></div>
          <div><dt>Git SHA</dt><dd><code>{runtime.adminFrontend.gitSha || "unknown"}</code></dd></div>
        </dl>
      </div>
      <div className="data-section">
        <header>
          <div><h2>Admin Edge</h2></div>
          <StatusBadge value="reported" label="Reported" />
        </header>
        <dl className="detail-list">
          <div><dt>Deployment ID</dt><dd><code>{runtime.edge.deploymentId || "unknown"}</code></dd></div>
          <div><dt>Source SHA</dt><dd><code>{runtime.edge.sourceSha || "unknown"}</code></dd></div>
          <div><dt>Route contract</dt><dd><code>{runtime.edge.routeVersion || "unknown"}</code></dd></div>
        </dl>
      </div>
      <div className="data-section">
        <header>
          <div><h2>Credential Broker</h2></div>
          <StatusBadge value={runtime.broker.health} />
        </header>
        <dl className="detail-list">
          <div><dt>Version</dt><dd><code>{runtime.broker.version || "unknown"}</code></dd></div>
        </dl>
      </div>
      <div className="data-section">
        <header>
          <div><h2>Database contract</h2></div>
          <StatusBadge value="reported" label="Reported" />
        </header>
        <dl className="detail-list">
          <div><dt>Contract</dt><dd><code>{runtime.database.contractVersion || "unknown"}</code></dd></div>
          <div><dt>Audit</dt><dd><code>{runtime.database.auditContractVersion || "unknown"}</code></dd></div>
          <div><dt>Itinerary</dt><dd><code>{runtime.database.itineraryContractVersion || "unknown"}</code></dd></div>
          <div><dt>Receipts</dt><dd><code>{runtime.database.receiptContractVersion || "unknown"}</code></dd></div>
          <div><dt>Schema version</dt><dd><code>{runtime.database.schemaVersion || "unknown"}</code></dd></div>
        </dl>
      </div>
      <div className="data-section">
        <header>
          <div><h2>Runtime policy</h2></div>
          <StatusBadge
            value={policy.status === "allowlisted" ? "warning" : "reported"}
            label={policy.status}
          />
        </header>
        <dl className="detail-list">
          <div><dt>Version</dt><dd><code>{policy.version || "none"}</code></dd></div>
          <div><dt>Source</dt><dd><code>{policy.source || "unknown"}</code></dd></div>
          <div><dt>Expires</dt><dd>{formatDateTime(policy.expiresAt)}</dd></div>
          <div><dt>Admin writes</dt><dd>{policy.writable ? "Writes enabled" : "Writes disabled"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export function ReleasesPage() {
  return <RuntimeView mode="releases" />;
}
export function InfrastructurePage() {
  return <RuntimeView mode="infrastructure" />;
}
