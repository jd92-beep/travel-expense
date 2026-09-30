export type AdminWriteMode = "deny_all" | "provider_probe_only" | "allowlisted";

type AllowedAdminRequest = {
  allowed: true;
  requestId: string;
  route: string;
  writeMode: AdminWriteMode;
};

type RejectedAdminRequest = {
  allowed: false;
  requestId: string;
  route: string | null;
  writeMode: AdminWriteMode;
  status: 404 | 405 | 503;
  code:
    | "ADMIN_ROUTE_NOT_ALLOWED"
    | "ADMIN_METHOD_NOT_ALLOWED"
    | "ADMIN_WRITES_DISABLED";
};

export type AdminRequestDecision = AllowedAdminRequest | RejectedAdminRequest;

export function rejectedSignatureIdentity(_headers: Headers) {
  return { actor: "unauthenticated", sessionHash: "unauthenticated" } as const;
}

const SAFE_REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Full UUID shape (matches operations.ts UUID_RE) so path segments cannot
// smuggle non-UUID hex/dash strings through the route allowlist.
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const READ_ROUTE_MAP: ReadonlyArray<RegExp> = [
  /^\/api\/overview$/,
  /^\/api\/search$/,
  /^\/api\/accounts$/,
  new RegExp(`^/api/accounts/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/api/accounts/${UUID_SEGMENT}/installations$`, "i"),
  /^\/api\/trips$/,
  new RegExp(`^/api/trips/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/api/trips/${UUID_SEGMENT}/itinerary$`, "i"),
  new RegExp(`^/api/trips/${UUID_SEGMENT}/itinerary/versions$`, "i"),
  /^\/api\/receipts$/,
  new RegExp(`^/api/receipts/${UUID_SEGMENT}$`, "i"),
  /^\/api\/incidents$/,
  /^\/api\/sync-jobs$/,
  /^\/api\/integrity$/,
  /^\/api\/reconciliation$/,
  /^\/api\/providers$/,
  /^\/api\/runtime$/,
  /^\/api\/audit$/,
  new RegExp(`^/api/audit/${UUID_SEGMENT}$`, "i"),
  new RegExp(`^/api/receipts/${UUID_SEGMENT}/photo$`, "i"),
  /^\/api\/operations$/,
  new RegExp(`^/api/operations/${UUID_SEGMENT}$`, "i"),
];

// The generic kernel is the only mutation surface. Its action allowlist is
// enforced again inside Edge and the private database RPCs.
const WRITE_ROUTE_MAP: ReadonlyArray<RegExp> = [
  /^\/api\/operations\/preview$/,
  new RegExp(`^/api/operations/${UUID_SEGMENT}/commit$`, "i"),
];

function matchesRoute(route: string, routeMap: ReadonlyArray<RegExp>): boolean {
  return routeMap.some((pattern) => pattern.test(route));
}

function requestIdFor(req: Request): string {
  const provided = req.headers.get("x-admin-request-id") || "";
  return SAFE_REQUEST_ID_RE.test(provided) ? provided : crypto.randomUUID();
}

export function resolveAdminWriteMode(
  value: string | undefined,
): AdminWriteMode {
  return value === "allowlisted" || value === "provider_probe_only" ? value : "deny_all";
}

export function isAdminOperationAllowed(
  writeMode: AdminWriteMode,
  action: string,
  allowR3UserPurge = false,
): boolean {
  // R3 user purge is double-gated: explicit env flag AND full allowlisted mode.
  if (action === "admin_purge_user") {
    return allowR3UserPurge && writeMode === "allowlisted";
  }
  return writeMode === "allowlisted" ||
    (writeMode === "provider_probe_only" && action === "provider_probe");
}

export function normalizeAdminApiPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("//")) return null;
  if (
    decoded.split("/").some((segment) => segment === "." || segment === "..")
  ) return null;

  const marker = "/api/";
  const markerIndex = decoded.indexOf(marker);
  if (markerIndex < 0 || markerIndex !== decoded.lastIndexOf(marker)) {
    return null;
  }
  return decoded.slice(markerIndex);
}

export function evaluateAdminRequest(
  req: Request,
  configuredMode: string | undefined = Deno.env.get("ADMIN_WRITE_MODE"),
): AdminRequestDecision {
  const requestId = requestIdFor(req);
  const writeMode = resolveAdminWriteMode(configuredMode);
  const route = normalizeAdminApiPath(new URL(req.url).pathname);
  const method = req.method.toUpperCase();

  if (!route) {
    return {
      allowed: false,
      requestId,
      route,
      writeMode,
      status: 404,
      code: "ADMIN_ROUTE_NOT_ALLOWED",
    };
  }

  if (method === "GET") {
    return matchesRoute(route, READ_ROUTE_MAP) ? { allowed: true, requestId, route, writeMode } : {
      allowed: false,
      requestId,
      route,
      writeMode,
      status: 404,
      code: "ADMIN_ROUTE_NOT_ALLOWED",
    };
  }

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return {
      allowed: false,
      requestId,
      route,
      writeMode,
      status: 405,
      code: "ADMIN_METHOD_NOT_ALLOWED",
    };
  }

  if (writeMode !== "deny_all" && matchesRoute(route, WRITE_ROUTE_MAP)) {
    return { allowed: true, requestId, route, writeMode };
  }

  return {
    allowed: false,
    requestId,
    route,
    writeMode,
    status: 503,
    code: "ADMIN_WRITES_DISABLED",
  };
}
