import { assertEquals } from "@std/assert";

import { runtimePolicyFor } from "./runtime_policy.ts";

Deno.test("runtime policy reports validated write modes", () => {
  assertEquals(runtimePolicyFor("deny_all"), {
    status: "deny_all",
    version: "admin-write-mode-v1",
    source: "ADMIN_WRITE_MODE",
    expiresAt: null,
    writable: false,
  });
  assertEquals(runtimePolicyFor("allowlisted").writable, true);
});

Deno.test("unknown or missing write modes fail closed", () => {
  assertEquals(runtimePolicyFor("unexpected"), {
    status: "deny_all",
    version: "admin-write-mode-v1",
    source: "ADMIN_WRITE_MODE_INVALID",
    expiresAt: null,
    writable: false,
  });
  assertEquals(runtimePolicyFor(undefined).source, "default");
});
