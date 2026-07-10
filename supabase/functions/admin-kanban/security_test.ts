import { evaluateAdminRequest, normalizeAdminApiPath, resolveAdminWriteMode } from "./security.ts";

import { assertEquals, assertMatch } from "@std/assert";

Deno.test("unknown write modes fail closed", () => {
  assertEquals(resolveAdminWriteMode(undefined), "deny_all");
  assertEquals(resolveAdminWriteMode("unexpected"), "deny_all");
  assertEquals(resolveAdminWriteMode("allowlisted"), "allowlisted");
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
