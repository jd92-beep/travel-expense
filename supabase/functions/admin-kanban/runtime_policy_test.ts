import { assertEquals } from "@std/assert";

import { runtimePolicyFor } from "./runtime_policy.ts";

Deno.test("runtime policy reports validated write modes", () => {
  assertEquals(runtimePolicyFor("deny_all"), {
    status: "deny_all",
    version: "admin-write-mode-v1",
    source: "ADMIN_WRITE_MODE",
    expiresAt: null,
    writable: false,
    r3UserPurge: false,
  });
  assertEquals(runtimePolicyFor("allowlisted").writable, true);
  assertEquals(runtimePolicyFor("provider_probe_only"), {
    status: "provider_probe_only",
    writable: false,
    source: "ADMIN_WRITE_MODE",
    version: "admin-write-mode-v1",
    expiresAt: null,
    r3UserPurge: false,
  });
});

Deno.test("unknown or missing write modes fail closed", () => {
  assertEquals(runtimePolicyFor("unexpected"), {
    status: "deny_all",
    version: "admin-write-mode-v1",
    source: "ADMIN_WRITE_MODE_INVALID",
    expiresAt: null,
    writable: false,
    r3UserPurge: false,
  });
  assertEquals(runtimePolicyFor(undefined).source, "default");
});
