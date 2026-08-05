import { assertEquals, assertThrows } from "@std/assert";
import {
  buildReceiptProperties,
  handleReceiptSyncRequest,
  resolveReceiptSchema,
  SyncWorkerError,
} from "./worker.ts";

const SECRET = "test-receipt-sync-secret-with-32-bytes";
const DATABASE_ID = "11111111111111111111111111111111";
const PAGE_ID = "22222222222222222222222222222222";
const OWNER_ID = "97000000-0000-4000-8000-000000000001";
const JOB_ID = "97000000-0000-4000-8000-000000000002";
const RECEIPT_ID = "97000000-0000-4000-8000-000000000003";

const database = {
  properties: {
    Amount: { type: "number" },
    Category: { type: "select" },
    Currency: { type: "select" },
    Date: { type: "date" },
    Name: { type: "title" },
    SourceID: { type: "rich_text" },
    "Trip ID": { type: "rich_text" },
    Version: { type: "number" },
  },
};

function job() {
  return {
    attempts: 0,
    databaseRef: DATABASE_ID,
    id: JOB_ID,
    notionOwnerUserId: OWNER_ID,
    notionTripId: "nagoya-local",
    operation: "upsert" as const,
    receipt: {
      address: null,
      amount: 1200,
      category: "food",
      currency: "JPY",
      deletedAt: null,
      id: RECEIPT_ID,
      itemsText: null,
      note: null,
      paymentMethod: "cash",
      recordDate: "2026-04-20",
      recordKind: "expense",
      recordTime: "12:30:00",
      sourceId: "receipt-source-1",
      store: "Nagoya lunch",
      version: 3,
      visibility: "trip",
    },
  };
}

function request(options: { body?: unknown; origin?: string; secret?: string } = {}) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Sync-Worker-Key": options.secret ?? SECRET,
  });
  if (options.origin) headers.set("Origin", options.origin);
  return new Request("https://worker.example.test", {
    body: JSON.stringify(options.body ?? { limit: 10 }),
    headers,
    method: "POST",
  });
}

function dependencies(
  jobs: unknown[],
  fetcher: typeof fetch,
) {
  const finishes: Array<{ name: string; args?: Record<string, unknown> }> = [];
  return {
    dependencies: {
      client: {
        rpc(name: string, args?: Record<string, unknown>) {
          if (name === "claim_receipt_sync_jobs_worker") {
            return Promise.resolve({ data: jobs, error: null });
          }
          finishes.push({ name, args });
          return Promise.resolve({ data: {}, error: null });
        },
      },
      env: {
        brokerKey: "test-edge-broker-key-with-32-bytes-minimum",
        brokerUrl: "https://broker.example.test",
        deploymentId: "edge-test",
        workerSecret: SECRET,
      },
      fetcher,
    },
    finishes,
  };
}

Deno.test("receipt schema requires exact SourceID and TripID properties", () => {
  const schema = resolveReceiptSchema(database);
  const properties = buildReceiptProperties(schema, job());
  assertEquals(properties.SourceID, {
    rich_text: [{ text: { content: "receipt-source-1" } }],
  });
  assertEquals(properties["Trip ID"], {
    rich_text: [{ text: { content: "nagoya-local" } }],
  });
  assertEquals(properties.Name, {
    title: [{ text: { content: "Nagoya lunch" } }],
  });

  assertThrows(
    () => resolveReceiptSchema({ properties: { ...database.properties, "Trip ID": undefined } }),
    SyncWorkerError,
    "TripID property is missing",
  );
});

Deno.test("worker creates one idempotent Notion page and commits verified result", async () => {
  const brokerBodies: Record<string, unknown>[] = [];
  const fixture = dependencies(
    [job()],
    ((_input, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      brokerBodies.push(body);
      if (body.path === `/databases/${DATABASE_ID}`) {
        return Promise.resolve(Response.json({ ok: true, data: database }));
      }
      if (body.path === `/databases/${DATABASE_ID}/query`) {
        return Promise.resolve(Response.json({ ok: true, data: { results: [] } }));
      }
      if (body.path === "/pages") {
        return Promise.resolve(Response.json({ ok: true, data: { id: PAGE_ID } }));
      }
      return Promise.resolve(Response.json({ ok: false }, { status: 500 }));
    }) as typeof fetch,
  );

  const response = await handleReceiptSyncRequest(request(), fixture.dependencies);
  const payload = await response.json();
  assertEquals(response.status, 200);
  assertEquals(payload, {
    claimed: 1,
    failed: 0,
    ok: true,
    outcomeUnknown: 0,
    requestId: payload.requestId,
    succeeded: 1,
  });
  assertEquals(brokerBodies.every((body) => body.internalUserId === OWNER_ID), true);
  assertEquals(brokerBodies.some((body) => body.path === "/pages"), true);
  assertEquals(fixture.finishes.length, 1);
  assertEquals(fixture.finishes[0].args?.p_status, "succeeded");
  assertEquals(fixture.finishes[0].args?.p_notion_page_id, PAGE_ID);
});

Deno.test("duplicate Notion keys fail closed without creating a page", async () => {
  const paths: string[] = [];
  const fixture = dependencies(
    [job()],
    ((_input, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      paths.push(body.path);
      if (body.path === `/databases/${DATABASE_ID}`) {
        return Promise.resolve(Response.json({ ok: true, data: database }));
      }
      return Promise.resolve(Response.json({
        ok: true,
        data: { results: [{ id: PAGE_ID }, { id: "33333333333333333333333333333333" }] },
      }));
    }) as typeof fetch,
  );

  const response = await handleReceiptSyncRequest(request(), fixture.dependencies);
  const payload = await response.json();
  assertEquals(payload.failed, 1);
  assertEquals(payload.succeeded, 0);
  assertEquals(paths.includes("/pages"), false);
  assertEquals(fixture.finishes[0].args?.p_error_code, "NOTION_DUPLICATE_SOURCE");
});

Deno.test("Notion 429 is terminal for the attempt and never falls back", async () => {
  let calls = 0;
  const fixture = dependencies(
    [job()],
    (() => {
      calls += 1;
      return Promise.resolve(Response.json({ ok: false }, { status: 429 }));
    }) as typeof fetch,
  );

  const response = await handleReceiptSyncRequest(request(), fixture.dependencies);
  const payload = await response.json();
  assertEquals(payload.failed, 1);
  assertEquals(calls, 1);
  assertEquals(fixture.finishes[0].args?.p_error_code, "NOTION_RATE_LIMITED");
});

Deno.test("worker rejects browser and wrong-secret requests before claiming", async () => {
  let claims = 0;
  const fixture = dependencies([], (() => Promise.resolve(Response.json({}))) as typeof fetch);
  fixture.dependencies.client.rpc = () => {
    claims += 1;
    return Promise.resolve({ data: [], error: null });
  };
  const browser = await handleReceiptSyncRequest(
    request({ origin: "https://example.invalid" }),
    fixture.dependencies,
  );
  const unauthorized = await handleReceiptSyncRequest(
    request({ secret: "wrong" }),
    fixture.dependencies,
  );
  assertEquals(browser.status, 403);
  assertEquals(unauthorized.status, 401);
  assertEquals(claims, 0);
});
