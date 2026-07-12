import { assertEquals, assertRejects } from "@std/assert";

import {
  adminBffHeaders,
  BffVerificationError,
  canonicalBffPayload,
  canonicalQuery,
  normalizeFunctionPath,
  sha256Hex,
  verifySignedBffRequest,
} from "./admin_bff.ts";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signature(secret: string, payload: string): Promise<string> {
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

async function signedRequest(options: { origin?: string; expiresAt?: number } = {}) {
  const keyId = "test-key";
  const secret = "0123456789abcdef0123456789abcdef";
  const requestId = "018f06fd-8bc9-7e9c-8443-7c20f0c7d479";
  const issuedAt = 2_000_000_000;
  const expiresAt = options.expiresAt ?? issuedAt + 30;
  const nonce = "abcdefghijklmnopqrstuv";
  const body = JSON.stringify({ hello: "world" });
  const url = "https://edge.example/functions/v1/admin-kanban/api/runtime?z=2&a=1";
  const payload = canonicalBffPayload({
    actor: "boss",
    bodyHash: await sha256Hex(new TextEncoder().encode(body)),
    expiresAt,
    issuedAt,
    keyId,
    method: "POST",
    nonce,
    query: "a=1&z=2",
    requestId,
    route: "/api/runtime",
    sessionHash: "unauthenticated",
  });
  const headers = new Headers({
    "content-type": "application/json",
    [adminBffHeaders.keyId]: keyId,
    [adminBffHeaders.requestId]: requestId,
    [adminBffHeaders.sessionHash]: "unauthenticated",
    [adminBffHeaders.actor]: "boss",
    [adminBffHeaders.issuedAt]: String(issuedAt),
    [adminBffHeaders.expiresAt]: String(expiresAt),
    [adminBffHeaders.nonce]: nonce,
    [adminBffHeaders.signature]: await signature(secret, payload),
  });
  if (options.origin) headers.set("origin", options.origin);
  return {
    request: new Request(url, { method: "POST", headers, body }),
    secret,
    issuedAt,
  };
}

Deno.test("canonical query sorts keys and rejects duplicates", () => {
  assertEquals(canonicalQuery(new URLSearchParams("z=two words&a=%2F")), "a=%2F&z=two%20words");
  try {
    canonicalQuery(new URLSearchParams("a=1&a=2"));
    throw new Error("expected duplicate rejection");
  } catch (error) {
    assertEquals((error as BffVerificationError).code, "ADMIN_DUPLICATE_QUERY");
  }
});

Deno.test("function path rejects dot segments and wrong functions", () => {
  assertEquals(
    normalizeFunctionPath("/functions/v1/admin-kanban/api/runtime", "admin-kanban"),
    "/api/runtime",
  );
  for (
    const path of [
      "/functions/v1/admin-kanban/api/../runtime",
      "/functions/v1/other/api/runtime",
    ]
  ) {
    try {
      normalizeFunctionPath(path, "admin-kanban");
      throw new Error("expected path rejection");
    } catch (error) {
      assertEquals((error as BffVerificationError).code, "ADMIN_PATH_INVALID");
    }
  }
});

Deno.test("valid signed request consumes nonce exactly once", async () => {
  const { request, secret, issuedAt } = await signedRequest();
  let consumed = false;
  const consumeNonce = () => {
    if (consumed) return Promise.resolve(false);
    consumed = true;
    return Promise.resolve(true);
  };
  const context = await verifySignedBffRequest(request, {
    functionName: "admin-kanban",
    keys: { "test-key": secret },
    maxBodyBytes: 64 * 1024,
    nowSeconds: issuedAt + 10,
    consumeNonce,
  });
  assertEquals(context.route, "/api/runtime");
  assertEquals(context.actor, "boss");

  const replay = await signedRequest();
  await assertRejects(
    () =>
      verifySignedBffRequest(replay.request, {
        functionName: "admin-kanban",
        keys: { "test-key": secret },
        maxBodyBytes: 64 * 1024,
        nowSeconds: issuedAt + 10,
        consumeNonce,
      }),
    BffVerificationError,
    "already used",
  );
});

Deno.test("direct browser and expired signed requests are rejected", async () => {
  const browser = await signedRequest({ origin: "https://travel-expense-admin-kanban.vercel.app" });
  await assertRejects(
    () =>
      verifySignedBffRequest(browser.request, {
        functionName: "admin-kanban",
        keys: { "test-key": browser.secret },
        maxBodyBytes: 64 * 1024,
        nowSeconds: browser.issuedAt + 10,
        consumeNonce: () => Promise.resolve(true),
      }),
    BffVerificationError,
    "Direct browser",
  );

  const expired = await signedRequest();
  await assertRejects(
    () =>
      verifySignedBffRequest(expired.request, {
        functionName: "admin-kanban",
        keys: { "test-key": expired.secret },
        maxBodyBytes: 64 * 1024,
        nowSeconds: expired.issuedAt + 60,
        consumeNonce: () => Promise.resolve(true),
      }),
    BffVerificationError,
    "expired",
  );
});

Deno.test("declared oversized bodies are rejected before signature verification", async () => {
  const signed = await signedRequest();
  const headers = new Headers(signed.request.headers);
  headers.set("content-length", "65537");
  const oversized = new Request(signed.request.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ hello: "world" }),
  });
  const error = await assertRejects(
    () =>
      verifySignedBffRequest(oversized, {
        functionName: "admin-kanban",
        keys: { "test-key": signed.secret },
        maxBodyBytes: 64 * 1024,
        nowSeconds: signed.issuedAt + 10,
        consumeNonce: () => Promise.resolve(true),
      }),
    BffVerificationError,
  );
  assertEquals(error.code, "ADMIN_BODY_TOO_LARGE");
  assertEquals(error.status, 413);
});
