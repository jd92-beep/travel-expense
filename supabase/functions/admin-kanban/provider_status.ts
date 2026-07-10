type ProviderStatusInput = {
  status?: unknown;
  hasKey?: unknown;
};

type ClassifiedProviderStatus = {
  configured: boolean | null;
  healthy: boolean | null;
  status: "healthy" | "warning" | "danger";
  storedStatus: string;
};

const HEALTHY_PROVIDER_STATUSES = new Set(["connected", "healthy"]);

export function classifyProviderStatus(
  input: ProviderStatusInput,
): ClassifiedProviderStatus {
  const storedStatus = String(
    input.status || (input.hasKey ? "unknown" : "missing"),
  ).toLowerCase();
  const healthy = HEALTHY_PROVIDER_STATUSES.has(storedStatus);
  const configured = Boolean(input.hasKey) ||
    !["missing", "unconfigured"].includes(storedStatus);
  const status = healthy
    ? "healthy"
    : ["invalid", "error", "failed", "missing", "revoked"].includes(
        storedStatus,
      )
    ? "danger"
    : "warning";
  return { configured, healthy, status, storedStatus };
}

export function classifyBrokerOnlyStatus(): ClassifiedProviderStatus {
  return {
    configured: null,
    healthy: null,
    status: "warning",
    storedStatus: "unknown_broker_online",
  };
}

export function providerProbeSucceeded(
  httpStatus: number,
  data: unknown,
): boolean {
  if (
    httpStatus < 200 || httpStatus >= 300 || !data || typeof data !== "object"
  ) return false;
  const payload = data as { ok?: unknown; status?: unknown };
  if (payload.ok !== true) return false;
  const nested = payload.status && typeof payload.status === "object"
    ? (payload.status as { status?: unknown }).status
    : payload.status;
  return HEALTHY_PROVIDER_STATUSES.has(String(nested || "").toLowerCase());
}
