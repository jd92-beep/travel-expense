const HEADER = {
  keyId: "x-admin-key-id",
  requestId: "x-admin-request-id",
  sessionHash: "x-admin-session-hash",
  actor: "x-admin-actor",
  issuedAt: "x-admin-issued-at",
  expiresAt: "x-admin-expires-at",
  nonce: "x-admin-nonce",
  signature: "x-admin-signature",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^(?:[0-9a-f]{64}|unauthenticated)$/;
const KEY_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ACTOR_RE = /^[A-Za-z0-9@._:-]{1,128}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;

export type BffVerificationContext = {
  actor: string;
  bodyBytes: Uint8Array;
  expiresAt: number;
  keyId: string;
  nonce: string;
  requestId: string;
  route: string;
  sessionHash: string;
};

export class BffVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalQuery(searchParams: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [key, value] of searchParams.entries()) {
    if (seen.has(key)) {
      throw new BffVerificationError(
        "ADMIN_DUPLICATE_QUERY",
        400,
        "Duplicate query parameters are not allowed",
      );
    }
    seen.add(key);
    entries.push([key, value]);
  }
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  );
  return entries.map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join("&");
}

export function normalizeFunctionPath(
  pathname: string,
  functionName: string,
): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new BffVerificationError("ADMIN_PATH_INVALID", 400, "Invalid path encoding");
  }

  if (decoded.includes("\0") || decoded.includes("//")) {
    throw new BffVerificationError("ADMIN_PATH_INVALID", 400, "Invalid path");
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new BffVerificationError("ADMIN_PATH_INVALID", 400, "Invalid path segments");
  }

  const marker = `/functions/v1/${functionName}`;
  const markerIndex = decoded.indexOf(marker);
  if (markerIndex < 0 || markerIndex !== decoded.lastIndexOf(marker)) {
    throw new BffVerificationError("ADMIN_PATH_INVALID", 400, "Function path mismatch");
  }
  const route = decoded.slice(markerIndex + marker.length) || "/";
  if (!route.startsWith("/")) {
    throw new BffVerificationError("ADMIN_PATH_INVALID", 400, "Invalid function route");
  }
  return route;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value: string): Uint8Array {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(value.length / 4) * 4,
      "=",
    );
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))),
  );
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = decodeBase64url(left);
  const rightBytes = decodeBase64url(right);
  if (leftBytes.length === 0 || leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

export function canonicalBffPayload(input: {
  actor: string;
  bodyHash: string;
  expiresAt: number;
  issuedAt: number;
  keyId: string;
  method: string;
  nonce: string;
  query: string;
  requestId: string;
  route: string;
  sessionHash: string;
}): string {
  return [
    "admin-v1",
    input.keyId,
    input.method.toUpperCase(),
    input.route,
    input.query,
    input.bodyHash,
    input.requestId,
    input.sessionHash,
    input.actor,
    String(input.issuedAt),
    String(input.expiresAt),
    input.nonce,
  ].join("\n");
}

function requiredHeader(req: Request, name: string): string {
  const value = req.headers.get(name)?.trim() || "";
  if (!value) {
    throw new BffVerificationError("ADMIN_SIGNATURE_MISSING", 401, "Signed admin request required");
  }
  return value;
}

export async function verifySignedBffRequest(
  req: Request,
  options: {
    functionName: string;
    keys: Readonly<Record<string, string>>;
    nowSeconds?: number;
    consumeNonce: (nonceHash: string, requestId: string, expiresAt: number) => Promise<boolean>;
  },
): Promise<BffVerificationContext> {
  if (req.headers.has("origin")) {
    throw new BffVerificationError(
      "ADMIN_BROWSER_EDGE_REJECTED",
      403,
      "Direct browser access is not allowed",
    );
  }

  const keyId = requiredHeader(req, HEADER.keyId);
  const requestId = requiredHeader(req, HEADER.requestId);
  const sessionHash = requiredHeader(req, HEADER.sessionHash);
  const actor = requiredHeader(req, HEADER.actor);
  const issuedAtText = requiredHeader(req, HEADER.issuedAt);
  const expiresAtText = requiredHeader(req, HEADER.expiresAt);
  const nonce = requiredHeader(req, HEADER.nonce);
  const signature = requiredHeader(req, HEADER.signature);

  if (
    !KEY_ID_RE.test(keyId) || !UUID_RE.test(requestId) || !HASH_RE.test(sessionHash) ||
    !ACTOR_RE.test(actor) || !NONCE_RE.test(nonce)
  ) {
    throw new BffVerificationError(
      "ADMIN_SIGNATURE_INVALID",
      401,
      "Signed admin request is malformed",
    );
  }

  const issuedAt = Number(issuedAtText);
  const expiresAt = Number(expiresAtText);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(issuedAt) || !Number.isInteger(expiresAt) ||
    expiresAt <= issuedAt || expiresAt - issuedAt > 30 ||
    issuedAt > now + 5 || expiresAt < now - 5
  ) {
    throw new BffVerificationError("ADMIN_SIGNATURE_EXPIRED", 401, "Signed admin request expired");
  }

  const secret = options.keys[keyId];
  if (!secret || secret.length < 32) {
    throw new BffVerificationError(
      "ADMIN_SIGNATURE_INVALID",
      401,
      "Signed admin request key is invalid",
    );
  }

  const url = new URL(req.url);
  const route = normalizeFunctionPath(url.pathname, options.functionName);
  const bodyBytes = new Uint8Array(await req.clone().arrayBuffer());
  const payload = canonicalBffPayload({
    actor,
    bodyHash: await sha256Hex(bodyBytes),
    expiresAt,
    issuedAt,
    keyId,
    method: req.method,
    nonce,
    query: canonicalQuery(url.searchParams),
    requestId,
    route,
    sessionHash,
  });
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(signature, expected)) {
    throw new BffVerificationError(
      "ADMIN_SIGNATURE_INVALID",
      401,
      "Signed admin request is invalid",
    );
  }

  const nonceHash = await sha256Hex(new TextEncoder().encode(nonce));
  if (!await options.consumeNonce(nonceHash, requestId, expiresAt)) {
    throw new BffVerificationError(
      "ADMIN_SIGNATURE_REPLAY",
      409,
      "Signed admin request was already used",
    );
  }

  return { actor, bodyBytes, expiresAt, keyId, nonce, requestId, route, sessionHash };
}

export const adminBffHeaders = HEADER;
