import { classifyBrokerOnlyStatus, classifyProviderStatus } from "./provider_status.ts";

type BrokerProvider = {
  provider?: unknown;
  name?: unknown;
  label?: unknown;
  status?: unknown;
  hasKey?: unknown;
  lastTestedAt?: unknown;
  last_tested_at?: unknown;
  models?: unknown;
};

type UsageRow = {
  provider?: unknown;
  model?: unknown;
  outcome?: unknown;
  duration_ms?: unknown;
  error_code?: unknown;
  event_name?: unknown;
  created_at?: unknown;
};

export type ProviderReadRow = {
  provider: string;
  label: string;
  configured: boolean | null;
  healthy: boolean | null;
  status: "healthy" | "warning" | "danger";
  storedStatus: string;
  models: string[];
  requiredModel: string | null;
  actualModel: string | null;
  lastSuccessfulRequestAt: string | null;
  lastProbeAt: string | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  errors24h: number;
  rateLimited24h: number;
};

const PROVIDER_ORDER = ["kimi", "google", "volcano", "notion", "weatherapi", "mimo"];
const PROVIDER_MODELS: Record<string, string[]> = {
  kimi: [
    "kimi/kimi-code",
    "kimi/kimi-8k",
    "kimi/kimi-32k",
    "kimi/kimi-k2.6",
    "kimi/kimi-for-coding",
  ],
  google: [
    "google/gemini-2.5-flash",
    "google/gemini-3.1-flash",
    "google/gemini-3.1-flash-lite",
    "google/gemma-4-31b-it",
    "google/gemma-4-26b",
  ],
  volcano: [
    "volcano/doubao-seed-2.0-lite",
    "volcano/doubao-seed-2.0-pro",
    "volcano/minimax-m3",
    "volcano/minimax-m2.7",
    "volcano/doubao-seed-2.0-mini",
  ],
  notion: [],
  weatherapi: [],
  mimo: ["mimo/mimo-v2.5", "mimo/mimo-v2.5-pro"],
};
const REQUIRED_MODELS: Record<string, string | null> = {
  kimi: "kimi/kimi-code",
  google: "google/gemma-4-31b-it",
  volcano: "volcano/doubao-seed-2.0-lite",
  notion: null,
  weatherapi: "forecast",
  mimo: "mimo/mimo-v2.5",
};
const LABELS: Record<string, string> = {
  kimi: "Kimi",
  google: "Google Gemma",
  volcano: "Volcano",
  notion: "Notion",
  weatherapi: "WeatherAPI",
  mimo: "Mimo",
};

type OverviewStatus = {
  id: string;
  status: string;
  lastSeenAt: string | null;
};

export function normalizeOverviewStatusStrip(
  statusStrip: unknown,
  brokerHealthy: boolean,
  brokerLastSeenAt: string | null,
): OverviewStatus[] {
  const rows = Array.isArray(statusStrip) ? statusStrip : [];
  let brokerIncluded = false;
  const normalized = rows.flatMap((row): OverviewStatus[] => {
    if (!row || typeof row !== "object") return [];
    const source = row as Partial<OverviewStatus>;
    if (typeof source.id !== "string" || typeof source.status !== "string") return [];
    if (source.id === "broker") {
      brokerIncluded = true;
      return [{
        id: "broker",
        status: brokerHealthy ? "healthy" : "unavailable",
        lastSeenAt: brokerHealthy ? brokerLastSeenAt : null,
      }];
    }
    return [{
      id: source.id,
      status: ["compact-web", "android"].includes(source.id) && source.status === "unknown" &&
          source.lastSeenAt == null
        ? "awaiting_heartbeat"
        : source.status,
      lastSeenAt: typeof source.lastSeenAt === "string" ? source.lastSeenAt : null,
    }];
  });
  if (!brokerIncluded) {
    normalized.push({
      id: "broker",
      status: brokerHealthy ? "healthy" : "unavailable",
      lastSeenAt: brokerHealthy ? brokerLastSeenAt : null,
    });
  }
  return normalized;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validTimestamp(value: unknown) {
  const text = stringValue(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function latest(values: Array<string | null>) {
  return values.filter((value): value is string => value !== null).sort((left, right) =>
    Date.parse(right) - Date.parse(left)
  )[0] ?? null;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]);
}

function modelCatalog(provider: string, value: unknown) {
  const supported = PROVIDER_MODELS[provider];
  if (supported) return [...supported];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.flatMap((model) => {
      const normalized = stringValue(model);
      return normalized && normalized.length <= 120 ? [normalized] : [];
    })),
  ].slice(0, 20);
}

export function aggregateProviderRows(input: {
  brokerProviders: BrokerProvider[];
  brokerVerified: boolean;
  usageRows: UsageRow[];
}): ProviderReadRow[] {
  const brokerMap = new Map<string, BrokerProvider>();
  for (const provider of input.brokerProviders) {
    const id = stringValue(provider.provider) ?? stringValue(provider.name);
    if (id) brokerMap.set(id.toLowerCase(), provider);
  }
  const providerIds = [...new Set([...PROVIDER_ORDER, ...brokerMap.keys()])];

  return providerIds.map((provider) => {
    const broker = brokerMap.get(provider);
    const classification = input.brokerVerified
      ? classifyProviderStatus(broker ?? { status: "missing", hasKey: false })
      : classifyBrokerOnlyStatus();
    const usage = input.usageRows.filter((row) =>
      stringValue(row.provider)?.toLowerCase() === provider
    );
    const productionSuccesses = usage.filter((row) =>
      stringValue(row.outcome)?.toLowerCase() === "success" &&
      !String(row.event_name || "").startsWith("provider_test_")
    );
    const lastSuccessfulRequestAt = latest(
      productionSuccesses.map((row) => validTimestamp(row.created_at)),
    );
    const latestSuccess = productionSuccesses
      .filter((row) => validTimestamp(row.created_at))
      .sort((left, right) =>
        Date.parse(String(right.created_at)) - Date.parse(String(left.created_at))
      )[0];
    const durations = usage.map((row) => Number(row.duration_ms)).filter((value) =>
      Number.isFinite(value) && value >= 0
    );
    const errorRows = usage.filter((row) => stringValue(row.outcome)?.toLowerCase() === "error");
    const usageProbeAt = latest(
      usage.filter((row) => String(row.event_name || "").startsWith("provider_test_"))
        .map((row) => validTimestamp(row.created_at)),
    );
    const brokerProbeAt = validTimestamp(broker?.lastTestedAt) ??
      validTimestamp(broker?.last_tested_at);
    return {
      provider,
      label: stringValue(broker?.label) ?? LABELS[provider] ?? provider,
      ...classification,
      models: modelCatalog(provider, broker?.models),
      requiredModel: REQUIRED_MODELS[provider] ?? null,
      actualModel: stringValue(latestSuccess?.model),
      lastSuccessfulRequestAt,
      lastProbeAt: latest([brokerProbeAt, usageProbeAt]),
      p50LatencyMs: percentile(durations, 0.5),
      p95LatencyMs: percentile(durations, 0.95),
      errors24h: errorRows.length,
      rateLimited24h: errorRows.filter((row) =>
        /(?:^|\D)429(?:\D|$)|quota|rate.?limit/i.test(String(row.error_code || ""))
      ).length,
    };
  });
}
