import { assertEquals, assertRejects } from "@std/assert";
import { AdminOperationError } from "./operations.ts";
import {
  compareTripReceipts,
  extractNotionReceipts,
  reconcileTripReadOnly,
  type ReconciliationContext,
} from "./reconciliation.ts";

const TRIP_ID = "97000000-0000-4000-8000-000000000001";
const USER_ID = "97000000-0000-4000-8000-000000000002";
const DATABASE_ID = "1234567890abcdef1234567890abcdef";

function textProperty(value: string) {
  return { rich_text: [{ plain_text: value }] };
}

class FakeQuery {
  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>,
  ) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  is() {
    return this;
  }

  order() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.rows[this.table] ?? { data: null, error: null });
  }

  range() {
    return Promise.resolve(this.rows[this.table] ?? { data: [], error: null });
  }
}

class FakeClient {
  constructor(private readonly rows: Record<string, unknown>) {}

  from(table: string) {
    return new FakeQuery(table, this.rows);
  }
}

function reconciliationClient(
  options: { binding?: boolean } = {},
): ReconciliationContext["client"] {
  return new FakeClient({
    receipts: {
      data: [
        {
          id: "97000000-0000-4000-8000-000000000011",
          notion_page_id: "page-match",
          source_id: "receipt-match",
          visibility: "trip",
        },
        {
          id: "97000000-0000-4000-8000-000000000012",
          notion_page_id: null,
          source_id: "receipt-missing",
          visibility: "trip",
        },
        {
          id: "97000000-0000-4000-8000-000000000013",
          notion_page_id: null,
          source_id: "receipt-private",
          visibility: "private",
        },
      ],
      error: null,
    },
    trip_backend_links: {
      data: options.binding === false ? null : {
        last_error: null,
        last_health_at: "2026-07-10T12:00:00.000Z",
        notion_database_ref: DATABASE_ID,
        notion_owner_user_id: USER_ID,
        status: "active",
        sync_mode: "dual_write",
      },
      error: null,
    },
    trips: {
      data: {
        app_metadata: { localTripId: "nagoya-local" },
        id: TRIP_ID,
        legacy_source_id: "nagoya-local",
        name: "Nagoya 2026",
        notion_database_id: options.binding === false ? null : DATABASE_ID,
        owner_id: USER_ID,
      },
      error: null,
    },
  }) as unknown as ReconciliationContext["client"];
}

Deno.test("Notion extraction is trip scoped and excludes metadata rows", () => {
  const extracted = extractNotionReceipts([
    {
      id: "page-1",
      properties: {
        "🔑 SourceID": textProperty("receipt-match"),
        "Trip ID": textProperty("nagoya-local"),
      },
    },
    {
      id: "page-2",
      properties: {
        SourceID: textProperty("receipt-other-trip"),
        TripID: textProperty("osaka-local"),
      },
    },
    {
      id: "page-3",
      properties: {
        SourceID: textProperty("__meta_settings__"),
      },
    },
    {
      id: "page-4",
      properties: {
        SourceID: textProperty("receipt-unscoped"),
        Store: { title: [{ plain_text: "Unscoped receipt" }] },
      },
    },
  ], new Set([TRIP_ID, "nagoya-local"]));

  assertEquals(extracted.receipts.map((row) => row.sourceId), ["receipt-match"]);
  assertEquals(extracted.blockedRows, 1);
});

Deno.test("receipt comparison reports exact match, missing, orphan, and duplicates", () => {
  const comparison = compareTripReceipts([
    { id: "r1", source_id: "match", notion_page_id: "p1", visibility: "trip" },
    { id: "r2", source_id: "missing", notion_page_id: null, visibility: "trip" },
    { id: "r3", source_id: "dup-supabase", notion_page_id: null, visibility: "trip" },
    { id: "r4", source_id: "dup-supabase", notion_page_id: null, visibility: "trip" },
    { id: "r5", source_id: "private", notion_page_id: null, visibility: "private" },
  ], [
    { pageId: "p1", sourceId: "match", tripId: "trip" },
    { pageId: "p2", sourceId: "notion-only", tripId: "trip" },
    { pageId: "p3", sourceId: "notion-dup", tripId: "trip" },
    { pageId: "p4", sourceId: "notion-dup", tripId: "trip" },
  ]);

  assertEquals(comparison.matchingReceipts, 1);
  assertEquals(comparison.missingInNotion, 1);
  assertEquals(comparison.notionOnly, 2);
  assertEquals(comparison.duplicateNotion, 1);
  assertEquals(comparison.duplicateSupabase, 1);
  assertEquals(comparison.notionTripReceipts, 4);
});

Deno.test("trip reconciliation resolves personal binding server side", async () => {
  let brokerBody: Record<string, unknown> | null = null;
  const result = await reconcileTripReadOnly({
    brokerKey: "test-edge-broker-key-with-32-bytes-minimum",
    brokerUrl: "https://broker.example.test",
    client: reconciliationClient(),
    fetcher: (_input, init) => {
      brokerBody = JSON.parse(String(init?.body || "{}"));
      return Promise.resolve(Response.json({
        ok: true,
        data: {
          has_more: false,
          results: [
            {
              id: "notion-1",
              properties: {
                SourceID: textProperty("receipt-match"),
                TripID: textProperty("nagoya-local"),
              },
            },
            {
              id: "notion-2",
              properties: {
                SourceID: textProperty("notion-only"),
                TripID: textProperty("nagoya-local"),
              },
            },
            {
              id: "notion-3",
              properties: {
                SourceID: textProperty("other-trip"),
                TripID: textProperty("osaka-local"),
              },
            },
          ],
        },
      }));
    },
    requestId: "reconcile-request",
  }, TRIP_ID);

  assertEquals(result.data.databaseScope, "personal");
  assertEquals(result.data.notionSource, "live");
  assertEquals(result.data.tripReceipts, 2);
  assertEquals(result.data.privateReceiptsExcluded, 1);
  assertEquals(result.data.matchingReceipts, 1);
  assertEquals(result.data.missingInNotion, 1);
  assertEquals(result.data.notionOnly, 1);
  assertEquals(result.sources.notion, "live");
  const capturedBody = brokerBody as Record<string, unknown> | null;
  assertEquals(capturedBody?.["internalUserId"], USER_ID);
  assertEquals(capturedBody?.["databaseId"], DATABASE_ID);
  assertEquals(JSON.stringify(result).includes(DATABASE_ID), false);
});

Deno.test("unconfigured reconciliation does not invent missing Notion rows", async () => {
  let fetchCalls = 0;
  const result = await reconcileTripReadOnly({
    brokerKey: "test-edge-broker-key-with-32-bytes-minimum",
    brokerUrl: "https://broker.example.test",
    client: reconciliationClient({ binding: false }),
    fetcher: () => {
      fetchCalls += 1;
      return Promise.resolve(Response.json({}));
    },
    requestId: "reconcile-request",
  }, TRIP_ID);

  assertEquals(fetchCalls, 0);
  assertEquals(result.data.binding, "none");
  assertEquals(result.data.missingInNotion, 0);
  assertEquals(result.data.items, []);
  assertEquals(result.warnings, ["NOTION_NOT_CONFIGURED"]);
});

Deno.test("Notion rate limits stop reconciliation without fallback", async () => {
  const error = await assertRejects(
    () =>
      reconcileTripReadOnly({
        brokerKey: "test-edge-broker-key-with-32-bytes-minimum",
        brokerUrl: "https://broker.example.test",
        client: reconciliationClient(),
        fetcher: () =>
          Promise.resolve(Response.json({ ok: false, error: "quota" }, {
            status: 429,
            headers: { "Retry-After": "17" },
          })),
        requestId: "reconcile-request",
      }, TRIP_ID),
    AdminOperationError,
  );
  assertEquals((error as AdminOperationError).code, "RATE_LIMITED");
  assertEquals((error as AdminOperationError).retryAfterSeconds, 17);
});
