import {
  evaluateAdminRequest,
  isAdminOperationAllowed,
  normalizeAdminApiPath,
  rejectedSignatureIdentity,
  resolveAdminWriteMode,
} from "./security.ts";

import { assertEquals, assertMatch } from "@std/assert";

Deno.test("unknown write modes fail closed", () => {
  assertEquals(resolveAdminWriteMode(undefined), "deny_all");
  assertEquals(resolveAdminWriteMode("unexpected"), "deny_all");
  assertEquals(resolveAdminWriteMode("allowlisted"), "allowlisted");
  assertEquals(resolveAdminWriteMode("provider_probe_only"), "provider_probe_only");
});

Deno.test("provider probe mode exposes the kernel only for provider probes", () => {
  const preview = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/operations/preview",
      { method: "POST" },
    ),
    "provider_probe_only",
  );
  assertEquals(preview.allowed, true);
  assertEquals(isAdminOperationAllowed("provider_probe_only", "provider_probe"), true);
  assertEquals(isAdminOperationAllowed("provider_probe_only", "support_bundle"), false);
  assertEquals(isAdminOperationAllowed("deny_all", "provider_probe"), false);
  assertEquals(isAdminOperationAllowed("allowlisted", "receipt_amend"), true);
});

Deno.test("unverified signature headers never become an audit identity", () => {
  assertEquals(
    rejectedSignatureIdentity(
      new Headers({
        "x-admin-actor": "spoofed-boss",
        "x-admin-session-hash": "a".repeat(64),
      }),
    ),
    { actor: "unauthenticated", sessionHash: "unauthenticated" },
  );
});

Deno.test("deny_all blocks every mutation with a request id", () => {
  const result = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/test-provider",
      {
        method: "POST",
      },
    ),
    "deny_all",
  );

  assertEquals(result.allowed, false);
  if (result.allowed) throw new Error("expected request rejection");
  assertEquals(result.status, 503);
  assertEquals(result.code, "ADMIN_WRITES_DISABLED");
  assertMatch(result.requestId, /^[0-9a-f-]{36}$/i);
});

Deno.test("allowlisted mode exposes only the generic operation kernel", () => {
  const preview = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/operations/preview",
      { method: "POST" },
    ),
    "allowlisted",
  );
  assertEquals(preview.allowed, true);

  const commit = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/operations/97000000-0000-4000-8000-000000000001/commit",
      { method: "POST" },
    ),
    "allowlisted",
  );
  assertEquals(commit.allowed, true);

  const legacy = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/test-provider",
      { method: "POST" },
    ),
    "allowlisted",
  );
  assertEquals(legacy.allowed, false);
});

Deno.test("allowlisted mode still denies routes absent from the write allowlist", () => {
  const result = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/delete-user",
      {
        method: "POST",
      },
    ),
    "allowlisted",
  );

  assertEquals(result.allowed, false);
  if (result.allowed) throw new Error("expected request rejection");
  assertEquals(result.code, "ADMIN_WRITES_DISABLED");
});

Deno.test("GET requests only pass through the fixed read route map", () => {
  const allowed = evaluateAdminRequest(
    new Request("https://edge.example/functions/v1/admin-kanban/api/runtime"),
    "deny_all",
  );
  assertEquals(allowed.allowed, true);

  const rejected = evaluateAdminRequest(
    new Request(
      "https://edge.example/functions/v1/admin-kanban/api/arbitrary-table",
    ),
    "deny_all",
  );
  assertEquals(rejected.allowed, false);
  if (rejected.allowed) throw new Error("expected route rejection");
  assertEquals(rejected.status, 404);
  assertEquals(rejected.code, "ADMIN_ROUTE_NOT_ALLOWED");
});

Deno.test("production read resources and addressed entities are allowlisted", () => {
  const routes = [
    "/api/overview",
    "/api/search?q=nagoya",
    "/api/accounts?limit=50",
    "/api/accounts/97000000-0000-4000-8000-000000000001",
    "/api/accounts/97000000-0000-4000-8000-000000000001/installations",
    "/api/trips",
    "/api/trips/97000000-0000-4000-8000-000000000001/itinerary",
    "/api/receipts",
    "/api/receipts/97000000-0000-4000-8000-000000000001",
    "/api/incidents",
    "/api/sync-jobs",
    "/api/integrity",
    "/api/reconciliation?tripId=97000000-0000-4000-8000-000000000001",
    "/api/providers",
    "/api/runtime",
    "/api/audit",
    "/api/audit/97000000-0000-4000-8000-000000000001",
    "/api/receipts/97000000-0000-4000-8000-000000000001/photo",
    "/api/operations?status=active",
    "/api/operations/97000000-0000-4000-8000-000000000001",
  ];
  for (const route of routes) {
    const result = evaluateAdminRequest(
      new Request(`https://edge.example/functions/v1/admin-kanban${route}`),
      "deny_all",
    );
    assertEquals(result.allowed, true, route);
  }
});

Deno.test("legacy prototype read routes are not externally reachable", () => {
  for (
    const route of [
      "/api/snapshot",
      "/api/config-health",
      "/api/identity/duplicates",
      "/api/data-doctor",
      "/api/reconcile",
    ]
  ) {
    const result = evaluateAdminRequest(
      new Request(`https://edge.example/functions/v1/admin-kanban${route}`),
      "allowlisted",
    );
    assertEquals(result.allowed, false, route);
  }
});

Deno.test("browser preflight is not an Edge authorization path", () => {
  const result = evaluateAdminRequest(
    new Request("https://edge.example/functions/v1/admin-kanban/api/runtime", {
      method: "OPTIONS",
    }),
    "deny_all",
  );
  assertEquals(result.allowed, false);
  if (result.allowed) throw new Error("expected preflight rejection");
  assertEquals(result.status, 405);
  assertEquals(result.code, "ADMIN_METHOD_NOT_ALLOWED");
});

Deno.test("canonical path rejects dot segments and encoded dot segments", () => {
  assertEquals(
    normalizeAdminApiPath("/functions/v1/admin-kanban/api/runtime"),
    "/api/runtime",
  );
  assertEquals(
    normalizeAdminApiPath("/functions/v1/admin-kanban/api/../runtime"),
    null,
  );
  assertEquals(
    normalizeAdminApiPath("/functions/v1/admin-kanban/api/%2e%2e/runtime"),
    null,
  );
});

Deno.test("request id only accepts UUID input", () => {
  const accepted = evaluateAdminRequest(
    new Request("https://edge.example/functions/v1/admin-kanban/api/runtime", {
      headers: { "x-admin-request-id": "018f06fd-8bc9-7e9c-8443-7c20f0c7d479" },
    }),
    "deny_all",
  );
  assertEquals(accepted.requestId, "018f06fd-8bc9-7e9c-8443-7c20f0c7d479");

  const replaced = evaluateAdminRequest(
    new Request("https://edge.example/functions/v1/admin-kanban/api/runtime", {
      headers: { "x-admin-request-id": "not-a-safe-id" },
    }),
    "deny_all",
  );
  assertMatch(replaced.requestId, /^[0-9a-f-]{36}$/i);
});
