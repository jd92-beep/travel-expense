export type AdminWriteMode = "deny_all" | "allowlisted";

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

const READ_ROUTE_MAP: ReadonlyArray<RegExp> = [
  /^\/api\/overview$/,
  /^\/api\/search$/,
  /^\/api\/accounts$/,
  /^\/api\/accounts\/[0-9a-f-]+$/i,
  /^\/api\/accounts\/[0-9a-f-]+\/installations$/i,
  /^\/api\/trips$/,
  /^\/api\/trips\/[0-9a-f-]+$/i,
  /^\/api\/trips\/[0-9a-f-]+\/itinerary$/i,
  /^\/api\/trips\/[0-9a-f-]+\/itinerary\/versions$/i,
  /^\/api\/receipts$/,
  /^\/api\/receipts\/[0-9a-f-]+$/i,
  /^\/api\/incidents$/,
  /^\/api\/sync-jobs$/,
  /^\/api\/integrity$/,
  /^\/api\/reconciliation$/,
  /^\/api\/providers$/,
  /^\/api\/runtime$/,
  /^\/api\/audit$/,
  /^\/api\/audit\/[0-9a-f-]+$/i,
  /^\/api\/receipts\/[0-9a-f-]+\/photo$/i,
  /^\/api\/operations$/,
  /^\/api\/operations\/[0-9a-f-]+$/i,
];

// The generic kernel is the only mutation surface. Its action allowlist is
// enforced again inside Edge and the private database RPCs.
const WRITE_ROUTE_MAP: ReadonlyArray<RegExp> = [
  /^\/api\/operations\/preview$/,
  /^\/api\/operations\/[0-9a-f-]+\/commit$/i,
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
  return value === "allowlisted" ? "allowlisted" : "deny_all";
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

  if (writeMode === "allowlisted" && matchesRoute(route, WRITE_ROUTE_MAP)) {
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
