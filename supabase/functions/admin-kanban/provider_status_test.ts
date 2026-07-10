import { assertEquals } from "@std/assert";
import {
  classifyBrokerOnlyStatus,
  classifyProviderStatus,
  providerProbeSucceeded,
} from "./provider_status.ts";

Deno.test("configured credentials are not automatically healthy", () => {
  assertEquals(classifyProviderStatus({ status: "invalid", hasKey: true }), {
    configured: true,
    healthy: false,
    status: "danger",
    storedStatus: "invalid",
  });
});

Deno.test("only explicit connected or healthy provider status is healthy", () => {
  assertEquals(
    classifyProviderStatus({ status: "connected", hasKey: true }).healthy,
    true,
  );
  assertEquals(
    classifyProviderStatus({ status: "healthy", hasKey: true }).healthy,
    true,
  );
  assertEquals(
    classifyProviderStatus({ status: "missing", hasKey: false }).healthy,
    false,
  );
});

Deno.test("broker liveness cannot be expanded into provider health", () => {
  assertEquals(classifyBrokerOnlyStatus(), {
    configured: null,
    healthy: null,
    status: "warning",
    storedStatus: "unknown_broker_online",
  });
});

Deno.test("HTTP 200 with invalid nested provider status is a failed probe", () => {
  assertEquals(
    providerProbeSucceeded(200, { ok: true, status: { status: "invalid" } }),
    false,
  );
  assertEquals(
    providerProbeSucceeded(200, { ok: true, status: { status: "healthy" } }),
    true,
  );
  assertEquals(
    providerProbeSucceeded(502, { ok: false, status: { status: "healthy" } }),
    false,
  );
});
