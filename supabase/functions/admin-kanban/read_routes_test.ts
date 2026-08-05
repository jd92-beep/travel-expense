import { assertEquals, assertMatch } from "@std/assert";
import { type AdminRpcClient, canonicalizeItinerary, handleAdminReadRoute } from "./read_routes.ts";

class FakeRpcClient implements AdminRpcClient {
  calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

  constructor(
    private readonly responses: Record<
      string,
      { data: unknown; error: { message?: string } | null }
    >,
  ) {}

  rpc(name: string, args?: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve(
      this.responses[name] ?? { data: null, error: { message: "missing fake RPC" } },
    );
  }
}

function accountRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    masked_email: `u${index + 1}***@example.invalid`,
    updated_at: new Date(Date.UTC(2026, 6, 10, 12, 0, -index)).toISOString(),
  }));
}

Deno.test("account route uses limit-plus-one and emits an opaque cursor", async () => {
  const client = new FakeRpcClient({
    admin_read_accounts: {
      data: { items: accountRows(51), total: 75 },
      error: null,
    },
  });

  const result = await handleAdminReadRoute({
    client,
    now: new Date("2026-07-10T12:00:00.000Z"),
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/accounts",
    searchParams: new URLSearchParams("limit=50&status=active"),
  });

  assertEquals(result?.status, 200);
  assertEquals((result?.payload.data as { items: unknown[] }).items.length, 50);
  assertEquals(result?.payload.meta.total, 75);
  assertMatch(result?.payload.meta.nextCursor || "", /^[A-Za-z0-9_-]+$/);
  assertEquals(client.calls, [{
    name: "admin_read_accounts",
    args: {
      p_cursor_id: null,
      p_cursor_updated_at: null,
      p_limit: 51,
      p_platform: null,
      p_q: null,
      p_status: "active",
    },
  }]);
});

Deno.test("read routes reject unknown queries and invalid entity ids", async () => {
  const client = new FakeRpcClient({});
  const invalidQuery = await handleAdminReadRoute({
    client,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/accounts",
    searchParams: new URLSearchParams("table=auth.users"),
  });
  assertEquals(invalidQuery?.status, 400);
  assertEquals(invalidQuery?.payload.error?.code, "VALIDATION_FAILED");

  const invalidId = await handleAdminReadRoute({
    client,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/receipts/not-a-uuid",
    searchParams: new URLSearchParams(),
  });
  assertEquals(invalidId, null);
  assertEquals(client.calls.length, 0);
});

Deno.test("upstream errors and missing addressed records use typed envelopes", async () => {
  const unavailable = new FakeRpcClient({
    admin_read_overview: { data: null, error: { message: "database detail" } },
  });
  const unavailableResult = await handleAdminReadRoute({
    client: unavailable,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/overview",
    searchParams: new URLSearchParams(),
  });
  assertEquals(unavailableResult?.status, 503);
  assertEquals(unavailableResult?.payload.error?.code, "UPSTREAM_UNAVAILABLE");
  assertEquals(JSON.stringify(unavailableResult?.payload).includes("database detail"), false);

  const missing = new FakeRpcClient({
    admin_read_receipt: { data: null, error: null },
  });
  const missingResult = await handleAdminReadRoute({
    client: missing,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/receipts/97000000-0000-4000-8000-000000000099",
    searchParams: new URLSearchParams(),
  });
  assertEquals(missingResult?.status, 404);
  assertEquals(missingResult?.payload.error?.code, "NOT_FOUND");
});

Deno.test("canonical itinerary always includes every local calendar day", () => {
  const normalized = canonicalizeItinerary({
    tripId: "98100000-0000-4000-8000-000000000001",
    startDate: "2026-04-20",
    endDate: "2026-04-25",
    version: 7,
    itinerary: [
      {
        date: "2026-04-20",
        region: "Nagoya",
        highlight: "Arrival",
        spots: [{ id: "spot-a", name: "Nagoya Castle", time: "10:00" }],
      },
      {
        date: "2026-04-20",
        region: "Duplicate",
        spots: [{ name: "Atsuta Shrine", time: "13:00" }],
      },
      {
        date: "2026-04-26",
        region: "Outside",
        spots: [{ name: "Out of range scenery" }],
      },
      {
        date: "2026-04-25",
        region: "Airport",
        spots: [{ name: "Chubu Airport", address: "Tokoname" }],
      },
    ],
  });

  assertEquals(normalized.data.startDate, "2026-04-20");
  assertEquals(normalized.data.endDate, "2026-04-25");
  assertEquals(normalized.data.days.map((day) => day.date), [
    "2026-04-20",
    "2026-04-21",
    "2026-04-22",
    "2026-04-23",
    "2026-04-24",
    "2026-04-25",
  ]);
  assertEquals(normalized.data.days[0].spots.map((spot) => spot.name), [
    "Nagoya Castle",
    "Atsuta Shrine",
  ]);
  assertEquals(
    normalized.data.days.flatMap((day) => day.spots).some((spot) =>
      spot.name === "Out of range scenery"
    ),
    false,
  );
  assertEquals(normalized.data.integrityIssues.map((issue) => issue.code), [
    "DUPLICATE_DAY",
    "OUT_OF_RANGE_DAY",
    "MISSING_DAY",
    "MISSING_DAY",
    "MISSING_DAY",
    "MISSING_DAY",
  ]);
});

Deno.test("itinerary route returns warnings instead of dropping missing days", async () => {
  const client = new FakeRpcClient({
    admin_read_trip_itinerary: {
      data: {
        tripId: "98100000-0000-4000-8000-000000000001",
        startDate: "2026-04-20",
        endDate: "2026-04-25",
        version: 2,
        itinerary: [{ date: "2026-04-20", title: "Day 1", spots: [] }],
      },
      error: null,
    },
  });
  const result = await handleAdminReadRoute({
    client,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/trips/98100000-0000-4000-8000-000000000001/itinerary",
    searchParams: new URLSearchParams(),
  });

  const data = result?.payload.data as { days: unknown[] };
  assertEquals(result?.status, 200);
  assertEquals(data.days.length, 6);
  assertEquals(result?.payload.meta.warnings, ["ITINERARY_MISSING_DAYS:5"]);
});

Deno.test("itinerary version history is fixed to one trip and bounded", async () => {
  const client = new FakeRpcClient({
    admin_read_trip_itinerary_versions: {
      data: {
        items: [{
          version: 7,
          start_date: "2026-04-20",
          end_date: "2026-04-25",
          source: "compact",
          created_at: "2026-07-10T12:00:00.000Z",
        }],
        total: 7,
      },
      error: null,
    },
  });
  const result = await handleAdminReadRoute({
    client,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/trips/98100000-0000-4000-8000-000000000001/itinerary/versions",
    searchParams: new URLSearchParams("limit=50&beforeVersion=8"),
  });

  assertEquals(result?.status, 200);
  assertEquals(result?.payload.meta.total, 7);
  assertEquals(client.calls, [{
    name: "admin_read_trip_itinerary_versions",
    args: {
      p_before_version: 8,
      p_limit: 50,
      p_trip_id: "98100000-0000-4000-8000-000000000001",
    },
  }]);
});

Deno.test("integrity list preserves the scan state and run metadata", async () => {
  const client = new FakeRpcClient({
    admin_read_integrity: {
      data: {
        items: [],
        run: { id: "98600000-0000-4000-8000-000000000001", status: "completed" },
        state: "no_issues",
        total: 0,
      },
      error: null,
    },
  });
  const result = await handleAdminReadRoute({
    client,
    requestId: "97000000-0000-4000-8000-000000000001",
    route: "/api/integrity",
    searchParams: new URLSearchParams(),
  });
  assertEquals((result?.payload.data as { state: string }).state, "no_issues");
  assertEquals(
    (result?.payload.data as { run: { status: string } }).run.status,
    "completed",
  );
});
