import { assertEquals } from "@std/assert";
import { aggregateProviderRows } from "./system_status.ts";

Deno.test("provider aggregation returns one row with production evidence", () => {
  const rows = aggregateProviderRows({
    brokerProviders: [{ provider: "google", label: "Google", status: "connected", hasKey: true }],
    brokerVerified: true,
    usageRows: [
      {
        provider: "google",
        model: "google/gemma-4-31b",
        outcome: "success",
        duration_ms: 100,
        created_at: "2026-07-10T10:00:00Z",
      },
      {
        provider: "google",
        model: "google/gemma-4-31b",
        outcome: "success",
        duration_ms: 300,
        created_at: "2026-07-10T10:01:00Z",
      },
      {
        provider: "google",
        model: "google/gemma-4-31b",
        outcome: "error",
        error_code: "429",
        duration_ms: 500,
        created_at: "2026-07-10T10:02:00Z",
      },
      {
        provider: "google",
        event_name: "provider_test_google",
        outcome: "success",
        created_at: "2026-07-10T10:03:00Z",
      },
    ],
  });

  assertEquals(rows.find((row) => row.provider === "google"), {
    provider: "google",
    label: "Google",
    configured: true,
    healthy: true,
    status: "healthy",
    storedStatus: "connected",
    requiredModel: "google/gemma-4-31b",
    actualModel: "google/gemma-4-31b",
    lastSuccessfulRequestAt: "2026-07-10T10:01:00Z",
    lastProbeAt: "2026-07-10T10:03:00Z",
    p50LatencyMs: 300,
    p95LatencyMs: 500,
    errors24h: 1,
    rateLimited24h: 1,
  });
  assertEquals(rows.filter((row) => row.provider === "google").length, 1);
});

Deno.test("broker liveness alone never becomes provider health", () => {
  const rows = aggregateProviderRows({
    brokerProviders: [],
    brokerVerified: false,
    usageRows: [],
  });
  assertEquals(rows.find((row) => row.provider === "kimi")?.healthy, null);
  assertEquals(rows.find((row) => row.provider === "google")?.configured, null);
  assertEquals(new Set(rows.map((row) => row.provider)).size, rows.length);
});

Deno.test("configured invalid credentials remain failed", () => {
  const rows = aggregateProviderRows({
    brokerProviders: [{ provider: "kimi", status: "invalid", hasKey: true }],
    brokerVerified: true,
    usageRows: [],
  });
  assertEquals(rows.find((row) => row.provider === "kimi")?.configured, true);
  assertEquals(rows.find((row) => row.provider === "kimi")?.healthy, false);
  assertEquals(rows.find((row) => row.provider === "kimi")?.status, "danger");
});
