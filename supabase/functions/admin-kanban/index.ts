import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { BffVerificationError, verifySignedBffRequest } from "../_shared/admin_bff.ts";
import { type AdminRpcClient, handleAdminReadRoute } from "./read_routes.ts";
import {
  AdminOperationError,
  type AdminOperationRecord,
  commitAdminOperation,
  getAdminOperation,
  listAdminOperations,
  previewAdminOperation,
  streamAdminReceiptPhoto,
} from "./operations.ts";
import { reconcileTripReadOnly } from "./reconciliation.ts";
import {
  type AdminRequestDecision,
  evaluateAdminRequest,
  isAdminOperationAllowed,
} from "./security.ts";
import { rejectedSignatureIdentity } from "./security.ts";
import { fetchNoRedirect } from "./safe_fetch.ts";
import { brokerHealthSucceeded } from "./provider_status.ts";
import { aggregateProviderRows, normalizeOverviewStatusStrip } from "./system_status.ts";
import { runtimePolicyFor } from "./runtime_policy.ts";
import { EDGE_SOURCE_SHA } from "./source_provenance.ts";

export const config = { verify_jwt: false };

type SupabaseClientAny = ReturnType<typeof serviceClient>;

type ProviderProbeOperation = AdminOperationRecord & {
  preview?: AdminOperationRecord["preview"] & { provider?: string };
};

type ClientVersionRow = {
  app_build?: string | null;
  app_surface?: string | null;
};

type ReadRoutePayload = {
  data?: Record<string, unknown>;
  meta?: {
    sources?: Record<string, "live" | "stale" | "unavailable">;
    warnings?: string[];
  };
};

type BrokerHealth = {
  checkedAt: string;
  version: string;
};

const ADMIN_FRONTEND_ORIGIN = Deno.env.get("ADMIN_FRONTEND_ORIGIN") ||
  "https://travel-expense-admin-kanban.vercel.app";
const CREDENTIAL_BROKER_URL = Deno.env.get("CREDENTIAL_BROKER_URL") ||
  "https://travel-expense-credential-broker.ftjdfr.workers.dev";
const ADMIN_EDGE_CONTRACT_VERSION = "admin-kanban-v1";

const MAX_JSON_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

function corsHeaders(req: Request) {
  void req;
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(req) });
}

function redact(value: unknown) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/ntn_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/secret_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase Edge service role is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readBody(method: string, bodyBytes: Uint8Array) {
  if (method === "GET") return {};
  const raw = new TextDecoder().decode(bodyBytes);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

function bffSigningKeys(): Record<string, string> {
  const currentId = Deno.env.get("ADMIN_BFF_KEY_ID") || "";
  const currentSecret = Deno.env.get("ADMIN_BFF_SIGNING_KEY") || "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(currentId) || currentSecret.length < 32) {
    throw new Error("Admin BFF signing key is unavailable");
  }
  const keys: Record<string, string> = { [currentId]: currentSecret };
  const rotationId = Deno.env.get("ADMIN_BFF_ROTATION_KEY_ID") || "";
  const rotationSecret = Deno.env.get("ADMIN_BFF_ROTATION_SIGNING_KEY") || "";
  const rotationNotAfter = Number(Deno.env.get("ADMIN_BFF_ROTATION_NOT_AFTER") || "0");
  const now = Math.floor(Date.now() / 1000);
  if (rotationId || rotationSecret || rotationNotAfter) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/.test(rotationId) || rotationSecret.length < 32 ||
      !Number.isInteger(rotationNotAfter) || rotationNotAfter <= now ||
      rotationNotAfter > now + 600
    ) {
      throw new Error("Admin BFF rotation key window is invalid");
    }
    keys[rotationId] = rotationSecret;
  }
  return keys;
}

async function fetchBrokerHealth(): Promise<BrokerHealth | null> {
  try {
    const response = await fetchNoRedirect(
      `${CREDENTIAL_BROKER_URL.replace(/\/+$/, "")}/health`,
      {},
      2000,
    );
    const payload = await response.json().catch(() => null);
    if (!brokerHealthSucceeded(response.status, payload)) return null;
    return { checkedAt: new Date().toISOString(), version: payload.version.trim() };
  } catch {
    return null;
  }
}

async function adminProviderRead(supabase: SupabaseClientAny) {
  const baseUrl = CREDENTIAL_BROKER_URL.replace(/\/+$/, "");
  let brokerProviders: Array<Record<string, unknown>> = [];
  let brokerVerified = false;
  let brokerSource: "live" | "unavailable" = "unavailable";
  const warnings: string[] = [];
  // DB telemetry/probe history do not depend on the broker; read them while the
  // broker status call (up to 5 s, plus a 2 s health fallback) is in flight.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const databaseReads = Promise.all([
    supabase
      .from("app_usage_events")
      .select("provider,model,outcome,duration_ms,error_code,event_name,created_at")
      .gte("created_at", since)
      .not("provider", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.rpc("admin_operation_list", { p_status: "all", p_limit: 50 }),
  ]);
  try {
    const response = await fetchNoRedirect(`${baseUrl}/credentials/status`, {
      headers: {
        "Origin": "https://travel-expense-compact.vercel.app",
        "X-Admin-Internal": Deno.env.get("EDGE_BROKER_KEY") || "",
        // Broker ignores unknown headers; this only marks the caller for audit.
        "X-Admin-Source": "admin-kanban-edge",
      },
    }, 5000);
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload?.providers)) {
      throw new Error("Broker provider status unavailable");
    }
    brokerProviders = payload.providers;
    brokerVerified = true;
    brokerSource = "live";
  } catch {
    warnings.push("PROVIDER_STATUS_UNAVAILABLE");
    if (await fetchBrokerHealth()) brokerSource = "live";
    else warnings.push("BROKER_UNAVAILABLE");
  }

  const [
    { data: usageRows, error: usageError },
    { data: operationRows, error: operationError },
  ] = await databaseReads;
  if (usageError) warnings.push("PROVIDER_TELEMETRY_UNAVAILABLE");
  if (operationError) warnings.push("PROVIDER_PROBE_HISTORY_UNAVAILABLE");
  const rows = aggregateProviderRows({
    brokerProviders,
    brokerVerified,
    usageRows: usageRows || [],
  }).map((row) => {
    const operations =
      (Array.isArray(operationRows) ? operationRows : []) as ProviderProbeOperation[];
    const probe = operations.find((operation) =>
      operation?.action === "provider_probe" &&
      operation?.preview?.provider === row.provider
    );
    if (!probe) {
      return {
        ...row,
        probeCooldownSeconds: 60,
        probeAvailableAt: null,
      };
    }
    const probeSucceeded = probe.status === "completed";
    const lastProbeAt = probe.result?.testedAt || probe.updatedAt || row.lastProbeAt;
    const lastProbeMs = Date.parse(lastProbeAt || "");
    const probeAvailableAt = Number.isFinite(lastProbeMs) && lastProbeMs + 60_000 > Date.now()
      ? new Date(lastProbeMs + 60_000).toISOString()
      : null;
    return {
      ...row,
      actualModel: probe.result?.actualModel || row.actualModel,
      healthy: probeSucceeded ? row.healthy : false,
      lastProbeAt,
      lastProbeMessage: probe.error?.message || probe.result?.message || null,
      lastProbeStatus: probeSucceeded ? probe.result?.status || "healthy" : "failed",
      probeCooldownSeconds: 60,
      probeAvailableAt,
      status: probeSucceeded ? row.status : "danger",
    };
  });
  return {
    rows,
    sources: {
      "shared-cloud": usageError ? "unavailable" as const : "live" as const,
      broker: brokerSource,
    },
    warnings,
  };
}

async function adminRuntimeRead(supabase: SupabaseClientAny) {
  // Four independent probes; running them concurrently caps the page at the
  // slowest one (~3 s worst case) instead of their sum (~5 s + DB).
  const frontendRead = (async () => {
    try {
      const response = await fetchNoRedirect(`${ADMIN_FRONTEND_ORIGIN}/api/health`, {}, 3000);
      const body = await response.json();
      return {
        frontend: (body || {}) as Record<string, unknown>,
        frontendHealth: response.ok && body?.acceptingReadTraffic === true ? "healthy" : "failed",
      };
    } catch {
      return { frontend: {} as Record<string, unknown>, frontendHealth: "unavailable" };
    }
  })();
  const [
    { frontend, frontendHealth },
    brokerHealth,
    { data: clientRows },
    { data: runtimeContract, error: runtimeContractError },
  ] = await Promise.all([
    frontendRead,
    fetchBrokerHealth(),
    supabase
      .from("app_usage_events")
      .select("app_surface,app_build,created_at")
      .in("app_surface", ["compact", "android"])
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.rpc("admin_read_runtime_contract"),
  ]);
  const brokerVersion = brokerHealth?.version || "unknown";
  const brokerStatus = brokerHealth ? "healthy" : "unavailable";

  const latestVersion = (surface: string) =>
    String(
      ((clientRows || []) as ClientVersionRow[]).find((row) => row.app_surface === surface)
        ?.app_build || "unknown",
    );
  const drift: string[] = [];
  const expectedFrontendSha = Deno.env.get("ADMIN_FRONTEND_GIT_SHA") || "";
  const observedFrontendSha = String(frontend?.gitSha || "unknown");
  if (observedFrontendSha === "unknown") drift.push("ADMIN_FRONTEND_GIT_SHA_UNAVAILABLE");
  if (
    expectedFrontendSha && observedFrontendSha !== "unknown" &&
    expectedFrontendSha !== observedFrontendSha
  ) drift.push("ADMIN_FRONTEND_GIT_SHA_MISMATCH");
  const expectedEdgeSha = Deno.env.get("ADMIN_EXPECTED_EDGE_SOURCE_SHA") || "";
  // Prefer deploy-time baked SHA; env secret is a fallback for older deploys.
  const observedEdgeSha = EDGE_SOURCE_SHA || Deno.env.get("ADMIN_EDGE_SOURCE_SHA") || "unknown";
  if (expectedEdgeSha && observedEdgeSha !== "unknown" && expectedEdgeSha !== observedEdgeSha) {
    drift.push("ADMIN_EDGE_SOURCE_SHA_MISMATCH");
  }
  if (observedEdgeSha === "unknown") drift.push("ADMIN_EDGE_SOURCE_SHA_UNAVAILABLE");
  if (
    observedFrontendSha !== "unknown" && observedEdgeSha !== "unknown" &&
    observedFrontendSha !== observedEdgeSha
  ) {
    drift.push("ADMIN_EDGE_FRONTEND_SOURCE_SHA_MISMATCH");
  }
  const edgeDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID") || "unknown";
  if (edgeDeploymentId === "unknown") drift.push("ADMIN_EDGE_DEPLOYMENT_ID_UNAVAILABLE");
  const databaseContract = runtimeContract && typeof runtimeContract === "object"
    ? runtimeContract as Record<string, unknown>
    : {};
  const schemaVersion = String(databaseContract.schemaVersion || "unknown");
  if (runtimeContractError || schemaVersion === "unknown") {
    drift.push("DATABASE_CONTRACT_UNAVAILABLE");
  }
  const expectedSchemaVersion = Deno.env.get("ADMIN_EXPECTED_SCHEMA_VERSION") || "";
  if (
    expectedSchemaVersion && schemaVersion !== "unknown" &&
    expectedSchemaVersion !== schemaVersion
  ) {
    drift.push("DATABASE_SCHEMA_VERSION_MISMATCH");
  }
  if (brokerVersion === "unknown") drift.push("BROKER_VERSION_UNAVAILABLE");
  return {
    data: {
      adminFrontend: {
        version: String(frontend?.version || "unknown"),
        gitSha: observedFrontendSha,
        deploymentId: String(frontend?.deploymentId || "unknown"),
        health: frontendHealth,
      },
      edge: {
        deploymentId: edgeDeploymentId,
        sourceSha: observedEdgeSha,
        routeVersion: ADMIN_EDGE_CONTRACT_VERSION,
      },
      broker: { version: brokerVersion, health: brokerStatus },
      database: {
        auditContractVersion: String(databaseContract.auditContractVersion || "unknown"),
        contractVersion: String(databaseContract.operationContractVersion || "unknown"),
        itineraryContractVersion: String(
          databaseContract.itineraryContractVersion || "unknown",
        ),
        receiptContractVersion: String(databaseContract.receiptContractVersion || "unknown"),
        schemaVersion,
      },
      clients: {
        compactVersion: latestVersion("compact"),
        androidVersion: latestVersion("android"),
      },
      runtimePolicy: runtimePolicyFor(
        Deno.env.get("ADMIN_WRITE_MODE"),
        Deno.env.get("ADMIN_ALLOW_R3_USER_PURGE") === "true",
      ),
      drift,
    },
    sources: {
      "shared-cloud": "live" as const,
      database: runtimeContractError ? "unavailable" as const : "live" as const,
      frontend: frontendHealth === "healthy" ? "live" as const : "unavailable" as const,
      broker: brokerStatus === "healthy" ? "live" as const : "unavailable" as const,
    },
  };
}

function adminReadEnvelope(
  requestId: string,
  data: unknown,
  options: {
    sources: Record<string, "live" | "stale" | "unavailable">;
    staleAfterSeconds?: number;
    warnings?: string[];
  },
) {
  return {
    ok: true,
    data,
    error: null,
    meta: {
      requestId,
      generatedAt: new Date().toISOString(),
      staleAfterSeconds: options.staleAfterSeconds ?? 60,
      scope: "shared-cloud",
      sources: options.sources,
      warnings: options.warnings ?? [],
    },
  };
}

async function recordRejectedAdminRequest(
  req: Request,
  decision: Extract<AdminRequestDecision, { allowed: false }>,
) {
  const event = {
    event: "admin_security_event",
    code: decision.code,
    method: req.method.toUpperCase(),
    route: decision.route || "invalid",
    requestId: decision.requestId,
    writeMode: decision.writeMode,
  };
  console.warn(JSON.stringify(event));

  try {
    const supabase = serviceClient();
    const { error } = await supabase.rpc("admin_audit_record_security_event", {
      p_action: "admin_request_denied",
      p_actor: "unauthenticated",
      p_error_code: event.code,
      p_method: event.method,
      p_request_id: event.requestId,
      p_route: event.route,
      p_session_hash: "unauthenticated",
    });
    if (error) {
      console.error(
        JSON.stringify({ event: "admin_security_event_store_failed", requestId: event.requestId }),
      );
    }
  } catch {
    console.error(
      JSON.stringify({ event: "admin_security_event_store_failed", requestId: event.requestId }),
    );
  }
}

async function recordSignatureRejection(
  req: Request,
  decision: AdminRequestDecision,
  error: BffVerificationError,
) {
  const { actor, sessionHash } = rejectedSignatureIdentity(req.headers);
  console.warn(JSON.stringify({
    event: "admin_signature_rejected",
    code: error.code,
    method: req.method.toUpperCase(),
    route: decision.route || "invalid",
    requestId: decision.requestId,
  }));
  try {
    const { error: storeError } = await serviceClient().rpc(
      "admin_audit_record_security_event",
      {
        p_action: "admin_signature_rejected",
        p_actor: actor,
        p_error_code: String(error.code || "ADMIN_SIGNATURE_INVALID").slice(0, 64),
        p_method: req.method.toUpperCase(),
        p_request_id: decision.requestId,
        p_route: decision.route || "invalid",
        p_session_hash: sessionHash,
      },
    );
    if (storeError) throw storeError;
  } catch {
    console.error(JSON.stringify({
      event: "admin_security_event_store_failed",
      requestId: decision.requestId,
    }));
  }
}

Deno.serve(async (req) => {
  const requestDecision = evaluateAdminRequest(req);
  if (!requestDecision.allowed) {
    await recordRejectedAdminRequest(req, requestDecision);
    return json(req, requestDecision.status, {
      ok: false,
      data: null,
      error: {
        code: requestDecision.code,
        message: requestDecision.code === "ADMIN_WRITES_DISABLED"
          ? "Admin writes are disabled during maintenance"
          : "Admin route is not available",
        retryable: false,
      },
      meta: {
        requestId: requestDecision.requestId,
        generatedAt: new Date().toISOString(),
        warnings: [],
      },
    });
  }
  try {
    const signed = await verifySignedBffRequest(req, {
      functionName: "admin-kanban",
      keys: bffSigningKeys(),
      maxBodyBytes: MAX_JSON_BODY_BYTES,
      consumeNonce: async (nonceHash, requestId, expiresAt) => {
        const supabase = serviceClient();
        const { data, error } = await supabase.rpc("admin_consume_request_nonce", {
          p_nonce_hash: nonceHash,
          p_request_id: requestId,
          p_expires_at: new Date(expiresAt * 1000).toISOString(),
        });
        if (error) throw new Error("Admin nonce store unavailable");
        return data === true;
      },
    });
    // Authorization is solely the BFF HMAC signature verified above; this
    // sessionHash check only rejects the unauthenticated identity placeholder.
    // Do not expand it into a second authorization gate — the release-readiness
    // signer binds a token hash here without an interactive admin session.
    if (signed.sessionHash === "unauthenticated") {
      throw new BffVerificationError("UNAUTHORIZED", 401, "Admin session required");
    }
    const adminSubject = signed.actor;
    const url = new URL(req.url);
    const operationContext = {
      actor: adminSubject,
      brokerKey: Deno.env.get("EDGE_BROKER_KEY") || "",
      brokerUrl: CREDENTIAL_BROKER_URL,
      client: serviceClient(),
      requestId: signed.requestId,
      sessionHash: signed.sessionHash,
    };
    if (req.method === "GET" && signed.route === "/api/reconciliation") {
      const tripIds = url.searchParams.getAll("tripId");
      if (
        tripIds.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "tripId")
      ) {
        throw new AdminOperationError(
          "VALIDATION_FAILED",
          "Reconciliation requires one Trip ID",
          400,
        );
      }
      const reconciliation = await reconcileTripReadOnly(operationContext, tripIds[0]);
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, reconciliation.data, {
          sources: reconciliation.sources,
          staleAfterSeconds: 30,
          warnings: reconciliation.warnings,
        }),
      );
    }
    const readContext = {
      client: operationContext.client as unknown as AdminRpcClient,
      requestId: signed.requestId,
      route: signed.route,
      searchParams: url.searchParams,
    };
    if (req.method === "GET" && signed.route === "/api/overview") {
      const overviewRead = handleAdminReadRoute(readContext);
      const operationsRead = listAdminOperations(operationContext, "all", 10).catch(() => null);
      const brokerRead = fetchBrokerHealth();
      const [readResult, operations, brokerHealth] = await Promise.all([
        overviewRead,
        operationsRead,
        brokerRead,
      ]);
      if (readResult) {
        if (readResult.status === 200) {
          const payload = readResult.payload as ReadRoutePayload;
          if (payload?.data && typeof payload.data === "object") {
            payload.data.statusStrip = normalizeOverviewStatusStrip(
              payload.data.statusStrip,
              Boolean(brokerHealth),
              brokerHealth?.checkedAt || null,
            );
            payload.data.recentOperations = (operations || []).slice(0, 5).map((operation) => ({
              action: operation.action,
              created_at: operation.createdAt,
              id: operation.id,
              request_id: operation.requestId,
              result: operation.result,
              target_id_hash: operation.targetHash,
              target_type: operation.targetType,
            }));
          }
          payload.meta ??= {};
          payload.meta.sources = {
            ...payload.meta.sources,
            broker: brokerHealth ? "live" : "unavailable",
          };
          payload.meta.warnings ??= [];
          if (!operations) payload.meta.warnings.push("OPERATION_HISTORY_UNAVAILABLE");
          if (!brokerHealth) payload.meta.warnings.push("BROKER_UNAVAILABLE");
        }
        return json(req, readResult.status, readResult.payload as Record<string, unknown>);
      }
    } else {
      const readResult = await handleAdminReadRoute(readContext);
      if (readResult) {
        return json(
          req,
          readResult.status,
          readResult.payload as unknown as Record<string, unknown>,
        );
      }
    }
    const photoRoute = signed.route.match(/^\/api\/receipts\/([0-9a-f-]+)\/photo$/i);
    if (req.method === "GET" && photoRoute) {
      return await streamAdminReceiptPhoto(operationContext, photoRoute[1]);
    }
    if (req.method === "GET" && signed.route === "/api/operations") {
      const status = String(url.searchParams.get("status") || "active");
      const limit = Number(url.searchParams.get("limit") || "20");
      const operations = await listAdminOperations(operationContext, status, limit);
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, { items: operations }, {
          sources: { "shared-cloud": "live" },
          staleAfterSeconds: 10,
        }),
      );
    }
    const operationReadRoute = signed.route.match(/^\/api\/operations\/([0-9a-f-]+)$/i);
    if (req.method === "GET" && operationReadRoute) {
      const operation = await getAdminOperation(operationContext, operationReadRoute[1]);
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, operation, {
          sources: { "shared-cloud": "live" },
          staleAfterSeconds: 10,
        }),
      );
    }
    if (req.method === "POST" && signed.route === "/api/operations/preview") {
      const body = readBody(req.method, signed.bodyBytes);
      const action = body && typeof body === "object" && "action" in body
        ? String(body.action)
        : "";
      if (
        !isAdminOperationAllowed(
          requestDecision.writeMode,
          action,
          Deno.env.get("ADMIN_ALLOW_R3_USER_PURGE") === "true",
        )
      ) {
        throw new AdminOperationError(
          "WRITES_DISABLED",
          "Admin action is disabled during maintenance",
          503,
        );
      }
      const operation = await previewAdminOperation(
        operationContext,
        body,
      );
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, operation, {
          sources: { "shared-cloud": "live" },
          staleAfterSeconds: 0,
        }),
      );
    }
    const operationCommitRoute = signed.route.match(
      /^\/api\/operations\/([0-9a-f-]+)\/commit$/i,
    );
    if (req.method === "POST" && operationCommitRoute) {
      const operation = await getAdminOperation(operationContext, operationCommitRoute[1]);
      if (
        !isAdminOperationAllowed(
          requestDecision.writeMode,
          operation.action,
          Deno.env.get("ADMIN_ALLOW_R3_USER_PURGE") === "true",
        )
      ) {
        throw new AdminOperationError(
          "WRITES_DISABLED",
          "Admin action is disabled during maintenance",
          503,
        );
      }
      const result = await commitAdminOperation(
        operationContext,
        operationCommitRoute[1],
        readBody(req.method, signed.bodyBytes),
      );
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, result, {
          sources: { "shared-cloud": "live" },
          staleAfterSeconds: 0,
        }),
      );
    }
    if (req.method === "GET" && signed.route === "/api/providers") {
      const providerRead = await adminProviderRead(serviceClient());
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, providerRead.rows, {
          sources: providerRead.sources,
          warnings: providerRead.warnings,
        }),
      );
    }
    if (
      req.method === "GET" && signed.route === "/api/runtime" &&
      url.searchParams.get("scope") === "policy"
    ) {
      // Cheap path for the UI write gate: env-only, no frontend/broker/DB probes.
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, {
          runtimePolicy: runtimePolicyFor(
            Deno.env.get("ADMIN_WRITE_MODE"),
            Deno.env.get("ADMIN_ALLOW_R3_USER_PURGE") === "true",
          ),
        }, { sources: { "shared-cloud": "live" }, staleAfterSeconds: 60 }),
      );
    }
    if (req.method === "GET" && signed.route === "/api/runtime") {
      const runtimeRead = await adminRuntimeRead(serviceClient());
      return json(
        req,
        200,
        adminReadEnvelope(signed.requestId, runtimeRead.data, {
          sources: runtimeRead.sources,
        }),
      );
    }
    return json(req, 404, {
      ok: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "Admin route not found",
        retryable: false,
      },
      meta: {
        requestId: signed.requestId,
        generatedAt: new Date().toISOString(),
        warnings: [],
      },
    });
  } catch (error) {
    if (error instanceof AdminOperationError) {
      const response = json(req, error.status, {
        ok: false,
        data: null,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
        meta: {
          requestId: req.headers.get("x-admin-request-id") || crypto.randomUUID(),
          generatedAt: new Date().toISOString(),
          warnings: [],
        },
      });
      if (error.retryAfterSeconds) {
        response.headers.set("Retry-After", String(error.retryAfterSeconds));
      }
      return response;
    }
    if (error instanceof BffVerificationError) {
      await recordSignatureRejection(req, requestDecision, error);
      return json(req, error.status, {
        ok: false,
        data: null,
        error: { code: error.code, message: error.message, retryable: false },
        meta: {
          requestId: requestDecision.requestId,
          generatedAt: new Date().toISOString(),
          warnings: [],
        },
      });
    }
    const message = redact(error instanceof Error ? error.message : error);
    // Never discard the diagnostic: generic catches must still leave a server log.
    console.error(JSON.stringify({
      event: "admin_request_failed",
      method: req.method.toUpperCase(),
      message,
      requestId: requestDecision.requestId,
      route: requestDecision.route || "invalid",
    }));
    const explicitStatus = error instanceof HttpError ? error.status : 0;
    // Only explicit auth/session/CSRF failures become 401; unrecognized
    // constraint/DB text stays 500 rather than masquerading as UNAUTHORIZED.
    const isAuthFailure = !explicitStatus &&
      /session required|unauthenticated|unauthorized|csrf|authentication required|invalid session/i
        .test(message);
    const isValidation = !explicitStatus && /confirm phrase|mismatch/i.test(message);
    const isNotFound = !explicitStatus && /not found/i.test(message);
    const status = explicitStatus ||
      (isAuthFailure ? 401 : isValidation ? 400 : isNotFound ? 404 : 500);
    const code = error instanceof HttpError
      ? "VALIDATION_FAILED"
      : isAuthFailure
      ? "UNAUTHORIZED"
      : isValidation
      ? "VALIDATION_FAILED"
      : isNotFound
      ? "NOT_FOUND"
      : "INTERNAL_ERROR";
    return json(req, status, {
      ok: false,
      data: null,
      error: {
        code,
        message: error instanceof HttpError ? message : "Admin request failed",
        retryable: status >= 500,
      },
      meta: {
        requestId: requestDecision.requestId,
        generatedAt: new Date().toISOString(),
        warnings: [],
      },
    });
  }
});
